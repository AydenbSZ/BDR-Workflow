"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Phone,
  BookOpen,
  Library,
  Link2,
  Headphones,
  Settings2,
  Building2,
  Shield,
  LogOut,
  Menu,
  X,
  Target,
  Send,
  Columns3,
  CalendarClock,
} from "lucide-react";
import { useState } from "react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["ADMIN", "MANAGER", "TRAINEE"] },
  { href: "/practice", label: "Practice Call", icon: Phone, roles: ["ADMIN", "MANAGER", "TRAINEE"] },
  { href: "/review", label: "Call Review", icon: BookOpen, roles: ["ADMIN", "MANAGER", "TRAINEE"] },
  { href: "/library", label: "Training Library", icon: Library, roles: ["ADMIN", "MANAGER"] },
  { href: "/hubspot", label: "HubSpot Sync", icon: Link2, roles: ["ADMIN", "MANAGER"] },
  { href: "/gong", label: "Gong Calls", icon: Headphones, roles: ["ADMIN", "MANAGER"] },
  { href: "/prospects", label: "Prospects", icon: Target, roles: ["ADMIN", "MANAGER", "TRAINEE"] },
  { href: "/outreach", label: "Outreach", icon: Send, roles: ["ADMIN", "MANAGER"] },
  { href: "/pipeline", label: "Pipeline", icon: Columns3, roles: ["ADMIN", "MANAGER", "TRAINEE"] },
  { href: "/briefing", label: "Daily Brief", icon: CalendarClock, roles: ["ADMIN", "MANAGER", "TRAINEE"] },
  { href: "/rules", label: "Rules", icon: Settings2, roles: ["ADMIN"] },
  { href: "/context", label: "Company Context", icon: Building2, roles: ["ADMIN"] },
  { href: "/admin", label: "Admin Settings", icon: Shield, roles: ["ADMIN"] },
];

export function Nav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!session?.user) return null;

  const role = (session.user as { role: string }).role;
  const filtered = NAV_ITEMS.filter((item) => item.roles.includes(role));

  return (
    <>
      <div className="md:hidden flex items-center justify-between p-4 border-b border-white/5 bg-[#0d1526]">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg sz-gradient-bg flex items-center justify-center">
            <span className="text-xs font-bold text-[#0b1120]">SZ</span>
          </div>
          <span className="font-bold text-sm">BDR Training</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 bg-[#0d1526] border-r border-white/5 flex flex-col transition-transform md:translate-x-0 md:static md:z-auto",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="p-5 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg sz-gradient-bg flex items-center justify-center shadow-md shadow-[#00d4ff]/10">
              <span className="text-sm font-bold text-[#0b1120]">SZ</span>
            </div>
            <div>
              <h1 className="font-bold text-sm text-white">SiteZeus</h1>
              <p className="text-[11px] text-[#00d4ff]">BDR Training Bot</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          {filtered.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  active
                    ? "bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20"
                    : "text-[#94a3b8] hover:bg-white/5 hover:text-white border border-transparent"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/5">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-8 w-8 rounded-full sz-gradient-bg flex items-center justify-center text-xs font-bold text-[#0b1120]">
              {session.user.name?.[0] || session.user.email?.[0] || "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {session.user.name || session.user.email}
              </p>
              <p className="text-[11px] text-[#94a3b8]">{role}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-[#94a3b8] hover:text-white hover:bg-white/5"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </Button>
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
    </>
  );
}
