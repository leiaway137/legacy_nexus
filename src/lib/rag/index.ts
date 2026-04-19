import { Type } from "@google/genai";
import { ai } from "./client";
import { UNIVERSAL_CAST } from "../constants";
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
  let retries = 3;
  while (retries > 0) {
    try {
      const response = await ai.models.embedContent({
        model: "gemini-embedding-2-preview",
        contents: texts,
      });
      return response.embeddings?.map(e => e.values || []) || [];
    } catch (error: any) {
      const errStr = (error?.message || error?.toString() || '').toLowerCase();
      if (errStr.includes('503') || errStr.includes('429') || errStr.includes('unavailable') || errStr.includes('high demand')) {
        retries--;
        if (retries === 0) {
          console.error("Failed to generate batch embedding after exhausted retries:", error);
          break;
        }
        console.warn(`[Pinecone Embedding] Gemini busy (503). Retrying in 6 seconds... (${retries} attempts left)`);
        await new Promise(r => setTimeout(r, 6000));
      } else {
        console.error("Fatal error generating batch embedding:", error);
        break; // Fatal error, don't retry
      }
    }
  }
  return texts.map(() => []);
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

// ---- DOCUMENT INTELLIGENCE ANALYSIS (Step 0) ----

export interface SpeakerProfile {
  label: string; // e.g. "Speaker A", "Speaker B"
  role: string; // e.g. "Interviewer (Son)", "Subject (Father)"
  name: string; // Deduced name if available, e.g. "Albert"
  toneDescription: string; // e.g. "Anecdotal, technical, storytelling"
  keyTopics: string[]; // e.g. ["Taiwan childhood", "radiation safety"]
  relationshipToSubject: string; // e.g. "Son of subject", "The subject themselves"
}

export interface AnchorPoint {
  type: "direct_identification" | "relationship_marker" | "career_marker" | "location_marker";
  quote: string; // The exact text fragment that serves as evidence
  speaker: string; // Which speaker label this anchors to
  insight: string; // What this tells us, e.g. "Subject identifies himself as Albert"
}

export interface DocumentIntelligence {
  documentType: "oral_history_interview" | "balanced_conversation" | "prose_report" | "monologue" | "mixed";
  speakerProfiles: SpeakerProfile[];
  anchorPoints: AnchorPoint[];
  mainSubject: {
    name: string;
    summary: string; // One-line description of who they are
  };
  powerAsymmetry: boolean; // true if one person clearly drives the interview
  recommendedFormat: "DIALOGUE" | "REPORT";
  confidence: number; // 0-100, how confident the AI is in its analysis
}

export async function analyzeDocumentIntelligence(documentText: string): Promise<DocumentIntelligence> {
  // Use up to ~8000 chars for analysis — enough to identify patterns without burning tokens
  const sample = documentText.substring(0, 8000);

  const prompt = `
    You are an expert archival document analyst for Legacy Nexus.
    Your task is to deeply analyze the following raw, unstructured text and produce a structured intelligence report about it BEFORE any formatting or reconstruction takes place.

    ANALYSIS OBJECTIVES:
    1. DOCUMENT TYPE CLASSIFICATION: Determine whether this is an "oral_history_interview" (one person guiding a chronological life story), "balanced_conversation" (two people contributing equally), "prose_report" (single-author written narrative), "monologue" (single speaker, no interviewer), or "mixed" (elements of multiple types).
    2. SPEAKER PROFILING: Identify all distinct speakers. For each, deduce their:
       - A canonical label (e.g. "Speaker A", "Speaker B")
       - Their role (e.g. "Interviewer (Son)", "Subject (Father/Albert)")
       - Their actual name if deducible from the text
       - Their tone and speaking style
       - Key topics they discuss
       - Their relationship to the main biographical subject
    3. ANCHOR POINTS: Find specific sentences or phrases where speakers identify themselves or each other (names, relationships like "your aunt", career details like "cyclotron", location markers like "Chinatown"). These are critical evidence points.
    4. MAIN SUBJECT IDENTIFICATION: Who is the PRIMARY biographical subject of this document? What is their name and a one-line summary?
    5. POWER ASYMMETRY: Is one person clearly asking questions while the other provides long-form answers? If yes, set powerAsymmetry to true.
    6. FORMAT RECOMMENDATION: Based on all of the above, should this be formatted as "DIALOGUE" (speaker-attributed chat bubbles) or "REPORT" (academic prose)?
    7. CONFIDENCE: Rate 0-100 how confident you are in your overall analysis.

    CRITICAL RULES:
    - Do NOT hallucinate speakers. If only one voice is present, report only one speaker.
    - Base everything strictly on text evidence. If a name isn't mentioned, use "Unknown" for the name.
    - For anchor points, use exact quotes from the text.

    Raw Text Sample:
    "${sample}"
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            documentType: {
              type: Type.STRING,
              enum: ["oral_history_interview", "balanced_conversation", "prose_report", "monologue", "mixed"]
            },
            speakerProfiles: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING },
                  role: { type: Type.STRING },
                  name: { type: Type.STRING },
                  toneDescription: { type: Type.STRING },
                  keyTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
                  relationshipToSubject: { type: Type.STRING }
                },
                required: ["label", "role", "name", "toneDescription", "keyTopics", "relationshipToSubject"]
              }
            },
            anchorPoints: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING, enum: ["direct_identification", "relationship_marker", "career_marker", "location_marker"] },
                  quote: { type: Type.STRING },
                  speaker: { type: Type.STRING },
                  insight: { type: Type.STRING }
                },
                required: ["type", "quote", "speaker", "insight"]
              }
            },
            mainSubject: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                summary: { type: Type.STRING }
              },
              required: ["name", "summary"]
            },
            powerAsymmetry: { type: Type.BOOLEAN },
            recommendedFormat: { type: Type.STRING, enum: ["DIALOGUE", "REPORT"] },
            confidence: { type: Type.INTEGER }
          },
          required: ["documentType", "speakerProfiles", "anchorPoints", "mainSubject", "powerAsymmetry", "recommendedFormat", "confidence"]
        }
      }
    });

    if (response.text) {
      let raw = response.text;
      if (typeof raw === "function") raw = (raw as any)();
      raw = raw.replace(/^```(?:json)?\n?/i, '').replace(/```\n?$/i, '').trim();
      return JSON.parse(raw) as DocumentIntelligence;
    }
  } catch (error) {
    console.error("Failed to analyze document intelligence:", error);
  }

  // Fallback: unknown single speaker
  return {
    documentType: "mixed",
    speakerProfiles: [],
    anchorPoints: [],
    mainSubject: { name: "Unknown", summary: "Could not determine the main subject." },
    powerAsymmetry: false,
    recommendedFormat: "DIALOGUE",
    confidence: 0
  };
}

// ---- TRANSCRIPT CHUNKING ----

export interface TranscriptChunk {
  text: string;
  wisdomTags: string[];
}

export async function processTranscriptForRag(transcriptText: string): Promise<TranscriptChunk[]> {
  const prompt = `
    You are an expert archivist for Legacy Nexus, a platform that preserves life stories.
    Your task is to segment a raw transcript into logical narrative chunks.
    For each chunk, provide the text segment and 2-3 relevant "Wisdom Tags" (e.g., "#Resilience", "#CareerPivot").
    CRITICAL CONSTRAINT: Tags MUST be short, atomic, single-concept nouns (max 1-2 words). Do not concatenate concepts into long sentences (e.g. NEVER use "#ImmigrantResilienceAndEducationalLegacy"). Instead, break complex ideas down into separate, atomic tags (e.g. "#Immigration", "#Resilience", "#Education").

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

export async function generatePodcastTranscript(transcriptContext: string, focusArea: string, durationOption: string): Promise<{speaker: "Host 1" | "Host 2", text: string}[]> {
  if (!transcriptContext.trim()) return [];
  
  // Approximate length targets based on durationOption (Short vs Long)
  // Short = ~3-5 mins audio (approx 500-800 words), Long = 10+ mins (approx 1500-2000 words)
  const lengthInstruction = durationOption.toLowerCase().includes("long") 
    ? "aim for a long, deep-dive 10-15 minute discussion containing around 1500 to 2000 words. Dive deeply into specifics, tangents, and nuances." 
    : "aim for a short, punchy 3-5 minute discussion containing around 500 to 800 words. Keep it focused and moving quickly.";

  const prompt = `
    You are an expert podcast production AI mimicking a highly popular, conversational "Deep Dive" podcast like NotebookLM's Audio Overview.
    Based strictly on the source materials provided, write an engaging back-and-forth podcast transcript between two hosts: "Host 1" and "Host 2".
    Host 1 is typically the primary driver/storyteller, and Host 2 is the inquisitive, amazed co-host reacting and asking excellent follow up questions.
    
    CRITICAL PERSPECTIVE RULES:
    - You are two EXTERNAL podcast hosts discussing a historical archive or interview transcript. 
    - You MUST maintain a third-person, documentary perspective.
    - DO NOT adopt the first-person perspective of the narrator in the text. NEVER say "my father," "my grandfather," "I remember," or "when I was younger." 
    - Translate all first-person accounts into the third-person. For example, if the text says "my grandfather grew up in Taiwan," you must say "Their grandfather grew up in Taiwan," or deduce the subject's name and say "Albert's grandfather grew up in Taiwan."
    
    The user has requested the podcast to specifically focus on the following subject: "${focusArea}".
    Please ${lengthInstruction}
    
    Make the dialogue extremely natural. Use filler words appropriately (like "wow", "exactly", "it's crazy that...").
    Do NOT output raw markdown styling. Do NOT include sound effects or stage directions like [Laughter] or [Sigh]. Keep it purely spoken text.
    
    Sources context:
    ${transcriptContext}
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      temperature: 0.8, // Slightly higher for more conversational creativity
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        description: "The sequential dialogue lines of the podcast.",
        items: {
          type: Type.OBJECT,
          properties: {
            speaker: {
              type: Type.STRING,
              description: "Must be exactly 'Host 1' or 'Host 2'",
              enum: ["Host 1", "Host 2"]
            },
            text: {
              type: Type.STRING,
              description: "The spoken dialogue line for the host. Plain text."
            }
          },
          required: ["speaker", "text"]
        }
      }
    }
  });

  if (response.text) {
    let raw = response.text;
    if (typeof raw === "function") raw = (raw as any)();
    raw = raw.replace(/^```(?:json)?\n?/i, '').replace(/```\n?$/i, '').trim();
    return JSON.parse(raw) as {speaker: "Host 1" | "Host 2", text: string}[];
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
    CRITICAL CONSTRAINT: Tags MUST be short, atomic, single-concept nouns (max 1-2 words). Do not concatenate concepts into long sentences (e.g. NEVER use "#ImmigrantResilienceAndEducationalLegacy"). Instead, break complex ideas down into separate, atomic tags (e.g. "#Immigration", "#Resilience", "#Education").
    The number of tags should elegantly scale with the length and breadth of the transcript context (typically 30-50 tags depending on volume). Please do not artificially limit the tags; be exhaustive.
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

export async function chatWithLegacyStream(transcriptContext: string, question: string, history: {role: string, text: string}[] = [], linguisticContext?: string, relationalContext?: string, systemOverrides?: string): Promise<ReadableStream> {
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
    ${systemOverrides ? `- ABSOLUTE SYSTEM OVERRIDES: The user has manually corrected you in the past regarding specific facts. The following user-supplied corrections are ABSOLUTE TRUTHS. If your retrieved context contradicts these laws, you MUST obey these laws: ${systemOverrides}` : ''}
    
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
  orderIndex?: number;
  timelessCategory?: string;
  synopsis: string;
  detailedNarrative?: string;
  anonymizedSynopsis?: string;
  anonymizedDetailedNarrative?: string;
  sandersonAdaptation?: string;
  updatedAt?: number;
  sandersonGeneratedAt?: number;
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
    2. The chronological 'era'. You MUST map the era strictly to one of the following exact strings: "Childhood", "Teens", "Twenties", "Thirties", "Forties", "Fifties+", or "Timeless". 
       - If you output "Timeless", you MUST also assign a 'timelessCategory' string specifying the exact nature of the timeless knowledge (e.g., "Family Recipe", "Life Philosophy", "Core Values", "Professional Skill", "Tradition"). If the era is not "Timeless", omit this field.
    3. A concise 'synopsis' containing a short 1-2 sentence hook or summary.
    4. A 'detailedNarrative' containing an EXHAUSTIVELY detailed, multi-paragraph memoir-style recounting of the memory. You MUST write at least 3 to 5 robust paragraphs, explicitly separated by double newline characters (\\n\\n). Preserve every single factual detail, emotional nuance, timeline progression, name, and literal piece of dialogue from the transcript. Do NOT summarize or condense this field; paint a vivid, chronological, and comprehensive picture of the event just like a professional biography chapter.
    5. Exactly 6 'psychometrics'. You MUST output an array containing exactly these 6 labels representing the RIASEC model: "Realistic", "Investigative", "Artistic", "Social", "Enterprising", and "Conventional". Evaluate each between 0 and 100 based on how intensely the theme applies to the story (0 if not applicable).
       - TWO-TIER WEIGHTING SYSTEM: You MUST aggressively weight the intensity of the RIASEC dimensions based on the 'primaryCategory' extraction you just mapped:
         > If Relational or Resilience -> heavily weight 'Social'.
         > If Achievement or Impact -> heavily weight 'Enterprising'.
         > If Stewardship -> heavily weight 'Conventional'.
         > If Expression or Self-Awareness -> heavily weight 'Artistic'.
         > If Philosophical -> heavily weight 'Investigative'.
         > If Physicality -> heavily weight 'Realistic'.
         > If Competence -> weight Realistic, Investigative, or Conventional depending on the task type (hand-skill vs theory vs records).
    6. A completeness 'rubric' containing 3 booleans tracking if the story explicitly contains:
       - 'context': Does it establish the setting and background?
       - 'conflict': Is there a clear challenge, pivot, or escalation?
       - 'resolution': Is the outcome explained?
    7. An 'extraction' object analyzing the lesson or moral using a 0-3 Depth Scale. Use the following Step-by-Step Identification Procedure:
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
    8. LINGUISTIC CORRECTIONS: The narrator's cultural heritage/language background is: ${culturalContext || "Unknown"}. If the English transcript contains phonetically misspelled foreign words (e.g., Cantonese or Mandarin words rendered incorrectly into broken English by the audio transcriber), use your linguistic knowledge to intelligently deduce the intended word. Add each correction to the 'linguisticCorrections' array.
    9. Calculate the 'impact_metadata' containing three core properties that assign gravitational weight to this specific story in the database:
       - 'emotional_intensity' (1-5 scale): Score Intensity 1-2 (Snapshot): Casual mentions, low emotional stakes, routine events. Score 3-4 (Pivot): Significant life changes, clear conflict, emotional vulnerability, lessons learned. Score 5 (Core): Life-defining moments, extreme hardship/success, fundamental shifts in identity.
       - 'narrative_complexity' (1-5 scale): How intricate is the sequence of events and decision making?
       - 'duration_weight' (1.0 to 2.0 scale): Evaluate the raw verbosity and detail of this specific event in the transcript. 1.0 for brief mentions, 1.5 for dedicated paragraphs, 2.0 for exhaustive, multi-paragraph sagas.
    10. Extract any unique names of people explicitly mentioned in the story into the 'peopleMentioned' string array.
    11. 'gapPrompt': If this story lacks conflict, lacks a clear resolution, lacks sufficient contextual details, OR lacks a mature extraction ('present' is false), it is considered incomplete. If incomplete, generate a highly customized, unique question about this SPECIFIC story that challenges the narrator to fill in those missing elements to make a complete story. Do NOT use generic/repetitive language formatting. Directly reference the specific names and concrete events of this story to formulate a probing question seeking the missing context, conflict, resolution, or overarching moral lesson.
    ${relationalContext ? `CRITICAL RELATIONAL CONTEXT: Normalize and refer to individuals using the following Identity Map when generating synopses and labels: ${relationalContext}` : ''}

    Extract ALL highly granular, profoundly distinct thematic events from this specific chunk of text. Do NOT lazily merge multiple life events into a single generalized card. Demand granularity. You should extract anywhere from 1 to 10 events depending on the density of the text. Do not hallucinate events that are not explicitly in the text.
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
              timelessCategory: { type: Type.STRING },
              title: { type: Type.STRING },
              synopsis: { type: Type.STRING },
              detailedNarrative: { type: Type.STRING },
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
            required: ["id", "era", "title", "synopsis", "detailedNarrative", "psychometrics", "rubric", "extraction", "impact_metadata", "linguisticCorrections", "peopleMentioned", "gapPrompt"]
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
    2. Determine if the events described in the raw stories are the EXACT SAME EVENT or a DIRECT CONTINUATION of any EXISTING stories in the master timeline.
       - If YES (they are the exact same event): MERGE them. UPDATE the existing story. You MUST rewrite the 'detailedNarrative' to cleanly and EXHAUSTIVELY integrate all new robust facts and dialogue from the new story into the master narrative. Ensure the resulting 'detailedNarrative' is a massive, multi-paragraph memoir (3+ paragraphs), explicitly separated by double newline characters (\\n\\n). You can rewrite the 'synopsis' if the core hook changes, drastically update the 'psychometrics' based on the newly merged context, and update the 'rubric' booleans. Remove the 'gapPrompt' if the rubric and extraction becomes fully complete. If any elements are missing (context, conflict, resolution, or extraction), completely REWRITE the 'gapPrompt' to explicitly reference the newly synthesized narrative details and ask a highly specific, penetrating question to prompt the narrator for the missing elements to complete the story.
       - If NO (they are separate events, even if they occurred in the same Era or involve the same people): CREATE entirely new story objects and APPEND them to the array. Do NOT merge unrelated memories together. Treat them as distinctly separate stories. Do not lazily summarize them; preserve their granularity. If the story lacks context, conflict, resolution, or extraction, generate a highly specific, context-aware 'gapPrompt' referencing literal story events seeking the missing elements.
    3. Ensure ALL stories (existing and new) strictly adhere to the previously defined format. 
       - 'era' MUST strictly be "Childhood", "Teens", "Twenties", "Thirties", "Forties", "Fifties+", or "Timeless" (Use "Timeless" for generic themes, recipes, and life philosophies).
    4. LINGUISTIC CORRECTIONS: The narrator's cultural heritage/language background is: ${culturalContext || "Unknown"}. If the synopses contain phonetically misspelled foreign words, intelligently deduce the intended word and log it to 'linguisticCorrections'.
    5. Ensure the 'peopleMentioned' array is an aggregate unique list of names involved in the merged story.
    ${relationalContext ? `CRITICAL RELATIONAL CONTEXT: Normalize and rewrite mentions in the 'synopsis' and 'title' to strictly follow this Identity Map, effectively replacing invalid aliases with canonical names: ${relationalContext}` : ''}
    
    CRITICAL TONE INSTRUCTION: Do NOT repeatedly use the subject's full formal name. Write in an intimate, informal tone using their first name only or appropriate pronouns. The writing should feel like a personal memoir, not a Wikipedia article.

    CRITICAL OUTPUT INSTRUCTION: 
    Return ONLY a JSON array containing the specific stories that were UPDATED (merged) AND the ENTIRELY NEW stories. 
    DO NOT output any existing stories from the master timeline that were untouched or unmodified by this new data.
    If you modified an existing story, you MUST preserve its exact existing 'id'. If you created a new story, generate a temporary string like "new" for the 'id' (we will handle UUID generation).

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
              timelessCategory: { type: Type.STRING },
              title: { type: Type.STRING },
              synopsis: { type: Type.STRING },
              detailedNarrative: { type: Type.STRING },
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
            required: ["id", "era", "title", "synopsis", "detailedNarrative", "psychometrics", "rubric", "extraction", "impact_metadata", "linguisticCorrections", "peopleMentioned", "gapPrompt"]
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
          if (existingIdx !== -1 && delta.id && delta.id !== "new") {
              const mergedStory = { ...delta };
              // Ensure critical arrays are not null
              mergedStory.psychometrics = mergedStory.psychometrics || [];
              mergedStory.linguisticCorrections = mergedStory.linguisticCorrections || [];
              mergedStory.peopleMentioned = mergedStory.peopleMentioned || [];
              updatedCache[existingIdx] = mergedStory;
          } else {
              const newStory = { ...delta, id: crypto.randomUUID() };
              newStory.psychometrics = newStory.psychometrics || [];
              newStory.linguisticCorrections = newStory.linguisticCorrections || [];
              newStory.peopleMentioned = newStory.peopleMentioned || [];
              updatedCache.push(newStory);
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
    5. CRITICAL GAP PROMPT BACKFILL: If an existing story is missing an explicit 'gapPrompt' AND it lacks context, conflict, resolution, or a mature extraction, you MUST actively backfill and generate a highly customized 'gapPrompt'. The prompt must challenge the narrator to provide the missing elements to make a complete story. Directly reference the specific literal events and canonical names from the synopsis. Do NOT use generic/repetitive language.
    
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
            required: ["id", "era", "title", "synopsis", "detailedNarrative", "psychometrics", "rubric", "extraction", "impact_metadata", "linguisticCorrections", "peopleMentioned", "gapPrompt"]
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
  legacyIdentityLabel?: string;
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
       CRITICAL: The final synopsis MUST NOT be a chronological play-by-play. It must forcefully read like an upbeat, glorified, and prestigious "obituary" or "achievement summary" that highlights their true legacy. 
       It MUST be CONSOLIDATED down into a strictly SINGULAR PARAGRAPH.
       Focus intensely on the subject as the central hero. AVOID mentioning anyone else specifically by name or detail.
       Focus heavily on exactly what they accomplished, the wisdom they can pass on, and what they should be remembered for. Explicitly drop granular details of their early/young life to save room for their lasting impact.
       VISUAL FORMATTING: You MUST strategically apply Markdown **bolding** to 4-8 highly significant key words, defining accomplishments or overarching themes within the singular paragraph to make it visually engaging. Do NOT overdo it.
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

export async function generateSandersonAdaptation(story: HighFidelityStory, editorialNotes?: string): Promise<string> {
  const prompt = `
### System Prompt: The Realistic Sanderson Storyteller

**Agent Persona:** You are an expert narrative architect and master storyteller trained in the specific writing philosophies of Brandon Sanderson, as well as core cognitive storytelling principles. 

**Objective:** Transform raw biographical data, interviews, or daily reflections into a compelling, realistic epic. You will treat real-world skills as "hard magic systems," focus heavily on character limitations, and use strict cause-and-effect plotting, while keeping the narrative grounded in reality (no supernatural elements).

#### Core Processing Instructions

**1. The "Hard Skill" System (Applying Sanderson's First Law)**
*   **Directive:** Treat the protagonist's primary skill (e.g., a sport, a profession, a hobby) like a "Hard Magic" system. 
*   **Action:** Explicitly define the physical rules, mechanics, and training required to master this skill. Do not simply say a character is "good" at something; explain the leverage, the muscle memory, or the specific technique involved. The reader must understand how the "magic" works so that when the character uses it to solve a problem later, it feels earned.

**2. Limitations Over Powers (Applying Sanderson's Second Law)**
*   **Directive:** Focus on what the character *cannot* do. Flaws, restrictions, and limitations are far more interesting than a character's strengths. 
*   **Action:** Identify the protagonist's specific limitation (e.g., they lack finesse, they are too small, they are easily exhausted). The character must not magically overcome this limitation; instead, they must lean into it and find a gritty, creative workaround to succeed *despite* it.

**3. The CPR Character Framework**
*   **Directive:** Ensure the protagonist hits the three sliding scales of CPR: Capable, Proactive, and Relatable.
*   **Action:** 
    *   *Capable:* Give them a highly specific area of expertise.
    *   *Proactive:* They must make choices that drive the plot forward. If they are trapped, they must at least try to plan or train.
    *   *Relatable:* Give them a struggle (e.g., isolation, cruelty, a "sacred flaw") that instantly generates audience empathy.

**4. Promise, Progress, Payoff (PPP Plotting)**
*   **Directive:** Structure the narrative arc around these three beats.
*   **Action:**
    *   *Promise:* Start the story at the exact emotional opposite of the ending realization. If the story ends in acceptance, it must begin with a promise of isolation.
    *   *Progress:* Show the character attempting to reach their goal through "try/fail cycles". They must face obstacles, try the most intelligent solution, and fail due to their limitations, forcing them to adapt. Connect all scenes with "but" and "therefore" cause-and-effect logic.
    *   *Payoff:* Deliver a "stand-up-and-cheer" moment where the internal character growth aligns with the external physical victory. 

**5. The Apprentice Arc**
*   **Directive:** Whenever a mentor figure is present, utilize the apprentice arc.
*   **Action:** Show the protagonist learning the foundational "rules" from a master, but ultimately diverging. The protagonist must face a challenge the master cannot solve, forcing them to apply the skills in a uniquely personal, specialized way.

**6. The Pyramid of Abstraction (Sensory Grounding)**
*   **Directive:** Avoid abstract summaries and "navel-gazing" (e.g., "He felt sad and alienated"). 
*   **Action:** Pull the reader down the "pyramid of abstraction" by anchoring every scene in concrete, sensory details first (e.g., the heavy thud of a ball, the smell of rain, the rough texture of wool). Only after establishing these concrete physical anchors should you move upward into the character's abstract internal thoughts.

**7. The Five-Second Moment**
*   **Directive:** Funnel the entire story toward a singular climax of realization.
*   **Action:** Discard unnecessary chronological reporting. Identify the "five-second moment"—the exact instant the protagonist's heart moved and their perspective fundamentally changed. Every detail in the story must exist solely to make this final realization hit as hard as possible. **CRITICAL: DO NOT explicitly use the phrases "five-second moment" or "in that moment" in the prose. The reader must feel the realization through the action, not be told about it.**

#### Formatting & Output Guidelines
1.  **Tone:** Epic, gritty, yet ultimately hopeful. The tone should feel like high fantasy translated into real-world physics.
2.  **Cinematic Immediacy:** Start as close to the ending as possible. Use vivid, immediate action to open the story.
3.  **Output Strict Markdown:** Output ONLY the markdown text of the story chapters. Do not include markdown headers like "\`\`\`markdown".
4.  **Zero Hallucinated Proper Nouns:** You MUST NOT invent any specific names for people, places, or businesses if they are not explicitly mentioned in the source material. If the name of a character's wife is not provided, simply use "his wife" or "she" rather than inventing a name like "Mary".

---
**Input Story Data:**
Title: ${story.title}
Era: ${story.era}
Synopsis: ${story.synopsis}
Detailed Narrative / Raw Transcript Context: ${story.detailedNarrative || "N/A"}
Extracted Lesson/Realization: ${story.extraction?.legacyLesson || "N/A"}

${editorialNotes ? `
---
### CRITICAL EDITORIAL REVISION
The user has reviewed a previous draft of this chapter and provided the following mandatory correction notes. You MUST rewrite the chapter specifically addressing and fixing the issue noted below:
**Feedback:**
${editorialNotes}
---
` : ''}
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        temperature: 0.8
      }
    });

    if (response.text) {
      let raw = response.text;
      if (typeof raw === "function") raw = (raw as any)();
      return raw.replace(/^\`\`\`markdown/, '').replace(/\`\`\`$/, '').trim();
    }
  } catch (error) {
    console.error("Failed to generate Sanderson adaptation:", error);
  }
  return "Failed to adapt story.";
}

export async function generateUniversalCastMapping(stories: HighFidelityStory[], existingMap: Record<string, string> = {}): Promise<Record<string, string>> {
  if (stories.length === 0) return existingMap;

  // Extract all unique names from stories
  const uniqueNames = new Set<string>();
  stories.forEach(s => {
    s.peopleMentioned?.forEach(p => uniqueNames.add(p));
  });

  const namesToMap = Array.from(uniqueNames).filter(n => !existingMap[n]);
  if (namesToMap.length === 0) return existingMap;

  const prompt = `
    You are the Casting Director for Legacy Nexus.
    We use a fixed "Universal Cast" of actors and a fixed "SNL-Style Staging" with fictional cities and companies.
    
    The Universal Cast & Setting Roster is:
    ${JSON.stringify(UNIVERSAL_CAST, null, 2)}
    
    Your task is to assign these universal actors to the real-life names, and these fictional settings to the real-life locations/companies mentioned in the stories. 
    You must output a JSON dictionary mapping the real entity to the Cast/Setting Name. 
    Make logical choices based on typical family structures and city associations. 
    Do NOT invent new cast names or cities. Use ONLY names from the Universal Cast. Multiple real people or places can technically be mapped to the same setting if they fill similar minor roles.
    
    Real Entities (People, Companies, Cities) needing casting:
    ${JSON.stringify(namesToMap)}
    
    Output strictly a JSON object like: { "RealEntity": "UniversalName" }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          additionalProperties: { type: Type.STRING }
        }
      }
    });

    if (response.text) {
      let raw = response.text;
      if (typeof raw === "function") raw = (raw as any)();
      raw = raw.replace(/^```(?:json)?\n?/i, '').replace(/```\n?$/i, '').trim();
      const newMappings = JSON.parse(raw);
      return { ...existingMap, ...newMappings };
    }
  } catch (error) {
    console.error("Failed to generate cast mapping:", error);
  }
  
  return existingMap;
}

export async function generateAnonymizedStories(stories: HighFidelityStory[], pseudoMap: Record<string, string> = {}): Promise<HighFidelityStory[]> {
  if (stories.length === 0) return [];
  
  // To avoid massive payload errors or context overflow, we'll anonymize them in chunks of 5
  const chunkedStories: HighFidelityStory[][] = [];
  for (let i = 0; i < stories.length; i += 5) {
     chunkedStories.push(stories.slice(i, i + 5));
  }
  
  const anonymizedStories: HighFidelityStory[] = [];
  
  for (const chunk of chunkedStories) {
    const prompt = `
      You are an expert privacy archivist.
      Your task is to take the following array of personal stories and return a strictly redacted, Anonymized version of them.
      
      CRITICAL NEW DIRECTIVE: THE UNIVERSAL ACTOR CAST
      You MUST strictly use the following Pseudonym Dictionary to replace names. This is an unbreakable rule to maintain timeline consistency.
      Dictionary Mapping (Original Name -> Actor Name):
      ${JSON.stringify(pseudoMap, null, 2)}
      
      RULES:
      1. Replace EVERY original name, city, or institution found in the dictionary exactly with its mapped Actor Name or Fictional Setting. (e.g. if Albert->Leo, repairing "Albert went to IBM" -> "Leo went to Apex Corporation").
      2. If you encounter a name, company, or specific city NOT in the dictionary, replace it with a structural bracket (e.g., "[A friend]", "[A major city]", "[A tech company]"). 
      3. DO NOT redact the general wisdom, emotional weight, or the lessons learned. The stories must still be readable and emotionally engaging.
      4. Return an array of objects containing the story 'id', the redacted 'anonymizedSynopsis', and the effectively redacted 'anonymizedDetailedNarrative'.
      
      Input Stories JSON:
      ${JSON.stringify(chunk.map(s => ({ id: s.id, synopsis: s.synopsis, narrative: s.detailedNarrative })))}
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
                anonymizedSynopsis: { type: Type.STRING },
                anonymizedDetailedNarrative: { type: Type.STRING }
              },
              required: ["id", "anonymizedSynopsis", "anonymizedDetailedNarrative"]
            }
          }
        }
      });

      if (response.text) {
        let raw = response.text;
        if (typeof raw === "function") raw = (raw as any)();
        raw = raw.replace(/^```(?:json)?\n?/i, '').replace(/```\n?$/i, '').trim();
        const results = JSON.parse(raw) as {id: string, anonymizedSynopsis: string, anonymizedDetailedNarrative: string}[];
        
        for (const s of chunk) {
           const match = results.find(r => r.id === s.id);
           if (match) {
              anonymizedStories.push({
                 ...s,
                 anonymizedSynopsis: match.anonymizedSynopsis,
                 anonymizedDetailedNarrative: match.anonymizedDetailedNarrative
              });
           } else {
              anonymizedStories.push(s);
           }
        }
      } else {
        anonymizedStories.push(...chunk);
      }
    } catch (e) {
      console.error("Anonymization batch failed", e);
      anonymizedStories.push(...chunk);
    }
  }
  
  return anonymizedStories;
}
