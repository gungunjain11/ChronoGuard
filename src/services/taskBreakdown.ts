import { AIParser } from "./aiParser";
import { FirestoreService } from "./firestore";
import { Commitment, Subtask } from "../types";
import { v4 as uuidv4 } from "uuid";

export class TaskBreakdownService {
  private aiParser: AIParser;
  private firestoreService: FirestoreService;

  constructor() {
    this.aiParser = new AIParser();
    this.firestoreService = new FirestoreService();
  }

  /**
   * Break down a commitment into subtasks and save them inside the commitment
   */
  async breakdownTask(commitmentId: string, userId: string): Promise<Commitment> {
    const commitment = await this.firestoreService.getCommitment(commitmentId);
    if (!commitment) {
      throw new Error("Commitment not found");
    }

    if (commitment.userId !== userId) {
      throw new Error("Unauthorized access to commitment");
    }

    // Call AI to break down high-level task
    const breakdown = await this.aiParser.breakdownTask({
      title: commitment.title,
      description: commitment.description,
    });

    // Format subtasks
    const subtasks: Subtask[] = breakdown.map((item, index) => ({
      id: uuidv4(),
      title: item.title,
      estimatedHours: item.estimatedHours,
      status: "pending",
      order: index + 1,
    }));

    commitment.subtasks = subtasks;
    commitment.updatedAt = new Date().toISOString();

    // Save updated commitment
    await this.firestoreService.saveCommitment(commitment);

    return commitment;
  }

  /**
   * Creates separate commitment records for each subtask in the breakdown
   */
  async createSubtasksFromBreakdown(commitmentId: string, userId: string): Promise<Commitment> {
    const commitment = await this.firestoreService.getCommitment(commitmentId);
    if (!commitment) {
      throw new Error("Commitment not found");
    }

    if (!commitment.subtasks || commitment.subtasks.length === 0) {
      return commitment;
    }

    // Create a new commitment for each subtask
    for (const subtask of commitment.subtasks) {
      const subtaskCommitment: Commitment = {
        id: uuidv4(),
        userId,
        title: subtask.title,
        description: `Subtask of: ${commitment.title}\nOriginal Details: ${commitment.description}`,
        start: new Date().toISOString(),
        deadline: commitment.deadline, // Same deadline as parent
        source: "manual",
        sourceId: `subtask-${commitment.id}-${subtask.id}`,
        riskScore: 0,
        riskFactors: { time: 0, density: 0, effort: 0, history: 0 },
        status: "pending",
        estimatedEffortHours: subtask.estimatedHours,
        priority: commitment.priority,
        category: `${commitment.category} - Subtask`,
        stakeholders: commitment.stakeholders,
        relatedEmails: commitment.relatedEmails,
        relatedDocs: commitment.relatedDocs,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await this.firestoreService.saveCommitment(subtaskCommitment);
    }

    // Mark parent as having subtasks spawned in the list
    commitment.hasSubtasks = true;
    commitment.updatedAt = new Date().toISOString();
    await this.firestoreService.saveCommitment(commitment);

    return commitment;
  }
}
