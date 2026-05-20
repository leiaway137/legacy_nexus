import * as lancedb from '@lancedb/lancedb';
import path from 'path';
import fs from 'fs';

const dbDir = path.join(process.cwd(), '.data', '.lancedb');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let dbPromise: Promise<lancedb.Connection> | null = null;

export const getVectorDb = async () => {
  if (!dbPromise) {
    dbPromise = lancedb.connect(dbDir);
  }
  return dbPromise;
};

export const getVectorTable = async () => {
  const db = await getVectorDb();
  const tableName = 'legacy_vectors';
  const tableNames = await db.tableNames();
  
  if (tableNames.includes(tableName)) {
    return await db.openTable(tableName);
  } else {
    // Create an empty table with a dummy schema based on our usage
    // We will use an initial empty array, but we must provide a schema or data.
    // lancedb allows creating empty table if schema is provided, but easiest is to let it infer when we insert,
    // or provide explicit schema. For simplicity, we just check if exist and return. If it doesn't exist, we will create it on first upsert.
    return null;
  }
}

export const ensureVectorTable = async (data: any[]) => {
  const db = await getVectorDb();
  const tableName = 'legacy_vectors';
  const tableNames = await db.tableNames();
  
  if (tableNames.includes(tableName)) {
    const table = await db.openTable(tableName);
    await table.add(data);
    return table;
  } else {
    return await db.createTable(tableName, data);
  }
}

export const upsertVectors = async (userId: string, vectors: { id: string, values: number[], metadata: any }[]) => {
  const mappedData = vectors.map(v => ({
    id: v.id,
    vector: v.values,
    userId: userId,
    text: v.metadata.text || '',
    sourceId: v.metadata.sourceId || '',
    era: v.metadata.era || '',
    perspective: v.metadata.perspective || ''
  }));

  const db = await getVectorDb();
  const tableName = 'legacy_vectors';
  const tableNames = await db.tableNames();
  
  if (tableNames.includes(tableName)) {
    const table = await db.openTable(tableName);
    const ids = mappedData.map(d => `'${d.id}'`).join(',');
    if (ids.length > 0) {
       try { await table.delete(`id IN (${ids})`); } catch(e) {}
    }
    await table.add(mappedData);
  } else {
    await db.createTable(tableName, mappedData);
  }
};

export const deleteUserVectors = async (userId: string) => {
  const table = await getVectorTable();
  if (table) {
    try {
      await table.delete(`userId = '${userId}'`);
    } catch (error) {
      console.error("Failed to delete user vectors", error);
    }
  }
}

export const queryUserVectors = async (userId: string, vector: number[], topK: number = 40) => {
  const table = await getVectorTable();
  if (!table) return [];

  const results = await table.search(vector)
    .distanceType('cosine')
    .where(`userId = '${userId}'`)
    .limit(topK)
    .toArray();

  return results.map((r: any) => ({
    id: r.id,
    score: (r as any)._distance,
    metadata: {
      text: r.text,
      sourceId: r.sourceId,
      era: r.era,
      perspective: r.perspective
    }
  }));
}
