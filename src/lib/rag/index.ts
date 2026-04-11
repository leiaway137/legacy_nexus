import { Type } from "@google/genai";
import { ai } from "./client";
export * from "./interviewer";

export async function generateTextEmbedding(text: string): Promise<number[]> {
  try {
    const response = await ai.models.embedContent({
      model: "gemini-embedding-2-preview",
      contents: text,
    });
    return response.embeddings?.[0]?.values || [];
  } catch (error) {
    console.error("Failed to generate embedding:", error);
    return [];
  }
}

export async function generateBatchTextMappings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  try {
    const response = await ai.models.embedContent({
      model: "gemini-embedding-2-preview",
      contents: texts,
    });
    return response.embeddings?.map(e => e.values || []) || [];
  } catch (error) {
    console.error("Failed to generate batch embedding:", error);
    return texts.map(() => []);
  }
}

export async function identifyDocumentPerspective(documentText: string): Promise<string> {
  // We only need a sample to deduce the perspective
  const sample = documentText.substring(0, 4000);
  
  const prompt = `
    You are an expert archivist and historical analyst.
    Your task is to identify the "relational perspective" of the following document.
    Who is speaking? What is their relationship to the subject matter or interviewer?
    
    Return ONLY a single, highly concise declarative sentence describing the speaker's relationship.
    Examples:
    - "The speaker is the maternal grandfather recounting his childhood."
    - "The speaker is the user's aunt discussing her university years."
    - "The speaker is the user recounting their own experiences."
    - "The speaker is the user's father answering interview questions."
    
    If the document seems to be a general historical text without a distinct personal perspective, return: "General unstructured historical context."
    
    Document Sample:
    "${sample}"
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        temperature: 0.1,
      }
    });
    return response.text?.trim() || "Unspecified personal perspective.";
  } catch (error) {
    console.error("Failed to identify perspective:", error);
    return "Unspecified personal perspective.";
  }
}

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
      
      LOGICAL CONSISTENCY & MEMORY CORRECTION: 
      The narrator is elderly and may naturally muddle names, roles, or timelines (e.g., confusing which child achieved what). You MUST cross-reference claims across the entire transcript. If there is a logical inconsistency (e.g., Daughter A is established as the chiropractor, but a later sentence claims Daughter B graduated from chiropractic school), deduce the highly probable truth and silently correct the muddled statement, assigning the achievement to the logically correct individual. Do not repeat the speaker's memory mistakes.

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
    
    LOGICAL CONSISTENCY & MEMORY CORRECTION: 
    The narrator is elderly and may naturally muddle names, roles, or timelines (e.g., confusing which child achieved what). You MUST cross-reference claims across the entire transcript. If there is a logical inconsistency (e.g., Daughter A is established as the chiropractor, but a later sentence claims Daughter B graduated from chiropractic school), deduce the highly probable truth and silently correct the muddled statement, assigning the achievement to the logically correct individual. Do not repeat the speaker's memory mistakes.

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

export async function chatWithLegacy(transcriptContext: string, question: string, history: {role: string, text: string}[] = [], linguisticContext?: string, relationalContext?: string): Promise<string> {
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
    - LOGICAL CONSISTENCY & MEMORY CORRECTION: The narrator is elderly and may naturally muddle names, roles, or timelines. You MUST cross-reference claims across the entire transcript. If there is a logical inconsistency (e.g., Daughter A is established as the chiropractor, but a later sentence claims Daughter B graduated from chiropractic school), deduce the highly probable truth and silently correct the muddled statement, assigning the achievement to the logically correct individual. Do not repeat the speaker's memory mistakes.
    ${linguisticContext ? `- LINGUISTIC CORRECTIONS: The speaker's cultural background/languages are: ${linguisticContext}. If you output any foreign words, recipes, or phrases that were translated phonetically in the transcript, elegantly guestimate their correct native romanization (e.g., Pinyin/Characters) and provide an English translation in brackets. NEVER output poor phonetic gibberish (e.g., instead of "Upcount E", use "Pipa Duck / 琵琶鴨").` : ''}
    ${relationalContext ? `- IDENTITY RESOLUTION ALIAS MAP: Use the following Identity Map to normalize names. When generating output, refer to individuals by their verified canonical 'Complete Name', even if the transcripts refer to them differently. ${relationalContext}` : ''}
    
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

export async function chatWithLegacyStream(transcriptContext: string, question: string, history: {role: string, text: string}[] = [], linguisticContext?: string, relationalContext?: string): Promise<ReadableStream> {
  if (!transcriptContext.trim()) throw new Error("No context provided.");
  let formattedHistory = history.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join("\\n");
  
  const prompt = `
    You are the "Legacy Nexus AI", a deeply analytical and narrative biographer akin to a premium research assistant (like NotebookLM).
    Your goal is to answer the user's question with extensive depth, empathy, and rich storytelling using ONLY the provided context.
    
    CRITICAL INSTRUCTIONS FOR YOUR RESPONSE:
    - Structure your response using well-defined, bolded thematic section headers (e.g., **A Tool for Integration and Social Status**).
    - Do not just output a brief bulleted list. Instead, write engaging, cohesive, multi-sentence paragraphs under each header.
    - CRITICAL RELATIONAL AWARENESS: Every context fragment provided below is tagged with a [Source Perspective]. You must use this tag to precisely identify who "I", "my brother", "my parents", and "she" refer to. Never confuse the speaker's family members with the interviewer's family members. Anchor your understanding of relationships STRICTLY to the [Source Perspective] tag for each specific fragment.
    - FRAGMENTED MEMORY AWARENESS: You are receiving isolated, non-sequential paragraphs retrieved from a vector database. You DO NOT have the full transcript. If these fragmented chunks contain ambiguous pronouns ("he", "she") or do not explicitly state family relationships, DO NOT wildly guess or mistakenly stitch different paragraphs together to invent a false family tree.
    - HALLUCINATION PREVENTION: If the exact answer is not clearly articulated in the specific fragments provided, you must explicitly tell the user that the retrieved memories don't contain the full detail, rather than hallucinating an incorrect narrative.
    ${linguisticContext ? `- LINGUISTIC CORRECTIONS: The speaker's cultural background/languages are: ${linguisticContext}. If you output any foreign words, recipes, or phrases that were translated phonetically in the transcript, elegantly guestimate their correct native romanization (e.g., Pinyin/Characters) and provide an English translation in brackets. NEVER output poor phonetic gibberish (e.g., instead of "Upcount E", use "Pipa Duck / 琵琶鴨").` : ''}
    ${relationalContext ? `- IDENTITY RESOLUTION ALIAS MAP: Use the following Identity Map to normalize names. When generating output, refer to individuals by their verified canonical 'Complete Name', even if the transcripts refer to them differently. ${relationalContext}` : ''}
    
    Context:
    "${transcriptContext}"
    
    Chat History:
    ${formattedHistory}
    
    User Question: ${question}
  `;

  const aiStream = await ai.models.generateContentStream({
    model: "gemini-2.5-flash",
    contents: prompt,
  });

  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of aiStream) {
          if (chunk.text) {
            controller.enqueue(encoder.encode(chunk.text));
          }
        }
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    }
  });
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
  linguisticCorrections?: { original: string; guess: string; meaning: string }[];
  peopleMentioned: string[];
}

export async function extractHighFidelityStories(transcriptContext: string, culturalContext?: string, relationalContext?: string, mainSubjectName?: string): Promise<HighFidelityStory[]> {
  if (!transcriptContext.trim()) return [];
  
  const prompt = `
    You are an elite archivist and biographer for Legacy Nexus.
    CRITICAL INSTRUCTION: The EXCLUSIVE MAIN SUBJECT of this biography is ${mainSubjectName || "the person being interviewed"}. 
    You MUST evaluate all text strictly from the perspective of ${mainSubjectName || "the subject"}'s life. Do NOT write stories focusing on the actions of the interviewer or tangential speakers. If the interviewer mentions what they are doing, ignore it.
    Your task is to analyze the provided raw transcripts and extract distinct, high-fidelity narrative stories about the Main Subject.
    For each extracted story, output the following structured data:
    1. A short, compelling 'title'.
    2. The chronological 'era'. You MUST map the era strictly to one of the following exact strings: "Childhood", "Teens", "Twenties", "Thirties", "Forties", "Fifties+", or "Timeless" (Use "Timeless" for generic life advice, recipes, philosophical beliefs, or non-chronological skills).
    3. A concise 'synopsis' detailing the specific memory.
    4. Exactly 6 'psychometrics'. You MUST output an array containing exactly these 6 labels representing the RIASEC model: "Realistic", "Investigative", "Artistic", "Social", "Enterprising", and "Conventional". Evaluate each between 0 and 100 based on how intensely the theme applies to the story (0 if not applicable).
    5. A completeness 'rubric' containing 4 booleans tracking if the story explicitly contains:
       - 'context': Does it establish the setting and background?
       - 'conflict': Is there a clear challenge, pivot, or escalation?
       - 'resolution': Is the outcome explained?
       - 'extraction': Did the narrator explicitly state the moral, life lesson, or specific takeaway?
    6. If the story has high conflict but 'extraction' is false, generate a 'gapPrompt' (a string prompting the user empathically to explain the moral of the story). Otherwise, provide null.
    7. LINGUISTIC CORRECTIONS: The narrator's cultural heritage/language background is: ${culturalContext || "Unknown"}. If the English transcript contains phonetically misspelled foreign words (e.g., Cantonese or Mandarin words rendered incorrectly into broken English by the audio transcriber), use your linguistic knowledge to intelligently deduce the intended word. Add each correction to the 'linguisticCorrections' array.
    8. Extract any unique names of people explicitly mentioned in the story into the 'peopleMentioned' string array.
    ${relationalContext ? `CRITICAL RELATIONAL CONTEXT: Normalize and refer to individuals using the following Identity Map when generating synopses and labels: ${relationalContext}` : ''}

    Extract 1 to 3 highly granular, profoundly distinct thematic events from this specific chunk of text. Do NOT lazily merge multiple life events into a single generalized card. Demand granularity. Do not hallucinate events that are not explicitly in the text.
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
              gapPrompt: { type: Type.STRING, nullable: true },
              linguisticCorrections: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    original: { type: Type.STRING },
                    guess: { type: Type.STRING },
                    meaning: { type: Type.STRING }
                  },
                  required: ["original", "guess", "meaning"]
                }
              },
              peopleMentioned: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ["id", "era", "title", "synopsis", "psychometrics", "rubric", "peopleMentioned"]
          }
        }
      }
    });

    if (response.text) {
      let raw = response.text;
      if (typeof raw === "function") raw = (raw as any)();
      raw = raw.replace(/^```(?:json)?\n?/i, '').replace(/```\n?$/i, '').trim();
      try {
         return JSON.parse(raw) as HighFidelityStory[];
      } catch (err: any) {
         throw new Error("JSON Parse Failed: " + err.message + "\\n\\nRaw: " + raw.substring(0, 300));
      }
    }
    throw new Error("No response text from Gemini");
  } catch (error: any) {
    console.error("Failed to extract stories:", error);
    throw new Error(error.message || "Unknown RAG index error");
  }
}

export async function reduceHighFidelityStories(cachedStories: HighFidelityStory[], rawNewStories: HighFidelityStory[], culturalContext?: string, relationalContext?: string): Promise<HighFidelityStory[]> {
  if (rawNewStories.length === 0 && !relationalContext) {
    return cachedStories;
  }
  if (cachedStories.length === 0 && rawNewStories.length > 0) {
    return rawNewStories;
  }

  const prompt = `
    You are an elite archivist and biographer for Legacy Nexus.
    
    You are given an EXISTING JSON array of HighFidelityStory objects representing a user's known timeline.
    You are also given a NEW RAW JSON ARRAY of highly granular unorganized stories extracted from recent documents.
    
    Your task:
    1. Read the newly extracted raw stories.
    2. Determine if the events described in the raw stories fall into the context of any EXISTING stories.
       - If YES: MERGE them. UPDATE the existing story. You can rewrite the 'synopsis' to include the new robust details, drastically update the 'psychometrics' based on the newly merged context, and update the 'rubric' booleans. Remove the 'gapPrompt' if 'extraction' becomes true.
       - If NO: CREATE entirely new story objects and APPEND them to the array. Do not lazily summarize them; preserve their granularity.
    3. Ensure ALL stories (existing and new) strictly adhere to the previously defined format. 
       - 'era' MUST strictly be "Childhood", "Teens", "Twenties", "Thirties", "Forties", "Fifties+", or "Timeless" (Use "Timeless" for generic themes, recipes, and life philosophies).
    4. LINGUISTIC CORRECTIONS: The narrator's cultural heritage/language background is: ${culturalContext || "Unknown"}. If the synopses contain phonetically misspelled foreign words, intelligently deduce the intended word and log it to 'linguisticCorrections'.
    5. Ensure the 'peopleMentioned' array is an aggregate unique list of names involved in the merged story.
    ${relationalContext ? `CRITICAL RELATIONAL CONTEXT: Normalize and rewrite mentions in the 'synopsis' and 'title' to strictly follow this Identity Map, effectively replacing invalid aliases with canonical names: ${relationalContext}` : ''}
    
    Return the FULL, ENTIRE aggregated JSON array of all stories (updated existing ones + unmodified existing ones + newly appended ones).

    --- EXISTING JSON ARRAY (MASTER TIMELINE) ---
    ${JSON.stringify(cachedStories)}

    --- NEW RAW EXTRACTED STORIES (MAPPED JSON) ---
    ${JSON.stringify(rawNewStories)}
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
              gapPrompt: { type: Type.STRING, nullable: true },
              linguisticCorrections: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    original: { type: Type.STRING },
                    guess: { type: Type.STRING },
                    meaning: { type: Type.STRING }
                  },
                  required: ["original", "guess", "meaning"]
                }
              },
              peopleMentioned: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ["id", "era", "title", "synopsis", "psychometrics", "rubric", "peopleMentioned"]
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

export async function recompileHighFidelityStories(cachedStories: HighFidelityStory[], relationalContext: string): Promise<HighFidelityStory[]> {
  if (cachedStories.length === 0 || !relationalContext) return cachedStories;

  const prompt = `
    You are an elite archivist and biographer for Legacy Nexus.
    
    You are given an EXISTING JSON array of HighFidelityStory objects representing a user's known timeline.
    The user has verified their identity map (Aliases -> Canonical Name).
    
    Your task:
    1. Read the existing stories.
    2. Normalize ALL mentions inside the 'title' and 'synopsis' fields strictly following the Identity Map provided below. Replace all invalid aliases with the canonical 'Complete Name'.
    3. Update the 'peopleMentioned' string array to reflect only the canonical names.
    4. Do not alter 'id', 'era', 'psychometrics', or 'rubric' - JUST normalize the textual names.
    
    CRITICAL RELATIONAL CONTEXT: Normalize to this Identity Map: ${relationalContext}
    
    Return the FULL, ENTIRE aggregated JSON array of all normalized stories.

    --- EXISTING JSON ARRAY ---
    ${JSON.stringify(cachedStories)}
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
                  properties: { label: { type: Type.STRING }, val: { type: Type.INTEGER } },
                  required: ["label", "val"]
                }
              },
              rubric: {
                type: Type.OBJECT,
                properties: { context: { type: Type.BOOLEAN }, conflict: { type: Type.BOOLEAN }, resolution: { type: Type.BOOLEAN }, extraction: { type: Type.BOOLEAN } },
                required: ["context", "conflict", "resolution", "extraction"]
              },
              gapPrompt: { type: Type.STRING, nullable: true },
              linguisticCorrections: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: { original: { type: Type.STRING }, guess: { type: Type.STRING }, meaning: { type: Type.STRING } },
                  required: ["original", "guess", "meaning"]
                }
              },
              peopleMentioned: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["id", "era", "title", "synopsis", "psychometrics", "rubric", "peopleMentioned"]
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
    console.error("Failed to recompile stories with contacts:", error);
  }
  return cachedStories;
}

export interface DashboardOverview {
  synopsis: string;
  wisdom: WisdomSummary[];
  questions: string[];
}

export async function reduceDashboardOverview(currentOverview: DashboardOverview | null, newTranscript: string, mainSubjectName?: string): Promise<DashboardOverview> {
  const prompt = `
    You are an expert biographer for Legacy Nexus.
    You are incrementally building a master dashboard overview of a person's life story using the Map-Reduce pattern.
    
    CRITICAL INSTRUCTION: The EXCLUSIVE MAIN SUBJECT of this overview is ${mainSubjectName || "the person being interviewed"}. 
    You MUST evaluate all text strictly from the perspective of ${mainSubjectName || "the subject"}'s life. Do NOT write summaries focusing on the actions of the interviewer or tangential speakers.

    Here is the EXISTING overview derived from previously analyzed documents:
    Synopsis: ${currentOverview?.synopsis || "(None yet)"}
    Wisdom Themes: ${JSON.stringify(currentOverview?.wisdom || [])}
    Pending Interview Questions: ${JSON.stringify(currentOverview?.questions || [])}

    Here is the NEW transcript from the next mapped document to fold into the master overview:
    "${newTranscript}"

    Task:
    1. CONDENSE and merge the new transcript's events into the master Synopsis. 
       CRITICAL: The final synopsis MUST be a highly abstracted, emotionally resonant high-level biography. 
       It MUST NOT exceed 3 concise paragraphs (approx 300 words total). Do NOT endlessly append facts. 
       Synthesize the core essence of their journey and aggressively REMOVE minor/tangential details to keep it highly readable. Format with proper paragraph breaks.
    2. Extract granular life themes (e.g., "#FirstLove", "#Resilience") from the new document and merge them into the Wisdom Themes. Update existing theme descriptions or append new ones to cleanly cover the new transcript context. Limit to around 10-20 highly potent themes overall.
    3. Based on the *entire* logically merged context, generate exactly 3 deep, empathetic follow-up questions for the AI Interviewer to ask the user next.

    Return the final securely merged output adhering to the JSON schema.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            synopsis: { type: Type.STRING },
            wisdom: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  tag: { type: Type.STRING },
                  summary: { type: Type.STRING }
                },
                required: ["tag", "summary"]
              }
            },
            questions: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["synopsis", "wisdom", "questions"]
        }
      }
    });

    if (response.text) {
      let raw = response.text;
      if (typeof raw === "function") raw = (raw as any)();
      raw = raw.replace(/^```(?:json)?\n?/i, '').replace(/```\n?$/i, '').trim();
      return JSON.parse(raw) as DashboardOverview;
    }
  } catch (err: any) {
    console.error("Dashboard Map-Reduce failed:", err);
    throw err;
  }
  
  return currentOverview || { synopsis: "", wisdom: [], questions: [] };
}
