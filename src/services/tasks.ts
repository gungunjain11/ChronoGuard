import { google } from "googleapis";

export class TasksService {
  private oauth2Client: any;

  constructor(oauth2Client: any) {
    this.oauth2Client = oauth2Client;
  }

  /**
   * Fetches all task lists for the authenticated user
   */
  async getTaskLists(maxResults: number = 20): Promise<any[]> {
    try {
      const tasksApi = google.tasks({ version: "v1", auth: this.oauth2Client });
      const res = await tasksApi.tasklists.list({ maxResults });
      return res.data.items || [];
    } catch (error) {
      console.error("Tasks Service Error listing task lists:", error);
      throw error;
    }
  }

  /**
   * Fetches tasks from a specific task list
   */
  async getTasks(tasklistId: string = "@default", maxResults: number = 100): Promise<any[]> {
    try {
      const tasksApi = google.tasks({ version: "v1", auth: this.oauth2Client });
      const res = await tasksApi.tasks.list({
        tasklist: tasklistId,
        maxResults,
        showCompleted: true,
        showHidden: true,
      });
      return res.data.items || [];
    } catch (error) {
      console.error(`Tasks Service Error listing tasks for list ${tasklistId}:`, error);
      throw error;
    }
  }

  /**
   * Fetches all tasks across all of the user's task lists
   */
  async getAllTasks(maxResultsPerList: number = 50): Promise<any[]> {
    try {
      const lists = await this.getTaskLists();
      let allTasks: any[] = [];

      for (const list of lists) {
        if (list.id) {
          const tasks = await this.getTasks(list.id, maxResultsPerList);
          // Attach list meta to the tasks for context
          const tasksWithMeta = tasks.map((t: any) => ({
            ...t,
            tasklistId: list.id,
            tasklistTitle: list.title,
          }));
          allTasks = allTasks.concat(tasksWithMeta);
        }
      }

      // If no custom lists were found or fetched, fall back to default list
      if (allTasks.length === 0) {
        const defaultTasks = await this.getTasks("@default", maxResultsPerList);
        return defaultTasks.map((t: any) => ({
          ...t,
          tasklistId: "@default",
          tasklistTitle: "Default List",
        }));
      }

      return allTasks;
    } catch (error) {
      console.error("Tasks Service Error fetching all tasks:", error);
      // Fallback to default tasks list on failure to query lists
      try {
        const defaultTasks = await this.getTasks("@default", maxResultsPerList);
        return defaultTasks.map((t: any) => ({
          ...t,
          tasklistId: "@default",
          tasklistTitle: "Default List",
        }));
      } catch (innerErr) {
        console.error("Tasks Service Fallback failed:", innerErr);
        throw error;
      }
    }
  }
}
