import React from "react";
import {
  Card,
  CardContent,
  Typography,
  Box as MuiBox,
  Chip,
  IconButton,
  Tooltip,
  LinearProgress,
  Stack as MuiStack,
  Button
} from "@mui/material";
import {
  Mail,
  Calendar,
  CheckCircle,
  AlertTriangle,
  Clock,
  Sparkles,
  Layers,
  Check,
  Play
} from "lucide-react";
import { Commitment } from "../types";

const Box = MuiBox as any;
const Stack = MuiStack as any;

interface CommitmentCardProps {
  commitment: Commitment;
  onSelect: (commitment: Commitment) => void;
  onMarkComplete?: (id: string) => void;
  onScheduleFocus?: (commitment: Commitment) => void;
  isSelected?: boolean;
}

export const CommitmentCard: React.FC<CommitmentCardProps> = ({
  commitment,
  onSelect,
  onMarkComplete,
  onScheduleFocus,
  isSelected = false
}) => {
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "critical":
        return { bg: "#fce8e6", text: "#c5221f", border: "#fad2cf" };
      case "high":
        return { bg: "#feefe3", text: "#b06000", border: "#fddcb5" };
      case "medium":
        return { bg: "#e8f0fe", text: "#1a73e8", border: "#d2e3fc" };
      case "low":
      default:
        return { bg: "#e6f4ea", text: "#137333", border: "#ceead6" };
    }
  };

  const getRiskColor = (score: number) => {
    if (score >= 75) return "#d93025"; // Red
    if (score >= 40) return "#f9ab00"; // Yellow/Amber
    return "#1e8e3e"; // Green
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case "gmail":
        return <Mail size={16} color="#db4437" />;
      case "calendar":
        return <Calendar size={16} color="#4285f4" />;
      case "tasks":
        return <CheckCircle size={16} color="#1a73e8" />;
      case "manual":
      default:
        return <Clock size={16} color="#5f6368" />;
    }
  };

  const formattedDeadline = new Date(commitment.deadline).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  const priorityStyles = getPriorityColor(commitment.priority);
  const riskColor = getRiskColor(commitment.riskScore);

  return (
    <Card
      id={`commitment-card-${commitment.id}`}
      onClick={() => onSelect(commitment)}
      sx={{
        cursor: "pointer",
        position: "relative",
        borderLeft: isSelected ? `6px solid #1a73e8` : `1px solid #dadce0`,
        backgroundColor: isSelected ? "#f4f8fe" : "#ffffff",
        transition: "all 0.2s ease-in-out",
        "&:hover": {
          borderColor: isSelected ? "#1a73e8" : "#b8bdc4",
          backgroundColor: isSelected ? "#eaf2fd" : "#fdfdfd",
          transform: "translateY(-1px)",
        },
      }}
    >
      <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
        <Stack spacing={1.5}>
          {/* Header row */}
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Tooltip title={`Source: ${commitment.source}`} arrow>
                <Box sx={{ display: "flex", alignItems: "center" }}>
                  {getSourceIcon(commitment.source)}
                </Box>
              </Tooltip>
              <Chip
                label={commitment.priority}
                size="small"
                sx={{
                  backgroundColor: priorityStyles.bg,
                  color: priorityStyles.text,
                  border: `1px solid ${priorityStyles.border}`,
                  fontSize: "10px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  height: 20,
                }}
              />
              {commitment.category && (
                <Chip
                  label={commitment.category}
                  size="small"
                  variant="outlined"
                  sx={{
                    fontSize: "10px",
                    height: 20,
                    borderColor: "#dadce0",
                    color: "#5f6368",
                  }}
                />
              )}
            </Stack>

            {/* Risk Score Pill */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                Risk:
              </Typography>
              <Box
                sx={{
                  bgcolor: `${riskColor}15`,
                  color: riskColor,
                  fontWeight: 700,
                  fontSize: "0.75rem",
                  px: 1,
                  py: 0.25,
                  borderRadius: 4,
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                {commitment.riskScore}%
              </Box>
            </Box>
          </Box>

          {/* Title and Description */}
          <Box>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 600,
                color: commitment.status === "completed" ? "text.disabled" : "text.primary",
                textDecoration: commitment.status === "completed" ? "line-through" : "none",
                display: "-webkit-box",
                WebkitLineClamp: 1,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                mb: 0.5,
              }}
            >
              {commitment.title}
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                minHeight: 34,
              }}
            >
              {commitment.description || "No description provided."}
            </Typography>
          </Box>

          {/* Risk factors progress */}
          <Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                Deadline Threat Assessment
              </Typography>
              <Typography variant="caption" color={riskColor} sx={{ fontWeight: 700 }}>
                {commitment.riskScore >= 75 ? "Critical Risk" : commitment.riskScore >= 40 ? "Medium Risk" : "On Track"}
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={commitment.riskScore}
              sx={{
                height: 6,
                borderRadius: 3,
                backgroundColor: "#e8eaed",
                "& .MuiLinearProgress-bar": {
                  backgroundColor: riskColor,
                  borderRadius: 3,
                },
              }}
            />
          </Box>

          {/* Footer controls */}
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", pt: 0.5 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, color: "text.secondary" }}>
              <Clock size={14} />
              <Typography variant="caption" sx={{ fontWeight: 500 }}>
                {formattedDeadline}
              </Typography>
            </Box>

            <Box sx={{ display: "flex", gap: 1 }}>
              {onScheduleFocus && commitment.status !== "completed" && (
                <Tooltip title="Block Focus Hour" arrow>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onScheduleFocus(commitment);
                    }}
                    sx={{
                      color: "#1a73e8",
                      bgcolor: "#e8f0fe",
                      "&:hover": { bgcolor: "#d2e3fc" },
                    }}
                  >
                    <Play size={14} />
                  </IconButton>
                </Tooltip>
              )}
              {onMarkComplete && commitment.status !== "completed" && (
                <Tooltip title="Mark Completed" arrow>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMarkComplete(commitment.id);
                    }}
                    sx={{
                      color: "#1e8e3e",
                      bgcolor: "#e6f4ea",
                      "&:hover": { bgcolor: "#ceead6" },
                    }}
                  >
                    <Check size={14} />
                  </IconButton>
                </Tooltip>
              )}
              {commitment.status === "completed" && (
                <Chip
                  icon={<Check size={12} color="#1e8e3e" style={{ marginLeft: 4 }} />}
                  label="Completed"
                  size="small"
                  sx={{
                    bgcolor: "#e6f4ea",
                    color: "#137333",
                    height: 24,
                    fontSize: "11px",
                    fontWeight: 600,
                  }}
                />
              )}
            </Box>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
};

export default CommitmentCard;
