import { useState, useEffect } from "react";
import { Zap, Loader2, Plus, X, Users, Check, Hash, AlertCircle, Radio } from "lucide-react";

export default function TriggerEvents() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [slackLoading, setSlackLoading] = useState(false);
  const [slackStatus, setSlackStatus] = useState(null);
  const [slackConfigured, setSlackConfigured] = useState(false);
  const [companies, setCompanies] = useState([{ name: "", event: "", source: "" }]);
  const [selectedContacts, setSelectedContacts] = useState(new Set());
  const [enrolling, setEnrolling] = useState(false);
  const [enrollResults, setEnrollResults] = useState(null);
  const [slackMessages, setSlackMessages] = useState("");
  const [showSlackPaste, setShowSlackPaste] = useState(false);

  useEffect(() => {
    fetch("/api/triggers").then((r) => r.json()).then((d) => setContacts(d.contacts || [])).catch(() => {});
    fetch("/api/triggers/slack-status").then((r) => r.json()).then((d) => setSlackConfigured(d.configured)).catch(() => {});
  }, []);

  const autoScanSlack = async () => {
    setSlackLoading(true); setSlackStatus(null);
    try {
      const res = await fetch("/api/triggers/auto-scan-slack", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.error) setSlackStatus({ error: data.error });
      else { setSlackStatus({ parsed: data.parsed, total: data.total, message: data.message }); if (data.contacts?.length) setContacts(data.contacts); }
    } catch { setSlackStatus({ error: "Failed to scan Slack channel" }); }
    setSlackLoading(false);
  };

  const scanSlackPaste = async () => {
    if (!slackMessages.trim()) return;
    setSlackLoading(true); setSlackStatus(null);
    try {
      const res = await fetch("/api/triggers/scan-slack", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [slackMessages] }),
      });
      const data = await res.json();
      if (data.error) setSlackStatus({ error: data.error });
      else { setSlackStatus({ parsed: data.parsed, total: data.total }); setContacts(data.contacts || []); if (data.total > 0) setShowSlackPaste(false); }
    } catch { setSlackStatus({ error: "Failed to scan Slack messages" }); }
    setSlackLoading(false);
  };

  const updateCompany = (i, field, value) => {
    setCompanies((prev) => { const next = [...prev]; next[i] = { ...next[i], [field]: value }; return next; });
  };
  const addCompany = () => setCompanies((prev) => [...prev, { name: "", event: "", source: "" }]);
  const removeCompany = (i) => setCompanies((prev) => prev.filter((_, idx) => idx !== i));

  const submitTriggers = async () => {
    const valid = companies.filter((c) => c.name.trim());
    if (!valid.length) return;
    setLoading(true); setEnrollResults(null);
    try {
      const res = await fetch("/api/triggers", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companies: valid }),
      });
      setContacts((await res.json()).contacts || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const toggleContact = (id) => {
    setSelectedContacts((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const toggleAll = () => {
    setSelectedContacts(selectedContacts.size === contacts.length ? new Set() : new Set(contacts.map((c) => c.id)));
  };

  const enrollSelected = async () => {
    setEnrolling(true);
    try {
      const res = await fetch("/api/enrollment/enroll", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: contacts.filter((c) => selectedContacts.has(c.id)) }),
      });
      setEnrollResults((await res.json()).results || []);
    } catch { /* ignore */ }
    setEnrolling(false);
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>Trigger Events</h2>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Enter company events (acquisitions, expansions, leadership changes) to find contacts for outreach
        </p>
      </div>

      {/* Slack scan section */}
      <div className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: "rgba(139, 92, 246, 0.15)" }}>
              <Hash size={14} style={{ color: "var(--purple-light)" }} />
            </div>
            <label className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Scan #sitezeus-scanner</label>
          </div>
          {slackConfigured && (
            <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--green)" }}>
              <Radio size={12} /> Slack Connected
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 mb-3">
          <button onClick={autoScanSlack} disabled={slackLoading || !slackConfigured}
            className="flex items-center gap-2 px-5 py-2.5 text-sm btn-purple">
            {slackLoading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
            {slackLoading ? "Scanning Slack..." : "Scan Today's Triggers"}
          </button>

          {!slackConfigured && (
            <span className="text-xs" style={{ color: "var(--amber)" }}>Add SLACK_BOT_TOKEN to .env to enable auto-scan</span>
          )}
          {slackStatus && !slackStatus.error && slackStatus.total > 0 && (
            <span className="text-sm font-medium" style={{ color: "var(--green)" }}>
              {slackStatus.parsed} companies &rarr; {slackStatus.total} contacts
            </span>
          )}
          {slackStatus?.message && !slackStatus.total && (
            <span className="text-sm" style={{ color: "var(--amber)" }}>{slackStatus.message}</span>
          )}
          {slackStatus?.error && (
            <span className="flex items-center gap-1 text-sm" style={{ color: "var(--red)" }}>
              <AlertCircle size={14} /> {slackStatus.error}
            </span>
          )}
        </div>

        {!slackConfigured && (
          <div style={{ borderTop: "1px solid var(--border)" }} className="pt-3 mt-3">
            <button onClick={() => setShowSlackPaste(!showSlackPaste)}
              className="text-xs cursor-pointer" style={{ color: "var(--text-muted)" }}>
              {showSlackPaste ? "Hide manual paste" : "Or paste Slack messages manually..."}
            </button>
            {showSlackPaste && (
              <>
                <textarea value={slackMessages} onChange={(e) => setSlackMessages(e.target.value)}
                  placeholder="Paste the daily scan message from #sitezeus-scanner here..." rows={6}
                  className="w-full px-3 py-2 text-sm font-mono mt-2 mb-3 input-dark" style={{ borderRadius: 10 }} />
                <button onClick={scanSlackPaste} disabled={slackLoading || !slackMessages.trim()}
                  className="flex items-center gap-2 px-4 py-2 text-sm btn-secondary">
                  {slackLoading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                  {slackLoading ? "Scanning..." : "Scan Pasted Message"}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Manual company events */}
      <div className="card p-5 mb-6">
        <label className="text-sm font-medium block mb-3" style={{ color: "var(--text-secondary)" }}>Manual Company Events</label>
        <div className="space-y-3">
          {companies.map((co, i) => (
            <div key={i} className="flex gap-2 items-start">
              <input type="text" value={co.name} onChange={(e) => updateCompany(i, "name", e.target.value)}
                placeholder="Company name" className="flex-1 px-3 py-2 text-sm input-dark" />
              <input type="text" value={co.event} onChange={(e) => updateCompany(i, "event", e.target.value)}
                placeholder="Event (e.g., expansion)" className="flex-1 px-3 py-2 text-sm input-dark" />
              <input type="text" value={co.source} onChange={(e) => updateCompany(i, "source", e.target.value)}
                placeholder="Source" className="w-40 px-3 py-2 text-sm input-dark" />
              {companies.length > 1 && (
                <button onClick={() => removeCompany(i)} className="p-2 cursor-pointer" style={{ color: "var(--text-muted)" }}>
                  <X size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-3 mt-4">
          <button onClick={addCompany} className="flex items-center gap-1.5 px-3 py-2 text-sm btn-secondary">
            <Plus size={14} /> Add Company
          </button>
          <button onClick={submitTriggers} disabled={loading || !companies.some((c) => c.name.trim())}
            className="flex items-center gap-2 px-5 py-2 text-sm btn-primary">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
            {loading ? "Searching..." : "Find Contacts"}
          </button>
        </div>
      </div>

      {/* Results table */}
      {contacts.length > 0 && (
        <div className="card overflow-hidden mb-6">
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
            <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{contacts.length} trigger contacts</span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text-secondary)" }}>
                <input type="checkbox" checked={selectedContacts.size === contacts.length && contacts.length > 0} onChange={toggleAll} />
                Select All
              </label>
              {selectedContacts.size > 0 && (
                <button onClick={enrollSelected} disabled={enrolling}
                  className="px-4 py-2 text-sm flex items-center gap-2 btn-primary">
                  {enrolling ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}
                  Enroll {selectedContacts.size}
                </button>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-dark">
              <thead>
                <tr>
                  <th className="px-5 py-3 w-10"></th><th className="px-5 py-3 text-left">Name</th>
                  <th className="px-5 py-3 text-left">Title</th><th className="px-5 py-3 text-left">Company</th>
                  <th className="px-5 py-3 text-left">Event</th><th className="px-5 py-3 text-left">Units</th>
                  <th className="px-5 py-3 text-left">State</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id}>
                    <td className="px-5 py-3"><input type="checkbox" checked={selectedContacts.has(c.id)} onChange={() => toggleContact(c.id)} /></td>
                    <td className="px-5 py-3 font-medium" style={{ color: "var(--text-primary)" }}>{c.name}</td>
                    <td className="px-5 py-3" style={{ color: "var(--text-secondary)" }}>{c.title}</td>
                    <td className="px-5 py-3" style={{ color: "var(--text-secondary)" }}>{c.company}</td>
                    <td className="px-5 py-3"><span className="badge badge-amber">{c.event || "—"}</span></td>
                    <td className="px-5 py-3" style={{ color: "var(--text-secondary)" }}>{c.unitCount || "—"}</td>
                    <td className="px-5 py-3" style={{ color: "var(--text-secondary)" }}>{c.state || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Enrollment results */}
      {enrollResults && (
        <div className="card p-5">
          <h3 className="font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Enrollment Results</h3>
          <div className="space-y-2">
            {enrollResults.map((r) => (
              <div key={r.id} className="flex items-center gap-3 py-2 text-sm">
                {r.status === "success" ? <Check size={16} style={{ color: "var(--green)" }} /> : <X size={16} style={{ color: "var(--red)" }} />}
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>{r.name}</span>
                {r.status === "failed" && <span className="text-xs ml-2" style={{ color: "var(--red)" }}>{r.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {contacts.length === 0 && !loading && (
        <div className="text-center py-16">
          <Zap size={48} className="mx-auto mb-4" style={{ color: "var(--text-muted)", opacity: 0.3 }} />
          <p style={{ color: "var(--text-muted)" }}>Enter company events above to find contacts for outreach</p>
        </div>
      )}
    </div>
  );
}
