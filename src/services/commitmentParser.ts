import { Commitment } from "../types";

/**
 * Estimates effort hours based on calendar event duration
 */
export function estimateEffortFromEvent(event: any): number {
  try {
    const startStr = event.start?.dateTime || event.start?.date;
    const endStr = event.end?.dateTime || event.end?.date;
    
    if (!startStr || !endStr) return 1.0; // Default estimate

    const start = new Date(startStr);
    const end = new Date(endStr);
    const durationMs = end.getTime() - start.getTime();
    const durationHours = durationMs / (1000 * 60 * 60);

    // Ensure we return a positive number, default to at least 0.5 hours for any meeting
    return Math.max(0.5, parseFloat(durationHours.toFixed(1)));
  } catch (err) {
    return 1.0;
  }
}

/**
 * Maps calendar keywords or flags to a system priority score
 */
export function mapPriority(event: any): "low" | "medium" | "high" | "critical" {
  const summary = (event.summary || "").toLowerCase();
  const description = (event.description || "").toLowerCase();

  if (summary.includes("critical") || summary.includes("emergency") || summary.includes("blocker")) {
    return "critical";
  }
  if (summary.includes("urgent") || summary.includes("asap") || description.includes("urgent")) {
    return "high";
  }
  if (summary.includes("important") || summary.includes("sync") || summary.includes("review")) {
    return "medium";
  }
  return "low";
}

/**
 * Parses raw Google Calendar Event JSON into the system's Commitment schema
 */
export function parseCalendarEvent(event: any, userId: string): Commitment {
  const startStr = event.start?.dateTime || event.start?.date || new Date().toISOString();
  const endStr = event.end?.dateTime || event.end?.date || new Date(Date.now() + 3600 * 1000).toISOString();

  const title = event.summary || "Untitled Commitment";
  const description = event.description || "";
  
  // Extract attendees' emails as stakeholders
  const stakeholders: string[] = [];
  if (event.attendees && Array.isArray(event.attendees)) {
    event.attendees.forEach((att: any) => {
      if (att.email) stakeholders.push(att.email);
    });
  }

  // Basic initial risk metrics
  const estimatedHours = estimateEffortFromEvent(event);
  const priority = mapPriority(event);

  return {
    id: `cmt-${event.id || Math.random().toString(36).substring(2, 11)}`,
    userId,
    title,
    description,
    start: new Date(startStr).toISOString(),
    deadline: new Date(endStr).toISOString(),
    source: "calendar",
    sourceId: event.id || "",
    riskScore: 0, // Calculated downstream or set as baseline
    riskFactors: {
      time: 0,
      density: 0,
      effort: 0,
      history: 0,
    },
    status: "pending",
    estimatedEffortHours: estimatedHours,
    actualEffortHours: 0,
    stakeholders,
    relatedEmails: [],
    relatedDocs: [],
    priority,
    category: "Calendar Alignment",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
