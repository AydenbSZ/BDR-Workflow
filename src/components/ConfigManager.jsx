import { useState, useEffect } from "react";
import { Save, Plus, Trash2, Loader2, FileText, Users as UsersIcon, BookOpen } from "lucide-react";

export default function ConfigManager() {
  const [activeSection, setActiveSection] = useState("rules");
  const [rules, setRules] = useState("");
  const [clients, setClients] = useState("");
  const [examples, setExamples] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newFilename, setNewFilename] = useState("");

  useEffect(() => {
    fetch("/api/config/rules").then(r => r.json()).then(d => setRules(d.content || "")).catch(() => {});
    fetch("/api/config/clients").then(r => r.json()).then(d => setClients(d.content || "")).catch(() => {});
    fetch("/api/config/examples").then(r => r.json()).then(d => setExamples(d || [])).catch(() => {});
  }, []);

  const save = async (type, content) => {
    setSaving(true);
    await fetch(`/api/config/${type}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }),
    });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const saveExample = async (filename, content) => {
    await fetch(`/api/config/examples/${encodeURIComponent(filename)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }),
    });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const deleteExample = async (filename) => {
    await fetch(`/api/config/examples/${encodeURIComponent(filename)}`, { method: "DELETE" });
    setExamples(prev => prev.filter(e => e.filename !== filename));
  };

  const addExample = () => {
    const name = newFilename.trim() || `example_${Date.now()}.txt`;
    const filename = name.endsWith(".txt") || name.endsWith(".md") ? name : `${name}.txt`;
    setExamples(prev => [...prev, { filename, content: "" }]);
    setNewFilename("");
  };

  const sections = [
    { id: "rules", label: "Writing Rules", icon: FileText },
    { id: "examples", label: "Example Emails", icon: BookOpen },
    { id: "clients", label: "Current Clients", icon: UsersIcon },
  ];

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>Settings</h2>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Manage writing rules, example emails, and current client list for email generation
        </p>
      </div>

      {/* Section tabs */}
      <div className="flex gap-2 mb-6">
        {sections.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer ${
              activeSection === s.id ? "btn-primary" : "btn-secondary"
            }`}>
            <s.icon size={16} /> {s.label}
          </button>
        ))}
      </div>

      {saved && (
        <div className="mb-4 px-4 py-2.5 rounded-xl text-sm font-medium" style={{ background: "rgba(34, 197, 94, 0.1)", color: "var(--green)", border: "1px solid rgba(34, 197, 94, 0.2)" }}>
          Saved successfully!
        </div>
      )}

      {/* Rules */}
      {activeSection === "rules" && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <label className="font-medium" style={{ color: "var(--text-primary)" }}>Writing Rules (rules.md)</label>
            <button onClick={() => save("rules", rules)} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm btn-primary">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
            </button>
          </div>
          <textarea value={rules} onChange={(e) => setRules(e.target.value)} rows={18}
            className="w-full px-4 py-3 text-sm font-mono resize-y input-dark" style={{ borderRadius: 10 }} />
        </div>
      )}

      {/* Examples */}
      {activeSection === "examples" && (
        <div className="space-y-4">
          {examples.map((ex, i) => (
            <div key={ex.filename} className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{ex.filename}</span>
                <div className="flex gap-2">
                  <button onClick={() => saveExample(ex.filename, ex.content)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium btn-secondary">
                    <Save size={12} /> Save
                  </button>
                  <button onClick={() => deleteExample(ex.filename)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
                    style={{ background: "rgba(255,82,82,0.1)", color: "var(--red)", border: "1px solid rgba(255,82,82,0.2)" }}>
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </div>
              <textarea value={ex.content}
                onChange={(e) => { const val = e.target.value; setExamples(prev => prev.map((item, idx) => idx === i ? { ...item, content: val } : item)); }}
                rows={8} className="w-full px-4 py-3 text-sm font-mono resize-y input-dark" style={{ borderRadius: 10 }} />
            </div>
          ))}
          <div className="flex gap-2">
            <input type="text" value={newFilename} onChange={(e) => setNewFilename(e.target.value)}
              placeholder="new_example.txt" className="flex-1 px-3 py-2 text-sm input-dark" />
            <button onClick={addExample} className="flex items-center gap-1.5 px-4 py-2 text-sm btn-secondary">
              <Plus size={14} /> Add Example
            </button>
          </div>
        </div>
      )}

      {/* Clients */}
      {activeSection === "clients" && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <label className="font-medium" style={{ color: "var(--text-primary)" }}>Current Clients (current_clients.md)</label>
            <button onClick={() => save("clients", clients)} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm btn-primary">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
            </button>
          </div>
          <textarea value={clients} onChange={(e) => setClients(e.target.value)} rows={18}
            className="w-full px-4 py-3 text-sm font-mono resize-y input-dark" style={{ borderRadius: 10 }} />
        </div>
      )}
    </div>
  );
}
