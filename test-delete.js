const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db("legacy_nexus");
  
  // Create test user
  const email = "test-delete-123@demo.com";
  await db.collection("users").deleteOne({ email }); // Ensure clean start
  const res = await db.collection("users").insertOne({ email, passwordHash: "123", createdAt: new Date() });
  const userIdStr = res.insertedId.toString();
  console.log("Created user with string ID:", userIdStr);
  
  // Emulate NextAuth / deleteUserAccount behavior
  let objId;
  try {
     objId = new ObjectId(userIdStr);
  } catch (e) {
     objId = userIdStr;
  }
  
  const deleteResult = await db.collection("users").deleteOne({ _id: objId });
  console.log("Deleted count:", deleteResult.deletedCount);
  
  const userExists = await db.collection("users").findOne({ _id: new ObjectId(userIdStr) });
  console.log("User exists after delete?", !!userExists);
  
  await client.close();
}

run().catch(console.error);
