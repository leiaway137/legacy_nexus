"use server";

import clientPromise from "./client";
import { type TranscriptChunk, type WisdomSummary, type HighFidelityStory, type DashboardOverview, type DocumentIntelligence } from "@/lib/rag";
import { ObjectId } from "mongodb";
import { encryptString } from "@/lib/encryption";

// Global Serialization Helper for Next.js Server Components
// Prevents MongoDB ObjectId and raw Date classes from crashing Next.js hydration boundaries
function sanitizeMongo<T>(doc: any): T {
  if (!doc) return doc;
  return JSON.parse(JSON.stringify(doc)) as T;
}

// Type definitions to mirror the original Firebase structures
export interface NotebookSource {
  _id?: ObjectId | string;
  id: string;
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
  id: string;
  userId: string;
  title: string;
  subject: string;
  durationOption: string;
  voiceProvider?: string;
  transcript: {
    speaker: "Narrator" | string;
    text: string;
  }[];
  createdAt: Date | any;
}

export interface UserProfile {
  _id?: ObjectId | string;
  id: string;
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

  // TTS Secure Settings Integrations
  voiceProvider?: "native" | "elevenlabs" | "resemble";
  ttsVoiceId?: string;
  encryptedTtsApiKey?: string;
  hasTtsKeySaved?: boolean; // Synthetic variable returned to client instead of the raw key
  resembleProjectId?: string;
  publicSlug?: string;
  familyAccessEmails?: string[];
  isAnonymizedBuildReady?: boolean;
  pseudonymMap?: Record<string, string>;
  completedTours?: string[];
  updatedAt?: any;
}

export interface Contact {
  _id?: ObjectId | string;
  id: string;
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
  id: string;
  userId: string;
  processedSourceIds: string[];
}

export interface QuestionBankItem {
  _id?: ObjectId | string;
  id: string;
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
       return sanitizeMongo([{ id: session._id.toString(), ...session }]);
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
    return sanitizeMongo(doc?.stories || []);
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
    return sanitizeMongo(sources.map(s => ({ id: s._id.toString(), ...s } as any)));
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
export async function saveAudioPodcast(userId: string, podcast: Omit<AudioPodcast, 'id' | 'createdAt' | 'userId'>): Promise<AudioPodcast | null> {
  try {
    const db = await getDb();
    const payload = { ...podcast, userId, createdAt: new Date() };
    
    const dbPayload = { ...payload };
    delete (dbPayload as any).id;
    delete (dbPayload as any)._id;

    const result = await db.collection("legacy_podcasts").insertOne(dbPayload as any);
    return { ...payload, id: result.insertedId.toString() } as AudioPodcast;
  } catch (e) {
    console.error("Failed to save podcast:", e);
    return null;
  }
}

export async function fetchAudioPodcasts(userId: string): Promise<AudioPodcast[]> {
  try {
    const db = await getDb();
    const pods = await db.collection("legacy_podcasts").find({ userId }).sort({ createdAt: -1 }).toArray();
    return sanitizeMongo(pods.map(p => ({ id: p._id.toString(), ...p } as any)));
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
    return sanitizeMongo(contacts.map(c => ({ id: c._id.toString(), ...c } as any)));
  } catch (err) {
    console.error("Failed to fetch contacts:", err);
    return [];
  }
}

export async function saveContact(userId: string, contactData: Partial<Contact> & { id?: string }): Promise<string | null> {
  try {
    const db = await getDb();
    if (contactData.id && contactData.id.length === 24) {
      const payload = { ...contactData, updatedAt: new Date() };
      delete (payload as any)._id; // Never update _id
      await db.collection("legacy_contacts").updateOne(
        { _id: new ObjectId(contactData.id) },
        { $set: payload }
      );
      return contactData.id;
    } else {
      const payload = { ...contactData, userId, updatedAt: new Date() };
      
      const dbPayload = { ...payload };
      delete (dbPayload as any).id;
      delete (dbPayload as any)._id;

      const result = await db.collection("legacy_contacts").insertOne(dbPayload as any);
      return result.insertedId.toString();
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
    if (profile) {
      // SCRUB THE SECRETS: Never send the encrypted symmetric blocks back to the client UI
      profile.hasTtsKeySaved = !!profile.encryptedTtsApiKey;
      delete profile.encryptedTtsApiKey;
    }
    return sanitizeMongo(profile);
  } catch (error) {
    return null;
  }
}

export async function deleteUserAccount(userId: string): Promise<boolean> {
  try {
    const db = await getDb();
    
    let objectIdUserId;
    let resolvedIdString = userId;

    // Hardened Resolution: If the frontend hydration fails and passes the user email fallback, resolve the true Mongo Object ID
    if (userId.includes("@")) {
        const userRec = await db.collection("users").findOne({ email: userId.toLowerCase() });
        if (!userRec) return false; // Not found, nothing to delete
        
        objectIdUserId = userRec._id;
        resolvedIdString = userRec._id.toString();
    } else {
        try {
            objectIdUserId = new ObjectId(userId);
        } catch {
            objectIdUserId = userId;
        }
    }
    
    // Purge across ALL related MongoDB Collections using the strictly resolved UUID string
    await db.collection("users").deleteOne({ _id: objectIdUserId as any });
    await db.collection("user_profiles").deleteOne({ userId: resolvedIdString });
    await db.collection("user_sources").deleteMany({ userId: resolvedIdString });
    await db.collection("legacy_session_active").deleteOne({ userId: resolvedIdString });
    await db.collection("legacy_dashboard_active").deleteOne({ userId: resolvedIdString });
    await db.collection("legacy_stories").deleteOne({ userId: resolvedIdString });
    await db.collection("legacy_podcasts").deleteMany({ userId: resolvedIdString });
    await db.collection("legacy_contacts").deleteMany({ userId: resolvedIdString });
    await db.collection("legacy_insights").deleteOne({ userId: resolvedIdString });
    await db.collection("legacy_chats").deleteOne({ userId: resolvedIdString });
    await db.collection("legacy_questions").deleteMany({ userId: resolvedIdString });
    
    return true;
  } catch (error) {
    console.error("Global Multi-Collection Cascade Deletion Error:", error);
    return false;
  }
}

export async function updateUserProfile(userId: string, data: Partial<UserProfile>): Promise<boolean> {
  try {
    const db = await getDb();
    const payload = { ...data, updatedAt: new Date() };
    delete (payload as any)._id; // Never update _id
    
    // Encrypt the API key before pushing to the DB at-rest if the UI provided one
    if (payload.encryptedTtsApiKey) {
       payload.encryptedTtsApiKey = encryptString(payload.encryptedTtsApiKey);
    }
    
    await db.collection("user_profiles").updateOne(
      { userId },
      { $set: payload },
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
      const payload = { ...state, updatedAt: new Date() };
      delete (payload as any)._id; // Never update _id
      await db.collection("legacy_dashboard_active").updateOne({ userId }, { $set: payload }, { upsert: true });
    }
  } catch (err) {}
}

export async function fetchDashboardState(userId: string): Promise<PersistentDashboardState | null> {
  try {
    const db = await getDb();
    const doc = await db.collection("legacy_dashboard_active").findOne({ userId });
    return sanitizeMongo(doc);
  } catch (err) { return null; }
}

export async function saveLegacyInsights(userId: string, data: any): Promise<boolean> {
  try {
    const db = await getDb();
    const payload = { ...data, updatedAt: new Date() };
    delete (payload as any)._id; // Never update _id
    await db.collection("legacy_insights").updateOne({ userId }, { $set: payload }, { upsert: true });
    return true;
  } catch (error) { return false; }
}

export async function fetchLegacyInsights(userId: string): Promise<any | null> {
  try {
    const db = await getDb();
    const doc = await db.collection("legacy_insights").findOne({ userId });
    return sanitizeMongo(doc);
  } catch (error) { return null; }
}

export async function fetchChatHistory(userId: string): Promise<{role: string, text: string}[]> {
  try {
    const db = await getDb();
    const doc = await db.collection("legacy_chats").findOne({ userId });
    return sanitizeMongo(doc?.messages || []);
  } catch (error) { return []; }
}

export async function saveChatHistory(userId: string, messages: {role: string, text: string}[]) {
  try {
    const db = await getDb();
    await db.collection("legacy_chats").updateOne({ userId }, { $set: { messages, updatedAt: new Date() } }, { upsert: true });
    return true;
  } catch (error) { return false; }
}

export async function fetchProfileBySlug(slug: string): Promise<{id: string, profile: UserProfile} | null> {
  try {
    const db = await getDb();
    const doc = await db.collection("user_profiles").findOne({ publicSlug: slug });
    if (!doc) return null;
    return sanitizeMongo({ id: doc._id.toString(), profile: doc });
  } catch (err) { return null; }
}

export async function updateContactAccessTier(userId: string, contactId: string, email: string, tier: 'none' | 'family'): Promise<boolean> {
  if (!email) return false;
  try {
    const db = await getDb();
    let queryId: any = contactId;
    try { queryId = new ObjectId(contactId); } catch(e) {}
    await db.collection("legacy_contacts").updateOne({ _id: queryId }, { $set: { archiveAccessTier: tier, updatedAt: new Date() } });

    // Update Profile
    const profile = await db.collection("user_profiles").findOne({ userId });
    if (!profile) return false;

    let currentEmails: string[] = profile.familyAccessEmails || [];
    const cleanedEmail = email.toLowerCase().trim();
    currentEmails = currentEmails.filter((e: string) => e.toLowerCase().trim() !== cleanedEmail);

    if (tier === 'family') {
       if (!currentEmails.includes(cleanedEmail)) currentEmails.push(cleanedEmail);
    }
    
    await db.collection("user_profiles").updateOne({ userId }, { $set: { familyAccessEmails: currentEmails } });
    return true;
  } catch (err) {
    console.error("updateContactAccessTier error:", err);
    return false;
  }
}

export async function saveQuestionBankItem(userId: string, data: Partial<QuestionBankItem>): Promise<QuestionBankItem | null> {
  try {
    const db = await getDb();
    const dupCheck = await db.collection("legacy_questions").findOne({ userId, text: data.text });
    if (dupCheck) return { ...dupCheck, id: dupCheck._id.toString() } as QuestionBankItem;

    const newItem = { ...data, userId, isAnswered: false, createdAt: new Date() };
    
    const dbPayload = { ...newItem };
    delete (dbPayload as any).id;
    delete (dbPayload as any)._id;

    const result = await db.collection("legacy_questions").insertOne(dbPayload as any);
    return { ...newItem, id: result.insertedId.toString() } as QuestionBankItem;
  } catch (err) { return null; }
}

export async function fetchPendingBankQuestions(userId: string, limitCount: number = 5): Promise<QuestionBankItem[]> {
  try {
    const db = await getDb();
    const docs = await db.collection("legacy_questions")
      .find({ userId, isAnswered: false })
      .sort({ createdAt: 1 })
      .limit(limitCount)
      .toArray();
    const questions = docs.map((d: any) => ({ ...d, id: d._id.toString() } as QuestionBankItem));
    return sanitizeMongo<QuestionBankItem[]>(questions);
  } catch (error) {
    console.error("Failed to fetch pending bank questions:", error);
    return [];
  }
}

export async function markQuestionsAnswered(userId: string, questionIds: string[]): Promise<boolean> {
  try {
    const db = await getDb();
    const objectIds = questionIds.map(id => {
      try { return new ObjectId(id); } catch(e) { return id; }
    });
    
    await db.collection("legacy_questions").updateMany(
      { userId, _id: { $in: objectIds as ObjectId[] } },
      { $set: { isAnswered: true } }
    );
    return true;
  } catch (err) { return false; }
}
