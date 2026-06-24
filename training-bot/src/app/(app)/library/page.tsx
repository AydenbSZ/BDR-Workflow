"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Search, Check, X, Loader2 } from "lucide-react";

interface Doc {
  id: string;
  sourceType: string;
  title: string;
  content: string;
  persona: string | null;
  tags: string[];
  approved: boolean;
  excluded: boolean;
  createdAt: string;
  _count: { chunks: number };
  call?: { hubspotCallId: string; ownerName: string; associatedCompanyName: string } | null;
}

interface LibraryResponse {
  documents: Doc[];
  total: number;
  page: number;
  totalPages: number;
}

const SOURCE_LABELS: Record<string, string> = {
  HUBSPOT_CALL: "HubSpot Call",
  UPLOADED_DOC: "Uploaded Doc",
  MANUAL: "Manual",
  RULE: "Rule",
  COMPANY_CONTEXT: "Company Context",
};

export default function LibraryPage() {
  const [data, setData] = useState<LibraryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [personaFilter, setPersonaFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchDocs = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (search) params.set("search", search);
    if (sourceFilter !== "all") params.set("sourceType", sourceFilter);
    if (personaFilter !== "all") params.set("persona", personaFilter);

    fetch(`/api/training-library?${params}`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, sourceFilter, personaFilter, search]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", file.name);

    try {
      const res = await fetch("/api/training-library/upload", {
        method: "POST",
        body: formData,
      });
      const result = await res.json();
      if (result.error) alert(result.error);
      else fetchDocs();
    } catch {
      alert("Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function toggleApproval(id: string, approved: boolean) {
    await fetch("/api/training-library", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, approved: !approved }),
    });
    fetchDocs();
  }

  async function excludeDoc(id: string) {
    await fetch("/api/training-library", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, excluded: true }),
    });
    fetchDocs();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Training Library</h1>
          <p className="text-muted-foreground mt-1">
            Manage training documents and imported call data
          </p>
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".docx,.pdf,.txt,.md"
            className="hidden"
            onChange={handleUpload}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            {uploading ? "Uploading..." : "Upload Document"}
          </Button>
        </div>
      </div>

      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents..."
            onKeyDown={(e) => e.key === "Enter" && fetchDocs()}
          />
        </div>
        <Select value={sourceFilter} onValueChange={(v) => v && setSourceFilter(v)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="HUBSPOT_CALL">HubSpot Calls</SelectItem>
            <SelectItem value="UPLOADED_DOC">Uploaded Docs</SelectItem>
            <SelectItem value="MANUAL">Manual</SelectItem>
          </SelectContent>
        </Select>
        <Select value={personaFilter} onValueChange={(v) => v && setPersonaFilter(v)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Persona" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Personas</SelectItem>
            <SelectItem value="CHIEF_DEVELOPMENT_OFFICER">CDO</SelectItem>
            <SelectItem value="DIRECTOR_OF_REAL_ESTATE">Dir. Real Estate</SelectItem>
            <SelectItem value="DIRECTOR_OF_FRANCHISE_DEVELOPMENT">Dir. Franchise Dev</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={fetchDocs}>
          <Search className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : (
        <div className="space-y-3">
          {data?.documents.map((doc) => (
            <Card key={doc.id}>
              <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base">{doc.title}</CardTitle>
                    <Badge variant="outline">{SOURCE_LABELS[doc.sourceType]}</Badge>
                    {doc.persona && <Badge variant="outline">{doc.persona}</Badge>}
                    {doc.tags.map((t) => (
                      <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {doc._count.chunks} chunks
                    </span>
                    <Button
                      size="sm"
                      variant={doc.approved ? "default" : "outline"}
                      onClick={() => toggleApproval(doc.id, doc.approved)}
                    >
                      <Check className="h-3 w-3 mr-1" />
                      {doc.approved ? "Approved" : "Approve"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => excludeDoc(doc.id)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="py-2">
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {doc.content.slice(0, 300)}
                  {doc.content.length > 300 ? "..." : ""}
                </p>
              </CardContent>
            </Card>
          ))}

          {data && data.totalPages > 1 && (
            <div className="flex justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground self-center">
                Page {page} of {data.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
