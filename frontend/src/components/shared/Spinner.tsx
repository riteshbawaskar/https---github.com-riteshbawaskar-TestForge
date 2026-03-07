const S = { sm: "w-3.5 h-3.5 border-[2px]", md: "w-5 h-5 border-2", lg: "w-7 h-7 border-2" };
export function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  return <span className={`${S[size]} spinner border-current border-t-transparent rounded-full inline-block opacity-70`} />;
}
