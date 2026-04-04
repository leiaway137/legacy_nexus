import { Type } from "@google/genai";
import { ai } from "./client";

export interface TranscriptChunk {
  text: string;
  wisdomTags: string[];
}

export async function processTranscriptForRag(transcriptText: string): Promise<TranscriptChunk[]> {
  const prompt = `
    You are an expert archivist for Legacy Nexus, a platform that preserves life stories.
    Your task is to segment a raw transcript into logical narrative chunks.
    For each chunk, provide the text segment and 2-3 relevant "Wisdom Tags" (e.g., "#Resilience", "#CareerPivot").

    Raw Transcript:
    "${transcriptText}"
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        description: "A list of logical narrative chunks with wisdom tags.",
        items: {
          type: Type.OBJECT,
          properties: {
            text: {
              type: Type.STRING,
              description: "The verbatim text segment from the transcript.",
            },
            wisdomTags: {
              type: Type.ARRAY,
              description: "A list of 2-3 short, hashtag-style strings representing the themes.",
              items: { type: Type.STRING },
            },
          },
          required: ["text", "wisdomTags"],
        },
      },
    },
  });

  if (response.text) {
    return JSON.parse(response.text) as TranscriptChunk[];
  }
  return [];
}

export async function generateInterviewQuestions(context: string): Promise<string[]> {
  const prompt = `
    You are the "AI Interviewer" for a LegacyKeeper. 
    Based on the context provided, generate exactly 3 deep, empathetic, and customized follow-up questions to ask the user next.
    
    Context:
    "${context}"
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        description: "A list of 3 insightful follow-up questions.",
        items: {
          type: Type.STRING,
        },
      },
    },
  });

  if (response.text) {
    return JSON.parse(response.text) as string[];
  }
  return [];
}
