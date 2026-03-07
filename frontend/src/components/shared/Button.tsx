import { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size    = "xs" | "sm" | "md";

const V: Record<Variant, string> = {
  primary:   "bg-blue-600 text-white hover:bg-blue-700 shadow-sm",
  secondary: "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 shadow-sm",
  ghost:     "bg-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900",
  danger:    "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100",
};
const S: Record<Size, string> = {
  xs: "px-2.5 py-1 text-xs",
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant; size?: Size; children: ReactNode;
}
export function Button({ variant = "primary", size = "md", className = "", children, ...props }: ButtonProps) {
  return (
    <button {...props}
      className={`inline-flex items-center gap-1.5 rounded-md font-medium transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed
        ${V[variant]} ${S[size]} ${className}`}>
      {children}
    </button>
  );
}
