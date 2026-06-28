import { FirestoreService } from "./firestore";
import { MeetingBriefService } from "./meetingBriefService";
import { CalendarService } from "./calendar";
import { google } from "googleapis";

export class BriefScheduler {
  private firestoreService: FirestoreService;

  constructor() {
    this.firestoreService = new FirestoreService();
  }

  /**
   * Scan upcoming meetings and generate/deliver pre-meeting briefs
   */
  async checkAndScheduleBriefs(): Promise<void> {
    try {
      const users = await this.firestoreService.getAllUsers();
      console.log(`[Scheduler] Scanning meetings for ${users.length} users...`);

      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      for (const user of users) {
        try {
          // Construct OAuth Client
          const redirectUri = process.env.APP_URL 
            ? `${process.env.APP_URL.replace(/\/$/, "")}/api/auth/google/callback`
            : "http://localhost:3000/api/auth/google/callback";

          const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID || "MOCK_CLIENT_ID",
            process.env.GOOGLE_CLIENT_SECRET || "MOCK_CLIENT_SECRET",
            redirectUri
          );

          oauth2Client.setCredentials(user.tokens || {
            access_token: user.accessToken,
            refresh_token: user.refreshToken,
          });

          const calendarService = new CalendarService(oauth2Client);
          const meetingBriefService = new MeetingBriefService(oauth2Client, user.id);

          // Fetch meetings in next 24 hours
          const meetings = await calendarService.getEvents(now, tomorrow);
          console.log(`[Scheduler] Found ${meetings.length} upcoming meetings for user ${user.email}`);

          for (const meeting of meetings) {
            const meetingStart = new Date(meeting.start?.dateTime || meeting.start?.date || now);
            const timeUntilMeetingMs = meetingStart.getTime() - now.getTime();
            const timeUntilMeetingHours = timeUntilMeetingMs / (1000 * 60 * 60);

            // Requirements: Deliver brief 1 hour before meeting
            // We search for meetings starting within the next 1.1 hours
            if (timeUntilMeetingHours <= 1.1 && timeUntilMeetingHours > 0) {
              const existingBrief = await this.firestoreService.getMeetingBrief(meeting.id);
              
              if (!existingBrief || !existingBrief.delivered) {
                console.log(`[Scheduler] Generating/Delivering meeting brief for: "${meeting.summary || 'Team sync'}" to ${user.email}`);
                
                // Generate the brief
                let brief = existingBrief;
                if (!brief) {
                  brief = await meetingBriefService.generateBrief(meeting.id);
                }

                // Deliver in-app first
                await meetingBriefService.deliverBrief(meeting.id, "in_app");

                // Deliver via Email
                await meetingBriefService.deliverBrief(meeting.id, "email");
              }
            }
          }
        } catch (userErr) {
          console.error(`[Scheduler] Failed to process calendar briefs for user ${user.email}:`, userErr);
        }
      }
    } catch (err) {
      console.error("[Scheduler] General scheduler run failure:", err);
    }
  }

  /**
   * Starts a background polling scheduler
   */
  start(): void {
    console.log("[Scheduler] Starting pre-meeting brief scheduler background job (5-minute interval)...");
    
    // Run immediately on start
    this.checkAndScheduleBriefs().catch(err => {
      console.error("[Scheduler] Error running initial brief schedule check:", err);
    });

    // Schedule to run every 5 minutes
    setInterval(() => {
      this.checkAndScheduleBriefs().catch(err => {
        console.error("[Scheduler] Error during scheduled brief check:", err);
      });
    }, 5 * 60 * 1000);
  }
}
