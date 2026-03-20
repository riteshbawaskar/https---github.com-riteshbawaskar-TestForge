import api from "./client";
import type { Project, GitLabConnectionResult, ProjectUsageSummary } from "../types";

export const projectsApi = {
  list: () =>
    api.get<Project[]>("/projects/").then(r => r.data),

  get: (id: string) =>
    api.get<Project>(`/projects/${id}`).then(r => r.data),

  usage: (id: string) =>
    api.get<ProjectUsageSummary>(`/projects/${id}/usage`).then(r => r.data),

  create: (data: Partial<Project> & { gitlab_token?: string }) =>
    api.post<Project>("/projects/", data).then(r => r.data),

  update: (id: string, data: Partial<Project> & { gitlab_token?: string }) =>
    api.put<Project>(`/projects/${id}`, data).then(r => r.data),

  delete: (id: string) =>
    api.delete(`/projects/${id}`),

  testConnection: (id: string) =>
    api.post<GitLabConnectionResult>(`/projects/${id}/test-connection`).then(r => r.data),
};
