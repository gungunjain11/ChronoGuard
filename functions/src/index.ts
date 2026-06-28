import * as functions from "firebase-functions";
import { Firestore } from "@google-cloud/firestore";
import { RiskEngine } from "../../src/services/riskEngine";
import { NotificationService } from "../../src/services/notificationService";
import { google } from "googleapis";

const db = new Firestore({
  databaseId: "ai-studio-chronoguard-4f4bb8ee-60c1-428d-ba3f-e461952bc003"
});
const riskEngine = new RiskEngine();
const notificationService = new NotificationService();

/**
 * Cloud Function triggered on any write (creation, update, or deletion) to the commitments collection
 */
export const onCommitmentChange = functions.firestore
  .document("commitments/{commitmentId}")
  .onWrite(async (change, context) => {
    const commitment = change.after.exists ? change.after.data() : null;
    const previousCommitment = change.before.exists ? change.before.data() : null;

    // If commitment is deleted, do nothing
    if (!commitment) return null;

    const userId = commitment.userId;

    try {
      // Re-initialize OAuth client for the specific user from Firestore tokens
      const oauth2Client = await getOAuth2Client(userId);
      
      // Trigger Risk Engine calculations for all user commitments
      if (oauth2Client) {
        await riskEngine.calculateRiskScores(userId, oauth2Client);
      } else {
        console.warn(`Could not get OAuth client for user ${userId}. Recalculating risk offline.`);
        await riskEngine.calculateRiskScores(userId, null);
      }

      // Read updated commitment data
      const commitmentRef = db.collection("commitments").doc(context.params.commitmentId);
      const updatedDoc = await commitmentRef.get();
      const updatedCommitment = updatedDoc.exists ? updatedDoc.data() : commitment;

      // Check if we need to send notifications (threshold >= 70)
      if (
        updatedCommitment &&
        updatedCommitment.riskScore >= 70 &&
        (!previousCommitment || previousCommitment.riskScore < 70)
      ) {
        await notificationService.checkAndNotify(userId, oauth2Client);
      }
    } catch (error) {
      console.error(`Error in onCommitmentChange trigger for user ${userId}:`, error);
    }

    return null;
  });

/**
 * HTTPS Trigger called on calendar sync events (webhooks/polling) to sync events and recalculate scores
 */
export const onCalendarEventCreated = functions.https.onRequest(async (req, res) => {
  const userId = req.body.userId;
  if (!userId) {
    res.status(400).send("User ID is required in the request body");
    return;
  }

  try {
    const oauth2Client = await getOAuth2Client(userId);

    if (!oauth2Client) {
      res.status(400).send("OAuth credentials not configured for this user");
      return;
    }

    // Trigger calculations
    await riskEngine.calculateRiskScores(userId, oauth2Client);
    res.status(200).send({ status: "success", message: "Recalculated risk scores" });
  } catch (error: any) {
    console.error("Error in onCalendarEventCreated webhook:", error);
    res.status(500).send({ status: "error", message: error.message });
  }
});

/**
 * Helper to fetch and instantiate a Google OAuth2Client for a user based on their Firestore tokens
 */
async function getOAuth2Client(userId: string) {
  try {
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) return null;

    const userData = userDoc.data();
    if (!userData || !userData.tokens) {
      // If tokens are nested directly under tokens property or directly on the object
      const tokens = userData.tokens || {
        access_token: userData.accessToken,
        refresh_token: userData.refreshToken
      };
      if (!tokens.access_token) return null;
      
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials(tokens);
      return oauth2Client;
    }

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials(userData.tokens);
    return oauth2Client;
  } catch (error) {
    console.error(`Failed to construct OAuth client for user ${userId}:`, error);
    return null;
  }
}

/**
 * Scheduled Cloud Function triggered every 5 minutes to generate and deliver pre-meeting briefs
 */
export const onMeetingBriefSchedule = functions.pubsub
  .schedule("every 5 minutes")
  .onRun(async (context) => {
    console.log("[Cloud Function] Executing pre-meeting brief scheduler scanning...");
    try {
      const { BriefScheduler } = require("../../src/services/briefScheduler");
      const scheduler = new BriefScheduler();
      await scheduler.checkAndScheduleBriefs();
      console.log("[Cloud Function] Pre-meeting brief scheduler run successfully.");
    } catch (err) {
      console.error("[Cloud Function] Pre-meeting brief scheduler run failed:", err);
    }
    return null;
  });

/**
 * HTTPS Webhook Cloud Function triggered on Google Calendar sync events to handle real-time creation/updates
 */
export const onCalendarWebhook = functions.https.onRequest(async (req, res) => {
  // Calendar webhook can send standard channels headers
  const channelId = req.headers["x-goog-channel-id"];
  const resourceState = req.headers["x-goog-resource-state"]; // "exists" or "sync"
  
  console.log(`[Webhook] Received Google Calendar update. Channel: ${channelId}, State: ${resourceState}`);

  try {
    const userId = req.body.userId || req.query.userId;
    if (!userId) {
      // In production webhooks, the user ID can be mapped via the channel ID from database mapping
      // Here we gracefully complete if no explicit user is found or use the first user
      res.status(200).send({ status: "ignored", message: "No userId provided in webhook request" });
      return;
    }

    const oauth2Client = await getOAuth2Client(userId);
    if (!oauth2Client) {
      res.status(400).send({ status: "error", message: "OAuth client not found for user" });
      return;
    }

    // 1. Trigger risk engine updates
    await riskEngine.calculateRiskScores(userId, oauth2Client);

    // 2. Pre-generate brief for the next upcoming meeting
    const { MeetingBriefService } = require("../../src/services/meetingBriefService");
    const meetingBriefService = new MeetingBriefService(oauth2Client, userId);
    
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin: new Date().toISOString(),
      maxResults: 1,
      singleEvents: true,
      orderBy: "startTime"
    });

    const nextMeeting = response.data.items?.[0];
    if (nextMeeting) {
      console.log(`[Webhook] Pre-generating brief for upcoming meeting: "${nextMeeting.summary || "Sync"}"`);
      await meetingBriefService.generateBrief(nextMeeting.id);
    }

    res.status(200).send({ status: "success", message: "Webhook actions completed" });
  } catch (error: any) {
    console.error("[Webhook] Error in onCalendarWebhook:", error);
    res.status(500).send({ status: "error", message: error.message });
  }
});
