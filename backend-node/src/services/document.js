/**
 * Document ingestion: parse → chunk → embed → store in Qdrant.
 * Supports: PDF, DOCX, XLSX, TXT, MD, CSV
 */
import { readFileSync } from 'fs';
import { extname } from 'path';
import { config } from '../config.js';
import { embed, checkEmbeddingConfig } from './embedding.js';
import { upsertChunks, searchChunks, getCollectionStats } from './vectordb.js';

// ── Text extraction ──────────────────────────────────────────────────────────

async function extractText(filePath) {
  const ext = extname(filePath).toLowerCase().slice(1);

  if (ext === 'pdf') {
    const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js');
    const buf  = readFileSync(filePath);
    const data = await pdfParse(buf);
    return data.text;
  }

  if (ext === 'docx') {
    const mammoth = await import('mammoth');
    const result  = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  if (ext === 'xlsx' || ext === 'xls') {
    const XLSX  = await import('xlsx');
    const wb    = XLSX.readFile(filePath);
    const lines = [];
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      const csv   = XLSX.utils.sheet_to_csv(sheet);
      lines.push(csv);
    }
    return lines.join('\n');
  }

  // txt, md, csv — plain text
  return readFileSync(filePath, 'utf8');
}

// ── Chunking ─────────────────────────────────────────────────────────────────

export function chunkText(text, size = config.chunkSize, overlap = config.chunkOverlap) {
  const paragraphs = text.split(/\n\s*\n/);
  const chunks = [];
  let buf = '';

  for (const para of paragraphs) {
    const p = para.trim();
    if (!p) continue;
    if (buf.length + p.length + 2 <= size) {
      buf = buf ? `${buf}\n\n${p}` : p;
    } else {
      if (buf) chunks.push(buf);
      // Hard-split oversized paragraphs
      let rest = p;
      while (rest.length > size) {
        chunks.push(rest.slice(0, size));
        rest = rest.slice(size - overlap);
      }
      buf = rest;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks.filter(c => c.trim());
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function ingestDocument(filePath, projectId, documentId) {
  checkEmbeddingConfig();

  const text = await extractText(filePath);
  if (!text?.trim()) throw new Error(`No text extracted from file`);

  const chunks = chunkText(text);
  if (!chunks.length) throw new Error('Zero chunks produced');

  console.log(`[doc] Chunked ${chunks.length} chunks from ${filePath}`);

  // Batch embeds — smaller batches for Gemini/local
  const batchSize = config.embeddingProvider === 'openai' ? 200 : 16;
  const allEmbeddings = [];
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = await embed(chunks.slice(i, i + batchSize));
    allEmbeddings.push(...batch);
  }

  await upsertChunks(projectId, documentId, chunks, allEmbeddings);
  console.log(`[doc] Indexed ${chunks.length} chunks → Qdrant`);
  return chunks.length;
}

export async function retrieveContext(query, projectId, k = config.ragTopK) {
  const p = config.embeddingProvider.toLowerCase();
  if (p === 'openai' && !config.openaiApiKey) return [];
  if (p === 'gemini' && !config.geminiApiKey) return [];
  try {
    const [queryVec] = await embed([query]);
    return await searchChunks(projectId, queryVec, k);
  } catch (e) {
    console.warn(`[rag] retrieve failed: ${e.message}`);
    return [];
  }
}

export async function getIndexStats(projectId) {
  const stats = await getCollectionStats(projectId);
  const p = config.embeddingProvider;
  let model = config.embeddingModel;
  if (p === 'gemini' && model === 'text-embedding-3-small') model = 'text-embedding-004';
  if (p === 'local'  && model === 'text-embedding-3-small') model = 'all-MiniLM-L6-v2';
  return {
    ...stats,
    embedding_model: `${p}/${model}`,
    vector_store: `Qdrant @ ${config.qdrantUrl}`,
  };
}
