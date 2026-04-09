"use server";

import { processTranscriptForRag, generateInterviewQuestions, generateSynopsis, TranscriptChunk, generateWisdomSummaries, chatWithLegacy, WisdomSummary, conductActiveInterview, extractHighFidelityStories, HighFidelityStory, updateHighFidelityStoriesIncrementally } from "@/lib/rag";
// @ts-ignore - Bypass Turbopack static ESM export resolution
import pdfParseModule from "pdf-parse/lib/pdf-parse.js";

export async function processTranscriptAction(text: string): Promise<TranscriptChunk[]> {
  try {
    if (text.startsWith("SYSTEM ERROR")) {
       return [{ text, wisdomTags: ["#Error"] }];
    }
    return await processTranscriptForRag(text);
  } catch (error: any) {
    console.error("Failed to process transcript:", error);
    return [{ text: `SYSTEM ERROR (Gemini Request Failed): ${error?.message || error}`, wisdomTags: ["#API_Error"] }];
  }
}

export async function generateSynopsisAction(context: string): Promise<string> {
  return await generateSynopsis(context);
}

export async function generateQuestionsAction(context: string): Promise<string[]> {
  try {
    return await generateInterviewQuestions(context);
  } catch (error) {
    console.error("Failed to generate questions:", error);
    return [];
  }
}

export async function uploadAndExtractAction(formData: FormData): Promise<string> {
  try {
    const file = formData.get("file") as File;
    if (!file) throw new Error("No file uploaded");

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
       const pdfParseFn = typeof pdfParseModule === "function" ? pdfParseModule : ((pdfParseModule as any).PDFParse || (pdfParseModule as any).default);
       if (!pdfParseFn) throw new Error("Could not resolve pdf-parse function.");
       
       const data = await pdfParseFn(buffer);
       return data.text;
    } else {
       // Fallback for standard text or markdown
       return buffer.toString("utf-8");
    }
  } catch (error: any) {
    console.error("Failed to extract text:", error);
    return `SYSTEM ERROR (File Extraction Failed): ${error?.message || error}`;
  }
}


export async function generateWisdomSummariesAction(context: string): Promise<WisdomSummary[]> {
  try {
    return await generateWisdomSummaries(context);
  } catch (error) {
    console.error("Failed to generate wisdom summaries:", error);
    return [];
  }
}

export async function chatWithLegacyAction(context: string, question: string, history: {role: string, text: string}[], linguisticContext?: string): Promise<string> {
  try {
    return await chatWithLegacy(context, question, history, linguisticContext);
  } catch (error: any) {
    console.error("Failed to chat with legacy:", error);
    return "SYSTEM ERROR: " + (error?.message || error);
  }
}

export async function conductActiveInterviewAction(history: { role: string; text: string }[], imageBase64?: string, persona?: string): Promise<string> {
  try {
    return await conductActiveInterview(history, imageBase64, persona);
  } catch (error: any) {
    console.error("Failed to conduct active interview:", error);
    return "SYSTEM ERROR: " + (error?.message || error);
  }
}

export async function extractHighFidelityStoriesAction(context: string, culturalContext?: string): Promise<HighFidelityStory[]> {
  try {
    return await extractHighFidelityStories(context, culturalContext);
  } catch (error) {
    console.error("Failed to extract high fidelity stories:", error);
    return [];
  }
}

export async function updateHighFidelityStoriesAction(cachedStories: HighFidelityStory[], newTranscript: string, culturalContext?: string): Promise<HighFidelityStory[]> {
  try {
    return await updateHighFidelityStoriesIncrementally(cachedStories, newTranscript, culturalContext);
  } catch (error) {
    console.error("Failed to update high fidelity stories:", error);
    return cachedStories;
  }
}
