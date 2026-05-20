import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// Define path for SQLite database file
const dbDir = path.join(process.cwd(), '.data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'legacy_nexus.db');

export const getDb = () => {
  const db = new Database(dbPath);

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');

  return db;
};

// Initialize schema
export const initDb = () => {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      passwordHash TEXT,
      createdAt TEXT
    );

    CREATE TABLE IF NOT EXISTS user_profiles (
      id TEXT PRIMARY KEY,
      userId TEXT UNIQUE,
      firstName TEXT,
      middleName TEXT,
      lastName TEXT,
      formerName TEXT,
      pronouns TEXT,
      genderIdentity TEXT,
      dateOfBirth TEXT,
      placeOfBirth TEXT,
      residence TEXT,
      culturalHeritage TEXT,
      primaryLanguage TEXT,
      secondaryLanguages TEXT,
      userOverrides TEXT, -- JSON
      trustScore INTEGER DEFAULT 0,
      privacyLevel TEXT,
      voiceProvider TEXT,
      ttsVoiceId TEXT,
      encryptedTtsApiKey TEXT,
      resembleProjectId TEXT,
      publicSlug TEXT,
      familyAccessEmails TEXT, -- JSON
      isAnonymizedBuildReady INTEGER,
      pseudonymMap TEXT, -- JSON
      completedTours TEXT, -- JSON
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS user_sources (
      id TEXT PRIMARY KEY,
      userId TEXT,
      fileName TEXT,
      fileSize INTEGER,
      textContent TEXT,
      parsedContent TEXT,
      intelligence TEXT, -- JSON
      uploadedAt TEXT,
      isSynced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS legacy_podcasts (
      id TEXT PRIMARY KEY,
      userId TEXT,
      title TEXT,
      subject TEXT,
      durationOption TEXT,
      voiceProvider TEXT,
      transcript TEXT, -- JSON
      createdAt TEXT
    );

    CREATE TABLE IF NOT EXISTS legacy_contacts (
      id TEXT PRIMARY KEY,
      userId TEXT,
      originalName TEXT,
      completeName TEXT,
      preferredName TEXT,
      firstName TEXT,
      middleName TEXT,
      lastName TEXT,
      relationship TEXT,
      aliases TEXT, -- JSON
      email TEXT,
      phone TEXT,
      linkedAccountId TEXT,
      source TEXT,
      archiveAccessTier TEXT,
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS legacy_session_active (
      userId TEXT PRIMARY KEY,
      synopsis TEXT,
      totalChunks INTEGER,
      chunks TEXT, -- JSON
      extractedWisdomTags TEXT, -- JSON
      wisdomSummaries TEXT, -- JSON
      aiRecommendedQuestions TEXT, -- JSON
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS legacy_stories (
      userId TEXT PRIMARY KEY,
      stories TEXT, -- JSON
      lastUpdated TEXT
    );

    CREATE TABLE IF NOT EXISTS legacy_dashboard_active (
      userId TEXT PRIMARY KEY,
      processedSourceIds TEXT, -- JSON
      stateData TEXT, -- JSON
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS legacy_insights (
      userId TEXT PRIMARY KEY,
      data TEXT, -- JSON
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS legacy_chats (
      userId TEXT PRIMARY KEY,
      messages TEXT, -- JSON
      updatedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS legacy_questions (
      id TEXT PRIMARY KEY,
      userId TEXT,
      text TEXT,
      source TEXT,
      storyId TEXT,
      isAnswered INTEGER DEFAULT 0,
      createdAt TEXT
    );
  `);
};
