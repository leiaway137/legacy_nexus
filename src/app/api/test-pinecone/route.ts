import { NextResponse } from 'next/server';
import { embedStoriesToPineconeAction } from '@/app/actions';

export async function GET() {
  try {
    const dummyStory = {
       id: "dummy-1",
       era: "Twenties",
       title: "Dummy Title",
       synopsis: "Dummy synopsis",
       detailedNarrative: "Dummy narrative here to satisfy extraction.",
       psychometrics: [],
       peopleMentioned: [],
       rubric: { context: true, conflict: false, resolution: false },
       extraction: { present: true, depthLevel: 1, primaryCategory: "None", secondaryCategory: "None", insightSummary: "Dummy insight", legacyLesson: "Dummy lesson", rawQuote: "quote" }
    };

    const success = await embedStoriesToPineconeAction("test-user-id", "dummy-source-id", [dummyStory]);

    return NextResponse.json({ success });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message });
  }
}
