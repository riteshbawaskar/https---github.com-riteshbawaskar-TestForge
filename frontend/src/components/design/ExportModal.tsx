import { useState } from "react";
import { Button } from "../shared";

interface Props { onExport: (scope: string, fmt: string, type: string) => void; onClose: () => void; hasSelection: boolean; }

export default function ExportModal({ onExport, onClose, hasSelection }: Props) {
  const [scope, setScope] = useState(hasSelection ? "current" : "all");
  const [fmt,   setFmt]   = useState("BDD");
  const [type,  setType]  = useState("word");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-[420px] mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Export Test Cases</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Scope</label>
            <select value={scope} onChange={e => setScope(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20">
              {hasSelection && <option value="current">Current requirement only</option>}
              <option value="all">All requirements in project</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Format</label>
            <select value={fmt} onChange={e => setFmt(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20">
              <option value="BDD">BDD only</option>
              <option value="MANUAL">Manual only</option>
              <option value="BOTH">Both formats</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">File Type</label>
            <div className="grid grid-cols-4 gap-2">
              {[["word","📝 Word"], ["excel","📊 Excel"], ["csv","📋 CSV"], ["json","⚙️ JSON"]].map(([v, l]) => (
                <button key={v} onClick={() => setType(v)}
                  className={`py-2 rounded-md border text-xs font-medium transition-colors ${type === v ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { onExport(scope, fmt, type); onClose(); }}>Export</Button>
        </div>
      </div>
    </div>
  );
}
