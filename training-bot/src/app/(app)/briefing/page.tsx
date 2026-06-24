"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScoreIndicator } from "@/components/score-indicator";
import {
  CalendarClock,
  Loader2,
  Play,
  Phone,
  Mail,
  RotateCcw,
  Flame,
  ClipboardList,
  Sprout,
  Zap,
} from "lucide-react";

interface TierAccount {
  accountId?: string;
  accountName: string;
  score: number;
  topSignal?: string;
  action?: string;
  contactName?: string;
  contactTitle?: string;
}

interface CallItem {
  contactId?: string;
  contactName: string;
  contactTitle?: string;
  accountName: string;
  phone?: string;
  talkingPoints?: string;
  priority: number;
}

interface EmailItem {
  contactId?: string;
  contactName: string;
  accountName: string;
  priority: number;
  reason?: string;
}

interface FollowUp {
  contactId?: string;
  contactName: string;
  accountName: string;
  lastActivity?: string;
  recommendedAction?: string;
}

interface Briefing {
  id: string;
  date: string;
  tier1Json: TierAccount[] | null;
  tier2Json: TierAccount[] | null;
  tier3Json: TierAccount[] | null;
  callListJson: CallItem[] | null;
  emailListJson: EmailItem[] | null;
  followUpsJson: FollowUp[] | null;
  slackSent: boolean;
}

export default function BriefingPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role;
  const isAdmin = role === "ADMIN" || role === "MANAGER";

  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchBriefing = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/briefing");
      const data = await res.json();
      setBriefing(data.briefing);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBriefing(); }, [fetchBriefing]);

  async function generateBriefing() {
    setGenerating(true);
    try {
      await fetch("/api/briefing", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      // Poll for completion
      const poll = async () => {
        await new Promise((r) => setTimeout(r, 5000));
        await fetchBriefing();
        // Check if still no briefing or briefing is stale — keep polling up to 60s
      };
      await poll();
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-[#00d4ff]" />
      </div>
    );
  }

  const tier1 = (briefing?.tier1Json ?? []) as TierAccount[];
  const tier2 = (briefing?.tier2Json ?? []) as TierAccount[];
  const tier3 = (briefing?.tier3Json ?? []) as TierAccount[];
  const calls = (briefing?.callListJson ?? []) as CallItem[];
  const emails = (briefing?.emailListJson ?? []) as EmailItem[];
  const followUps = (briefing?.followUpsJson ?? []) as FollowUp[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl sz-gradient-bg flex items-center justify-center">
              <CalendarClock className="h-5 w-5 text-[#0b1120]" />
            </div>
            Daily Brief
          </h1>
          <p className="text-[#94a3b8] mt-1">
            {briefing
              ? `Generated ${new Date(briefing.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}${briefing.slackSent ? " · Sent to Slack" : ""}`
              : "No briefing for today yet"}
          </p>
        </div>
        {isAdmin && (
          <Button
            className="sz-gradient-bg text-[#0b1120] font-semibold hover:opacity-90"
            size="sm"
            disabled={generating}
            onClick={generateBriefing}
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            Generate Briefing
          </Button>
        )}
      </div>

      {!briefing ? (
        <div className="text-center py-20 text-[#475569]">
          <CalendarClock className="h-16 w-16 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No briefing generated yet</p>
          <p className="text-sm mt-1">Click &quot;Generate Briefing&quot; to create today&apos;s action plan</p>
        </div>
      ) : (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Tier 1 Accounts", value: tier1.length, icon: Flame, color: "text-red-400" },
              { label: "Calls Today", value: calls.length, icon: Phone, color: "text-emerald-400" },
              { label: "Emails Today", value: emails.length, icon: Mail, color: "text-[#00d4ff]" },
              { label: "Follow-ups", value: followUps.length, icon: RotateCcw, color: "text-amber-400" },
            ].map((stat) => (
              <Card key={stat.label} className="border-white/5 bg-white/[0.02]">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center ${stat.color}`}>
                    <stat.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-white">{stat.value}</p>
                    <p className="text-[11px] text-[#475569]">{stat.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Tiers */}
          <div className="grid grid-cols-3 gap-4">
            {/* Tier 1 */}
            <Card className="border-red-500/20 bg-red-500/[0.02]">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-red-400 flex items-center gap-2">
                  <Flame className="h-4 w-4" /> Tier 1 — Work TODAY
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {tier1.length === 0 ? (
                  <p className="text-xs text-[#475569]">No Tier 1 accounts</p>
                ) : (
                  tier1.map((a, i) => (
                    <div key={i} className="rounded-lg border border-white/5 bg-white/[0.02] p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-white">{a.accountName}</span>
                        <ScoreIndicator score={a.score} size="sm" />
                      </div>
                      {a.topSignal && (
                        <p className="text-[10px] text-amber-400 flex items-center gap-1">
                          <Zap className="h-2.5 w-2.5" /> {a.topSignal}
                        </p>
                      )}
                      {a.contactName && (
                        <p className="text-[10px] text-[#94a3b8]">{a.contactName} — {a.contactTitle}</p>
                      )}
                      {a.action && (
                        <p className="text-[10px] text-emerald-400">→ {a.action}</p>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Tier 2 */}
            <Card className="border-[#00d4ff]/20 bg-[#00d4ff]/[0.02]">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-[#00d4ff] flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" /> Tier 2 — This Week
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {tier2.length === 0 ? (
                  <p className="text-xs text-[#475569]">No Tier 2 accounts</p>
                ) : (
                  tier2.map((a, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                      <div className="min-w-0">
                        <p className="text-xs text-white truncate">{a.accountName}</p>
                        {a.topSignal && <p className="text-[10px] text-[#475569] truncate">{a.topSignal}</p>}
                      </div>
                      <ScoreIndicator score={a.score} size="sm" />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Tier 3 */}
            <Card className="border-amber-500/20 bg-amber-500/[0.02]">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-amber-400 flex items-center gap-2">
                  <Sprout className="h-4 w-4" /> Tier 3 — Nurture
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {tier3.length === 0 ? (
                  <p className="text-xs text-[#475569]">No Tier 3 accounts</p>
                ) : (
                  tier3.map((a, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                      <p className="text-xs text-[#94a3b8] truncate">{a.accountName}</p>
                      <ScoreIndicator score={a.score} size="sm" />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Call List & Email List */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="border-white/5 bg-white/[0.02]">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                  <Phone className="h-4 w-4" /> Call List ({calls.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {calls.map((c, i) => (
                  <div key={i} className="rounded-lg border border-white/5 bg-white/[0.02] p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-white">{c.contactName}</span>
                      <span className="text-[10px] text-[#475569]">#{c.priority}</span>
                    </div>
                    <p className="text-[10px] text-[#94a3b8]">{c.contactTitle} at {c.accountName}</p>
                    {c.phone && <p className="text-[10px] text-[#00d4ff] font-mono">{c.phone}</p>}
                    {c.talkingPoints && <p className="text-[10px] text-[#475569]">{c.talkingPoints}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-white/5 bg-white/[0.02]">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-[#00d4ff] flex items-center gap-2">
                  <Mail className="h-4 w-4" /> Email List ({emails.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {emails.map((e, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                    <div className="min-w-0">
                      <p className="text-xs text-white truncate">{e.contactName}</p>
                      <p className="text-[10px] text-[#475569] truncate">{e.accountName}</p>
                    </div>
                    {e.reason && <p className="text-[10px] text-[#94a3b8] text-right">{e.reason}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Follow-ups */}
          {followUps.length > 0 && (
            <Card className="border-white/5 bg-white/[0.02]">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-amber-400 flex items-center gap-2">
                  <RotateCcw className="h-4 w-4" /> Follow-ups ({followUps.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {followUps.map((f, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                    <div>
                      <p className="text-xs text-white">{f.contactName} at {f.accountName}</p>
                      {f.lastActivity && <p className="text-[10px] text-[#475569]">{f.lastActivity}</p>}
                    </div>
                    {f.recommendedAction && (
                      <p className="text-[10px] text-emerald-400 text-right max-w-xs">→ {f.recommendedAction}</p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
