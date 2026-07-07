import React from "react";
import { Link, useLocation } from "wouter";
import { Activity, Users, Trophy, History, Settings, Menu, ClipboardList, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";

function ApexIcon({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Apex Legends"
    >
      <path
        d="M20 2L37 11.5V28.5L20 38L3 28.5V11.5L20 2Z"
        stroke="#dc2626"
        strokeWidth="1.5"
        fill="rgba(220,38,38,0.10)"
      />
      <path
        d="M20 8L33 15.5V24.5L20 32L7 24.5V15.5L20 8Z"
        fill="rgba(220,38,38,0.06)"
        stroke="rgba(220,38,38,0.25)"
        strokeWidth="0.5"
      />
      <line x1="13" y1="29" x2="20" y2="11" stroke="#dc2626" strokeWidth="2.8" strokeLinecap="round" />
      <line x1="27" y1="29" x2="20" y2="11" stroke="#dc2626" strokeWidth="2.8" strokeLinecap="round" />
      <line x1="15" y1="22" x2="25" y2="22" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="20" cy="11" r="2" fill="#dc2626" opacity="0.9" />
    </svg>
  );
}

const navItems = [
  { name: "Dashboard", href: "/", icon: Activity },
  { name: "Players", href: "/players", icon: Users },
  { name: "Leaderboard", href: "/leaderboard", icon: Trophy },
  { name: "Session", href: "/session", icon: ClipboardList },
  { name: "Snapshots", href: "/snapshots", icon: History },
  { name: "Settings", href: "/settings", icon: Settings },
  { name: "API Debug", href: "/debug", icon: Terminal },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const NavLinks = () => (
    <div className="flex flex-col gap-1 p-3">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = location === item.href;
        return (
          <Link
            key={item.name}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-all duration-150 ${
              isActive
                ? "bg-primary/15 text-primary border-l-2 border-primary shadow-[0_0_12px_rgba(220,38,38,0.15)]"
                : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground border-l-2 border-transparent"
            }`}
          >
            <Icon size={16} />
            <span className="font-medium tracking-widest uppercase text-xs">
              {item.name}
            </span>
          </Link>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen w-full flex bg-background text-foreground selection:bg-primary/20">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-56 flex-col border-r border-border bg-sidebar relative z-10">
        {/* Red accent line at top */}
        <div className="h-0.5 w-full bg-gradient-to-r from-red-700 via-red-500 to-transparent" />
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-2.5 mb-1">
            <ApexIcon size={28} />
            <h1
              className="text-xl font-black tracking-tighter"
              style={{
                background: "linear-gradient(135deg, #ffffff, #ef4444)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              5SK
            </h1>
          </div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-[0.3em] font-mono">
            Apex Command Center
          </p>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          <NavLinks />
        </div>

        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">Adaptive refresh · 15m–2h</span>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-border bg-sidebar sticky top-0 z-20">
          <div className="flex items-center gap-2.5">
            <ApexIcon size={24} />
            <h1
              className="text-lg font-black tracking-tighter"
              style={{
                background: "linear-gradient(135deg, #ffffff, #ef4444)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              5SK
            </h1>
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu size={20} />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-56 p-0 bg-sidebar border-r border-border">
              <div className="h-0.5 w-full bg-gradient-to-r from-red-700 via-red-500 to-transparent" />
              <div className="p-5 border-b border-border">
                <div className="flex items-center gap-2.5 mb-1">
                  <ApexIcon size={28} />
                  <h1
                    className="text-xl font-black tracking-tighter"
                    style={{
                      background: "linear-gradient(135deg, #ffffff, #ef4444)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}
                  >
                    5SK
                  </h1>
                </div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-[0.3em] font-mono">
                  Apex Command Center
                </p>
              </div>
              <div className="py-2">
                <NavLinks />
              </div>
            </SheetContent>
          </Sheet>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
