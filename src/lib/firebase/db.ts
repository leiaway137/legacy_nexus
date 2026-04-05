import { getFirestore, collection, addDoc, serverTimestamp, query, where, getDocs, doc, deleteDoc, orderBy } from "firebase/firestore";
import { app } from "./client";
import { type TranscriptChunk, type WisdomSummary } from "@/lib/rag";

export const db = getFirestore(app);

export async function saveCompiledSession(userId: string, chunks: TranscriptChunk[], questions: string[], synopsis: string, wisdomSummaries: WisdomSummary[]) {
  try {
    const sessionRef = collection(db, "legacy_sessions");
    const docRef = await addDoc(sessionRef, {
      userId,
      synopsis,
      totalChunks: chunks.length,
      chunks, // Persisting chunk content to load it back
      extractedWisdomTags: chunks.flatMap(c => c.wisdomTags),
      wisdomSummaries, // Extracted thematic summaries
      aiRecommendedQuestions: questions,
      createdAt: serverTimestamp(),
    });
    console.log("Successfully saved AI Session to Firebase with ID:", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("Firebase write permission or configuration error:", error);
    return null;
  }
}

export async function fetchUserSessions(userId: string) {
  try {
    const q = query(
      collection(db, "legacy_sessions"), 
      where("userId", "==", userId)
      // orderBy("createdAt", "desc") // requires composite index, leaving standard query for now
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Failed to fetch user sessions:", error);
    return [];
  }
}

export async function deleteSession(sessionId: string) {
  try {
    await deleteDoc(doc(db, "legacy_sessions", sessionId));
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
  uploadedAt: any;
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
