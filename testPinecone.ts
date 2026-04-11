import { Pinecone } from "@pinecone-database/pinecone";
import * as dotenv from "dotenv";
dotenv.config({ path: "/Users/leiaway/Antigravity/Legacy Nexus/.env.local" });

async function purgePinecone() {
  try {
    const pc = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY as string,
    });
    
    const index = pc.Index(process.env.PINECONE_INDEX as string);
    const userId = "GHI9aD3PQXb3GNy1L44kXYsXlqS2"; // Target user from screenshot
    const ns = index.namespace(userId);
    
    console.log("Purging all orphaned vectors for user namespace:", userId);
    await ns.deleteAll();
    console.log("Successfully purged Pinecone namespace.");
  } catch (err) {
    console.error("Purge failed:", err);
  }
}

purgePinecone();
