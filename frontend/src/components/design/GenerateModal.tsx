import { useState } from "react";
import { Button, Spinner } from "../shared";

interface Props {
  requirementTitle: string;
  defaultFormat?: string;
  onGenerate: (format: string, countHint: string, extra: string) => void;
  onClose: () => void;
  loading?: boolean;
}

export default function GenerateModal({ requirementTitle, defaultFormat = "BDD", onGenerate, onClose, loading }: Props) {
  const [format, setFormat] = useState(defaultFormat);
  const [count, setCount]   = useState("auto");
  const [extra, setExtra]   = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-[480px] mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Generate Test Cases</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Requirement</p>
            <p className="text-sm font-medium text-gray-900 line-clamp-2">{requirementTitle}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Format</label>
            <select value={format} onChange={e => setFormat(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20">
              <option value="BDD">BDD / Gherkin</option>
              <option value="MANUAL">Manual Steps</option>
              <option value="BOTH">Both Formats</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Number of Test Cases</label>
            <select value={count} onChange={e => setCount(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20">
              <option value="auto">Auto (AI decides)</option>
              <option value="3-5">3–5 cases</option>
              <option value="5-10">5–10 cases</option>
              <option value="10+">10+ cases</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Additional Focus (optional)</label>
            <textarea value={extra} onChange={e => setExtra(e.target.value)}
              placeholder="e.g. Focus on security and edge cases for authentication…"
              rows={3}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 resize-none" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onGenerate(format, count, extra)} disabled={loading}>
            {loading ? <><Spinner size="sm" /> Generating…</> : "Generate"}
          </Button>
        </div>
      </div>
    </div>
  );
}
