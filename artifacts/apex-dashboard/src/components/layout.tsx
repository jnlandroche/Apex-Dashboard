import React from "react";
import { Link, useLocation } from "wouter";
import { Activity, Users, Trophy, History, Settings, Menu, ClipboardList } from "lucide-react";
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
      {/* Outer hexagonal frame */}
      <path
        d="M20 2L37 11.5V28.5L20 38L3 28.5V11.5L20 2Z"
        stroke="#ef4444"
        strokeWidth="2"
        fill="rgba(239,68,68,0.12)"
      />
      {/* Inner diamond accent */}
      <path
        d="M20 8L33 15.5V24.5L20 32L7 24.5V15.5L20 8Z"
        fill="rgba(239,68,68,0.08)"
        stroke="rgba(239,68,68,0.3)"
        strokeWidth="0.5"
      />
      {/* A left stroke */}
      <line x1="13" y1="29" x2="20" y2="11" stroke="#ef4444" strokeWidth="2.8" strokeLinecap="round" />
      {/* A right stroke */}
      <line x1="27" y1="29" x2="20" y2="11" stroke="#ef4444" strokeWidth="2.8" strokeLinecap="round" />
      {/* A crossbar */}
      <line x1="15" y1="22" x2="25" y2="22" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" />
      {/* Centre glow dot */}
      <circle cx="20" cy="11" r="2" fill="#ef4444" opacity="0.9" />
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
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const NavLinks = () => (
    <div className="flex flex-col gap-2 p-4">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = location === item.href;
        return (
          <Link
            key={item.name}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
              isActive
                ? "bg-primary/10 text-primary border-l-2 border-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon size={18} />
            <span className="font-medium tracking-wide uppercase text-sm">
              {item.name}
            </span>
          </Link>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen w-full flex bg-background text-foreground selection:bg-primary/30">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r border-border bg-card/50 backdrop-blur-sm relative z-10">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-2 mb-1">
            <ApexIcon size={32} />
            <h1 className="text-2xl font-bold text-primary tracking-tighter drop-shadow-[0_0_10px_rgba(34,211,238,0.4)]">
              5SK
            </h1>
          </div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-mono">
            Apex Command Center
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavLinks />
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <ApexIcon size={26} />
            <h1 className="text-xl font-bold text-primary tracking-tighter">5SK</h1>
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu size={20} />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 bg-background border-r-border">
              <div className="p-6 border-b border-border">
                <div className="flex items-center gap-2 mb-1">
                  <ApexIcon size={32} />
                  <h1 className="text-2xl font-bold text-primary tracking-tighter drop-shadow-[0_0_10px_rgba(34,211,238,0.4)]">
                    5SK
                  </h1>
                </div>
                <p className="text-xs text-muted-foreground uppercase tracking-widest font-mono">
                  Apex Command Center
                </p>
              </div>
              <NavLinks />
            </SheetContent>
          </Sheet>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto relative z-0">
          {children}
        </main>
      </div>
    </div>
  );
}
