import { Type } from "@google/genai";
import { ai } from "./client";
import { InterviewSession } from "../../types";

/**
 * Uses gemini-2.5-flash for rapid, conversational, and empathetic question generation
 */
export async function generateFollowUpQuestions(session: InterviewSession, latestTranscriptExcerpt: string): Promise<string[]> {
  const prompt = `
    You are the "AI Interviewer" for a platform preserving generational wisdom. 
    You are talking to a LegacyKeeper. Be deeply empathetic, extremely curious, and gentle.
    
    Session Context: ${session.topicContext}
    Prompt Rules: ${session.promptRules}
    
    Latest Story Excerpt from the LegacyKeeper:
    "${latestTranscriptExcerpt}"
    
    Task: Based on their story, generate exactly 3 profound, follow-up questions to ask them next. Focus on extracting feelings, life lessons, and sensory details.
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
