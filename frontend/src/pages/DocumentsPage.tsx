import { useEffect, useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Badge, Spinner, toast } from "../components/shared";
import { useProjectStore } from "../store/useProjectStore";
import { documentsApi } from "../api/documents";
import type { Document, DocumentStats } from "../types";

const docIcon: Record<string, string> = { PDF: "📄", DOCX: "📋", XLSX: "📊", TXT: "📝", MD: "📝", CSV: "📊" };

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function statusColor(s: Document["status"]): "green" | "amber" | "red" | "gray" {
  if (s === "INDEXED")  return "green";
  if (s === "INDEXING") return "amber";
  if (s === "FAILED")   return "red";
  return "gray";
}

export default function DocumentsPage() {
  const activeProject = useProjectStore(s => s.activeProject);
  const [docs, setDocs]     = useState<Document[]>([]);
  const [stats, setStats]   = useState<DocumentStats | null>(null);
  const [loading, setLoading]     = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const projectId = activeProject?.id;

  const loadDocs = useCallback(async () => {
    if (!projectId) { setLoading(false); return; }
    try {
      const [list, s] = await Promise.all([
        documentsApi.list(projectId),
        documentsApi.stats(projectId).catch(() => null),
      ]);
      setDocs(list); setStats(s);
    } catch {}
    setLoading(false);
  }, [projectId]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  // Poll while any doc is still indexing
  useEffect(() => {
    const pending = docs.filter(d => d.status === "PENDING" || d.status === "INDEXING");
    if (!pending.length) return;
    const t = setInterval(loadDocs, 3000);
    return () => clearInterval(t);
  }, [docs, loadDocs]);

  const onDrop = useCallback(async (files: File[]) => {
    if (!projectId) { toast("No active project", true); return; }
    const file = files[0]; if (!file) return;
    setUploading(file.name);
    try {
      const doc = await documentsApi.upload(projectId, file, () => {});
      setDocs(d => [doc, ...d]);
      toast(`${file.name} uploaded — indexing in background`);
      setTimeout(loadDocs, 3000);
    } catch (e: any) {
      toast(`Upload failed: ${e.message}`, true);
    } finally {
      setUploading(null);
    }
  }, [projectId, loadDocs]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "text/plain": [".txt"], "text/markdown": [".md"], "text/csv": [".csv"],
    },
    maxSize: 50 * 1024 * 1024,
  });

  const removeDoc = async (doc: Document) => {
    try {
      await documentsApi.delete(doc.id);
      setDocs(d => d.filter(x => x.id !== doc.id));
      loadDocs();
      toast("Document removed");
    } catch (e: any) {
      toast(e.message, true);
    }
  };

  if (!projectId) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <div className="text-4xl">📁</div>
      <p className="text-gray-500 text-sm">No project selected. Configure one first.</p>
    </div>
  );

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Project Documents</h2>
        <p className="text-sm text-gray-500 mt-1">Upload specs, API docs, and domain knowledge. Files are chunked and indexed for AI context retrieval.</p>
      </div>

      {/* Drop zone */}
      <div {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors mb-6
          ${isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-white hover:border-blue-400 hover:bg-gray-50"}`}>
        <input {...getInputProps()} />
        <div className="text-3xl mb-2">⬆️</div>
        <div className="font-medium text-gray-900 mb-1">
          {isDragActive ? "Drop to upload" : "Drop files or click to browse"}
        </div>
        <div className="text-sm text-gray-500">PDF, DOCX, TXT, MD, XLSX, CSV · Max 50 MB per file</div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Document list */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Documents</h3>
            <span className="text-xs text-gray-500">{docs.length} files · {stats?.total_chunks ?? 0} chunks</span>
          </div>
          <div className="p-3">
            {loading ? (
              <div className="flex justify-center py-8"><Spinner size="lg" /></div>
            ) : docs.length === 0 && !uploading ? (
              <div className="text-center py-10 text-gray-500 text-sm">
                No documents yet. Drop files above to get started.
              </div>
            ) : (
              <div className="space-y-2">
                {uploading && (
                  <div className="flex items-center gap-3 px-3 py-3 rounded-lg border border-amber-200 bg-amber-50">
                    <span className="text-xl">📄</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{uploading}</div>
                      <div className="text-xs text-gray-500 mt-0.5">Uploading…</div>
                    </div>
                    <Badge color="amber">Uploading</Badge>
                  </div>
                )}
                {docs.map(doc => (
                  <div key={doc.id} className="flex items-center gap-3 px-3 py-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                    <span className="text-xl flex-shrink-0">{docIcon[doc.file_type] ?? "📄"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{doc.original_filename}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {doc.file_type} · {fmtBytes(doc.file_size_bytes)}
                        {doc.chunk_count > 0 && ` · ${doc.chunk_count} chunks`}
                      </div>
                    </div>
                    <Badge color={statusColor(doc.status)}>
                      {doc.status.charAt(0) + doc.status.slice(1).toLowerCase()}
                    </Badge>
                    <button onClick={() => removeDoc(doc)}
                      className="p-1.5 rounded-md hover:bg-red-50 hover:text-red-600 text-gray-400 transition-colors text-sm">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Vector Index</h3>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="text-center py-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="text-2xl font-bold text-blue-600">{stats?.total_chunks ?? 0}</div>
                <div className="text-xs text-gray-500 mt-1">Total Chunks</div>
              </div>
              <div className="text-center py-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="text-2xl font-bold text-green-600">1,536</div>
                <div className="text-xs text-gray-500 mt-1">Dimensions</div>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              {[
                ["Embedding Model", stats?.embedding_model ?? "text-embedding-3-small"],
                ["Vector Store",    stats?.vector_store ?? "Qdrant (local)"],
                ["Chunk Size",      "500 tokens / 50 overlap"],
                ["Context per Query", "Top 5 chunks"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-gray-500">{k}</span>
                  <span className="text-gray-900 font-medium font-mono text-xs">{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Supported Formats</h3>
            <div className="flex flex-wrap gap-2">
              {["📄 PDF", "📋 DOCX", "📊 XLSX", "📝 TXT / MD", "📊 CSV"].map(f => (
                <span key={f} className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium border border-gray-200">{f}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
