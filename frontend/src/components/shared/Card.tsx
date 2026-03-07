import { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`bg-white border border-gray-200 rounded-lg p-5 mb-4 shadow-sm ${className}`}>{children}</div>;
}
export function CardTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-sm font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">{children}</h3>;
}
