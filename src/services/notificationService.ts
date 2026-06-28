import { google } from "googleapis";
import { FirestoreService } from "./firestore";
import { Commitment } from "../types";

export class NotificationService {
  private firestoreService: FirestoreService;

  constructor() {
    this.firestoreService = new FirestoreService();
  }

  /**
   * Scans a user's high-risk commitments and triggers alerts for new risk levels.
   */
  async checkAndNotify(userId: string, oauth2Client: any): Promise<void> {
    try {
      const highRiskCommitments = await this.firestoreService.getHighRiskCommitments(userId, 70);

      for (const commitment of highRiskCommitments) {
        // Query the database to see if we already notified the user for this commitment and risk level
        const lastNotification = await this.firestoreService.getLastNotification(
          userId,
          commitment.id
        );

        if (lastNotification && lastNotification.riskScore >= commitment.riskScore) {
          // Already notified the user at this risk level or higher
          continue;
        }

        // Send notifications (Browser/In-App and Email)
        await this.sendNotification(userId, commitment);

        // Send Email via Gmail API if OAuth is configured
        if (oauth2Client) {
          await this.sendEmailNotification(userId, commitment, oauth2Client);
        } else {
          console.warn("OAuth Client not provided. Skipping Gmail email dispatch.");
        }

        // Record the notification event in Firestore
        await this.firestoreService.saveNotification({
          userId,
          commitmentId: commitment.id,
          riskScore: commitment.riskScore,
          sentAt: new Date().toISOString(),
          method: oauth2Client ? "email_and_in_app" : "in_app"
        });
      }
    } catch (error) {
      console.error(`Error in notification checker for user ${userId}:`, error);
    }
  }

  /**
   * Delivers an in-app browser/console alert
   */
  private async sendNotification(userId: string, commitment: Commitment): Promise<void> {
    console.log(
      `[In-App Notification] To User ${userId}: "${commitment.title}" is at high risk of failure (Score: ${commitment.riskScore}/100)`
    );
  }

  /**
   * Dispatches a beautiful text email alert using the user's Gmail API authorization
   */
  async sendEmailNotification(userId: string, commitment: Commitment, oauth2Client: any): Promise<void> {
    try {
      const user = await this.firestoreService.getUserById(userId);
      if (!user || !user.email) {
        console.warn(`Could not send email: User ${userId} has no registered email.`);
        return;
      }

      const gmail = google.gmail({ version: "v1", auth: oauth2Client });
      const subject = `⚠️ High Risk Commitment Alert: ${commitment.title}`;
      
      const timePercent = ((commitment.riskFactors?.time || 0) * 100).toFixed(0);
      const densityPercent = ((commitment.riskFactors?.density || 0) * 100).toFixed(0);
      const effortPercent = ((commitment.riskFactors?.effort || 0) * 100).toFixed(0);
      const historyPercent = ((commitment.riskFactors?.history || 0) * 100).toFixed(0);
      
      const body = `Hi ${user.name || "there"},\n\n` +
        `Your tracked commitment "${commitment.title}" has been flagged as HIGH RISK by ChronoGuard.\n\n` +
        `-----------------------------------------\n` +
        `🔥 RISK SCORE: ${commitment.riskScore}/100\n` +
        `📅 DEADLINE: ${new Date(commitment.deadline).toLocaleString()}\n` +
        `-----------------------------------------\n\n` +
        `RISK BREAKDOWN:\n` +
        `- Time Urgency Factor: ${timePercent}%\n` +
        `- Calendar Density Factor: ${densityPercent}%\n` +
        `- Required Effort Factor: ${effortPercent}%\n` +
        `- Historic Completion Factor: ${historyPercent}%\n\n` +
        `RECOMMENDED IMMEDIATE ACTIONS:\n` +
        `1. Open ChronoGuard and find optimal open slots in your calendar to block focus time.\n` +
        `2. Draft and send an automatic extension request email to your stakeholders.\n` +
        `3. Split the commitment into bite-sized subtasks using AI.\n\n` +
        `Keep guarding your time!\n` +
        `-- ChronoGuard System Alerts`;

      const raw = this.makeEmail(user.email, "me", subject, body);
      await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw }
      });
      
      console.log(`[Gmail Service] Successfully sent email warning to ${user.email}`);
    } catch (error) {
      console.error(`Failed to send email notification to user ${userId} via Gmail API:`, error);
    }
  }

  /**
   * Helper to format raw email body to standard RFC 2822 Base64 encoding
   */
  private makeEmail(to: string, from: string, subject: string, body: string): string {
    const emailParts = [
      `To: ${to}`,
      `From: ${from}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      body
    ];

    const email = emailParts.join("\n");
    return Buffer.from(email)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  /**
   * Retrieve sent notifications history from database
   */
  async getNotifications(userId: string): Promise<any[]> {
    return this.firestoreService.getNotifications(userId);
  }
}
