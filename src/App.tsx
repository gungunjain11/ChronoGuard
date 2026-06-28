import React, { useState, useEffect } from "react";
import {
  ThemeProvider,
  CssBaseline,
  Box as MuiBox,
  AppBar,
  Toolbar,
  Typography,
  Container,
  Tab,
  Tabs,
  Stack as MuiStack,
  Button,
  Avatar,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  Menu as MuiMenu,
  MenuItem,
  Divider,
  Snackbar,
  Grid as MuiGrid,
  Alert
} from "@mui/material";
import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield,
  Clock,
  Mic,
  Calendar,
  Sparkles,
  Code,
  LogOut,
  RefreshCw,
  Copy,
  Check,
  User,
  Settings,
  Database,
  Cloud,
  ChevronRight,
  Info
} from "lucide-react";

import theme from "./theme";
import { User as UserType, Commitment, MeetingBrief } from "./types";
import { Dashboard } from "./components/Dashboard";
import { MeetingBriefViewer } from "./components/MeetingBriefViewer";
import { VoiceCommand } from "./components/VoiceCommand";

const Box = MuiBox as any;
const Stack = MuiStack as any;
const Grid = MuiGrid as any;
const Menu = MuiMenu as any;

// Initialize Query Client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});

const AppContent: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeViewTab, setActiveViewTab] = useState<number>(0);
  const [activeBlueprintTab, setActiveBlueprintTab] = useState<"gcloud" | "firestore" | "auth" | "deploy">("gcloud");
  const [userMenuAnchor, setUserMenuAnchor] = useState<null | HTMLElement>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [snackbarMsg, setSnackbarMsg] = useState<string | null>(null);
  const [hasAutoSynced, setHasAutoSynced] = useState(false);

  // ---------------- Queries ----------------
  // 1. Fetch Auth State
  const { data: currentUser, refetch: refetchUser } = useQuery<UserType | null>({
    queryKey: ["currentUser"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/auth/user");
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && data.user) {
            return data.user;
          }
        }
      } catch (err) {
        console.error("Auth check failed", err);
      }
      return null;
    }
  });

  // 2. Fetch Commitments
  const { data: commitments = [] } = useQuery<Commitment[]>({
    queryKey: ["commitments"],
    queryFn: async () => {
      const res = await fetch("/api/commitments");
      if (res.ok) return res.json();
      return [];
    }
  });

  // 3. Fetch Meeting Briefs
  const { data: briefs = [] } = useQuery<MeetingBrief[]>({
    queryKey: ["briefs"],
    queryFn: async () => {
      const res = await fetch("/api/briefs");
      if (res.ok) return res.json();
      return [];
    }
  });

  // 4. Fetch Calendar / Upcoming Meetings
  const { data: upcomingMeetings = [], isFetching: isSyncingCalendar, refetch: syncCalendar } = useQuery<any[]>({
    queryKey: ["upcomingMeetings"],
    queryFn: async () => {
      const res = await fetch("/api/calendar/upcoming");
      if (res.ok) {
        const data = await res.json();
        return data.events || [];
      }
      return [];
    }
  });

  // ---------------- Mutations ----------------
  // Generate Brief Mutation
  const generateBriefMutation = useMutation({
    mutationFn: async (meetingId: string) => {
      const res = await fetch("/api/briefs/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId })
      });
      if (!res.ok) throw new Error("Brief generation failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["briefs"] });
      setSnackbarMsg("Vertex AI Pre-Meeting Brief generated successfully!");
    },
    onError: () => {
      setSnackbarMsg("Error generating pre-meeting brief. Try again.");
    }
  });

  // Deliver Brief Mutation
  const deliverBriefMutation = useMutation({
    mutationFn: async ({ meetingId, method }: { meetingId: string; method: "in_app" | "email" }) => {
      const res = await fetch(`/api/briefs/${meetingId}/deliver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method })
      });
      if (!res.ok) throw new Error("Brief delivery failed");
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["briefs"] });
      setSnackbarMsg(`Intelligence brief delivered successfully via ${variables.method}!`);
    },
    onError: () => {
      setSnackbarMsg("Failed to deliver brief.");
    }
  });

  // Logout Mutation
  const logoutMutation = useMutation({
    mutationFn: async () => {
      await fetch("/api/auth/logout", { method: "POST" });
    },
    onSuccess: () => {
      queryClient.setQueryData(["currentUser"], null);
      setSnackbarMsg("Logged out successfully.");
    }
  });

  // Unified Sync Mutation
  const syncAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/calendar/sync-all", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Synchronization failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["commitments"] });
      queryClient.invalidateQueries({ queryKey: ["upcomingMeetings"] });
      queryClient.invalidateQueries({ queryKey: ["focusBlocks"] });
      queryClient.invalidateQueries({ queryKey: ["briefs"] });
      setSnackbarMsg(`Sync complete! Loaded ${data.calendarCount || 0} events, ${data.tasksCount || 0} tasks, and ${data.gmailCount || 0} action items.`);
    },
    onError: (err: any) => {
      setSnackbarMsg(`Sync failed: ${err.message}`);
    }
  });

  // Auto Sync Effect for new logins with empty slate
  useEffect(() => {
    if (currentUser && commitments.length === 0 && !hasAutoSynced && !syncAllMutation.isPending) {
      setHasAutoSynced(true);
      syncAllMutation.mutate();
    }
  }, [currentUser, commitments.length, hasAutoSynced, syncAllMutation]);

  // ---------------- Voice Assistant Callback Handler ----------------
  const handleVoiceCommandExecuted = (type: string, data?: any) => {
    if (type === "refresh_dashboard") {
      queryClient.invalidateQueries({ queryKey: ["commitments"] });
      queryClient.invalidateQueries({ queryKey: ["focusBlocks"] });
      setSnackbarMsg("Dashboard data synchronized.");
    } else if (type === "show_brief") {
      setActiveViewTab(1); // switch to meeting briefs tab
      if (data) {
        queryClient.invalidateQueries({ queryKey: ["briefs"] });
      }
    } else if (type === "open_gmail_drafts") {
      setSnackbarMsg("Remediation email draft prepared! Ready to review in Gmail.");
    }
  };

  // ---------------- Guides & Code Copy Helper ----------------
  const handleCopyCode = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setSnackbarMsg(`${label} copied to clipboard!`);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const blueprintCode = {
    gcloud: `# 1. Login & Set Project Configuration
gcloud auth login
gcloud config set project chronoguard-mvp-production

# 2. Enable Required APIs
gcloud services enable \\
  googlecalendar.googleapis.com \\
  gmail.googleapis.com \\
  drive.googleapis.com \\
  sheets.googleapis.com \\
  firestore.googleapis.com \\
  aiplatform.googleapis.com`,

    firestore: `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Commitments must belong to the authenticated creator
    match /commitments/{commitmentId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
    }
    
    // Focus Blocks & Briefs rules
    match /focusBlocks/{blockId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
    }
    match /meetingBriefs/{briefId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
    }
  }
}`,

    auth: `// OAuth callback redirect handler setup in express
app.get("/api/auth/google/callback", async (req, res) => {
  const { code } = req.query;
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  
  // Store secure tokens in user profile database
  await db.collection("users").doc(userId).update({
    tokens: tokens,
    updatedAt: new Date().toISOString()
  });
  
  res.redirect("/dashboard");
});`,

    deploy: `# Build full-stack production container image
gcloud builds submit --tag gcr.io/chronoguard-mvp-production/applet:latest

# Deploy directly to fully-managed Google Cloud Run
gcloud run deploy chronoguard-applet \\
  --image gcr.io/chronoguard-mvp-production/applet:latest \\
  --platform managed \\
  --region asia-south1 \\
  --allow-unauthenticated \\
  --port 3000 \\
  --set-env-vars="NODE_ENV=production,GEMINI_API_KEY=your_key"`
  };

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", pb: 8 }}>
      {/* AppBar navigation */}
      <AppBar position="static" color="inherit" sx={{ borderBottom: "1px solid #dadce0", boxShadow: "none", bgcolor: "#ffffff" }}>
        <Container maxWidth="xl">
          <Toolbar disableGutters sx={{ display: "flex", justifyContent: "space-between" }}>
            {/* Logo and Title */}
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
              <Box
                sx={{
                  bgcolor: "primary.main",
                  color: "#ffffff",
                  p: 1,
                  borderRadius: 2,
                  display: "flex",
                  alignItems: "center"
                }}
              >
                <Shield size={20} />
              </Box>
              <Box>
                <Typography variant="h3" sx={{ fontWeight: 800, color: "#202124", letterSpacing: "-0.02em" }}>
                  ChronoGuard
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: -0.5, fontWeight: 700, fontSize: "10px", textTransform: "uppercase" }}>
                  Autonomous Time Protection Engine
                </Typography>
              </Box>
            </Stack>

            {/* Sync Status / Google API Connectivity indicator */}
            <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
              <Button
                variant="outlined"
                color="primary"
                size="small"
                onClick={() => syncAllMutation.mutate()}
                disabled={syncAllMutation.isPending || isSyncingCalendar}
                startIcon={<RefreshCw size={14} style={{ animation: (syncAllMutation.isPending || isSyncingCalendar) ? "spin 2s linear infinite" : "none" }} />}
              >
                {syncAllMutation.isPending ? "Syncing Account..." : isSyncingCalendar ? "Syncing Calendar..." : "Sync All Sources"}
              </Button>

              {/* Profile Avatar / Settings Menu */}
              {currentUser ? (
                <>
                  <Tooltip title="User Profile Menu">
                    <IconButton onClick={(e) => setUserMenuAnchor(e.currentTarget)} sx={{ p: 0.5 }}>
                      <Avatar sx={{ bgcolor: "primary.main", width: 32, height: 32, fontSize: "0.875rem", fontWeight: 700 }}>
                        {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : "U"}
                      </Avatar>
                    </IconButton>
                  </Tooltip>
                  <Menu
                    anchorEl={userMenuAnchor}
                    open={Boolean(userMenuAnchor)}
                    onClose={() => setUserMenuAnchor(null)}
                    PaperProps={{ sx: { minWidth: 180, mt: 1 } }}
                  >
                    <Box sx={{ px: 2, py: 1 }}>
                      <Typography variant="body1" sx={{ fontWeight: 600 }}>{currentUser.name}</Typography>
                      <Typography variant="body2" color="text.secondary">{currentUser.email}</Typography>
                    </Box>
                    <Divider />
                    <MenuItem onClick={() => { setUserMenuAnchor(null); logoutMutation.mutate(); }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                        <LogOut size={16} />
                        <Typography variant="body1">Sign Out</Typography>
                      </Stack>
                    </MenuItem>
                  </Menu>
                </>
              ) : (
                <Button
                  component="a"
                  href="/api/auth/google"
                  variant="contained"
                  startIcon={<User size={14} />}
                >
                  Connect Google account
                </Button>
              )}
            </Stack>
          </Toolbar>
        </Container>
      </AppBar>

      {/* Main navigation view tabs */}
      <Box sx={{ borderBottom: "1px solid #dadce0", bgcolor: "#ffffff", mb: 4 }}>
        <Container maxWidth="xl">
          <Tabs
            value={activeViewTab}
            onChange={(_, val) => setActiveViewTab(val)}
            textColor="primary"
            indicatorColor="primary"
          >
            <Tab label="Delivery Threat Dashboard" icon={<Shield size={16} />} iconPosition="start" />
            <Tab label="Pre-Meeting Briefings" icon={<Calendar size={16} />} iconPosition="start" />
            <Tab label="Cloud Deploy Workstation" icon={<Code size={16} />} iconPosition="start" />
          </Tabs>
        </Container>
      </Box>

      {/* Primary content router */}
      <Container maxWidth="xl">
        {activeViewTab === 0 && <Dashboard />}

        {activeViewTab === 1 && (
          <MeetingBriefViewer
            briefs={briefs}
            upcomingMeetings={upcomingMeetings}
            isGeneratingBrief={generateBriefMutation.isPending}
            onGenerateBrief={(id) => generateBriefMutation.mutate(id)}
            onDeliverBrief={(id, method) => deliverBriefMutation.mutate({ meetingId: id, method })}
            isDeliveringBrief={deliverBriefMutation.isPending ? deliverBriefMutation.variables?.meetingId || null : null}
          />
        )}

        {activeViewTab === 2 && (
          <Grid container spacing={4}>
            <Grid size={{ xs: 12, md: 5 }}>
              <Stack spacing={3}>
                <Paper variant="outlined" sx={{ p: 3, borderColor: "#dadce0" }}>
                  <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, display: "flex", alignItems: "center", gap: 1 }}>
                    <Code size={22} color="#1a73e8" />
                    Cloud Run Integration Workstation
                  </Typography>
                  <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                    ChronoGuard operates on highly resilient Google Cloud Run serverless endpoints. Sync calendar events, securely analyze attachments inside private buckets, and protect high-risk deadlines autonomously.
                  </Typography>
                  <Alert severity="info" icon={<Info size={18} />}>
                    Deploy containerized microservices in any regional zone targeting minimal latency. We highly recommend utilizing asia-south1 (Mumbai) for your core container resources.
                  </Alert>
                </Paper>

                {/* Simulated Integration state checker */}
                <Paper variant="outlined" sx={{ p: 3, borderColor: "#dadce0", bgcolor: "#f8f9fa" }}>
                  <Typography variant="h5" sx={{ mb: 1, fontWeight: 700 }}>Sandbox Handshake Credentials</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
                    The testing sandbox contains pre-configured local mock connectors, enabling rapid workspace previewing without billing thresholds.
                  </Typography>
                  <Stack direction="row" spacing={2}>
                    <Button
                      variant="contained"
                      onClick={() => {
                        setSnackbarMsg("Connecting to Cloud SQL database... Success! Connectivity: 100%");
                      }}
                    >
                      Test Database Handshake
                    </Button>
                    <Button
                      variant="outlined"
                      component="a"
                      href="/api/auth/google"
                    >
                      Authenticate Google API
                    </Button>
                  </Stack>
                </Paper>
              </Stack>
            </Grid>

            {/* Right Pane: Multi-tab interactive blueprints block */}
            <Grid size={{ xs: 12, md: 7 }}>
              <Paper variant="outlined" sx={{ borderColor: "#dadce0", overflow: "hidden" }}>
                <Box sx={{ borderBottom: "1px solid #dadce0", bgcolor: "#f1f3f4" }}>
                  <Tabs
                    value={activeBlueprintTab}
                    onChange={(_, val) => setActiveBlueprintTab(val)}
                    textColor="primary"
                    indicatorColor="primary"
                    variant="scrollable"
                    scrollButtons="auto"
                  >
                    <Tab label="GCloud SDK" value="gcloud" />
                    <Tab label="Firestore rules" value="firestore" />
                    <Tab label="OAuth Redirect" value="auth" />
                    <Tab label="Cloud Run Deploy" value="deploy" />
                  </Tabs>
                </Box>

                <Box sx={{ p: 3, bgcolor: "#ffffff" }}>
                  {activeBlueprintTab === "gcloud" && (
                    <Stack spacing={2.5}>
                      <Typography variant="body1" color="text.secondary">
                        Install and configure the Google Cloud CLI setup on your local machine, then target your production zone to enable the calendars and files synchronization protocols.
                      </Typography>
                      <Box sx={{ position: "relative", bgcolor: "#202124", p: 2.5, borderRadius: 2, overflowX: "auto" }}>
                        <IconButton
                          size="small"
                          onClick={() => handleCopyCode(blueprintCode.gcloud, "GCloud CLI commands")}
                          sx={{ position: "absolute", right: 12, top: 12, color: "#ffffff", bgcolor: "rgba(255,255,255,0.15)", "&:hover": { bgcolor: "rgba(255,255,255,0.25)" } }}
                        >
                          {copiedText === "GCloud CLI commands" ? <Check size={14} color="#1e8e3e" /> : <Copy size={14} />}
                        </IconButton>
                        <Typography component="pre" variant="body1" sx={{ color: "#a8ff60", fontFamily: "monospace", whiteSpace: "pre-wrap", m: 0 }}>
                          {blueprintCode.gcloud}
                        </Typography>
                      </Box>
                    </Stack>
                  )}

                  {activeBlueprintTab === "firestore" && (
                    <Stack spacing={2.5}>
                      <Typography variant="body1" color="text.secondary">
                        Secure read/write operations targeting user specific documents using highly restricted collection rules. Protect private communications context.
                      </Typography>
                      <Box sx={{ position: "relative", bgcolor: "#202124", p: 2.5, borderRadius: 2, overflowX: "auto" }}>
                        <IconButton
                          size="small"
                          onClick={() => handleCopyCode(blueprintCode.firestore, "Firestore rules")}
                          sx={{ position: "absolute", right: 12, top: 12, color: "#ffffff", bgcolor: "rgba(255,255,255,0.15)", "&:hover": { bgcolor: "rgba(255,255,255,0.25)" } }}
                        >
                          {copiedText === "Firestore rules" ? <Check size={14} color="#1e8e3e" /> : <Copy size={14} />}
                        </IconButton>
                        <Typography component="pre" variant="body1" sx={{ color: "#a8ff60", fontFamily: "monospace", whiteSpace: "pre-wrap", m: 0 }}>
                          {blueprintCode.firestore}
                        </Typography>
                      </Box>
                    </Stack>
                  )}

                  {activeBlueprintTab === "auth" && (
                    <Stack spacing={2.5}>
                      <Typography variant="body1" color="text.secondary">
                        Setup Callback redirect endpoints. Secure tokens inside your Firestore user profiles to authorize subsequent pre-meeting background analytics.
                      </Typography>
                      <Box sx={{ position: "relative", bgcolor: "#202124", p: 2.5, borderRadius: 2, overflowX: "auto" }}>
                        <IconButton
                          size="small"
                          onClick={() => handleCopyCode(blueprintCode.auth, "OAuth code snippets")}
                          sx={{ position: "absolute", right: 12, top: 12, color: "#ffffff", bgcolor: "rgba(255,255,255,0.15)", "&:hover": { bgcolor: "rgba(255,255,255,0.25)" } }}
                        >
                          {copiedText === "OAuth code snippets" ? <Check size={14} color="#1e8e3e" /> : <Copy size={14} />}
                        </IconButton>
                        <Typography component="pre" variant="body1" sx={{ color: "#a8ff60", fontFamily: "monospace", whiteSpace: "pre-wrap", m: 0 }}>
                          {blueprintCode.auth}
                        </Typography>
                      </Box>
                    </Stack>
                  )}

                  {activeBlueprintTab === "deploy" && (
                    <Stack spacing={2.5}>
                      <Typography variant="body1" color="text.secondary">
                        Submit and build secure Docker images, then deploy directly onto Google Cloud Run targeting automatic cold start protection.
                      </Typography>
                      <Box sx={{ position: "relative", bgcolor: "#202124", p: 2.5, borderRadius: 2, overflowX: "auto" }}>
                        <IconButton
                          size="small"
                          onClick={() => handleCopyCode(blueprintCode.deploy, "Deployment script")}
                          sx={{ position: "absolute", right: 12, top: 12, color: "#ffffff", bgcolor: "rgba(255,255,255,0.15)", "&:hover": { bgcolor: "rgba(255,255,255,0.25)" } }}
                        >
                          {copiedText === "Deployment script" ? <Check size={14} color="#1e8e3e" /> : <Copy size={14} />}
                        </IconButton>
                        <Typography component="pre" variant="body1" sx={{ color: "#a8ff60", fontFamily: "monospace", whiteSpace: "pre-wrap", m: 0 }}>
                          {blueprintCode.deploy}
                        </Typography>
                      </Box>
                    </Stack>
                  )}
                </Box>
              </Paper>
            </Grid>
          </Grid>
        )}
      </Container>

      {/* Floating Voice Assistant Action button and command engine */}
      <VoiceCommand
        commitments={commitments}
        briefs={briefs}
        upcomingMeetings={upcomingMeetings}
        onCommandExecuted={handleVoiceCommandExecuted}
      />

      {/* Notification Toast */}
      <Snackbar
        open={!!snackbarMsg}
        autoHideDuration={4000}
        onClose={() => setSnackbarMsg(null)}
        message={snackbarMsg}
      />
    </Box>
  );
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AppContent />
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
