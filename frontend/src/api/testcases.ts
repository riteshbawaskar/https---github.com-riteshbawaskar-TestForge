import api from "./client";
import type { TestCase, GenerationJob, Requirement } from "../types";

export const requirementsApi = {
  list: (projectId: string) =>
    api.get<Requirement[]>(`/requirements/project/${projectId}`).then(r => r.data),

  get: (id: string) =>
    api.get<Requirement>(`/requirements/${id}`).then(r => r.data),

  fetch: (projectId: string, gitlab_issue_url: string) =>
    api.post<Requirement>("/requirements/fetch", { project_id: projectId, gitlab_issue_url })
      .then(r => r.data),

  delete: (id: string) =>
    api.delete(`/requirements/${id}`),

  pushToGitlab: (requirementId: string) =>
    api.post<{ issue_url: string; comment_id: number; attachment_url: string }>(
      `/requirements/${requirementId}/push-to-gitlab`
    ).then(r => r.data),
};

export const testCasesApi = {
  list: (requirementId: string, format?: string) =>
    api.get<TestCase[]>(`/testcases/requirement/${requirementId}`, {
      params: format ? { format } : {},
    }).then(r => r.data),

  generate: (payload: {
    requirement_id: string;
    format: string;
    count_hint: string;
    additional_context?: string;
  }) => api.post<GenerationJob>("/testcases/generate", payload).then(r => r.data),

  update: (id: string, data: Partial<Pick<TestCase, "title" | "content" | "priority" | "tags" | "scenario_type">>) =>
    api.patch<TestCase>(`/testcases/${id}`, data).then(r => r.data),

  delete: (id: string) =>
    api.delete(`/testcases/${id}`),

  export: (params: {
    requirement_id?: string;
    project_id?: string;
    format: string;
    file_type: "csv" | "json";
  }) => api.post("/testcases/export", params, { responseType: "blob" }).then(r => r.data as Blob),
};

export const jobsApi = {
  get: (id: string) =>
    api.get<GenerationJob>(`/jobs/${id}`).then(r => r.data),
};
