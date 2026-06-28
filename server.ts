import express from "express";
import path from "path";
import dotenv from "dotenv";
import { google } from "googleapis";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";
import calendarRoutes from "./src/routes/calendarRoutes";
import { FirestoreService } from "./src/services/firestore";
import { RiskEngine } from "./src/services/riskEngine";
import { NotificationService } from "./src/services/notificationService";
import { TimeBlocker } from "./src/services/timeBlocker";
import { TaskBreakdownService } from "./src/services/taskBreakdown";
import { AutonomousActionsService } from "./src/services/autonomousActions";
import { BriefScheduler } from "./src/services/briefScheduler";
import { MeetingBriefService } from "./src/services/meetingBriefService";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// In-memory sessions / state mock for basic auth demonstration
let currentSessionUser: any = null;

// Middleware to inject currentSessionUser context into requests
app.use((req: any, res, next) => {
  req.sessionUser = currentSessionUser;
  next();
});

// Initialize Google Gen AI client if API key is present
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

// Initialize Google OAuth2 client
const getOAuth2Client = (req: express.Request) => {
  const host = req.get("host") || "";
  const isLocal = host.includes("localhost") || host.includes("127.0.0.1");
  const protocol = isLocal ? req.protocol : "https";
  const redirectUri = `${protocol}://${host}/api/auth/google/callback`;
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID || "MOCK_CLIENT_ID",
    process.env.GOOGLE_CLIENT_SECRET || "MOCK_CLIENT_SECRET",
    redirectUri
  );
};

// API Routes
app.use("/api/calendar", calendarRoutes);

// 1. Auth check
app.get("/api/auth/user", (req, res) => {
  if (currentSessionUser) {
    res.json({ authenticated: true, user: currentSessionUser });
  } else {
    res.json({ authenticated: false, user: null });
  }
});

// 2. Start Google OAuth flow
app.get("/api/auth/google", (req, res) => {
  const oauth2Client = getOAuth2Client(req);
  
  // If no credentials configured, we use a mock flow in this preview environment
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.warn("Google OAuth credentials not configured. Using Mock Auth flow.");
    currentSessionUser = {
      id: "mock-user-id",
      email: "jaingungun266@gmail.com",
      name: "Gungun Jain",
      googleId: "115269782264",
      productivityPatterns: { 9: 0.8, 14: 0.95, 16: 0.7 },
      communicationStyle: "professional",
      preferredExtensionDays: 2,
    };
    return res.redirect("/");
  }

  const scopes = [
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/drive.readonly"
  ];

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent"
  });

  res.redirect(authUrl);
});

// 3. OAuth callback
app.get("/api/auth/google/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.redirect("/?error=no_code");
  }

  try {
    const oauth2Client = getOAuth2Client(req);
    const { tokens } = await oauth2Client.getToken(code as string);
    oauth2Client.setCredentials(tokens);

    // Get user info
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    currentSessionUser = {
      id: userInfo.data.id || "user-id",
      email: userInfo.data.email || "user@example.com",
      name: userInfo.data.name || "Workspace User",
      googleId: userInfo.data.id || "",
      accessToken: tokens.access_token || "",
      refreshToken: tokens.refresh_token || "",
      productivityPatterns: { 9: 0.8, 14: 0.95, 16: 0.7 },
      communicationStyle: "professional",
      preferredExtensionDays: 2,
    };

    // Save the authenticated user persistently to Firestore
    try {
      const firestoreService = new FirestoreService();
      await firestoreService.saveUser(currentSessionUser);
    } catch (fsErr) {
      console.error("Failed to save user to Firestore in callback:", fsErr);
    }

    res.redirect("/");
  } catch (error: any) {
    console.error("Error in Google OAuth callback:", error);
    res.redirect(`/?error=${encodeURIComponent(error.message || "auth_failed")}`);
  }
});

// 4. Logout
app.post("/api/auth/logout", (req, res) => {
  currentSessionUser = null;
  res.json({ success: true });
});

// Commitments CRUD APIs
app.get("/api/commitments", async (req: any, res) => {
  const user = req.sessionUser;
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const firestoreService = new FirestoreService();
    const commitments = await firestoreService.getCommitments(user.id);
    res.json(commitments);
  } catch (error: any) {
    console.error("Failed to fetch commitments:", error);
    res.status(500).json({ error: error.message || "Failed to fetch commitments" });
  }
});

app.post("/api/commitments", async (req: any, res) => {
  const user = req.sessionUser;
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { commitment } = req.body;
  if (!commitment) {
    return res.status(400).json({ error: "Commitment object is required" });
  }

  try {
    const firestoreService = new FirestoreService();
    // Ensure user ID matches the logged-in session user
    commitment.userId = user.id;
    const saved = await firestoreService.saveCommitment(commitment);
    res.json(saved);
  } catch (error: any) {
    console.error("Failed to save commitment:", error);
    res.status(500).json({ error: error.message || "Failed to save commitment" });
  }
});

app.delete("/api/commitments/:id", async (req: any, res) => {
  const user = req.sessionUser;
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { id } = req.params;
  try {
    const firestoreService = new FirestoreService();
    await firestoreService.deleteCommitment(id);
    res.json({ success: true });
  } catch (error: any) {
    console.error("Failed to delete commitment:", error);
    res.status(500).json({ error: error.message || "Failed to delete commitment" });
  }
});

// Risk Endpoints for ChronoGuard
app.post("/api/risk/recalculate", async (req: any, res) => {
  const user = req.sessionUser;
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const riskEngine = new RiskEngine();
    
    let oauth2Client = null;
    if (user.accessToken || user.tokens) {
      oauth2Client = getOAuth2Client(req);
      oauth2Client.setCredentials(user.tokens || {
        access_token: user.accessToken,
        refresh_token: user.refreshToken,
      });
    }

    const updated = await riskEngine.calculateRiskScores(user.id, oauth2Client);
    res.json({ success: true, updatedCount: updated.length, commitments: updated });
  } catch (error: any) {
    console.error("Failed to recalculate risk scores:", error);
    res.status(500).json({ error: error.message || "Failed to recalculate risk scores" });
  }
});

app.get("/api/risk/high-risk", async (req: any, res) => {
  const user = req.sessionUser;
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const riskEngine = new RiskEngine();
    const threshold = req.query.threshold ? parseInt(req.query.threshold as string, 10) : 70;
    const highRisk = await riskEngine.getHighRiskCommitments(user.id, threshold);
    res.json(highRisk);
  } catch (error: any) {
    console.error("Failed to fetch high-risk commitments:", error);
    res.status(500).json({ error: error.message || "Failed to fetch high-risk commitments" });
  }
});

app.get("/api/risk/trends", async (req: any, res) => {
  const user = req.sessionUser;
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const riskEngine = new RiskEngine();
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 7;
    const trends = await riskEngine.getRiskTrends(user.id, days);
    res.json(trends);
  } catch (error: any) {
    console.error("Failed to fetch risk trends:", error);
    res.status(500).json({ error: error.message || "Failed to fetch risk trends" });
  }
});

app.get("/api/notifications", async (req: any, res) => {
  const user = req.sessionUser;
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const notificationService = new NotificationService();
    const history = await notificationService.getNotifications(user.id);
    res.json(history);
  } catch (error: any) {
    console.error("Failed to fetch notification history:", error);
    res.status(500).json({ error: error.message || "Failed to fetch notification history" });
  }
});

app.post("/api/notifications/check", async (req: any, res) => {
  const user = req.sessionUser;
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const notificationService = new NotificationService();
    
    let oauth2Client = null;
    if (user.accessToken || user.tokens) {
      oauth2Client = getOAuth2Client(req);
      oauth2Client.setCredentials(user.tokens || {
        access_token: user.accessToken,
        refresh_token: user.refreshToken,
      });
    }

    await notificationService.checkAndNotify(user.id, oauth2Client);
    res.json({ success: true, message: "Risk scanning and notification checks processed." });
  } catch (error: any) {
    console.error("Failed to process notifications:", error);
    res.status(500).json({ error: error.message || "Failed to process notifications" });
  }
});

// Proactive Features API Endpoints

// Autonomous Actions Suggestions Endpoint
app.get("/api/autonomous/suggest/:commitmentId", async (req: any, res) => {
  const user = req.sessionUser;
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { commitmentId } = req.params;

  try {
    let oauth2Client = null;
    if (user.accessToken || user.tokens) {
      oauth2Client = getOAuth2Client(req);
      oauth2Client.setCredentials(user.tokens || {
        access_token: user.accessToken,
        refresh_token: user.refreshToken,
      });
    }

    const actionService = new AutonomousActionsService(oauth2Client, user.id);
    const suggestions = await actionService.suggestActions(commitmentId);
    res.json(suggestions);
  } catch (error: any) {
    console.error("Failed to suggest autonomous actions:", error);
    res.status(500).json({ error: error.message || "Failed to suggest actions" });
  }
});

// Autonomous Action Execution Endpoint
app.post("/api/autonomous/execute", async (req: any, res) => {
  const user = req.sessionUser;
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { commitmentId, action, options } = req.body;
  if (!commitmentId || !action) {
    return res.status(400).json({ error: "commitmentId and action are required" });
  }

  try {
    let oauth2Client = null;
    if (user.accessToken || user.tokens) {
      oauth2Client = getOAuth2Client(req);
      oauth2Client.setCredentials(user.tokens || {
        access_token: user.accessToken,
        refresh_token: user.refreshToken,
      });
    }

    const actionService = new AutonomousActionsService(oauth2Client, user.id);
    const result = await actionService.executeAction(commitmentId, action, options);
    res.json(result);
  } catch (error: any) {
    console.error(`Failed to execute action ${action}:`, error);
    res.status(500).json({ error: error.message || "Execution failed" });
  }
});

// Time Blocking - Find Optimal Slots Endpoint
app.post("/api/timeblocking/find-slots", async (req: any, res) => {
  const user = req.sessionUser;
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { commitmentId, durationHours, daysToLook } = req.body;
  if (!commitmentId) {
    return res.status(400).json({ error: "commitmentId is required" });
  }

  try {
    const firestoreService = new FirestoreService();
    const commitment = await firestoreService.getCommitment(commitmentId);
    if (!commitment) {
      return res.status(404).json({ error: "Commitment not found" });
    }

    let oauth2Client = null;
    if (user.accessToken || user.tokens) {
      oauth2Client = getOAuth2Client(req);
      oauth2Client.setCredentials(user.tokens || {
        access_token: user.accessToken,
        refresh_token: user.refreshToken,
      });
    }

    const timeBlocker = new TimeBlocker(oauth2Client);
    const slots = await timeBlocker.findTimeForTask(
      commitment,
      durationHours || commitment.estimatedEffortHours || 1.0,
      daysToLook || 7
    );

    res.json(slots);
  } catch (error: any) {
    console.error("Failed to find time slots:", error);
    res.status(500).json({ error: error.message || "Failed to find time slots" });
  }
});

// Time Blocking - Create Manual/Custom Focus Block Endpoint
app.post("/api/timeblocking/create-block", async (req: any, res) => {
  const user = req.sessionUser;
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { commitmentId, start, end, createInCalendar } = req.body;
  if (!commitmentId || !start || !end) {
    return res.status(400).json({ error: "commitmentId, start, and end are required" });
  }

  try {
    const firestoreService = new FirestoreService();
    const commitment = await firestoreService.getCommitment(commitmentId);
    if (!commitment) {
      return res.status(404).json({ error: "Commitment not found" });
    }

    let oauth2Client = null;
    if (user.accessToken || user.tokens) {
      oauth2Client = getOAuth2Client(req);
      oauth2Client.setCredentials(user.tokens || {
        access_token: user.accessToken,
        refresh_token: user.refreshToken,
      });
    }

    const timeBlocker = new TimeBlocker(oauth2Client);
    const focusBlock = await timeBlocker.createFocusBlock(
      commitment,
      new Date(start),
      new Date(end),
      createInCalendar !== false
    );

    res.json({ success: true, focusBlock });
  } catch (error: any) {
    console.error("Failed to create focus block:", error);
    res.status(500).json({ error: error.message || "Failed to create focus block" });
  }
});

// Time Blocking - Fetch Scheduled Focus Blocks Endpoint
app.get("/api/timeblocking/focus-blocks", async (req: any, res) => {
  const user = req.sessionUser;
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const firestoreService = new FirestoreService();
    const focusBlocks = await firestoreService.getFocusBlocks(user.id);
    res.json(focusBlocks);
  } catch (error: any) {
    console.error("Failed to fetch focus blocks:", error);
    res.status(500).json({ error: error.message || "Failed to fetch focus blocks" });
  }
});

// Meeting Briefs Endpoints
app.get("/api/briefs", async (req: any, res) => {
  const user = req.sessionUser;
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  try {
    const firestoreService = new FirestoreService();
    const briefs = await firestoreService.getMeetingBriefs(user.id);
    res.json(briefs);
  } catch (err: any) {
    console.error("Failed to fetch meeting briefs:", err);
    res.status(500).json({ error: err.message || "Failed to fetch briefs" });
  }
});

app.get("/api/briefs/:meetingId", async (req: any, res) => {
  const user = req.sessionUser;
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const { meetingId } = req.params;
  try {
    const firestoreService = new FirestoreService();
    let brief = await firestoreService.getMeetingBrief(meetingId);
    if (!brief) {
      console.log(`[API] Meeting brief not found in DB for ${meetingId}. Generating on-the-fly for demo/preview...`);
      let oauth2Client = null;
      if (user.accessToken || user.tokens) {
        oauth2Client = getOAuth2Client(req);
        oauth2Client.setCredentials(user.tokens || {
          access_token: user.accessToken,
          refresh_token: user.refreshToken,
        });
      }
      const meetingBriefService = new MeetingBriefService(oauth2Client, user.id);
      brief = await meetingBriefService.generateBrief(meetingId);
    }
    res.json(brief);
  } catch (err: any) {
    console.error(`Failed to get/generate brief for ${meetingId}:`, err);
    res.status(500).json({ error: err.message || "Failed to get brief" });
  }
});

app.post("/api/briefs/generate", async (req: any, res) => {
  const user = req.sessionUser;
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const { meetingId } = req.body;
  if (!meetingId) return res.status(400).json({ error: "meetingId is required" });
  try {
    let oauth2Client = null;
    if (user.accessToken || user.tokens) {
      oauth2Client = getOAuth2Client(req);
      oauth2Client.setCredentials(user.tokens || {
        access_token: user.accessToken,
        refresh_token: user.refreshToken,
      });
    }
    const meetingBriefService = new MeetingBriefService(oauth2Client, user.id);
    const brief = await meetingBriefService.generateBrief(meetingId);
    res.json(brief);
  } catch (err: any) {
    console.error("Failed to generate manual meeting brief:", err);
    res.status(500).json({ error: err.message || "Failed to generate brief" });
  }
});

app.post("/api/briefs/:meetingId/deliver", async (req: any, res) => {
  const user = req.sessionUser;
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const { meetingId } = req.params;
  const { method } = req.body; // "in_app" | "email"
  try {
    let oauth2Client = null;
    if (user.accessToken || user.tokens) {
      oauth2Client = getOAuth2Client(req);
      oauth2Client.setCredentials(user.tokens || {
        access_token: user.accessToken,
        refresh_token: user.refreshToken,
      });
    }
    const meetingBriefService = new MeetingBriefService(oauth2Client, user.id);
    await meetingBriefService.deliverBrief(meetingId, method || "in_app");
    res.json({ success: true, message: `Brief successfully delivered via ${method || "in_app"}` });
  } catch (err: any) {
    console.error(`Failed to deliver brief for ${meetingId}:`, err);
    res.status(500).json({ error: err.message || "Failed to deliver brief" });
  }
});

// 5. Predict Commitment Risk Score
app.post("/api/commitments/predict", async (req, res) => {
  const { commitment } = req.body;
  if (!commitment) {
    return res.status(400).json({ error: "Commitment details are required." });
  }

  const { riskFactors } = commitment;
  // Risk Score = (0.3*(1-timeFactor) + 0.2*densityFactor + 0.3*effortFactor + 0.2*historyFactor) * 100
  const timeFactor = riskFactors.time; // 0-1 (1 = no time left)
  const densityFactor = riskFactors.density;
  const effortFactor = riskFactors.effort;
  const historyFactor = riskFactors.history;

  const rawScore = (0.3 * (1 - timeFactor) + 0.2 * densityFactor + 0.3 * effortFactor + 0.2 * historyFactor) * 100;
  const riskScore = Math.min(100, Math.max(0, Math.round(rawScore)));

  res.json({ riskScore, calculated: true });
});

// 6. Generate Context-Aware Brief with Gemini
app.post("/api/ai/brief", async (req, res) => {
  const { meetingTitle, participants, agenda } = req.body;
  
  if (!ai) {
    // Mock response if Gemini is not set up
    return res.json({
      summary: "AI Brief generated successfully (Simulation Mode).",
      previousContext: [
        {
          date: new Date().toISOString(),
          source: "email",
          summary: `Discussion with ${participants?.join(", ") || "stakeholders"} regarding project roadmap and timelines.`
        },
        {
          date: new Date(Date.now() - 86400000).toISOString(),
          source: "document",
          summary: "Reviewed specifications document. Draft completed."
        }
      ],
      actionItems: [
        { description: "Finalize presentation deck", from: "Self", status: "pending" },
        { description: "Send calendar invite updates", from: "Manager", status: "pending" }
      ],
      suggestedTalkingPoints: [
        `Review past open items with ${participants?.[0] || "lead"}.`,
        "Confirm timeline commitments.",
        "Clarify key bottlenecks in current task flow."
      ]
    });
  }

  try {
    const prompt = `You are ChronoGuard, an AI productivity assistant.
Generate a comprehensive pre-meeting intelligence brief for the meeting "${meetingTitle}"
Agenda: ${agenda || "Not provided"}
Participants: ${participants?.join(", ") || "Team"}

Provide output strictly in JSON format matching this schema:
{
  "summary": "High-level background",
  "previousContext": [
    {"date": "YYYY-MM-DD", "source": "email|document|meeting", "summary": "brief description"}
  ],
  "actionItems": [
    {"description": "task to do", "from": "who assigned", "status": "pending"}
  ],
  "suggestedTalkingPoints": [
    "point 1", "point 2"
  ]
}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text || "{}";
    res.json(JSON.parse(text));
  } catch (error: any) {
    console.error("Gemini brief generation failed:", error);
    res.status(500).json({ error: error.message });
  }
});

// 7. Draft extension email using Gemini
app.post("/api/ai/draft-email", async (req, res) => {
  const { commitmentTitle, deadline, extensionDays, style } = req.body;
  
  const targetStyle = style || "professional";
  const days = extensionDays || 2;

  if (!ai) {
    return res.json({
      subject: `Extension Request: ${commitmentTitle}`,
      body: `Dear Stakeholder,\n\nI am writing to request a brief extension of ${days} days for our commitment: "${commitmentTitle}" (currently due ${new Date(deadline).toLocaleDateString()}).\n\nI appreciate your flexibility.\n\nBest regards,\nUser`
    });
  }

  try {
    const prompt = `Draft a polite email requesting an extension of ${days} days for the task "${commitmentTitle}" which is currently due on ${new Date(deadline).toLocaleDateString()}.
Style: ${targetStyle} (e.g. professional, casual, friendly)
Provide the output strictly in JSON with "subject" and "body" fields.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text || "{}";
    res.json(JSON.parse(text));
  } catch (error: any) {
    console.error("Gemini email drafting failed:", error);
    res.status(500).json({ error: error.message });
  }
});

// 8. Auto-break task into subtasks
app.post("/api/ai/subtasks", async (req, res) => {
  const { title, description, estimatedHours } = req.body;

  if (!ai) {
    return res.json({
      subtasks: [
        { id: "sub-1", title: "Review requirements", estimatedHours: Math.ceil(estimatedHours * 0.2), status: "pending", order: 1 },
        { id: "sub-2", title: "Develop core features", estimatedHours: Math.ceil(estimatedHours * 0.6), status: "pending", order: 2 },
        { id: "sub-3", title: "Testing and fine-tuning", estimatedHours: Math.ceil(estimatedHours * 0.2), status: "pending", order: 3 }
      ]
    });
  }

  try {
    const prompt = `Break down the task "${title}" (Description: "${description || 'None'}", Estimated total hours: ${estimatedHours || 5}) into 3 to 5 logical subtasks.
Provide the output strictly in JSON format as a list of subtasks:
{
  "subtasks": [
    {"id": "string-uuid", "title": "subtask description", "estimatedHours": number, "status": "pending", "order": number}
  ]
}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text || "{}";
    res.json(JSON.parse(text));
  } catch (error: any) {
    console.error("Gemini subtask generation failed:", error);
    res.status(500).json({ error: error.message });
  }
});

// Vite server setup for development or static serving for production
async function startServer() {
  // Start the background Brief Scheduler to scan and deliver briefs
  try {
    const briefScheduler = new BriefScheduler();
    briefScheduler.start();
  } catch (err) {
    console.error("Failed to start background Brief Scheduler:", err);
  }

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
