import { Type } from "@google/genai";
import { ai } from "./client";
export * from "./interviewer";

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
    "${transcriptText}" // Using full context, Gemini Flash has a 1M token window.
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
    let raw = response.text;
    if (typeof raw === "function") raw = (raw as any)();
    raw = raw.replace(/^```(?:json)?\n?/i, '').replace(/```\n?$/i, '').trim();
    return JSON.parse(raw) as TranscriptChunk[];
  }
  return [];
}

export async function generateSynopsis(transcriptContext: string): Promise<string> {
  if (!transcriptContext.trim()) return "No sources provided to generate a synopsis.";
  try {
    const prompt = `
      You are an expert biographer and corporate historian.
      Based strictly on the following source materials, output a highly engaging, cohesive, 1-paragraph synopsis (around 150-200 words) summarizing the life, career, and core themes of the individual discussed in the texts.
      The synopsis should sound like a premium history book introduction or a NotebookLM Overview. Write cleanly without Markdown bolding everywhere.
      Combine findings elegantly if multiple sources are present.

      Sources context:
      ${transcriptContext} // Provide full context for highest fidelity questions
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    return response.text || "Synopsis could not be generated.";
  } catch (error) {
    console.error("Gemini Synopsis failed:", error);
    return "Synopsis unavailable at this time due to processing constraints.";
  }
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
    let raw = response.text;
    if (typeof raw === "function") raw = (raw as any)();
    raw = raw.replace(/^```(?:json)?\n?/i, '').replace(/```\n?$/i, '').trim();
    return JSON.parse(raw) as string[];
  }
  return [];
}

export interface WisdomSummary {
  tag: string;
  summary: string;
}

export async function generateWisdomSummaries(transcriptContext: string): Promise<WisdomSummary[]> {
  if (!transcriptContext.trim()) return [];
  const prompt = `
    You are an expert biographer for Legacy Nexus.
    Analyze the full provided transcript and explicitly identify an extensive list of specific, granular life themes and events (e.g., "#FirstLove", "#Resilience", "#CareerPivot", "#Bowling", "#ChinatownLife").
    The number of tags should elegantly scale with the length and breadth of the transcript context (typically 10-30 tags depending on volume). Please do not artificially limit the tags; be specific, exhaustive, and avoid clumping details into a few broad corporate categories.
    For each theme, write a compelling, comprehensive summary of the individual's view or experience regarding that theme, based on all the provided text.
    The summary should not just be a snippet, but a thought-out synthesis of their perspective.

    Raw Transcript Context:
    "${transcriptContext}" // Using full context
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          description: "An extensive list of specific, granular wisdom themes (10-30 tags depending on the text size) and their synthesized summaries.",
          items: {
            type: Type.OBJECT,
            properties: {
              tag: {
                type: Type.STRING,
                description: "The thematic tag, must start with a hashtag (e.g. #FirstLove)",
              },
              summary: {
                type: Type.STRING,
                description: "A compelling, AI-processed summary of the individual's views regarding this theme based on the full transcript.",
              },
            },
            required: ["tag", "summary"],
          },
        },
      },
    });

    if (response.text) {
      let raw = response.text;
      if (typeof raw === "function") raw = (raw as any)();
      raw = raw.replace(/^```(?:json)?\n?/i, '').replace(/```\n?$/i, '').trim();
      return JSON.parse(raw) as WisdomSummary[];
    }
  } catch (error) {
    console.error("Gemini Wisdom Summaries failed:", error);
  }
  return [];
}

export async function chatWithLegacy(transcriptContext: string, question: string, history: {role: string, text: string}[] = []): Promise<string> {
  if (!transcriptContext.trim()) return "No context provided. Please try again.";
  let formattedHistory = history.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join("\\n");
  
  const prompt = `
    You are the "Legacy Nexus AI", a deeply analytical and narrative biographer akin to a premium research assistant (like NotebookLM).
    Your goal is to answer the user's question with extensive depth, empathy, and rich storytelling using ONLY the provided context.
    
    CRITICAL INSTRUCTIONS FOR YOUR RESPONSE:
    - Structure your response using well-defined, bolded thematic section headers (e.g., **A Tool for Integration and Social Status**).
    - Do not just output a brief bulleted list. Instead, write engaging, cohesive, multi-sentence paragraphs under each header.
    - Extract highly specific details, quotes, and anecdotes from the source context to support your points.
    - Connect the themes to their broader life narrative, such as family, immigration, or personal philosophy.
    - Use Markdown gracefully.
    - If the answer is truly not in the context, say that you don't have enough information, but always try to synthesize related themes if possible.
    
    Context:
    "${transcriptContext}"
    
    Chat History:
    ${formattedHistory}
    
    User Question: ${question}
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    return response.text || "I'm having trouble retrieving an answer right now.";
  } catch (error) {
    console.error("Gemini Chat failed:", error);
    return "I encountered an error trying to process your request.";
  }
}
