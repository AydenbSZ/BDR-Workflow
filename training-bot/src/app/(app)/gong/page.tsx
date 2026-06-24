"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  RefreshCw,
  Headphones,
  ExternalLink,
  Link2,
  Upload,
  FileText,
} from "lucide-react";

interface GongCall {
  id: string;
  gongCallId: string;
  title: string | null;
  url: string | null;
  callType: "DISCOVERY" | "DEMO";
  callTypeConfidence: string | null;
  durationSec: number | null;
  callDate: string | null;
  participantsJson: { name: string | null; affiliation: string | null }[] | null;
  transcriptStatus: string;
  approved: boolean;
  excluded?: boolean;
}

interface SyncResult {
  callsFound: number;
  callsImported: number;
  callsSkipped: number;
  errors: number;
  byType: { DISCOVERY: number; DEMO: number };
}

export default function GongPage() {
  const [calls, setCalls] = useState<GongCall[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [filter, setFilter] = useState<"ALL" | "DISCOVERY" | "DEMO">("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [maxCalls, setMaxCalls] = useState("50");

  // Manual import (links / paste / drag-drop)
  const [links, setLinks] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteType, setPasteType] = useState("AUTO");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const fetchCalls = useCallback(async () => {
    setLoading(true);
    try {
      const q = filter === "ALL" ? "" : `?callType=${filter}`;
      const res = await fetch(`/api/gong/calls${q}`);
      const data = await res.json();
      if (Array.isArray(data.calls)) setCalls(data.calls);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  async function runSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const body: Record<string, unknown> = { maxCalls: parseInt(maxCalls, 10) };
      if (dateFrom) body.fromDateTime = new Date(dateFrom).toISOString();
      const res = await fetch("/api/gong/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else {
        setSyncResult(data);
        fetchCalls();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  function summarize(data: {
    callsImported?: number;
    callsSkipped?: number;
    errors?: number;
    details?: { status: string; title: string | null }[];
  }): string {
    const parts: string[] = [];
    if (data.callsImported) parts.push(`${data.callsImported} imported`);
    if (data.callsSkipped) parts.push(`${data.callsSkipped} skipped`);
    if (data.errors) parts.push(`${data.errors} error(s)`);
    const errDetail = data.details?.find((d) => /error|not found|short/i.test(d.status));
    let msg = parts.join(" · ") || "Nothing imported";
    if (errDetail) msg += ` — ${errDetail.status}`;
    return msg;
  }

  async function importLinks() {
    if (!links.trim()) return;
    setImporting(true);
    setImportMsg(null);
    try {
      const res = await fetch("/api/gong/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ links }),
      });
      const data = await res.json();
      if (data.error) setImportMsg(data.error);
      else {
        setImportMsg(summarize(data));
        setLinks("");
        fetchCalls();
      }
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  async function importPaste() {
    if (!pasteText.trim()) return;
    setImporting(true);
    setImportMsg(null);
    try {
      const res = await fetch("/api/gong/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: pasteText,
          title: pasteTitle || undefined,
          callType: pasteType === "AUTO" ? undefined : pasteType,
        }),
      });
      const data = await res.json();
      if (data.error) setImportMsg(data.error);
      else {
        setImportMsg(summarize(data));
        setPasteText("");
        setPasteTitle("");
        fetchCalls();
      }
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  async function importFiles(files: FileList | File[]) {
    setImporting(true);
    setImportMsg(null);
    let imported = 0;
    let failed = 0;
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        if (pasteType !== "AUTO") form.append("callType", pasteType);
        const res = await fetch("/api/gong/import", { method: "POST", body: form });
        const data = await res.json();
        if (data.error || data.errors) failed++;
        else imported += data.callsImported || 0;
      }
      setImportMsg(`${imported} imported${failed ? ` · ${failed} failed` : ""}`);
      fetchCalls();
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setImporting(false);
    }
  }

  async function updateCall(id: string, patch: Partial<GongCall>) {
    if (patch.excluded) {
      setCalls((prev) => prev.filter((c) => c.id !== id));
    } else {
      setCalls((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    }
    await fetch("/api/gong/calls", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    }).catch(() => {});
  }

  const discoveryCount = calls.filter((c) => c.callType === "DISCOVERY").length;
  const demoCount = calls.filter((c) => c.callType === "DEMO").length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg sz-gradient-bg flex items-center justify-center">
          <Headphones className="h-5 w-5 text-[#0b1120]" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Gong Calls</h1>
          <p className="text-muted-foreground">
            Sync real Discovery and Demo calls. These become the benchmark for AE
            scoring and shape how the AI prospect behaves.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sync from Gong</CardTitle>
          <CardDescription>
            Pulls recent calls, transcribes, and auto-classifies them as Discovery
            or Demo. Requires GONG_ACCESS_KEY and GONG_ACCESS_KEY_SECRET in .env.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Pull calls since (optional)</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Defaults to the last 90 days.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Max calls</Label>
              <Input
                type="number"
                min={1}
                max={200}
                value={maxCalls}
                onChange={(e) => setMaxCalls(e.target.value)}
              />
            </div>
          </div>
          <Button onClick={runSync} disabled={syncing}>
            {syncing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {syncing ? "Syncing..." : "Sync Gong Calls"}
          </Button>

          {syncResult && (
            <div className="flex flex-wrap gap-2 pt-2">
              <Badge variant="outline">Found: {syncResult.callsFound}</Badge>
              <Badge className="bg-green-600 text-white">
                Imported: {syncResult.callsImported}
              </Badge>
              <Badge variant="secondary">Skipped: {syncResult.callsSkipped}</Badge>
              <Badge variant="outline">
                Discovery: {syncResult.byType.DISCOVERY}
              </Badge>
              <Badge variant="outline">Demo: {syncResult.byType.DEMO}</Badge>
              {syncResult.errors > 0 && (
                <Badge variant="destructive">Errors: {syncResult.errors}</Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Import Specific Calls</CardTitle>
          <CardDescription>
            Paste Gong call links or IDs to pull exact calls, or drop in a
            transcript file / paste text directly.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Paste links / IDs */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Link2 className="h-4 w-4" /> Gong call links or IDs
            </Label>
            <textarea
              value={links}
              onChange={(e) => setLinks(e.target.value)}
              placeholder={"https://us-1234.app.gong.io/call?id=7894572938745\n7894572938745"}
              rows={3}
              className="w-full rounded-md border bg-transparent p-3 text-sm font-mono"
            />
            <div className="flex items-center gap-3">
              <Button onClick={importLinks} disabled={importing || !links.trim()}>
                {importing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4 mr-2" />
                )}
                Pull These Calls
              </Button>
              <p className="text-xs text-muted-foreground">
                One per line or comma-separated. Uses the Gong API.
              </p>
            </div>
          </div>

          <div className="border-t" />

          {/* Drag & drop / paste transcript */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> Or drop a transcript file / paste text
            </Label>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files?.length) importFiles(e.dataTransfer.files);
              }}
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
                dragOver ? "border-[#00d4ff] bg-[#00d4ff]/10" : "border-muted"
              }`}
            >
              <Upload className="h-6 w-6 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Drag a .txt or .docx transcript here, or{" "}
                <label className="text-[#00d4ff] cursor-pointer underline">
                  browse
                  <input
                    type="file"
                    accept=".txt,.docx,.md,.vtt"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.length) importFiles(e.target.files);
                    }}
                  />
                </label>
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                value={pasteTitle}
                onChange={(e) => setPasteTitle(e.target.value)}
                placeholder="Title (optional)"
              />
              <Select value={pasteType} onValueChange={(v) => v && setPasteType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AUTO">Auto-detect type</SelectItem>
                  <SelectItem value="DISCOVERY">Discovery</SelectItem>
                  <SelectItem value="DEMO">Demo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste a call transcript here..."
              rows={4}
              className="w-full rounded-md border bg-transparent p-3 text-sm"
            />
            <Button
              variant="outline"
              onClick={importPaste}
              disabled={importing || !pasteText.trim()}
            >
              {importing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileText className="h-4 w-4 mr-2" />
              )}
              Import Pasted Transcript
            </Button>
          </div>

          {importMsg && (
            <div className="rounded-md border border-[#00d4ff]/30 bg-[#00d4ff]/5 px-3 py-2 text-sm">
              {importMsg}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Synced Calls</CardTitle>
              <CardDescription>
                {discoveryCount} discovery · {demoCount} demo shown
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {(["ALL", "DISCOVERY", "DEMO"] as const).map((f) => (
                <Button
                  key={f}
                  variant={filter === f ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter(f)}
                >
                  {f === "ALL" ? "All" : f === "DISCOVERY" ? "Discovery" : "Demo"}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : calls.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No calls synced yet. Run a sync above to pull calls from Gong.
            </p>
          ) : (
            <div className="space-y-2">
              {calls.map((call) => (
                <div
                  key={call.id}
                  className="flex items-center justify-between gap-4 rounded-lg border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">
                        {call.title || "Untitled call"}
                      </span>
                      {call.url && (
                        <a
                          href={call.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                      {call.callDate && (
                        <span>{new Date(call.callDate).toLocaleDateString()}</span>
                      )}
                      {call.durationSec != null && (
                        <span>· {Math.round(call.durationSec / 60)} min</span>
                      )}
                      {call.callTypeConfidence && (
                        <span>· {call.callTypeConfidence} confidence</span>
                      )}
                      {call.transcriptStatus !== "AVAILABLE" && (
                        <span className="text-amber-500">
                          · {call.transcriptStatus.toLowerCase()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant={call.callType === "DISCOVERY" ? "default" : "outline"}
                      size="sm"
                      onClick={() => updateCall(call.id, { callType: "DISCOVERY" })}
                    >
                      Discovery
                    </Button>
                    <Button
                      variant={call.callType === "DEMO" ? "default" : "outline"}
                      size="sm"
                      onClick={() => updateCall(call.id, { callType: "DEMO" })}
                    >
                      Demo
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={() => updateCall(call.id, { excluded: true })}
                      title="Exclude from training"
                    >
                      Exclude
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
