import { NextResponse } from 'next/server';
import { analyzeDocumentIntelligence } from '@/lib/rag';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { textContent } = await req.json();

    if (!textContent) {
      return NextResponse.json({ error: "Missing required textContent." }, { status: 400 });
    }

    const intelligence = await analyzeDocumentIntelligence(textContent);
    return NextResponse.json(intelligence);
  } catch (error: any) {
    console.error("Analyze Transcript API Error:", error);
    return NextResponse.json({ error: error.message || "Failed to analyze transcript." }, { status: 500 });
  }
}
