import { CalendarService } from "./calendar";
import { GmailService } from "./gmail";
import { TasksService } from "./tasks";
import { FirestoreService } from "./firestore";
import { AIParser, ExtractedCommitment } from "./aiParser";
import { parseCalendarEvent } from "./commitmentParser";
import { Commitment } from "../types";

export interface SyncResult {
  calendarCount: number;
  tasksCount: number;
  gmailCount: number;
  duplicatesRemoved: number;
  syncedCommitments: Commitment[];
}

export class SyncService {
  private firestoreService: FirestoreService;
  private aiParser: AIParser;

  constructor() {
    this.firestoreService = new FirestoreService();
    this.aiParser = new AIParser();
  }

  /**
   * Helper to normalize titles for fuzzy comparison
   */
  private normalizeString(str: string): string {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .trim();
  }

  /**
   * Checks if two commitments represent the same underlying task
   */
  private isDuplicate(c1: Partial<Commitment>, c2: Partial<Commitment>): boolean {
    if (!c1.title || !c2.title) return false;

    // Check 1: Exact matching source and source ID
    if (c1.source === c2.source && c1.sourceId === c2.sourceId) {
      return true;
    }

    // Check 2: Fuzzy title comparison AND close deadlines
    const norm1 = this.normalizeString(c1.title);
    const norm2 = this.normalizeString(c2.title);
    
    const titleMatch = norm1.includes(norm2) || norm2.includes(norm1) || norm1 === norm2;
    
    if (titleMatch && c1.deadline && c2.deadline) {
      const d1 = new Date(c1.deadline).getTime();
      const d2 = new Date(c2.deadline).getTime();
      const diffHours = Math.abs(d1 - d2) / (1000 * 60 * 60);
      
      // If titles are extremely similar and deadline is within 24 hours, consider it a duplicate
      if (diffHours <= 24) {
        return true;
      }
    }

    return false;
  }

  /**
   * Performs unified synchronization for a user
   */
  async syncAllSources(userId: string, oauth2Client: any): Promise<SyncResult> {
    const calendarService = new CalendarService(oauth2Client);
    const gmailService = new GmailService(oauth2Client);
    const tasksService = new TasksService(oauth2Client);

    const accumulatedCommitments: Commitment[] = [];
    let calendarCount = 0;
    let tasksCount = 0;
    let gmailCount = 0;
    let duplicatesRemoved = 0;

    // 1. Fetch Calendar Events
    try {
      console.log("Syncing Google Calendar events...");
      const events = await calendarService.getUpcomingEvents(30);
      for (const event of events) {
        const commitment = parseCalendarEvent(event, userId);
        accumulatedCommitments.push(commitment);
        calendarCount++;
      }
    } catch (err) {
      console.error("Calendar sync failed:", err);
    }

    // 2. Fetch Tasks
    try {
      console.log("Syncing Google Tasks...");
      const tasks = await tasksService.getAllTasks(50);
      for (const task of tasks) {
        if (!task.title) continue;

        const start = task.updated || new Date().toISOString();
        const deadline = task.due || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

        const commitment: Commitment = {
          id: `tasks-${task.id}`,
          userId,
          title: task.title,
          description: task.notes || `Task from list: ${task.tasklistTitle || "Default List"}`,
          start,
          deadline,
          source: "tasks",
          sourceId: task.id,
          riskScore: 0,
          riskFactors: { time: 0, density: 0, effort: 0, history: 0 },
          status: task.status === "completed" ? "completed" : "pending",
          estimatedEffortHours: 1.0, // Default baseline, will be updated by AI if missing
          stakeholders: [],
          relatedEmails: [],
          relatedDocs: [],
          priority: task.priority || "medium",
          category: "Google Tasks",
          createdAt: task.updated || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        accumulatedCommitments.push(commitment);
        tasksCount++;
      }
    } catch (err) {
      console.error("Tasks sync failed:", err);
    }

    // 3. Fetch Action Items from Gmail (Last 15 messages for fast and responsive syncing)
    try {
      console.log("Syncing action items from Gmail...");
      const messages = await gmailService.getMessages("is:unread or label:important", 15);
      
      for (const msg of messages) {
        if (!msg.id) continue;
        
        const fullMsg = await gmailService.getMessage(msg.id);
        const headers = fullMsg.payload?.headers || [];
        
        const from = headers.find((h: any) => h.name === "From")?.value || "unknown";
        const to = headers.find((h: any) => h.name === "To")?.value || "unknown";
        const subject = headers.find((h: any) => h.name === "Subject")?.value || "no subject";
        const date = headers.find((h: any) => h.name === "Date")?.value || new Date().toISOString();

        const body = await gmailService.getMessageBody(fullMsg);
        
        if (body.trim().length > 0) {
          const extracted: ExtractedCommitment[] = await this.aiParser.extractCommitmentsFromEmail(body, {
            from,
            to,
            subject,
            date,
          });

          extracted.forEach((ext, index) => {
            const commitment: Commitment = {
              id: `gmail-${fullMsg.id}-${index}`,
              userId,
              title: ext.title,
              description: ext.description,
              start: new Date(date).toISOString(),
              deadline: ext.deadline,
              source: "gmail",
              sourceId: `${fullMsg.id}-${index}`,
              riskScore: 0,
              riskFactors: { time: 0, density: 0, effort: 0, history: 0 },
              status: "pending",
              estimatedEffortHours: ext.estimatedHours || 1.0,
              stakeholders: ext.stakeholders || [from],
              relatedEmails: [fullMsg.id],
              relatedDocs: [],
              priority: ext.priority || "medium",
              category: ext.category || "Gmail Action Required",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };

            accumulatedCommitments.push(commitment);
            gmailCount++;
          });
        }
      }
    } catch (err) {
      console.error("Gmail sync failed:", err);
    }

    // 4. Deduplicate and Save to Firestore
    const finalCommitments: Commitment[] = [];
    const existingDbCommitments = await this.firestoreService.getCommitments(userId);

    for (const fresh of accumulatedCommitments) {
      // Step A: Check if it's duplicate with anything we've already parsed in this batch
      const isDuplicateInBatch = finalCommitments.some((item) => this.isDuplicate(fresh, item));
      if (isDuplicateInBatch) {
        duplicatesRemoved++;
        continue;
      }

      // Step B: Check if there's a duplicate or close match already in Firestore database
      const existingMatch = existingDbCommitments.find((item) => this.isDuplicate(fresh, item));
      
      if (existingMatch) {
        // Link them or update details instead of inserting a duplicate
        const mergedCommitment: Commitment = {
          ...existingMatch,
          // Merge stakeholder arrays, remove duplicates
          stakeholders: Array.from(new Set([...existingMatch.stakeholders, ...fresh.stakeholders])),
          // Merge related emails
          relatedEmails: Array.from(new Set([...existingMatch.relatedEmails, ...fresh.relatedEmails])),
          updatedAt: new Date().toISOString(),
        };

        // Persist the merge
        await this.firestoreService.saveCommitment(mergedCommitment);
        finalCommitments.push(mergedCommitment);
      } else {
        // Run AI Effort Estimation for tasks that don't have effort hours defined (like Google Tasks)
        if (fresh.estimatedEffortHours === 1.0 && fresh.source === "tasks") {
          try {
            fresh.estimatedEffortHours = await this.aiParser.estimateTaskEffort(fresh.title, fresh.description);
          } catch (estErr) {
            console.error("Effort estimation error for fresh task:", estErr);
          }
        }

        // Save fresh new commitment
        await this.firestoreService.saveCommitment(fresh);
        finalCommitments.push(fresh);
      }
    }

    return {
      calendarCount,
      tasksCount,
      gmailCount,
      duplicatesRemoved,
      syncedCommitments: finalCommitments,
    };
  }
}
