"use server";

import { processTranscriptForRag, generateInterviewQuestions, generateSynopsis, TranscriptChunk, generateWisdomSummaries, chatWithLegacy, WisdomSummary, conductActiveInterview, extractHighFidelityStories, HighFidelityStory, reduceHighFidelityStories, recompileHighFidelityStories, generateTextEmbedding, generateBatchTextMappings, identifyDocumentPerspective, reduceDashboardOverview, DashboardOverview, generateLegacyIdentityContext, generateDriftInsight, generateLegacyDeepDive } from "@/lib/rag";
import { getPineconeIndex } from "@/lib/pinecone/client";
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

export async function embedAndUpsertToPineconeAction(userId: string, sourceId: string, text: string): Promise<boolean> {
  try {
    const index = getPineconeIndex();
    
    // 0. Autonomously deduce the relational perspective of this specific document
    const perspectiveTag = await identifyDocumentPerspective(text);
    console.log(`[RAG Metadata Injection] Extracted Perspective: ${perspectiveTag}`);
    
    // 1. Simple chunking strategy (split by double newlines or roughly 1000 characters)
    const rawChunks = text.split(/\n\s*\n/).filter(c => c.trim().length > 50);
    const vectors = [];
    
    // Batch process in chunks of 50 to avoid any Gemini API payload maximum limits and 15 RPM bottleneck
    const BATCH_LIMIT = 50;
    for (let i = 0; i < rawChunks.length; i += BATCH_LIMIT) {
        const batchTexts = rawChunks.slice(i, i + BATCH_LIMIT);
        const embeddedBatches = await generateBatchTextMappings(batchTexts);
        
        for (let j = 0; j < embeddedBatches.length; j++) {
            const embeddingData = embeddedBatches[j];
            if (embeddingData && embeddingData.length === 3072) {
               vectors.push({
                  id: `${sourceId}-chunk-${i + j}`,
                  values: embeddingData,
                  metadata: {
                     text: batchTexts[j],
                     sourceId: sourceId,
                     perspective: perspectiveTag
                  }
               });
            }
        }
    }
    
    // 2. Upsert vectors in batches to Pinecone using the userId as a security namespace!
    if (vectors.length > 0) {
       // Pinecone upsert limit is usually 100 per API request
       const batchSize = 100;
       for (let i = 0; i < vectors.length; i += batchSize) {
          const batch = vectors.slice(i, i + batchSize);
          await index.upsert({ records: batch, namespace: userId });
       }
    }
    
    return true;
  } catch (error) {
    console.error("Failed to embed and upsert to Pinecone:", error);
    return false;
  }
}

export async function deletePineconeSourceAction(userId: string, sourceId: string): Promise<boolean> {
  try {
    const index = getPineconeIndex();
    const ns = index.namespace(userId);
    
    // Pinecone Serverless DOES NOT support deleting by metadata filter natively (404 Error).
    // We must paginate through the namespace using the secure ID prefix and delete explicitly by IDs.
    let paginationToken = undefined;
    
    // Safety break to prevent infinite loops
    let pages = 0;
    
    do {
       //@ts-ignore - dynamic properties
       const results = await ns.listPaginated({ prefix: sourceId, paginationToken });
       
       if (results && results.vectors && results.vectors.length > 0) {
           const idsToDelete = results.vectors.map(v => v.id);
           await ns.deleteMany(idsToDelete);
       }
       
       paginationToken = results?.pagination?.next;
       pages++;
    } while (paginationToken && pages < 100);
    
    console.log(`[Pinecone GC] Scrubbed all vectors for source: ${sourceId}`);
    return true;
  } catch (error) {
    console.error("Failed to delete from Pinecone:", error);
    return false;
  }
}

export async function deleteAllPineconeResourcesAction(userId: string): Promise<boolean> {
  try {
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

export async function conductActiveInterviewAction(history: { role: string; text: string }[], imageBase64?: string, persona?: string): Promise<string> {
  try {
    return await conductActiveInterview(history, imageBase64, persona);
  } catch (error: any) {
    console.error("Failed to conduct active interview:", error);
    return "SYSTEM ERROR: " + (error?.message || error);
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
  exampleStoryTitle: string
): Promise<{ title: string; analysis: string; prompt: string }> {
  return await generateLegacyDeepDive(dominantTrait, flaw, flawScore, exampleStoryTitle);
}
