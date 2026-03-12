import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database.js';
import { runGenerateTestCases } from '../services/jobs.js';

const router = Router();

router.post('/generate', async (req, res) => {
  const { requirement_id, format = 'BDD', count_hint = 'auto', additional_context = '' } = req.body;
  if (!requirement_id) return res.status(400).json({ detail: 'requirement_id is required' });

  const req_ = db.prepare('SELECT * FROM requirements WHERE id=?').get(requirement_id);
  if (!req_) return res.status(404).json({ detail: 'Requirement not found' });

  const jobId = uuidv4();
  db.prepare(`
    INSERT INTO generation_jobs (id, requirement_id, status, format, count_hint)
    VALUES (?,'?','PENDING',?,?)
  `.replace("'?'", '?')).run(jobId, requirement_id, format, count_hint);

  const job = db.prepare('SELECT * FROM generation_jobs WHERE id=?').get(jobId);
  res.status(202).json(job);

  // Fire-and-forget
  setImmediate(() => runGenerateTestCases({
    jobId, requirementId: requirement_id, projectId: req_.project_id,
    fmt: format, countHint: count_hint, additionalContext: additional_context,
  }));
});

router.get('/requirement/:requirementId', (req, res) => {
  const fmt = req.query.format;
  let sql = 'SELECT * FROM test_cases WHERE requirement_id=?';
  const params = [req.params.requirementId];
  if (fmt) { sql += ' AND format=?'; params.push(fmt.toUpperCase()); }
  sql += ' ORDER BY created_at';
  res.json(db.prepare(sql).all(...params).map(tc => ({ ...tc, edited: !!tc.edited })));
});

router.get('/:id', (req, res) => {
  const tc = db.prepare('SELECT * FROM test_cases WHERE id=?').get(req.params.id);
  if (!tc) return res.status(404).json({ detail: 'TestCase not found' });
  res.json({ ...tc, edited: !!tc.edited });
});

router.patch('/:id', (req, res) => {
  const tc = db.prepare('SELECT * FROM test_cases WHERE id=?').get(req.params.id);
  if (!tc) return res.status(404).json({ detail: 'TestCase not found' });
  const { title, content, priority, tags, scenario_type } = req.body;
  db.prepare(`
    UPDATE test_cases SET title=?, content=?, priority=?, tags=?, scenario_type=?, edited=1, updated_at=?
    WHERE id=?
  `).run(
    title ?? tc.title, content ?? tc.content, priority ?? tc.priority,
    tags ?? tc.tags, scenario_type ?? tc.scenario_type,
    new Date().toISOString(), req.params.id,
  );
  const updated = db.prepare('SELECT * FROM test_cases WHERE id=?').get(req.params.id);
  res.json({ ...updated, edited: !!updated.edited });
});

router.delete('/:id', (req, res) => {
  if (!db.prepare('SELECT id FROM test_cases WHERE id=?').get(req.params.id))
    return res.status(404).json({ detail: 'TestCase not found' });
  db.prepare('DELETE FROM test_cases WHERE id=?').run(req.params.id);
  res.status(204).end();
});

router.post('/export', (req, res) => {
  const { project_id, requirement_id, format = 'BDD', file_type = 'csv' } = req.body;
  let cases;
  if (requirement_id) {
    let sql = 'SELECT * FROM test_cases WHERE requirement_id=?';
    const p = [requirement_id];
    if (format !== 'BOTH') { sql += ' AND format=?'; p.push(format); }
    cases = db.prepare(sql + ' ORDER BY created_at').all(...p);
  } else if (project_id) {
    let sql = 'SELECT tc.* FROM test_cases tc JOIN requirements r ON tc.requirement_id=r.id WHERE r.project_id=?';
    const p = [project_id];
    if (format !== 'BOTH') { sql += ' AND tc.format=?'; p.push(format); }
    cases = db.prepare(sql + ' ORDER BY tc.created_at').all(...p);
  } else {
    return res.status(400).json({ detail: 'Provide project_id or requirement_id' });
  }
  if (!cases.length) return res.status(404).json({ detail: 'No test cases found' });

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  if (file_type === 'json') {
    res.setHeader('Content-Disposition', `attachment; filename="testcases_${ts}.json"`);
    return res.json(cases.map(tc => ({ ...tc, edited: !!tc.edited })));
  }
  const header = 'ID,Title,Format,Priority,Scenario Type,Tags,Content,Edited,Created At\n';
  const rows   = cases.map(tc =>
    [tc.id, tc.title, tc.format, tc.priority, tc.scenario_type || '', tc.tags || '',
     `"${(tc.content || '').replace(/"/g, '""')}"`, tc.edited ? 'true' : 'false', tc.created_at]
    .join(',')
  ).join('\n');
  res.setHeader('Content-Disposition', `attachment; filename="testcases_${ts}.csv"`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.send('\uFEFF' + header + rows);   // BOM for Excel compatibility
});

export default router;
