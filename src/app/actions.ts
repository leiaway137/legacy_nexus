"use server";

import { processTranscriptForRag, generateInterviewQuestions, generateSynopsis, TranscriptChunk, generateWisdomSummaries, chatWithLegacy, WisdomSummary, conductActiveInterview, extractHighFidelityStories, HighFidelityStory, reduceHighFidelityStories, recompileHighFidelityStories, generateTextEmbedding, generateBatchTextMappings, identifyDocumentPerspective, reduceDashboardOverview, DashboardOverview, generateLegacyIdentityContext, generateDriftInsight, generateLegacyDeepDive, extractDemographicsFromTranscript, generateSandersonAdaptation, generatePodcastTranscript, generateAnonymizedStories, generateUniversalCastMapping } from "@/lib/rag";
import { getPineconeIndex } from "@/lib/pinecone/client";
import { fetchUserProfile } from "@/lib/mongo/db";
import { decryptString } from "@/lib/encryption";
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

export async function generatePodcastTranscriptAction(context: string, focusArea: string, durationOption: string): Promise<any> {
  try {
    return await generatePodcastTranscript(context, focusArea, durationOption);
  } catch (error: any) {
    console.error("Failed to generate podcast:", error);
    return { error: error.message || String(error) };
  }
}


export async function reduceDashboardOverviewAction(currentOverview: DashboardOverview | null, newTranscript: string, mainSubjectName?: string): Promise<DashboardOverview | null> {
  try {
    return await reduceDashboardOverview(currentOverview, newTranscript, mainSubjectName);
  } catch (err) {
    console.error("Action error reducing dashboard overview:", err);
    throw err;
  }
}

export async function generateLegacyIdentityAction(primary: string, secondary: string, category: string, title: string): Promise<string> {
  return await generateLegacyIdentityContext(primary, secondary, category, title);
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

export async function embedStoriesToPineconeAction(userId: string, sourceId: string, stories: HighFidelityStory[]): Promise<boolean> {
  try {
    const index = getPineconeIndex();
    const vectors = [];
    
    const BATCH_LIMIT = 50;
    for (let i = 0; i < stories.length; i += BATCH_LIMIT) {
        const batchStories = stories.slice(i, i + BATCH_LIMIT);
        
        const batchTexts = batchStories.map(story => {
           let baseText = `[Legacy Entry]\nTitle: ${story.title}\nEra: ${story.era}\nSynopsis: ${story.synopsis}\nNarrative: ${story.detailedNarrative || "N/A"}\nLegacy Lesson: ${story.extraction?.legacyLesson || "N/A"}\nThemes: ${story.psychometrics?.map(p => `${p.label} (${p.val})`).join(', ') || ""}\nPeople Mentioned: ${(story.peopleMentioned || []).join(', ')}`;
           if (story.linguisticCorrections && story.linguisticCorrections.length > 0) {
               baseText += `\nTranslations: ${story.linguisticCorrections.map(c => `Original audio '${c.original}' likely means '${c.guess}' (${c.meaning})`).join(' | ')}`;
           }
           return baseText;
        });
        
        const embeddedBatches = await generateBatchTextMappings(batchTexts);
        
        for (let j = 0; j < embeddedBatches.length; j++) {
            const embeddingData = embeddedBatches[j];
            if (embeddingData && embeddingData.length > 0) {
               vectors.push({
                  id: `story-${batchStories[j].id}`,
                  values: embeddingData,
                  metadata: {
                     text: batchTexts[j],
                     sourceId: sourceId,
                     era: batchStories[j].era,
                     perspective: "Synthesized Legacy Content"
                  }
               });
            }
        }
    }
    
    // Upsert vectors in batches to Pinecone using the userId as a security namespace!
    if (vectors.length > 0) {
       const batchSize = 100;
       const ns = index.namespace(userId);
       for (let i = 0; i < vectors.length; i += batchSize) {
          const batch = vectors.slice(i, i + batchSize);
          await ns.upsert(batch as any).catch(async () => {
             // Fallback for newer v5+ Pinecone SDKs that strictly require options object wrapper
             await ns.upsert({ records: batch } as any);
          });
       }
    }
    
    return true;
  } catch (error) {
    console.error("Failed to embed stories and upsert to Pinecone:", error);
    return false;
  }
}



export async function deleteAllPineconeResourcesAction(userId: string): Promise<boolean> {
  try {
    const index = getPineconeIndex();
    const ns = index.namespace(userId);
    await ns.deleteAll();
    console.log(`[Pinecone GC] Scrubbed ENTIRE namespace for user: ${userId}`);
    return true;
  } catch (error) {
    console.error("Failed to delete all Pinecone vectors:", error);
    return false;
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

export async function chatWithLegacyAction(context: string, question: string, history: {role: string, text: string}[], linguisticContext?: string, relationalContext?: string): Promise<string> {
  try {
    return await chatWithLegacy(context, question, history, linguisticContext, relationalContext);
  } catch (error: any) {
    console.error("Failed to chat with legacy:", error);
    return "SYSTEM ERROR: " + (error?.message || error);
  }
}

export async function conductActiveInterviewAction(history: { role: string; text: string }[], imageBase64?: string, persona?: string, pendingQuestions?: string[], currentTrustScore: number = 0): Promise<{ response: string; trustScoreDelta: number; sentiment: string; vulnerability: string; wisdomDensity: string }> {
  try {
    return await conductActiveInterview(history, imageBase64, persona, pendingQuestions, currentTrustScore);
  } catch (error: any) {
    console.error("Failed to conduct active interview:", error);
    return { response: "SYSTEM ERROR: " + (error?.message || error), trustScoreDelta: 0, sentiment: "Neutral", vulnerability: "Low", wisdomDensity: "Low" };
  }
}

const CHRONOLOGY_MAP: Record<string, number> = {
  "Childhood": 1,
  "Teens": 2,
  "Twenties": 3,
  "Thirties": 4,
  "Forties": 5,
  "Fifties+": 6,
  "Timeless": 7
};

export async function extractHighFidelityStoriesAction(context: string, culturalContext?: string, relationalContext?: string, identityContext?: string): Promise<HighFidelityStory[]> {
  try {
    const stories = await extractHighFidelityStories(context, culturalContext, relationalContext, identityContext);
    return stories.sort((a, b) => (CHRONOLOGY_MAP[a.era] || 99) - (CHRONOLOGY_MAP[b.era] || 99));
  } catch (error: any) {
    console.error("Failed to extract high fidelity stories:", error);
    // Rethrow to bubble up specific Gemini / token / payload errors to the client UI
    throw new Error(error.message || "Unknown synthesis error");
  }
}

export async function reduceHighFidelityStoriesAction(cachedStories: HighFidelityStory[], rawNewStories: HighFidelityStory[], culturalContext?: string, relationalContext?: string): Promise<HighFidelityStory[]> {
  try {
    const updated = await reduceHighFidelityStories(cachedStories, rawNewStories, culturalContext, relationalContext);
    return updated.sort((a, b) => (CHRONOLOGY_MAP[a.era] || 99) - (CHRONOLOGY_MAP[b.era] || 99));
  } catch (error) {
    console.error("Failed to reduce high fidelity stories:", error);
    return cachedStories;
  }
}

export async function recompileStoriesWithContactsAction(cachedStories: HighFidelityStory[], relationalContext: string): Promise<HighFidelityStory[]> {
  try {
    const updated = await recompileHighFidelityStories(cachedStories, relationalContext);
    return updated.sort((a, b) => (CHRONOLOGY_MAP[a.era] || 99) - (CHRONOLOGY_MAP[b.era] || 99));
  } catch (error) {
    console.error("Failed to recompile high fidelity stories:", error);
    return cachedStories;
  }
}

export async function generateDriftInsightAction(
  eraA: string,
  archetypeA: string,
  eraB: string,
  archetypeB: string,
  storyContextA: string,
  storyContextB: string
): Promise<string> {
  return await generateDriftInsight(eraA, archetypeA, eraB, archetypeB, storyContextA, storyContextB);
}

export async function generateLegacyDeepDiveAction(
  dominantTrait: string,
  flaw: string,
  flawScore: number,
  exampleStoryTitle: string,
  exampleStoryContext: string
): Promise<{ title: string; analysis: string; prompt: string }> {
  return await generateLegacyDeepDive(dominantTrait, flaw, flawScore, exampleStoryTitle, exampleStoryContext);
}

export async function extractDemographicsAction(transcript: string): Promise<Record<string, string>> {
  try {
    return await extractDemographicsFromTranscript(transcript);
  } catch (error) {
    console.error("Failed to extract demographics:", error);
    return {};
  }
}

export async function generateSandersonChapterAction(story: HighFidelityStory, editorialNotes?: string): Promise<string> {
  return await generateSandersonAdaptation(story, editorialNotes);
}

export async function deletePineconeSourceAction(userId: string, sourceId: string): Promise<boolean> {
  return true;
}

export async function generateAnonymizedStoriesAction(stories: HighFidelityStory[], pseudoMap?: Record<string, string>): Promise<HighFidelityStory[]> {
  try {
    return await generateAnonymizedStories(stories, pseudoMap);
  } catch (error) {
    console.error("Failed to generate anonymized stories:", error);
    return stories;
  }
}

export async function generateUniversalCastMappingAction(stories: HighFidelityStory[], existingMap?: Record<string, string>): Promise<Record<string, string>> {
  try {
    return await generateUniversalCastMapping(stories, existingMap);
  } catch (error) {
    console.error("Failed to generate Universal Cast mapping:", error);
    return existingMap || {};
  }
}

export async function generateElevenLabsAudioAction(userId: string, text: string, defaultVoiceId: string): Promise<string | null> {
  if (!text || !defaultVoiceId) return null;
  
  let apiKey = process.env.ELEVENLABS_API_KEY;
  let voiceId = defaultVoiceId;

  // Attempt to use custom key and voice securely from the encrypted DB vault
  if (userId) {
     const profile = await fetchUserProfile(userId);
     if (profile && profile.voiceProvider === "elevenlabs" && profile.hasTtsKeySaved) {
        if (profile.ttsVoiceId) voiceId = profile.ttsVoiceId;
        
        // Next.js Server Components bypass the API payload scrubbing. If we need to read the raw vault,
        // we should query the DB directly, as fetchUserProfile intentionally destroys the encrypted payload!
        // To keep it simple, we import MongoDB logic inline
        const { getDb } = require("@/lib/mongo/db");
        const db = await getDb();
        const rawProfile = await db.collection("user_profiles").findOne({ userId });
        if (rawProfile && rawProfile.encryptedTtsApiKey) {
           const decryptedKey = decryptString(rawProfile.encryptedTtsApiKey);
           if (decryptedKey) apiKey = decryptedKey;
        }
     }
  }

  if (!apiKey) {
    console.error("ElevenLabs API Key not found.");
    return null;
  }
  
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": apiKey
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });
    
    if (!response.ok) {
      console.error("ElevenLabs TTS failed:", await response.text());
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return buffer.toString('base64');
  } catch (error) {
    console.error("ElevenLabs API Request Error:", error);
    return null;
  }
}

export async function generateResembleAudioAction(userId: string, text: string): Promise<string | null> {
  if (!text || !userId) return null;
  
  let apiKey = process.env.RESEMBLE_API_KEY;
  let projectId = "";
  let voiceId = "";
  
  const { getDb } = require("@/lib/mongo/db");
  const db = await getDb();
  const rawProfile = await db.collection("user_profiles").findOne({ userId });
  
  if (rawProfile && rawProfile.voiceProvider === "resemble" && rawProfile.encryptedTtsApiKey) {
     if (rawProfile.ttsVoiceId) voiceId = rawProfile.ttsVoiceId;
     if (rawProfile.resembleProjectId) projectId = rawProfile.resembleProjectId;
     
     const decryptedKey = decryptString(rawProfile.encryptedTtsApiKey);
     if (decryptedKey) apiKey = decryptedKey;
  }
  
  if (!apiKey || !projectId || !voiceId) {
    console.error("Resemble configuration incomplete.");
    return null;
  }
  
  try {
    const response = await fetch(`https://app.resemble.ai/api/v2/projects/${projectId}/clips`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        body: text,
        voice_uuid: voiceId,
        is_public: false,
        is_archived: false,
        title: `Legacy Nexus Recollection`
      })
    });
    
    if (!response.ok) {
      console.error("Resemble TTS failed:", await response.text());
      return null;
    }
    
    const data = await response.json();
    if (data.item && data.item.audio_src) {
        // Fetch the generated authenticated URL's buffer
        const audioFetch = await fetch(data.item.audio_src);
        const arrayBuffer = await audioFetch.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        return buffer.toString('base64');
    }
    return null;
  } catch (error) {
    console.error("Resemble API Request Error:", error);
    return null;
  }
}
