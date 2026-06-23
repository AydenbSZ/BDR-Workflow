import { useState } from "react";
import AnimatedBackground from "./components/AnimatedBackground.jsx";
import Sidebar from "./components/Sidebar.jsx";
import Dashboard from "./components/Dashboard.jsx";
import EmailGenerator from "./components/EmailGenerator.jsx";
import SequenceEnroller from "./components/SequenceEnroller.jsx";
import TriggerEvents from "./components/TriggerEvents.jsx";
import ConfigManager from "./components/ConfigManager.jsx";

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "emails", label: "Email Generator" },
  { id: "enroller", label: "Sequence Enroller" },
  { id: "triggers", label: "Trigger Events" },
  { id: "config", label: "Settings" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-deepest)" }}>
      <AnimatedBackground />
      <Sidebar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1 overflow-y-auto relative z-10">
        {activeTab === "dashboard" && <Dashboard />}
        {activeTab === "emails" && <EmailGenerator />}
        {activeTab === "enroller" && <SequenceEnroller />}
        {activeTab === "triggers" && <TriggerEvents />}
        {activeTab === "config" && <ConfigManager />}
      </main>
    </div>
  );
}
