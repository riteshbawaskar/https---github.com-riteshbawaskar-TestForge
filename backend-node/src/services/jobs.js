/**
 * Background job runners — plain async, no queue needed.
 * Launched with setImmediate() from route handlers.
 */
import { db } from '../db/database.js';
import { generateTestCases } from './llm.js';
import { ingestDocument } from './document.js';
import { v4 as uuidv4 } from 'uuid';

function updateJob(id, status, progress, error = null) {
  const completedAt = ['COMPLETE', 'FAILED'].includes(status) ? new Date().toISOString() : null;
  db.prepare(`
    UPDATE generation_jobs
    SET status=?, progress_message=?, error_message=?, completed_at=?
    WHERE id=?
  `).run(status, progress, error, completedAt, id);
}

export async function runGenerateTestCases({ jobId, requirementId, projectId, fmt, countHint, additionalContext }) {
  updateJob(jobId, 'RUNNING', 'Fetching requirement details…');
  try {
    const req     = db.prepare('SELECT * FROM requirements WHERE id=?').get(requirementId);
    const project = db.prepare('SELECT * FROM projects WHERE id=?').get(projectId);
    if (!req || !project) {
      updateJob(jobId, 'FAILED', 'Not found', 'Requirement or project not found');
      return;
    }

    updateJob(jobId, 'RUNNING', 'Retrieving document context…');

    updateJob(jobId, 'RUNNING', `Calling ${project.llm_model}…`);

    const cases = await generateTestCases({
      requirement: { title: req.title, description: req.description || '', labels: req.labels || '' },
      projectId,
      fmt,
      countHint,
      additionalContext,
      llmProvider: project.llm_provider,
      llmModel:    project.llm_model,
      customInstructions: project.custom_instructions || '',
    });

    updateJob(jobId, 'RUNNING', `Saving ${cases.length} test cases…`);

    const insert = db.prepare(`
      INSERT INTO test_cases (id, requirement_id, title, format, content, priority, tags, scenario_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertMany = db.transaction(rows => {
      for (const tc of rows) insert.run(
        uuidv4(), requirementId,
        tc.title || 'Untitled',
        tc.format === 'BOTH' ? 'BDD' : (tc.format || fmt),
        typeof tc.content === 'object' ? JSON.stringify(tc.content, null, 2) : (tc.content || ''),
        tc.priority || 'MEDIUM',
        tc.tags || '',
        tc.scenario_type || 'positive',
      );
    });
    insertMany(cases);

    updateJob(jobId, 'COMPLETE', `Generated ${cases.length} test cases`);
    console.log(`[job] Generation complete job=${jobId} count=${cases.length}`);

  } catch (e) {
    console.error(`[job] Generation failed job=${jobId}:`, e.message);
    updateJob(jobId, 'FAILED', 'Generation failed', e.message);
  }
}

export async function runIndexDocument({ documentId, filePath, projectId }) {
  db.prepare("UPDATE documents SET status='INDEXING' WHERE id=?").run(documentId);
  try {
    const chunkCount = await ingestDocument(filePath, projectId, documentId);
    db.prepare("UPDATE documents SET status='INDEXED', chunk_count=? WHERE id=?").run(chunkCount, documentId);
    console.log(`[job] Indexed doc=${documentId} chunks=${chunkCount}`);
  } catch (e) {
    console.error(`[job] Indexing failed doc=${documentId}:`, e.message);
    db.prepare("UPDATE documents SET status='FAILED', error_message=? WHERE id=?").run(e.message, documentId);
  }
}
