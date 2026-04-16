import { NextResponse } from 'next/server';
import { chatWithLegacyStream, generateTextEmbedding } from '@/lib/rag';
import { getPineconeIndex } from '@/lib/pinecone/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Extend Vercel Hobby Timeout from 10s default to 60s max
export async function POST(req: Request) {
  try {
    const { userId, question, history, linguisticContext, relationalContext, systemOverrides } = await req.json();

    if (!userId || !question) {
       return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    // 1. Vectorize the User Question
    const questionVector = await generateTextEmbedding(question);
    if (!questionVector || questionVector.length === 0) {
       throw new Error("Failed to generate embedding for the question.");
    }

    // 2. Query Pinecone for the Top 10 Context Chunks natively at the Edge!
    const index = getPineconeIndex();
    const queryResponse = await (index.namespace(userId).query as any)({
        vector: questionVector,
        topK: 40,
        includeMetadata: true
    });

    // 3. Assemble the perfectly scoped context string with universal perspective binding
    const dynamicContext = queryResponse.matches
       .map(match => {
          const perspectiveText = match.metadata?.perspective ? `[Source Perspective: ${match.metadata.perspective}]\n` : "";
          const contentText = match.metadata?.text || "";
          return contentText ? `${perspectiveText}${contentText}` : "";
       })
       .filter(text => text.length > 0)
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
  } catch (error: any) {
    console.error("API Chat Stream Error:", error);
    return NextResponse.json({ error: error.message || "Failed to process chat." }, { status: 500 });
  }
}
