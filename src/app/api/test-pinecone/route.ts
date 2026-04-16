import { NextResponse } from 'next/server';
import { getPineconeIndex } from '@/lib/pinecone/client';

export async function GET() {
  try {
    const index = getPineconeIndex();
    const ns = index.namespace("test-user");

    const record = {
        id: "test-vector-1",
        values: new Array(768).fill(0.1),
        metadata: { text: "pure manual test" }
    };

    try {
        await ns.upsert( [record] as any );
        return NextResponse.json({ success: true, method: "array" });
    } catch(e1:any) {
        try {
            await ns.upsert({ records: [record] } as any);
            return NextResponse.json({ success: true, method: "object-records" });
        } catch(e2:any) {
            return NextResponse.json({ success: false, e1: e1.message, e2: e2.message });
        }
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message });
  }
}
