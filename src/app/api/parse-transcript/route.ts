import { NextResponse } from 'next/server';
import { ai } from '@/lib/rag/client';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { textContent, linguisticContext, forceFormat, documentIntelligence } = await req.json();

    if (!textContent) {
       return NextResponse.json({ error: "Missing required textContent." }, { status: 400 });
    }

    // Build speaker intelligence context if available
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
        prompt += `
        STEP 1: FORMAT TAG
        You MUST start your response exactly with "[FORMAT: DIALOGUE]".
        
        STEP 2: RECONSTRUCTION
        Format strictly as a conversational script. Each spoken block MUST start with the speaker's name or title followed by a colon. For example: "Interviewer: [message]". Do NOT Summarize or omit important details. Preserve the full narrative organically.
        `;
    } else if (forceFormat === 'REPORT') {
        prompt += `
        STEP 1: FORMAT TAG
        You MUST start your response exactly with "[FORMAT: REPORT]".
        
        STEP 2: RECONSTRUCTION
        Do NOT use speaker names. Completely format the text into a clean academic report using standard markdown headers (##), bolded terms, and cohesive paragraphs. If there was an interviewer asking a question, format it as a markdown heading or prose sentence instead of a chat bubble. Do NOT Summarize or omit important details. Preserve the full narrative organically.
        `;
    } else {
        prompt += `
        STEP 1: FORMAT TAG
        You MUST start your response with either "[FORMAT: DIALOGUE]" or "[FORMAT: REPORT]" based on what the document naturally resembles.
        
        STEP 2: RECONSTRUCTION
        - If it is a DIALOGUE/INTERVIEW: Format strictly as a conversational script. Each spoken block MUST start with the speaker's name or title followed by a colon. For example: "Interviewer: [message]".
        - If it is a REPORT/RESEARCH PROSE: Do NOT use speaker names. Completely format the text into a clean academic report using standard markdown headers (##), bolded terms, and cohesive paragraphs.
        - DO NOT Summarize or omit important details in either format. Preserve the full narrative organically.
        `;
    }

    prompt += `
      ${linguisticContext ? `\n      STEP 3: LINGUISTIC CORRECTIONS\n      The speaker's cultural background/languages are: ${linguisticContext}. If you output any foreign words, recipes, or phrases that were translated phonetically in the transcript, elegantly guestimate their correct native romanization (e.g., Pinyin/Characters) and provide an English translation in brackets. NEVER output poor phonetic gibberish. IMPORTANT: You MUST wrap any linguistically corrected text strings exactly in this format: [EDIT: your corrected text here]. Do not use this tag for anything else.` : ''}
      
      Raw Text:
      "${textContent}"
    `;

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

  } catch (error: any) {
    console.error("Parse Transcript API Error:", error);
    return NextResponse.json({ error: error.message || "Failed to process transcript." }, { status: 500 });
  }
}
