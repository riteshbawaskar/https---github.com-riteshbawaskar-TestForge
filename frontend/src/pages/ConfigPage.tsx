import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProjectStore } from "../store/useProjectStore";
import { projectsApi } from "../api/projects";
import { Button, Spinner, toast } from "../components/shared";
import type { Project, GitLabConnectionResult } from "../types";

const MODELS: Record<string, { label: string; value: string }[]> = {
  anthropic: [
    { label: "Claude Sonnet 4.6 (recommended)", value: "claude-sonnet-4-6" },
    { label: "Claude Opus 4.6", value: "claude-opus-4-6" },
    { label: "Claude Haiku 4.5", value: "claude-haiku-4-5-20251001" },
  ],
  openai: [
    { label: "GPT-4o (recommended)", value: "gpt-4o" },
    { label: "GPT-4o Mini", value: "gpt-4o-mini" },
    { label: "GPT-4 Turbo", value: "gpt-4-turbo" },
  ],
  gemini: [
    { label: "Gemini 1.5 Pro (recommended)", value: "gemini-1.5-pro" },
    { label: "Gemini 1.5 Flash", value: "gemini-1.5-flash" },
    { label: "Gemini 2.0 Flash", value: "gemini-2.0-flash" },
    { label: "Gemini 3 Flash Preview", value: "gemini-3-flash-preview" },
  ],
};
const PROVIDER_DEFAULTS: Record<string, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o",
  gemini: "gemini-1.5-pro",
};

function emptyForm() {
  return {
    name: "", description: "",
    gitlabUrl: "https://gitlab.com", gitlabToken: "", gitlabProject: "",
    defaultFormat: "BDD", llmProvider: "anthropic", llmModel: "claude-sonnet-4-6",
    detailLevel: "detailed", customInstructions: "",
    includeLabels: "", excludeLabels: "", issueState: "opened", maxIssues: "100",
  };
}

function toForm(p: Project) {
  return {
    name: p.name ?? "",
    description: p.description ?? "",
    gitlabUrl: p.gitlab_url ?? "https://gitlab.com",
    gitlabToken: "",
    gitlabProject: p.gitlab_project_path ?? "",
    defaultFormat: p.default_format ?? "BDD",
    llmProvider: p.llm_provider ?? "anthropic",
    llmModel: p.llm_model ?? "claude-sonnet-4-6",
    detailLevel: p.detail_level ?? "detailed",
    customInstructions: p.custom_instructions ?? "",
    includeLabels: p.label_include ?? "",
    excludeLabels: p.label_exclude ?? "",
    issueState: p.issue_state ?? "opened",
    maxIssues: String(p.max_issues ?? 100),
  };
}

export default function ConfigPage() {
  const nav = useNavigate();
  const { activeProject, setActiveProject, addProject, updateProject } = useProjectStore();

  const [form, setForm]             = useState(activeProject ? toForm(activeProject) : emptyForm());
  const [saving, setSaving]         = useState(false);
  const [showToken, setShowToken]   = useState(false);
  const [connStatus, setConnStatus] = useState<"ok" | "fail" | "testing" | null>(null);
  const [connResult, setConnResult] = useState<GitLabConnectionResult | null>(null);
  const isNew = !activeProject;

  // Sync form when active project changes (e.g. user switches project from sidebar)
  useEffect(() => {
    setForm(activeProject ? toForm(activeProject) : emptyForm());
    setConnStatus(null);
    setConnResult(null);
  }, [activeProject?.id]);

  const set = (k: keyof ReturnType<typeof emptyForm>) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    if (!form.name.trim()) { toast("Project name is required", true); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        description: form.description,
        gitlab_url: form.gitlabUrl,
        gitlab_project_path: form.gitlabProject,
        default_format: form.defaultFormat,
        llm_model: form.llmModel,
        llm_provider: form.llmProvider,
        detail_level: form.detailLevel,
        custom_instructions: form.customInstructions,
        label_include: form.includeLabels,
        label_exclude: form.excludeLabels,
        issue_state: form.issueState,
        max_issues: Number(form.maxIssues),
      };
      if (form.gitlabToken) payload.gitlab_token = form.gitlabToken;

      let updated: Project;
      if (activeProject?.id) {
        updated = await projectsApi.update(activeProject.id, payload);
        updateProject(updated);
      } else {
        updated = await projectsApi.create(payload);
        addProject(updated);
        setActiveProject(updated);
      }
      setForm(toForm(updated));
      toast("Project saved");
    } catch (e: any) {
      toast(`Save failed: ${e.message}`, true);
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (!activeProject?.id) { toast("Save the project first", true); return; }
    setConnStatus("testing");
    try {
      const r = await projectsApi.testConnection(activeProject.id);
      setConnResult(r);
      setConnStatus(r.connected ? "ok" : "fail");
      if (r.connected) toast("GitLab connection verified");
      else toast(r.error ?? "Connection failed", true);
    } catch (e: any) {
      setConnStatus("fail");
      toast(e.message, true);
    }
  };

  // Section header helper
  const SectionHead = ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
    </div>
  );

  return (
    <div className="p-6 max-w-5xl">
      {/* Page header */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900">
          {isNew ? "Create New Project" : `Configure: ${activeProject.name}`}
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          {isNew
            ? "Set up a new project with its GitLab and AI configuration."
            : "Update project settings, GitLab connection, and AI preferences."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* ── Left column ─────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Project Details */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <SectionHead title="Project Details" />
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project Name <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.name} onChange={set("name")}
                  placeholder="e.g. Payment Gateway v2"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={form.description} onChange={set("description")}
                  placeholder="Brief description of this project…"
                  rows={2}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Default Format</label>
                  <select value={form.defaultFormat} onChange={set("defaultFormat")}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 bg-white">
                    <option value="BDD">BDD / Gherkin</option>
                    <option value="MANUAL">Manual Steps</option>
                    <option value="BOTH">Both Formats</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Detail Level</label>
                  <select value={form.detailLevel} onChange={set("detailLevel")}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 bg-white">
                    <option value="detailed">Detailed (edge cases + negative)</option>
                    <option value="standard">Standard (happy path + common)</option>
                    <option value="minimal">Minimal (core only)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* LLM Settings */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <SectionHead title="AI / LLM Settings" subtitle="Choose the model used to generate test cases." />
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
                <select
                  value={form.llmProvider}
                  onChange={e => {
                    const p = e.target.value;
                    setForm(f => ({ ...f, llmProvider: p, llmModel: PROVIDER_DEFAULTS[p] ?? f.llmModel }));
                  }}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 bg-white">
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="openai">OpenAI (GPT)</option>
                  <option value="gemini">Google (Gemini)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                <select value={form.llmModel} onChange={set("llmModel")}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 bg-white">
                  {(MODELS[form.llmProvider] ?? []).map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Custom Instructions</label>
                <textarea
                  value={form.customInstructions} onChange={set("customInstructions")}
                  placeholder="e.g. Always include OWASP security tests for auth flows."
                  rows={3}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 resize-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Right column ────────────────────────────────────── */}
        <div className="space-y-4">

          {/* GitLab */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <SectionHead title="GitLab Integration" subtitle="Connect to your GitLab instance to import issues as requirements." />
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">GitLab URL</label>
                <input value={form.gitlabUrl} onChange={set("gitlabUrl")} placeholder="https://gitlab.com"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Personal Access Token</label>
                <div className="relative">
                  <input
                    type={showToken ? "text" : "password"}
                    value={form.gitlabToken} onChange={set("gitlabToken")}
                    placeholder={activeProject ? "Enter new token to update…" : "glpat-xxxxxxxxxxxx"}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 pr-10 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 font-mono"
                  />
                  <button onClick={() => setShowToken(s => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm">
                    {showToken ? "🙈" : "👁"}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">Stored encrypted · Required scope: read_api</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Project Path</label>
                <input value={form.gitlabProject} onChange={set("gitlabProject")} placeholder="namespace/project-name"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 font-mono" />
              </div>
              <div className="pt-1 flex items-center gap-3">
                <Button variant="secondary" size="sm" onClick={testConnection} disabled={connStatus === "testing"}>
                  {connStatus === "testing" ? <><Spinner size="sm" /> Testing…</> : "Test Connection"}
                </Button>
                {activeProject && <span className="text-xs text-gray-400 font-mono">ID: {activeProject?.id?.slice(0,8)}…</span>}
              </div>

              {/* Connection status */}
              {connStatus === "ok" && connResult && (
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-md text-sm text-green-700">
                  <span className="text-green-500">✓</span>
                  <span>Connected · {connResult.project_name} · {connResult.open_issues_count} open issues</span>
                </div>
              )}
              {connStatus === "fail" && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                  <span>✗</span>
                  <span>{connResult?.error ?? "Connection failed — check URL and token"}</span>
                </div>
              )}
            </div>
          </div>

          {/* Issue Filters */}
          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <SectionHead title="Issue Import Filters" subtitle="Control which GitLab issues are imported as requirements." />
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Include Labels</label>
                <input value={form.includeLabels} onChange={set("includeLabels")} placeholder="requirement, feature"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                <p className="text-xs text-gray-400 mt-1">Comma-separated. Only issues with these labels will be imported.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Exclude Labels</label>
                <input value={form.excludeLabels} onChange={set("excludeLabels")} placeholder="wontfix, duplicate"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Issue State</label>
                  <select value={form.issueState} onChange={set("issueState")}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 bg-white">
                    <option value="opened">Open only</option>
                    <option value="closed">Closed only</option>
                    <option value="all">All issues</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Issues</label>
                  <select value={form.maxIssues} onChange={set("maxIssues")}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 bg-white">
                    <option value="50">50</option>
                    <option value="100">100</option>
                    <option value="200">200</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            {activeProject && (
              <Button variant="ghost" onClick={() => { setForm(toForm(activeProject)); setConnStatus(null); }}>
                Reset Changes
              </Button>
            )}
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <><Spinner size="sm" /> Saving…</> : isNew ? "Create Project" : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
