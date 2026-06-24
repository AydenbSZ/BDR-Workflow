"use client";

import { cn } from "@/lib/utils";

export function ScoreIndicator({ score, size = "md" }: { score: number | null; size?: "sm" | "md" | "lg" }) {
  if (score === null || score === undefined) {
    return (
      <span className="text-xs text-[#475569] font-mono">—</span>
    );
  }

  const color =
    score >= 80
      ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/10"
      : score >= 60
        ? "text-[#00d4ff] border-[#00d4ff]/30 bg-[#00d4ff]/10"
        : score >= 30
          ? "text-amber-400 border-amber-400/30 bg-amber-400/10"
          : "text-red-400 border-red-400/30 bg-red-400/10";

  const sizes = {
    sm: "text-[10px] px-1.5 py-0.5",
    md: "text-xs px-2 py-1",
    lg: "text-sm px-3 py-1.5",
  };

  return (
    <span className={cn("font-mono font-bold rounded-md border", color, sizes[size])}>
      {score}
    </span>
  );
}
