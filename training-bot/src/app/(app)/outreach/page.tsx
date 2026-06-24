"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Send,
  Loader2,
  CheckCircle2,
  XCircle,
  Mail,
  MessageSquare,
  Phone,
  ChevronDown,
  ChevronUp,
  Rocket,
} from "lucide-react";

interface OutreachItem {
  id: string;
  type: string;
  subject: string | null;
  content: string;
  status: string;
  createdAt: string;
  approvedAt: string | null;
  sentAt: string | null;
  contact: {
    firstName: string | null;
    lastName: string | null;
    title: string | null;
    email: string | null;
    account: { name: string; expansionScore: number | null };
  };
}

const TYPE_ICONS: Record<string, typeof Mail> = {
  EMAIL: Mail,
  LINKEDIN: MessageSquare,
  CALL: Phone,
};

const TYPE_COLORS: Record<string, string> = {
  EMAIL: "text-[#00d4ff]",
  LINKEDIN: "text-blue-400",
  CALL: "text-emerald-400",
};

export default function OutreachPage() {
  const [items, setItems] = useState<OutreachItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("PENDING");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [acting, setActing] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/outreach?status=${activeTab}&limit=50`);
      const data = await res.json();
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      setSelectedIds(new Set());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  function toggleSelect(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  }

  function selectAll() {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
  }

  async function approveSelected() {
    if (selectedIds.size === 0) return;
    setActing(true);
    try {
      await fetch("/api/outreach/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      fetchItems();
    } finally {
      setActing(false);
    }
  }

  async function rejectSelected() {
    if (selectedIds.size === 0) return;
    setActing(true);
    try {
      await fetch("/api/outreach/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      fetchItems();
    } finally {
      setActing(false);
    }
  }

  async function sendApproved() {
    setActing(true);
    try {
      await fetch("/api/outreach/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setTimeout(fetchItems, 3000);
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl sz-gradient-bg flex items-center justify-center">
              <Send className="h-5 w-5 text-[#0b1120]" />
            </div>
            Outreach Queue
          </h1>
          <p className="text-[#94a3b8] mt-1">Review and approve personalized outreach before sending</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList className="bg-white/5 border border-white/10">
            <TabsTrigger value="PENDING" className="data-[state=active]:bg-[#00d4ff]/10 data-[state=active]:text-[#00d4ff]">Pending</TabsTrigger>
            <TabsTrigger value="APPROVED" className="data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-400">Approved</TabsTrigger>
            <TabsTrigger value="REJECTED" className="data-[state=active]:bg-red-500/10 data-[state=active]:text-red-400">Rejected</TabsTrigger>
            <TabsTrigger value="SENT" className="data-[state=active]:bg-violet-500/10 data-[state=active]:text-violet-400">Sent</TabsTrigger>
          </TabsList>

          <div className="flex gap-2">
            {activeTab === "PENDING" && items.length > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={selectAll} className="border-white/10 text-[#94a3b8]">
                  {selectedIds.size === items.length ? "Deselect All" : "Select All"}
                </Button>
                <Button variant="outline" size="sm" onClick={rejectSelected} disabled={selectedIds.size === 0 || acting} className="border-red-500/20 text-red-400 hover:bg-red-500/10">
                  <XCircle className="h-4 w-4 mr-1" /> Reject
                </Button>
                <Button size="sm" onClick={approveSelected} disabled={selectedIds.size === 0 || acting} className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30">
                  {acting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                  Approve ({selectedIds.size})
                </Button>
              </>
            )}
            {activeTab === "APPROVED" && items.length > 0 && (
              <Button size="sm" onClick={sendApproved} disabled={acting} className="sz-gradient-bg text-[#0b1120] font-semibold hover:opacity-90">
                {acting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Rocket className="h-4 w-4 mr-1" />}
                Send All to HubSpot
              </Button>
            )}
          </div>
        </div>

        {["PENDING", "APPROVED", "REJECTED", "SENT"].map((tab) => (
          <TabsContent key={tab} value={tab} className="mt-4">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-[#00d4ff]" />
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-20 text-[#475569]">
                <Send className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No {tab.toLowerCase()} outreach items</p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item) => {
                  const Icon = TYPE_ICONS[item.type] ?? Mail;
                  const isExpanded = expandedId === item.id;
                  const isSelected = selectedIds.has(item.id);

                  return (
                    <Card
                      key={item.id}
                      className={`border-white/5 bg-white/[0.02] transition-colors ${isSelected ? "border-[#00d4ff]/30 bg-[#00d4ff]/5" : ""}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-4">
                          {activeTab === "PENDING" && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(item.id)}
                              className="mt-1 rounded border-white/20 bg-white/5"
                            />
                          )}

                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center bg-white/5 shrink-0 ${TYPE_COLORS[item.type]}`}>
                            <Icon className="h-4 w-4" />
                          </div>

                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-white">
                                {item.contact.firstName} {item.contact.lastName}
                              </span>
                              <span className="text-[11px] text-[#475569]">
                                {item.contact.title}
                              </span>
                              <Badge variant="outline" className={TYPE_COLORS[item.type] + " text-[10px] px-1.5 py-0 border-current/30"}>
                                {item.type}
                              </Badge>
                            </div>
                            <p className="text-xs text-[#94a3b8]">
                              {item.contact.account.name}
                              {item.contact.account.expansionScore && (
                                <span className="ml-2 text-[#475569]">Score: {item.contact.account.expansionScore}</span>
                              )}
                            </p>
                            {item.subject && (
                              <p className="text-xs text-[#00d4ff] font-medium">{item.subject}</p>
                            )}

                            <div
                              className="cursor-pointer"
                              onClick={() => setExpandedId(isExpanded ? null : item.id)}
                            >
                              <p className={`text-xs text-[#94a3b8] ${isExpanded ? "" : "line-clamp-2"}`}>
                                {item.content}
                              </p>
                              <span className="text-[10px] text-[#475569] flex items-center gap-1 mt-1">
                                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                {isExpanded ? "Show less" : "Show more"}
                              </span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <p className="text-[10px] text-[#475569]">
                              {new Date(item.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
