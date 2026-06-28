import { CalendarService } from "./calendar";
import { CalendarAnalyzer } from "./calendarAnalyzer";
import { FirestoreService } from "./firestore";
import { Commitment, FocusBlock } from "../types";
import { v4 as uuidv4 } from "uuid";

export class TimeBlocker {
  private calendarService: CalendarService;
  private calendarAnalyzer: CalendarAnalyzer;
  private firestoreService: FirestoreService;

  constructor(oauth2Client: any) {
    this.calendarService = new CalendarService(oauth2Client);
    this.calendarAnalyzer = new CalendarAnalyzer(oauth2Client);
    this.firestoreService = new FirestoreService();
  }

  /**
   * Find optimal free time blocks for a specific task
   */
  async findTimeForTask(
    task: Commitment,
    durationHours: number,
    daysToLook: number = 7
  ): Promise<Array<{ block: { start: Date; end: Date; durationHours: number }; score: number }>> {
    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + daysToLook);

    const user = await this.firestoreService.getUserById(task.userId);
    if (!user) {
      throw new Error(`User ${task.userId} not found`);
    }

    const productivityPatterns = user.productivityPatterns || await this.calendarAnalyzer.getProductivityPatterns(task.userId);

    return this.calendarAnalyzer.findOptimalTimeBlocks(
      durationHours,
      now,
      endDate,
      productivityPatterns
    );
  }

  /**
   * Create a focus block in Firestore and optionally on Google Calendar
   */
  async createFocusBlock(
    task: Commitment,
    start: Date,
    end: Date,
    createInCalendar: boolean = true
  ): Promise<FocusBlock> {
    const focusBlock: FocusBlock = {
      id: uuidv4(),
      userId: task.userId,
      commitmentId: task.id,
      start: start.toISOString(),
      end: end.toISOString(),
      title: `Focus: ${task.title}`,
      description: `Auto-created by ChronoGuard for: ${task.description}`,
      status: "scheduled",
      createdAt: new Date().toISOString(),
    };

    // Save to Firestore
    await this.firestoreService.saveFocusBlock(focusBlock);

    // Create in Google Calendar if requested
    if (createInCalendar) {
      try {
        const event = {
          summary: focusBlock.title,
          description: focusBlock.description,
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
          colorId: "5", // Yellow
          reminders: {
            useDefault: false,
            overrides: [
              { method: "popup", minutes: 30 },
              { method: "popup", minutes: 10 },
            ],
          },
        };

        const createdEvent = await this.calendarService.createEvent(event);
        focusBlock.calendarEventId = createdEvent.id;
        
        // Save focus block again with the calendar event id
        await this.firestoreService.saveFocusBlock(focusBlock);
      } catch (error) {
        console.error("Error creating Google Calendar event:", error);
        // Continue and return the focus block even if calendar sync fails
      }
    }

    return focusBlock;
  }

  /**
   * Automatically search and schedule a focus block
   */
  async findAndCreateFocusBlock(task: Commitment, daysToLook: number = 3): Promise<FocusBlock | null> {
    const options = await this.findTimeForTask(task, task.estimatedEffortHours || 1.0, daysToLook);

    if (options.length === 0) {
      throw new Error("No suitable time blocks found on calendar.");
    }

    // Use the best ranked option
    const bestOption = options[0];
    return this.createFocusBlock(
      task,
      bestOption.block.start,
      bestOption.block.end
    );
  }

  /**
   * Reschedules a meeting event on Google Calendar
   */
  async rescheduleMeeting(
    meetingId: string,
    newStart: Date,
    newEnd: Date,
    userId: string
  ): Promise<any> {
    const meeting = await this.calendarService.getEvent(meetingId);
    if (!meeting) {
      throw new Error("Meeting not found");
    }

    const updatedMeeting = {
      ...meeting,
      start: { dateTime: newStart.toISOString() },
      end: { dateTime: newEnd.toISOString() },
    };

    // Send notifications to other attendees
    if (meeting.attendees) {
      for (const attendee of meeting.attendees) {
        if (attendee.email && attendee.email !== userId) {
          await this.sendRescheduleNotification(attendee.email, meeting, updatedMeeting);
        }
      }
    }

    return this.calendarService.updateEvent(meetingId, updatedMeeting);
  }

  /**
   * Stub/mock method for sending reschedule notifications to external stakeholders
   */
  private async sendRescheduleNotification(attendeeEmail: string, oldMeeting: any, newMeeting: any): Promise<void> {
    console.log(`Reschedule notification sent to ${attendeeEmail}:`);
    console.log(`Meeting "${oldMeeting.summary || "Sync"}" has been rescheduled from ${oldMeeting.start?.dateTime} to ${newMeeting.start?.dateTime}`);
  }
}
