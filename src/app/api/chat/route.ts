import { NextResponse } from 'next/server';
import { chatWithLegacyStream } from '@/lib/rag';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { context, question, history, linguisticContext } = await req.json();

    if (!context || !question) {
       return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const stream = await chatWithLegacyStream(context, question, history || [], linguisticContext);
    
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
