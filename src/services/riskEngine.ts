import { FirestoreService } from "./firestore";
import { AIParser } from "./aiParser";
import { CalendarAnalyzer } from "./calendarAnalyzer";
import { Commitment, RiskFactors } from "../types";

export class RiskEngine {
  private firestoreService: FirestoreService;
  private aiParser: AIParser;

  constructor() {
    this.firestoreService = new FirestoreService();
    this.aiParser = new AIParser();
  }

  /**
   * Calculates the Time Factor (0 to 1, where 1 indicates extremely high risk due to lack of time)
   */
  async calculateTimeFactor(commitment: Commitment): Promise<number> {
    try {
      const now = new Date();
      const deadline = new Date(commitment.deadline);
      const timeUntilDeadlineHours = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

      // If deadline is in the past, time factor is 1 (max risk)
      if (timeUntilDeadlineHours <= 0) return 1;

      const effortHours = Math.max(commitment.estimatedEffortHours || 1, 1);
      
      // Normalize by estimated effort
      const normalizedTime = timeUntilDeadlineHours / effortHours;

      // Clamp between 0 and 1, then invert (1 = no time remaining / urgent, 0 = plenty of time)
      return Math.min(1, Math.max(0, 1 - Math.min(1, normalizedTime)));
    } catch (error) {
      console.error("Error in calculateTimeFactor:", error);
      return 0.5; // Neutral fallback
    }
  }

  /**
   * Calculates the Calendar Density Factor (0 to 1, where 1 means completely booked until deadline)
   */
  async calculateDensityFactor(commitment: Commitment, userId: string, oauth2Client: any): Promise<number> {
    try {
      const now = new Date();
      const deadline = new Date(commitment.deadline);
      if (deadline.getTime() <= now.getTime()) return 1;

      if (!oauth2Client) {
        console.warn(`No Google OAuth2 client provided for density analysis. Falling back to default density factor.`);
        return 0.3; // Baseline default if calendar cannot be fetched
      }

      const analyzer = new CalendarAnalyzer(oauth2Client);
      return await analyzer.calculateDensityFactor(userId, now, deadline);
    } catch (error) {
      console.error("Error in calculateDensityFactor:", error);
      return 0.4;
    }
  }

  /**
   * Calculates the Effort Factor (0 to 1, where 1 means effort heavily outweighs time available)
   */
  async calculateEffortFactor(commitment: Commitment): Promise<number> {
    try {
      const now = new Date();
      const deadline = new Date(commitment.deadline);
      const timeUntilDeadlineHours = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

      if (timeUntilDeadlineHours <= 0) return 1;

      // Re-estimate effort with AI (incorporating both Title and Description)
      const estimatedEffort = await this.aiParser.estimateTaskEffort(
        commitment.title,
        commitment.description || ""
      );

      // Effort factor: 0 = effort << time available, 1 = effort >= time available
      return Math.min(1, Math.max(0, estimatedEffort / Math.max(timeUntilDeadlineHours, 0.1)));
    } catch (error) {
      console.error("Error in calculateEffortFactor:", error);
      return 0.5;
    }
  }

  /**
   * Calculates the History Factor (0 to 1, where 1 means user always misses similar category tasks)
   */
  async calculateHistoryFactor(commitment: Commitment, userId: string): Promise<number> {
    try {
      const category = commitment.category || "General";
      const similarCommitments = await this.firestoreService.getCommitmentsByCategory(userId, category);

      if (similarCommitments.length === 0) return 0.5; // Neutral default

      const completed = similarCommitments.filter(c => c.status === "completed").length;
      const completionRate = completed / similarCommitments.length;

      // History factor: 0 = always completes, 1 = never completes
      return 1 - completionRate;
    } catch (error) {
      console.error("Error in calculateHistoryFactor:", error);
      return 0.5;
    }
  }

  /**
   * Recalculates risk factors and overall Risk Score for all pending/in-progress commitments of a user
   */
  async calculateRiskScores(userId: string, oauth2Client: any): Promise<Commitment[]> {
    try {
      const commitments = await this.firestoreService.getCommitments(userId);
      const pendingCommitments = commitments.filter(
        c => c.status === "pending" || c.status === "in_progress"
      );

      const updatedCommitments: Commitment[] = [];

      for (const commitment of pendingCommitments) {
        // Compute all 4 factors in parallel for speed
        const [time, density, effort, history] = await Promise.all([
          this.calculateTimeFactor(commitment),
          this.calculateDensityFactor(commitment, userId, oauth2Client),
          this.calculateEffortFactor(commitment),
          this.calculateHistoryFactor(commitment, userId)
        ]);

        const factors: RiskFactors = { time, density, effort, history };

        // Formula: 30% time urgency, 20% calendar density, 30% AI effort ratio, 20% historical completion rate
        const rawScore = (0.3 * time + 0.2 * density + 0.3 * effort + 0.2 * history) * 100;
        const riskScore = Math.min(100, Math.max(0, Math.round(rawScore)));

        const updatedCommitment: Commitment = {
          ...commitment,
          riskScore,
          riskFactors: factors,
          updatedAt: new Date().toISOString()
        };

        await this.firestoreService.saveCommitment(updatedCommitment);
        updatedCommitments.push(updatedCommitment);
      }

      return updatedCommitments;
    } catch (error) {
      console.error(`Failed to calculate risk scores for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Retrieve high-risk commitments (Risk Score >= 70% and status is pending)
   */
  async getHighRiskCommitments(userId: string, threshold: number = 70): Promise<Commitment[]> {
    return this.firestoreService.getHighRiskCommitments(userId, threshold);
  }

  /**
   * Retrieve statistical summary and risk trends for a given user
   */
  async getRiskTrends(userId: string, days: number = 7): Promise<any> {
    try {
      const commitments = await this.firestoreService.getCommitments(userId);
      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - days);

      const recentCommitments = commitments.filter(c => {
        const createdDate = new Date(c.createdAt);
        return !isNaN(createdDate.getTime()) && createdDate >= startDate && c.status !== "missed";
      });

      const completed = recentCommitments.filter(c => c.status === "completed").length;
      const total = recentCommitments.length;
      const avgRiskScore = total > 0 
        ? recentCommitments.reduce((sum, c) => sum + (c.riskScore || 0), 0) / total 
        : 0;

      return {
        totalCommitments: total,
        completed,
        completionRate: total > 0 ? completed / total : 0,
        avgRiskScore: Math.round(avgRiskScore),
        highRiskCount: recentCommitments.filter(c => (c.riskScore || 0) > 70).length,
      };
    } catch (error) {
      console.error("Error in getRiskTrends:", error);
      throw error;
    }
  }
}
