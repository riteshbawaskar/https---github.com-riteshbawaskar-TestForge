/**
 * Qdrant vector DB client wrapper.
 * Qdrant must be running (Docker or Qdrant Cloud).
 * Start locally:  docker run -p 6333:6333 qdrant/qdrant
 */
import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../config.js';
import { vectorSize } from './embedding.js';

let _client = null;

function qdrant() {
  if (!_client) {
    _client = new QdrantClient({
      url: config.qdrantUrl,
      ...(config.qdrantApiKey ? { apiKey: config.qdrantApiKey } : {}),
    });
  }
  return _client;
}

function collectionName(projectId) {
  return `project_${projectId.replace(/-/g, '_')}`;
}

async function ensureCollection(client, name) {
  const { collections } = await client.getCollections();
  const exists = collections.some(c => c.name === name);
  if (!exists) {
    await client.createCollection(name, {
      vectors: { size: vectorSize(), distance: 'Cosine' },
    });
    console.log(`[qdrant] Created collection: ${name}`);
  }
}

export async function upsertChunks(projectId, documentId, chunks, embeddings) {
  const client = qdrant();
  const col    = collectionName(projectId);
  await ensureCollection(client, col);

  const points = chunks.map((text, i) => ({
    id:      `${documentId}_${i}`,   // Qdrant accepts string IDs
    vector:  embeddings[i],
    payload: { document_id: documentId, chunk_index: i, text, source: documentId },
  }));

  // Upsert in batches of 100
  for (let i = 0; i < points.length; i += 100) {
    await client.upsert(col, { wait: true, points: points.slice(i, i + 100) });
  }
}

export async function searchChunks(projectId, queryVector, k) {
  const client = qdrant();
  const col    = collectionName(projectId);
  const { collections } = await client.getCollections();
  if (!collections.some(c => c.name === col)) return [];

  const hits = await client.search(col, { vector: queryVector, limit: k, with_payload: true });
  return hits.map(h => h.payload?.text || '');
}

export async function deleteDocumentVectors(projectId, documentId) {
  try {
    const client = qdrant();
    const col    = collectionName(projectId);
    const { collections } = await client.getCollections();
    if (!collections.some(c => c.name === col)) return;

    await client.delete(col, {
      filter: { must: [{ key: 'document_id', match: { value: documentId } }] },
    });
  } catch (e) {
    console.warn(`[qdrant] deleteDocumentVectors failed: ${e.message}`);
  }
}

export async function getCollectionStats(projectId) {
  try {
    const client = qdrant();
    const col    = collectionName(projectId);
    const { collections } = await client.getCollections();
    if (!collections.some(c => c.name === col)) return { total_vectors: 0 };
    const info = await client.getCollection(col);
    return { total_vectors: info.vectors_count || 0 };
  } catch {
    return { total_vectors: 0 };
  }
}
