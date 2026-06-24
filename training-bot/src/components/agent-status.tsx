"use client";

import { cn } from "@/lib/utils";
import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";

interface AgentRun {
  id: string;
  agentName: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  outputSummary: string | null;
  accountsFound: number;
  contactsFound: number;
  errorsCount: number;
}

export function AgentStatusBadge({ status }: { status: string }) {
  const config = {
    RUNNING: { icon: Loader2, className: "text-[#00d4ff] animate-spin", label: "Running" },
    COMPLETED: { icon: CheckCircle2, className: "text-emerald-400", label: "Complete" },
    FAILED: { icon: XCircle, className: "text-red-400", label: "Failed" },
    CANCELLED: { icon: Clock, className: "text-[#475569]", label: "Cancelled" },
  }[status] ?? { icon: Clock, className: "text-[#475569]", label: status };

  const Icon = config.icon;

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", config.className)}>
      <Icon className="h-3.5 w-3.5" />
      {config.label}
    </span>
  );
}

export function AgentRunCard({ run }: { run: AgentRun }) {
  const startTime = new Date(run.startedAt);
  const duration = run.completedAt
    ? Math.round((new Date(run.completedAt).getTime() - startTime.getTime()) / 1000)
    : null;

  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <AgentStatusBadge status={run.status} />
        <span className="text-[10px] text-[#475569]">
          {startTime.toLocaleTimeString()}
          {duration !== null && ` · ${duration}s`}
        </span>
      </div>
      {run.outputSummary && (
        <p className="text-xs text-[#94a3b8] leading-relaxed">{run.outputSummary}</p>
      )}
      {(run.accountsFound > 0 || run.contactsFound > 0) && (
        <div className="flex gap-3 text-[10px]">
          {run.accountsFound > 0 && (
            <span className="text-[#00d4ff]">{run.accountsFound} accounts</span>
          )}
          {run.contactsFound > 0 && (
            <span className="text-emerald-400">{run.contactsFound} contacts</span>
          )}
          {run.errorsCount > 0 && (
            <span className="text-red-400">{run.errorsCount} errors</span>
          )}
        </div>
      )}
    </div>
  );
}
