import React, { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  IconButton,
  Button,
  Box as MuiBox,
  CircularProgress,
  TextField,
  Fab,
  Tooltip,
  Fade,
  Stack as MuiStack,
  Card
} from "@mui/material";
import {
  Mic,
  MicOff,
  X,
  Volume2,
  VolumeX,
  Send,
  Sparkles,
  RefreshCw,
  Clock,
  ArrowRight
} from "lucide-react";
import { voiceService } from "../services/voiceService";
import { Commitment, MeetingBrief } from "../types";

const Box = MuiBox as any;
const Stack = MuiStack as any;

interface VoiceCommandProps {
  commitments: Commitment[];
  briefs: MeetingBrief[];
  upcomingMeetings: any[];
  onCommandExecuted?: (actionType: string, actionData?: any) => void;
}

export const VoiceCommand: React.FC<VoiceCommandProps> = ({
  commitments,
  briefs,
  upcomingMeetings,
  onCommandExecuted
}) => {
  const [open, setOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [textInput, setTextInput] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSpeechSupported(voiceService.isSupported());
  }, []);

  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [transcript, aiResponse]);

  const handleOpen = () => {
    setOpen(true);
    setTranscript("");
    setAiResponse("");
    setStatusMessage("");
    // Start listening automatically on open
    if (speechSupported) {
      startListeningChannel();
    } else {
      setStatusMessage("Speech recognition is not supported in this browser. Please use text commands instead.");
    }
  };

  const handleClose = () => {
    stopListeningChannel();
    voiceService.cancelSpeech();
    setIsSpeaking(false);
    setOpen(false);
  };

  const startListeningChannel = () => {
    setIsListening(true);
    setTranscript("");
    setStatusMessage("Listening for voice commands...");
    
    const success = voiceService.startListening(
      (text) => {
        setTranscript(text);
        processCommand(text);
      },
      (err) => {
        console.error("Speech error:", err);
        setIsListening(false);
        setStatusMessage("Error parsing voice. Let's try again.");
      },
      () => {
        setIsListening(false);
      }
    );

    if (!success) {
      setIsListening(false);
      setStatusMessage("Could not start microphone. Check permissions.");
    }
  };

  const stopListeningChannel = () => {
    voiceService.stopListening();
    setIsListening(false);
  };

  const processCommand = async (commandText: string) => {
    setStatusMessage("ChronoGuard is thinking...");
    stopListeningChannel();

    try {
      const result = await voiceService.processCommand(commandText, {
        commitments,
        briefs,
        upcomingMeetings
      });

      setAiResponse(result.response);
      setStatusMessage("Completed.");

      if (soundEnabled) {
        setIsSpeaking(true);
        voiceService.speak(
          result.response,
          () => setIsSpeaking(true),
          () => setIsSpeaking(false)
        );
      }

      if (result.action && onCommandExecuted) {
        onCommandExecuted(result.action.type, result.action.id || result.action.data);
      }
    } catch (err) {
      console.error(err);
      setAiResponse("I had difficulty executing that command. Please try again.");
      setStatusMessage("Error executing command.");
    }
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;

    const command = textInput;
    setTextInput("");
    setTranscript(command);
    processCommand(command);
  };

  return (
    <>
      {/* Floating Action Button */}
      <Tooltip title="ChronoGuard Voice Assistant" placement="left" arrow>
        <Fab
          color="primary"
          aria-label="voice-command"
          onClick={handleOpen}
          sx={{
            position: "fixed",
            bottom: 24,
            right: 24,
            boxShadow: "0px 4px 10px rgba(26, 115, 232, 0.4)",
            zIndex: 1100,
            transition: "all 0.2s ease-in-out",
            "&:hover": {
              transform: "scale(1.05)",
            }
          }}
        >
          <Mic size={24} />
        </Fab>
      </Tooltip>

      {/* Voice Assistant Dialogue */}
      <Dialog
        open={open}
        onClose={handleClose}
        fullWidth
        maxWidth="xs"
        sx={{
          "& .MuiDialog-paper": {
            border: "1px solid #dadce0",
            boxShadow: "0px 10px 30px rgba(0,0,0,0.15)",
          }
        }}
      >
        <DialogTitle sx={{ p: 2, display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #dadce0" }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Sparkles size={18} color="#1a73e8" />
            <Typography variant="h5" sx={{ fontWeight: 600 }}>ChronoGuard Assistant</Typography>
          </Stack>
          <Box>
            <IconButton
              size="small"
              onClick={() => setSoundEnabled(!soundEnabled)}
              sx={{ mr: 1 }}
              color={soundEnabled ? "primary" : "default"}
            >
              {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </IconButton>
            <IconButton size="small" onClick={handleClose}>
              <X size={18} />
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent sx={{ p: 3, minHeight: 280, bgcolor: "#f8f9fa" }}>
          <Stack spacing={3} sx={{ height: "100%", justifyContent: "space-between" }}>
            
            {/* Visual Listening/Status Circle */}
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pt: 2 }}>
              <Box
                sx={{
                  position: "relative",
                  width: 80,
                  height: 80,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: isListening ? "radial-gradient(circle, rgba(26,115,232,0.15) 0%, rgba(26,115,232,0.02) 70%)" : "#f1f3f4",
                  border: isListening ? "2px solid #1a73e8" : "1px solid #dadce0",
                  transition: "all 0.3s ease",
                  cursor: isListening ? "pointer" : "default"
                }}
                onClick={isListening ? stopListeningChannel : startListeningChannel}
              >
                {isListening ? (
                  <CircularProgress
                    size={78}
                    thickness={2}
                    sx={{
                      position: "absolute",
                      color: "#1a73e8",
                    }}
                  />
                ) : null}
                
                <IconButton
                  sx={{
                    color: isListening ? "#1a73e8" : "#5f6368",
                    animation: isListening || isSpeaking ? "pulse 1.5s infinite" : "none",
                    "@keyframes pulse": {
                      "0%": { transform: "scale(1)" },
                      "50%": { transform: "scale(1.1)" },
                      "100%": { transform: "scale(1)" }
                    }
                  }}
                  disabled={!speechSupported}
                >
                  {isListening ? <Mic size={32} /> : <MicOff size={32} />}
                </IconButton>
              </Box>
              <Typography variant="body2" sx={{ mt: 1.5, fontWeight: 600, color: isListening ? "primary.main" : "text.secondary" }}>
                {statusMessage}
              </Typography>
            </Box>

            {/* Transcription & Reply display */}
            <Stack spacing={2}>
              {transcript && (
                <Card variant="outlined" sx={{ p: 1.5, bgcolor: "#ffffff" }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    You said:
                  </Typography>
                  <Typography variant="body1" sx={{ fontStyle: "italic", mt: 0.5 }}>
                    "{transcript}"
                  </Typography>
                </Card>
              )}

              {aiResponse && (
                <Card
                  variant="outlined"
                  sx={{
                    p: 1.5,
                    bgcolor: "#e8f0fe",
                    borderColor: "#d2e3fc"
                  }}
                >
                  <Typography variant="caption" color="#1557b0" sx={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 0.5 }}>
                    <Sparkles size={12} />
                    ChronoGuard:
                  </Typography>
                  <Typography variant="body1" sx={{ color: "#1557b0", fontWeight: 500, mt: 0.5 }}>
                    {aiResponse}
                  </Typography>
                </Card>
              )}
            </Stack>

            <div ref={transcriptEndRef} />
          </Stack>
        </DialogContent>

        <DialogActions sx={{ p: 2, borderTop: "1px solid #dadce0" }}>
          {/* Text-input fallback */}
          <Box component="form" onSubmit={handleTextSubmit} sx={{ display: "flex", width: "100%", gap: 1 }}>
            <TextField
              size="small"
              placeholder="Try Text instead (e.g., 'What is my highest risk?')"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              fullWidth
              sx={{
                "& .MuiOutlinedInput-root": {
                  borderRadius: 20,
                  bgcolor: "#f1f3f4",
                  "& fieldset": { borderColor: "transparent" },
                  "&:hover fieldset": { borderColor: "#dadce0" },
                  "&.Mui-focused fieldset": { borderColor: "#1a73e8" },
                }
              }}
            />
            <IconButton type="submit" color="primary" disabled={!textInput.trim()}>
              <Send size={18} />
            </IconButton>
          </Box>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default VoiceCommand;
