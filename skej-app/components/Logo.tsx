export function Logo({ size = "default", className = "" }: { size?: "small" | "default" | "large"; className?: string }) {
  const sizes = {
    small: { text: "text-lg", dots: "w-1.5 h-1.5", gap: "gap-1" },
    default: { text: "text-3xl", dots: "w-2 h-2", gap: "gap-1.5" },
    large: { text: "text-5xl", dots: "w-3 h-3", gap: "gap-2" }
  };

  const s = sizes[size];

  return (
    <div className={`flex items-center ${s.gap} font-sans font-semibold text-primary tracking-tight ${className}`}>
      <span>skeema</span>
      <div className={`flex flex-col ${s.gap === "gap-1" ? "gap-1" : s.gap === "gap-1.5" ? "gap-1.5" : "gap-2"}`}>
        <div className={`${s.dots} bg-primary rounded-full`}></div>
        <div className={`${s.dots} bg-primary rounded-full opacity-70`}></div>
      </div>
    </div>
  );
}
