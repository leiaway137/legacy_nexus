import { NextResponse } from 'next/server';
import { analyzeDocumentIntelligence, chatWithLegacyStream, generateTextEmbedding } from '@/lib/rag';
import { ai } from '@/lib/rag/client';
import { queryUserVectors } from '@/lib/local-vector/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, textContent, linguisticContext, forceFormat, documentIntelligence, userId, question, history, relationalContext, systemOverrides } = body;

    if (action === 'analyze') {
        if (!textContent) return NextResponse.json({ error: "Missing required textContent." }, { status: 400 });
        const intelligence = await analyzeDocumentIntelligence(textContent);
        return NextResponse.json(intelligence);
    } 
    
    if (action === 'parse') {
        if (!textContent) return NextResponse.json({ error: "Missing required textContent." }, { status: 400 });
        let intelligenceContext = "";
        if (documentIntelligence) {
          const docType = documentIntelligence.documentType?.replace(/_/g, ' ') || "unknown";
          intelligenceContext += `\n      DOCUMENT INTELLIGENCE (Pre-Analyzed):\n      - Document Type: ${docType}\n      - Main Subject: ${documentIntelligence.mainSubject?.name || "Unknown"} — ${documentIntelligence.mainSubject?.summary || ""}\n      - Power Asymmetry: ${documentIntelligence.powerAsymmetry ? "Yes (one person drives the interview)" : "No (balanced exchange)"}\n`;
          if (documentIntelligence.speakerProfiles?.length > 0) {
            intelligenceContext += `      - Identified Speakers:\n`;
            for (const sp of documentIntelligence.speakerProfiles) {
              intelligenceContext += `        * "${sp.name || sp.label}" — Role: ${sp.role}. Tone: ${sp.toneDescription}. Topics: ${sp.keyTopics?.join(', ') || 'N/A'}.\n`;
            }
            intelligenceContext += `      USE THESE SPEAKER PROFILES to correctly attribute dialogue. When a speaker is identified, use their name or role (e.g., "${documentIntelligence.speakerProfiles[0]?.name || 'Interviewer'}:") instead of generic labels.\n`;
          }
        }

        let prompt = `
          You are an expert transcriber and biographer for Legacy Nexus.
          The following text is a continuous, unstructured document (could be an interview transcript, or a prose report).
          Your strictly enforced job is to completely reconstruct it into readability.
          ${intelligenceContext}
          `;

        if (forceFormat === 'DIALOGUE') {
            prompt += `\nSTEP 1: FORMAT TAG\nYou MUST start your response exactly with "[FORMAT: DIALOGUE]".\nSTEP 2: RECONSTRUCTION\nFormat strictly as a conversational script. Each spoken block MUST start with the speaker's name or title followed by a colon. For example: "Interviewer: [message]". Do NOT Summarize or omit important details. Preserve the full narrative organically.`;
        } else if (forceFormat === 'REPORT') {
            prompt += `\nSTEP 1: FORMAT TAG\nYou MUST start your response exactly with "[FORMAT: REPORT]".\nSTEP 2: RECONSTRUCTION\nDo NOT use speaker names. Completely format the text into a clean academic report using standard markdown headers (##), bolded terms, and cohesive paragraphs. If there was an interviewer asking a question, format it as a markdown heading or prose sentence instead of a chat bubble. Do NOT Summarize or omit important details. Preserve the full narrative organically.`;
        } else {
            prompt += `\nSTEP 1: FORMAT TAG\nYou MUST start your response with either "[FORMAT: DIALOGUE]" or "[FORMAT: REPORT]" based on what the document naturally resembles.\nSTEP 2: RECONSTRUCTION\n- If it is a DIALOGUE/INTERVIEW: Format strictly as a conversational script. Each spoken block MUST start with the speaker's name or title followed by a colon. For example: "Interviewer: [message]".\n- If it is a REPORT/RESEARCH PROSE: Do NOT use speaker names. Completely format the text into a clean academic report using standard markdown headers (##), bolded terms, and cohesive paragraphs.\n- DO NOT Summarize or omit important details in either format. Preserve the full narrative organically.`;
        }

        prompt += `\n${linguisticContext ? `\n      STEP 3: LINGUISTIC CORRECTIONS\n      The speaker's cultural background/languages are: ${linguisticContext}. If you output any foreign words, recipes, or phrases that were translated phonetically in the transcript, elegantly guestimate their correct native romanization (e.g., Pinyin/Characters) and provide an English translation in brackets. NEVER output poor phonetic gibberish. IMPORTANT: You MUST wrap any linguistically corrected text strings exactly in this format: [EDIT: your corrected text here]. Do not use this tag for anything else.` : ''}\n\n      Raw Text:\n      "${textContent}"\n`;

        const aiStream = await ai.models.generateContentStream({
          model: "gemini-2.5-flash",
          contents: prompt,
        });

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
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

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
    }
    
    if (action === 'chat') {
        if (!userId || !question) return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
        
        // 1. Vectorize the User Question
        const questionVector = await generateTextEmbedding(question);
        if (!questionVector || questionVector.length === 0) {
           throw new Error("Failed to generate embedding for the question.");
        }

        // 2. Query Pinecone for the Top 10 Context Chunks natively at the Edge!
        const queryResponse = await queryUserVectors(userId, questionVector, 40);

        // 3. Assemble the perfectly scoped context string with universal perspective binding
        const dynamicContext = queryResponse
           .map((match: any) => {
              const perspectiveText = match.metadata?.perspective ? `[Source Perspective: ${match.metadata.perspective}]\n` : "";
              const contentText = match.metadata?.text || "";
              return contentText ? `${perspectiveText}${contentText}` : "";
           })
           .filter((text: any) => text.length > 0)
           .join("\n\n---\n\n");

        const stream = await chatWithLegacyStream(dynamicContext, question, history || [], linguisticContext, relationalContext, systemOverrides);
        
        // Return a streaming response back to the client natively!
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (error: any) {
    console.error("AI API Error:", error);
    return NextResponse.json({ error: error.message || "Failed to process request." }, { status: 500 });
  }
}
