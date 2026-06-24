"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScoreIndicator } from "@/components/score-indicator";
import { SignalBadge } from "@/components/signal-badge";
import { AgentStatusBadge, AgentRunCard } from "@/components/agent-status";
import {
  Target,
  Search,
  Loader2,
  ChevronDown,
  ChevronRight,
  Users,
  Zap,
  Building2,
  Globe,
  Play,
  RefreshCw,
} from "lucide-react";

interface Account {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  locationCount: number | null;
  expansionScore: number | null;
  status: string;
  lastResearchedAt: string | null;
  _count: { contacts: number; signals: number };
}

interface AccountDetail {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  subIndustry: string | null;
  locationCount: number | null;
  employeeCount: number | null;
  annualRevenue: string | null;
  expansionScore: number | null;
  status: string;
  notes: string | null;
  contacts: Array<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    title: string | null;
    email: string | null;
    isPrimary: boolean;
  }>;
  signals: Array<{
    id: string;
    type: string;
    title: string;
    description: string | null;
    url: string | null;
    createdAt: string;
  }>;
  qualifications: Array<{
    score: number;
    reasoning: string | null;
    recommendedAction: string | null;
    positiveSignals: string[] | null;
    negativeSignals: string[] | null;
  }>;
}

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

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "NEW", label: "New" },
  { value: "RESEARCHED", label: "Researched" },
  { value: "QUALIFIED", label: "Qualified" },
  { value: "OUTREACH", label: "Outreach" },
  { value: "MEETING_BOOKED", label: "Meeting Booked" },
  { value: "NURTURE", label: "Nurture" },
  { value: "DISQUALIFIED", label: "Disqualified" },
];

const STATUS_COLORS: Record<string, string> = {
  NEW: "bg-[#475569]/30 text-[#94a3b8] border-[#475569]/50",
  RESEARCHED: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  QUALIFIED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  OUTREACH: "bg-[#00d4ff]/15 text-[#00d4ff] border-[#00d4ff]/30",
  MEETING_BOOKED: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  NURTURE: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  DISQUALIFIED: "bg-red-500/15 text-red-400 border-red-500/30",
};

export default function ProspectsPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role;
  const isAdmin = role === "ADMIN" || role === "MANAGER";

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [agentRunning, setAgentRunning] = useState<string | null>(null);
  const [latestRun, setLatestRun] = useState<AgentRun | null>(null);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (search) params.set("search", search);
    try {
      const res = await fetch(`/api/prospects?${params}`);
      const data = await res.json();
      setAccounts(data.accounts ?? []);
      setTotal(data.total ?? 0);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, search]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  async function loadDetail(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/prospects/${id}`);
      setDetail(await res.json());
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function triggerAgent(agent: string) {
    setAgentRunning(agent);
    try {
      const res = await fetch(`/api/agents/${agent}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json();
      if (data.runId) {
        pollAgentStatus(agent, data.runId);
      }
    } catch {
      setAgentRunning(null);
    }
  }

  async function pollAgentStatus(agent: string, runId: string) {
    const check = async () => {
      const res = await fetch(`/api/agents/${agent}`);
      const data = await res.json();
      const run = data.runs?.find((r: AgentRun) => r.id === runId);
      if (run) {
        setLatestRun(run);
        if (run.status === "RUNNING") {
          setTimeout(check, 3000);
        } else {
          setAgentRunning(null);
          fetchAccounts();
        }
      }
    };
    setTimeout(check, 2000);
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl sz-gradient-bg flex items-center justify-center">
              <Target className="h-5 w-5 text-[#0b1120]" />
            </div>
            Prospects
          </h1>
          <p className="text-[#94a3b8] mt-1">
            {total} accounts in pipeline
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-[#00d4ff]/20 text-[#00d4ff] hover:bg-[#00d4ff]/10"
              disabled={!!agentRunning}
              onClick={() => triggerAgent("qualification")}
            >
              {agentRunning === "qualification" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Score All
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-[#00d4ff]/20 text-[#00d4ff] hover:bg-[#00d4ff]/10"
              disabled={!!agentRunning}
              onClick={() => triggerAgent("contact-finder")}
            >
              {agentRunning === "contact-finder" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Users className="h-4 w-4 mr-2" />}
              Find Contacts
            </Button>
            <Button
              className="sz-gradient-bg text-[#0b1120] font-semibold hover:opacity-90"
              size="sm"
              disabled={!!agentRunning}
              onClick={() => triggerAgent("account-finder")}
            >
              {agentRunning === "account-finder" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              Find Accounts
            </Button>
          </div>
        )}
      </div>

      {latestRun && (
        <AgentRunCard run={latestRun} />
      )}

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#475569]" />
          <Input
            placeholder="Search by name or domain..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-[#475569]"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v ?? "all"); setPage(1); }}>
          <SelectTrigger className="w-44 bg-white/5 border-white/10 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="border-white/5 bg-white/[0.02]">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-[#00d4ff]" />
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-20 text-[#475569]">
              <Target className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No prospects found. Run the Account Finder to discover companies.</p>
            </div>
          ) : (
            <div>
              {/* Header */}
              <div className="grid grid-cols-[1fr_120px_100px_80px_80px_80px_100px] gap-4 px-4 py-3 text-[10px] uppercase tracking-wider text-[#475569] font-semibold border-b border-white/5">
                <span>Company</span>
                <span>Industry</span>
                <span>Locations</span>
                <span>Score</span>
                <span>Signals</span>
                <span>Contacts</span>
                <span>Status</span>
              </div>

              {/* Rows */}
              {accounts.map((account) => (
                <div key={account.id}>
                  <div
                    className="grid grid-cols-[1fr_120px_100px_80px_80px_80px_100px] gap-4 px-4 py-3 items-center border-b border-white/5 hover:bg-white/[0.02] cursor-pointer transition-colors"
                    onClick={() => loadDetail(account.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {expandedId === account.id ? (
                        <ChevronDown className="h-4 w-4 text-[#475569] shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-[#475569] shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{account.name}</p>
                        {account.domain && (
                          <p className="text-[11px] text-[#475569] truncate">{account.domain}</p>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-[#94a3b8] truncate">{account.industry ?? "—"}</span>
                    <span className="text-xs text-[#94a3b8] font-mono">
                      {account.locationCount ?? "—"}
                    </span>
                    <ScoreIndicator score={account.expansionScore} size="sm" />
                    <span className="text-xs text-[#94a3b8]">
                      {account._count.signals > 0 && (
                        <span className="flex items-center gap-1">
                          <Zap className="h-3 w-3 text-amber-400" />
                          {account._count.signals}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-[#94a3b8]">
                      {account._count.contacts > 0 && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3 text-[#00d4ff]" />
                          {account._count.contacts}
                        </span>
                      )}
                    </span>
                    <Badge variant="outline" className={STATUS_COLORS[account.status] ?? ""}>
                      {account.status.replace(/_/g, " ")}
                    </Badge>
                  </div>

                  {/* Expanded Detail */}
                  {expandedId === account.id && (
                    <div className="px-4 py-4 bg-white/[0.01] border-b border-white/5">
                      {detailLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-[#00d4ff]" />
                      ) : detail ? (
                        <div className="grid grid-cols-3 gap-6">
                          {/* Signals */}
                          <div className="space-y-3">
                            <h4 className="text-xs font-semibold text-[#00d4ff] uppercase tracking-wider flex items-center gap-2">
                              <Zap className="h-3.5 w-3.5" /> Expansion Signals
                            </h4>
                            {detail.signals.length === 0 ? (
                              <p className="text-xs text-[#475569]">No signals detected</p>
                            ) : (
                              <div className="space-y-2">
                                {detail.signals.map((s) => (
                                  <div key={s.id} className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <SignalBadge type={s.type} />
                                    </div>
                                    <p className="text-xs text-[#94a3b8]">{s.title}</p>
                                    {s.url && (
                                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#00d4ff] hover:underline">
                                        Source →
                                      </a>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Contacts */}
                          <div className="space-y-3">
                            <h4 className="text-xs font-semibold text-[#00d4ff] uppercase tracking-wider flex items-center gap-2">
                              <Users className="h-3.5 w-3.5" /> Contacts
                            </h4>
                            {detail.contacts.length === 0 ? (
                              <p className="text-xs text-[#475569]">No contacts found yet</p>
                            ) : (
                              <div className="space-y-2">
                                {detail.contacts.map((c) => (
                                  <div key={c.id} className="flex items-center gap-2">
                                    <div className="h-6 w-6 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-bold text-[#94a3b8]">
                                      {(c.firstName?.[0] ?? "") + (c.lastName?.[0] ?? "")}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-xs text-white truncate">
                                        {c.firstName} {c.lastName}
                                        {c.isPrimary && <span className="ml-1 text-[#00d4ff]">★</span>}
                                      </p>
                                      <p className="text-[10px] text-[#475569] truncate">{c.title}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Qualification */}
                          <div className="space-y-3">
                            <h4 className="text-xs font-semibold text-[#00d4ff] uppercase tracking-wider flex items-center gap-2">
                              <Building2 className="h-3.5 w-3.5" /> Qualification
                            </h4>
                            {detail.qualifications.length === 0 ? (
                              <p className="text-xs text-[#475569]">Not scored yet</p>
                            ) : (
                              <div className="space-y-2">
                                <p className="text-xs text-[#94a3b8]">{detail.qualifications[0].reasoning}</p>
                                {detail.qualifications[0].recommendedAction && (
                                  <p className="text-xs text-emerald-400">→ {detail.qualifications[0].recommendedAction}</p>
                                )}
                                <div className="flex flex-wrap gap-3 text-[10px] mt-2">
                                  <div>
                                    <span className="text-[#475569]">Revenue:</span>{" "}
                                    <span className="text-[#94a3b8]">{detail.annualRevenue ?? "—"}</span>
                                  </div>
                                  <div>
                                    <span className="text-[#475569]">Employees:</span>{" "}
                                    <span className="text-[#94a3b8]">{detail.employeeCount ?? "—"}</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              ))}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-xs text-[#475569]">
                    Page {page} of {totalPages} ({total} accounts)
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} className="border-white/10 text-[#94a3b8]">
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="border-white/10 text-[#94a3b8]">
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
