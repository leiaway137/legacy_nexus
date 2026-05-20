import { initDb, getDb as getLocalDb } from "../src/lib/local-db/client";
import { fetchUserSources, fetchDashboardState } from "../src/lib/mongo/db";

async function main() {
  initDb();
  const db = getLocalDb();
  const user = db.prepare('SELECT * FROM users ORDER BY createdAt DESC LIMIT 1').get() as any;
  if (!user) {
    console.log("No users found");
    return;
  }
  console.log("User:", user.email, user.id);
  
  const sources = await fetchUserSources(user.id);
  console.log("Sources count:", sources.length);
  console.log("Source IDs:", sources.map(s => s.id));
  
  const dashboard = await fetchDashboardState(user.id);
  if (dashboard) {
      console.log("Dashboard processedSourceIds:", dashboard.processedSourceIds);
  } else {
      console.log("No dashboard found for user.");
  }
  process.exit(0);
}

main().catch(console.error);
