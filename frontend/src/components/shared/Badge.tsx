type Color = "blue" | "green" | "amber" | "red" | "purple" | "gray" | "accent" | "muted";
const C: Record<Color, string> = {
  blue:   "bg-blue-50 text-blue-700 border border-blue-200",
  green:  "bg-green-50 text-green-700 border border-green-200",
  amber:  "bg-amber-50 text-amber-700 border border-amber-200",
  red:    "bg-red-50 text-red-700 border border-red-200",
  purple: "bg-purple-50 text-purple-700 border border-purple-200",
  gray:   "bg-gray-100 text-gray-600 border border-gray-200",
  accent: "bg-blue-50 text-blue-700 border border-blue-200",
  muted:  "bg-gray-100 text-gray-500 border border-gray-200",
};
export function Badge({ color = "gray", children }: { color?: Color; children: React.ReactNode }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${C[color]}`}>{children}</span>;
}
