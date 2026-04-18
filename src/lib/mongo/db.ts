"use server";

import clientPromise from "./client";
import { type TranscriptChunk, type WisdomSummary, type HighFidelityStory, type DashboardOverview, type DocumentIntelligence } from "@/lib/rag";
import { ObjectId } from "mongodb";

// Type definitions to mirror the original Firebase structures
export interface NotebookSource {
  _id?: ObjectId | string;
  userId: string;
  fileName: string;
  fileSize: number;
  textContent: string;
  parsedContent?: string;
  intelligence?: DocumentIntelligence;
  uploadedAt: any;
  isSynced?: boolean;
}

export interface AudioPodcast {
  _id?: ObjectId | string;
  userId: string;
  title: string;
  subject: string;
  durationOption: string;
  transcript: {
    speaker: "Host 1" | "Host 2";
    text: string;
  }[];
  createdAt: Date | any;
}

export interface UserProfile {
  _id?: ObjectId | string;
  userId: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  formerName?: string;
  pronouns?: string;
  genderIdentity?: string;
  dateOfBirth?: string;
  placeOfBirth?: string;
  residence?: string;
  culturalHeritage?: string;
  primaryLanguage?: string;
  secondaryLanguages?: string;
  userOverrides?: string[];
  trustScore?: number;
  privacyLevel?: "private" | "family" | "public_anonymized" | "public_transparent";
  publicSlug?: string;
  familyAccessEmails?: string[];
  isAnonymizedBuildReady?: boolean;
  pseudonymMap?: Record<string, string>;
  completedTours?: string[];
  updatedAt?: any;
}

export interface Contact {
  _id?: ObjectId | string;
  userId: string;
  originalName: string;
  completeName: string;
  preferredName?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  relationship?: string;
  aliases: string[];
  email: string;
  phone?: string;
  linkedAccountId: string;
  source?: 'story' | 'import' | 'merged';
  archiveAccessTier?: 'none' | 'family';
  updatedAt?: any;
}

export interface PersistentDashboardState extends DashboardOverview {
  _id?: ObjectId | string;
  userId: string;
  processedSourceIds: string[];
}

export interface QuestionBankItem {
  _id?: ObjectId | string;
  userId: string;
  text: string;
  source: 'dashboard' | 'gap_prompt';
  storyId?: string;
  isAnswered: boolean;
  createdAt: any;
}

// Global Helper to get DB
async function getDb() {
  const client = await clientPromise;
  return client.db("legacy_nexus");
}

/* =====================================================================
   ACTIVE SESSION PIPELINE
   ===================================================================== */
export async function saveCompiledSession(userId: string, chunks: TranscriptChunk[], questions: string[], synopsis: string, wisdomSummaries: WisdomSummary[]) {
  try {
    const db = await getDb();
    await db.collection("legacy_session_active").updateOne(
      { userId },
      {
        $set: {
          synopsis,
          totalChunks: chunks.length,
          chunks,
          extractedWisdomTags: chunks.flatMap(c => c.wisdomTags),
          wisdomSummaries,
          aiRecommendedQuestions: questions,
          updatedAt: new Date(),
        }
      },
      { upsert: true }
    );
    return userId;
  } catch (error) {
    console.error("Mongo write error:", error);
    return null;
  }
}

export async function fetchUserSessions(userId: string) {
  try {
    const db = await getDb();
    const session = await db.collection("legacy_session_active").findOne({ userId });
    if (session) {
       return [{ id: session._id.toString(), ...session }];
    }
  } catch (error) {
    console.error("Failed to fetch user active session:", error);
  }
  return [];
}

export async function deleteSession(userId: string) {
  try {
    const db = await getDb();
    await db.collection("legacy_session_active").deleteOne({ userId });
  } catch (error) {
    console.error("Failed to delete historical session:", error);
  }
}

/* =====================================================================
   HIGH FIDELITY STORIES 
   ===================================================================== */
export async function saveHighFidelityStories(userId: string, stories: HighFidelityStory[]): Promise<boolean> {
  try {
    const db = await getDb();
    await db.collection("legacy_stories").updateOne(
      { userId },
      { $set: { stories, lastUpdated: new Date() } },
      { upsert: true }
    );
    return true;
  } catch (error) {
    console.error("Failed to save high fidelity stories:", error);
    return false;
  }
}

export async function fetchHighFidelityStories(userId: string): Promise<HighFidelityStory[]> {
  try {
    const db = await getDb();
    const doc = await db.collection("legacy_stories").findOne({ userId });
    return doc?.stories || [];
  } catch (error) {
    console.error("Failed to fetch high fidelity stories:", error);
    return [];
  }
}

/* =====================================================================
   NOTEBOOK SOURCES
   ===================================================================== */
export async function uploadNotebookSource(userId: string, fileName: string, fileSize: number, textContent: string): Promise<NotebookSource | null> {
  try {
    const db = await getDb();
    const res = await db.collection("user_sources").insertOne({
      userId,
      fileName,
      fileSize,
      textContent,
      uploadedAt: new Date()
    });
    return { id: res.insertedId.toString(), userId, fileName, fileSize, textContent, uploadedAt: new Date() } as any;
  } catch (e) {
    console.error("Failed to map source to user notebook:", e);
    return null;
  }
}

export async function fetchUserSources(userId: string): Promise<NotebookSource[]> {
  try {
    const db = await getDb();
    const sources = await db.collection("user_sources").find({ userId }).sort({ uploadedAt: -1 }).toArray();
    return sources.map(s => ({ id: s._id.toString(), ...s } as any));
  } catch (e) {
    console.error("Failed to fetch user sources:", e);
    return [];
  }
}

export async function deleteNotebookSource(documentId: string) {
  try {
    const db = await getDb();
    await db.collection("user_sources").deleteOne({ _id: new ObjectId(documentId) });
  } catch (error) {
    console.error("Failed to remove source document:", error);
  }
}

export async function updateSourceSyncStatus(documentId: string, isSynced: boolean) {
  try {
    const db = await getDb();
    await db.collection("user_sources").updateOne({ _id: new ObjectId(documentId) }, { $set: { isSynced } });
  } catch (error) {
    console.error("Failed to update sync status:", error);
  }
}

export async function updateNotebookSourceParsedContent(documentId: string, parsedContent: string) {
  try {
    const db = await getDb();
    await db.collection("user_sources").updateOne({ _id: new ObjectId(documentId) }, { $set: { parsedContent } });
  } catch (error) {
    console.error("Failed to update parsed content:", error);
  }
}

export async function updateNotebookSourceIntelligence(documentId: string, intelligence: DocumentIntelligence) {
  try {
    const db = await getDb();
    await db.collection("user_sources").updateOne({ _id: new ObjectId(documentId) }, { $set: { intelligence } });
  } catch (error) {
    console.error("Failed to update document intelligence:", error);
  }
}

/* =====================================================================
   PODCASTS
   ===================================================================== */
export async function saveAudioPodcast(userId: string, podcast: Omit<AudioPodcast, 'id' | 'createdAt' | 'userId'>): Promise<string | null> {
  try {
    const db = await getDb();
    const res = await db.collection("podcasts").insertOne({
      ...podcast,
      userId,
      createdAt: new Date()
    });
    return res.insertedId.toString();
  } catch (e) {
    console.error("Failed to save podcast:", e);
    return null;
  }
}

export async function fetchAudioPodcasts(userId: string): Promise<AudioPodcast[]> {
  try {
    const db = await getDb();
    const pods = await db.collection("podcasts").find({ userId }).sort({ createdAt: -1 }).toArray();
    return pods.map(p => ({ id: p._id.toString(), ...p } as any));
  } catch (e) {
    console.error("Failed to fetch podcasts:", e);
    return [];
  }
}

/* =====================================================================
   CONTACTS (ADDRESS BOOK)
   ===================================================================== */
export async function fetchContacts(userId: string): Promise<Contact[]> {
  try {
    const db = await getDb();
    const contacts = await db.collection("legacy_contacts").find({ userId }).toArray();
    return contacts.map(c => ({ id: c._id.toString(), ...c } as any));
  } catch (err) {
    console.error("Failed to fetch contacts:", err);
    return [];
  }
}

export async function saveContact(userId: string, contactData: Partial<Contact> & { id?: string }): Promise<string | null> {
  try {
    const db = await getDb();
    if (contactData.id && contactData.id.length === 24) {
      await db.collection("legacy_contacts").updateOne(
        { _id: new ObjectId(contactData.id) },
        { $set: { ...contactData, updatedAt: new Date() } }
      );
      return contactData.id;
    } else {
      // Create new
      const { id, ...cleanData } = contactData;
      const res = await db.collection("legacy_contacts").insertOne({ ...cleanData, userId, updatedAt: new Date() });
      return res.insertedId.toString();
    }
  } catch (err) {
    console.error("Failed to save contact:", err);
    return null;
  }
}

export async function deleteContact(contactId: string): Promise<boolean> {
  if (!contactId || contactId.length !== 24) return false;
  try {
    const db = await getDb();
    await db.collection("legacy_contacts").deleteOne({ _id: new ObjectId(contactId) });
    return true;
  } catch (err) {
    console.error("Failed to delete contact:", err);
    return false;
  }
}

export async function deleteAllUserContacts(userId: string): Promise<boolean> {
  try {
    const db = await getDb();
    await db.collection("legacy_contacts").deleteMany({ userId });
    return true;
  } catch (err) {
    return false;
  }
}

/* =====================================================================
   USER PROFILES
   ===================================================================== */
export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const db = await getDb();
    const profile = await db.collection("user_profiles").findOne({ userId });
    return profile as unknown as UserProfile | null;
  } catch (error) {
    return null;
  }
}

export async function updateUserProfile(userId: string, data: Partial<UserProfile>): Promise<boolean> {
  try {
    const db = await getDb();
    await db.collection("user_profiles").updateOne(
      { userId },
      { $set: { ...data, updatedAt: new Date() } },
      { upsert: true }
    );
    return true;
  } catch (error) {
    return false;
  }
}

export async function checkSlugAvailability(slug: string, excludeUserId?: string): Promise<boolean> {
  try {
    const db = await getDb();
    const doc = await db.collection("user_profiles").findOne({ publicSlug: slug });
    if (!doc) return true;
    if (excludeUserId && doc.userId === excludeUserId) return true;
    return false;
  } catch (err) {
    return false;
  }
}

export async function incrementUserTrustScore(userId: string, delta: number): Promise<boolean> {
  try {
    const db = await getDb();
    await db.collection("user_profiles").updateOne(
      { userId },
      { $inc: { trustScore: delta }, $set: { updatedAt: new Date() } },
      { upsert: true }
    );
    return true;
  } catch (error) {
    return false;
  }
}

/* =====================================================================
   DASHBOARD / INSIGHTS / QUESTION BANK 
   ===================================================================== */
export async function saveDashboardState(userId: string, state: PersistentDashboardState | null) {
  try {
    const db = await getDb();
    if (state === null) {
      await db.collection("legacy_dashboard_active").deleteOne({ userId });
    } else {
      await db.collection("legacy_dashboard_active").updateOne({ userId }, { $set: { ...state, updatedAt: new Date() } }, { upsert: true });
    }
  } catch (err) {}
}

export async function fetchDashboardState(userId: string): Promise<PersistentDashboardState | null> {
  try {
    const db = await getDb();
    return await db.collection("legacy_dashboard_active").findOne({ userId }) as unknown as PersistentDashboardState;
  } catch (err) { return null; }
}

export async function saveLegacyInsights(userId: string, data: any): Promise<boolean> {
  try {
    const db = await getDb();
    await db.collection("legacy_insights").updateOne({ userId }, { $set: { ...data, updatedAt: new Date() } }, { upsert: true });
    return true;
  } catch (error) { return false; }
}

export async function fetchLegacyInsights(userId: string): Promise<any | null> {
  try {
    const db = await getDb();
    return await db.collection("legacy_insights").findOne({ userId });
  } catch (error) { return null; }
}

export async function fetchChatHistory(userId: string): Promise<{role: string, text: string}[]> {
  try {
    const db = await getDb();
    const doc = await db.collection("legacy_chats").findOne({ userId });
    return doc?.messages || [];
  } catch (error) { return []; }
}

export async function saveChatHistory(userId: string, messages: {role: string, text: string}[]) {
  try {
    const db = await getDb();
    await db.collection("legacy_chats").updateOne({ userId }, { $set: { messages, updatedAt: new Date() } }, { upsert: true });
    return true;
  } catch (error) { return false; }
}
