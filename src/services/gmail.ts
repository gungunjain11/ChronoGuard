import { google } from "googleapis";
import { Commitment, User } from "../types";

export class GmailService {
  private oauth2Client: any;

  constructor(oauth2Client: any) {
    this.oauth2Client = oauth2Client;
  }

  /**
   * Fetches a list of message summaries matching a query
   */
  async getMessages(query: string = "after:2026/01/01", maxResults: number = 100): Promise<any[]> {
    try {
      const gmail = google.gmail({ version: "v1", auth: this.oauth2Client });
      const res = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults,
      });
      return res.data.messages || [];
    } catch (error) {
      console.error("Gmail Service Error listing messages:", error);
      throw error;
    }
  }

  /**
   * Retrieves full details for a single message
   */
  async getMessage(id: string): Promise<any> {
    try {
      const gmail = google.gmail({ version: "v1", auth: this.oauth2Client });
      const res = await gmail.users.messages.get({
        userId: "me",
        id,
        format: "full",
      });
      return res.data;
    } catch (error) {
      console.error(`Gmail Service Error fetching message ${id}:`, error);
      throw error;
    }
  }

  /**
   * Safely extracts text/plain body content of a Gmail message with base64 decoding
   */
  async getMessageBody(message: any): Promise<string> {
    if (!message || !message.payload) return "";

    const extractPart = (part: any): string => {
      // If text/plain body is available directly
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64").toString("utf-8");
      }
      
      // Recursively search child parts
      if (part.parts) {
        for (const subPart of part.parts) {
          const content = extractPart(subPart);
          if (content) return content;
        }
      }

      // Fallback: If no plain text found, check text/html
      if (part.mimeType === "text/html" && part.body?.data) {
        return Buffer.from(part.body.data, "base64").toString("utf-8");
      }

      // Ultimate fallback: direct body data
      if (part.body?.data) {
        return Buffer.from(part.body.data, "base64").toString("utf-8");
      }

      return "";
    };

    return extractPart(message.payload);
  }

  /**
   * Creates a draft email requesting a deadline extension for a commitment
   */
  async createExtensionDraft(commitment: Commitment, user: User, days: number): Promise<any> {
    try {
      const gmail = google.gmail({ version: "v1", auth: this.oauth2Client });
      
      const recipient = commitment.stakeholders && commitment.stakeholders.length > 0 
        ? commitment.stakeholders[0] 
        : "stakeholder@example.com";
      
      const subject = `Extension Request: ${commitment.title}`;
      
      // Let's draft a professional/casual/friendly email depending on communicationStyle
      const style = user.communicationStyle || 'professional';
      let salutation = "Dear Stakeholder,";
      let closing = "Best regards,";
      let bodyText = "";

      if (style === 'friendly') {
        salutation = `Hi!`;
        closing = `Warmly,\n${user.name || 'Gungun'}`;
        bodyText = `I hope you're having a great week! I'm reaching out regarding our task "${commitment.title}".\n\nTo make sure we get the absolute best quality outcome, I would like to request a brief extension of ${days} days for this deadline. That would adjust our target to ${new Date(new Date(commitment.deadline).getTime() + days * 24 * 60 * 60 * 1000).toLocaleDateString()}.\n\nLet me know if that works for you, and thank you so much for your understanding!`;
      } else if (style === 'casual') {
        salutation = `Hey,`;
        closing = `Thanks,\n${user.name || 'Gungun'}`;
        bodyText = `Hope things are going well. Just a quick heads up about "${commitment.title}".\n\nI want to make sure I deliver solid work, so I could use an extra ${days} days on the deadline. This would push it out to ${new Date(new Date(commitment.deadline).getTime() + days * 24 * 60 * 60 * 1000).toLocaleDateString()}.\n\nLet me know if that's cool with you.`;
      } else {
        // professional
        salutation = `Dear Team,`;
        closing = `Sincerely,\n${user.name || 'Gungun'}`;
        bodyText = `I am writing to formally request a brief schedule adjustment regarding our commitment "${commitment.title}".\n\nTo ensure all deliverables meet our rigorous quality standards, I would appreciate an extension of ${days} business days, moving the target deadline to ${new Date(new Date(commitment.deadline).getTime() + days * 24 * 60 * 60 * 1000).toLocaleDateString()}.\n\nPlease let me know if this adjustment is acceptable or if we should schedule a brief alignment sync.\n\nThank you for your time and continued support.`;
      }

      const emailContent = [
        `To: ${recipient}`,
        `Subject: ${subject}`,
        'Content-Type: text/plain; charset=utf-8',
        'MIME-Version: 1.0',
        '',
        `${salutation}`,
        '',
        `${bodyText}`,
        '',
        `${closing}`
      ].join('\n');

      // Base64 encode the email safely
      const base64Email = Buffer.from(emailContent)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const response = await gmail.users.drafts.create({
        userId: "me",
        requestBody: {
          message: {
            raw: base64Email,
          },
        },
      });

      return {
        id: response.data.id,
        messageId: response.data.message?.id,
      };
    } catch (error) {
      console.error("Gmail Service Error creating extension draft:", error);
      throw error;
    }
  }
}
