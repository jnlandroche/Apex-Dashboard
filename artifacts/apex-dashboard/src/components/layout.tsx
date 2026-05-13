import React from "react";
import { Link, useLocation } from "wouter";
import { Activity, Users, Trophy, History, Settings, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";

const navItems = [
  { name: "Dashboard", href: "/", icon: Activity },
  { name: "Players", href: "/players", icon: Users },
  { name: "Leaderboard", href: "/leaderboard", icon: Trophy },
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
            <div className="w-8 h-8 bg-primary rounded shadow-[0_0_15px_rgba(34,211,238,0.5)] flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg leading-none">5</span>
            </div>
            <h1 className="text-2xl font-bold text-primary tracking-tighter shadow-primary drop-shadow-[0_0_10px_rgba(34,211,238,0.4)]">
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
            <div className="w-6 h-6 bg-primary rounded shadow-[0_0_10px_rgba(34,211,238,0.5)] flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm leading-none">5</span>
            </div>
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
                  <div className="w-8 h-8 bg-primary rounded shadow-[0_0_15px_rgba(34,211,238,0.5)] flex items-center justify-center">
                    <span className="text-primary-foreground font-bold text-lg leading-none">5</span>
                  </div>
                  <h1 className="text-2xl font-bold text-primary tracking-tighter shadow-primary drop-shadow-[0_0_10px_rgba(34,211,238,0.4)]">
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
