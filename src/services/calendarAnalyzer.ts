import { CalendarService } from "./calendar";

export class CalendarAnalyzer {
  private calendarService: CalendarService;

  constructor(oauth2Client: any) {
    this.calendarService = new CalendarService(oauth2Client);
  }

  /**
   * Get historical productivity patterns of a user (or default hourly distribution scores)
   */
  async getProductivityPatterns(userId: string, days: number = 30): Promise<Record<number, number>> {
    // For now, return standard default circadian productivity scores (0.05 to 1.0)
    return {
      8: 0.9, 9: 0.95, 10: 1.0, 11: 0.95, // Morning peak
      12: 0.8, 13: 0.7, 14: 0.75, 15: 0.8, // Afternoon
      16: 0.85, 17: 0.8, 18: 0.6, // Late afternoon
      19: 0.4, 20: 0.3, 21: 0.2, // Evening
      22: 0.1, 23: 0.05, 0: 0.05, 1: 0.1, 2: 0.2, // Night
      3: 0.3, 4: 0.4, 5: 0.5, 6: 0.7, 7: 0.8 // Early morning
    };
  }

  /**
   * Calculate calendar density factor: ratio of busy time to total time available
   * Returns a normalized value between 0 (completely free) and 1 (completely busy)
   */
  async calculateDensityFactor(userId: string, start: Date, end: Date): Promise<number> {
    try {
      const events = await this.calendarService.getEvents(start, end);
      let busyHours = 0;
      
      // Map events to simple start/end intervals
      const intervals = events
        .map(e => {
          const s = new Date(e.start.dateTime || e.start.date);
          const d = new Date(e.end.dateTime || e.end.date);
          return { start: s, end: d };
        })
        .filter(i => !isNaN(i.start.getTime()) && !isNaN(i.end.getTime()))
        .sort((a, b) => a.start.getTime() - b.start.getTime());

      if (intervals.length === 0) return 0;

      // Merge overlapping events to avoid double counting
      const mergedIntervals: Array<{ start: Date; end: Date }> = [];
      let current = intervals[0];
      for (let i = 1; i < intervals.length; i++) {
        const next = intervals[i];
        if (next.start.getTime() <= current.end.getTime()) {
          // Overlap - extend current block
          if (next.end.getTime() > current.end.getTime()) {
            current.end = next.end;
          }
        } else {
          mergedIntervals.push(current);
          current = next;
        }
      }
      mergedIntervals.push(current);

      // Accumulate busy time bounded inside the requested [start, end] window
      for (const interval of mergedIntervals) {
        const s = Math.max(start.getTime(), interval.start.getTime());
        const d = Math.min(end.getTime(), interval.end.getTime());
        if (d > s) {
          busyHours += (d - s) / (1000 * 60 * 60);
        }
      }

      const totalHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      if (totalHours <= 0) return 0;

      return Math.min(1, Math.max(0, busyHours / totalHours));
    } catch (error) {
      console.error("Error calculating calendar density factor:", error);
      return 0.5; // Safe fallback
    }
  }

  /**
   * Find available gaps of free time on the calendar between start and end.
   */
  async getFreeTimeBlocks(start: Date, end: Date, durationHours: number): Promise<Array<{ start: Date; end: Date; durationHours: number }>> {
    try {
      const events = await this.calendarService.getEvents(start, end);
      const busyIntervals = events
        .map(e => {
          const s = new Date(e.start.dateTime || e.start.date);
          const d = new Date(e.end.dateTime || e.end.date);
          return { start: s, end: d };
        })
        .filter(i => !isNaN(i.start.getTime()) && !isNaN(i.end.getTime()))
        .sort((a, b) => a.start.getTime() - b.start.getTime());

      // Merge overlapping blocks
      const merged: Array<{ start: Date; end: Date }> = [];
      if (busyIntervals.length > 0) {
        let current = busyIntervals[0];
        for (let i = 1; i < busyIntervals.length; i++) {
          const next = busyIntervals[i];
          if (next.start.getTime() <= current.end.getTime()) {
            if (next.end.getTime() > current.end.getTime()) {
              current.end = next.end;
            }
          } else {
            merged.push(current);
            current = next;
          }
        }
        merged.push(current);
      }

      // Traverse through merged busy intervals to identify free gaps
      const freeBlocks: Array<{ start: Date; end: Date; durationHours: number }> = [];
      let currentStart = start.getTime();
      const endTime = end.getTime();

      for (const busy of merged) {
        const bStart = busy.start.getTime();
        const bEnd = busy.end.getTime();

        if (bStart > currentStart) {
          const diff = (bStart - currentStart) / (1000 * 60 * 60);
          if (diff >= 0.25) { // Minimum block of 15 minutes
            freeBlocks.push({
              start: new Date(currentStart),
              end: new Date(bStart),
              durationHours: diff
            });
          }
        }
        currentStart = Math.max(currentStart, bEnd);
        if (currentStart >= endTime) break;
      }

      if (currentStart < endTime) {
        const diff = (endTime - currentStart) / (1000 * 60 * 60);
        if (diff >= 0.25) {
          freeBlocks.push({
            start: new Date(currentStart),
            end: new Date(endTime),
            durationHours: diff
          });
        }
      }

      return freeBlocks;
    } catch (error) {
      console.error("Error finding free time blocks:", error);
      return [];
    }
  }

  /**
   * Rank and score available calendar slots based on suitability (duration match and productivity pattern match)
   */
  async findOptimalTimeBlocks(
    durationHours: number,
    start: Date,
    end: Date,
    userProductivity: Record<number, number>
  ): Promise<Array<{ block: { start: Date; end: Date; durationHours: number }; score: number }>> {
    const freeBlocks = await this.getFreeTimeBlocks(start, end, durationHours);
    
    return freeBlocks
      .map(block => {
        const startHour = block.start.getHours();
        const productivityScore = userProductivity[startHour] !== undefined ? userProductivity[startHour] : 0.5;

        // Score formulation:
        // 70% weight: Peak productivity hourly performance score
        // 30% weight: Exact fit ratio matching requested durationHours
        const durationRatio = Math.min(block.durationHours, durationHours) / Math.max(block.durationHours, durationHours);
        const score = (
          0.7 * productivityScore +
          0.3 * durationRatio
        );

        return { block, score };
      })
      .sort((a, b) => b.score - a.score);
  }
}
