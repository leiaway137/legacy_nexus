const { MongoClient } = require('mongodb');

const uri = "mongodb+srv://vincentlei_db_user:7qIAT86erF3kkHhd@cluster0.6lxaquy.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

async function run() {
  console.log("Attempting to connect to MongoDB...");
  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log("SUCCESS! Connected successfully to server");
    
    // Quick test write
    const db = client.db("legacy_nexus");
    const testCol = db.collection("test_auth");
    await testCol.insertOne({ connected: true, timestamp: new Date() });
    console.log("SUCCESS! Wrote test document to 'legacy_nexus.test_auth'");
    
  } catch (err) {
    console.error("FAILED TO CONNECT:");
    console.error(err);
  } finally {
    await client.close();
    console.log("Connection closed.");
  }
}

run().catch(console.dir);
