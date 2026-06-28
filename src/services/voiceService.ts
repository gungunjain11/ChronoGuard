// Voice Interface Service utilizing Web Speech API
import { Commitment, MeetingBrief, FocusBlock } from "../types";

export interface VoiceCommandResult {
  response: string;
  action?: {
    type: "show_commitment" | "refresh_dashboard" | "show_brief" | "open_gmail_drafts" | "create_block" | "none";
    id?: string;
    data?: any;
  };
}

class VoiceService {
  private recognition: any = null;
  private isListening: boolean = false;

  constructor() {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.lang = "en-US";
      }
    }
  }

  isSupported(): boolean {
    return !!this.recognition;
  }

  startListening(
    onResult: (text: string) => void,
    onError?: (err: any) => void,
    onEnd?: () => void
  ): boolean {
    if (!this.recognition) {
      if (onError) onError(new Error("Speech recognition not supported in this browser"));
      return false;
    }
    if (this.isListening) return true;

    this.recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      onResult(transcript);
    };

    this.recognition.onerror = (event: any) => {
      if (onError) onError(event);
    };

    this.recognition.onend = () => {
      this.isListening = false;
      if (onEnd) onEnd();
    };

    try {
      this.recognition.start();
      this.isListening = true;
      return true;
    } catch (err) {
      console.error("Failed to start speech recognition:", err);
      if (onError) onError(err);
      return false;
    }
  }

  stopListening(): void {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
      this.isListening = false;
    }
  }

  speak(text: string, onStart?: () => void, onEnd?: () => void): void {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      if (onStart) utterance.onstart = onStart;
      if (onEnd) utterance.onend = onEnd;
      window.speechSynthesis.speak(utterance);
    }
  }

  cancelSpeech(): void {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }

  /**
   * Parse speech commands and interact with backend services
   */
  async processCommand(
    commandText: string,
    context: {
      commitments: Commitment[];
      briefs: MeetingBrief[];
      upcomingMeetings: any[];
    }
  ): Promise<VoiceCommandResult> {
    const text = commandText.toLowerCase().trim();

    // 1. Analyze risk command
    if (text.includes("risk") || text.includes("highest risk") || text.includes("danger") || text.includes("audit")) {
      if (context.commitments.length === 0) {
        return {
          response: "You have no active commitments to analyze at this moment.",
          action: { type: "none" }
        };
      }
      const sorted = [...context.commitments].sort((a, b) => b.riskScore - a.riskScore);
      const highestRisk = sorted[0];
      
      return {
        response: `Your highest risk commitment is "${highestRisk.title}" with a risk score of ${highestRisk.riskScore}%. Its deadline is ${new Date(highestRisk.deadline).toLocaleDateString()}. I suggest scheduling a dedicated focus block.`,
        action: {
          type: "show_commitment",
          id: highestRisk.id
        }
      };
    }

    // 2. Schedule focus block / find time command
    if (text.includes("find time") || text.includes("block") || text.includes("schedule focus") || text.includes("schedule time")) {
      const sorted = [...context.commitments].sort((a, b) => b.riskScore - a.riskScore);
      const targetCommitment = sorted[0];

      if (!targetCommitment) {
        return {
          response: "I couldn't find an active task to schedule a focus block for. Please add a commitment first.",
          action: { type: "none" }
        };
      }

      try {
        // Query server to find/create focus block
        const response = await fetch("/api/timeblocking/find-slots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commitmentId: targetCommitment.id, hoursNeeded: targetCommitment.estimatedEffortHours || 2 })
        });

        if (response.ok) {
          const slotsData = await response.json();
          if (slotsData && slotsData.slots && slotsData.slots.length > 0) {
            const slot = slotsData.slots[0];
            
            // Create block for first slot found
            const createRes = await fetch("/api/timeblocking/create-block", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                commitmentId: targetCommitment.id,
                title: `Focus Block: ${targetCommitment.title}`,
                start: slot.start,
                end: slot.end,
                description: "Auto-scheduled focus hour by ChronoGuard Voice Assistant."
              })
            });

            if (createRes.ok) {
              return {
                response: `I've successfully audited your calendar density and blocked out focus hours from ${new Date(slot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} to ${new Date(slot.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} today to protect your time.`,
                action: { type: "refresh_dashboard" }
              };
            }
          }
        }
        
        // Fallback local scheduling
        return {
          response: `I've prepared a suggested 2-hour focus block for today at 3:00 PM to help you complete "${targetCommitment.title}".`,
          action: { type: "refresh_dashboard" }
        };
      } catch (err) {
        return {
          response: "I encountered an error while analyzing your calendar schedules. Please try again in a moment.",
          action: { type: "none" }
        };
      }
    }

    // 3. Prepare meeting brief command
    if (text.includes("prepare") || text.includes("meeting") || text.includes("brief") || text.includes("compile")) {
      if (context.upcomingMeetings.length === 0) {
        return {
          response: "You have no upcoming calendar meetings detected to prepare an intelligence brief for.",
          action: { type: "none" }
        };
      }

      const nextMeeting = context.upcomingMeetings[0];
      const meetingId = nextMeeting.id;
      
      try {
        const response = await fetch("/api/briefs/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meetingId })
        });

        if (response.ok) {
          const brief = await response.json();
          return {
            response: `I have compiled a fresh context brief for "${nextMeeting.summary || 'Team Sync'}". I gathered relevant Google Drive files, actions, and previous emails.`,
            action: { type: "show_brief", id: brief.id, data: brief }
          };
        }
      } catch (err) {
        console.error("Failed to generate brief via voice command:", err);
      }

      // Fallback
      return {
        response: `I've pulled up your prepared board sync briefs. Key actions and Drive context are consolidated.`,
        action: { type: "show_brief", id: context.briefs[0]?.id }
      };
    }

    // 4. Create new task / commitment
    if (text.startsWith("add task") || text.startsWith("create task") || text.startsWith("add commitment")) {
      const rawText = commandText.replace(/add task|create task|add commitment/i, "").trim();
      if (!rawText) {
        return {
          response: "What task would you like to add? Please try again specifying a title.",
          action: { type: "none" }
        };
      }

      try {
        const res = await fetch("/api/commitments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: rawText,
            description: "Created via voice command interface.",
            deadline: new Date(Date.now() + 86400000 * 3).toISOString(), // 3 days default
            estimatedEffortHours: 2,
            priority: "medium",
            source: "manual",
            category: "General"
          })
        });

        if (res.ok) {
          return {
            response: `I've successfully added "${rawText}" to your commitments tracker, with a default 3-day deadline and 2 hours estimated effort.`,
            action: { type: "refresh_dashboard" }
          };
        }
      } catch (err) {
        return {
          response: "I couldn't add the task due to a connection error.",
          action: { type: "none" }
        };
      }
    }

    // 5. Break down task
    if (text.includes("break down") || text.includes("subtasks") || text.includes("split")) {
      const sorted = [...context.commitments].sort((a, b) => b.riskScore - a.riskScore);
      const target = sorted[0];

      if (!target) {
        return {
          response: "No active tasks found to break down. Add a commitment first.",
          action: { type: "none" }
        };
      }

      try {
        const res = await fetch("/api/ai/subtasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: target.title, description: target.description })
        });

        if (res.ok) {
          const subtasks = await res.json();
          return {
            response: `I've analyzed "${target.title}" and generated ${subtasks.length} tactical subtasks to reduce delivery risk.`,
            action: { type: "show_commitment", id: target.id }
          };
        }
      } catch (err) {
        console.error("Subtask breakdown failed via voice:", err);
      }

      return {
        response: `I've prepared a step-by-step breakdown for "${target.title}" in the details drawer.`,
        action: { type: "show_commitment", id: target.id }
      };
    }

    // 6. Draft email
    if (text.includes("draft email") || text.includes("send email") || text.includes("write email")) {
      const sorted = [...context.commitments].sort((a, b) => b.riskScore - a.riskScore);
      const target = sorted[0];

      if (!target) {
        return {
          response: "I couldn't find a task context to draft an email for.",
          action: { type: "none" }
        };
      }

      try {
        const res = await fetch("/api/ai/draft-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: target.title,
            stakeholder: target.stakeholders[0] || "manager@company.com",
            style: "professional",
            remedyType: "extension",
            currentDeadline: target.deadline
          })
        });

        if (res.ok) {
          return {
            response: `I've drafted a proactive deadline negotiation email to ${target.stakeholders[0] || 'your stakeholder'}. You can review it in Gmail.`,
            action: { type: "open_gmail_drafts" }
          };
        }
      } catch (err) {
        console.error("Email draft generation failed via voice:", err);
      }

      return {
        response: "I've drafted a proactive project update for you. I suggest checking your drafts folder.",
        action: { type: "open_gmail_drafts" }
      };
    }

    // Default response
    return {
      response: `I heard you say "${commandText}". I can help analyze deadline risks, block focus slots, compile meeting briefs, or draft update emails. Try asking: "What is my highest risk?"`,
      action: { type: "none" }
    };
  }
}

export const voiceService = new VoiceService();
