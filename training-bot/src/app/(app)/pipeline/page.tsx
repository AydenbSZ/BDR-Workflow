"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ScoreIndicator } from "@/components/score-indicator";
import { Columns3, Loader2, Users, Zap, GripVertical } from "lucide-react";

interface Account {
  id: string;
  name: string;
  domain: string | null;
  expansionScore: number | null;
  status: string;
  _count: { contacts: number; signals: number };
}

const COLUMNS = [
  { key: "NEW", label: "New", color: "border-[#475569]/50" },
  { key: "RESEARCHED", label: "Researched", color: "border-blue-500/50" },
  { key: "QUALIFIED", label: "Qualified", color: "border-emerald-500/50" },
  { key: "OUTREACH", label: "Outreach", color: "border-[#00d4ff]/50" },
  { key: "MEETING_BOOKED", label: "Meeting Booked", color: "border-violet-500/50" },
];

const COLUMN_HEADER_COLORS: Record<string, string> = {
  NEW: "text-[#94a3b8]",
  RESEARCHED: "text-blue-400",
  QUALIFIED: "text-emerald-400",
  OUTREACH: "text-[#00d4ff]",
  MEETING_BOOKED: "text-violet-400",
};

export default function PipelinePage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragTarget, setDragTarget] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/prospects?limit=200");
      const data = await res.json();
      setAccounts(data.accounts ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function moveAccount(accountId: string, newStatus: string) {
    setAccounts((prev) =>
      prev.map((a) => (a.id === accountId ? { ...a, status: newStatus } : a))
    );
    try {
      await fetch(`/api/prospects/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch {
      fetchAll();
    }
  }

  function handleDragStart(e: React.DragEvent, accountId: string) {
    e.dataTransfer.setData("text/plain", accountId);
  }

  function handleDragOver(e: React.DragEvent, columnKey: string) {
    e.preventDefault();
    setDragTarget(columnKey);
  }

  function handleDrop(e: React.DragEvent, columnKey: string) {
    e.preventDefault();
    const accountId = e.dataTransfer.getData("text/plain");
    if (accountId) moveAccount(accountId, columnKey);
    setDragTarget(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-[#00d4ff]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl sz-gradient-bg flex items-center justify-center">
            <Columns3 className="h-5 w-5 text-[#0b1120]" />
          </div>
          Pipeline
        </h1>
        <p className="text-[#94a3b8] mt-1">Drag accounts between stages to update their status</p>
      </div>

      <div className="grid grid-cols-5 gap-4 min-h-[60vh]">
        {COLUMNS.map((col) => {
          const columnAccounts = accounts
            .filter((a) => a.status === col.key)
            .sort((a, b) => (b.expansionScore ?? 0) - (a.expansionScore ?? 0));

          return (
            <div
              key={col.key}
              className={`rounded-xl border-t-2 ${col.color} bg-white/[0.01] p-2 transition-colors ${dragTarget === col.key ? "bg-[#00d4ff]/5" : ""}`}
              onDragOver={(e) => handleDragOver(e, col.key)}
              onDragLeave={() => setDragTarget(null)}
              onDrop={(e) => handleDrop(e, col.key)}
            >
              <div className="flex items-center justify-between px-2 py-2 mb-2">
                <span className={`text-xs font-semibold uppercase tracking-wider ${COLUMN_HEADER_COLORS[col.key]}`}>
                  {col.label}
                </span>
                <span className="text-[10px] font-mono text-[#475569] bg-white/5 px-1.5 py-0.5 rounded">
                  {columnAccounts.length}
                </span>
              </div>

              <div className="space-y-2">
                {columnAccounts.map((account) => (
                  <Card
                    key={account.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, account.id)}
                    className="border-white/5 bg-white/[0.03] cursor-grab active:cursor-grabbing hover:border-[#00d4ff]/20 transition-colors"
                  >
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-white truncate">{account.name}</p>
                          {account.domain && (
                            <p className="text-[10px] text-[#475569] truncate">{account.domain}</p>
                          )}
                        </div>
                        <GripVertical className="h-3.5 w-3.5 text-[#475569]/50 shrink-0" />
                      </div>

                      <div className="flex items-center justify-between">
                        <ScoreIndicator score={account.expansionScore} size="sm" />
                        <div className="flex items-center gap-2 text-[10px] text-[#475569]">
                          {account._count.signals > 0 && (
                            <span className="flex items-center gap-0.5">
                              <Zap className="h-2.5 w-2.5 text-amber-400" />
                              {account._count.signals}
                            </span>
                          )}
                          {account._count.contacts > 0 && (
                            <span className="flex items-center gap-0.5">
                              <Users className="h-2.5 w-2.5 text-[#00d4ff]" />
                              {account._count.contacts}
                            </span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
