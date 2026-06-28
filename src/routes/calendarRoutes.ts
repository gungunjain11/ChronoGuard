import express from "express";
import { CalendarService } from "../services/calendar";
import { FirestoreService } from "../services/firestore";
import { parseCalendarEvent } from "../services/commitmentParser";
import { google } from "googleapis";
import { SyncService } from "../services/syncService";
import { Commitment } from "../types";

const router = express.Router();

/**
 * Helper to construct OAuth2 Client using the current authenticated session credentials
 */
const getOAuth2ClientForSession = (req: express.Request, user: any) => {
  const host = req.get("host") || "";
  const isLocal = host.includes("localhost") || host.includes("127.0.0.1");
  const protocol = isLocal ? req.protocol : "https";
  const redirectUri = `${protocol}://${host}/api/auth/google/callback`;
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID || "MOCK_CLIENT_ID",
    process.env.GOOGLE_CLIENT_SECRET || "MOCK_CLIENT_SECRET",
    redirectUri
  );

  if (user && user.accessToken) {
    oauth2Client.setCredentials({
      access_token: user.accessToken,
      refresh_token: user.refreshToken,
    });
  }

  return oauth2Client;
};

/**
 * Mock generator for offline preview environments when API keys/OAuth credentials aren't configured
 */
const generateMockEvents = () => {
  return [
    {
      id: "mock_evt_1",
      summary: "Urgent Sprint Alignment & Strategy Sync",
      description: "Review current roadmap commitments, discuss bottlenecks and finalize project timeline.",
      start: { dateTime: new Date(Date.now() + 3600 * 1000).toISOString() }, // 1 hour from now
      end: { dateTime: new Date(Date.now() + 3600 * 1000 * 2.5).toISOString() }, // 2.5 hours from now
      attendees: [{ email: "manager@company.com" }, { email: "peer@company.com" }],
    },
    {
      id: "mock_evt_2",
      summary: "Important Client Alignment Workshop",
      description: "Workshop with stakeholders to present design specifications and gather roadmap feedback.",
      start: { dateTime: new Date(Date.now() + 3600 * 1000 * 24).toISOString() }, // tomorrow
      end: { dateTime: new Date(Date.now() + 3600 * 1000 * 25).toISOString() },
      attendees: [{ email: "client@external.com" }],
    },
    {
      id: "mock_evt_3",
      summary: "Regular Standup and Weekly Progress Check",
      description: "Weekly status sync to map out daily goals, resolve roadblocks, and review PRs.",
      start: { dateTime: new Date(Date.now() + 3600 * 1000 * 48).toISOString() }, // in 2 days
      end: { dateTime: new Date(Date.now() + 3600 * 1000 * 49).toISOString() },
      attendees: [{ email: "peer@company.com" }],
    },
  ];
};

/**
 * Generates mock commitments for all sources to facilitate fully functional local development and preview
 */
const generateMockSyncData = (userId: string): Commitment[] => {
  const baseTime = Date.now();
  return [
    // Calendar Event commitments
    {
      id: "calendar-mock_evt_1",
      userId,
      title: "Urgent Sprint Alignment & Strategy Sync",
      description: "Review current roadmap commitments, discuss bottlenecks and finalize project timeline.",
      start: new Date(baseTime + 3600 * 1000).toISOString(),
      deadline: new Date(baseTime + 3600 * 1000 * 2.5).toISOString(),
      source: "calendar",
      sourceId: "mock_evt_1",
      riskScore: 35,
      riskFactors: { time: 0.2, density: 0.5, effort: 0.4, history: 0.1 },
      status: "pending",
      estimatedEffortHours: 1.5,
      stakeholders: ["manager@company.com", "peer@company.com"],
      relatedEmails: [],
      relatedDocs: [],
      priority: "high",
      category: "Sprint Planning",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "calendar-mock_evt_2",
      userId,
      title: "Important Client Alignment Workshop",
      description: "Workshop with stakeholders to present design specifications and gather roadmap feedback.",
      start: new Date(baseTime + 3600 * 1000 * 24).toISOString(),
      deadline: new Date(baseTime + 3600 * 1000 * 25.5).toISOString(),
      source: "calendar",
      sourceId: "mock_evt_2",
      riskScore: 50,
      riskFactors: { time: 0.4, density: 0.7, effort: 0.5, history: 0.3 },
      status: "pending",
      estimatedEffortHours: 1.5,
      stakeholders: ["client@external.com"],
      relatedEmails: [],
      relatedDocs: [],
      priority: "high",
      category: "Client Meeting",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    // Google Task commitments
    {
      id: "tasks-mock_tsk_1",
      userId,
      title: "Review UX/UI mockups for dashboard",
      description: "Leave detailed feedback in Figma on the new commitment widgets and charts.",
      start: new Date().toISOString(),
      deadline: new Date(baseTime + 3600 * 1000 * 48).toISOString(),
      source: "tasks",
      sourceId: "mock_tsk_1",
      riskScore: 20,
      riskFactors: { time: 0.1, density: 0.3, effort: 0.2, history: 0.1 },
      status: "pending",
      estimatedEffortHours: 1.0,
      stakeholders: [],
      relatedEmails: [],
      relatedDocs: [],
      priority: "medium",
      category: "Google Tasks",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "tasks-mock_tsk_2",
      userId,
      title: "Submit Q3 Budget Draft",
      description: "Complete cost projections and upload to the finance workspace.",
      start: new Date().toISOString(),
      deadline: new Date(baseTime + 3600 * 1000 * 72).toISOString(),
      source: "tasks",
      sourceId: "mock_tsk_2",
      riskScore: 70,
      riskFactors: { time: 0.6, density: 0.5, effort: 0.8, history: 0.4 },
      status: "pending",
      estimatedEffortHours: 4.0,
      stakeholders: ["finance-director@company.com"],
      relatedEmails: [],
      relatedDocs: [],
      priority: "critical",
      category: "Google Tasks",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    // Gmail commitments
    {
      id: "gmail-mock_eml_1-0",
      userId,
      title: "Action Required: Finalize AWS Migration Blueprint",
      description: "Extracted action item from engineering threads: Review and sign off on AWS Terraform architecture design.",
      start: new Date(baseTime - 3600 * 1000 * 4).toISOString(),
      deadline: new Date(baseTime + 3600 * 1000 * 36).toISOString(),
      source: "gmail",
      sourceId: "mock_eml_1-0",
      riskScore: 65,
      riskFactors: { time: 0.5, density: 0.6, effort: 0.7, history: 0.2 },
      status: "pending",
      estimatedEffortHours: 3.5,
      stakeholders: ["lead-architect@company.com"],
      relatedEmails: ["mock_eml_1"],
      relatedDocs: [],
      priority: "high",
      category: "Cloud Operations",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
};

/**
 * GET /api/calendar/events - Fetch upcoming calendar events (real or mock)
 */
router.get("/events", async (req: any, res) => {
  try {
    const user = req.sessionUser; // Set by middleware or server session context
    
    if (!user) {
      return res.status(401).json({ error: "Unauthorized. Please login with Google first." });
    }

    // If mock auth mode is active, return pristine simulated calendar events
    if (user.id === "mock-user-id" || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.json(generateMockEvents());
    }

    const oauth2Client = getOAuth2ClientForSession(req, user);
    const calendarService = new CalendarService(oauth2Client);
    const events = await calendarService.getUpcomingEvents(30);

    res.json(events);
  } catch (error: any) {
    console.error("Error in /api/calendar/events:", error);
    res.status(500).json({ error: error.message || "Failed to fetch calendar events." });
  }
});

/**
 * GET /api/calendar/upcoming - Fetch upcoming calendar events (formatted as events wrapper for client)
 */
router.get("/upcoming", async (req: any, res) => {
  try {
    const user = req.sessionUser;
    
    if (!user) {
      return res.status(401).json({ error: "Unauthorized. Please login with Google first." });
    }

    let events = [];
    if (user.id === "mock-user-id" || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      events = generateMockEvents();
    } else {
      const oauth2Client = getOAuth2ClientForSession(req, user);
      const calendarService = new CalendarService(oauth2Client);
      events = await calendarService.getUpcomingEvents(30);
    }

    res.json({ events });
  } catch (error: any) {
    console.error("Error in /api/calendar/upcoming:", error);
    res.status(500).json({ error: error.message || "Failed to fetch upcoming calendar events." });
  }
});

/**
 * POST /api/calendar/sync-calendar - Sync Google Calendar events to Firestore commitments
 */
router.post("/sync-calendar", async (req: any, res) => {
  try {
    const user = req.sessionUser;

    if (!user) {
      return res.status(401).json({ error: "Unauthorized. Please login with Google first." });
    }

    const firestoreService = new FirestoreService();
    let events: any[] = [];

    // If mock auth mode is active, sync simulated calendar events
    if (user.id === "mock-user-id" || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      events = generateMockEvents();
    } else {
      const oauth2Client = getOAuth2ClientForSession(req, user);
      const calendarService = new CalendarService(oauth2Client);
      events = await calendarService.getUpcomingEvents(30);
    }

    // Parse and save each event into Firestore as a commitment
    const commitmentsSynced = [];
    for (const event of events) {
      const commitment = parseCalendarEvent(event, user.id);
      await firestoreService.saveCommitment(commitment);
      commitmentsSynced.push(commitment);
    }

    res.json({
      success: true,
      synced: events.length,
      commitments: commitmentsSynced,
    });
  } catch (error: any) {
    console.error("Error in /api/calendar/sync-calendar:", error);
    res.status(500).json({ error: error.message || "Failed to sync calendar events." });
  }
});

/**
 * POST /api/calendar/sync-all - Triggers unified sync across Calendar, Gmail, and Google Tasks
 */
router.post("/sync-all", async (req: any, res) => {
  try {
    const user = req.sessionUser;

    if (!user) {
      return res.status(401).json({ error: "Unauthorized. Please login with Google first." });
    }

    const firestoreService = new FirestoreService();

    // If mock auth mode is active or client is offline
    if (user.id === "mock-user-id" || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      console.log("Mock unified sync triggered for user:", user.id);
      const mockCommitments = generateMockSyncData(user.id);
      
      // Save all mock commitments to Firestore
      for (const commitment of mockCommitments) {
        await firestoreService.saveCommitment(commitment);
      }

      return res.json({
        success: true,
        calendarCount: 2,
        tasksCount: 2,
        gmailCount: 1,
        duplicatesRemoved: 1,
        commitments: mockCommitments,
      });
    }

    // Real production sync
    const oauth2Client = getOAuth2ClientForSession(req, user);
    const syncService = new SyncService();
    const result = await syncService.syncAllSources(user.id, oauth2Client);

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error("Error in /api/calendar/sync-all unified syncing:", error);
    res.status(500).json({ error: error.message || "Unified synchronization failed." });
  }
});

export default router;
