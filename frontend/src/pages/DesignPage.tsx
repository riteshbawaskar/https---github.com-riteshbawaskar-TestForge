import { useEffect, useState, useCallback, useRef } from "react";
import { Badge, EmptyState, Button, Spinner, toast } from "../components/shared";
import TestCaseCard from "../components/design/TestCaseCard";
import GenerateModal from "../components/design/GenerateModal";
import GenerationOverlay from "../components/design/GenerationOverlay";
import EditTestCaseModal from "../components/design/EditTestCaseModal";
import ExportModal from "../components/design/ExportModal";
import { useProjectStore } from "../store/useProjectStore";
import { requirementsApi, testCasesApi, jobsApi } from "../api/testcases";
import { useJobStream } from "../hooks/useJobPoller";
import { exportToWord, exportToExcel } from "../utils/export";
import type { TestCase, Requirement, GenerationJob } from "../types";

function statusBadge(tcCount: number) {
  if (tcCount > 0) return <Badge color="green">Generated</Badge>;
  return <Badge color="muted">Pending</Badge>;
}

export default function DesignPage() {
  const activeProject = useProjectStore(s => s.activeProject);
  const projectId = activeProject?.id ?? null;

  // Data
  const [reqs, setReqs]       = useState<Requirement[]>([]);
  const [tcMap, setTcMap]     = useState<Record<string, TestCase[]>>({});
  const [loadingReqs, setLoadingReqs] = useState(true);
  const [loadingTcs, setLoadingTcs]   = useState(false);

  // UI
  const [activeReqId, setActiveReqId]           = useState<string | null>(null);
  const [issueIdInput, setIssueIdInput]          = useState("");
  const [fmt, setFmt]                           = useState<"BDD" | "MANUAL">("BDD");
  const [editingTc, setEditingTc]               = useState<TestCase | null>(null);
  const [showGen, setShowGen]                   = useState(false);
  const [showGenOverlay, setShowGenOverlay]     = useState(false);
  const [showExport, setShowExport]             = useState(false);
  const [showEdit, setShowEdit]                 = useState(false);
  const [fetchingUrl, setFetchingUrl]           = useState(false);
  const [expandAll, setExpandAll]               = useState(false);
  const [pushingToGitlab, setPushingToGitlab]   = useState(false);
  const [showNew, setShowNew]                   = useState(false);

  // Generation job tracking
  const [activeJobId, setActiveJobId]           = useState<string | null>(null);
  const [genPayload, setGenPayload]             = useState<{
    format: string; count_hint: string; additional_context?: string;
  } | null>(null);

  // ── Load requirements ────────────────────────────────────────────────────
  const loadRequirements = useCallback(async () => {
    if (!projectId) { setLoadingReqs(false); return; }
    try {
      const list = await requirementsApi.list(projectId);
      setReqs(list);
      if (list.length > 0 && !activeReqId) setActiveReqId(list[0].id);
    } catch { /* no project yet */ }
    setLoadingReqs(false);
  }, [projectId]);

  useEffect(() => { loadRequirements(); }, [loadRequirements]);

  // ── Load test cases for active requirement ───────────────────────────────
  const loadTestCases = useCallback(async (reqId: string) => {
    if (!reqId) return;
    setLoadingTcs(true);
    try {
      const tcs = await testCasesApi.list(reqId);
      setTcMap(m => ({ ...m, [reqId]: tcs }));
    } catch { /* silently */ }
    setLoadingTcs(false);
  }, []);

  useEffect(() => {
    if (activeReqId && !tcMap[activeReqId]) loadTestCases(activeReqId);
  }, [activeReqId, loadTestCases]);

  // ── SSE job stream ───────────────────────────────────────────────────────
  const { event: jobEvent } = useJobStream(
    activeJobId,
    () => {
      // On complete: reload the test cases for the active requirement
      if (activeReqId) loadTestCases(activeReqId);
      setShowGenOverlay(false);
      setActiveJobId(null);
      toast("✦ Test cases generated");
    },
    (msg) => {
      setShowGenOverlay(false);
      setActiveJobId(null);
      toast(`✗ Generation failed: ${msg}`, true);
    }
  );

  // ── Fetch requirement from GitLab ────────────────────────────────────────
  const handleFetch = async () => {
    if (!projectId) { toast("No active project — configure one first", true); return; }
    const issueId = parseInt(issueIdInput.trim(), 10);
    if (isNaN(issueId) || issueId <= 0) {
      toast("Enter a valid GitLab issue ID (number)", true);
      return;
    }
    setFetchingUrl(true);
    try {
      const req = await requirementsApi.fetch(projectId, issueId);
      setReqs(r => r.find(x => x.id === req.id) ? r : [req, ...r]);
      setActiveReqId(req.id);
      setIssueIdInput("");
      toast(`✓ Issue #${req.gitlab_issue_id} loaded`);
    } catch (e: any) {
      toast(`✗ ${e.message}`, true);
    } finally {
      setFetchingUrl(false);
    }
  };

  // ── Generate test cases ──────────────────────────────────────────────────
  const handleGenerate = async (payload: {
    format: string; count_hint: string; additional_context?: string;
  }) => {
    if (!activeReqId) { toast("Select a requirement first", true); return; }
    setShowGen(false);
    setShowGenOverlay(true);
    setGenPayload(payload);

    try {
      const job = await testCasesApi.generate({
        requirement_id: activeReqId,
        format: payload.format,
        count_hint: payload.count_hint,
        additional_context: payload.additional_context,
      });
      setActiveJobId(job.id);
    } catch (e: any) {
      setShowGenOverlay(false);
      toast(`✗ Failed to start generation: ${e.message}`, true);
    }
  };

  // ── Edit test case ───────────────────────────────────────────────────────
  const handleSaveEdit = async (updated: TestCase) => {
    try {
      const saved = await testCasesApi.update(updated.id, {
        title: updated.title,
        content: updated.content,
        priority: updated.priority,
        tags: updated.tags,
        scenario_type: updated.scenario_type,
      });
      setTcMap(m => ({
        ...m,
        [activeReqId!]: (m[activeReqId!] ?? []).map(t => t.id === saved.id ? saved : t),
      }));
      toast("✓ Test case updated");
    } catch (e: any) {
      toast(`✗ ${e.message}`, true);
    }
  };

  // ── Delete test case ─────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    try {
      await testCasesApi.delete(id);
      setTcMap(m => ({
        ...m,
        [activeReqId!]: (m[activeReqId!] ?? []).filter(t => t.id !== id),
      }));
      toast("Test case removed");
    } catch (e: any) {
      toast(`✗ ${e.message}`, true);
    }
  };

  // ── Delete requirement ───────────────────────────────────────────────────
  const handleDeleteReq = async (req: Requirement) => {
    try {
      await requirementsApi.delete(req.id);
      const newReqs = reqs.filter(r => r.id !== req.id);
      setReqs(newReqs);
      if (activeReqId === req.id) setActiveReqId(newReqs[0]?.id ?? null);
      toast("Requirement removed");
    } catch (e: any) {
      toast(`✗ ${e.message}`, true);
    }
  };

  // ── Export ───────────────────────────────────────────────────────────────
  const handleWordExport = async () => {
    const req = activeReq;
    const tcs = allTcs;
    if (!req || tcs.length === 0) { toast("No test cases to export", true); return; }
    try {
      await exportToWord(req, tcs);
    } catch (e: any) {
      toast(`✗ Export failed: ${e.message}`, true);
    }
  };

  const handleExcelExport = () => {
    const req = activeReq;
    const tcs = allTcs;
    if (!req || tcs.length === 0) { toast("No test cases to export", true); return; }
    exportToExcel(req, tcs);
  };

  // ── Create test case manually ───────────────────────────────────────────
  const handleCreate = async (data: Parameters<typeof testCasesApi.create>[0]) => {
    try {
      const tc = await testCasesApi.create(data);
      setTcMap(m => ({ ...m, [activeReqId!]: [...(m[activeReqId!] ?? []), tc] }));
      toast("✓ Test case created");
    } catch (e: any) {
      toast(`✗ ${e.message}`, true);
    }
  };

  // ── Push to GitLab ───────────────────────────────────────────────────────
  const handleGitLabPush = async () => {
    if (!activeReqId) { toast("Select a requirement first", true); return; }
    if (allTcs.length === 0) { toast("No test cases to upload", true); return; }
    if (!activeReq?.gitlab_issue_url) { toast("This requirement has no linked GitLab issue", true); return; }
    setPushingToGitlab(true);
    try {
      await requirementsApi.pushToGitlab(activeReqId);
      toast(`✓ Comment + Excel posted to issue #${activeReq.gitlab_issue_id}`);
    } catch (e: any) {
      toast(`✗ ${e.response?.data?.detail ?? e.message}`, true);
    } finally {
      setPushingToGitlab(false);
    }
  };

  // ── Derived values ───────────────────────────────────────────────────────
  const activeReq  = reqs.find(r => r.id === activeReqId);
  const allTcs     = activeReqId ? (tcMap[activeReqId] ?? []) : [];
  const testCases  = allTcs.filter(tc => fmt === "BDD" ? tc.format === "BDD" : tc.format === "MANUAL");
  const fmtCounts  = {
    BDD:    allTcs.filter(t => t.format === "BDD").length,
    MANUAL: allTcs.filter(t => t.format === "MANUAL").length,
  };

  // ── Overlay progress from job stream ─────────────────────────────────────
  const overlayProgress = jobEvent?.progress ?? null;

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center">
          <div className="text-5xl mb-3">◎</div>
          <p className="text-gray-500 text-sm">No active project. Configure one first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full" style={{ height: "calc(100vh - 54px)" }}>

      {/* ── LEFT: Requirements panel ── */}
      <div className="w-[320px] min-w-[320px] bg-white border-r border-gray-200 flex flex-col overflow-hidden">

        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-2 flex-shrink-0">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">◎ Requirements</span>
        
        </div>

        {/* URL fetch bar */}
        <div className="p-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
          <div className="flex gap-2 mb-1.5">
            <div className="relative flex-1">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold pointer-events-none">#</span>
              <input
                value={issueIdInput}
                onChange={e => setIssueIdInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleFetch()}
                placeholder="GitLab issue ID…"
                inputMode="numeric"
                className="w-full bg-white border border-gray-300 rounded-md pl-8 pr-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 placeholder:text-gray-400"
              />
            </div>
            <button
              onClick={handleFetch}
              disabled={fetchingUrl}
              className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors flex-shrink-0 disabled:opacity-50"
            >
              {fetchingUrl ? <Spinner size="sm" /> : "Fetch"}
            </button>
          </div>
          <div className="text-xs text-gray-400">Or browse loaded requirements below</div>
        </div>

        {/* Requirement list */}
        <div className="flex-1 overflow-y-auto p-3">
          {loadingReqs ? (
            <div className="flex justify-center pt-10"><Spinner size="lg" /></div>
          ) : reqs.length === 0 ? (
            <div className="text-center pt-10 text-sm text-gray-400">
              No requirements yet.<br />Fetch a GitLab issue above.
            </div>
          ) : (
            <>
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">
                Loaded · {reqs.length} requirements
              </div>
              {reqs.map(req => {
                const count = (tcMap[req.id] ?? []).length;
                return (
                  <div
                    key={req.id}
                    onClick={() => setActiveReqId(req.id)}
                    className={`p-3 rounded-lg border mb-1.5 cursor-pointer transition-all group relative
                      ${activeReqId === req.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 bg-white hover:border-gray-300"}`}
                  >
                    <div className="text-xs text-blue-600 font-semibold mb-1">
                      ISSUE #{req.gitlab_issue_id ?? "—"}
                    </div>
                    <div className="text-sm font-medium leading-snug text-gray-900 pr-5">{req.title}</div>
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {statusBadge(count)}
                      <Badge color="accent">{count} Tests</Badge>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteReq(req); }}
                      className="absolute top-2 right-2 w-5 h-5 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 text-xs opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center"
                    >✕</button>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* ── RIGHT: Test cases panel ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-2 flex-shrink-0">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">◈ Test Cases</span>
          {activeReq && (
            <span className="text-gray-500 text-sm font-normal normal-case tracking-normal ml-1 truncate">
              — Issue #{activeReq.gitlab_issue_id}: {activeReq.title.split("—")[0].trim()}
            </span>
          )}
        </div>

        {/* Format toggle + actions */}
        <div className="px-3.5 py-2.5 border-b border-gray-200 bg-white flex items-center gap-2 flex-shrink-0">
          {(["BDD", "MANUAL"] as const).map(f => (
            <button key={f} onClick={() => setFmt(f)}
              className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-colors
                ${fmt === f ? "bg-blue-50 text-blue-700 border-blue-300" : "bg-transparent text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-900"}`}>
              {f === "BDD" ? "BDD / Gherkin" : "Manual Steps"}
              <span className="ml-1.5 text-[10px] opacity-60">({fmtCounts[f]})</span>
            </button>
          ))}
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => setExpandAll(e => !e)}
              className="px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              {expandAll ? "⊟ Collapse" : "⊞ Expand All"}
            </button>
            <button
              onClick={() => setShowExport(true)}
              className="px-3 py-1.5 rounded-md border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
            >⬇ Export</button>
            <button
              onClick={() => activeReqId ? setShowGen(true) : toast("Select a requirement first", true)}
              className="px-3 py-1.5 rounded-lg bg-accent text-black text-[11px] font-bold font-mono hover:bg-[#00deff] transition-all shadow-[0_0_14px_rgba(0,200,240,0.2)]"
            >✦ Generate</button>            <button
              onClick={() => activeReqId ? setShowNew(true) : toast("Select a requirement first", true)}
              className="px-3 py-1.5 rounded-md border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
            >+ New</button>          </div>
        </div>

        {/* Context bar */}
        <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-400 uppercase tracking-wide">Context:</span>
          {[
            `✦ ${activeProject?.llm_model ?? "claude-sonnet-4-6"}`,
            "⬡ 5 doc chunks",
            activeReq ? `🔗 Issue #${activeReq.gitlab_issue_id}` : "🔗 No issue",
          ].map(t => (
            <span key={t} className="inline-flex items-center px-2 py-0.5 rounded bg-gray-100 border border-gray-200 text-xs text-gray-500">{t}</span>
          ))}
          <span className="ml-auto inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            {allTcs.length} test cases
          </span>
        </div>

        {/* Test case body */}
        <div className="flex-1 overflow-y-auto p-3.5">
          {!activeReqId ? (
            <EmptyState
              icon="◎"
              title="No requirement selected"
              // subtitle="Fetch a GitLab issue URL or pick a requirement from the left panel."
            />
          ) : loadingTcs ? (
            <div className="flex justify-center pt-16"><Spinner size="lg" /></div>
          ) : testCases.length === 0 ? (
            <EmptyState
              icon="◎"
              title="No test cases yet"
              // subtitle="Click Generate to create test cases for this requirement using AI and your document context."
              action={
                <button
                  onClick={() => setShowGen(true)}
                  className="mt-1 px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  ✦ Generate Test Cases
                </button>
              }
            />
          ) : (
            testCases.map((tc, i) => (
              <div key={tc.id} className="fade-up" style={{ animationDelay: `${i * 50}ms` }}>
                <TestCaseCard
                  tc={tc}
                  index={i + 1}
                  forceExpand={expandAll}
                  onEdit={tc => { setEditingTc(tc); setShowEdit(true); }}
                  onDelete={handleDelete}
                />
              </div>
            ))
          )}
        </div>

        {/* Export bar */}
        <div className="px-4 py-3 border-t border-gray-200 bg-white flex items-center gap-2.5 flex-shrink-0">
          <span className="text-xs text-gray-500 uppercase tracking-wide mr-1">Export:</span>
          <button
            onClick={handleWordExport}
            className="px-3 py-1.5 rounded-md border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
          >📄 Word</button>
          <button
            onClick={handleExcelExport}
            className="px-3 py-1.5 rounded-md border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
          >📊 Excel</button>
          <button
            onClick={handleGitLabPush}
            disabled={pushingToGitlab || !activeReq?.gitlab_issue_url}
            title={!activeReq?.gitlab_issue_url ? "No GitLab issue linked to this requirement" : "Post comment + Excel attachment to GitLab issue"}
            className="px-3 py-1.5 rounded-md border border-orange-300 bg-white text-orange-700 text-sm font-medium hover:bg-orange-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {pushingToGitlab ? <Spinner size="sm" /> : "🦊"} GitLab
          </button>
          <span className="ml-auto text-xs text-gray-500">
            {allTcs.length} test cases{activeReq ? ` · Issue #${activeReq.gitlab_issue_id}` : ""}
          </span>
        </div>
      </div>

      {/* ── Modals ── */}
      {showGen && (
        <GenerateModal
          onClose={() => setShowGen(false)}
          onGenerate={(fmt, count, extra) => handleGenerate({ format: fmt, count_hint: count, additional_context: extra })}
          defaultFormat={activeProject?.default_format}
          requirementTitle={activeReq?.title ?? ""}
        />
      )}
      {showExport && (
        <ExportModal
          hasSelection={!!activeReqId}
          onClose={() => setShowExport(false)}
          onExport={(scope, fmt, type) => {
            const tcs = scope === "current" ? allTcs : allTcs;
            if (type === "word") handleWordExport();
            else if (type === "excel") handleExcelExport();
            else toast("CSV/JSON export not yet wired", true);
          }}
        />
      )}
      <EditTestCaseModal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        testCase={editingTc}
        onSave={handleSaveEdit}
      />
      <EditTestCaseModal
        open={showNew}
        onClose={() => setShowNew(false)}
        testCase={null}
        requirementId={activeReqId ?? undefined}
        initialFormat={fmt}
        onSave={() => {}}
        onCreate={handleCreate}
      />
      {showGenOverlay && <GenerationOverlay progressMessage={overlayProgress ?? undefined} />}
    </div>
  );
}
