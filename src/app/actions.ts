"use server";

import { processTranscriptForRag, generateInterviewQuestions, TranscriptChunk } from "@/lib/rag";

export async function processTranscriptAction(text: string): Promise<TranscriptChunk[]> {
  try {
    return await processTranscriptForRag(text);
  } catch (error) {
    console.error("Failed to process transcript:", error);
    return [];
  }
}

export async function generateQuestionsAction(context: string): Promise<string[]> {
  try {
    return await generateInterviewQuestions(context);
  } catch (error) {
    console.error("Failed to generate questions:", error);
    return [];
  }
}
