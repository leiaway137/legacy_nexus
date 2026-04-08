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

export interface HighFidelityStory {
  id: string;
  era: string;
  title: string;
  synopsis: string;
  psychometrics: { label: string; val: number }[];
  rubric: {
    context: boolean;
    conflict: boolean;
    resolution: boolean;
    extraction: boolean;
  };
  gapPrompt: string | null;
}

export async function extractHighFidelityStories(transcriptContext: string): Promise<HighFidelityStory[]> {
  if (!transcriptContext.trim()) return [];
  
  const prompt = `
    You are an elite archivist and biographer for Legacy Nexus.
    Your task is to analyze the provided raw transcripts and extract distinct, high-fidelity narrative stories.
    For each extracted story, output the following structured data:
    1. A short, compelling 'title'.
    2. The chronological 'era'. You MUST map the era strictly to one of the following exact strings: "Childhood", "Teens", "Twenties", "Thirties", "Forties", or "Fifties+".
    3. A concise 'synopsis' detailing the specific memory.
    4. Exactly 6 'psychometrics'. You MUST output an array containing exactly these 6 labels representing the RIASEC model: "Realistic", "Investigative", "Artistic", "Social", "Enterprising", and "Conventional". Evaluate each between 0 and 100 based on how intensely the theme applies to the story (0 if not applicable).
    5. A completeness 'rubric' containing 4 booleans tracking if the story explicitly contains:
       - 'context': Does it establish the setting and background?
       - 'conflict': Is there a clear challenge, pivot, or escalation?
       - 'resolution': Is the outcome explained?
       - 'extraction': Did the narrator explicitly state the moral, life lesson, or specific takeaway?
    6. If the story has high conflict but 'extraction' is false, generate a 'gapPrompt' (a string prompting the user empathically to explain the moral of the story). Otherwise, provide null.
    
    If the context is short, return at least 1-2 distinct moments. If it's a long life history, return up to 5-10 major moments chronologically.

    Raw Context:
    "${transcriptContext}"
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              era: { type: Type.STRING },
              title: { type: Type.STRING },
              synopsis: { type: Type.STRING },
              psychometrics: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING },
                    val: { type: Type.INTEGER }
                  },
                  required: ["label", "val"]
                }
              },
              rubric: {
                type: Type.OBJECT,
                properties: {
                  context: { type: Type.BOOLEAN },
                  conflict: { type: Type.BOOLEAN },
                  resolution: { type: Type.BOOLEAN },
                  extraction: { type: Type.BOOLEAN }
                },
                required: ["context", "conflict", "resolution", "extraction"]
              },
              gapPrompt: { type: Type.STRING, nullable: true }
            },
            required: ["id", "era", "title", "synopsis", "psychometrics", "rubric"]
          }
        }
      }
    });

    if (response.text) {
      let raw = response.text;
      if (typeof raw === "function") raw = (raw as any)();
      raw = raw.replace(/^```(?:json)?\n?/i, '').replace(/```\n?$/i, '').trim();
      return JSON.parse(raw) as HighFidelityStory[];
    }
  } catch (error) {
    console.error("Failed to extract stories:", error);
  }
  return [];
}

export async function updateHighFidelityStoriesIncrementally(cachedStories: HighFidelityStory[], newTranscript: string): Promise<HighFidelityStory[]> {
  if (!newTranscript.trim() || cachedStories.length === 0) {
    return extractHighFidelityStories(newTranscript);
  }

  const prompt = `
    You are an elite archivist and biographer for Legacy Nexus.
    
    You are given an EXISTING JSON array of HighFidelityStory objects representing a user's known timeline.
    You are also given a NEW TRANSCRIPT containing added memories.
    
    Your task:
    1. Read the new transcript.
    2. Determine if the events described in the new transcript fall into the context of any EXISTING stories.
       - If YES: UPDATE the existing story. You can rewrite the 'synopsis' to include the new details, drastically update the 'psychometrics' (score 0 to 100 on Realistic, Investigative, Artistic, Social, Enterprising, Conventional) based on the new context, and update the 'rubric' booleans (e.g., if the new text provides the Conflict or Extraction that was missing). Remove the 'gapPrompt' if 'extraction' becomes true.
       - If NO: CREATE entirely new story objects and APPEND them to the array.
    3. Ensure ALL stories (existing and new) strictly adhere to the previously defined format. 
       - 'era' MUST strictly be "Childhood", "Teens", "Twenties", "Thirties", "Forties", or "Fifties+".
    
    Return the FULL, ENTIRE aggregated JSON array of all stories (updated existing ones + unmodified existing ones + newly appended ones).

    --- EXISTING JSON ARRAY ---
    ${JSON.stringify(cachedStories)}

    --- NEW TRANSCRIPT MATERIAL ---
    "${newTranscript}"
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              era: { type: Type.STRING },
              title: { type: Type.STRING },
              synopsis: { type: Type.STRING },
              psychometrics: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING },
                    val: { type: Type.INTEGER }
                  },
                  required: ["label", "val"]
                }
              },
              rubric: {
                type: Type.OBJECT,
                properties: {
                  context: { type: Type.BOOLEAN },
                  conflict: { type: Type.BOOLEAN },
                  resolution: { type: Type.BOOLEAN },
                  extraction: { type: Type.BOOLEAN }
                },
                required: ["context", "conflict", "resolution", "extraction"]
              },
              gapPrompt: { type: Type.STRING, nullable: true }
            },
            required: ["id", "era", "title", "synopsis", "psychometrics", "rubric"]
          }
        }
      }
    });

    if (response.text) {
      let raw = response.text;
      if (typeof raw === "function") raw = (raw as any)();
      raw = raw.replace(/^```(?:json)?\n?/i, '').replace(/```\n?$/i, '').trim();
      return JSON.parse(raw) as HighFidelityStory[];
    }
  } catch (error) {
    console.error("Failed to update incrementally:", error);
  }
  return cachedStories;
}
