import { TimeBlocker } from "./timeBlocker";
import { TaskBreakdownService } from "./taskBreakdown";
import { GmailService } from "./gmail";
import { FirestoreService } from "./firestore";
import { CalendarService } from "./calendar";
import { Commitment } from "../types";

export class AutonomousActionsService {
  private oauth2Client: any;
  private userId: string;

  constructor(oauth2Client: any, userId: string) {
    this.oauth2Client = oauth2Client;
    this.userId = userId;
  }

  /**
   * Suggest actionable remedies for a commitment based on risks
   */
  async suggestActions(commitmentId: string): Promise<Array<{ action: string; description: string; impact: string }>> {
    const firestoreService = new FirestoreService();
    const commitment = await firestoreService.getCommitment(commitmentId);

    if (!commitment) {
      throw new Error("Commitment not found");
    }

    const actions: Array<{ action: string; description: string; impact: string }> = [];

    // Action 1: Find time in calendar (always useful for pending/in-progress)
    if (commitment.status === "pending" || commitment.status === "in_progress") {
      actions.push({
        action: "find_time",
        description: `Find ${commitment.estimatedEffortHours} hours in your calendar`,
        impact: "High - Will automatically schedule a dedicated focus block"
      });
    }

    // Action 2: Break down task (if estimated effort is > 2 hours)
    if (commitment.estimatedEffortHours > 2) {
      actions.push({
        action: "break_down",
        description: "Break this high-effort task into smaller subtasks",
        impact: "Medium - Makes the task structure manageable"
      });
    }

    // Action 3: Request extension (if risk score is critical and stakeholders exist)
    if (commitment.riskScore > 75 && commitment.stakeholders && commitment.stakeholders.length > 0) {
      actions.push({
        action: "request_extension",
        description: "Draft an extension request email to stakeholders",
        impact: "High - Relieves immediate delivery pressure"
      });
    }

    // Action 4: Reschedule conflicting meetings
    try {
      const conflictingMeetings = await this.findConflictingMeetings(commitment);
      if (conflictingMeetings && conflictingMeetings.length > 0) {
        actions.push({
          action: "reschedule_conflicts",
          description: `Reschedule ${conflictingMeetings.length} conflicting meeting(s)`,
          impact: "High - Frees up blocked slots on your calendar"
        });
      }
    } catch (err) {
      console.error("Error evaluating conflicting meetings for suggestion:", err);
    }

    return actions;
  }

  /**
   * Executes a suggested proactive action
   */
  async executeAction(
    commitmentId: string,
    action: string,
    options?: any
  ): Promise<any> {
    const firestoreService = new FirestoreService();
    const commitment = await firestoreService.getCommitment(commitmentId);

    if (!commitment) {
      throw new Error("Commitment not found");
    }

    switch (action) {
      case "find_time":
        return this.findTime(commitment);
      case "break_down":
        return this.breakDown(commitment);
      case "request_extension":
        return this.requestExtension(commitment, options?.days || 2);
      case "reschedule_conflicts":
        return this.rescheduleConflicts(commitment);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  /**
   * Action executor: Find and schedule a focus block
   */
  private async findTime(commitment: Commitment): Promise<any> {
    const timeBlocker = new TimeBlocker(this.oauth2Client);
    try {
      const focusBlock = await timeBlocker.findAndCreateFocusBlock(commitment, 7);
      return {
        success: true,
        focusBlock,
        message: `Successfully scheduled dedicated focus block: "${focusBlock.title}" starting ${new Date(focusBlock.start).toLocaleString()}`
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: `Failed to find suitable time block for: "${commitment.title}"`
      };
    }
  }

  /**
   * Action executor: Break down high-level task using AI
   */
  private async breakDown(commitment: Commitment): Promise<any> {
    const taskBreakdownService = new TaskBreakdownService();
    try {
      const updatedCommitment = await taskBreakdownService.breakdownTask(commitment.id, this.userId);
      await taskBreakdownService.createSubtasksFromBreakdown(commitment.id, this.userId);
      return {
        success: true,
        commitment: updatedCommitment,
        message: `Successfully broke task down into ${updatedCommitment.subtasks?.length || 0} subtasks and added them to your dashboard.`
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: `Failed to execute task breakdown for: "${commitment.title}"`
      };
    }
  }

  /**
   * Action executor: Draft an extension email in Gmail
   */
  private async requestExtension(commitment: Commitment, days: number): Promise<any> {
    if (!commitment.stakeholders || commitment.stakeholders.length === 0) {
      return {
        success: false,
        error: "No stakeholders configured on this commitment.",
        message: "No stakeholders found to request an extension from."
      };
    }

    const firestoreService = new FirestoreService();
    const user = await firestoreService.getUserById(this.userId);
    if (!user) {
      throw new Error("User profile not found");
    }

    const gmailService = new GmailService(this.oauth2Client);
    try {
      const draft = await gmailService.createExtensionDraft(commitment, user, days);
      return {
        success: true,
        draftId: draft.id,
        message: `Created draft extension request for: "${commitment.title}". You can review it in your drafts.`,
        draftUrl: `https://mail.google.com/mail/u/0/#drafts/${draft.id}`
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        message: "Failed to create email draft in your Gmail account."
      };
    }
  }

  /**
   * Action executor: Automatically reschedule conflicting meetings
   */
  private async rescheduleConflicts(commitment: Commitment): Promise<any> {
    const conflictingMeetings = await this.findConflictingMeetings(commitment);
    if (conflictingMeetings.length === 0) {
      return {
        success: false,
        message: "No overlapping meeting conflicts detected on your calendar."
      };
    }

    const timeBlocker = new TimeBlocker(this.oauth2Client);
    const rescheduled: any[] = [];
    const failed: any[] = [];

    for (const meeting of conflictingMeetings) {
      try {
        const meetingDurationHours = meeting.end?.dateTime && meeting.start?.dateTime
          ? (new Date(meeting.end.dateTime).getTime() - new Date(meeting.start.dateTime).getTime()) / (1000 * 60 * 60)
          : 1.0;

        // Find standard free slot of similar duration in next 7 days
        const dummyCommitment: any = {
          id: uuidv4Dummy(),
          userId: this.userId,
          title: `Rescheduled: ${meeting.summary || "Sync"}`,
          description: meeting.description || "",
          estimatedEffortHours: meetingDurationHours
        };

        const options = await timeBlocker.findTimeForTask(dummyCommitment, meetingDurationHours, 7);

        if (options && options.length > 0) {
          const newTime = options[0].block;
          const rescheduledMeeting = await timeBlocker.rescheduleMeeting(
            meeting.id,
            newTime.start,
            newTime.end,
            this.userId
          );
          rescheduled.push(rescheduledMeeting);
        } else {
          failed.push({ meeting, reason: "No alternative free slots available." });
        }
      } catch (error: any) {
        failed.push({ meeting, reason: error.message });
      }
    }

    return {
      success: rescheduled.length > 0,
      rescheduled,
      failed,
      message: `Rescheduled ${rescheduled.length} conflicting meeting(s). ${failed.length} conflicts could not be resolved automatically.`
    };
  }

  /**
   * Utility to find calendar meetings that overlap with our commitment timeframe
   */
  private async findConflictingMeetings(commitment: Commitment): Promise<any[]> {
    const calendarService = new CalendarService(this.oauth2Client);
    const now = new Date();
    const deadline = new Date(commitment.deadline);

    const events = await calendarService.getEvents(now, deadline);

    return events.filter(event => {
      // Filter out all-day events or cancelled events
      if (!event.start?.dateTime || !event.end?.dateTime) return false;
      if (event.status === "cancelled") return false;

      const eventStart = new Date(event.start.dateTime);
      const eventEnd = new Date(event.end.dateTime);
      
      const commitmentStart = new Date(commitment.start || now.toISOString());
      const commitmentDeadline = new Date(commitment.deadline);

      // Overlap calculation
      return !(
        eventEnd <= commitmentStart ||
        eventStart >= commitmentDeadline
      );
    });
  }
}

// Simple deterministic UUID helper for dummy commitment ID
function uuidv4Dummy(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
