import fs from 'fs';
import { GoogleGenAI, Type } from "@google/genai";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";
import pdf from "pdf-parse/lib/pdf-parse.js";

const GEMINI_API_KEY = "AIzaSyBlzXBZd0MFYmOss8nWKYRbugEEHPrnuSo";
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const app = initializeApp({
  apiKey: "AIzaSyDQrCGz8pPoBB_LzX-1Wnj107rr-0BdpVw",
  authDomain: "legacy-nexus-4b56d.firebaseapp.com",
  projectId: "legacy-nexus-4b56d",
  storageBucket: "legacy-nexus-4b56d.firebasestorage.app",
  messagingSenderId: "667591363349",
  appId: "1:667591363349:web:24575c01a2bb4b7be8771c",
});
const auth = getAuth(app);
const db = getFirestore(app);

(async () => {
try {
  console.log("==== INJECTING RAG VAULT ACCOUNT BYPASS ====");

  console.log("[1] Authenticating as leiaway@family.test...");
  const userCredential = await signInWithEmailAndPassword(auth, "leiaway@family.test", "password123");
  const uid = userCredential.user.uid;
  console.log(`  -> Securely connected. Vault ID: ${uid}`);

  const basePath = '/Users/leiaway/Library/Mobile Documents/com~apple~CloudDocs/Family/Interview with Al Lei/';
  const filesToProcess = ['Dad Interview 1.pdf', 'Dad interview 3.pdf', 'Dad Interview 2.pdf'];
  
  let combinedTranscript = "";
  
  console.log("[2] Harvesting PDF Transcripts...");
  for (const file of filesToProcess) {
     const buffer = fs.readFileSync(basePath + file);
     const data = await pdf(buffer);
     combinedTranscript += `\n\n--- SOURCE: ${file} ---\n${data.text}`;
     console.log(`  -> Digested ${file}`);
  }

  console.log("[3] Compiling Vault Data via Gemini 2.5 Flash...");
  const prompt = `
    You are an expert archivist. Segment a raw transcript into 6 logical narrative chunks.
    For each chunk, provide the 'text' segment and 2-3 relevant 'wisdomTags' (e.g. "#Resilience").
    Raw Transcript: "${combinedTranscript.substring(0, 15000)}" 
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: { text: { type: Type.STRING }, wisdomTags: { type: Type.ARRAY, items: { type: Type.STRING } } },
          required: ["text", "wisdomTags"],
        },
      },
    },
  });

  let raw = response.text;
  raw = raw.replace(/^```(?:json)?\n?/i, '').replace(/```\n?$/i, '').trim();
  const chunks = JSON.parse(raw);
  
  const qsPrompt = `Generate 3 empathetic, engaging conversational questions asking the user to expand on themes present in these chunks. Return JSON string array format only. Context: ${JSON.stringify(chunks)}`;
  
  const qResponse = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: qsPrompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } }
    }
  });

  let qRaw = qResponse.text;
  qRaw = qRaw.replace(/^```(?:json)?\n?/i, '').replace(/```\n?$/i, '').trim();
  const qs = JSON.parse(qRaw);

  console.log(`  -> Triumph! Sentient extraction complete.`);

  console.log("[4] Storing natively inside User's Personal Vault...");
  const docRef = await addDoc(collection(db, "legacy_sessions"), {
    userId: uid,
    totalChunks: chunks.length,
    chunks: chunks,
    extractedWisdomTags: chunks.flatMap(c => c.wisdomTags),
    aiRecommendedQuestions: qs,
    createdAt: serverTimestamp()
  });
  console.log(`  -> Document physically sealed in Firebase. ID: ${docRef.id}`);

} catch (error) {
  console.error("==== ERROR ====");
  console.error(error);
}
})();
