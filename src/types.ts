export interface User {
  id: string; // Firestore UID
  email: string;
  name: string;
  googleId: string;
  accessToken?: string;
  refreshToken?: string;
  tokens?: any; // Google API Auth token object
  productivityPatterns: Record<number, number>; // { hour: 0-23, score: 0-1 }
  communicationStyle: 'professional' | 'casual' | 'friendly';
  preferredExtensionDays: number;
  createdAt: string;
  updatedAt: string;
}

export interface RiskFactors {
  time: number; // 0-1 (1 = no time left)
  density: number; // 0-1 (1 = very busy calendar)
  effort: number; // 0-1 (1 = effort >> time available)
  history: number; // 0-1 (1 = user often misses similar tasks)
}

export interface Subtask {
  id: string;
  title: string;
  estimatedHours: number;
  status: 'pending' | 'completed';
  order: number;
}

export interface Commitment {
  id: string;
  userId: string;
  title: string;
  description: string;
  start: string;
  deadline: string;
  source: 'calendar' | 'gmail' | 'tasks' | 'manual';
  sourceId: string;
  // Risk Assessment
  riskScore: number; // 0-100
  riskFactors: RiskFactors;
  // Status
  status: 'pending' | 'in_progress' | 'completed' | 'missed' | 'rescheduled';
  estimatedEffortHours: number;
  actualEffortHours?: number;
  subtasks?: Subtask[];
  hasSubtasks?: boolean;
  // Context
  stakeholders: string[];
  relatedEmails: string[]; // Gmail message IDs
  relatedDocs: string[]; // Drive file IDs
  // Metadata
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  createdAt: string;
  updatedAt: string;
}

export interface FocusBlock {
  id: string;
  userId: string;
  commitmentId: string;
  start: string;
  end: string;
  title: string;
  description: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  calendarEventId?: string;
  createdAt: string;
}

export interface PreviousContext {
  date: string;
  source: 'email' | 'document' | 'meeting';
  summary: string;
  link?: string;
}

export interface ActionItem {
  description: string;
  from: string;
  due?: string;
  status: 'pending' | 'completed';
}

export interface RelevantDoc {
  id: string;
  title: string;
  link: string;
  relevance: number; // 0-1
}

export interface MeetingBrief {
  id: string;
  userId: string;
  meetingId: string;
  title: string;
  start: string;
  end: string;
  participants: string[];
  agenda: string;
  // Generated Content
  previousContext: PreviousContext[];
  actionItems: ActionItem[];
  relevantDocs: RelevantDoc[];
  suggestedTalkingPoints: string[];
  // Status
  delivered: boolean;
  deliveredAt?: string;
  deliveredMethod: 'in_app' | 'email';
  createdAt: string;
}
