import { useState, useEffect } from "react";
import { Button, toast } from "../shared";
import type { TestCase } from "../../types";

interface ManualStep { action: string; expected: string; }
interface ManualContent { preconditions?: string; test_data?: string; steps: ManualStep[]; }

function parseManual(content: string): ManualContent | null {
  try {
    const d = JSON.parse(content);
    if (d && Array.isArray(d.steps)) return d as ManualContent;
  } catch {}
  return null;
}

const BDD_TEMPLATE = `Feature: <feature name>\n\n  Scenario: <scenario title>\n    Given <precondition>\n    When <action>\n    Then <expected result>`;

interface Props {
  open: boolean;
  onClose: () => void;
  /** Existing test case (edit mode) or null (new mode) */
  testCase: TestCase | null;
  requirementId?: string;
  initialFormat?: "BDD" | "MANUAL";
  onSave: (tc: TestCase) => void;
  onCreate?: (data: { requirement_id: string; title: string; format: "BDD" | "MANUAL"; content: string; priority: string; tags?: string; scenario_type?: string }) => void;
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="mb-4">
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    {children}
  </div>
);

export default function EditTestCaseModal({ open, onClose, testCase, requirementId, initialFormat = "BDD", onSave, onCreate }: Props) {
  const isNew = testCase === null;
  const [newFmt, setNewFmt] = useState<"BDD" | "MANUAL">(initialFormat);
  const [form, setForm] = useState({ title: "", content: "", priority: "MEDIUM", scenario_type: "positive", tags: "" });
  const [manual, setManual] = useState<ManualContent | null>(null);

  useEffect(() => {
    if (!open) return;
    if (testCase) {
      const parsed = parseManual(testCase.content);
      setManual(parsed
        ? { ...parsed, steps: parsed.steps.length ? parsed.steps : [{ action: "", expected: "" }] }
        : null
      );
      setForm({
        title: testCase.title, content: testCase.content,
        priority: testCase.priority, scenario_type: testCase.scenario_type ?? "positive", tags: testCase.tags ?? "",
      });
    } else {
      setNewFmt(initialFormat);
      setForm({ title: "", content: initialFormat === "BDD" ? BDD_TEMPLATE : "", priority: "MEDIUM", scenario_type: "positive", tags: "" });
      setManual(initialFormat === "MANUAL" ? { preconditions: "", test_data: "", steps: [{ action: "", expected: "" }] } : null);
    }
  }, [open, testCase?.id]);

  // When format changes in new mode, switch editor type
  useEffect(() => {
    if (!isNew) return;
    if (newFmt === "MANUAL") {
      setManual({ preconditions: "", test_data: "", steps: [{ action: "", expected: "" }] });
      setForm(f => ({ ...f, content: "" }));
    } else {
      setManual(null);
      setForm(f => ({ ...f, content: BDD_TEMPLATE }));
    }
  }, [newFmt]);

  if (!open) return null;
  if (isNew && !requirementId) return null;

  const handleSave = () => {
    if (!form.title.trim()) { return; }
    const content = manual ? JSON.stringify(manual, null, 2) : form.content;
    if (isNew) {
      onCreate?.({
        requirement_id: requirementId!,
        title: form.title,
        format: newFmt,
        content,
        priority: form.priority,
        tags: form.tags || undefined,
        scenario_type: form.scenario_type || undefined,
      });
    } else {
      onSave({ ...testCase!, ...form, content, priority: form.priority as "HIGH"|"MEDIUM"|"LOW", scenario_type: form.scenario_type as TestCase["scenario_type"], edited: true });
    }
    toast(isNew ? "Test case created" : "Test case saved");
    onClose();
  };

  const updateStep = (i: number, field: keyof ManualStep, value: string) =>
    setManual(m => m ? { ...m, steps: m.steps.map((s, idx) => idx === i ? { ...s, [field]: value } : s) } : m);

  const addStep = () =>
    setManual(m => m ? { ...m, steps: [...m.steps, { action: "", expected: "" }] } : m);

  const deleteStep = (i: number) =>
    setManual(m => m ? { ...m, steps: m.steps.filter((_, idx) => idx !== i) } : m);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-[780px] max-h-[90vh] flex flex-col mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{isNew ? "New Test Case" : "Edit Test Case"}</h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-sm">{isNew ? "Add a test case manually" : testCase!.title}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-4">
          {isNew && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Format</label>
              <div className="flex gap-2">
                {(["BDD", "MANUAL"] as const).map(f => (
                  <button key={f} onClick={() => setNewFmt(f)}
                    className={`px-4 py-1.5 rounded-md border text-sm font-medium transition-colors ${
                      newFmt === f ? "bg-blue-50 text-blue-700 border-blue-300" : "border-gray-300 text-gray-600 hover:bg-gray-50"
                    }`}>
                    {f === "BDD" ? "BDD / Gherkin" : "Manual Steps"}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Field label="Title">
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
          </Field>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white outline-none focus:border-blue-500">
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Scenario Type</label>
              <select value={form.scenario_type} onChange={e => setForm(f => ({ ...f, scenario_type: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white outline-none focus:border-blue-500">
                <option value="positive">Positive</option>
                <option value="negative">Negative</option>
                <option value="edge">Edge Case</option>
                <option value="security">Security</option>
                <option value="performance">Performance</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
              <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                placeholder="tag1, tag2"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-blue-500" />
            </div>
          </div>

          {manual ? (
            <>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Preconditions</label>
                  <input value={manual.preconditions ?? ""}
                    onChange={e => setManual(m => m ? { ...m, preconditions: e.target.value } : m)}
                    placeholder="e.g. User is logged in"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Test Data</label>
                  <input value={manual.test_data ?? ""}
                    onChange={e => setManual(m => m ? { ...m, test_data: e.target.value } : m)}
                    placeholder="e.g. username=admin, password=secret"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                </div>
              </div>

              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">Steps</label>
                <button onClick={addStep}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-50 transition-colors">
                  + Add Step
                </button>
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left text-xs font-semibold text-gray-500 px-3 py-2 w-8">#</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-3 py-2">Action</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-3 py-2">Expected Result</th>
                      <th className="w-9" />
                    </tr>
                  </thead>
                  <tbody>
                    {manual.steps.map((s, i) => (
                      <tr key={i} className="border-b border-gray-100 last:border-0">
                        <td className="px-3 py-2 text-xs font-bold text-gray-400 align-top pt-3">{i + 1}</td>
                        <td className="px-2 py-1.5 align-top">
                          <textarea
                            value={s.action}
                            onChange={e => updateStep(i, "action", e.target.value)}
                            rows={2}
                            placeholder="Describe the action…"
                            className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 resize-none leading-snug" />
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <textarea
                            value={s.expected}
                            onChange={e => updateStep(i, "expected", e.target.value)}
                            rows={2}
                            placeholder="Describe the expected result…"
                            className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 resize-none leading-snug" />
                        </td>
                        <td className="px-2 py-2 align-top pt-3 text-center">
                          <button
                            onClick={() => deleteStep(i)}
                            disabled={manual.steps.length === 1}
                            title="Delete step"
                            className="text-gray-300 hover:text-red-500 disabled:opacity-25 disabled:cursor-not-allowed transition-colors text-lg leading-none">
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <Field label="Content">
              <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                rows={12}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 resize-y leading-relaxed" />
            </Field>
          )}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!form.title.trim()}>{isNew ? "Create" : "Save Changes"}</Button>
        </div>
      </div>
    </div>
  );
}
