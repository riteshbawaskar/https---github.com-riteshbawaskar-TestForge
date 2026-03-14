"""GitLab API integration."""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

import gitlab
from gitlab.exceptions import GitlabAuthenticationError, GitlabGetError

from app.core.exceptions import GitLabError
from app.core.security import decrypt_token
from app.models.models import Project

import logging
log = logging.getLogger(__name__)

_ISSUE_URL_RE = re.compile(r"(https?://[^/]+)/(.+?)/-/work-items/(\d+)", re.IGNORECASE)


def parse_issue_url(url: str):
    m = _ISSUE_URL_RE.match(url.strip())
    if not m:
        raise GitLabError(
            f"Cannot parse GitLab issue URL: {url!r}. "
            "Expected: https://gitlab.com/group/project/-/work-items/123"
        )
    base, path, iid = m.groups()
    return base, path, int(iid)


class GitLabService:
    def __init__(self, project: Project) -> None:
        token: Optional[str] = None
        if project.gitlab_token_encrypted:
            try:
                token = decrypt_token(project.gitlab_token_encrypted)
            except ValueError as exc:
                raise GitLabError(f"Could not decrypt GitLab token: {exc}") from exc

        base_url = project.gitlab_url or "https://gitlab.com"
        self.gl   = gitlab.Gitlab(base_url, private_token=token)
        self.path = project.gitlab_project_path
        self._project = project

    def test_connection(self) -> Dict[str, Any]:
        try:
            self.gl.auth()
        except GitlabAuthenticationError:
            return {"connected": False, "error": "Authentication failed — check your token"}
        except Exception as exc:
            return {"connected": False, "error": str(exc)}

        if not self.path:
            return {"connected": True, "project_name": None, "open_issues_count": None}

        try:
            proj = self.gl.projects.get(self.path)
            return {
                "connected": True,
                "project_name": proj.name_with_namespace,
                "open_issues_count": proj.open_issues_count,
            }
        except GitlabGetError as exc:
            return {"connected": False, "error": f"Project '{self.path}' not found: {exc}"}

    def fetch_issue(self, issue_id: int) -> Dict[str, Any]:
        if not self.path:
            raise GitLabError("No project path configured")
        try:
            gl_proj = self.gl.projects.get(self.path)
            issue   = gl_proj.issues.get(issue_id)
        except GitlabGetError as exc:
            raise GitLabError(f"Issue #{issue_id} not found in {self.path!r}: {exc}") from exc
        except Exception as exc:
            raise GitLabError(f"Failed to fetch issue: {exc}") from exc

        return {
            "gitlab_issue_id":  issue.iid,
            "gitlab_issue_url": issue.web_url,
            "title":       issue.title,
            "description": issue.description or "",
            "labels":      ",".join(issue.labels) if issue.labels else "",
            "assignee":    (issue.assignee or {}).get("username"),
            "milestone":   (issue.milestone or {}).get("title"),
        }

    def list_issues(
        self,
        labels: Optional[str] = None,
        state: str = "opened",
        max_results: int = 100,
    ) -> List[Dict[str, Any]]:
        if not self.path:
            raise GitLabError("No project path configured")
        try:
            gl_proj = self.gl.projects.get(self.path)
        except GitlabGetError as exc:
            raise GitLabError(f"Cannot access project {self.path!r}: {exc}") from exc

        kwargs: Dict[str, Any] = {"state": state, "per_page": min(max_results, 100)}
        if labels:
            kwargs["labels"] = [l.strip() for l in labels.split(",") if l.strip()]

        issues, count = [], 0
        for issue in gl_proj.issues.list(as_list=False, **kwargs):
            if count >= max_results:
                break
            issues.append({
                "gitlab_issue_id":  issue.iid,
                "gitlab_issue_url": issue.web_url,
                "title":       issue.title,
                "description": issue.description or "",
                "labels":      ",".join(issue.labels) if issue.labels else "",
                "assignee":    (issue.assignee or {}).get("username"),
                "milestone":   (issue.milestone or {}).get("title"),
            })
            count += 1
        return issues

    def post_test_cases_to_issue(
        self,
        issue_url: str,
        requirement_title: str,
        test_cases: List[Any],
        excel_bytes: bytes,
        excel_filename: str,
    ) -> Dict[str, Any]:
        """Post a markdown summary comment and attach an Excel file to a GitLab issue."""
        _, project_path, issue_iid = parse_issue_url(issue_url)
        try:
            gl_proj = self.gl.projects.get(project_path)
            issue   = gl_proj.issues.get(issue_iid)
        except GitlabGetError as exc:
            raise GitLabError(f"Issue {issue_iid} not found in {project_path!r}: {exc}") from exc
        except Exception as exc:
            raise GitLabError(f"Failed to access issue: {exc}") from exc

        # Upload Excel as a project attachment
        try:
            upload = gl_proj.upload(excel_filename, filedata=excel_bytes)
        except Exception as exc:
            raise GitLabError(f"Failed to upload attachment: {exc}") from exc

        bdd_cases    = [tc for tc in test_cases if tc.format == "BDD"]

        lines: List[str] = [
            f"## 🧪 Test Cases — {requirement_title}",
            "",
            f"**{len(test_cases)} test case(s)** generated by TestForge",
            "",
        ]
        if bdd_cases:
            lines += ["#### BDD Scenarios", ""]
            for i, tc in enumerate(bdd_cases, 1):
                stype = f" · `{tc.scenario_type}`" if tc.scenario_type else ""
                lines.append(f"{i}. **{tc.title}** `{tc.priority}`{stype}")
            lines.append("")
        if manual_cases:
            lines += ["#### Manual Test Cases", ""]
            for i, tc in enumerate(manual_cases, 1):
                stype = f" · `{tc.scenario_type}`" if tc.scenario_type else ""
                lines.append(f"{i}. **{tc.title}** `{tc.priority}`{stype}")
            lines.append("")
        lines += [
            "---",
            f"📎 Full test suite: {upload['markdown']}",
            "",
            "_Uploaded by [TestForge](https://testforge.dev)_",
        ]

        try:
            note = issue.notes.create({"body": "\n".join(lines)})
        except Exception as exc:
            raise GitLabError(f"Failed to post comment: {exc}") from exc

        log.info("Posted test cases to GitLab issue %s (comment #%s)", issue_iid, note.id)
        return {
            "issue_url":      issue.web_url,
            "comment_id":     note.id,
            "attachment_url": upload.get("url", ""),
        }
