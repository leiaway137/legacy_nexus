const { Pinecone } = require('@pinecone-database/pinecone');

async function testPinecone() {
  console.log("Starting Pinecone Test...");
  const pc = new Pinecone({ apiKey: "pcsk_3sZ1ax_Py17u8iQ5sewsfJzRAKE6172DspsynSziYXQ6BsMpVjWFMeqgwNAENwkS1vKPLA" });
  
  try {
    const index = pc.index('legacy-nexus');
    const ns = index.namespace('test-user-id');
    
    // Create a dummy 768 dimension vector
    const dummyVector = new Array(768).fill(0.1);
    
    console.log("Created dummy 768 vector, attempting upsert...");
    await ns.upsert([
      {
        id: "test-vector-1",
        values: dummyVector,
        metadata: { text: "This is a test vector." }
      }
    ]);
    
    console.log("Upsert successful!");
    
    // Check stats
    const stats = await index.describeIndexStats();
    console.log("Stats after upsert:", JSON.stringify(stats, null, 2));
    
  } catch (err) {
    console.error("Pinecone Upsert Error:", err);
  }
}

testPinecone();
