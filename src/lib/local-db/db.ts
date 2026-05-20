"use server";

import { getDb, initDb } from "./client";
import { type TranscriptChunk, type WisdomSummary, type HighFidelityStory, type DashboardOverview, type DocumentIntelligence } from "@/lib/rag";
import { encryptString } from "@/lib/encryption";
import crypto from "crypto";

// Ensure DB is initialized
initDb();

function generateId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 24);
}

function parseJson<T>(val: string | null | undefined): T | undefined {
  if (!val) return undefined;
  try { return JSON.parse(val); } catch (e) { return undefined; }
}

function safeStringify(val: any): string | null {
  if (val === undefined || val === null) return null;
  return JSON.stringify(val);
}

// Type definitions to mirror the original Firebase/Mongo structures
export interface NotebookSource {
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
  id: string;
  userId: string;
  title: string;
  subject: string;
  durationOption: string;
  voiceProvider?: string;
  transcript: { speaker: "Narrator" | string; text: string; }[];
  createdAt: any;
}

export interface UserProfile {
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
  voiceProvider?: "native" | "elevenlabs" | "resemble";
  ttsVoiceId?: string;
  encryptedTtsApiKey?: string;
  hasTtsKeySaved?: boolean;
  resembleProjectId?: string;
  publicSlug?: string;
  familyAccessEmails?: string[];
  isAnonymizedBuildReady?: boolean;
  pseudonymMap?: Record<string, string>;
  completedTours?: string[];
  updatedAt?: any;
}

export interface Contact {
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
  id: string;
  userId: string;
  processedSourceIds: string[];
}

export interface QuestionBankItem {
  id: string;
  userId: string;
  text: string;
  source: 'dashboard' | 'gap_prompt';
  storyId?: string;
  isAnswered: boolean;
  createdAt: any;
}

/* =====================================================================
   ACTIVE SESSION PIPELINE
   ===================================================================== */
export async function saveCompiledSession(userId: string, chunks: TranscriptChunk[], questions: string[], synopsis: string, wisdomSummaries: WisdomSummary[]) {
  try {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO legacy_session_active (userId, synopsis, totalChunks, chunks, extractedWisdomTags, wisdomSummaries, aiRecommendedQuestions, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(userId) DO UPDATE SET
        synopsis=excluded.synopsis, totalChunks=excluded.totalChunks, chunks=excluded.chunks,
        extractedWisdomTags=excluded.extractedWisdomTags, wisdomSummaries=excluded.wisdomSummaries,
        aiRecommendedQuestions=excluded.aiRecommendedQuestions, updatedAt=excluded.updatedAt
    `);
    
    stmt.run(
      userId, synopsis, chunks.length, safeStringify(chunks), safeStringify(chunks.flatMap(c => c.wisdomTags)),
      safeStringify(wisdomSummaries), safeStringify(questions), new Date().toISOString()
    );
    return userId;
  } catch (error) {
    console.error("SQLite write error:", error);
    return null;
  }
}

export async function fetchUserSessions(userId: string) {
  try {
    const db = getDb();
    const session: any = db.prepare('SELECT * FROM legacy_session_active WHERE userId = ?').get(userId);
    if (session) {
      return [{
        id: session.userId,
        userId: session.userId,
        synopsis: session.synopsis,
        totalChunks: session.totalChunks,
        chunks: parseJson(session.chunks) || [],
        extractedWisdomTags: parseJson(session.extractedWisdomTags) || [],
        wisdomSummaries: parseJson(session.wisdomSummaries) || [],
        aiRecommendedQuestions: parseJson(session.aiRecommendedQuestions) || [],
        updatedAt: session.updatedAt
      }];
    }
  } catch (error) {
    console.error("Failed to fetch user active session:", error);
  }
  return [];
}

export async function deleteSession(userId: string) {
  try {
    const db = getDb();
    db.prepare('DELETE FROM legacy_session_active WHERE userId = ?').run(userId);
  } catch (error) {
    console.error("Failed to delete historical session:", error);
  }
}

/* =====================================================================
   HIGH FIDELITY STORIES 
   ===================================================================== */
export async function saveHighFidelityStories(userId: string, stories: HighFidelityStory[]): Promise<boolean> {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO legacy_stories (userId, stories, lastUpdated)
      VALUES (?, ?, ?)
      ON CONFLICT(userId) DO UPDATE SET stories=excluded.stories, lastUpdated=excluded.lastUpdated
    `).run(userId, safeStringify(stories), new Date().toISOString());
    return true;
  } catch (error) {
    console.error("Failed to save high fidelity stories:", error);
    return false;
  }
}

export async function fetchHighFidelityStories(userId: string): Promise<HighFidelityStory[]> {
  try {
    const db = getDb();
    const doc: any = db.prepare('SELECT stories FROM legacy_stories WHERE userId = ?').get(userId);
    return doc ? parseJson(doc.stories) || [] : [];
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
    const db = getDb();
    const id = generateId();
    const uploadedAt = new Date().toISOString();
    db.prepare(`
      INSERT INTO user_sources (id, userId, fileName, fileSize, textContent, uploadedAt, isSynced)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `).run(id, userId, fileName, fileSize, textContent, uploadedAt);
    return { id, userId, fileName, fileSize, textContent, uploadedAt, isSynced: false };
  } catch (e) {
    console.error("Failed to map source to user notebook:", e);
    return null;
  }
}

export async function fetchUserSources(userId: string): Promise<NotebookSource[]> {
  try {
    const db = getDb();
    const sources = db.prepare('SELECT * FROM user_sources WHERE userId = ? ORDER BY uploadedAt DESC').all(userId) as any[];
    return sources.map(s => ({
      ...s,
      intelligence: parseJson(s.intelligence),
      isSynced: s.isSynced === 1
    }));
  } catch (e) {
    console.error("Failed to fetch user sources:", e);
    return [];
  }
}

export async function deleteNotebookSource(documentId: string) {
  try {
    const db = getDb();
    db.prepare('DELETE FROM user_sources WHERE id = ?').run(documentId);
  } catch (error) {
    console.error("Failed to remove source document:", error);
  }
}

export async function updateSourceSyncStatus(documentId: string, isSynced: boolean) {
  try {
    const db = getDb();
    db.prepare('UPDATE user_sources SET isSynced = ? WHERE id = ?').run(isSynced ? 1 : 0, documentId);
  } catch (error) {
    console.error("Failed to update sync status:", error);
  }
}

export async function updateNotebookSourceParsedContent(documentId: string, parsedContent: string) {
  try {
    const db = getDb();
    db.prepare('UPDATE user_sources SET parsedContent = ? WHERE id = ?').run(parsedContent, documentId);
  } catch (error) {
    console.error("Failed to update parsed content:", error);
  }
}

export async function updateNotebookSourceIntelligence(documentId: string, intelligence: DocumentIntelligence) {
  try {
    const db = getDb();
    db.prepare('UPDATE user_sources SET intelligence = ? WHERE id = ?').run(safeStringify(intelligence), documentId);
  } catch (error) {
    console.error("Failed to update document intelligence:", error);
  }
}

/* =====================================================================
   PODCASTS
   ===================================================================== */
export async function saveAudioPodcast(userId: string, podcast: Omit<AudioPodcast, 'id' | 'createdAt' | 'userId'>): Promise<AudioPodcast | null> {
  try {
    const db = getDb();
    const id = generateId();
    const createdAt = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO legacy_podcasts (id, userId, title, subject, durationOption, voiceProvider, transcript, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, podcast.title, podcast.subject, podcast.durationOption, podcast.voiceProvider || '', safeStringify(podcast.transcript), createdAt);
    
    return { ...podcast, id, userId, createdAt } as AudioPodcast;
  } catch (e) {
    console.error("Failed to save podcast:", e);
    return null;
  }
}

export async function fetchAudioPodcasts(userId: string): Promise<AudioPodcast[]> {
  try {
    const db = getDb();
    const pods = db.prepare('SELECT * FROM legacy_podcasts WHERE userId = ? ORDER BY createdAt DESC').all(userId) as any[];
    return pods.map(p => ({
      ...p,
      transcript: parseJson(p.transcript) || []
    }));
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
    const db = getDb();
    const contacts = db.prepare('SELECT * FROM legacy_contacts WHERE userId = ?').all(userId) as any[];
    return contacts.map(c => ({
      ...c,
      aliases: parseJson(c.aliases) || []
    }));
  } catch (err) {
    console.error("Failed to fetch contacts:", err);
    return [];
  }
}

export async function saveContact(userId: string, contactData: Partial<Contact> & { id?: string }): Promise<string | null> {
  try {
    const db = getDb();
    const updatedAt = new Date().toISOString();

    if (contactData.id) {
      db.prepare(`
        UPDATE legacy_contacts SET
          originalName = coalesce(?, originalName),
          completeName = coalesce(?, completeName),
          preferredName = coalesce(?, preferredName),
          firstName = coalesce(?, firstName),
          middleName = coalesce(?, middleName),
          lastName = coalesce(?, lastName),
          relationship = coalesce(?, relationship),
          aliases = coalesce(?, aliases),
          email = coalesce(?, email),
          phone = coalesce(?, phone),
          linkedAccountId = coalesce(?, linkedAccountId),
          source = coalesce(?, source),
          archiveAccessTier = coalesce(?, archiveAccessTier),
          updatedAt = ?
        WHERE id = ?
      `).run(
        contactData.originalName, contactData.completeName, contactData.preferredName,
        contactData.firstName, contactData.middleName, contactData.lastName,
        contactData.relationship, contactData.aliases ? safeStringify(contactData.aliases) : undefined,
        contactData.email, contactData.phone, contactData.linkedAccountId,
        contactData.source, contactData.archiveAccessTier, updatedAt, contactData.id
      );
      return contactData.id;
    } else {
      const id = generateId();
      db.prepare(`
        INSERT INTO legacy_contacts (id, userId, originalName, completeName, preferredName, firstName, middleName, lastName, relationship, aliases, email, phone, linkedAccountId, source, archiveAccessTier, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, userId, contactData.originalName, contactData.completeName, contactData.preferredName,
        contactData.firstName, contactData.middleName, contactData.lastName,
        contactData.relationship, safeStringify(contactData.aliases || []),
        contactData.email, contactData.phone, contactData.linkedAccountId,
        contactData.source, contactData.archiveAccessTier, updatedAt
      );
      return id;
    }
  } catch (err) {
    console.error("Failed to save contact:", err);
    return null;
  }
}

export async function deleteContact(contactId: string): Promise<boolean> {
  if (!contactId) return false;
  try {
    const db = getDb();
    db.prepare('DELETE FROM legacy_contacts WHERE id = ?').run(contactId);
    return true;
  } catch (err) {
    console.error("Failed to delete contact:", err);
    return false;
  }
}

export async function deleteAllUserContacts(userId: string): Promise<boolean> {
  try {
    const db = getDb();
    db.prepare('DELETE FROM legacy_contacts WHERE userId = ?').run(userId);
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
    const db = getDb();
    const profile: any = db.prepare('SELECT * FROM user_profiles WHERE userId = ?').get(userId);
    if (profile) {
      profile.userOverrides = parseJson(profile.userOverrides);
      profile.familyAccessEmails = parseJson(profile.familyAccessEmails);
      profile.pseudonymMap = parseJson(profile.pseudonymMap);
      profile.completedTours = parseJson(profile.completedTours);
      profile.isAnonymizedBuildReady = profile.isAnonymizedBuildReady === 1;

      profile.hasTtsKeySaved = !!profile.encryptedTtsApiKey;
      delete profile.encryptedTtsApiKey;
    }
    return profile as UserProfile;
  } catch (error) {
    return null;
  }
}

export async function deleteUserAccount(userId: string): Promise<boolean> {
  try {
    const db = getDb();
    // Simplified cascade delete
    db.prepare('DELETE FROM user_profiles WHERE userId = ?').run(userId);
    db.prepare('DELETE FROM user_sources WHERE userId = ?').run(userId);
    db.prepare('DELETE FROM legacy_session_active WHERE userId = ?').run(userId);
    db.prepare('DELETE FROM legacy_dashboard_active WHERE userId = ?').run(userId);
    db.prepare('DELETE FROM legacy_stories WHERE userId = ?').run(userId);
    db.prepare('DELETE FROM legacy_podcasts WHERE userId = ?').run(userId);
    db.prepare('DELETE FROM legacy_contacts WHERE userId = ?').run(userId);
    db.prepare('DELETE FROM legacy_insights WHERE userId = ?').run(userId);
    db.prepare('DELETE FROM legacy_chats WHERE userId = ?').run(userId);
    db.prepare('DELETE FROM legacy_questions WHERE userId = ?').run(userId);
    return true;
  } catch (error) {
    console.error("Global Multi-Collection Cascade Deletion Error:", error);
    return false;
  }
}

export async function updateUserProfile(userId: string, data: Partial<UserProfile>): Promise<boolean> {
  try {
    const db = getDb();
    const updatedAt = new Date().toISOString();
    
    if (data.encryptedTtsApiKey) {
       data.encryptedTtsApiKey = encryptString(data.encryptedTtsApiKey);
    }
    
    // We do an UPSERT
    const id = data.id || generateId();

    const existing: any = db.prepare('SELECT id FROM user_profiles WHERE userId = ?').get(userId);
    if (existing) {
      // Update
      const setClause = [];
      const values: any[] = [];
      for (const [k, v] of Object.entries(data)) {
        if (k === 'id' || k === 'userId') continue;
        setClause.push(`${k} = ?`);
        if (typeof v === 'object' && v !== null) {
          values.push(safeStringify(v));
        } else if (typeof v === 'boolean') {
          values.push(v ? 1 : 0);
        } else {
          values.push(v);
        }
      }
      if (setClause.length > 0) {
        setClause.push('updatedAt = ?');
        values.push(updatedAt);
        values.push(userId); // for WHERE
        db.prepare(`UPDATE user_profiles SET ${setClause.join(', ')} WHERE userId = ?`).run(...values);
      }
    } else {
      // Insert
      db.prepare(`
        INSERT INTO user_profiles (id, userId, firstName, middleName, lastName, formerName, pronouns, genderIdentity, dateOfBirth, placeOfBirth, residence, culturalHeritage, primaryLanguage, secondaryLanguages, userOverrides, trustScore, privacyLevel, voiceProvider, ttsVoiceId, encryptedTtsApiKey, resembleProjectId, publicSlug, familyAccessEmails, isAnonymizedBuildReady, pseudonymMap, completedTours, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, userId, data.firstName, data.middleName, data.lastName, data.formerName, data.pronouns, data.genderIdentity, data.dateOfBirth, data.placeOfBirth, data.residence, data.culturalHeritage, data.primaryLanguage, data.secondaryLanguages, safeStringify(data.userOverrides), data.trustScore || 0, data.privacyLevel, data.voiceProvider, data.ttsVoiceId, data.encryptedTtsApiKey, data.resembleProjectId, data.publicSlug, safeStringify(data.familyAccessEmails), data.isAnonymizedBuildReady ? 1 : 0, safeStringify(data.pseudonymMap), safeStringify(data.completedTours), updatedAt
      );
    }
    return true;
  } catch (error) {
    console.error("updateUserProfile err", error);
    return false;
  }
}

export async function checkSlugAvailability(slug: string, excludeUserId?: string): Promise<boolean> {
  try {
    const db = getDb();
    const doc: any = db.prepare('SELECT userId FROM user_profiles WHERE publicSlug = ?').get(slug);
    if (!doc) return true;
    if (excludeUserId && doc.userId === excludeUserId) return true;
    return false;
  } catch (err) {
    return false;
  }
}

export async function incrementUserTrustScore(userId: string, delta: number): Promise<boolean> {
  try {
    const db = getDb();
    db.prepare('UPDATE user_profiles SET trustScore = trustScore + ?, updatedAt = ? WHERE userId = ?').run(delta, new Date().toISOString(), userId);
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
    const db = getDb();
    if (state === null) {
      db.prepare('DELETE FROM legacy_dashboard_active WHERE userId = ?').run(userId);
    } else {
      const updatedAt = new Date().toISOString();
      const stateData = { ...state };
      delete (stateData as any).id;
      delete (stateData as any).userId;
      delete (stateData as any).processedSourceIds;

      db.prepare(`
        INSERT INTO legacy_dashboard_active (userId, processedSourceIds, stateData, updatedAt)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(userId) DO UPDATE SET processedSourceIds=excluded.processedSourceIds, stateData=excluded.stateData, updatedAt=excluded.updatedAt
      `).run(userId, safeStringify(state.processedSourceIds || []), safeStringify(stateData), updatedAt);
    }
  } catch (err) {}
}

export async function fetchDashboardState(userId: string): Promise<PersistentDashboardState | null> {
  try {
    const db = getDb();
    const doc: any = db.prepare('SELECT * FROM legacy_dashboard_active WHERE userId = ?').get(userId);
    if (!doc) return null;
    const stateData = parseJson(doc.stateData) || {};
    return {
      id: doc.userId,
      userId: doc.userId,
      processedSourceIds: parseJson(doc.processedSourceIds) || [],
      ...stateData
    } as PersistentDashboardState;
  } catch (err) { return null; }
}

export async function saveLegacyInsights(userId: string, data: any): Promise<boolean> {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO legacy_insights (userId, data, updatedAt) VALUES (?, ?, ?)
      ON CONFLICT(userId) DO UPDATE SET data=excluded.data, updatedAt=excluded.updatedAt
    `).run(userId, safeStringify(data), new Date().toISOString());
    return true;
  } catch (error) { return false; }
}

export async function fetchLegacyInsights(userId: string): Promise<any | null> {
  try {
    const db = getDb();
    const doc: any = db.prepare('SELECT data FROM legacy_insights WHERE userId = ?').get(userId);
    return doc ? parseJson(doc.data) : null;
  } catch (error) { return null; }
}

export async function fetchChatHistory(userId: string): Promise<{role: string, text: string}[]> {
  try {
    const db = getDb();
    const doc: any = db.prepare('SELECT messages FROM legacy_chats WHERE userId = ?').get(userId);
    return doc ? parseJson(doc.messages) || [] : [];
  } catch (error) { return []; }
}

export async function saveChatHistory(userId: string, messages: {role: string, text: string}[]) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO legacy_chats (userId, messages, updatedAt) VALUES (?, ?, ?)
      ON CONFLICT(userId) DO UPDATE SET messages=excluded.messages, updatedAt=excluded.updatedAt
    `).run(userId, safeStringify(messages), new Date().toISOString());
    return true;
  } catch (error) { return false; }
}

export async function fetchProfileBySlug(slug: string): Promise<{id: string, profile: UserProfile} | null> {
  try {
    const db = getDb();
    const doc: any = db.prepare('SELECT * FROM user_profiles WHERE publicSlug = ?').get(slug);
    if (!doc) return null;
    return { id: doc.id, profile: doc as UserProfile };
  } catch (err) { return null; }
}

export async function updateContactAccessTier(userId: string, contactId: string, email: string, tier: 'none' | 'family'): Promise<boolean> {
  if (!email) return false;
  try {
    const db = getDb();
    db.prepare('UPDATE legacy_contacts SET archiveAccessTier = ?, updatedAt = ? WHERE id = ?').run(tier, new Date().toISOString(), contactId);

    const profile: any = db.prepare('SELECT familyAccessEmails FROM user_profiles WHERE userId = ?').get(userId);
    if (!profile) return false;

    let currentEmails: string[] = parseJson(profile.familyAccessEmails) || [];
    const cleanedEmail = email.toLowerCase().trim();
    currentEmails = currentEmails.filter((e: string) => e.toLowerCase().trim() !== cleanedEmail);

    if (tier === 'family') {
       if (!currentEmails.includes(cleanedEmail)) currentEmails.push(cleanedEmail);
    }
    
    db.prepare('UPDATE user_profiles SET familyAccessEmails = ? WHERE userId = ?').run(safeStringify(currentEmails), userId);
    return true;
  } catch (err) {
    console.error("updateContactAccessTier error:", err);
    return false;
  }
}

export async function saveQuestionBankItem(userId: string, data: Partial<QuestionBankItem>): Promise<QuestionBankItem | null> {
  try {
    const db = getDb();
    const dupCheck: any = db.prepare('SELECT * FROM legacy_questions WHERE userId = ? AND text = ?').get(userId, data.text);
    if (dupCheck) return { ...dupCheck, isAnswered: dupCheck.isAnswered === 1 } as QuestionBankItem;

    const id = generateId();
    const createdAt = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO legacy_questions (id, userId, text, source, storyId, isAnswered, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, data.text, data.source, data.storyId, 0, createdAt);
    
    return { ...data, id, userId, isAnswered: false, createdAt } as QuestionBankItem;
  } catch (err) { return null; }
}

export async function fetchPendingBankQuestions(userId: string, limitCount: number = 5): Promise<QuestionBankItem[]> {
  try {
    const db = getDb();
    const docs = db.prepare('SELECT * FROM legacy_questions WHERE userId = ? AND isAnswered = 0 ORDER BY createdAt ASC LIMIT ?').all(userId, limitCount) as any[];
    return docs.map(d => ({ ...d, isAnswered: d.isAnswered === 1 }));
  } catch (error) {
    console.error("Failed to fetch pending bank questions:", error);
    return [];
  }
}

export async function markQuestionsAnswered(userId: string, questionIds: string[]): Promise<boolean> {
  try {
    const db = getDb();
    const placeholders = questionIds.map(() => '?').join(',');
    db.prepare(`UPDATE legacy_questions SET isAnswered = 1 WHERE userId = ? AND id IN (${placeholders})`).run(userId, ...questionIds);
    return true;
  } catch (err) { return false; }
}
