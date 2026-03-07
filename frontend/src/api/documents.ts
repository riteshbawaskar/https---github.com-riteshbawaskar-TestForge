import api from "./client";
import type { Document, DocumentStats } from "../types";

export const documentsApi = {
  list: (projectId: string) =>
    api.get<Document[]>(`/documents/${projectId}`).then(r => r.data),

  stats: (projectId: string) =>
    api.get<DocumentStats>(`/documents/${projectId}/stats`).then(r => r.data),

  upload: (projectId: string, file: File, onProgress?: (pct: number) => void) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<Document>(`/documents/${projectId}/upload`, form, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: e => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
      },
    }).then(r => r.data);
  },

  delete: (documentId: string) =>
    api.delete(`/documents/${documentId}`),
};
