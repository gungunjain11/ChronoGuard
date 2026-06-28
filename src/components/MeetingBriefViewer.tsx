import React, { useState } from "react";
import {
  Box as MuiBox,
  Typography,
  Grid as MuiGrid,
  Card,
  CardContent,
  Button,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Divider,
  Stack as MuiStack,
  Tooltip,
  Paper
} from "@mui/material";
import {
  Sparkles,
  Clock,
  Mail,
  FileText,
  CheckCircle,
  Plus,
  RefreshCw,
  Send,
  ExternalLink,
  Users,
  Check,
  AlertCircle
} from "lucide-react";
import { MeetingBrief } from "../types";

const Box = MuiBox as any;
const Grid = MuiGrid as any;
const Stack = MuiStack as any;

interface MeetingBriefViewerProps {
  briefs: MeetingBrief[];
  upcomingMeetings: any[];
  isGeneratingBrief: boolean;
  onGenerateBrief: (meetingId: string) => void;
  onDeliverBrief: (meetingId: string, method: "in_app" | "email") => void;
  isDeliveringBrief: string | null;
}

export const MeetingBriefViewer: React.FC<MeetingBriefViewerProps> = ({
  briefs,
  upcomingMeetings,
  isGeneratingBrief,
  onGenerateBrief,
  onDeliverBrief,
  isDeliveringBrief
}) => {
  const [selectedBriefId, setSelectedBriefId] = useState<string | null>(
    briefs.length > 0 ? briefs[0].id : null
  );

  // Fallback selected brief if active id gets lost
  const activeBrief = briefs.find((b) => b.id === selectedBriefId) || briefs[0];

  // Map calendar events to their corresponding briefs (if generated)
  const getBriefForMeeting = (meetingId: string) => {
    return briefs.find((b) => b.meetingId === meetingId);
  };

  return (
    <Card sx={{ border: "1px solid #dadce0", boxShadow: "none", overflow: "hidden" }} id="briefs-panel">
      <CardContent sx={{ p: 3 }}>
        {/* Title & Header */}
        <Box sx={{ pb: 2, mb: 3, borderBottom: "1px solid #dadce0" }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Sparkles size={22} color="#f9ab00" />
            <Typography variant="h4" sx={{ fontWeight: 600 }}>
              Pre-Meeting Intelligence Briefs
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Auto-compile Gmail context, Google Drive documents, and past actions 1 hour before meetings using Vertex AI.
          </Typography>
        </Box>

        {/* Main Grid: Split Pane */}
        <Grid container spacing={4}>
          {/* Left Pane: Upcoming Meetings & Compiled Briefs */}
          <Grid size={{ xs: 12, lg: 5 }} sx={{ borderRight: { lg: "1px solid #dadce0" }, pr: { lg: 3 } }}>
            <Stack spacing={3}>
              {/* Upcoming Meetings List */}
              <Box>
                <Typography variant="h6" sx={{ mb: 1.5, color: "text.secondary" }}>
                  Select Meeting to Prepare
                </Typography>

                {upcomingMeetings.length === 0 ? (
                  <Paper variant="outlined" sx={{ p: 2.5, textAlign: "center", bgcolor: "#f8f9fa", borderColor: "#dadce0" }}>
                    <Typography variant="body2" color="text.secondary">
                      No upcoming calendar meetings found. Sync calendar above.
                    </Typography>
                  </Paper>
                ) : (
                  <Stack spacing={1} sx={{ maxHeight: 240, overflowY: "auto", pr: 0.5 }}>
                    {upcomingMeetings.map((meeting) => {
                      const brief = getBriefForMeeting(meeting.id);
                      const isSelected = activeBrief?.meetingId === meeting.id;

                      return (
                        <Box
                          key={meeting.id}
                          sx={{
                            p: 2,
                            borderRadius: 2,
                            border: "1px solid",
                            borderColor: isSelected ? "#1a73e8" : "#dadce0",
                            bgcolor: isSelected ? "#e8f0fe" : "#ffffff",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 2,
                            transition: "all 0.2s"
                          }}
                        >
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography
                              variant="body1"
                              sx={{
                                fontWeight: 600,
                                color: isSelected ? "#1557b0" : "text.primary",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap"
                              }}
                            >
                              {meeting.summary || "Team Sync"}
                            </Typography>
                            <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", mt: 0.5, color: isSelected ? "#1557b0" : "text.secondary" }}>
                              <Clock size={12} />
                              <Typography variant="body2">
                                {meeting.start?.dateTime
                                  ? new Date(meeting.start.dateTime).toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit"
                                    })
                                  : "All Day"}
                              </Typography>
                            </Stack>
                          </Box>

                          {brief ? (
                            <Button
                              variant={isSelected ? "contained" : "outlined"}
                              size="small"
                              onClick={() => setSelectedBriefId(brief.id)}
                              sx={{ flexShrink: 0 }}
                            >
                              View Brief
                            </Button>
                          ) : (
                            <Button
                              variant="contained"
                              color="warning"
                              size="small"
                              onClick={() => onGenerateBrief(meeting.id)}
                              disabled={isGeneratingBrief}
                              startIcon={isGeneratingBrief ? <RefreshCw size={12} style={{ animation: "spin 2s linear infinite" }} /> : <Plus size={12} />}
                              sx={{ flexShrink: 0 }}
                            >
                              Compile
                            </Button>
                          )}
                        </Box>
                      );
                    })}
                  </Stack>
                )}
              </Box>

              {/* History List */}
              <Box>
                <Typography variant="h6" sx={{ mb: 1.5, color: "text.secondary" }}>
                  Compiled Briefs ({briefs.length})
                </Typography>

                {briefs.length === 0 ? (
                  <Paper variant="outlined" sx={{ p: 2.5, textAlign: "center", bgcolor: "#f8f9fa", borderColor: "#dadce0" }}>
                    <Typography variant="body2" color="text.secondary">
                      No pre-meeting briefs compiled yet.
                    </Typography>
                  </Paper>
                ) : (
                  <Stack spacing={1} sx={{ maxHeight: 200, overflowY: "auto", pr: 0.5 }}>
                    {briefs.map((brief) => {
                      const isSelected = activeBrief?.id === brief.id;
                      return (
                        <Box
                          key={brief.id}
                          onClick={() => setSelectedBriefId(brief.id)}
                          sx={{
                            p: 2,
                            borderRadius: 2,
                            border: "1px solid",
                            borderColor: isSelected ? "#1a73e8" : "#dadce0",
                            bgcolor: isSelected ? "#e8f0fe" : "#ffffff",
                            cursor: "pointer",
                            transition: "all 0.2s",
                            "&:hover": {
                              borderColor: "#1a73e8"
                            }
                          }}
                        >
                          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                            <Chip
                              label={brief.delivered ? "Delivered" : "Pending Approval"}
                              size="small"
                              sx={{
                                height: 20,
                                fontSize: "10px",
                                fontWeight: 700,
                                bgcolor: brief.delivered ? "#e6f4ea" : "#fef7e0",
                                color: brief.delivered ? "#137333" : "#b06000",
                                border: `1px solid ${brief.delivered ? "#ceead6" : "#fddcb5"}`
                              }}
                            />
                            <Typography variant="body2" color="text.secondary">
                              {new Date(brief.createdAt).toLocaleDateString()}
                            </Typography>
                          </Box>
                          <Typography variant="body1" sx={{ fontWeight: 600, color: isSelected ? "#1557b0" : "text.primary" }}>
                            {brief.title}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Stack>
                )}
              </Box>
            </Stack>
          </Grid>

          {/* Right Pane: Brief Detail View */}
          <Grid size={{ xs: 12, lg: 7 }}>
            {activeBrief ? (
              <Stack spacing={3}>
                {/* Brief Title Banner */}
                <Box>
                  <Box sx={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 1, mb: 1.5 }}>
                    <Chip
                      icon={<Sparkles size={12} color="#b06000" />}
                      label="Intelligence Brief"
                      size="small"
                      sx={{ bgcolor: "#fef7e0", color: "#b06000", border: "1px solid #fddcb5", fontWeight: 700 }}
                    />
                    {activeBrief.delivered && (
                      <Chip
                        icon={<Check size={12} color="#137333" />}
                        label={`Delivered via ${activeBrief.deliveredMethod}`}
                        size="small"
                        sx={{ bgcolor: "#e6f4ea", color: "#137333", border: "1px solid #ceead6", fontWeight: 700 }}
                      />
                    )}
                  </Box>

                  <Typography variant="h3" sx={{ fontWeight: 700, mb: 1 }}>
                    {activeBrief.title}
                  </Typography>

                  <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", color: "text.secondary" }}>
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                      <Clock size={14} />
                      <Typography variant="body1">
                        {new Date(activeBrief.start).toLocaleString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </Typography>
                    </Stack>
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                      <Users size={14} />
                      <Typography variant="body1">
                        {activeBrief.participants.length} Participants
                      </Typography>
                    </Stack>
                  </Stack>
                </Box>

                {/* Sub-grid of context items */}
                <Grid container spacing={3}>
                  {/* Action Items */}
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Typography variant="h6" sx={{ mb: 1, color: "text.secondary" }}>
                      Pending Action Items
                    </Typography>
                    <Stack spacing={1} sx={{ maxHeight: 150, overflowY: "auto" }}>
                      {activeBrief.actionItems.length === 0 ? (
                        <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "#f8f9fa", borderStyle: "dashed" }}>
                          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
                            No pending actions or follow-ups.
                          </Typography>
                        </Paper>
                      ) : (
                        activeBrief.actionItems.map((item, idx) => (
                          <Paper key={idx} variant="outlined" sx={{ p: 1.5, bgcolor: "#ffffff", borderColor: "#dadce0" }}>
                            <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
                              <CheckCircle size={14} color="#1e8e3e" style={{ marginTop: 2, flexShrink: 0 }} />
                              <Box>
                                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                                  {item.description}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  Requestor: {item.from}
                                </Typography>
                              </Box>
                            </Stack>
                          </Paper>
                        ))
                      )}
                    </Stack>
                  </Grid>

                  {/* Google Drive Docs */}
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Typography variant="h6" sx={{ mb: 1, color: "text.secondary" }}>
                      Relevant Google Drive Files
                    </Typography>
                    <Stack spacing={1} sx={{ maxHeight: 150, overflowY: "auto" }}>
                      {activeBrief.relevantDocs.length === 0 ? (
                        <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "#f8f9fa", borderStyle: "dashed" }}>
                          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
                            No relevant documents identified.
                          </Typography>
                        </Paper>
                      ) : (
                        activeBrief.relevantDocs.map((doc, idx) => (
                          <Paper
                            key={idx}
                            variant="outlined"
                            component="a"
                            href={doc.link}
                            target="_blank"
                            referrerPolicy="no-referrer"
                            rel="noopener noreferrer"
                            sx={{
                              p: 1.5,
                              textDecoration: "none",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              bgcolor: "#ffffff",
                              borderColor: "#dadce0",
                              transition: "all 0.2s",
                              "&:hover": {
                                borderColor: "#1a73e8",
                                bgcolor: "#f4f8fe"
                              }
                            }}
                          >
                            <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
                              <FileText size={16} color="#1a73e8" style={{ flexShrink: 0 }} />
                              <Typography variant="body1" sx={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {doc.title}
                              </Typography>
                            </Stack>
                            <Chip
                              label={`${(doc.relevance * 100).toFixed(0)}% Match`}
                              size="small"
                              sx={{ height: 20, fontSize: "10px", bgcolor: "#e6f4ea", color: "#137333", fontWeight: 700 }}
                            />
                          </Paper>
                        ))
                      )}
                    </Stack>
                  </Grid>
                </Grid>

                {/* Email Context History */}
                <Box>
                  <Typography variant="h6" sx={{ mb: 1, color: "text.secondary" }}>
                    Gmail Sync History & Thread Context
                  </Typography>
                  <Stack spacing={1} sx={{ maxHeight: 150, overflowY: "auto" }}>
                    {activeBrief.previousContext.length === 0 ? (
                      <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "#f8f9fa", borderStyle: "dashed" }}>
                        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
                          No email synchronization records found.
                        </Typography>
                      </Paper>
                    ) : (
                      activeBrief.previousContext.map((ctx, idx) => (
                        <Paper key={idx} variant="outlined" sx={{ p: 1.5, bgcolor: "#f8f9fa", borderColor: "#dadce0" }}>
                          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
                            <Chip
                              label={ctx.source}
                              size="small"
                              sx={{
                                height: 18,
                                fontSize: "9px",
                                fontWeight: 700,
                                bgcolor: ctx.source === "email" ? "#e8f0fe" : "#f3e5f5",
                                color: ctx.source === "email" ? "#1557b0" : "#7b1fa2"
                              }}
                            />
                            <Typography variant="body2" color="text.secondary">
                              {new Date(ctx.date).toLocaleDateString()}
                            </Typography>
                          </Box>
                          <Typography variant="body1" sx={{ fontWeight: 500 }}>
                            {ctx.summary}
                          </Typography>
                        </Paper>
                      ))
                    )}
                  </Stack>
                </Box>

                {/* Vertex AI Suggested Talking Points banner */}
                <Paper sx={{ p: 2.5, bgcolor: "#fff9e6", border: "1px solid #ffe082" }}>
                  <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center", mb: 1.5, gap: 1 }}>
                    <Sparkles size={16} color="#b06000" />
                    <Typography variant="h6" sx={{ color: "#b06000", fontWeight: 700 }}>
                      Vertex AI Suggested Talking Points
                    </Typography>
                  </Box>
                  <List sx={{ p: 0, listStyleType: "disc", pl: 2 }}>
                    {activeBrief.suggestedTalkingPoints.map((pt, idx) => (
                      <ListItem key={idx} sx={{ display: "list-item", p: 0, py: 0.5 }}>
                        <ListItemText
                          primary={<Typography variant="body1" sx={{ fontWeight: 500 }}>{pt}</Typography>}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Paper>

                {/* Approve/Deliver Controls */}
                <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 2, pt: 1 }}>
                  <Button
                    variant="outlined"
                    startIcon={<Check size={16} />}
                    onClick={() => onDeliverBrief(activeBrief.meetingId, "in_app")}
                    disabled={isDeliveringBrief === activeBrief.meetingId}
                  >
                    Mark Approved
                  </Button>
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={isDeliveringBrief === activeBrief.meetingId ? <RefreshCw size={16} style={{ animation: "spin 2s linear infinite" }} /> : <Send size={16} />}
                    onClick={() => onDeliverBrief(activeBrief.meetingId, "email")}
                    disabled={isDeliveringBrief === activeBrief.meetingId}
                  >
                    Deliver Brief via Email
                  </Button>
                </Box>
              </Stack>
            ) : (
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  p: 6,
                  height: "100%",
                  minHeight: 380,
                  bgcolor: "#f8f9fa",
                  borderRadius: 4,
                  border: "1px dashed #dadce0"
                }}
              >
                <AlertCircle size={40} color="#9aa0a6" style={{ marginBottom: 12 }} />
                <Typography variant="h4" color="text.secondary" sx={{ fontWeight: 600 }}>
                  No Prep Brief Selected
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ maxW: 280, mt: 1 }}>
                  Select an upcoming meeting on the left to compile or view its pre-meeting intelligence prep brief.
                </Typography>
              </Box>
            )}
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
};
export default MeetingBriefViewer;
