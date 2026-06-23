import { useState } from "react";
import { Search, Loader2, Check, X, Users, ChevronDown } from "lucide-react";

const TITLE_OPTIONS = [
  "VP of Real Estate", "SVP of Real Estate", "Head of Real Estate", "Director of Real Estate",
  "Director of Site Selection", "Head of Site Selection", "VP of Development", "Director of Development",
  "Chief Development Officer", "CDO", "Real Estate Manager", "Real Estate Strategy Manager",
  "Chief Growth Officer (CGO)", "VP of Growth", "Head of Growth", "VP of Strategy",
  "Director of Strategy", "Head of Strategic Planning", "VP of Market Planning",
  "Director of Market Planning", "VP of Expansion", "Director of Expansion",
];

export default function SequenceEnroller() {
  const [selectedTitles, setSelectedTitles] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [selectedContacts, setSelectedContacts] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollResults, setEnrollResults] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showTitleDropdown, setShowTitleDropdown] = useState(false);

  const toggleTitle = (title) => {
    setSelectedTitles((prev) => prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title]);
  };

  const findContacts = async () => {
    if (!selectedTitles.length) return;
    setLoading(true); setContacts([]); setSelectedContacts(new Set()); setEnrollResults(null);
    try {
      const res = await fetch("/api/enrollment/find-contacts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedTitles }),
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
    setShowConfirm(false); setEnrolling(true);
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
        <h2 className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>Sequence Enroller</h2>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Find contacts by title and enroll them into the HubSpot outreach sequence
        </p>
      </div>

      {/* Title selector */}
      <div className="card p-5 mb-6">
        <label className="text-sm font-medium block mb-3" style={{ color: "var(--text-secondary)" }}>Select Title Categories</label>
        <div className="relative mb-3">
          <button onClick={() => setShowTitleDropdown(!showTitleDropdown)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-sm cursor-pointer input-dark">
            <span style={{ color: selectedTitles.length ? "var(--text-primary)" : "var(--text-muted)" }}>
              {selectedTitles.length ? `${selectedTitles.length} title(s) selected` : "Choose titles..."}
            </span>
            <ChevronDown size={16} className={`transition ${showTitleDropdown ? "rotate-180" : ""}`} style={{ color: "var(--text-muted)" }} />
          </button>

          {showTitleDropdown && (
            <div className="absolute z-10 mt-1 w-full rounded-xl max-h-64 overflow-y-auto"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", boxShadow: "0 10px 40px rgba(0,0,0,0.4)" }}>
              {TITLE_OPTIONS.map((title) => (
                <label key={title} className="flex items-center gap-2 px-4 py-2.5 cursor-pointer text-sm transition"
                  style={{ color: "var(--text-secondary)" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(139,92,246,0.08)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                  <input type="checkbox" checked={selectedTitles.includes(title)} onChange={() => toggleTitle(title)} />
                  {title}
                </label>
              ))}
            </div>
          )}
        </div>

        {selectedTitles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {selectedTitles.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium badge-cyan">
                {t}
                <X size={12} className="cursor-pointer opacity-70 hover:opacity-100" onClick={() => toggleTitle(t)} />
              </span>
            ))}
          </div>
        )}

        <button onClick={findContacts} disabled={!selectedTitles.length || loading}
          className="px-5 py-2.5 text-sm flex items-center gap-2 btn-primary">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          {loading ? "Searching..." : "Find Contacts"}
        </button>
      </div>

      {/* Results table */}
      {contacts.length > 0 && (
        <div className="card overflow-hidden mb-6">
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
            <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{contacts.length} contacts found</span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text-secondary)" }}>
                <input type="checkbox" checked={selectedContacts.size === contacts.length && contacts.length > 0} onChange={toggleAll} />
                Select All
              </label>
              {selectedContacts.size > 0 && (
                <button onClick={() => setShowConfirm(true)} disabled={enrolling}
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
                <tr><th className="px-5 py-3 w-10"></th><th className="px-5 py-3 text-left">Name</th><th className="px-5 py-3 text-left">Title</th><th className="px-5 py-3 text-left">Company</th><th className="px-5 py-3 text-left">Status</th></tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id}>
                    <td className="px-5 py-3"><input type="checkbox" checked={selectedContacts.has(c.id)} onChange={() => toggleContact(c.id)} /></td>
                    <td className="px-5 py-3 font-medium" style={{ color: "var(--text-primary)" }}>{c.name}</td>
                    <td className="px-5 py-3" style={{ color: "var(--text-secondary)" }}>{c.title}</td>
                    <td className="px-5 py-3" style={{ color: "var(--text-secondary)" }}>{c.company}</td>
                    <td className="px-5 py-3"><span className="badge badge-cyan">{c.status}</span></td>
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

      {/* Confirm modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="card p-6 max-w-md w-full mx-4" style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
            <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Confirm Enrollment</h3>
            <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
              Enroll <strong style={{ color: "var(--cyan)" }}>{selectedContacts.size}</strong> contact(s) into the HubSpot sequence?
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowConfirm(false)} className="px-4 py-2 text-sm btn-secondary">Cancel</button>
              <button onClick={enrollSelected} className="px-4 py-2 text-sm btn-primary">Enroll</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
