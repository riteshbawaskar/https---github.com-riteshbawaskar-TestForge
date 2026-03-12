import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database.js';
import { encryptToken } from '../security.js';
import { GitLabService } from '../services/gitlab.js';

const router = Router();

function row(p) {
  const { gitlab_token_encrypted, ...rest } = p;
  return { ...rest, created_at: p.created_at, updated_at: p.updated_at };
}

router.get('/', (req, res) => {
  const projects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
  res.json(projects.map(row));
});

router.get('/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ detail: 'Project not found' });
  res.json(row(p));
});

router.post('/', (req, res) => {
  const { gitlab_token, ...data } = req.body;
  if (!data.name?.trim()) return res.status(400).json({ detail: 'name is required' });

  const id = uuidv4();
  db.prepare(`
    INSERT INTO projects (id, name, description, gitlab_url, gitlab_token_encrypted,
      gitlab_project_path, llm_model, llm_provider, custom_instructions,
      default_format, detail_level, label_include, label_exclude, issue_state, max_issues)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id, data.name.trim(), data.description || null, data.gitlab_url || null,
    gitlab_token ? encryptToken(gitlab_token) : null,
    data.gitlab_project_path || null,
    data.llm_model || 'claude-sonnet-4-6', data.llm_provider || 'anthropic',
    data.custom_instructions || null, data.default_format || 'BDD',
    data.detail_level || 'detailed', data.label_include || null,
    data.label_exclude || null, data.issue_state || 'opened',
    data.max_issues || 100,
  );
  const p = db.prepare('SELECT * FROM projects WHERE id=?').get(id);
  res.status(201).json(row(p));
});

router.put('/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ detail: 'Project not found' });

  const { gitlab_token, ...data } = req.body;
  const updates = { ...p, ...data, updated_at: new Date().toISOString() };
  if (gitlab_token) updates.gitlab_token_encrypted = encryptToken(gitlab_token);

  db.prepare(`
    UPDATE projects SET name=?, description=?, gitlab_url=?, gitlab_token_encrypted=?,
      gitlab_project_path=?, llm_model=?, llm_provider=?, custom_instructions=?,
      default_format=?, detail_level=?, label_include=?, label_exclude=?,
      issue_state=?, max_issues=?, updated_at=?
    WHERE id=?
  `).run(
    updates.name, updates.description, updates.gitlab_url, updates.gitlab_token_encrypted,
    updates.gitlab_project_path, updates.llm_model, updates.llm_provider,
    updates.custom_instructions, updates.default_format, updates.detail_level,
    updates.label_include, updates.label_exclude, updates.issue_state, updates.max_issues,
    updates.updated_at, req.params.id,
  );
  res.json(row(db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id)));
});

router.delete('/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ detail: 'Project not found' });
  db.prepare('DELETE FROM projects WHERE id=?').run(req.params.id);
  res.status(204).end();
});

router.post('/:id/test-connection', async (req, res) => {
  const p = db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ detail: 'Project not found' });
  try {
    const result = await new GitLabService(p).testConnection();
    res.json(result);
  } catch (e) {
    res.json({ connected: false, error: e.message });
  }
});

export default router;
