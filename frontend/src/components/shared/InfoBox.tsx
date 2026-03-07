import { ReactNode } from "react";
export function InfoBox({ children, variant = "info" }: { children: ReactNode; variant?: "info" | "warning" | "success" }) {
  const s = { info: "bg-blue-50 text-blue-700 border-blue-200", warning: "bg-amber-50 text-amber-700 border-amber-200", success: "bg-green-50 text-green-700 border-green-200" };
  return <div className={`px-3 py-2.5 rounded-md border text-sm ${s[variant]}`}>{children}</div>;
}
