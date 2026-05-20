import { getDb, initDb } from '../src/lib/local-db/client';
import { fetchHighFidelityStories } from '../src/lib/local-db/db';
import { embedStoriesToPineconeAction } from '../src/app/actions';

async function main() {
  initDb();
  const db = getDb();

  console.log("Starting Re-Embed of High Fidelity Stories to LanceDB...");

  const users = db.prepare('SELECT id FROM users').all() as any[];

  for (const user of users) {
    const userId = user.id;
    console.log(`Processing user: ${userId}`);

    const stories = await fetchHighFidelityStories(userId);
    
    if (stories && stories.length > 0) {
      console.log(`Found ${stories.length} stories for user ${userId}. Embedding...`);
      // We pass a dummy sourceId since these are synthesized
      await embedStoriesToPineconeAction(userId, 'migrated-source', stories);
      console.log(`✅ Successfully embedded stories for user ${userId}`);
    } else {
      console.log(`No stories found for user ${userId}`);
    }
  }

  console.log("Done embedding all stories.");
  process.exit(0);
}

main().catch(console.error);
