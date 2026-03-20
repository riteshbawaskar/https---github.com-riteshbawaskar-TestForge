/**
 * LanceDB vector DB wrapper — file-based, no server required.
 * Data is stored in the directory defined by LANCEDB_PATH (default: ./lancedb_storage).
 */
import * as lancedb from '@lancedb/lancedb';
import { config } from '../config.js';

let _db = null;

async function getDb() {
  if (!_db) {
    _db = await lancedb.connect(config.lanceDbPath);
  }
  return _db;
}

function tableName(projectId) {
  return `project_${projectId.replace(/-/g, '_')}`;
}

export async function upsertChunks(projectId, documentId, chunks, embeddings) {
  if (!chunks.length) return;

  const db  = await getDb();
  const tbl = tableName(projectId);

  const records = chunks.map((text, i) => ({
    id:          `${documentId}_${i}`,
    vector:      embeddings[i],
    document_id: documentId,
    chunk_index: i,
    text,
    source:      documentId,
  }));

  const names = await db.tableNames();
  if (!names.includes(tbl)) {
    await db.createTable(tbl, records);
    console.log(`[lancedb] Created table: ${tbl}`);
  } else {
    const table = await db.openTable(tbl);
    // Replace all chunks for this document
    const escaped = documentId.replace(/'/g, "''");
    await table.delete(`document_id = '${escaped}'`);
    await table.add(records);
  }
}

export async function searchChunks(projectId, queryVector, k) {
  const db    = await getDb();
  const tbl   = tableName(projectId);
  const names = await db.tableNames();
  if (!names.includes(tbl)) return [];

  const table   = await db.openTable(tbl);
  const results = await table.search(queryVector).limit(k).toArray();
  return results.map(r => r.text || '');
}

export async function deleteDocumentVectors(projectId, documentId) {
  try {
    const db    = await getDb();
    const tbl   = tableName(projectId);
    const names = await db.tableNames();
    if (!names.includes(tbl)) return;

    const table   = await db.openTable(tbl);
    const escaped = documentId.replace(/'/g, "''");
    await table.delete(`document_id = '${escaped}'`);
  } catch (e) {
    console.warn(`[lancedb] deleteDocumentVectors failed: ${e.message}`);
  }
}

export async function getCollectionStats(projectId) {
  try {
    const db    = await getDb();
    const tbl   = tableName(projectId);
    const names = await db.tableNames();
    if (!names.includes(tbl)) return { total_vectors: 0 };

    const table = await db.openTable(tbl);
    const count = await table.countRows();
    return { total_vectors: count };
  } catch {
    return { total_vectors: 0 };
  }
}
