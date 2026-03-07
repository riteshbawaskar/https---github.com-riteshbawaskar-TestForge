import { Spinner } from "../shared";

const STEPS = ["Fetching requirement", "Retrieving context", "Calling AI model", "Parsing response", "Saving test cases"];

function stepIndex(msg: string | undefined): number {
  if (!msg) return 0;
  const m = msg.toLowerCase();
  if (m.includes("fetch")) return 0;
  if (m.includes("retriev") || m.includes("context")) return 1;
  if (m.includes("call") || m.includes("generat")) return 2;
  if (m.includes("pars")) return 3;
  if (m.includes("sav")) return 4;
  return 0;
}

export default function GenerationOverlay({ progressMessage }: { progressMessage?: string }) {
  const step = stepIndex(progressMessage);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl px-8 py-8 w-[400px]">
        <div className="flex flex-col items-center text-center">
          <Spinner size="lg" />
          <h3 className="text-base font-semibold text-gray-900 mt-4 mb-1">Generating Test Cases</h3>
          <p className="text-sm text-gray-500 mb-6">{progressMessage ?? "Starting…"}</p>
          <div className="w-full space-y-2">
            {STEPS.map((s, i) => (
              <div key={s} className={`flex items-center gap-2.5 text-sm ${i < step ? "text-green-600" : i === step ? "text-blue-600 font-medium" : "text-gray-300"}`}>
                <span className="w-5 h-5 rounded-full border flex items-center justify-center text-xs flex-shrink-0
                  ${i < step ? 'bg-green-500 border-green-500 text-white' : i === step ? 'border-blue-500' : 'border-gray-200'}">
                  {i < step ? "✓" : i + 1}
                </span>
                {s}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
