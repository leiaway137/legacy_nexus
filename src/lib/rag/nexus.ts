import { Type } from "@google/genai";
import { ai } from "./client";
import { Transcript } from "../../types";

/**
 * Uses gemini-2.5-pro for deep reasoning to extract precise interpersonal NexusLinks
 */
export async function extractNexusLinks(transcript: Transcript): Promise<{ name: string; context: string }[]> {
  const prompt = `
    You are an AI extracting interpersonal connections from a personal history transcript.
    
    Transcript Title: ${transcript.title}
    Transcript Text: "${transcript.text}"
    
    Task: Identify any specific individuals mentioned in this story (friends, family members, colleagues). 
    Extract their name and a brief 1-sentence summary of the event they were involved in.
    Return an empty array if no specific external peoples' names are mentioned.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-pro",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        description: "List of individuals referenced in the transcript.",
        items: {
          type: Type.OBJECT,
          properties: {
            name: {
              type: Type.STRING,
              description: "The name of the individual mentioned.",
            },
            context: {
              type: Type.STRING,
              description: "A 1-sentence summary of the event this person was involved in.",
            },
          },
        },
      },
    },
  });

  if (response.text) {
    return JSON.parse(response.text);
  }
  return [];
}
