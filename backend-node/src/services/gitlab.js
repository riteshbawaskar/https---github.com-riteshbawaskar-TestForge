/**
 * GitLab API integration using node-fetch.
 * No python-gitlab equivalent in Node — we call the REST API directly.
 */
import { decryptToken } from '../security.js';

const ISSUE_URL_RE = /^(https?:\/\/[^/]+)\/(.+?)\/-\/issues\/(\d+)$/i;

export function parseIssueUrl(url) {
  const m = ISSUE_URL_RE.exec(url.trim());
  if (!m) throw new Error(`Cannot parse GitLab issue URL: ${url}`);
  const [, baseUrl, projectPath, issueIid] = m;
  return { baseUrl, projectPath, issueIid: parseInt(issueIid) };
}

export class GitLabService {
  constructor(project) {
    this.token      = project.gitlab_token_encrypted ? decryptToken(project.gitlab_token_encrypted) : null;
    this.baseUrl    = (project.gitlab_url || 'https://gitlab.com').replace(/\/$/, '');
    this.projectPath = project.gitlab_project_path;
  }

  headers() {
    const h = { 'Content-Type': 'application/json' };
    if (this.token) h['PRIVATE-TOKEN'] = this.token;
    return h;
  }

  async api(path) {
    const { default: fetch } = await import('node-fetch');
    const res = await fetch(`${this.baseUrl}/api/v4${path}`, { headers: this.headers() });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`GitLab API ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
  }

  async testConnection() {
    try {
      await this.api('/user');
    } catch (e) {
      return { connected: false, error: `Authentication failed: ${e.message}` };
    }
    if (!this.projectPath) return { connected: true };
    try {
      const proj = await this.api(`/projects/${encodeURIComponent(this.projectPath)}`);
      return {
        connected: true,
        project_name: proj.name_with_namespace,
        open_issues_count: proj.open_issues_count,
      };
    } catch (e) {
      return { connected: false, error: `Project not found: ${e.message}` };
    }
  }

  async fetchIssue(issueUrl) {
    const { projectPath, issueIid } = parseIssueUrl(issueUrl);
    const issue = await this.api(`/projects/${encodeURIComponent(projectPath)}/issues/${issueIid}`);
    return {
      gitlab_issue_id:  issue.iid,
      gitlab_issue_url: issueUrl,
      title:       issue.title,
      description: issue.description || '',
      labels:      (issue.labels || []).join(','),
      assignee:    issue.assignee?.username || null,
      milestone:   issue.milestone?.title  || null,
    };
  }

  async listIssues({ labels, state = 'opened', maxResults = 100 } = {}) {
    if (!this.projectPath) throw new Error('No project path configured');
    const params = new URLSearchParams({ state, per_page: Math.min(maxResults, 100) });
    if (labels) params.set('labels', labels);

    const { default: fetch } = await import('node-fetch');
    const issues = [];
    let page = 1;

    while (issues.length < maxResults) {
      params.set('page', page);
      const res = await fetch(
        `${this.baseUrl}/api/v4/projects/${encodeURIComponent(this.projectPath)}/issues?${params}`,
        { headers: this.headers() }
      );
      if (!res.ok) throw new Error(`GitLab API ${res.status}`);
      const batch = await res.json();
      if (!batch.length) break;

      for (const issue of batch) {
        if (issues.length >= maxResults) break;
        issues.push({
          gitlab_issue_id:  issue.iid,
          gitlab_issue_url: issue.web_url,
          title:       issue.title,
          description: issue.description || '',
          labels:      (issue.labels || []).join(','),
          assignee:    issue.assignee?.username || null,
          milestone:   issue.milestone?.title  || null,
        });
      }
      page++;
    }
    return issues;
  }
}
