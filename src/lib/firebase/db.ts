import { getFirestore, collection, addDoc, serverTimestamp, query, where, getDocs, doc, deleteDoc, orderBy, getDoc, setDoc, updateDoc, increment } from "firebase/firestore";
import { app } from "./client";
import { type TranscriptChunk, type WisdomSummary, type HighFidelityStory, type DashboardOverview } from "@/lib/rag";

export const db = getFirestore(app);

export async function saveCompiledSession(userId: string, chunks: TranscriptChunk[], questions: string[], synopsis: string, wisdomSummaries: WisdomSummary[]) {
  try {
    const docRef = doc(db, "legacy_session_active", userId);
    await setDoc(docRef, {
      userId,
      synopsis,
      totalChunks: chunks.length,
      chunks, // Persisting chunk content to load it back
      extractedWisdomTags: chunks.flatMap(c => c.wisdomTags),
      wisdomSummaries, // Extracted thematic summaries
      aiRecommendedQuestions: questions,
      updatedAt: serverTimestamp(),
    });
    console.log("Successfully overwrote active AI Session for user");
    return userId;
  } catch (error) {
    console.error("Firebase write permission or configuration error:", error);
    return null;
  }
}

// ---- HIGH FIDELITY STORY SYSTEM (RIASEC & ANALYTICS PERSISTENCE) ----

export async function saveHighFidelityStories(userId: string, stories: HighFidelityStory[]): Promise<boolean> {
  try {
    const docRef = doc(db, "legacy_stories", userId);
    await setDoc(docRef, {
      userId,
      stories,
      lastUpdated: serverTimestamp()
    }, { merge: true });
    return true;
  } catch (error) {
    console.error("Failed to save high fidelity stories:", error);
    return false;
  }
}

export async function fetchHighFidelityStories(userId: string): Promise<HighFidelityStory[]> {
  try {
    const docRef = doc(db, "legacy_stories", userId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists() && docSnap.data().stories) {
      return docSnap.data().stories as HighFidelityStory[];
    }
  } catch (error) {
    console.error("Failed to fetch high fidelity stories:", error);
  }
  return [];
}


export async function fetchUserSessions(userId: string) {
  try {
    const docRef = doc(db, "legacy_session_active", userId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
       return [{ id: docSnap.id, ...docSnap.data() }];
    }
  } catch (error) {
    console.error("Failed to fetch user active session:", error);
  }
  return [];
}

export async function deleteSession(userId: string) {
  try {
    await deleteDoc(doc(db, "legacy_session_active", userId));
  } catch (error) {
    console.error("Failed to delete historical session:", error);
  }
}

// ---- NOTEBOOK PERSISTENCE SYSTEM ----

export interface NotebookSource {
  id: string; // The firestore doc ID
  userId: string;
  fileName: string;
  fileSize: number;
  textContent: string; // The extracted AI-readable string
  parsedContent?: string; // The AI-structured conversational script format
  uploadedAt: any;
  isSynced?: boolean; // Whether the RAG loop has already processed this source into HighFidelity stories
}

export async function uploadNotebookSource(userId: string, fileName: string, fileSize: number, textContent: string): Promise<NotebookSource | null> {
  try {
    const sourcesRef = collection(db, "user_sources");
    const docRef = await addDoc(sourcesRef, {
      userId,
      fileName,
      fileSize,
      textContent,
      uploadedAt: serverTimestamp()
    });
    return { id: docRef.id, userId, fileName, fileSize, textContent, uploadedAt: new Date() };
  } catch (e) {
    console.error("Failed to map source to user notebook:", e);
    return null;
  }
}

export async function fetchUserSources(userId: string): Promise<NotebookSource[]> {
  try {
    const q = query(
      collection(db, "user_sources"),
      where("userId", "==", userId)
    );
    const snap = await getDocs(q);
    const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as NotebookSource));
    // Sort locally to bypass strict Firestore Composite Index configuration requirements
    return docs.sort((a: any, b: any) => (b.uploadedAt?.seconds || 0) - (a.uploadedAt?.seconds || 0));
  } catch (e) {
    console.error("Failed to fetch user sources:", e);
    return [];
  }
}

export async function deleteNotebookSource(documentId: string) {
  try {
    await deleteDoc(doc(db, "user_sources", documentId));
  } catch (error) {
    console.error("Failed to remove source document:", error);
  }
}

export async function updateSourceSyncStatus(documentId: string, isSynced: boolean) {
  try {
    const docRef = doc(db, "user_sources", documentId);
    await updateDoc(docRef, { isSynced });
  } catch (error) {
    console.error("Failed to update sync status:", error);
  }
}

export async function updateNotebookSourceParsedContent(documentId: string, parsedContent: string) {
  try {
    const docRef = doc(db, "user_sources", documentId);
    await updateDoc(docRef, { parsedContent });
  } catch (error) {
    console.error("Failed to update parsed content:", error);
  }
}

// ---- USER PROFILES SYSTEM ----

export interface UserProfile {
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
  trustScore?: number;
  updatedAt?: any;
}

export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const docRef = doc(db, "user_profiles", userId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as UserProfile;
    }
  } catch (error) {
    console.error("Failed to fetch user profile:", error);
  }
  return null;
}

export async function updateUserProfile(userId: string, data: Partial<UserProfile>): Promise<boolean> {
  try {
    const docRef = doc(db, "user_profiles", userId);
    await setDoc(docRef, { ...data, updatedAt: serverTimestamp() }, { merge: true });
    return true;
  } catch (error) {
    console.error("Failed to update user profile:", error);
    return false;
  }
}

export async function incrementUserTrustScore(userId: string, delta: number): Promise<boolean> {
  if (delta === 0) return true;
  try {
    const docRef = doc(db, "user_profiles", userId);
    await setDoc(docRef, { trustScore: increment(delta), updatedAt: serverTimestamp() }, { merge: true });
    return true;
  } catch (error) {
    console.error("Failed to increment user trust score:", error);
    return false;
  }
}

// ---- DASHBOARD CHAT PERSISTENCE ----

export async function saveChatHistory(userId: string, messages: {role: string, text: string}[]) {
  try {
    const docRef = doc(db, "legacy_chats", userId);
    await setDoc(docRef, { messages, updatedAt: serverTimestamp() }, { merge: true });
    return true;
  } catch (error) {
    console.error("Failed to save chat history:", error);
    return false;
  }
}

export async function fetchChatHistory(userId: string): Promise<{role: string, text: string}[]> {
  try {
    const docRef = doc(db, "legacy_chats", userId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists() && docSnap.data().messages) {
      return docSnap.data().messages;
    }
  } catch (error) {
    console.error("Failed to fetch chat history:", error);
  }
  return [];
}

// ---- CONTACTS & NEXUSLINK PERSISTENCE ----

export interface Contact {
  id: string; // The firestore doc ID
  userId: string;
  originalName: string; // Original name from transcript (or import label)
  completeName: string; // Corrected/Full name dynamically concatenated
  firstName?: string;
  middleName?: string;
  lastName?: string;
  relationship?: string; // Formal role/relationship to narrator
  aliases: string[]; // Alternate spellings
  email: string;
  phone?: string; // Imported phone number
  linkedAccountId: string;
  source?: 'story' | 'import' | 'merged'; // Data provenance
  updatedAt?: any;
}

export async function fetchContacts(userId: string): Promise<Contact[]> {
  try {
    const q = query(collection(db, "legacy_contacts"), where("userId", "==", userId));
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Contact));
  } catch (err) {
    console.error("Failed to fetch contacts:", err);
    return [];
  }
}

export async function saveContact(userId: string, contactData: Partial<Contact> & { id?: string }): Promise<string | null> {
  try {
    const colRef = collection(db, "legacy_contacts");
    if (contactData.id) {
      // Update existing
      const docRef = doc(db, "legacy_contacts", contactData.id);
      await setDoc(docRef, { ...contactData, updatedAt: serverTimestamp() }, { merge: true });
      return contactData.id;
    } else {
      // Create new
      const docRef = await addDoc(colRef, { ...contactData, userId, updatedAt: serverTimestamp() });
      return docRef.id;
    }
  } catch (err) {
    console.error("Failed to save contact:", err);
    return null;
  }
}

export async function deleteContact(contactId: string): Promise<boolean> {
  try {
    const docRef = doc(db, "legacy_contacts", contactId);
    await deleteDoc(docRef);
    return true;
  } catch (err) {
    console.error("Failed to delete contact:", err);
    return false;
  }
}

export interface PersistentDashboardState extends DashboardOverview {
  processedSourceIds: string[];
}

export async function fetchDashboardState(userId: string): Promise<PersistentDashboardState | null> {
  try {
    const docRef = doc(db, "legacy_dashboard_active", userId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as PersistentDashboardState;
    }
  } catch (error) {
    console.error("Failed to fetch dashboard state:", error);
  }
  return null;
}

export async function saveDashboardState(userId: string, state: PersistentDashboardState) {
  try {
    const docRef = doc(db, "legacy_dashboard_active", userId);
    await setDoc(docRef, { ...state, updatedAt: Date.now() });
  } catch (err) {
    console.error("Failed to save dashboard state:", err);
  }
}

// ---- AI DRIFT INSIGHTS PERSISTENCE ----

export async function saveLegacyInsights(userId: string, data: any): Promise<boolean> {
  try {
    const docRef = doc(db, "legacy_insights", userId);
    await setDoc(docRef, { ...data, updatedAt: serverTimestamp() });
    return true;
  } catch (error) {
    console.error("Failed to save legacy insights:", error);
    return false;
  }
}

export async function fetchLegacyInsights(userId: string): Promise<any | null> {
  try {
    const docRef = doc(db, "legacy_insights", userId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data();
    }
  } catch (error) {
    console.error("Failed to fetch legacy insights:", error);
  }
  return null;
}

// ---- QUESTION BANK PERSISTENCE ----

export interface QuestionBankItem {
  id: string; // Firestore doc ID
  userId: string;
  text: string;
  source: 'dashboard' | 'gap_prompt';
  storyId?: string; // If source == 'gap_prompt'
  isAnswered: boolean;
  createdAt: any;
}

export async function saveQuestionBankItem(userId: string, data: Partial<QuestionBankItem>): Promise<string | null> {
  try {
    const colRef = collection(db, "legacy_questions");
    
    const q = query(colRef, where("userId", "==", userId), where("text", "==", data.text));
    const dupCheck = await getDocs(q);
    
    if (!dupCheck.empty) {
      return dupCheck.docs[0].id;
    }

    const docRef = await addDoc(colRef, { ...data, userId, isAnswered: false, createdAt: serverTimestamp() });
    return docRef.id;
  } catch (err) {
    console.error("Failed to save question to bank:", err);
    return null;
  }
}

export async function fetchPendingBankQuestions(userId: string, limitCount: number = 5): Promise<QuestionBankItem[]> {
  try {
    const q = query(collection(db, "legacy_questions"), where("userId", "==", userId), where("isAnswered", "==", false));
    const snap = await getDocs(q);
    const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as QuestionBankItem));
    const sorted = docs.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    return sorted.slice(0, limitCount);
  } catch (err) {
    console.error("Failed to fetch pending questions:", err);
    return [];
  }
}

export async function markQuestionsAnswered(questionIds: string[]): Promise<boolean> {
  try {
    for (const id of questionIds) {
      const docRef = doc(db, "legacy_questions", id);
      await updateDoc(docRef, { isAnswered: true });
    }
    return true;
  } catch (err) {
    console.error("Failed to mark questions answered:", err);
    return false;
  }
}
