
import { getDb } from '../src/lib/local-db/client';
import { getVectorDb, getVectorTable } from '../src/lib/local-vector/client';
import path from 'path';
import fs from 'fs';

async function testDatabases() {
  console.log("=== Testing Local Databases ===\n");

  try {
    // 1. Test SQLite Relational DB
    console.log("[1] Testing Local SQLite Database (.data/legacy_nexus.db)...");
    const db = getDb();
    
    // Quick query to check if user_profiles exists and has data
    const profiles = db.prepare('SELECT COUNT(*) as count FROM user_profiles').get() as { count: number };
    const contacts = db.prepare('SELECT COUNT(*) as count FROM legacy_contacts').get() as { count: number };
    const stories = db.prepare('SELECT COUNT(*) as count FROM legacy_stories').get() as { count: number };
    const sources = db.prepare('SELECT COUNT(*) as count FROM user_sources').get() as { count: number };
    
    console.log(`✅ SQLite Connection Successful`);
    console.log(`   - Profiles migrated: ${profiles.count}`);
    console.log(`   - Contacts migrated: ${contacts.count}`);
    console.log(`   - Stories migrated: ${stories.count}`);
    console.log(`   - Sources migrated: ${sources.count}`);
    
    if (profiles.count === 0 && contacts.count === 0) {
       console.log(`⚠️ Warning: No records found in SQLite. Migration might not have pulled your specific data.`);
    }

  } catch (err: any) {
    console.error("❌ SQLite Test Failed:", err.message);
  }

  console.log("\n-----------------------------------\n");

  try {
    // 2. Test LanceDB Vector DB
    console.log("[2] Testing Local LanceDB Vector Database (.data/.lancedb)...");
    const vDb = await getVectorDb();
    const tableNames = await vDb.tableNames();
    
    console.log(`✅ LanceDB Connection Successful`);
    console.log(`   - Existing vector tables: ${tableNames.length > 0 ? tableNames.join(', ') : 'None yet (will be created on first embed)'}`);
    
    if (tableNames.includes('legacy_vectors')) {
       const table = await getVectorTable();
       if (table) {
          const count = await table.countRows();
          console.log(`   - Vectors stored: ${count}`);
       }
    } else {
       console.log(`   - Note: The 'legacy_vectors' table will be created automatically when you upload your first document or click 'Re-Embed'.`);
    }

  } catch (err: any) {
    console.error("❌ LanceDB Test Failed:", err.message);
  }
  
  console.log("\n=== Testing Complete ===");
  process.exit(0);
}

testDatabases();
