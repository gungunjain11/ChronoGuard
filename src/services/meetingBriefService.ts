import { google } from "googleapis";
import { CalendarService } from "./calendar";
import { GmailService } from "./gmail";
import { DriveService } from "./drive";
import { FirestoreService } from "./firestore";
import { MeetingBrief, PreviousContext, ActionItem, RelevantDoc, User } from "../types";
import { GoogleGenAI, Type } from "@google/genai";
import { v4 as uuidv4 } from "uuid";

export class MeetingBriefService {
  private calendarService: CalendarService;
  private gmailService: GmailService;
  private driveService: DriveService;
  private firestoreService: FirestoreService;
  private ai: GoogleGenAI | null = null;
  private modelName = "gemini-3.5-flash";
  private userId: string;

  constructor(oauth2Client: any, userId: string) {
    this.userId = userId;
    this.calendarService = new CalendarService(oauth2Client);
    this.gmailService = new GmailService(oauth2Client);
    this.driveService = new DriveService(oauth2Client);
    this.firestoreService = new FirestoreService();

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
  }

  /**
   * Generates a comprehensive prep brief for an upcoming meeting
   */
  async generateBrief(meetingId: string): Promise<MeetingBrief> {
    try {
      // 1. Fetch meeting details from calendar
      const meeting = await this.calendarService.getEvent(meetingId);
      if (!meeting) {
        throw new Error(`Meeting event ${meetingId} not found`);
      }

      // 2. Fetch previous context (emails, previous meetings)
      const previousContext = await this.getPreviousContext(meeting);

      // 3. Fetch relevant documents from Drive
      const relevantDocs = await this.getRelevantDocuments(meeting);

      // 4. Fetch action items from previous discussions
      const actionItems = await this.getActionItems(meeting);

      // 5. Generate suggested talking points using Gemini AI
      let suggestedTalkingPoints: string[] = [];
      if (this.ai) {
        const prompt = `You are ChronoGuard, an AI productivity assistant.
Generate suggested talking points, identify crucial follow-ups, and compile a prep brief for the following meeting:
Meeting Title: ${meeting.summary || "Team Sync"}
Agenda/Description: ${meeting.description || "No agenda provided."}
Participants: ${meeting.attendees?.map((a: any) => a.email).join(", ") || "No participants listed."}

We have retrieved the following previous context from relevant emails and previous meetings:
${JSON.stringify(previousContext, null, 2)}

We have found the following previous action items:
${JSON.stringify(actionItems, null, 2)}

We have found the following relevant documents:
${JSON.stringify(relevantDocs, null, 2)}

Analyze this information and generate 3 to 5 highly concise, actionable, and context-rich "suggestedTalkingPoints" that help the user prepare for the meeting and ensure no commitments are dropped.
Return the response strictly as a JSON object containing a single list "suggestedTalkingPoints" of strings, like so:
{
  "suggestedTalkingPoints": [
    "Verify the status of the roadmap update from the discussion on Friday.",
    "Address the action item regarding draft specs as discussed in the previous meeting."
  ]
}`;

        try {
          const response = await this.ai.models.generateContent({
            model: this.modelName,
            contents: prompt,
            config: {
              temperature: 0.2,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  suggestedTalkingPoints: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "High-value, context-rich suggested talking points for the meeting.",
                  },
                },
                required: ["suggestedTalkingPoints"],
              },
            },
          });

          const text = response.text || "{}";
          const parsed = JSON.parse(text);
          suggestedTalkingPoints = parsed.suggestedTalkingPoints || [];
        } catch (aiError) {
          console.error("Failed to generate talking points with AI:", aiError);
          suggestedTalkingPoints = [
            `Review agenda items for: ${meeting.summary || "Meeting"}`,
            "Check status of recent email action items.",
            "Confirm alignment on deadlines and future deliverables."
          ];
        }
      } else {
        // Fallback talking points
        suggestedTalkingPoints = [
          `Review outstanding updates for: ${meeting.summary || "Meeting"}`,
          "Align on key responsibilities and next steps.",
          "Identify and troubleshoot current development bottlenecks."
        ];
      }

      // 6. Build the MeetingBrief object
      const startDateTime = meeting.start?.dateTime || meeting.start?.date || new Date().toISOString();
      const endDateTime = meeting.end?.dateTime || meeting.end?.date || new Date(Date.now() + 3600000).toISOString();

      const brief: MeetingBrief = {
        id: uuidv4(),
        userId: this.userId,
        meetingId,
        title: meeting.summary || "Team Meeting",
        start: startDateTime,
        end: endDateTime,
        participants: meeting.attendees?.map((a: any) => a.email).filter(Boolean) || [],
        agenda: meeting.description || "",
        previousContext,
        actionItems,
        relevantDocs,
        suggestedTalkingPoints,
        delivered: false,
        deliveredMethod: "in_app",
        createdAt: new Date().toISOString(),
      };

      // 7. Persist to Firestore
      await this.firestoreService.saveMeetingBrief(brief);

      return brief;
    } catch (error) {
      console.error(`Error generating brief for meeting ${meetingId}:`, error);
      throw error;
    }
  }

  /**
   * Retrieves previous context (Gmail and Calendar overlap)
   */
  private async getPreviousContext(meeting: any): Promise<PreviousContext[]> {
    const context: PreviousContext[] = [];
    const participantEmails = meeting.attendees?.map((a: any) => a.email).filter(Boolean) || [];

    try {
      // Pull context from Gmail
      if (participantEmails.length > 0) {
        // Limit query clauses to avoid exceeding Gmail API limits
        const targetEmails = participantEmails.slice(0, 5);
        const query = targetEmails.map((email: string) => `from:${email} OR to:${email}`).join(" OR ");
        const messages = await this.gmailService.getMessages(query, 5);

        for (const msg of messages) {
          try {
            const message = await this.gmailService.getMessage(msg.id);
            const body = await this.gmailService.getMessageBody(message);
            const internalDateMs = parseInt(message.internalDate, 10);
            
            context.push({
              date: !isNaN(internalDateMs) ? new Date(internalDateMs).toISOString() : new Date().toISOString(),
              source: "email",
              summary: message.snippet || (body.substring(0, 150) + "..."),
              link: `https://mail.google.com/mail/u/0/#inbox/${msg.id}`,
            });
          } catch (msgErr) {
            console.error(`Failed to process message ${msg.id} in brief generation:`, msgErr);
          }
        }
      }

      // Pull previous meetings with same participants
      const meetingStart = new Date(meeting.start?.dateTime || meeting.start?.date || Date.now());
      const previousMeetings = await this.calendarService.getEvents(
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Past 30 days
        meetingStart
      );

      for (const prevMeeting of previousMeetings) {
        if (prevMeeting.id === meeting.id) continue;
        
        const prevParticipants = prevMeeting.attendees?.map((a: any) => a.email).filter(Boolean) || [];
        const currentParticipants = meeting.attendees?.map((a: any) => a.email).filter(Boolean) || [];
        const overlap = prevParticipants.filter((p: string) => currentParticipants.includes(p));

        if (overlap.length >= 2 || (currentParticipants.length <= 2 && overlap.length >= 1)) {
          context.push({
            date: new Date(prevMeeting.start?.dateTime || prevMeeting.start?.date || Date.now()).toISOString(),
            source: "meeting",
            summary: prevMeeting.summary || "Previous Sync",
            link: prevMeeting.htmlLink || `https://calendar.google.com/calendar/u/0/r/eventedit/${prevMeeting.id}`,
          });
        }
      }
    } catch (err) {
      console.error("Failed to gather previous context:", err);
    }

    // Sort by date descending and return top 5
    return context
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
  }

  /**
   * Retrieves relevant Drive documents
   */
  private async getRelevantDocuments(meeting: any): Promise<RelevantDoc[]> {
    const relevantDocs: RelevantDoc[] = [];
    const participantEmails = meeting.attendees?.map((a: any) => a.email).filter(Boolean) || [];
    const meetingTitle = meeting.summary || "";

    try {
      // Build Google Drive query
      // 1. Search by title keywords
      const titleKeywords = meetingTitle
        .replace(/[^a-zA-Z0-9 ]/g, "")
        .split(" ")
        .filter((word: string) => word.length > 3)
        .slice(0, 3);

      let query = "mimeType = 'application/vnd.google-apps.document' or mimeType = 'application/vnd.google-apps.presentation' or mimeType = 'application/pdf'";
      if (titleKeywords.length > 0) {
        const keywordQuery = titleKeywords.map((kw: string) => `name contains '${kw}'`).join(" or ");
        query = `(${query}) and (${keywordQuery})`;
      }

      const files = await this.driveService.searchFiles(query, 5);
      for (const file of files) {
        relevantDocs.push({
          id: file.id,
          title: file.name,
          link: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
          relevance: 0.85,
        });
      }

      // 2. Search shared documents with participants
      if (participantEmails.length > 0 && relevantDocs.length < 5) {
        const sharedQuery = participantEmails.slice(0, 3).map((email: string) => `sharedWithMe and '${email}' in readers`).join(" or ");
        if (sharedQuery) {
          const sharedFiles = await this.driveService.searchFiles(sharedQuery, 5);
          for (const file of sharedFiles) {
            if (!relevantDocs.some(d => d.id === file.id)) {
              relevantDocs.push({
                id: file.id,
                title: file.name,
                link: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
                relevance: 0.75,
              });
            }
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch relevant documents:", err);
    }

    return relevantDocs.slice(0, 5);
  }

  /**
   * Retrieves action items from previous descriptions
   */
  private async getActionItems(meeting: any): Promise<ActionItem[]> {
    const actionItems: ActionItem[] = [];
    const meetingStart = new Date(meeting.start?.dateTime || meeting.start?.date || Date.now());

    try {
      const previousMeetings = await this.calendarService.getEvents(
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Past 30 days
        meetingStart
      );

      for (const prevMeeting of previousMeetings) {
        if (prevMeeting.description) {
          const lines = prevMeeting.description.split("\n");
          for (const line of lines) {
            const cleanLine = line.trim();
            if (
              cleanLine.toLowerCase().includes("action item") ||
              cleanLine.toLowerCase().includes("todo") ||
              cleanLine.startsWith("- [ ]") ||
              cleanLine.startsWith("* [ ]") ||
              cleanLine.startsWith("todo:") ||
              cleanLine.startsWith("todo -")
            ) {
              // Strip markers
              const description = cleanLine
                .replace(/^[-*]\s*(\[ \])?\s*(todo:)?\s*/gi, "")
                .replace(/^todo\s*[-:]\s*/gi, "")
                .trim();

              if (description.length > 5) {
                actionItems.push({
                  description,
                  from: prevMeeting.summary || "Previous Sync",
                  status: "pending",
                });
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("Failed to gather action items:", err);
    }

    return actionItems.slice(0, 5);
  }

  /**
   * Delivers a meeting brief in-app or via email
   */
  async deliverBrief(meetingId: string, method: "in_app" | "email" = "in_app"): Promise<void> {
    try {
      const brief = await this.firestoreService.getMeetingBrief(meetingId);
      if (!brief) {
        throw new Error(`Meeting brief for meeting ${meetingId} not found`);
      }

      brief.delivered = true;
      brief.deliveredAt = new Date().toISOString();
      brief.deliveredMethod = method;

      // Save updated brief delivery status
      await this.firestoreService.saveMeetingBrief(brief);

      if (method === "email") {
        const user = await this.firestoreService.getUserById(brief.userId);
        if (user) {
          const oauth2Client = new google.auth.OAuth2();
          oauth2Client.setCredentials(user.tokens || {
            access_token: user.accessToken,
            refresh_token: user.refreshToken,
          });

          const userGmailService = new GmailService(oauth2Client);

          // Build beautiful email content
          const emailSubject = `[ChronoGuard Prep] Meeting Brief: ${brief.title}`;
          const emailBody = `Hello ${user.name || "ChronoGuard User"},\n\n` +
            `Here is your context-aware meeting intelligence brief for your upcoming meeting "${brief.title}" scheduled for ${new Date(brief.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.\n\n` +
            `--------------------------------------------------\n` +
            `📅 MEETING SUMMARY & AGENDA\n` +
            `--------------------------------------------------\n` +
            `Time: ${new Date(brief.start).toLocaleString()} - ${new Date(brief.end).toLocaleTimeString()}\n` +
            `Participants: ${brief.participants.join(", ") || "None listed"}\n` +
            `Agenda: ${brief.agenda || "No agenda details."}\n\n` +
            `--------------------------------------------------\n` +
            `💡 AI SUGGESTED TALKING POINTS\n` +
            `--------------------------------------------------\n` +
            brief.suggestedTalkingPoints.map((tp, idx) => `${idx + 1}. ${tp}`).join("\n") + `\n\n` +
            `--------------------------------------------------\n` +
            `📬 RECENT CONTEXT (GMAIL/MEETINGS)\n` +
            `--------------------------------------------------\n` +
            brief.previousContext.map(ctx => `- [${ctx.source.toUpperCase()}] ${ctx.summary} (${new Date(ctx.date).toLocaleDateString()})`).join("\n") + `\n\n` +
            `--------------------------------------------------\n` +
            `📄 RELEVANT DOCUMENTS\n` +
            `--------------------------------------------------\n` +
            brief.relevantDocs.map(doc => `- ${doc.title}: ${doc.link}`).join("\n") + `\n\n` +
            `--------------------------------------------------\n` +
            `✅ PREVIOUS ACTION ITEMS\n` +
            `--------------------------------------------------\n` +
            (brief.actionItems.length > 0
              ? brief.actionItems.map(item => `- ${item.description} (assigned from ${item.from})`).join("\n")
              : "No pending action items found.") + `\n\n` +
            `Stay prepared and safeguard your commitments,\n` +
            `ChronoGuard Proactive Agent`;

          // Custom method in GmailService that we will add or use directly
          const rawEmail = [
            `To: ${user.email}`,
            `Subject: ${emailSubject}`,
            'Content-Type: text/plain; charset=utf-8',
            'MIME-Version: 1.0',
            '',
            emailBody
          ].join('\n');

          const base64Email = Buffer.from(rawEmail)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

          const gmail = google.gmail({ version: "v1", auth: oauth2Client });
          await gmail.users.messages.send({
            userId: "me",
            requestBody: {
              raw: base64Email,
            },
          });

          console.log(`Successfully sent email brief for meeting ${meetingId} to ${user.email}`);
        }
      }
    } catch (err) {
      console.error(`Failed to deliver brief for meeting ${meetingId}:`, err);
      throw err;
    }
  }
}
