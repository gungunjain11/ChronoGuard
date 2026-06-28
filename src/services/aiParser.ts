import { GoogleGenAI, Type } from "@google/genai";

export interface ExtractedCommitment {
  title: string;
  description: string;
  deadline: string; // ISO 8601 format or empty if none
  priority: "low" | "medium" | "high" | "critical";
  estimatedHours: number;
  category: string;
  stakeholders: string[];
}

export class AIParser {
  private ai: GoogleGenAI | null = null;
  private modelName = "gemini-3.5-flash";

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    } else {
      console.warn("GEMINI_API_KEY is not defined. AIParser will run in offline heuristic mode.");
    }
  }

  /**
   * Estimates effort hours for a task based on its title and description
   */
  async estimateTaskEffort(title: string, description: string): Promise<number> {
    if (!this.ai) {
      return this.heuristicEstimateEffort(title, description);
    }

    const prompt = `You are a productivity expert. Estimate the active effort in hours needed to complete the following task.
Return ONLY a number (e.g., 2.5, 1, 0.5). Do not include any text.

TASK TITLE: ${title}
TASK DESCRIPTION: ${description}

Return ONLY a number (e.g., 2.5, 1, 0.5). Do not include any text.`;

    try {
      const response = await this.ai.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: {
          temperature: 0.1,
        },
      });

      const responseText = response.text || "";
      const hours = parseFloat(responseText.trim());
      if (isNaN(hours)) {
        return this.heuristicEstimateEffort(title, description);
      }
      return Math.max(0.25, Math.min(24, hours)); // Clamp between 0.25 and 24 hours
    } catch (error) {
      console.error("AI estimation error, falling back to heuristics:", error);
      return this.heuristicEstimateEffort(title, description);
    }
  }

  /**
   * Intelligently extracts commitments (action items, deadlines, stakeholders) from email text
   */
  async extractCommitmentsFromEmail(body: string, metadata: { from: string; to: string; subject: string; date: string }): Promise<ExtractedCommitment[]> {
    if (!this.ai) {
      return this.heuristicExtractFromEmail(body, metadata);
    }

    const systemInstruction = `You are an AI assistant designed to read emails and extract action items, deadlines, and commitments. 
Analyze the email content and metadata to find explicit or implicit agreements, tasks to do, deliverables requested, or scheduled meetings.
For each action item found, extract details structured precisely as defined in the response schema. 
If no tasks with deadlines or commitments are found in the email, return an empty array: []`;

    const prompt = `EMAIL METADATA:
- From: ${metadata.from}
- To: ${metadata.to}
- Subject: ${metadata.subject}
- Date Sent: ${metadata.date} (Use this as reference for relative dates like "tomorrow" or "next Friday")

EMAIL BODY:
${body}

Extract all commitments and action items. Ensure dates are parsed into ISO 8601 string format relative to the Date Sent if specified.`;

    try {
      const response = await this.ai.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            description: "List of commitments extracted from the email.",
            items: {
              type: Type.OBJECT,
              properties: {
                title: {
                  type: Type.STRING,
                  description: "A short, actionable title for the commitment (e.g., 'Submit project draft').",
                },
                description: {
                  type: Type.STRING,
                  description: "Contextual description of the task, why it is requested, or details of the assignment.",
                },
                deadline: {
                  type: Type.STRING,
                  description: "The calculated target deadline date-time in ISO 8601 format. If none is stated or inferred, use an estimated date 3 days from the email date.",
                },
                priority: {
                  type: Type.STRING,
                  enum: ["low", "medium", "high", "critical"],
                  description: "The priority of the task: critical (needs immediate action/blocker), high, medium, or low.",
                },
                estimatedHours: {
                  type: Type.NUMBER,
                  description: "An estimated active effort in hours required to finish this task (default 1.0).",
                },
                category: {
                  type: Type.STRING,
                  description: "A category label for organizing (e.g. 'Client Deliverable', 'Internal Sync', 'Action Required').",
                },
                stakeholders: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "Email addresses of people involved or requesting the task.",
                },
              },
              required: ["title", "description", "deadline", "priority", "estimatedHours", "category", "stakeholders"],
            },
          },
        },
      });

      const responseText = response.text || "[]";
      return JSON.parse(responseText.trim());
    } catch (error) {
      console.error("AI Email extraction failed, falling back to heuristics:", error);
      return this.heuristicExtractFromEmail(body, metadata);
    }
  }

  /**
   * Offline heuristic effort estimator
   */
  private heuristicEstimateEffort(title: string, description: string): number {
    const text = `${title} ${description}`.toLowerCase();
    let hours = 1.0; // default

    if (text.includes("workshop") || text.includes("review") || text.includes("presentation")) {
      hours = 2.0;
    } else if (text.includes("quick") || text.includes("sync") || text.includes("standup") || text.includes("update")) {
      hours = 0.5;
    } else if (text.includes("deployment") || text.includes("migration") || text.includes("audit")) {
      hours = 4.0;
    } else if (text.includes("sprint") || text.includes("roadmap") || text.includes("planning")) {
      hours = 3.0;
    }

    return hours;
  }

  /**
   * Offline heuristic extraction from emails
   */
  private heuristicExtractFromEmail(body: string, metadata: { from: string; to: string; subject: string; date: string }): ExtractedCommitment[] {
    const text = body.toLowerCase();
    const commitments: ExtractedCommitment[] = [];

    // Basic heuristic to detect action-oriented emails
    const actionKeywords = ["due", "action required", "please submit", "deadline", "todo", "need your", "important request"];
    const hasAction = actionKeywords.some((kw) => text.includes(kw)) || metadata.subject.toLowerCase().includes("urgent") || metadata.subject.toLowerCase().includes("action");

    if (hasAction) {
      // Create a default commitment from the email thread
      const baseDate = new Date(metadata.date);
      const deadline = new Date(baseDate.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 days default

      commitments.push({
        title: `Action Required: ${metadata.subject.replace(/re:|fwd:/gi, "").trim()}`,
        description: body.length > 250 ? body.substring(0, 250) + "..." : body,
        deadline,
        priority: metadata.subject.toLowerCase().includes("urgent") ? "high" : "medium",
        estimatedHours: 1.5,
        category: "Email Follow-up",
        stakeholders: [metadata.from].filter(Boolean),
      });
    }

    return commitments;
  }

  /**
   * Breaks down a commitment into subtasks using Gemini
   */
  async breakdownTask(commitment: { title: string; description: string }): Promise<{ title: string; estimatedHours: number }[]> {
    if (!this.ai) {
      return [
        { title: `Prepare for: ${commitment.title}`, estimatedHours: 0.5 },
        { title: `Draft / Execute: ${commitment.title}`, estimatedHours: 1.0 },
        { title: `Review and finalize: ${commitment.title}`, estimatedHours: 0.5 }
      ];
    }

    const prompt = `You are an expert productivity planner. Please break down the following high-level task/commitment into logical, actionable subtasks that are manageable.
For each subtask, estimate the active effort in hours required.

HIGH-LEVEL TASK:
- Title: ${commitment.title}
- Description: ${commitment.description}

Generate a breakdown as structured JSON in the defined response schema.`;

    try {
      const response = await this.ai.models.generateContent({
        model: this.modelName,
        contents: prompt,
        config: {
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            description: "List of actionable subtasks breaking down the high-level task.",
            items: {
              type: Type.OBJECT,
              properties: {
                title: {
                  type: Type.STRING,
                  description: "A short, actionable subtask name."
                },
                estimatedHours: {
                  type: Type.NUMBER,
                  description: "Estimated effort hours to complete this subtask."
                }
              },
              required: ["title", "estimatedHours"]
            }
          }
        }
      });

      const responseText = response.text || "[]";
      return JSON.parse(responseText.trim());
    } catch (error) {
      console.error("AI breakdown failed, using offline backup:", error);
      return [
        { title: `Initial prep: ${commitment.title}`, estimatedHours: 0.5 },
        { title: `Execution: ${commitment.title}`, estimatedHours: 1.0 },
        { title: `Final review: ${commitment.title}`, estimatedHours: 0.5 }
      ];
    }
  }
}
