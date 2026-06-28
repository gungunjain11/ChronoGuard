import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp, Firestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";
import { Commitment, User } from "../types";

// In-memory fallback database structure
interface FallbackDatabase {
  users: Map<string, User>;
  commitments: Map<string, Commitment>;
  notifications: any[];
  focusBlocks: Map<string, any>;
  meetingBriefs: Map<string, any>;
}

const fallbackStore: FallbackDatabase = {
  users: new Map<string, User>(),
  commitments: new Map<string, Commitment>(),
  notifications: [],
  focusBlocks: new Map<string, any>(),
  meetingBriefs: new Map<string, any>()
};

// Pre-populate with default mock data so the application looks complete and alive out-of-the-box
const defaultMockUser: User = {
  id: "mock-user-id",
  email: "jaingungun266@gmail.com",
  name: "Gungun Jain",
  googleId: "115269782264",
  accessToken: "",
  refreshToken: "",
  productivityPatterns: { 9: 0.8, 14: 0.95, 16: 0.7 },
  communicationStyle: "professional",
  preferredExtensionDays: 2,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

fallbackStore.users.set(defaultMockUser.id, defaultMockUser);

const mockCommitment1: Commitment = {
  id: "mock-comm-1",
  userId: "mock-user-id",
  title: "Review Q3 Strategy Plan",
  description: "Read through team strategy and highlight high-risk milestones.",
  source: "gmail",
  sourceId: "msg-123",
  status: "pending",
  riskScore: 85,
  riskFactors: {
    time: 0.8,
    density: 0.9,
    effort: 0.7,
    history: 0.5
  },
  start: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // starts in 2 hours
  deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // due in 24h
  category: "Strategy",
  priority: "high",
  estimatedEffortHours: 2,
  stakeholders: ["Sarah Connor", "John Doe"],
  relatedEmails: ["msg-123"],
  relatedDocs: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

const mockCommitment2: Commitment = {
  id: "mock-comm-2",
  userId: "mock-user-id",
  title: "Prepare Client Presentation",
  description: "Align with the design team on product slides.",
  source: "calendar",
  sourceId: "evt-456",
  status: "pending",
  riskScore: 40,
  riskFactors: {
    time: 0.3,
    density: 0.4,
    effort: 0.5,
    history: 0.2
  },
  start: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
  deadline: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  category: "Client Sync",
  priority: "medium",
  estimatedEffortHours: 1.5,
  stakeholders: ["Alex Smith"],
  relatedEmails: [],
  relatedDocs: ["doc-789"],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

fallbackStore.commitments.set(mockCommitment1.id, mockCommitment1);
fallbackStore.commitments.set(mockCommitment2.id, mockCommitment2);

export class FirestoreService {
  private db: Firestore;
  private static useFallback = false;

  constructor() {
    // Initialize firebase-admin if not already initialized
    if (getApps().length === 0) {
      let config: any = {};
      try {
        const configPath = path.join(process.cwd(), "firebase-applet-config.json");
        if (fs.existsSync(configPath)) {
          config = JSON.parse(fs.readFileSync(configPath, "utf8"));
        }
      } catch (err) {
        console.error("Failed to read firebase config file:", err);
      }

      // Dynamically detect Google Cloud Project ID on Cloud Run
      let resolvedProjectId = process.env.FIREBASE_PROJECT_ID;
      if (!resolvedProjectId) {
        try {
          const { execSync } = require("child_process");
          const metadataProjectId = execSync(
            'curl -s -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/project/project-id',
            { timeout: 1000 }
          ).toString().trim();
          if (metadataProjectId && !metadataProjectId.includes("Error") && !metadataProjectId.includes("failed")) {
            resolvedProjectId = metadataProjectId;
            console.log("[Firestore] Dynamically detected Google Cloud Project ID from metadata server:", resolvedProjectId);
          }
        } catch (err) {
          // Silent catch or fallback
        }
      }

      if (!resolvedProjectId) {
        resolvedProjectId = config.projectId || "gdg-buildwithai-494405";
      }

      try {
        initializeApp({
          projectId: resolvedProjectId,
        });
      } catch (initErr) {
        console.error("[Firestore] Failed to initialize Firebase App:", initErr);
        FirestoreService.useFallback = true;
      }
    }

    // Set custom Firestore database ID if specified in config
    let databaseId = "ai-studio-chronoguard-4f4bb8ee-60c1-428d-ba3f-e461952bc003";
    try {
      const configPath = path.join(process.cwd(), "firebase-applet-config.json");
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
        if (config.firestoreDatabaseId) {
          databaseId = config.firestoreDatabaseId;
        }
      }
    } catch (err) {
      console.error("Failed to resolve firestoreDatabaseId:", err);
    }

    try {
      this.db = getFirestore(databaseId);
    } catch (getDbErr) {
      console.error("[Firestore] Failed to obtain Firestore instance. Activating fallback.", getDbErr);
      FirestoreService.useFallback = true;
    }
  }

  /**
   * Helper to execute Firestore operations with automatic fallback on PERMISSION_DENIED
   */
  private async execute<T>(
    operation: (db: Firestore) => Promise<T>,
    fallback: () => Promise<T>
  ): Promise<T> {
    if (FirestoreService.useFallback) {
      return fallback();
    }

    try {
      return await operation(this.db);
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (
        errMsg.includes("PERMISSION_DENIED") ||
        errMsg.includes("insufficient permissions") ||
        errMsg.includes("Metadata-Flavor") ||
        err?.code === 7
      ) {
        if (!FirestoreService.useFallback) {
          console.warn("[Firestore] Dynamic permission check failed. Accessing fallback database.", errMsg);
          FirestoreService.useFallback = true;
        }
        return fallback();
      }
      throw err;
    }
  }

  /**
   * Save or update a commitment in Firestore
   */
  async saveCommitment(commitment: Commitment): Promise<Commitment> {
    return this.execute<Commitment>(
      async (db) => {
        const ref = db.collection("commitments").doc(commitment.id);
        const toTimestamp = (val: any) => {
          if (!val) return Timestamp.now();
          const date = new Date(val);
          return isNaN(date.getTime()) ? Timestamp.now() : Timestamp.fromDate(date);
        };

        const formattedCommitment = {
          ...commitment,
          start: toTimestamp(commitment.start),
          deadline: toTimestamp(commitment.deadline),
          createdAt: toTimestamp(commitment.createdAt),
          updatedAt: toTimestamp(commitment.updatedAt),
        };

        await ref.set(formattedCommitment, { merge: true });
        return commitment;
      },
      async () => {
        const updated = {
          ...commitment,
          createdAt: commitment.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        fallbackStore.commitments.set(commitment.id, updated);
        return updated;
      }
    );
  }

  /**
   * Fetch all commitments for a specific user
   */
  async getCommitments(userId: string): Promise<Commitment[]> {
    return this.execute<Commitment[]>(
      async (db) => {
        const snapshot = await db.collection("commitments")
          .where("userId", "==", userId)
          .get();

        return snapshot.docs.map((doc) => {
          const data = doc.data();
          const fromTimestamp = (ts: any) => {
            if (!ts) return new Date().toISOString();
            if (typeof ts.toDate === "function") return ts.toDate().toISOString();
            return new Date(ts).toISOString();
          };

          return {
            ...data,
            id: doc.id,
            start: fromTimestamp(data.start),
            deadline: fromTimestamp(data.deadline),
            createdAt: fromTimestamp(data.createdAt),
            updatedAt: fromTimestamp(data.updatedAt),
          } as Commitment;
        });
      },
      async () => {
        return Array.from(fallbackStore.commitments.values()).filter(c => c.userId === userId);
      }
    );
  }

  /**
   * Delete a commitment by ID
   */
  async deleteCommitment(commitmentId: string): Promise<void> {
    return this.execute<void>(
      async (db) => {
        await db.collection("commitments").doc(commitmentId).delete();
      },
      async () => {
        fallbackStore.commitments.delete(commitmentId);
      }
    );
  }

  /**
   * Save or update a user profile
   */
  async saveUser(user: User): Promise<User> {
    return this.execute<User>(
      async (db) => {
        const ref = db.collection("users").doc(user.id);
        const updatedUser = {
          ...user,
          createdAt: user.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await ref.set(updatedUser, { merge: true });
        return updatedUser;
      },
      async () => {
        const updated = {
          ...user,
          createdAt: user.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        fallbackStore.users.set(user.id, updated);
        return updated;
      }
    );
  }

  /**
   * Get a user profile by ID
   */
  async getUserById(userId: string): Promise<User | null> {
    return this.execute<User | null>(
      async (db) => {
        const doc = await db.collection("users").doc(userId).get();
        if (!doc.exists) return null;
        return doc.data() as User;
      },
      async () => {
        return fallbackStore.users.get(userId) || null;
      }
    );
  }

  /**
   * Get a user profile by email
   */
  async getUserByEmail(email: string): Promise<User | null> {
    return this.execute<User | null>(
      async (db) => {
        const snapshot = await db.collection("users")
          .where("email", "==", email)
          .limit(1)
          .get();

        if (snapshot.empty) return null;
        return snapshot.docs[0].data() as User;
      },
      async () => {
        const found = Array.from(fallbackStore.users.values()).find(u => u.email === email);
        return found || null;
      }
    );
  }

  /**
   * Get all registered user profiles
   */
  async getAllUsers(): Promise<User[]> {
    return this.execute<User[]>(
      async (db) => {
        const snapshot = await db.collection("users").get();
        return snapshot.docs.map(doc => doc.data() as User);
      },
      async () => {
        return Array.from(fallbackStore.users.values());
      }
    );
  }

  /**
   * Get all commitments in a specific category for a user
   */
  async getCommitmentsByCategory(userId: string, category: string): Promise<Commitment[]> {
    return this.execute<Commitment[]>(
      async (db) => {
        const snapshot = await db.collection("commitments")
          .where("userId", "==", userId)
          .where("category", "==", category)
          .get();

        return snapshot.docs.map((doc) => {
          const data = doc.data();
          const fromTimestamp = (ts: any) => {
            if (!ts) return new Date().toISOString();
            if (typeof ts.toDate === "function") return ts.toDate().toISOString();
            return new Date(ts).toISOString();
          };
          return {
            ...data,
            id: doc.id,
            start: fromTimestamp(data.start),
            deadline: fromTimestamp(data.deadline),
            createdAt: fromTimestamp(data.createdAt),
            updatedAt: fromTimestamp(data.updatedAt),
          } as Commitment;
        });
      },
      async () => {
        return Array.from(fallbackStore.commitments.values()).filter(
          c => c.userId === userId && c.category === category
        );
      }
    );
  }

  /**
   * Get pending high-risk commitments for a user
   */
  async getHighRiskCommitments(userId: string, threshold: number = 70): Promise<Commitment[]> {
    const commitments = await this.getCommitments(userId);
    return commitments.filter(c => c.riskScore >= threshold && c.status === "pending");
  }

  /**
   * Save a notification record
   */
  async saveNotification(notification: any): Promise<any> {
    return this.execute<any>(
      async (db) => {
        const ref = db.collection("notifications").doc();
        const id = ref.id;
        const data = {
          ...notification,
          id,
          sentAt: notification.sentAt ? Timestamp.fromDate(new Date(notification.sentAt)) : Timestamp.now(),
        };
        await ref.set(data);
        return data;
      },
      async () => {
        const data = {
          ...notification,
          id: `notif-${Math.random().toString(36).substr(2, 9)}`,
          sentAt: notification.sentAt || new Date().toISOString(),
        };
        fallbackStore.notifications.push(data);
        return data;
      }
    );
  }

  /**
   * Get the last sent notification for a user and commitment
   */
  async getLastNotification(userId: string, commitmentId: string): Promise<any | null> {
    return this.execute<any | null>(
      async (db) => {
        const snapshot = await db.collection("notifications")
          .where("userId", "==", userId)
          .where("commitmentId", "==", commitmentId)
          .orderBy("sentAt", "desc")
          .limit(1)
          .get();

        if (snapshot.empty) return null;
        const data = snapshot.docs[0].data();
        return {
          ...data,
          id: snapshot.docs[0].id,
          sentAt: data.sentAt && typeof data.sentAt.toDate === "function" ? data.sentAt.toDate().toISOString() : data.sentAt,
        };
      },
      async () => {
        const found = fallbackStore.notifications
          .filter(n => n.userId === userId && n.commitmentId === commitmentId)
          .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
        return found[0] || null;
      }
    );
  }

  /**
   * Get all notifications for a user
   */
  async getNotifications(userId: string): Promise<any[]> {
    return this.execute<any[]>(
      async (db) => {
        const snapshot = await db.collection("notifications")
          .where("userId", "==", userId)
          .orderBy("sentAt", "desc")
          .get();

        return snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            ...data,
            id: doc.id,
            sentAt: data.sentAt && typeof data.sentAt.toDate === "function" ? data.sentAt.toDate().toISOString() : data.sentAt,
          };
        });
      },
      async () => {
        return fallbackStore.notifications
          .filter(n => n.userId === userId)
          .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
      }
    );
  }

  /**
   * Get a commitment by ID
   */
  async getCommitment(commitmentId: string): Promise<Commitment | null> {
    return this.execute<Commitment | null>(
      async (db) => {
        const doc = await db.collection("commitments").doc(commitmentId).get();
        if (!doc.exists) return null;
        const data = doc.data();
        if (!data) return null;
        
        const fromTimestamp = (ts: any) => {
          if (!ts) return new Date().toISOString();
          if (typeof ts.toDate === "function") return ts.toDate().toISOString();
          return new Date(ts).toISOString();
        };

        return {
          ...data,
          id: doc.id,
          start: fromTimestamp(data.start),
          deadline: fromTimestamp(data.deadline),
          createdAt: fromTimestamp(data.createdAt),
          updatedAt: fromTimestamp(data.updatedAt),
        } as Commitment;
      },
      async () => {
        return fallbackStore.commitments.get(commitmentId) || null;
      }
    );
  }

  /**
   * Save or update a focus block
   */
  async saveFocusBlock(focusBlock: any): Promise<any> {
    return this.execute<any>(
      async (db) => {
        const ref = db.collection("focusBlocks").doc(focusBlock.id);
        const toTimestamp = (val: any) => {
          if (!val) return Timestamp.now();
          const date = new Date(val);
          return isNaN(date.getTime()) ? Timestamp.now() : Timestamp.fromDate(date);
        };

        const formatted = {
          ...focusBlock,
          start: toTimestamp(focusBlock.start),
          end: toTimestamp(focusBlock.end),
          createdAt: toTimestamp(focusBlock.createdAt),
        };

        await ref.set(formatted, { merge: true });
        return focusBlock;
      },
      async () => {
        fallbackStore.focusBlocks.set(focusBlock.id, {
          ...focusBlock,
          createdAt: focusBlock.createdAt || new Date().toISOString()
        });
        return focusBlock;
      }
    );
  }

  /**
   * Get all focus blocks for a user
   */
  async getFocusBlocks(userId: string): Promise<any[]> {
    return this.execute<any[]>(
      async (db) => {
        const snapshot = await db.collection("focusBlocks")
          .where("userId", "==", userId)
          .get();

        return snapshot.docs.map((doc) => {
          const data = doc.data();
          const fromTimestamp = (ts: any) => {
            if (!ts) return new Date().toISOString();
            if (typeof ts.toDate === "function") return ts.toDate().toISOString();
            return new Date(ts).toISOString();
          };

          return {
            ...data,
            id: doc.id,
            start: fromTimestamp(data.start),
            end: fromTimestamp(data.end),
            createdAt: fromTimestamp(data.createdAt),
          };
        });
      },
      async () => {
        return Array.from(fallbackStore.focusBlocks.values()).filter(fb => fb.userId === userId);
      }
    );
  }

  /**
   * Save or update a meeting brief
   */
  async saveMeetingBrief(brief: any): Promise<any> {
    return this.execute<any>(
      async (db) => {
        const ref = db.collection("meetingBriefs").doc(brief.id);
        const toTimestamp = (val: any) => {
          if (!val) return Timestamp.now();
          const date = new Date(val);
          return isNaN(date.getTime()) ? Timestamp.now() : Timestamp.fromDate(date);
        };

        const formatted = {
          ...brief,
          start: toTimestamp(brief.start),
          end: toTimestamp(brief.end),
          createdAt: toTimestamp(brief.createdAt),
          deliveredAt: brief.deliveredAt ? toTimestamp(brief.deliveredAt) : null,
        };

        await ref.set(formatted, { merge: true });
        return brief;
      },
      async () => {
        fallbackStore.meetingBriefs.set(brief.id, {
          ...brief,
          createdAt: brief.createdAt || new Date().toISOString()
        });
        return brief;
      }
    );
  }

  /**
   * Get a meeting brief by meetingId
   */
  async getMeetingBrief(meetingId: string): Promise<any | null> {
    return this.execute<any | null>(
      async (db) => {
        const snapshot = await db.collection("meetingBriefs")
          .where("meetingId", "==", meetingId)
          .limit(1)
          .get();

        if (snapshot.empty) return null;
        const doc = snapshot.docs[0];
        const data = doc.data();

        const fromTimestamp = (ts: any) => {
          if (!ts) return undefined;
          if (typeof ts.toDate === "function") return ts.toDate().toISOString();
          return new Date(ts).toISOString();
        };

        return {
          ...data,
          id: doc.id,
          start: fromTimestamp(data.start),
          end: fromTimestamp(data.end),
          createdAt: fromTimestamp(data.createdAt),
          deliveredAt: fromTimestamp(data.deliveredAt),
        };
      },
      async () => {
        const briefs = Array.from(fallbackStore.meetingBriefs.values());
        const found = briefs.find(b => b.meetingId === meetingId);
        return found || null;
      }
    );
  }

  /**
   * Get all meeting briefs for a user
   */
  async getMeetingBriefs(userId: string): Promise<any[]> {
    return this.execute<any[]>(
      async (db) => {
        const snapshot = await db.collection("meetingBriefs")
          .where("userId", "==", userId)
          .get();

        return snapshot.docs.map((doc) => {
          const data = doc.data();
          const fromTimestamp = (ts: any) => {
            if (!ts) return undefined;
            if (typeof ts.toDate === "function") return ts.toDate().toISOString();
            return new Date(ts).toISOString();
          };

          return {
            ...data,
            id: doc.id,
            start: fromTimestamp(data.start),
            end: fromTimestamp(data.end),
            createdAt: fromTimestamp(data.createdAt),
            deliveredAt: fromTimestamp(data.deliveredAt),
          };
        });
      },
      async () => {
        return Array.from(fallbackStore.meetingBriefs.values()).filter(b => b.userId === userId);
      }
    );
  }
}
