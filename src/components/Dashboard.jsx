import { useState, useEffect } from "react";
import { Zap, Users, Clock, TrendingUp } from "lucide-react";

const STAT_CONFIGS = [
  { key: "enrolled", label: "Enrolled Today", icon: Users, gradient: "linear-gradient(135deg, #00e1ed, #0088ff)", iconBg: "rgba(0, 225, 237, 0.15)" },
  { key: "triggers", label: "Trigger Contacts", icon: Zap, gradient: "linear-gradient(135deg, #8b5cf6, #6d28d9)", iconBg: "rgba(139, 92, 246, 0.15)" },
  { key: "companies", label: "Unique Companies", icon: TrendingUp, gradient: "linear-gradient(135deg, #ec4899, #8b5cf6)", iconBg: "rgba(236, 72, 153, 0.15)" },
  { key: "ttd", label: "Avg Time-to-Dial", icon: Clock, gradient: "linear-gradient(135deg, #0088ff, #00e1ed)", iconBg: "rgba(0, 136, 255, 0.15)" },
];

export default function Dashboard() {
  const [enrollments, setEnrollments] = useState([]);
  const [triggerContacts, setTriggerContacts] = useState([]);

  useEffect(() => {
    fetch("/api/enrollment/enrolled-today").then(r => r.json()).then(d => setEnrollments(d.enrollments || [])).catch(() => {});
    fetch("/api/triggers").then(r => r.json()).then(d => setTriggerContacts(d.contacts || [])).catch(() => {});
  }, []);

  const statValues = {
    enrolled: enrollments.length,
    triggers: triggerContacts.length,
    companies: new Set(triggerContacts.map(c => c.company)).size,
    ttd: "4.7m",
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h2 className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>Dashboard</h2>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Today's outreach activity overview</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {STAT_CONFIGS.map((s) => (
          <div key={s.key} className="stat-card p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>{s.label}</span>
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: s.iconBg }}
              >
                <s.icon size={20} style={{ color: "var(--cyan)" }} />
              </div>
            </div>
            <p className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>
              {statValues[s.key]}
            </p>
            <div className="mt-3 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
              <div
                className="h-full rounded-full shimmer"
                style={{ width: "60%", background: s.gradient }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Activity Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Enrollments */}
        <div className="card p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: "rgba(0, 225, 237, 0.15)" }}>
              <Users size={14} style={{ color: "var(--cyan)" }} />
            </div>
            Recent Enrollments
          </h3>
          {enrollments.length === 0 ? (
            <div className="text-center py-8">
              <Users size={32} style={{ color: "var(--text-muted)", opacity: 0.3 }} className="mx-auto mb-2" />
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>No enrollments today</p>
            </div>
          ) : (
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {enrollments.slice(0, 15).map((e, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2.5 px-3 rounded-lg text-sm transition-colors"
                  style={{ color: "var(--text-primary)" }}
                  onMouseEnter={(ev) => ev.currentTarget.style.background = "rgba(139, 92, 246, 0.06)"}
                  onMouseLeave={(ev) => ev.currentTarget.style.background = "transparent"}
                >
                  <div>
                    <span className="font-medium">{e.name}</span>
                    <span className="ml-2" style={{ color: "var(--text-muted)" }}>{e.company}</span>
                  </div>
                  <span className="badge badge-cyan">{e.time?.slice(11, 16)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Trigger Events */}
        <div className="card p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: "rgba(139, 92, 246, 0.15)" }}>
              <Zap size={14} style={{ color: "var(--purple-light)" }} />
            </div>
            Today's Trigger Events
          </h3>
          {triggerContacts.length === 0 ? (
            <div className="text-center py-8">
              <Zap size={32} style={{ color: "var(--text-muted)", opacity: 0.3 }} className="mx-auto mb-2" />
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>No trigger events today</p>
            </div>
          ) : (
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {triggerContacts.slice(0, 15).map((c, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2.5 px-3 rounded-lg text-sm transition-colors"
                  style={{ color: "var(--text-primary)" }}
                  onMouseEnter={(ev) => ev.currentTarget.style.background = "rgba(139, 92, 246, 0.06)"}
                  onMouseLeave={(ev) => ev.currentTarget.style.background = "transparent"}
                >
                  <div>
                    <span className="font-medium">{c.name}</span>
                    <span className="ml-2" style={{ color: "var(--text-muted)" }}>{c.company}</span>
                  </div>
                  <span className="badge badge-amber">{c.event || "trigger"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
