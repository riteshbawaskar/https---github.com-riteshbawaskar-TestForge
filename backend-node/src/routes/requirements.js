import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database.js';
import { GitLabService } from '../services/gitlab.js';

const router = Router();

router.post('/fetch', async (req, res) => {
  const { gitlab_issue_url, project_id } = req.body;
  if (!gitlab_issue_url || !project_id)
    return res.status(400).json({ detail: 'gitlab_issue_url and project_id are required' });

  const project = db.prepare('SELECT * FROM projects WHERE id=?').get(project_id);
  if (!project) return res.status(404).json({ detail: 'Project not found' });

  // Idempotent — return existing if already fetched
  const existing = db.prepare('SELECT * FROM requirements WHERE project_id=? AND gitlab_issue_url=?').get(project_id, gitlab_issue_url);
  if (existing) return res.status(201).json(existing);

  try {
    const data = await new GitLabService(project).fetchIssue(gitlab_issue_url);
    const id   = uuidv4();
    db.prepare(`
      INSERT INTO requirements (id, project_id, gitlab_issue_id, gitlab_issue_url, title, description, labels, assignee, milestone)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(id, project_id, data.gitlab_issue_id, data.gitlab_issue_url, data.title, data.description, data.labels, data.assignee, data.milestone);
    res.status(201).json(db.prepare('SELECT * FROM requirements WHERE id=?').get(id));
  } catch (e) {
    res.status(422).json({ detail: e.message });
  }
});

router.post('/bulk-fetch/:projectId', async (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.projectId);
  if (!project) return res.status(404).json({ detail: 'Project not found' });

  try {
    const issues = await new GitLabService(project).listIssues({
      labels:     project.label_include,
      state:      project.issue_state,
      maxResults: project.max_issues,
    });

    const insert = db.prepare(`
      INSERT OR IGNORE INTO requirements (id, project_id, gitlab_issue_id, gitlab_issue_url, title, description, labels, assignee, milestone)
      VALUES (?,?,?,?,?,?,?,?,?)
    `);
    const insertMany = db.transaction(rows => rows.map(data => {
      const existing = db.prepare('SELECT id FROM requirements WHERE project_id=? AND gitlab_issue_url=?').get(req.params.projectId, data.gitlab_issue_url);
      if (existing) return null;
      const id = uuidv4();
      insert.run(id, req.params.projectId, data.gitlab_issue_id, data.gitlab_issue_url, data.title, data.description, data.labels, data.assignee, data.milestone);
      return db.prepare('SELECT * FROM requirements WHERE id=?').get(id);
    }).filter(Boolean));

    res.status(201).json(insertMany(issues));
  } catch (e) {
    res.status(422).json({ detail: e.message });
  }
});

router.get('/project/:projectId', (req, res) => {
  const project = db.prepare('SELECT id FROM projects WHERE id=?').get(req.params.projectId);
  if (!project) return res.status(404).json({ detail: 'Project not found' });
  res.json(db.prepare("SELECT * FROM requirements WHERE project_id=? ORDER BY fetched_at DESC").all(req.params.projectId));
});

router.get('/:id', (req, res) => {
  const r = db.prepare('SELECT * FROM requirements WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ detail: 'Requirement not found' });
  res.json(r);
});

router.delete('/:id', (req, res) => {
  const r = db.prepare('SELECT * FROM requirements WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ detail: 'Requirement not found' });
  db.prepare('DELETE FROM requirements WHERE id=?').run(req.params.id);
  res.status(204).end();
});

export default router;
