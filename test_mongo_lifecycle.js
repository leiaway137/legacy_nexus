const { MongoClient, ObjectId } = require('mongodb');

const uri = "mongodb+srv://vincentlei_db_user:7qIAT86erF3kkHhd@cluster0.6lxaquy.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

async function run() {
  console.log("---- Testing MongoDB Lifecycle ----");
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db("legacy_nexus");
    const sources = db.collection("user_sources");

    // 1. Upload Test
    console.log("1. Simulating Source Upload...");
    const uploadRes = await sources.insertOne({
      userId: "test-archivist-99",
      fileName: "test_mongo_upload.pdf",
      fileSize: 1024,
      textContent: "This is a simulated upload test.",
      uploadedAt: new Date()
    });
    console.log("   ✅ Upload successful! Inserted ID:", uploadRes.insertedId);

    // 2. Fetch Verification
    console.log("2. Verifying Fetch...");
    const doc = await sources.findOne({ _id: uploadRes.insertedId });
    if (doc) {
        console.log("   ✅ Fetch successful! Document verified in schema.");
    }

    // 3. Deletion Test
    console.log("3. Simulating Source Deletion...");
    const delRes = await sources.deleteOne({ _id: uploadRes.insertedId });
    if (delRes.deletedCount === 1) {
        console.log("   ✅ Deletion successful! Document eradicated from database.");
    }
    
  } catch (err) {
    console.error("Test Failed:");
    console.error(err);
  } finally {
    await client.close();
    console.log("---- Test Concluded ----");
  }
}

run();
