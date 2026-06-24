"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Save, Loader2, Plus, X } from "lucide-react";

interface CompanyCtx {
  id: string;
  positioning: string | null;
  valuePropsJson: string[] | null;
  personasJson: Record<string, string> | null;
  competitorNotesJson: Record<string, string> | null;
  discoveryQuestionsJson: string[] | null;
  keywordsJson: string[] | null;
  cautionPhrasesJson: string[] | null;
  openersJson: Record<string, string> | null;
  closesJson: string[] | null;
  aiNotesJson: string[] | null;
}

export default function ContextPage() {
  const [ctx, setCtx] = useState<CompanyCtx | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [positioning, setPositioning] = useState("");
  const [valueProps, setValueProps] = useState<string[]>([]);
  const [discoveryQuestions, setDiscoveryQuestions] = useState<string[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [cautionPhrases, setCautionPhrases] = useState<string[]>([]);
  const [competitorNotes, setCompetitorNotes] = useState("");
  const [personaNotes, setPersonaNotes] = useState("");
  const [openers, setOpeners] = useState("");
  const [aiNotes, setAiNotes] = useState("");
  const [newVP, setNewVP] = useState("");
  const [newDQ, setNewDQ] = useState("");
  const [newKW, setNewKW] = useState("");
  const [newCP, setNewCP] = useState("");

  useEffect(() => {
    fetch("/api/company-context")
      .then((r) => r.json())
      .then((data) => {
        if (data) {
          setCtx(data);
          setPositioning(data.positioning || "");
          setValueProps(data.valuePropsJson || []);
          setDiscoveryQuestions(data.discoveryQuestionsJson || []);
          setKeywords(data.keywordsJson || []);
          setCautionPhrases(data.cautionPhrasesJson || []);
          setCompetitorNotes(
            typeof data.competitorNotesJson === "object"
              ? JSON.stringify(data.competitorNotesJson, null, 2)
              : ""
          );
          setPersonaNotes(
            typeof data.personasJson === "object"
              ? JSON.stringify(data.personasJson, null, 2)
              : ""
          );
          setOpeners(
            typeof data.openersJson === "object"
              ? JSON.stringify(data.openersJson, null, 2)
              : ""
          );
          setAiNotes(
            Array.isArray(data.aiNotesJson)
              ? data.aiNotesJson.join("\n")
              : ""
          );
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    try {
      let competitorNotesObj = null;
      let personasObj = null;
      let openersObj = null;
      try { competitorNotesObj = JSON.parse(competitorNotes); } catch { competitorNotesObj = { notes: competitorNotes }; }
      try { personasObj = JSON.parse(personaNotes); } catch { personasObj = { notes: personaNotes }; }
      try { openersObj = JSON.parse(openers); } catch { openersObj = { notes: openers }; }

      const res = await fetch("/api/company-context", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: ctx?.id,
          positioning,
          valuePropsJson: valueProps,
          personasJson: personasObj,
          competitorNotesJson: competitorNotesObj,
          discoveryQuestionsJson: discoveryQuestions,
          keywordsJson: keywords,
          cautionPhrasesJson: cautionPhrases,
          openersJson: openersObj,
          aiNotesJson: aiNotes.split("\n").filter(Boolean),
        }),
      });
      const data = await res.json();
      if (data.error) alert(data.error);
      else setCtx(data);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Company Context</h1>
          <p className="text-muted-foreground mt-1">
            SiteZeus positioning, personas, and AI guidance
          </p>
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Context
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Company Positioning</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={positioning}
            onChange={(e) => setPositioning(e.target.value)}
            rows={4}
            placeholder="Describe SiteZeus positioning..."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Value Propositions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 mb-3">
            {valueProps.map((v, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="flex-1 text-sm p-2 border rounded">{v}</span>
                <Button variant="ghost" size="sm" onClick={() => setValueProps((p) => p.filter((_, j) => j !== i))}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input value={newVP} onChange={(e) => setNewVP(e.target.value)} placeholder="Add value prop..."
              onKeyDown={(e) => { if (e.key === "Enter" && newVP.trim()) { setValueProps((p) => [...p, newVP.trim()]); setNewVP(""); } }} />
            <Button variant="outline" onClick={() => { if (newVP.trim()) { setValueProps((p) => [...p, newVP.trim()]); setNewVP(""); } }}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Discovery Questions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 mb-3">
            {discoveryQuestions.map((q, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="flex-1 text-sm p-2 border rounded">{q}</span>
                <Button variant="ghost" size="sm" onClick={() => setDiscoveryQuestions((p) => p.filter((_, j) => j !== i))}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input value={newDQ} onChange={(e) => setNewDQ(e.target.value)} placeholder="Add question..."
              onKeyDown={(e) => { if (e.key === "Enter" && newDQ.trim()) { setDiscoveryQuestions((p) => [...p, newDQ.trim()]); setNewDQ(""); } }} />
            <Button variant="outline" onClick={() => { if (newDQ.trim()) { setDiscoveryQuestions((p) => [...p, newDQ.trim()]); setNewDQ(""); } }}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Approved Keywords</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 mb-3">
              {keywords.map((k, i) => (
                <Badge key={i} variant="secondary" className="gap-1">
                  {k}
                  <button onClick={() => setKeywords((p) => p.filter((_, j) => j !== i))}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={newKW} onChange={(e) => setNewKW(e.target.value)} placeholder="Add keyword..."
                onKeyDown={(e) => { if (e.key === "Enter" && newKW.trim()) { setKeywords((p) => [...p, newKW.trim()]); setNewKW(""); } }} />
              <Button variant="outline" onClick={() => { if (newKW.trim()) { setKeywords((p) => [...p, newKW.trim()]); setNewKW(""); } }}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Caution Phrases</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 mb-3">
              {cautionPhrases.map((p, i) => (
                <Badge key={i} variant="destructive" className="gap-1">
                  {p}
                  <button onClick={() => setCautionPhrases((prev) => prev.filter((_, j) => j !== i))}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={newCP} onChange={(e) => setNewCP(e.target.value)} placeholder="Add phrase..."
                onKeyDown={(e) => { if (e.key === "Enter" && newCP.trim()) { setCautionPhrases((p) => [...p, newCP.trim()]); setNewCP(""); } }} />
              <Button variant="outline" onClick={() => { if (newCP.trim()) { setCautionPhrases((p) => [...p, newCP.trim()]); setNewCP(""); } }}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Persona Notes (JSON)</CardTitle>
          <CardDescription>Notes for each persona type</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea value={personaNotes} onChange={(e) => setPersonaNotes(e.target.value)} rows={6} className="font-mono text-xs" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Competitor Notes (JSON)</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea value={competitorNotes} onChange={(e) => setCompetitorNotes(e.target.value)} rows={6} className="font-mono text-xs" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Openers (JSON)</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea value={openers} onChange={(e) => setOpeners(e.target.value)} rows={4} className="font-mono text-xs" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI Roleplay Notes</CardTitle>
          <CardDescription>One note per line</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea value={aiNotes} onChange={(e) => setAiNotes(e.target.value)} rows={4} />
        </CardContent>
      </Card>
    </div>
  );
}
