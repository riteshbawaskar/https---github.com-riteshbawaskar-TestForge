import { Router } from 'express';
import multer from 'multer';
import { mkdirSync } from 'fs';
import { join, extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database.js';
import { config } from '../config.js';
import { runIndexDocument } from '../services/jobs.js';
import { deleteDocumentVectors, getCollectionStats } from '../services/vectordb.js';
import { unlink } from 'fs/promises';

mkdirSync(config.uploadDir, { recursive: true });

const ALLOWED = new Set(['pdf','docx','xlsx','xls','txt','md','csv']);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.uploadDir),
  filename:    (req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase().slice(1);
    cb(null, `${uuidv4()}.${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase().slice(1);
    ALLOWED.has(ext) ? cb(null, true) : cb(new Error(`File type .${ext} not allowed`));
  },
});

const router = Router();

router.post('/:projectId/upload', upload.single('file'), async (req, res) => {
  const project = db.prepare('SELECT id FROM projects WHERE id=?').get(req.params.projectId);
  if (!project) return res.status(404).json({ detail: 'Project not found' });
  if (!req.file)  return res.status(400).json({ detail: 'No file uploaded' });

  const ext = extname(req.file.originalname).toLowerCase().slice(1);
  const docId = req.file.filename.replace(`.${ext}`, '');

  db.prepare(`
    INSERT INTO documents (id, project_id, original_filename, stored_filename, file_type, file_size_bytes, status)
    VALUES (?,?,?,?,?,?,'PENDING')
  `).run(docId, req.params.projectId, req.file.originalname, req.file.filename, ext.toUpperCase(), req.file.size);

  const doc = db.prepare('SELECT * FROM documents WHERE id=?').get(docId);
  res.status(201).json(doc);

  // Fire-and-forget background indexing
  const filePath = join(config.uploadDir, req.file.filename);
  setImmediate(() => runIndexDocument({ documentId: docId, filePath, projectId: req.params.projectId }));
});

router.get('/:projectId', (req, res) => {
  const project = db.prepare('SELECT id FROM projects WHERE id=?').get(req.params.projectId);
  if (!project) return res.status(404).json({ detail: 'Project not found' });
  const docs = db.prepare("SELECT * FROM documents WHERE project_id=? ORDER BY uploaded_at DESC").all(req.params.projectId);
  res.json(docs);
});

router.get('/:projectId/stats', async (req, res) => {
  const docs        = db.prepare("SELECT * FROM documents WHERE project_id=?").all(req.params.projectId);
  const totalChunks = docs.filter(d => d.status === 'INDEXED').reduce((s, d) => s + d.chunk_count, 0);
  const qdrantStats = await getCollectionStats(req.params.projectId);
  const p = config.embeddingProvider;
  let model = config.embeddingModel;
  if (p === 'gemini' && model === 'text-embedding-3-small') model = 'text-embedding-004';
  if (p === 'local'  && model === 'text-embedding-3-small') model = 'all-MiniLM-L6-v2';
  res.json({
    document_count:  docs.length,
    indexed_count:   docs.filter(d => d.status === 'INDEXED').length,
    total_chunks:    totalChunks,
    embedding_model: `${p}/${model}`,
    vector_store:    `Qdrant @ ${config.qdrantUrl}`,
  });
});

router.delete('/:documentId', async (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id=?').get(req.params.documentId);
  if (!doc) return res.status(404).json({ detail: 'Document not found' });

  // Delete from Qdrant
  await deleteDocumentVectors(doc.project_id, doc.id);

  // Delete file from disk
  try { await unlink(join(config.uploadDir, doc.stored_filename)); } catch {}

  db.prepare('DELETE FROM documents WHERE id=?').run(req.params.documentId);
  res.status(204).end();
});

export default router;
