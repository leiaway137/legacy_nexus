import { deleteUserAccount } from "./src/lib/mongo/db";
import clientPromise from "./src/lib/mongo/client";

async function run() {
  const client = await clientPromise;
  const db = client.db("legacy_nexus");
  
  // Create dummy
  const res = await db.collection("users").insertOne({ email: "test-delete-999@test.com" });
  const id = res.insertedId.toString();
  console.log("Created dummy user:", id);
  
  // Verify it exists
  const exists = await db.collection("users").findOne({ _id: res.insertedId });
  console.log("Before delete, user exists:", !!exists);
  
  // Run delete
  const success = await deleteUserAccount(id);
  console.log("deleteUserAccount result:", success);
  
  // Check if it still exists
  const stillExists = await db.collection("users").findOne({ _id: res.insertedId });
  console.log("After delete, user exists:", !!stillExists);
  process.exit(0);
}
run();
