import Database from 'better-sqlite3';
import { config } from '../config.js';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

const dir = dirname(config.dbPath);
if (dir && dir !== '.') mkdirSync(dir, { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
      gitlab_url TEXT, gitlab_token_encrypted TEXT, gitlab_project_path TEXT,
      llm_model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
      llm_provider TEXT NOT NULL DEFAULT 'anthropic',
      custom_instructions TEXT, default_format TEXT NOT NULL DEFAULT 'BDD',
      detail_level TEXT NOT NULL DEFAULT 'detailed',
      label_include TEXT, label_exclude TEXT,
      issue_state TEXT NOT NULL DEFAULT 'opened',
      max_issues INTEGER NOT NULL DEFAULT 100,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      original_filename TEXT NOT NULL, stored_filename TEXT NOT NULL,
      file_type TEXT NOT NULL, file_size_bytes INTEGER NOT NULL DEFAULT 0,
      chunk_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PENDING', error_message TEXT,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS requirements (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      gitlab_issue_id INTEGER, gitlab_issue_url TEXT,
      title TEXT NOT NULL, description TEXT, labels TEXT,
      assignee TEXT, milestone TEXT,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS test_cases (
      id TEXT PRIMARY KEY,
      requirement_id TEXT NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
      title TEXT NOT NULL, format TEXT NOT NULL, content TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'MEDIUM', tags TEXT, scenario_type TEXT,
      edited INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS generation_jobs (
      id TEXT PRIMARY KEY,
      requirement_id TEXT NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'PENDING', format TEXT NOT NULL DEFAULT 'BDD',
      count_hint TEXT NOT NULL DEFAULT 'auto',
      progress_message TEXT, error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_docs_project     ON documents(project_id);
    CREATE INDEX IF NOT EXISTS idx_reqs_project     ON requirements(project_id);
    CREATE INDEX IF NOT EXISTS idx_tc_requirement   ON test_cases(requirement_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_requirement ON generation_jobs(requirement_id);
  `);
  console.log('[db] Tables ready');
}
