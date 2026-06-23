import { useState, useRef } from "react";
import { Search, Loader2, Copy, Check, RefreshCw, ChevronDown, ChevronUp, X, Mail } from "lucide-react";

export default function EmailGenerator() {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [emailResults, setEmailResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [progress, setProgress] = useState({});
  const [copiedId, setCopiedId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [regenContext, setRegenContext] = useState({});
  const [regenLoading, setRegenLoading] = useState({});
  const [batchContext, setBatchContext] = useState("");
  const searchTimeout = useRef(null);

  const handleSearch = (value) => {
    setQuery(value);
    clearTimeout(searchTimeout.current);
    if (value.trim().length < 2) { setSearchResults([]); return; }
    searchTimeout.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/contacts/search?q=${encodeURIComponent(value.trim())}`);
        setSearchResults(await res.json());
      } catch { setSearchResults([]); }
      setSearchLoading(false);
    }, 400);
  };

  const toggleContact = (contact) => {
    setSelectedContacts((prev) => {
      if (prev.find((c) => c.id === contact.id)) return prev.filter((c) => c.id !== contact.id);
      if (prev.length >= 20) return prev;
      return [...prev, contact];
    });
  };

  const generateEmails = async () => {
    if (!selectedContacts.length) return;
    setLoading(true); setEmailResults([]); setProgress({});
    try {
      const res = await fetch("/api/emails/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_ids: selectedContacts.map((c) => c.id) }),
      });
      const { job_id } = await res.json();
      const evtSource = new EventSource(`/api/emails/stream/${job_id}`);
      evtSource.onmessage = (e) => {
        const event = JSON.parse(e.data);
        if (event.type === "progress") setProgress((p) => ({ ...p, [event.contact_id]: event.step }));
        else if (event.type === "result") setEmailResults((prev) => [...prev, event.result]);
        else if (event.type === "done") { evtSource.close(); setLoading(false); }
      };
      evtSource.onerror = () => { evtSource.close(); setLoading(false); };
    } catch { setLoading(false); }
  };

  const regenerate = async (contactId) => {
    setRegenLoading((p) => ({ ...p, [contactId]: true }));
    try {
      const res = await fetch("/api/emails/regenerate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: contactId, extra_context: regenContext[contactId] || "" }),
      });
      setEmailResults((prev) => prev.map((r) => (r.contact_id === contactId ? res.json() && r : r)));
      const result = await res.json();
      setEmailResults((prev) => prev.map((r) => (r.contact_id === contactId ? result : r)));
    } catch { /* ignore */ }
    setRegenLoading((p) => ({ ...p, [contactId]: false }));
  };

  const regenerateAll = async () => {
    if (!batchContext.trim()) return;
    for (const result of emailResults) {
      setRegenContext((p) => ({ ...p, [result.contact_id]: batchContext }));
      setRegenLoading((p) => ({ ...p, [result.contact_id]: true }));
      try {
        const res = await fetch("/api/emails/regenerate", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contact_id: result.contact_id, extra_context: batchContext }),
        });
        const updated = await res.json();
        setEmailResults((prev) => prev.map((r) => (r.contact_id === result.contact_id ? updated : r)));
      } catch { /* ignore */ }
      setRegenLoading((p) => ({ ...p, [result.contact_id]: false }));
    }
  };

  const copyEmail = async (result) => {
    await navigator.clipboard.writeText(`Subject: ${result.subject}\n\n${result.body}`);
    setCopiedId(result.contact_id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex h-full">
      {/* Left sidebar — search */}
      <div className="w-80 flex flex-col shrink-0" style={{ background: "var(--bg-dark)", borderRight: "1px solid var(--border)" }}>
        <div className="p-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <h3 className="font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Find Contacts</h3>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
            <input type="text" value={query} onChange={(e) => handleSearch(e.target.value)}
              placeholder="Name, company, or deal..." className="w-full pl-9 pr-3 py-2.5 text-sm input-dark" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {searchLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin" style={{ color: "var(--cyan)" }} />
            </div>
          )}
          {searchResults.map((c) => {
            const sel = selectedContacts.some((s) => s.id === c.id);
            return (
              <button key={c.id} onClick={() => toggleContact(c)}
                className="w-full text-left px-4 py-3 transition cursor-pointer"
                style={{
                  borderBottom: "1px solid var(--border)",
                  background: sel ? "rgba(0, 225, 237, 0.08)" : "transparent",
                  borderLeft: sel ? "3px solid var(--cyan)" : "3px solid transparent",
                }}
                onMouseEnter={(e) => { if (!sel) e.currentTarget.style.background = "rgba(139,92,246,0.06)"; }}
                onMouseLeave={(e) => { if (!sel) e.currentTarget.style.background = "transparent"; }}
              >
                <div className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>{c.name}</div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {c.job_title && <span>{c.job_title}</span>}
                  {c.company && <span> &middot; {c.company}</span>}
                </div>
              </button>
            );
          })}
        </div>

        {selectedContacts.length > 0 && (
          <div className="p-4" style={{ borderTop: "1px solid var(--border)", background: "var(--bg-card)" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>{selectedContacts.length} selected</span>
              <button onClick={() => setSelectedContacts([])} className="text-xs cursor-pointer" style={{ color: "var(--text-muted)" }}>Clear</button>
            </div>
            <button onClick={generateEmails} disabled={loading}
              className="w-full py-2.5 text-sm flex items-center justify-center gap-2 btn-primary">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
              {loading ? "Generating..." : "Generate Emails"}
            </button>
          </div>
        )}
      </div>

      {/* Right content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          <div className="mb-6">
            <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Email Generator</h2>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Search for contacts, select them, and generate personalized outreach emails</p>
          </div>

          {emailResults.length > 0 && (
            <div className="card p-4 mb-6">
              <label className="text-sm font-medium block mb-2" style={{ color: "var(--text-secondary)" }}>Batch Regenerate All</label>
              <div className="flex gap-2">
                <input type="text" value={batchContext} onChange={(e) => setBatchContext(e.target.value)}
                  placeholder="e.g., make it shorter, focus on franchise expansion..." className="flex-1 px-3 py-2 text-sm input-dark" />
                <button onClick={regenerateAll} className="px-4 py-2 text-sm flex items-center gap-1.5 btn-secondary">
                  <RefreshCw size={14} /> Regenerate All
                </button>
              </div>
            </div>
          )}

          {loading && Object.keys(progress).length > 0 && (
            <div className="mb-4 space-y-1">
              {Object.entries(progress).map(([cid, step]) => (
                <div key={cid} className="flex items-center gap-2 text-xs" style={{ color: "var(--cyan)" }}>
                  <Loader2 size={12} className="animate-spin" /><span>{step}</span>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-4">
            {emailResults.map((result) => (
              <div key={result.contact_id} className="card overflow-hidden">
                <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
                  <div>
                    <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{result.contact_name}</span>
                    <span className="text-sm ml-2" style={{ color: "var(--text-muted)" }}>{result.company_name}</span>
                    {result.job_title && <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>&middot; {result.job_title}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {result.status === "error" && <span className="badge badge-red">Error</span>}
                    <button onClick={() => copyEmail(result)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium btn-secondary">
                      {copiedId === result.contact_id ? <Check size={14} style={{ color: "var(--green)" }} /> : <Copy size={14} />}
                      {copiedId === result.contact_id ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>

                {result.status === "error" ? (
                  <div className="px-5 py-4 text-sm" style={{ color: "var(--red)" }}>{result.error_message}</div>
                ) : (
                  <>
                    <div className="px-5 py-3" style={{ background: "rgba(0,136,255,0.06)", borderBottom: "1px solid rgba(0,136,255,0.1)" }}>
                      <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--blue)" }}>Subject</span>
                      <div contentEditable suppressContentEditableWarning className="text-sm font-medium mt-1 content-editable rounded px-1" style={{ color: "var(--text-primary)" }}>{result.subject}</div>
                    </div>
                    <div className="px-5 py-4">
                      <div contentEditable suppressContentEditableWarning className="text-sm leading-relaxed whitespace-pre-wrap content-editable rounded px-1" style={{ color: "var(--text-secondary)" }}>{result.body}</div>
                    </div>

                    {result.intent_signals?.length > 0 && (
                      <div className="px-5 py-3" style={{ borderTop: "1px solid var(--border)" }}>
                        <button onClick={() => setExpandedId(expandedId === result.contact_id ? null : result.contact_id)}
                          className="flex items-center gap-1.5 text-xs font-medium cursor-pointer" style={{ color: "var(--text-muted)" }}>
                          {expandedId === result.contact_id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          {result.intent_signals.length} intent signal{result.intent_signals.length > 1 ? "s" : ""}
                        </button>
                        {expandedId === result.contact_id && (
                          <div className="mt-2 space-y-2">
                            {result.intent_signals.map((s, i) => (
                              <div key={i} className="text-xs">
                                <span className={`badge mr-2 ${s.type === "development" ? "badge-green" : "badge-purple"}`}>{s.type}</span>
                                <span style={{ color: "var(--text-secondary)" }}>{s.title}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="px-5 py-3 flex gap-2" style={{ borderTop: "1px solid var(--border)" }}>
                      <input type="text" value={regenContext[result.contact_id] || ""}
                        onChange={(e) => setRegenContext((p) => ({ ...p, [result.contact_id]: e.target.value }))}
                        placeholder="Add context for regeneration..." className="flex-1 px-3 py-1.5 text-xs input-dark" />
                      <button onClick={() => regenerate(result.contact_id)} disabled={regenLoading[result.contact_id]}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium btn-secondary disabled:opacity-50">
                        {regenLoading[result.contact_id] ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                        Regenerate
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {emailResults.length === 0 && !loading && (
            <div className="text-center py-16">
              <Mail size={48} className="mx-auto mb-4" style={{ color: "var(--text-muted)", opacity: 0.3 }} />
              <p style={{ color: "var(--text-muted)" }}>Search for contacts on the left, select them, and click "Generate Emails"</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
