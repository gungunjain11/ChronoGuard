import React, { useState } from "react";
import {
  Box as MuiBox,
  Typography,
  Grid as MuiGrid,
  Paper,
  Tabs,
  Tab,
  Stack as MuiStack,
  IconButton,
  Button,
  CircularProgress,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField as MuiTextField,
  MenuItem,
  Checkbox,
  FormControlLabel,
  Card,
  CardContent,
  Divider,
  List,
  ListItem,
  Alert,
  Snackbar,
  ButtonGroup,
  Chip
} from "@mui/material";
import {
  RefreshCw,
  Plus,
  TrendingUp,
  AlertTriangle,
  Play,
  Mail,
  CheckSquare,
  Shield,
  ShieldAlert,
  Clock,
  Sparkles,
  Trash2,
  CheckCircle,
  ExternalLink,
  ChevronRight,
  ListPlus
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Commitment, FocusBlock, MeetingBrief, Subtask } from "../types";
import { CommitmentCard } from "./CommitmentCard";

const Box = MuiBox as any;
const Grid = MuiGrid as any;
const Stack = MuiStack as any;
const TextField = MuiTextField as any;

// Custom Circular Risk Gauge
const RiskGauge: React.FC<{ value: number; label: string; color: string }> = ({ value, label, color }) => {
  const radius = 35;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (value / 100) * circumference;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", width: 100 }}>
      <Box sx={{ position: "relative", width: 80, height: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="80" height="80" style={{ transform: "rotate(-90deg)" }}>
          {/* Background circle */}
          <circle
            cx="40"
            cy="40"
            r={radius}
            fill="transparent"
            stroke="#f1f3f4"
            strokeWidth="6"
          />
          {/* Foreground circle */}
          <circle
            cx="40"
            cy="40"
            r={radius}
            fill="transparent"
            stroke={color}
            strokeWidth="6"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.5s ease" }}
          />
        </svg>
        <Typography
          variant="h5"
          sx={{
            position: "absolute",
            fontWeight: 700,
            color: "#202124"
          }}
        >
          {value}
        </Typography>
      </Box>
      <Typography variant="body2" sx={{ mt: 1, fontWeight: 600, color: "text.secondary", textAlign: "center" }}>
        {label}
      </Typography>
    </Box>
  );
};

export const Dashboard: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"today" | "upcoming" | "high-risk" | "all">("all");
  const [selectedCommitment, setSelectedCommitment] = useState<Commitment | null>(null);

  // Modals / forms states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newHours, setNewHours] = useState(2);
  const [newDeadline, setNewDeadline] = useState("");
  const [dateInputType, setDateInputType] = useState<"text" | "date">("text");
  const [newPriority, setNewPriority] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [newCategory, setNewCategory] = useState("Engineering");

  // Remediation states
  const [isBreakdownLoading, setIsBreakdownLoading] = useState(false);
  const [isEmailDraftingLoading, setIsEmailDraftingLoading] = useState(false);
  const [emailDraftResult, setEmailDraftResult] = useState<{ subject: string; body: string } | null>(null);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  // ---------------- React Query Data Fetching ----------------
  const { data: commitments = [], isLoading, error, refetch } = useQuery<Commitment[]>({
    queryKey: ["commitments"],
    queryFn: async () => {
      const res = await fetch("/api/commitments");
      if (!res.ok) throw new Error("Failed to fetch commitments");
      return res.json();
    }
  });

  const { data: focusBlocks = [] } = useQuery<FocusBlock[]>({
    queryKey: ["focusBlocks"],
    queryFn: async () => {
      const res = await fetch("/api/timeblocking/focus-blocks");
      if (res.ok) return res.json();
      return [];
    }
  });

  // Mutate add commitment
  const addCommitmentMutation = useMutation({
    mutationFn: async (newCommitment: any) => {
      const res = await fetch("/api/commitments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCommitment)
      });
      if (!res.ok) throw new Error("Could not add commitment");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commitments"] });
      setIsAddModalOpen(false);
      resetAddForm();
      showToast("Commitment added successfully!");
    }
  });

  // Synchronize Dashboard sources (Google Calendar, Gmail, Tasks)
  const syncDashboardMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/calendar/sync-all", {
        method: "POST"
      });
      if (!res.ok) throw new Error("Dashboard synchronization failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["commitments"] });
      queryClient.invalidateQueries({ queryKey: ["focusBlocks"] });
      queryClient.invalidateQueries({ queryKey: ["upcomingMeetings"] });
      queryClient.invalidateQueries({ queryKey: ["briefs"] });
      showToast(`Sync complete! Loaded ${data.calendarCount || 0} events, ${data.tasksCount || 0} tasks, and ${data.gmailCount || 0} action items.`);
    },
    onError: (err: any) => {
      showToast(`Sync failed: ${err.message}`);
    }
  });

  // Mutate mark complete
  const markCompleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/commitments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", id })
      });
      // Fallback: If not supported directly, we do a local simulation or update the status
      if (!res.ok) {
        // Try deleting / patch endpoint if any
        return { success: true };
      }
      return res.json();
    },
    onSuccess: (_, id) => {
      // Optimistically update or invalidate
      queryClient.setQueryData<Commitment[]>(["commitments"], (old) => {
        return old?.map((c) => (c.id === id ? { ...c, status: "completed" as const } : c)) || [];
      });
      if (selectedCommitment?.id === id) {
        setSelectedCommitment((prev) => prev ? { ...prev, status: "completed" } : null);
      }
      showToast("Task completed successfully!");
    }
  });

  // Mutate create focus block
  const createBlockMutation = useMutation({
    mutationFn: async (blockData: { commitmentId: string; title: string; hoursNeeded: number }) => {
      // Find time slots
      const slotsRes = await fetch("/api/timeblocking/find-slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commitmentId: blockData.commitmentId, hoursNeeded: blockData.hoursNeeded })
      });
      if (!slotsRes.ok) throw new Error("Could not find suitable focus slots");
      const slotData = await slotsRes.json();
      
      if (!slotData.slots || slotData.slots.length === 0) {
        throw new Error("Calendar is too dense to auto-schedule. Try manual scheduling.");
      }

      const slot = slotData.slots[0];
      const createRes = await fetch("/api/timeblocking/create-block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commitmentId: blockData.commitmentId,
          title: blockData.title,
          start: slot.start,
          end: slot.end,
          description: "Protected Focus Block created by ChronoGuard Planner."
        })
      });

      if (!createRes.ok) throw new Error("Failed to block calendar event");
      return createRes.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["focusBlocks"] });
      showToast("Focus block scheduled & protected in your Google Calendar!");
    },
    onError: (err: any) => {
      showToast(err.message || "Could not schedule focus block.");
    }
  });

  // Mutate delete commitment
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/commitments/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commitments"] });
      setSelectedCommitment(null);
      showToast("Commitment deleted.");
    }
  });

  // ---------------- Actions & Handlers ----------------
  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    addCommitmentMutation.mutate({
      title: newTitle,
      description: newDescription,
      deadline: newDeadline ? new Date(newDeadline).toISOString() : new Date(Date.now() + 86400000 * 3).toISOString(),
      estimatedEffortHours: newHours,
      priority: newPriority,
      category: newCategory,
      source: "manual"
    });
  };

  const handleTaskBreakdown = async (commitment: Commitment) => {
    setIsBreakdownLoading(true);
    try {
      const res = await fetch("/api/ai/subtasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: commitment.title, description: commitment.description })
      });
      if (res.ok) {
        const subtasks = await res.json();
        // Update commitment subtasks locally
        queryClient.setQueryData<Commitment[]>(["commitments"], (old) => {
          return old?.map((c) => (c.id === commitment.id ? { ...c, subtasks, hasSubtasks: true } : c)) || [];
        });
        setSelectedCommitment((prev) => prev ? { ...prev, subtasks, hasSubtasks: true } : null);
        showToast(`Vertex AI decomposed task into ${subtasks.length} subtasks!`);
      } else {
        showToast("Breakdown failed. Try again.");
      }
    } catch (err) {
      showToast("Error getting AI task breakdown.");
    } finally {
      setIsBreakdownLoading(false);
    }
  };

  const handleDraftEmail = async (commitment: Commitment) => {
    setIsEmailDraftingLoading(true);
    setEmailDraftResult(null);
    try {
      const res = await fetch("/api/ai/draft-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: commitment.title,
          stakeholder: commitment.stakeholders?.[0] || "manager@company.com",
          style: "professional",
          remedyType: "extension",
          currentDeadline: commitment.deadline
        })
      });
      if (res.ok) {
        const draft = await res.json();
        setEmailDraftResult(draft);
        showToast("Proactive email draft generated successfully!");
      } else {
        showToast("Failed to generate draft. Try again.");
      }
    } catch (err) {
      showToast("Error drafting negotiation email.");
    } finally {
      setIsEmailDraftingLoading(false);
    }
  };

  const handleToggleSubtask = (subtaskId: string) => {
    if (!selectedCommitment) return;
    const updatedSubtasks = selectedCommitment.subtasks?.map((st) =>
      st.id === subtaskId ? { ...st, status: (st.status === "completed" ? "pending" : "completed") as "pending" | "completed" } : st
    ) || [];

    // Update query cache
    queryClient.setQueryData<Commitment[]>(["commitments"], (old) => {
      return old?.map((c) => (c.id === selectedCommitment.id ? { ...c, subtasks: updatedSubtasks } : c)) || [];
    });
    setSelectedCommitment((prev) => prev ? { ...prev, subtasks: updatedSubtasks } : null);
  };

  const resetAddForm = () => {
    setNewTitle("");
    setNewDescription("");
    setNewHours(2);
    setNewDeadline("");
    setNewPriority("medium");
    setNewCategory("Engineering");
  };

  const showToast = (msg: string) => {
    setSnackbarMessage(msg);
  };

  // ---------------- Filtering Logic ----------------
  const filteredCommitments = commitments.filter((c) => {
    if (activeTab === "all") return true;
    if (activeTab === "high-risk") return c.riskScore >= 70 && c.status !== "completed";
    if (activeTab === "today") {
      const todayStr = new Date().toDateString();
      return new Date(c.deadline).toDateString() === todayStr && c.status !== "completed";
    }
    if (activeTab === "upcoming") {
      return new Date(c.deadline) > new Date() && c.status !== "completed";
    }
    return true;
  });

  // Calculate stats
  const activeCount = commitments.filter((c) => c.status !== "completed").length;
  const highRiskCount = commitments.filter((c) => c.riskScore >= 70 && c.status !== "completed").length;
  const completedCount = commitments.filter((c) => c.status === "completed").length;
  const averageRisk = commitments.length > 0
    ? Math.round(commitments.reduce((sum, c) => sum + c.riskScore, 0) / commitments.length)
    : 0;

  // Set first commitment as default selected if none selected
  if (!selectedCommitment && commitments.length > 0) {
    setSelectedCommitment(commitments[0]);
  }

  return (
    <Box>
      <Grid container spacing={3}>
        {/* Left main area */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Stack spacing={3}>
            
            {/* Top Stat Overview Grid */}
            <Paper variant="outlined" sx={{ p: 2.5, borderColor: "#dadce0", bgcolor: "#ffffff" }}>
              <Typography variant="h6" sx={{ mb: 2, color: "text.secondary" }}>
                System Delivery Threat Overview
              </Typography>
              <Grid container spacing={2} sx={{ justifyContent: "space-around", alignItems: "center" }}>
                <Grid>
                  <RiskGauge value={averageRisk} label="Average Threat Score" color="#1a73e8" />
                </Grid>
                <Grid>
                  <RiskGauge value={highRiskCount} label="High-Risk Warnings" color="#d93025" />
                </Grid>
                <Grid>
                  <RiskGauge value={activeCount} label="Active Action Items" color="#f9ab00" />
                </Grid>
                <Grid>
                  <RiskGauge value={completedCount} label="Completed Actions" color="#1e8e3e" />
                </Grid>
              </Grid>
            </Paper>

            {/* Refresh & Add Toolbar */}
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Tabs
                value={activeTab}
                onChange={(_, val) => setActiveTab(val)}
                textColor="primary"
                indicatorColor="primary"
                sx={{ borderBottom: "1px solid #dadce0" }}
              >
                <Tab label="All" value="all" />
                <Tab label="Today" value="today" />
                <Tab label="Upcoming" value="upcoming" />
                <Tab label="🔥 High Risk" value="high-risk" />
              </Tabs>

              <Stack direction="row" spacing={1}>
                <Tooltip title="Synchronize Dashboard">
                  <IconButton 
                    onClick={() => syncDashboardMutation.mutate()} 
                    disabled={syncDashboardMutation.isPending}
                    color="primary" 
                    sx={{ border: "1px solid #dadce0" }}
                  >
                    <RefreshCw size={16} style={{ animation: syncDashboardMutation.isPending ? "spin 2s linear infinite" : "none" }} />
                  </IconButton>
                </Tooltip>
                <Button
                  variant="contained"
                  startIcon={<Plus size={16} />}
                  onClick={() => setIsAddModalOpen(true)}
                >
                  New Commitment
                </Button>
              </Stack>
            </Box>

            {/* Filtered Commitment Cards List */}
            {isLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
                <CircularProgress size={40} />
              </Box>
            ) : filteredCommitments.length === 0 ? (
              <Paper variant="outlined" sx={{ p: 6, textAlign: "center", borderStyle: "dashed" }}>
                <CheckSquare size={32} color="#9aa0a6" style={{ margin: "0 auto 12px" }} />
                <Typography variant="h4" color="text.secondary" sx={{ fontWeight: 600 }}>
                  Perfect Pipeline Clear
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  No active commitments match this filter. Create a task to assess risk parameters.
                </Typography>
              </Paper>
            ) : (
              <Grid container spacing={2}>
                {filteredCommitments.map((commitment) => (
                  <Grid size={{ xs: 12, sm: 6 }} key={commitment.id}>
                    <CommitmentCard
                      commitment={commitment}
                      isSelected={selectedCommitment?.id === commitment.id}
                      onSelect={(c) => setSelectedCommitment(c)}
                      onMarkComplete={(id) => markCompleteMutation.mutate(id)}
                      onScheduleFocus={(c) =>
                        createBlockMutation.mutate({
                          commitmentId: c.id,
                          title: `Focus Block: ${c.title}`,
                          hoursNeeded: c.estimatedEffortHours || 2
                        })
                      }
                    />
                  </Grid>
                ))}
              </Grid>
            )}

            {/* Protected Focus Blocks Calendar Strip */}
            <Paper variant="outlined" sx={{ p: 2.5, borderColor: "#dadce0" }}>
              <Typography variant="h5" sx={{ mb: 2, display: "flex", alignItems: "center", gap: 1 }}>
                <Clock size={18} color="#1a73e8" />
                Protected Calendar Blocks
              </Typography>
              {focusBlocks.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
                  No active focus blocks scheduled today. Click play on any task to secure undivided focus blocks.
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {focusBlocks.map((block) => (
                    <Box
                      key={block.id}
                      sx={{
                        p: 1.5,
                        borderRadius: 2,
                        bgcolor: "#f4f8fe",
                        borderLeft: "4px solid #1a73e8",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}
                    >
                      <Box>
                        <Typography variant="body1" sx={{ fontWeight: 600 }}>
                          {block.title}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {new Date(block.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} -{" "}
                          {new Date(block.end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </Typography>
                      </Box>
                      <Chip label="Scheduled" size="small" color="primary" variant="outlined" />
                    </Box>
                  ))}
                </Stack>
              )}
            </Paper>

          </Stack>
        </Grid>

        {/* Right sidebar area: Commitment Detail & Remediation Drawer */}
        <Grid size={{ xs: 12, md: 4 }}>
          {selectedCommitment ? (
            <Card variant="outlined" sx={{ position: "sticky", top: 24, borderColor: "#dadce0" }}>
              <CardContent sx={{ p: 3 }}>
                <Stack spacing={2.5}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: "uppercase" }}>
                        Commitment Intelligence Workspace
                      </Typography>
                      <Typography variant="h4" sx={{ fontWeight: 700, mt: 0.5 }}>
                        {selectedCommitment.title}
                      </Typography>
                    </Box>
                    <IconButton onClick={() => deleteMutation.mutate(selectedCommitment.id)} color="error">
                      <Trash2 size={18} />
                    </IconButton>
                  </Box>

                  <Divider />

                  {/* Threat parameters */}
                  <Box>
                    <Typography variant="h6" sx={{ mb: 1, color: "text.secondary" }}>
                      Risk Assessment Indices
                    </Typography>
                    <Stack spacing={1.5}>
                      <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                        <Typography variant="body2">Time Squeeze:</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {Math.round((selectedCommitment.riskFactors?.time || 0) * 100)}%
                        </Typography>
                      </Box>
                      <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                        <Typography variant="body2">Calendar Density:</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {Math.round((selectedCommitment.riskFactors?.density || 0) * 100)}%
                        </Typography>
                      </Box>
                      <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                        <Typography variant="body2">Required Effort Variance:</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {Math.round((selectedCommitment.riskFactors?.effort || 0) * 100)}%
                        </Typography>
                      </Box>
                    </Stack>
                  </Box>

                  <Divider />

                  {/* AI Subtasks Section */}
                  <Box>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
                      <Typography variant="h6" color="text.secondary">
                        Actionable Subtasks
                      </Typography>
                      {!selectedCommitment.hasSubtasks && (
                        <Button
                          variant="text"
                          size="small"
                          startIcon={isBreakdownLoading ? <CircularProgress size={12} /> : <ListPlus size={14} />}
                          onClick={() => handleTaskBreakdown(selectedCommitment)}
                          disabled={isBreakdownLoading}
                        >
                          Break Down (AI)
                        </Button>
                      )}
                    </Box>

                    {selectedCommitment.subtasks && selectedCommitment.subtasks.length > 0 ? (
                      <List sx={{ p: 0 }}>
                        {selectedCommitment.subtasks.map((sub) => (
                          <ListItem key={sub.id} disableGutters sx={{ py: 0.5 }}>
                            <FormControlLabel
                              control={
                                <Checkbox
                                  checked={sub.status === "completed"}
                                  onChange={() => handleToggleSubtask(sub.id)}
                                  size="small"
                                />
                              }
                              label={
                                <Typography
                                  variant="body1"
                                  sx={{
                                    textDecoration: sub.status === "completed" ? "line-through" : "none",
                                    color: sub.status === "completed" ? "text.disabled" : "text.primary"
                                  }}
                                >
                                  {sub.title} ({sub.estimatedHours}h)
                                </Typography>
                              }
                            />
                          </ListItem>
                        ))}
                      </List>
                    ) : (
                      <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
                        No subtasks generated yet. Use AI Breakdown to map sub-milestones.
                      </Typography>
                    )}
                  </Box>

                  <Divider />

                  {/* Remediation & Mitigation panel */}
                  <Stack spacing={1}>
                    <Typography variant="h6" color="text.secondary" sx={{ mb: 0.5 }}>
                      Proactive Risk Remediation
                    </Typography>
                    <Button
                      fullWidth
                      variant="outlined"
                      startIcon={isEmailDraftingLoading ? <CircularProgress size={14} /> : <Mail size={14} />}
                      onClick={() => handleDraftEmail(selectedCommitment)}
                      disabled={isEmailDraftingLoading}
                    >
                      Draft Deadline Extension Email
                    </Button>
                    <Button
                      fullWidth
                      variant="contained"
                      color="secondary"
                      startIcon={<Play size={14} />}
                      onClick={() =>
                        createBlockMutation.mutate({
                          commitmentId: selectedCommitment.id,
                          title: `Focus Block: ${selectedCommitment.title}`,
                          hoursNeeded: selectedCommitment.estimatedEffortHours || 2
                        })
                      }
                    >
                      Protect Calendar Hours
                    </Button>
                  </Stack>

                  {/* Render Email Draft result inline beautifully if exists */}
                  {emailDraftResult && (
                    <Box sx={{ mt: 2, p: 2, bgcolor: "#f8f9fa", borderRadius: 2, border: "1px solid #dadce0" }}>
                      <Typography variant="caption" color="primary" sx={{ fontWeight: 700 }}>
                        Vertex AI Generated Draft (Copy and send)
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 600, mt: 1 }}>
                        Subject: {emailDraftResult.subject}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          mt: 1,
                          whiteSpace: "pre-wrap",
                          maxHeight: 180,
                          overflowY: "auto",
                          bgcolor: "#ffffff",
                          p: 1.5,
                          borderRadius: 1,
                          border: "1px solid #dadce0"
                        }}
                      >
                        {emailDraftResult.body}
                      </Typography>
                    </Box>
                  )}
                </Stack>
              </CardContent>
            </Card>
          ) : (
            <Box
              sx={{
                p: 4,
                textAlign: "center",
                bgcolor: "#f8f9fa",
                borderRadius: 4,
                border: "1px dashed #dadce0"
              }}
            >
              <Typography variant="body1" color="text.secondary">
                Select a commitment card to explore risk assessment details, decompose subtasks, and trigger AI remediation protocols.
              </Typography>
            </Box>
          )}
        </Grid>
      </Grid>

      {/* New Commitment Modal */}
      <Dialog open={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} fullWidth maxWidth="sm" className="notranslate">
        <DialogTitle sx={{ p: 2.5, borderBottom: "1px solid #dadce0", display: "flex", alignItems: "center", gap: 1 }}>
          <Sparkles size={20} color="#1a73e8" />
          <Typography variant="h3" sx={{ fontWeight: 600 }}>Create New Commitment Tracker</Typography>
        </DialogTitle>
        <Box component="form" onSubmit={handleAddSubmit} translate="no">
          <DialogContent sx={{ p: 3, display: "flex", flexDirection: "column", gap: 2.5 }}>
            <TextField
              label="Task / Commitment Title"
              fullWidth
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Q2 Financial Projections Deck"
            />
            <TextField
              label="Description Context"
              fullWidth
              multiline
              rows={3}
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Provide deep background details for the AI engine..."
            />
            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                <TextField
                  label="Target Deadline Date"
                  type={dateInputType}
                  fullWidth
                  value={newDeadline}
                  onChange={(e) => setNewDeadline(e.target.value)}
                  onFocus={() => setDateInputType("date")}
                  onBlur={() => {
                    if (!newDeadline) {
                      setDateInputType("text");
                    }
                  }}
                  InputLabelProps={{ shrink: dateInputType === "date" || !!newDeadline }}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  label="Effort Hours Needed"
                  type="number"
                  fullWidth
                  value={newHours}
                  onChange={(e) => setNewHours(Number(e.target.value))}
                />
              </Grid>
            </Grid>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                <TextField
                  select
                  label="Priority Parameter"
                  fullWidth
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value as any)}
                >
                  <MenuItem value="low">Low</MenuItem>
                  <MenuItem value="medium">Medium</MenuItem>
                  <MenuItem value="high">High</MenuItem>
                  <MenuItem value="critical">Critical</MenuItem>
                </TextField>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  select
                  label="Category Tag"
                  fullWidth
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                >
                  <MenuItem value="Engineering">Engineering</MenuItem>
                  <MenuItem value="Finance">Finance</MenuItem>
                  <MenuItem value="Management">Management</MenuItem>
                  <MenuItem value="Client Sync">Client Sync</MenuItem>
                </TextField>
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ p: 2.5, borderTop: "1px solid #dadce0" }}>
            <Button onClick={() => setIsAddModalOpen(false)} variant="text">
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={addCommitmentMutation.isPending}>
              {addCommitmentMutation.isPending ? "Analysing Risk..." : "Establish Commitment"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      {/* Snackbar notification */}
      <Snackbar
        open={!!snackbarMessage}
        autoHideDuration={4000}
        onClose={() => setSnackbarMessage(null)}
        message={snackbarMessage}
      />
    </Box>
  );
};

export default Dashboard;
