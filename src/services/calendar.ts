import { google } from "googleapis";

export class CalendarService {
  private oauth2Client: any;

  constructor(oauth2Client: any) {
    this.oauth2Client = oauth2Client;
    
    // Wire up event listener to capture automatically refreshed tokens
    if (this.oauth2Client && typeof this.oauth2Client.on === "function") {
      this.oauth2Client.on("tokens", (tokens: any) => {
        console.log("Google OAuth tokens auto-refreshed in service:", tokens);
      });
    }
  }

  /**
   * Refreshes the OAuth access token manually
   */
  async refreshTokens(): Promise<any> {
    try {
      if (this.oauth2Client && typeof this.oauth2Client.refreshAccessToken === "function") {
        const { credentials } = await this.oauth2Client.refreshAccessToken();
        return credentials;
      }
      throw new Error("OAuth2Client does not support manual refresh or is uninitialized");
    } catch (error) {
      console.error("Failed to refresh Google OAuth2 token manually:", error);
      throw error;
    }
  }

  /**
   * Fetch upcoming calendar events from Google Calendar with support for pagination
   */
  async getUpcomingEvents(maxResults: number = 30): Promise<any[]> {
    const calendar = google.calendar({ version: "v3", auth: this.oauth2Client as any });
    let events: any[] = [];
    let nextPageToken: string | undefined = undefined;

    try {
      do {
        // Fetch a page of calendar events
        const response: any = await calendar.events.list({
          calendarId: "primary",
          timeMin: new Date().toISOString(),
          singleEvents: true,
          orderBy: "startTime",
          maxResults: Math.min(maxResults - events.length, 100),
          pageToken: nextPageToken,
        });

        if (response.data && response.data.items) {
          events = events.concat(response.data.items);
        }
        
        nextPageToken = response.data.nextPageToken || undefined;
      } while (nextPageToken && events.length < maxResults);

      return events.slice(0, maxResults);
    } catch (error) {
      console.error("Google Calendar Service Error fetching events:", error);
      throw error;
    }
  }

  /**
   * Fetch calendar events within a specific time window (e.g. between now and a commitment deadline)
   */
  async getEvents(timeMin: Date, timeMax: Date): Promise<any[]> {
    const calendar = google.calendar({ version: "v3", auth: this.oauth2Client as any });
    let events: any[] = [];
    let nextPageToken: string | undefined = undefined;

    try {
      do {
        const response: any = await calendar.events.list({
          calendarId: "primary",
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          singleEvents: true,
          orderBy: "startTime",
          pageToken: nextPageToken,
        });

        if (response.data && response.data.items) {
          events = events.concat(response.data.items);
        }

        nextPageToken = response.data.nextPageToken || undefined;
      } while (nextPageToken);

      return events;
    } catch (error) {
      console.error("Google Calendar Service Error in getEvents:", error);
      return []; // Return empty on error to gracefully degrade
    }
  }

  /**
   * Create a new event on Google Calendar
   */
  async createEvent(event: any): Promise<any> {
    const calendar = google.calendar({ version: "v3", auth: this.oauth2Client as any });
    try {
      const response = await calendar.events.insert({
        calendarId: "primary",
        requestBody: event,
      });
      return response.data;
    } catch (error) {
      console.error("Google Calendar Service Error creating event:", error);
      throw error;
    }
  }

  /**
   * Fetch a single event details
   */
  async getEvent(eventId: string): Promise<any> {
    const calendar = google.calendar({ version: "v3", auth: this.oauth2Client as any });
    try {
      const response = await calendar.events.get({
        calendarId: "primary",
        eventId: eventId,
      });
      return response.data;
    } catch (error) {
      console.error(`Google Calendar Service Error fetching event ${eventId}:`, error);
      throw error;
    }
  }

  /**
   * Update an existing event on Google Calendar
   */
  async updateEvent(eventId: string, event: any): Promise<any> {
    const calendar = google.calendar({ version: "v3", auth: this.oauth2Client as any });
    try {
      const response = await calendar.events.update({
        calendarId: "primary",
        eventId: eventId,
        requestBody: event,
      });
      return response.data;
    } catch (error) {
      console.error(`Google Calendar Service Error updating event ${eventId}:`, error);
      throw error;
    }
  }
}
