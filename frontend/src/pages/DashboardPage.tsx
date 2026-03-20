import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Spinner, Badge } from "../components/shared";
import { useProjectStore } from "../store/useProjectStore";
import { documentsApi } from "../api/documents";
import { projectsApi } from "../api/projects";
import { requirementsApi, testCasesApi } from "../api/testcases";
import type { ProjectUsageSummary, Requirement } from "../types";

const emptyUsage: ProjectUsageSummary = {
  project_id: "",
  llm: {
    provider: "",
    model: "",
    requests: 0,
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    estimated_cost_usd: 0,
  },
  embedding: {
    provider: "",
    model: "",
    requests: 0,
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    estimated_cost_usd: 0,
  },
  total_estimated_cost_usd: 0,
};

function formatUsd(value: number) {
  if (value === 0) return "$0.0000";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export default function DashboardPage() {
  const nav = useNavigate();
  const { activeProject, setActiveProject, projects } = useProjectStore();

  const [reqs, setReqs]   = useState<Requirement[]>([]);
  const [tcCounts, setTcCounts] = useState<Record<string, number>>({});
  const [stats, setStats] = useState({ testCases: 0, requirements: 0, docs: 0, chunks: 0 });
  const [usage, setUsage] = useState<ProjectUsageSummary>(emptyUsage);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeProject) {
      setUsage(emptyUsage);
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const [reqs, docStats, usageStats] = await Promise.all([
          requirementsApi.list(activeProject.id),
          documentsApi.stats(activeProject.id).catch(() => ({ total_chunks: 0, document_count: 0 })),
          projectsApi.usage(activeProject.id).catch(() => emptyUsage),
        ]);
        setReqs(reqs.slice(0, 5));
        setUsage(usageStats);
        const counts: Record<string, number> = {};
        let totalTcs = 0;
        await Promise.all(reqs.map(async r => {
          try { const tcs = await testCasesApi.list(r.id); counts[r.id] = tcs.length; totalTcs += tcs.length; }
          catch { counts[r.id] = 0; }
        }));
        setTcCounts(counts);
        setStats({ testCases: totalTcs, requirements: reqs.length, docs: docStats.document_count, chunks: docStats.total_chunks });
      } catch {}
      setLoading(false);
    })();
  }, [activeProject?.id]);

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;

  if (!activeProject) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <div className="text-5xl">🚀</div>
      <h2 className="text-xl font-semibold text-gray-900">No project selected</h2>
      <p className="text-gray-500 text-sm">Create or select a project to get started.</p>
      <button onClick={() => nav("/config")}
        className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
        Create Project
      </button>
    </div>
  );

  const statItems = [
    { n: stats.testCases,   label: "Test Cases",    icon: "🧪", color: "text-blue-600"  },
    { n: stats.requirements, label: "Requirements",  icon: "📋", color: "text-green-600" },
    { n: stats.docs,        label: "Documents",     icon: "📁", color: "text-amber-600" },
    { n: stats.chunks,      label: "Vector Chunks", icon: "🔍", color: "text-purple-600"},
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900">{activeProject.name}</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          {activeProject.gitlab_project_path && <span className="font-mono">{activeProject.gitlab_project_path} · </span>}
          {activeProject.llm_provider} / {activeProject.llm_model}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {statItems.map(s => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <div className={`text-2xl font-bold ${s.color}`}>{s.n.toLocaleString()}</div>
            <div className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
              <span>{s.icon}</span>{s.label}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="text-sm font-semibold text-gray-900">Query LLM Usage</div>
              <div className="text-xs text-gray-500 mt-1">{usage.llm.provider || activeProject.llm_provider} / {usage.llm.model || activeProject.llm_model}</div>
            </div>
            <div className="text-xs rounded-full bg-blue-50 text-blue-700 px-2 py-1">{usage.llm.requests.toLocaleString()} calls</div>
          </div>
          <div className="text-2xl font-bold text-slate-900">{usage.llm.total_tokens.toLocaleString()}</div>
          <div className="text-sm text-gray-500 mt-1">input {usage.llm.input_tokens.toLocaleString()} · output {usage.llm.output_tokens.toLocaleString()}</div>
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-sm">
            <span className="text-gray-500">Approx. cost</span>
            <span className="font-semibold text-slate-900">{formatUsd(usage.llm.estimated_cost_usd)}</span>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="text-sm font-semibold text-gray-900">Embedding Usage</div>
              <div className="text-xs text-gray-500 mt-1">{usage.embedding.provider || activeProject.embedding_provider || "default"} / {usage.embedding.model || activeProject.embedding_model || "default"}</div>
            </div>
            <div className="text-xs rounded-full bg-emerald-50 text-emerald-700 px-2 py-1">{usage.embedding.requests.toLocaleString()} calls</div>
          </div>
          <div className="text-2xl font-bold text-slate-900">{usage.embedding.total_tokens.toLocaleString()}</div>
          <div className="text-sm text-gray-500 mt-1">Includes document indexing and RAG lookups</div>
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-sm">
            <span className="text-gray-500">Approx. cost</span>
            <span className="font-semibold text-slate-900">{formatUsd(usage.embedding.estimated_cost_usd)}</span>
          </div>
        </div>

        <div className="bg-slate-900 text-white border border-slate-800 rounded-lg p-4 shadow-sm">
          <div className="text-sm font-semibold text-white/90">Estimated AI Spend</div>
          <div className="text-3xl font-bold mt-3">{formatUsd(usage.total_estimated_cost_usd)}</div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md bg-white/10 p-3">
              <div className="text-white/60 text-xs uppercase tracking-wide">LLM Share</div>
              <div className="mt-1 font-medium">{formatUsd(usage.llm.estimated_cost_usd)}</div>
            </div>
            <div className="rounded-md bg-white/10 p-3">
              <div className="text-white/60 text-xs uppercase tracking-wide">Embedding Share</div>
              <div className="mt-1 font-medium">{formatUsd(usage.embedding.estimated_cost_usd)}</div>
            </div>
          </div>
          <p className="text-xs text-white/60 mt-4">Costs are estimated from provider/model-specific token rates and may differ from billed totals.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Recent Requirements */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Recent Requirements</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {reqs.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-gray-500">
                No requirements yet.{" "}
                <button className="text-blue-600 hover:underline" onClick={() => nav("/design")}>Fetch from GitLab →</button>
              </div>
            ) : reqs.map(r => (
              <button key={r.id} onClick={() => nav("/design")}
                className="w-full px-5 py-3.5 text-left hover:bg-gray-50 transition-colors">
                <div className="text-xs text-blue-600 font-medium mb-0.5">
                  #{r.gitlab_issue_id ?? "—"}
                </div>
                <div className="text-sm font-medium text-gray-900 leading-snug mb-1.5">{r.title}</div>
                <div className="flex gap-1.5 flex-wrap">
                  {(tcCounts[r.id] ?? 0) > 0
                    ? <Badge color="green">{tcCounts[r.id]} tests</Badge>
                    : <Badge color="gray">No tests yet</Badge>}
                  {r.labels && r.labels.split(",").slice(0,2).map(l => (
                    <Badge key={l} color="blue">{l.trim()}</Badge>
                  ))}
                </div>
              </button>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-gray-100">
            <button onClick={() => nav("/design")}
              className="w-full py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors">
              Open Design Screen →
            </button>
          </div>
        </div>

        {/* Quick Actions + Projects */}
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Quick Actions</h3>
            </div>
            <div className="p-3 space-y-1">
              {[
                { label: "Configure project & GitLab", icon: "⚙️",  path: "/config" },
                { label: "Upload documents",           icon: "📁",  path: "/documents" },
                { label: "Design test cases",          icon: "🧪",  path: "/design" },
              ].map(l => (
                <button key={l.path} onClick={() => nav(l.path)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-gray-50 text-sm text-gray-700 font-medium transition-colors text-left">
                  <span>{l.icon}</span>{l.label}
                  <span className="ml-auto text-gray-400">›</span>
                </button>
              ))}
            </div>
          </div>

          {/* All Projects */}
          {projects.length > 1 && (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900">All Projects ({projects.length})</h3>
              </div>
              <div className="divide-y divide-gray-50 max-h-40 overflow-y-auto">
                {projects.map(p => (
                  <button key={p.id} onClick={() => { setActiveProject(p); nav("/dashboard"); }}
                    className={`w-full px-5 py-3 text-left hover:bg-gray-50 transition-colors flex items-center gap-2.5 ${p.id === activeProject.id ? "bg-blue-50" : ""}`}>
                    <div className={`w-2 h-2 rounded-full ${p.id === activeProject.id ? "bg-blue-500" : "bg-gray-300"}`} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{p.name}</div>
                      {p.gitlab_project_path && <div className="text-xs text-gray-400 font-mono truncate">{p.gitlab_project_path}</div>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
