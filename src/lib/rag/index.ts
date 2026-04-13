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

export async function generateLegacyIdentityContext(primaryRiasec: string, secondaryRiasec: string, dominantExtraction: string, dualTitle: string): Promise<string> {
  const prompt = `
    You are an expert biographer for Legacy Nexus.
    The strict mathematical engine has algorithmically processed the user's Legacy transcripts.
    
    FACTS:
    - Primary Operating Dimension: ${primaryRiasec}
    - Secondary Internal Compass: ${secondaryRiasec}
    - Dominant Life Reflection Theme: ${dominantExtraction}
    - Assigned Hybrid Title: ${dualTitle}
    
    TASK: Write a single, profound, narrative-style one-sentence 'Legacy Identity' explaining why this specific mix of external trajectory and internal wisdom defines the user. Address the user directly (e.g., "You have spent your life..."). Keep the diction empathetic, highly prestigious, and sharp. Do not hallucinate extra facts. Output ONLY the one sentence string, no markdown.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    if (response.text) {
       let raw = response.text;
       if (typeof raw === "function") raw = (raw as any)();
       return raw.trim();
    }
  } catch (error) {
    console.error("Gemini Archetype Context failed:", error);
  }
  return "You have forged a legacy deeply rooted in dynamic action and nuanced personal philosophy.";
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
    ${relationalContext ? `- IDENTITY RESOLUTION ALIAS MAP: Use the following Identity Map to perfectly understand relationships and entity names: ${relationalContext}\n    - CONVERSATIONAL NAMING RULE: Do NOT awkwardly repeat full 'Complete Names' (e.g., 'Albert Yi Lei', 'Tiffany Ann Lei') over and over. Use natural, conversational references (e.g., 'Albert', 'Tiffany', 'your dad', 'his son') just as a human would. Only use full names if formally introducing a new entity for the first time or if necessary for disambiguation. Use common sense to make the dialogue feel natural.` : ''}
    
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
  };
  extraction: {
    present: boolean;
    depthLevel: number;
    primaryCategory: "Resilience" | "Relational" | "Philosophical" | "Competence" | "Self-Awareness" | "Regret" | "Achievement" | "Impact" | "Stewardship" | "Expression" | "Physicality" | "None";
    secondaryCategory: "Resilience" | "Relational" | "Philosophical" | "Competence" | "Self-Awareness" | "Regret" | "Achievement" | "Impact" | "Stewardship" | "Expression" | "Physicality" | "None";
    insightSummary: string;
    legacyLesson: string;
    rawQuote: string;
  };
  impact_metadata?: {
    emotional_intensity: number;
    narrative_complexity: number;
    duration_weight: number;
  };
  gapPrompt?: string;
  linguisticCorrections?: { original: string; guess: string; meaning: string }[];
  peopleMentioned?: string[];
}

export async function extractHighFidelityStories(transcriptContext: string, culturalContext?: string, relationalContext?: string, identityContext?: string): Promise<HighFidelityStory[]> {
  if (!transcriptContext.trim()) return [];
  
  const prompt = `
    You are an elite archivist and biographer for Legacy Nexus.
    CRITICAL INSTRUCTION: The EXCLUSIVE MAIN SUBJECT of this biography is defined by: ${identityContext || "the person being interviewed"}. 
    You MUST evaluate all text strictly from the perspective of the subject's life. Do NOT write stories focusing on the actions of the interviewer or tangential speakers. If the interviewer mentions what they are doing, ignore it.
    ${identityContext ? `CRITICAL IDENTITY AWARENESS: ${identityContext}. You MUST write all generated story synopses, insight summaries, and legacy lessons respecting these pronouns and identity strictly.` : ''}
    CRITICAL TONE INSTRUCTION: Do NOT repeatedly use the subject's full formal name (e.g. do not write "John Doe visited his Aunt"). Write in an intimate, informal tone using their first name only or appropriate pronouns. The writing should feel like a personal memoir, not a Wikipedia article.
    Your task is to analyze the provided raw transcripts and extract distinct, high-fidelity narrative stories about the Main Subject.
    For each extracted story, output the following structured data:
    1. A short, compelling 'title'.
    2. The chronological 'era'. You MUST map the era strictly to one of the following exact strings: "Childhood", "Teens", "Twenties", "Thirties", "Forties", "Fifties+", or "Timeless" (Use "Timeless" for generic life advice, recipes, philosophical beliefs, or non-chronological skills).
    3. A concise 'synopsis' detailing the specific memory.
    4. Exactly 6 'psychometrics'. You MUST output an array containing exactly these 6 labels representing the RIASEC model: "Realistic", "Investigative", "Artistic", "Social", "Enterprising", and "Conventional". Evaluate each between 0 and 100 based on how intensely the theme applies to the story (0 if not applicable).
       - TWO-TIER WEIGHTING SYSTEM: You MUST aggressively weight the intensity of the RIASEC dimensions based on the 'primaryCategory' extraction you just mapped:
         > If Relational or Resilience -> heavily weight 'Social'.
         > If Achievement or Impact -> heavily weight 'Enterprising'.
         > If Stewardship -> heavily weight 'Conventional'.
         > If Expression or Self-Awareness -> heavily weight 'Artistic'.
         > If Philosophical -> heavily weight 'Investigative'.
         > If Physicality -> heavily weight 'Realistic'.
         > If Competence -> weight Realistic, Investigative, or Conventional depending on the task type (hand-skill vs theory vs records).
    5. A completeness 'rubric' containing 3 booleans tracking if the story explicitly contains:
       - 'context': Does it establish the setting and background?
       - 'conflict': Is there a clear challenge, pivot, or escalation?
       - 'resolution': Is the outcome explained?
    6. An 'extraction' object analyzing the lesson or moral using a 0-3 Depth Scale. Use the following Step-by-Step Identification Procedure:
       - Locate the Reflection: Ignore the "Action" of the story. Focus only on the narrator's "Post-Event Commentary."
       - Apply the Elimination Filter to assign a 'primaryCategory' and a distinct 'secondaryCategory'. MUST strictly be one of these exact strings: "Resilience", "Relational", "Philosophical", "Competence", "Self-Awareness", "Regret", "Achievement", "Impact", "Stewardship", "Expression", "Physicality", or "None" (if level 0).
         > If getting back up/endurance -> Resilience.
         > If human nature/person/boundaries -> Relational.
         > If global truths/worldview -> Philosophical.
         > If work/skills/how things work -> Competence.
         > If their own flaws/traits/ego -> Self-Awareness.
         > If painful mistakes/lost time/warnings -> Regret.
         > If winning, pride, or crossing a finish line -> Achievement.
         > If influence, leadership, action, or managing capital -> Impact.
         > If honoring traditions, preservation, or keeping systems alive -> Stewardship.
         > If unique style, beauty, creativity, or unconventional thinking -> Expression.
         > If working with hands, nature, tools, or physical labor -> Physicality.
       - Assign 'depthLevel': an integer from 0 to 3. If absent = 0. (Level 1: literal lesson. Level 2: Internalized/emotional growth. Level 3: Transcendental/Universal wisdom). 
       - 'present': boolean (true if level > 0).
       - 'insightSummary': A concise summary explaining the narrator's personal subjective realization.
       - 'legacyLesson': The Transferable Wisdom. Convert the narrator's specific experience into a generalized universal truth.
       - 'rawQuote': An exact, verbatim quote from the transcript demonstrating this extraction (or an empty string if none exists).
    7. LINGUISTIC CORRECTIONS: The narrator's cultural heritage/language background is: ${culturalContext || "Unknown"}. If the English transcript contains phonetically misspelled foreign words (e.g., Cantonese or Mandarin words rendered incorrectly into broken English by the audio transcriber), use your linguistic knowledge to intelligently deduce the intended word. Add each correction to the 'linguisticCorrections' array.
    8. Calculate the 'impact_metadata' containing three core properties that assign gravitational weight to this specific story in the database:
       - 'emotional_intensity' (1-5 scale): Score Intensity 1-2 (Snapshot): Casual mentions, low emotional stakes, routine events. Score 3-4 (Pivot): Significant life changes, clear conflict, emotional vulnerability, lessons learned. Score 5 (Core): Life-defining moments, extreme hardship/success, fundamental shifts in identity.
       - 'narrative_complexity' (1-5 scale): How intricate is the sequence of events and decision making?
       - 'duration_weight' (1.0 to 2.0 scale): Evaluate the raw verbosity and detail of this specific event in the transcript. 1.0 for brief mentions, 1.5 for dedicated paragraphs, 2.0 for exhaustive, multi-paragraph sagas.
    9. Extract any unique names of people explicitly mentioned in the story into the 'peopleMentioned' string array.
    10. 'gapPrompt': If this story lacks a mature extraction ('present' is false or 'depthLevel' <= 1), generate a highly customized, unique question about this SPECIFIC story that challenges the narrator to find the overarching moral lesson. Do NOT use generic/repetitive language formatting. Directly reference the specific names and concrete events of this story to formulate a probing question bridging the literal event to a universal truth.
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
                  resolution: { type: Type.BOOLEAN }
                },
                required: ["context", "conflict", "resolution"]
              },
              extraction: {
                type: Type.OBJECT,
                properties: {
                  present: { type: Type.BOOLEAN },
                  depthLevel: { type: Type.INTEGER },
                  primaryCategory: { type: Type.STRING },
                  secondaryCategory: { type: Type.STRING },
                  insightSummary: { type: Type.STRING },
                  legacyLesson: { type: Type.STRING },
                  rawQuote: { type: Type.STRING }
                },
                required: ["present", "depthLevel", "primaryCategory", "secondaryCategory", "insightSummary", "legacyLesson", "rawQuote"]
              },
              impact_metadata: {
                type: Type.OBJECT,
                properties: {
                  emotional_intensity: { type: Type.INTEGER },
                  narrative_complexity: { type: Type.INTEGER },
                  duration_weight: { type: Type.NUMBER }
                },
                required: ["emotional_intensity", "narrative_complexity", "duration_weight"]
              },
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
              },
              gapPrompt: { type: Type.STRING, nullable: true }
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
       - If YES: MERGE them. UPDATE the existing story. You can rewrite the 'synopsis' to include the new robust details, drastically update the 'psychometrics' based on the newly merged context, and update the 'rubric' booleans. Remove the 'gapPrompt' if 'extraction' becomes true. If 'extraction' remains false, completely REWRITE the 'gapPrompt' to explicitly reference the newly synthesized narrative details and ask a highly specific, penetrating question to prompt the narrator for a deeper moral lesson.
       - If NO: CREATE entirely new story objects and APPEND them to the array. Do not lazily summarize them; preserve their granularity. If 'extraction' is false, generate a highly specific, context-aware 'gapPrompt' referencing literal story events.
    3. Ensure ALL stories (existing and new) strictly adhere to the previously defined format. 
       - 'era' MUST strictly be "Childhood", "Teens", "Twenties", "Thirties", "Forties", "Fifties+", or "Timeless" (Use "Timeless" for generic themes, recipes, and life philosophies).
    4. LINGUISTIC CORRECTIONS: The narrator's cultural heritage/language background is: ${culturalContext || "Unknown"}. If the synopses contain phonetically misspelled foreign words, intelligently deduce the intended word and log it to 'linguisticCorrections'.
    5. Ensure the 'peopleMentioned' array is an aggregate unique list of names involved in the merged story.
    ${relationalContext ? `CRITICAL RELATIONAL CONTEXT: Normalize and rewrite mentions in the 'synopsis' and 'title' to strictly follow this Identity Map, effectively replacing invalid aliases with canonical names: ${relationalContext}` : ''}
    
    CRITICAL TONE INSTRUCTION: Do NOT repeatedly use the subject's full formal name. Write in an intimate, informal tone using their first name only or appropriate pronouns. The writing should feel like a personal memoir, not a Wikipedia article.

    CRITICAL OUTPUT INSTRUCTION: 
    Return ONLY a JSON array containing the specific stories that were UPDATED (merged) AND the ENTIRELY NEW stories. 
    DO NOT output any existing stories from the master timeline that were untouched or unmodified by this new data.
    If you modified an existing story, you MUST preserve its exact existing 'id'. If you created a new story, generate a new unique 'id' string (e.g. "new-uuid-123").

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
      const deltaStories = JSON.parse(raw) as HighFidelityStory[];
      
      // Server-side merge of deltas to prevent loss of unmodified stories
      const updatedCache = [...cachedStories];
      for (const delta of deltaStories) {
          const existingIdx = updatedCache.findIndex(s => s.id === delta.id);
          if (existingIdx !== -1) {
              updatedCache[existingIdx] = delta;
          } else {
              updatedCache.push(delta);
          }
      }
      return updatedCache;
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
    4. Do not alter 'id', 'era', 'psychometrics', or 'rubric'.
    5. CRITICAL GAP PROMPT BACKFILL: If an existing story is missing an explicit 'gapPrompt' OR if its current extraction is weak (depthLevel <= 1), you MUST actively backfill and generate a highly customized 'gapPrompt' that challenges the narrator to find the overarching moral lesson. Directly reference the specific literal events and canonical names from the synopsis. Do NOT use generic/repetitive language.
    
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

export async function generateDriftInsight(
  eraA: string,
  archetypeA: string,
  eraB: string,
  archetypeB: string,
  storyContextA: string,
  storyContextB: string
): Promise<string> {
  const prompt = `
    You are an expert, empathetic biographer analyzing the temporal evolution of a person's life across different eras.
    We are charting a "River" of their psychological focus, measuring transitions using the RIASEC framework.

    The user experienced a significant "Drift" or pivot:
    - During their ${eraA}, their dominant mode of operating was: ${archetypeA}
    - During their ${eraB}, their dominant mode of operating shifted precisely to: ${archetypeB}

    Here are summaries of the core experiences from their ${eraA}:
    ${storyContextA || "(No major documented core memories for this era.)"}

    Here are summaries of the core experiences from their ${eraB}:
    ${storyContextB || "(No major documented core memories for this era.)"}

    CRITICAL INSTRUCTION: Do NOT write generic, fortune-cookie philosophy. You MUST explicitly reference the tangible people, physical events, and literal occurrences described in the story context above.
    CRITICAL FORMATTING INSTRUCTION: 
    Do NOT use quotation marks when referencing information drawn from the user's stories. Instead, **bold** the important information and story titles.
    Do NOT use "River of Time" or water analogies (no rivers, currents, confluence, streams, aquaducts, etc.).
    Keep it profound, highly empathetic, but intensely literal. Use the second person ("You").

    Generate the synthesis using EXACTLY the following Markdown structure:
    
    > **"[Summary Quote: A bold, high-level insight summarizing the shift from ${archetypeA} to ${archetypeB}]"**

    #### **The Narrative Drift**
    [Compare the past era (${eraA}) to the current era (${eraB}), explaining the psychological change without using water anomalies. Be direct.]

    #### **The Catalyst of Action**
    [Bullet points of specific story evidence verifying this transition. Bold the specific story names and literal actions.]

    #### **The Architect's Reflection**
    [A final philosophical closing statement defining the legacy of this pivot.]
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    return response.text || "Your current shifted seamlessly into this new era, driven by personal evolution.";
  } catch (err: any) {
    console.error("Failed to generate drift insight:", err);
    return "A shift in your life trajectory naturally evolved during this time.";
  }
}

export async function generateLegacyDeepDive(
  dominantTrait: string,
  flaw: string,
  flawScore: number,
  exampleStoryTitle: string,
  exampleStoryContext?: string
): Promise<{ title: string; analysis: string; prompt: string }> {
  const prompt = `
    You are an elite, deeply empathetic biographer and psychological "Architect" evaluating a user's life archive.
    You have detected a critical structural narrative tension in their life story. 
    
    Data:
    - Broad Category Pattern: ${dominantTrait}
    - Frictional Weakness (${flaw}): only ${Math.round(flawScore * 100)}% structural representation in their stories.
    - Specifically, a defining narrative memory from their life is titled "${exampleStoryTitle}". 
    - The actual literal events of that memory: ${exampleStoryContext || "(No memory context provided)"}

    CRITICAL RULE: DO NOT assign them a generic "archetype", "Holland Code", or fortune-cookie title like "The Titan" or "The Social Navigator". Their life is far more complex than a label. Do not use paradoxical titles.

    Your task is to write a deeply personalized, beautiful "Architect Observation" regarding this structural tension.
    You must output JSON with exactly three fields:
    1. "title": A beautiful, literal title derived directly from the specific events in the story (e.g., "The Weight of the Departure", "Silence During the Storm"). Do NOT use archetypes.
    2. "analysis": A stunning, deeply detailed 5-to-10 paragraph psychological essay. You MUST use markdown paragraphs (separated by double newlines). Dive extremely deep into the dissonance between their outward actions (as described in the event) and their profound internal timeline. Explicitly cite specific people, places, and actions from the "${exampleStoryTitle}" memory. Write like a master biographer analyzing an incredible life. Do NOT use abstract metaphors.
    3. "prompt": A sharp, gentle, but profound challenge question (1 paragraph). Challenge them to finally reflect on the internal realities and unspoken costs of the absolute specific events in "${exampleStoryTitle}". Anchor it exclusively in the memory.

    Output strict JSON format.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.7,
      }
    });

    if (response.text) {
      let raw = response.text;
      if (typeof raw === "function") raw = (raw as any)();
      raw = raw.replace(/^```(?:json)?\n?/i, '').replace(/```\n?$/i, '').trim();
      return JSON.parse(raw);
    }
  } catch (error) {
    console.error("Failed to generate deep dive:", error);
  }
  return {
     title: "The Architect's Synthesis",
     analysis: "Your timeline reveals powerful actions but leaves many internal realizations unsaid.",
     prompt: "Looking back at your greatest achievements, what did they cost you internally?"
  };
}

export async function extractDemographicsFromTranscript(transcriptText: string): Promise<Record<string, string>> {
  if (!transcriptText.trim()) return {};
  
  const prompt = `
    You are the "Identity Harvester" for Legacy Nexus.
    Your task is to silently read the following raw interview transcript and extract any explicitly stated demographic information.
    
    CRITICAL INSTRUCTION: DO NOT GUESS OR MAKE ASSUMPTIONS. Do not extract information from the interviewer's prompts. 
    Only extract information actively provided by the individual being interviewed. If a field is not explicitly mentioned, omit it entirely from the output JSON.
    
    The schema fields are:
    - firstName: (e.g., Albert)
    - lastName:
    - pronouns: ("He/Him", "She/Her", "They/Them", etc)
    - placeOfBirth: (e.g., Hong Kong)
    - residence: 
    - culturalHeritage: (e.g., Han Chinese, Irish-American)
    - primaryLanguage:

    Transcript to Analyze:
    "${transcriptText}"
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
            firstName: { type: Type.STRING },
            lastName: { type: Type.STRING },
            pronouns: { type: Type.STRING },
            placeOfBirth: { type: Type.STRING },
            residence: { type: Type.STRING },
            culturalHeritage: { type: Type.STRING },
            primaryLanguage: { type: Type.STRING }
          }
        }
      }
    });

    if (response.text) {
      let raw = response.text;
      if (typeof raw === "function") raw = (raw as any)();
      raw = raw.replace(/^```(?:json)?\n?/i, '').replace(/```\n?$/i, '').trim();
      return JSON.parse(raw);
    }
  } catch (error) {
    console.error("Failed to harvest demographics:", error);
  }
  return {};
}

