"use client";

import { cn } from "@/lib/utils";

const SIGNAL_COLORS: Record<string, string> = {
  EXPANSION_ANNOUNCEMENT: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  FRANCHISE_GROWTH: "bg-[#00d4ff]/15 text-[#00d4ff] border-[#00d4ff]/30",
  FUNDING_ROUND: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  PE_ACQUISITION: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  DEVELOPMENT_HIRING: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  NEW_MARKET_ENTRY: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  LOCATION_CLOSURE: "bg-red-500/15 text-red-400 border-red-500/30",
  EXECUTIVE_HIRE: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  NEWS_MENTION: "bg-[#475569]/30 text-[#94a3b8] border-[#475569]/50",
};

const SIGNAL_LABELS: Record<string, string> = {
  EXPANSION_ANNOUNCEMENT: "Expansion",
  FRANCHISE_GROWTH: "Franchise",
  FUNDING_ROUND: "Funding",
  PE_ACQUISITION: "PE",
  DEVELOPMENT_HIRING: "Hiring",
  NEW_MARKET_ENTRY: "New Market",
  LOCATION_CLOSURE: "Closure",
  EXECUTIVE_HIRE: "Exec Hire",
  NEWS_MENTION: "News",
};

export function SignalBadge({ type }: { type: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border",
        SIGNAL_COLORS[type] ?? SIGNAL_COLORS.NEWS_MENTION
      )}
    >
      {SIGNAL_LABELS[type] ?? type}
    </span>
  );
}
