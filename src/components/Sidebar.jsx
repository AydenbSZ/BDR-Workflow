import {
  LayoutDashboard,
  Mail,
  Users,
  Zap,
  Settings,
} from "lucide-react";

const ICONS = {
  dashboard: LayoutDashboard,
  emails: Mail,
  enroller: Users,
  triggers: Zap,
  config: Settings,
};

export default function Sidebar({ tabs, activeTab, onTabChange }) {
  return (
    <aside
      className="w-64 flex flex-col shrink-0 relative z-20"
      style={{
        background: "linear-gradient(180deg, #0d0a25 0%, #130e35 100%)",
        borderRight: "1px solid rgba(139, 92, 246, 0.15)",
      }}
    >
      {/* Logo */}
      <div className="px-6 py-6">
        <div className="flex items-center gap-3">
          {/* Animated logo mark */}
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center glow-pulse"
            style={{ background: "var(--gradient-brand)" }}
          >
            <Zap size={18} color="#0a0820" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">
              <span style={{ color: "var(--cyan)" }}>SiteZeus</span>{" "}
              <span style={{ color: "var(--text-primary)" }}>Outreach</span>
            </h1>
          </div>
        </div>
        {/* Rainbow line */}
        <div className="rainbow-line mt-4 rounded-full" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 px-3 space-y-1">
        {tabs.map((tab) => {
          const Icon = ICONS[tab.id] || LayoutDashboard;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                isActive
                  ? "sidebar-active"
                  : "hover:bg-white/5"
              }`}
              style={!isActive ? { color: "var(--text-secondary)" } : undefined}
            >
              <Icon size={18} />
              {tab.label}
              {isActive && (
                <div
                  className="ml-auto w-1.5 h-1.5 rounded-full"
                  style={{ background: "#0a0820" }}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div
        className="px-6 py-4"
        style={{ borderTop: "1px solid rgba(139, 92, 246, 0.1)" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: "var(--green)", boxShadow: "0 0 8px rgba(34, 197, 94, 0.5)" }}
          />
          <span style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>
            Platform Active
          </span>
        </div>
      </div>
    </aside>
  );
}
