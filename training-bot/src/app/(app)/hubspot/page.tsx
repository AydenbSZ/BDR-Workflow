"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Loader2, RefreshCw, Check, Database, Users, Phone, Link2, Upload, FileText } from "lucide-react";

interface Owner {
  id: string;
  hubspotOwnerId: string;
  email: string;
  firstName: string;
  lastName: string;
  teamName: string | null;
  isCurrentBdr: boolean;
  archived: boolean;
}

interface Disposition {
  id: string;
  label: string;
  internalId: string;
  isSelected: boolean;
}

interface SyncResult {
  callsFound: number;
  callsImported: number;
  callsSkipped: number;
  withTranscript: number;
  withBodyOnly: number;
  withRecordingOnly: number;
  errors: number;
}

export default function HubSpotPage() {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [dispositions, setDispositions] = useState<Disposition[]>([]);
  const [loadingOwners, setLoadingOwners] = useState(false);
  const [loadingDispositions, setLoadingDispositions] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minDuration, setMinDuration] = useState("60");

  // Drop-a-link / paste-a-transcript import
  const [links, setLinks] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [pasteTitle, setPasteTitle] = useState("");
  const [meetingScheduled, setMeetingScheduled] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function summarizeImport(d: {
    imported?: number;
    skipped?: number;
    errors?: number;
    details?: { status: string }[];
  }): string {
    const parts: string[] = [];
    if (d.imported) parts.push(`${d.imported} imported`);
    if (d.skipped) parts.push(`${d.skipped} skipped`);
    if (d.errors) parts.push(`${d.errors} error(s)`);
    const err = d.details?.find((x) => /error|no usable/i.test(x.status));
    let msg = parts.join(" · ") || "Nothing imported";
    if (err) msg += ` — ${err.status}`;
    return msg;
  }

  async function importLinks() {
    if (!links.trim()) return;
    setImporting(true);
    setImportMsg(null);
    try {
      const res = await fetch("/api/hubspot/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ links }),
      });
      const data = await res.json();
      if (data.error) setImportMsg(data.error);
      else {
        setImportMsg(summarizeImport(data));
        setLinks("");
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
      const res = await fetch("/api/hubspot/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: pasteText, title: pasteTitle || undefined, meetingScheduled }),
      });
      const data = await res.json();
      if (data.error) setImportMsg(data.error);
      else {
        setImportMsg(summarizeImport(data));
        setPasteText("");
        setPasteTitle("");
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
        form.append("meetingScheduled", String(meetingScheduled));
        const res = await fetch("/api/hubspot/import", { method: "POST", body: form });
        const data = await res.json();
        if (data.error || data.errors) failed++;
        else imported += data.imported || 0;
      }
      setImportMsg(`${imported} imported${failed ? ` · ${failed} failed` : ""}`);
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setImporting(false);
    }
  }

  useEffect(() => {
    fetch("/api/hubspot/owners").then((r) => r.json()).then((d) => {
      if (Array.isArray(d)) setOwners(d);
    }).catch(() => {});
    fetch("/api/hubspot/dispositions").then((r) => r.json()).then((d) => {
      if (Array.isArray(d)) setDispositions(d);
    }).catch(() => {});
  }, []);

  async function fetchOwners() {
    setLoadingOwners(true);
    try {
      const res = await fetch("/api/hubspot/owners");
      const data = await res.json();
      if (Array.isArray(data)) setOwners(data);
      else if (data.error) alert(data.error);
    } finally {
      setLoadingOwners(false);
    }
  }

  async function fetchDispositions() {
    setLoadingDispositions(true);
    try {
      const res = await fetch("/api/hubspot/dispositions");
      const data = await res.json();
      if (Array.isArray(data)) setDispositions(data);
      else if (data.error) alert(data.error);
    } finally {
      setLoadingDispositions(false);
    }
  }

  async function toggleBdr(hubspotOwnerId: string, isCurrentBdr: boolean) {
    await fetch("/api/hubspot/owners", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hubspotOwnerId, isCurrentBdr: !isCurrentBdr }),
    });
    setOwners((prev) =>
      prev.map((o) =>
        o.hubspotOwnerId === hubspotOwnerId ? { ...o, isCurrentBdr: !isCurrentBdr } : o
      )
    );
  }

  async function selectDisposition(internalId: string) {
    await fetch("/api/hubspot/dispositions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ internalId }),
    });
    setDispositions((prev) =>
      prev.map((d) => ({ ...d, isSelected: d.internalId === internalId }))
    );
  }

  async function syncCalls() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const body: Record<string, unknown> = {
        minDurationMs: parseInt(minDuration, 10) * 1000,
      };
      if (dateFrom) body.dateFrom = new Date(dateFrom).toISOString();
      if (dateTo) body.dateTo = new Date(dateTo).toISOString();

      const res = await fetch("/api/hubspot/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) alert(data.error);
      else setSyncResult(data);
    } finally {
      setSyncing(false);
    }
  }

  const selectedDisp = dispositions.find((d) => d.isSelected);
  const selectedBdrs = owners.filter((o) => o.isCurrentBdr);
  const hasToken = true;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">HubSpot Sync</h1>
        <p className="text-muted-foreground mt-1">
          Import successful cold calls from HubSpot
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-[#00d4ff]" />
            Drop in a Call
          </CardTitle>
          <CardDescription>
            Paste the link to a HubSpot call (open the call record and copy the
            URL), or drop/paste the transcript. Great for studying your
            &ldquo;Meeting Scheduled&rdquo; calls.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Paste call links / IDs */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Link2 className="h-4 w-4" /> HubSpot call links or IDs
            </Label>
            <textarea
              value={links}
              onChange={(e) => setLinks(e.target.value)}
              placeholder={"https://app.hubspot.com/contacts/123456/record/0-48/7894572938745\n7894572938745"}
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
                One per line or comma-separated. Uses the HubSpot API (needs the
                calls read scope).
              </p>
            </div>
          </div>

          <div className="border-t" />

          {/* Drag/paste a transcript — works without API access */}
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
            <Input
              value={pasteTitle}
              onChange={(e) => setPasteTitle(e.target.value)}
              placeholder="Title (optional) — e.g. Firehouse Subs - Meeting Scheduled"
            />
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste the call transcript or notes here..."
              rows={4}
              className="w-full rounded-md border bg-transparent p-3 text-sm"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={meetingScheduled}
                onChange={(e) => setMeetingScheduled(e.target.checked)}
              />
              Tag as a &ldquo;Meeting Scheduled&rdquo; win
            </label>
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
              Import Transcript
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
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Connection Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Badge variant={hasToken ? "default" : "destructive"}>
              {hasToken ? "Connected (Token)" : "Not Connected"}
            </Badge>
            {selectedDisp && (
              <Badge variant="outline">
                Outcome: {selectedDisp.label}
              </Badge>
            )}
            <Badge variant="outline">{selectedBdrs.length} BDRs selected</Badge>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  BDR Owners
                </CardTitle>
                <CardDescription>Select which owners are current BDRs</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={fetchOwners} disabled={loadingOwners}>
                {loadingOwners ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {owners.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No owners loaded. Click refresh to fetch from HubSpot.
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {owners.filter((o) => !o.archived).map((owner) => (
                  <div
                    key={owner.id}
                    className="flex items-center justify-between p-2 rounded border"
                  >
                    <div>
                      <span className="text-sm font-medium">
                        {owner.firstName} {owner.lastName}
                      </span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {owner.email}
                      </span>
                    </div>
                    <Switch
                      checked={owner.isCurrentBdr}
                      onCheckedChange={() => toggleBdr(owner.hubspotOwnerId, owner.isCurrentBdr)}
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5" />
                  Call Dispositions
                </CardTitle>
                <CardDescription>Select the &quot;Meeting Scheduled&quot; outcome</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={fetchDispositions} disabled={loadingDispositions}>
                {loadingDispositions ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {dispositions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No dispositions loaded. Click refresh to fetch.
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {dispositions.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => selectDisposition(d.internalId)}
                    className={`w-full flex items-center justify-between p-2 rounded border text-left text-sm transition-colors ${
                      d.isSelected ? "border-primary bg-primary/10" : "hover:bg-accent"
                    }`}
                  >
                    <span>{d.label}</span>
                    {d.isSelected && <Check className="h-4 w-4 text-primary" />}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Import Calls</CardTitle>
          <CardDescription>
            Sync calls matching the selected outcome and BDR owners
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>From Date</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>To Date</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Min Duration (seconds)</Label>
              <Input type="number" value={minDuration} onChange={(e) => setMinDuration(e.target.value)} />
            </div>
          </div>

          <Button
            onClick={syncCalls}
            disabled={syncing || !selectedDisp || selectedBdrs.length === 0}
            className="w-full"
          >
            {syncing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Syncing calls...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Import Meeting Scheduled Calls
              </>
            )}
          </Button>

          {syncResult && (
            <>
              <Separator />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 rounded border text-center">
                  <div className="text-2xl font-bold">{syncResult.callsFound}</div>
                  <div className="text-xs text-muted-foreground">Found</div>
                </div>
                <div className="p-3 rounded border text-center">
                  <div className="text-2xl font-bold text-green-500">{syncResult.callsImported}</div>
                  <div className="text-xs text-muted-foreground">Imported</div>
                </div>
                <div className="p-3 rounded border text-center">
                  <div className="text-2xl font-bold">{syncResult.callsSkipped}</div>
                  <div className="text-xs text-muted-foreground">Skipped</div>
                </div>
                <div className="p-3 rounded border text-center">
                  <div className="text-2xl font-bold text-red-500">{syncResult.errors}</div>
                  <div className="text-xs text-muted-foreground">Errors</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="p-2 rounded border text-center text-sm">
                  <span className="font-medium">{syncResult.withTranscript}</span> with transcript
                </div>
                <div className="p-2 rounded border text-center text-sm">
                  <span className="font-medium">{syncResult.withBodyOnly}</span> body only
                </div>
                <div className="p-2 rounded border text-center text-sm">
                  <span className="font-medium">{syncResult.withRecordingOnly}</span> recording only
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
