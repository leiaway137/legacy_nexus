import { MongoClient } from 'mongodb';
import { getDb, initDb } from '../src/lib/local-db/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function migrate() {
  console.log("Starting Migration from Cloud MongoDB to Local SQLite...");
  
  if (!process.env.MONGODB_URI) {
    console.error("Missing MONGODB_URI in .env.local");
    process.exit(1);
  }

  const client = new MongoClient(process.env.MONGODB_URI, {
    tls: true,
    tlsAllowInvalidCertificates: true
  });
  await client.connect();
  const mongoDb = client.db("legacy_nexus");
  
  // Ensure local DB is ready
  initDb();
  const localDb = getDb();

  const collections = [
    { name: 'users', table: 'users' },
    { name: 'user_profiles', table: 'user_profiles' },
    { name: 'user_sources', table: 'user_sources' },
    { name: 'legacy_podcasts', table: 'legacy_podcasts' },
    { name: 'legacy_contacts', table: 'legacy_contacts' },
    { name: 'legacy_session_active', table: 'legacy_session_active' },
    { name: 'legacy_stories', table: 'legacy_stories' },
    { name: 'legacy_dashboard_active', table: 'legacy_dashboard_active' },
    { name: 'legacy_insights', table: 'legacy_insights' },
    { name: 'legacy_chats', table: 'legacy_chats' },
    { name: 'legacy_questions', table: 'legacy_questions' }
  ];

  const safeStringify = (val: any) => {
    if (val === undefined || val === null) return null;
    if (typeof val === 'object') return JSON.stringify(val);
    return val;
  };

  for (const coll of collections) {
    console.log(`Migrating collection: ${coll.name} -> ${coll.table}`);
    const cursor = mongoDb.collection(coll.name).find({});
    const docs = await cursor.toArray();
    
    let count = 0;
    for (const doc of docs) {
      try {
        const id = doc._id.toString();
        
        if (coll.name === 'users') {
          localDb.prepare(`
            INSERT OR REPLACE INTO users (id, email, passwordHash, createdAt)
            VALUES (?, ?, ?, ?)
          `).run(
            id, doc.email, doc.passwordHash, doc.createdAt?.toISOString ? doc.createdAt.toISOString() : null
          );
        } else if (coll.name === 'user_profiles') {
          localDb.prepare(`
            INSERT OR REPLACE INTO user_profiles (id, userId, firstName, middleName, lastName, formerName, pronouns, genderIdentity, dateOfBirth, placeOfBirth, residence, culturalHeritage, primaryLanguage, secondaryLanguages, userOverrides, trustScore, privacyLevel, voiceProvider, ttsVoiceId, encryptedTtsApiKey, resembleProjectId, publicSlug, familyAccessEmails, isAnonymizedBuildReady, pseudonymMap, completedTours, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            id, doc.userId, doc.firstName, doc.middleName, doc.lastName, doc.formerName, doc.pronouns, doc.genderIdentity, doc.dateOfBirth, doc.placeOfBirth, doc.residence, doc.culturalHeritage, doc.primaryLanguage, doc.secondaryLanguages, safeStringify(doc.userOverrides), doc.trustScore || 0, doc.privacyLevel, doc.voiceProvider, doc.ttsVoiceId, doc.encryptedTtsApiKey, doc.resembleProjectId, doc.publicSlug, safeStringify(doc.familyAccessEmails), doc.isAnonymizedBuildReady ? 1 : 0, safeStringify(doc.pseudonymMap), safeStringify(doc.completedTours), doc.updatedAt?.toISOString ? doc.updatedAt.toISOString() : null
          );
        } else if (coll.name === 'user_sources') {
          localDb.prepare(`
            INSERT OR REPLACE INTO user_sources (id, userId, fileName, fileSize, textContent, parsedContent, intelligence, uploadedAt, isSynced)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            id, doc.userId, doc.fileName, doc.fileSize, doc.textContent, doc.parsedContent, safeStringify(doc.intelligence), doc.uploadedAt?.toISOString ? doc.uploadedAt.toISOString() : null, doc.isSynced ? 1 : 0
          );
        } else if (coll.name === 'legacy_podcasts') {
          localDb.prepare(`
            INSERT OR REPLACE INTO legacy_podcasts (id, userId, title, subject, durationOption, voiceProvider, transcript, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            id, doc.userId, doc.title, doc.subject, doc.durationOption, doc.voiceProvider, safeStringify(doc.transcript), doc.createdAt?.toISOString ? doc.createdAt.toISOString() : null
          );
        } else if (coll.name === 'legacy_contacts') {
          localDb.prepare(`
            INSERT OR REPLACE INTO legacy_contacts (id, userId, originalName, completeName, preferredName, firstName, middleName, lastName, relationship, aliases, email, phone, linkedAccountId, source, archiveAccessTier, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            id, doc.userId, doc.originalName, doc.completeName, doc.preferredName, doc.firstName, doc.middleName, doc.lastName, doc.relationship, safeStringify(doc.aliases), doc.email, doc.phone, doc.linkedAccountId, doc.source, doc.archiveAccessTier, doc.updatedAt?.toISOString ? doc.updatedAt.toISOString() : null
          );
        } else if (coll.name === 'legacy_session_active') {
          localDb.prepare(`
            INSERT OR REPLACE INTO legacy_session_active (userId, synopsis, totalChunks, chunks, extractedWisdomTags, wisdomSummaries, aiRecommendedQuestions, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            doc.userId, doc.synopsis, doc.totalChunks, safeStringify(doc.chunks), safeStringify(doc.extractedWisdomTags), safeStringify(doc.wisdomSummaries), safeStringify(doc.aiRecommendedQuestions), doc.updatedAt?.toISOString ? doc.updatedAt.toISOString() : null
          );
        } else if (coll.name === 'legacy_stories') {
          localDb.prepare(`
            INSERT OR REPLACE INTO legacy_stories (userId, stories, lastUpdated)
            VALUES (?, ?, ?)
          `).run(
            doc.userId, safeStringify(doc.stories), doc.lastUpdated?.toISOString ? doc.lastUpdated.toISOString() : null
          );
        } else if (coll.name === 'legacy_dashboard_active') {
          const stateData: any = { ...doc };
          delete stateData._id;
          delete stateData.userId;
          delete stateData.processedSourceIds;
          
          localDb.prepare(`
            INSERT OR REPLACE INTO legacy_dashboard_active (userId, processedSourceIds, stateData, updatedAt)
            VALUES (?, ?, ?, ?)
          `).run(
            doc.userId, safeStringify(doc.processedSourceIds), safeStringify(stateData), doc.updatedAt?.toISOString ? doc.updatedAt.toISOString() : null
          );
        } else if (coll.name === 'legacy_insights') {
          localDb.prepare(`
            INSERT OR REPLACE INTO legacy_insights (userId, data, updatedAt)
            VALUES (?, ?, ?)
          `).run(
            doc.userId, safeStringify(doc.data), doc.updatedAt?.toISOString ? doc.updatedAt.toISOString() : null
          );
        } else if (coll.name === 'legacy_chats') {
          localDb.prepare(`
            INSERT OR REPLACE INTO legacy_chats (userId, messages, updatedAt)
            VALUES (?, ?, ?)
          `).run(
            doc.userId, safeStringify(doc.messages), doc.updatedAt?.toISOString ? doc.updatedAt.toISOString() : null
          );
        } else if (coll.name === 'legacy_questions') {
          localDb.prepare(`
            INSERT OR REPLACE INTO legacy_questions (id, userId, text, source, storyId, isAnswered, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            id, doc.userId, doc.text, doc.source, doc.storyId, doc.isAnswered ? 1 : 0, doc.createdAt?.toISOString ? doc.createdAt.toISOString() : null
          );
        }
        count++;
      } catch (err) {
        console.error(`Failed to migrate doc in ${coll.name}`, err);
      }
    }
    console.log(`Finished migrating ${count} records for ${coll.name}.`);
  }

  console.log("MongoDB Migration Complete.");
  
  console.log("Vector DB Migration: We recommend allowing the application to re-embed the High Fidelity Stories into the new Local LanceDB instance organically to save tokens, or running a batch embed via the UI if needed.");

  await client.close();
  process.exit(0);
}

migrate();
