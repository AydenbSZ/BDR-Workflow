"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Save, Loader2, Plus, X } from "lucide-react";

interface RuleSet {
  id: string;
  name: string;
  rubricJson: Record<string, { label: string; max: number }> | null;
  requiredKeywordsJson: string[] | null;
  bannedPhrasesJson: string[] | null;
  objectionRulesJson: Array<{
    name: string;
    triggerKeywords: string[];
    preferredStrategy: string;
    strongExample: string;
    weakExample: string;
  }> | null;
}

const DEFAULT_RUBRIC: Record<string, { label: string; max: number }> = {
  opener: { label: "Opener and permission/clarity", max: 10 },
  personaRelevance: { label: "Persona relevance", max: 15 },
  valueProposition: { label: "SiteZeus value proposition", max: 15 },
  discovery: { label: "Discovery question quality", max: 10 },
  objectionHandling: { label: "Objection handling", max: 20 },
  meetingAsk: { label: "Meeting ask / close", max: 15 },
  conversationalControl: { label: "Conversational control and brevity", max: 10 },
  professionalismCompliance: { label: "Professionalism/compliance", max: 5 },
};

export default function RulesPage() {
  const [rules, setRules] = useState<RuleSet | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rubric, setRubric] = useState(DEFAULT_RUBRIC);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [bannedPhrases, setBannedPhrases] = useState<string[]>([]);
  const [objections, setObjections] = useState<Array<{
    name: string;
    triggerKeywords: string[];
    preferredStrategy: string;
    strongExample: string;
    weakExample: string;
  }>>([]);
  const [newKeyword, setNewKeyword] = useState("");
  const [newBanned, setNewBanned] = useState("");

  useEffect(() => {
    fetch("/api/rules")
      .then((r) => r.json())
      .then((data) => {
        if (data) {
          setRules(data);
          if (data.rubricJson) setRubric(data.rubricJson);
          if (data.requiredKeywordsJson) setKeywords(data.requiredKeywordsJson);
          if (data.bannedPhrasesJson) setBannedPhrases(data.bannedPhrasesJson);
          if (data.objectionRulesJson) setObjections(data.objectionRulesJson);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: rules?.id,
          name: rules?.name || "Default Rules",
          rubricJson: rubric,
          requiredKeywordsJson: keywords,
          bannedPhrasesJson: bannedPhrases,
          objectionRulesJson: objections,
        }),
      });
      const data = await res.json();
      if (data.error) alert(data.error);
      else setRules(data);
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
          <h1 className="text-3xl font-bold">Scoring Rules</h1>
          <p className="text-muted-foreground mt-1">
            Configure how practice calls are scored
          </p>
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Rules
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Scoring Rubric</CardTitle>
          <CardDescription>Points allocation per category (total should be 100)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(rubric).map(([key, val]) => (
              <div key={key} className="flex items-center gap-4">
                <Label className="w-64 text-sm">{val.label}</Label>
                <Input
                  type="number"
                  className="w-24"
                  value={val.max}
                  onChange={(e) =>
                    setRubric((prev) => ({
                      ...prev,
                      [key]: { ...prev[key], max: parseInt(e.target.value, 10) || 0 },
                    }))
                  }
                />
                <span className="text-sm text-muted-foreground">points</span>
              </div>
            ))}
            <Separator />
            <div className="flex items-center gap-4">
              <Label className="w-64 text-sm font-bold">Total</Label>
              <span className="font-bold">
                {Object.values(rubric).reduce((sum, v) => sum + v.max, 0)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Positive Keywords / Phrases</CardTitle>
          <CardDescription>Keywords that should appear in good calls</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-3">
            {keywords.map((k, i) => (
              <Badge key={i} variant="secondary" className="gap-1">
                {k}
                <button onClick={() => setKeywords((prev) => prev.filter((_, j) => j !== i))}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              placeholder="Add keyword..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && newKeyword.trim()) {
                  setKeywords((prev) => [...prev, newKeyword.trim()]);
                  setNewKeyword("");
                }
              }}
            />
            <Button
              variant="outline"
              onClick={() => {
                if (newKeyword.trim()) {
                  setKeywords((prev) => [...prev, newKeyword.trim()]);
                  setNewKeyword("");
                }
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Caution / Banned Phrases</CardTitle>
          <CardDescription>Phrases flagged in feedback (not auto-fail)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-3">
            {bannedPhrases.map((p, i) => (
              <Badge key={i} variant="destructive" className="gap-1">
                {p}
                <button onClick={() => setBannedPhrases((prev) => prev.filter((_, j) => j !== i))}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newBanned}
              onChange={(e) => setNewBanned(e.target.value)}
              placeholder="Add phrase..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && newBanned.trim()) {
                  setBannedPhrases((prev) => [...prev, newBanned.trim()]);
                  setNewBanned("");
                }
              }}
            />
            <Button
              variant="outline"
              onClick={() => {
                if (newBanned.trim()) {
                  setBannedPhrases((prev) => [...prev, newBanned.trim()]);
                  setNewBanned("");
                }
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Objection Rules</CardTitle>
              <CardDescription>Define objection handling guidance</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setObjections((prev) => [
                  ...prev,
                  {
                    name: "",
                    triggerKeywords: [],
                    preferredStrategy: "",
                    strongExample: "",
                    weakExample: "",
                  },
                ])
              }
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Objection
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {objections.map((obj, i) => (
              <div key={i} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Input
                    value={obj.name}
                    onChange={(e) =>
                      setObjections((prev) =>
                        prev.map((o, j) =>
                          j === i ? { ...o, name: e.target.value } : o
                        )
                      )
                    }
                    placeholder="Objection name"
                    className="font-medium"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setObjections((prev) => prev.filter((_, j) => j !== i))
                    }
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Preferred Strategy</Label>
                  <Textarea
                    value={obj.preferredStrategy}
                    onChange={(e) =>
                      setObjections((prev) =>
                        prev.map((o, j) =>
                          j === i
                            ? { ...o, preferredStrategy: e.target.value }
                            : o
                        )
                      )
                    }
                    rows={2}
                    placeholder="How to handle this objection..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Strong Example</Label>
                    <Textarea
                      value={obj.strongExample}
                      onChange={(e) =>
                        setObjections((prev) =>
                          prev.map((o, j) =>
                            j === i ? { ...o, strongExample: e.target.value } : o
                          )
                        )
                      }
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Weak Example</Label>
                    <Textarea
                      value={obj.weakExample}
                      onChange={(e) =>
                        setObjections((prev) =>
                          prev.map((o, j) =>
                            j === i ? { ...o, weakExample: e.target.value } : o
                          )
                        )
                      }
                      rows={2}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
