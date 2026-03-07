import { useState, useEffect } from "react";
import { Badge, Button } from "../shared";
import type { TestCase } from "../../types";

interface Props {
  tc: TestCase;
  index: number;
  forceExpand?: boolean;
  onEdit: (tc: TestCase) => void;
  onDelete: (id: string) => void;
}

const scenarioBadge = (t?: string) => {
  const m: Record<string, [string, string]> = {
    positive: ["green","Positive"], negative: ["red","Negative"], edge: ["blue","Edge"],
    security: ["purple","Security"], performance: ["amber","Perf"],
  };
  const [c, l] = m[t ?? ""] ?? ["gray",""];
  return l ? <Badge color={c as any}>{l}</Badge> : null;
};
const priorityBadge = (p: string) => {
  if (p === "HIGH")   return <Badge color="red">HIGH</Badge>;
  if (p === "MEDIUM") return <Badge color="amber">MED</Badge>;
  return <Badge color="gray">LOW</Badge>;
};

function GherkinHighlight({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs leading-relaxed overflow-x-auto font-mono whitespace-pre-wrap">
      {lines.map((line, i) => {
        const trim = line.trimStart();
        let cls = "text-gray-800";
        if (trim.startsWith("Feature:"))                      cls = "gherkin-feature";
        else if (trim.startsWith("Scenario"))                 cls = "text-blue-700 font-medium";
        else if (trim.startsWith("Given"))                    cls = "gherkin-given";
        else if (trim.startsWith("When"))                     cls = "gherkin-when";
        else if (trim.startsWith("Then"))                     cls = "gherkin-then";
        else if (trim.startsWith("And") || trim.startsWith("But")) cls = "gherkin-and";
        else if (trim.startsWith("Examples"))                 cls = "text-blue-700 font-medium";
        else if (trim.startsWith("|"))                        cls = "text-gray-500";
        return <span key={i} className={cls}>{line}{"\n"}</span>;
      })}
    </pre>
  );
}

function ManualSteps({ content }: { content: string }) {
  let data: { preconditions?: string; test_data?: string; steps?: { action: string; expected: string }[] } = {};
  try { data = JSON.parse(content); } catch { return <GherkinHighlight content={content} />; }
  const steps = data.steps ?? [];
  if (!steps.length) return <GherkinHighlight content={content} />;
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden text-sm">
      {(data.preconditions || data.test_data) && (
        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-xs space-y-1 text-gray-700">
          {data.preconditions && <div><span className="font-medium text-gray-500">Preconditions:</span> {data.preconditions}</div>}
          {data.test_data && <div><span className="font-medium text-gray-500">Test data:</span> {data.test_data}</div>}
        </div>
      )}
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {["#", "Action", "Expected Result"].map(h => (
              <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-2">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {steps.map((s, i) => (
            <tr key={i} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
              <td className="px-4 py-2.5 text-xs font-bold text-gray-400 w-8">{i + 1}</td>
              <td className="px-4 py-2.5 text-sm text-gray-900 leading-snug">{s.action}</td>
              <td className="px-4 py-2.5 text-sm text-gray-600 leading-snug">{s.expected}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TestCaseCard({ tc, index, forceExpand, onEdit, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (forceExpand !== undefined) setOpen(forceExpand); }, [forceExpand]);

  return (
    <div className={`bg-white border rounded-lg shadow-sm transition-all ${tc.edited ? "border-blue-200" : "border-gray-200"}`}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors rounded-lg">
        <span className="text-xs text-gray-400 font-mono mt-0.5 w-6 flex-shrink-0">{String(index + 1).padStart(2, "0")}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 leading-snug mb-1.5">{tc.title}</div>
          <div className="flex flex-wrap gap-1.5">
            <Badge color={tc.format === "BDD" ? "blue" : "purple"}>{tc.format}</Badge>
            {priorityBadge(tc.priority)}
            {scenarioBadge(tc.scenario_type)}
            {tc.edited && <Badge color="gray">Edited</Badge>}
            {tc.tags && tc.tags.split(",").filter(Boolean).map(t => (
              <span key={t} className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">{t.trim()}</span>
            ))}
          </div>
        </div>
        <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4">
          <div className="border-t border-gray-100 pt-3">
            {tc.format === "MANUAL" ? <ManualSteps content={tc.content} /> : <GherkinHighlight content={tc.content} />}
            <div className="flex gap-2 mt-3">
              <Button variant="secondary" size="sm" onClick={() => onEdit(tc)}>Edit</Button>
              <Button variant="danger" size="sm" onClick={() => onDelete(tc.id)}>Delete</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
