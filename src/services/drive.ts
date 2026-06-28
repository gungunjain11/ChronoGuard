import { google } from "googleapis";

export class DriveService {
  private oauth2Client: any;

  constructor(oauth2Client: any) {
    this.oauth2Client = oauth2Client;
  }

  /**
   * Search Drive files shared with or related to specific emails or terms
   */
  async searchFiles(query: string, maxResults: number = 20): Promise<any[]> {
    try {
      const drive = google.drive({ version: "v3", auth: this.oauth2Client });
      const response = await drive.files.list({
        q: query,
        pageSize: maxResults,
        fields: "files(id, name, webViewLink, mimeType, modifiedTime)",
      });
      return response.data.files || [];
    } catch (error) {
      console.error("Drive Service Error searching files:", error);
      return []; // Return empty on error to gracefully degrade
    }
  }
}
