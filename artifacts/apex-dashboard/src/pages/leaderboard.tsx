import { useState } from "react";
import { useGetLeaderboard } from "@workspace/api-client-react";
import { Trophy, Medal } from "lucide-react";
import { useLocation } from "wouter";
import { RankBadge } from "@/components/rank-badge";

const PLAYER_COLORS = ["#22d3ee", "#f59e0b", "#f43f5e", "#8b5cf6", "#10b981"];

function PlayerAvatar({ name, avatar, color, size = 36 }: { name: string; avatar?: string | null; color?: string; size?: number }) {
  const [imgFailed, setImgFailed] = useState(false);
  const initials = name.slice(0, 2).toUpperCase();
  const bg = color ?? "#dc2626";
  if (avatar && !imgFailed) {
    return (
      <img
        src={avatar}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size, boxShadow: `0 0 10px ${bg}44` }}
        onError={() => setImgFailed(true)}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center text-xs font-bold text-black shrink-0"
      style={{ width: size, height: size, background: bg, fontSize: size * 0.3, boxShadow: `0 0 10px ${bg}44` }}
    >
      {initials}
    </div>
  );
}

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString();
}

function fmtK(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

const RANK_ICONS = [
  <Trophy size={16} className="text-yellow-400" />,
  <Medal size={16} className="text-slate-300" />,
  <Medal size={16} className="text-amber-600" />,
];

export function Leaderboard() {
  const { data: rows, isLoading } = useGetLeaderboard();
  const [, navigate] = useLocation();

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-end gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1 h-4 rounded-full bg-red-500" />
            <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-red-400/80">5SK</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight">Team Leaderboard</h1>
          <p className="text-muted-foreground text-sm mt-1 font-mono">Ranked by RP — most recent snapshot</p>
        </div>
      </div>

      {/* Podium cards (top 3) */}
      {!isLoading && rows && rows.length >= 1 && (
        <div className="grid sm:grid-cols-3 gap-4">
          {rows.slice(0, 3).map((p, i) => {
            const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
            return (
              <div
                key={p.playerId}
                className={`rounded-xl border bg-card p-5 relative overflow-hidden cursor-pointer transition-all duration-200 hover:scale-[1.01] ${i === 0 ? "sm:order-2" : i === 1 ? "sm:order-1" : "sm:order-3"}`}
                style={{ borderColor: color + "40" }}
                onClick={() => navigate(`/players/${p.playerId}`)}
              >
                <div className="absolute inset-0 opacity-[0.05]" style={{ background: `radial-gradient(ellipse at top, ${color}, transparent 60%)` }} />
                <div className="relative flex flex-col items-center text-center gap-3">
                  <div className="text-sm font-mono">{RANK_ICONS[i] ?? <span className="text-muted-foreground font-mono">#{i + 1}</span>}</div>
                  <PlayerAvatar name={p.name} avatar={p.avatar} color={color} size={56} />
                  <div>
                    <div className="font-black text-base" style={{ color }}>{p.name}</div>
                    <div className="mt-1"><RankBadge rankName={p.rankName} size={18} /></div>
                  </div>
                  <div className="text-2xl font-black font-mono" style={{ color }}>{fmt(p.rankScore)}<span className="text-xs text-muted-foreground ml-1">RP</span></div>
                  <div className="flex gap-4 text-xs font-mono text-muted-foreground">
                    <span>{fmt(p.kills)} kills</span>
                    <span>{fmtK(p.damage)} dmg</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <Trophy size={14} className="text-red-500" />
          <h2 className="text-sm font-semibold tracking-wide">Full Rankings</h2>
        </div>

        {isLoading ? (
          <div className="p-8 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-background/50 animate-pulse" />
            ))}
          </div>
        ) : !rows?.length ? (
          <div className="p-12 text-center text-muted-foreground text-sm font-mono">
            No player data yet. Add players and refresh stats from the Dashboard.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-[10px] font-mono uppercase tracking-wider border-b border-border">
                  <th className="text-left p-4 w-10">#</th>
                  <th className="text-left p-4">Player</th>
                  <th className="text-left p-4">Rank</th>
                  <th className="text-left p-4">RP</th>
                  <th className="text-left p-4">Level</th>
                  <th className="text-left p-4">Kills</th>
                  <th className="text-left p-4">Damage</th>
                  <th className="text-left p-4">K/D</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s, i) => {
                  const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
                  return (
                    <tr
                      key={s.playerId}
                      data-testid={`row-leaderboard-${s.playerId}`}
                      className="border-b border-border/40 hover:bg-white/[0.02] transition-colors cursor-pointer"
                      onClick={() => navigate(`/players/${s.playerId}`)}
                    >
                      <td className="p-4">
                        {i < 3
                          ? <span>{RANK_ICONS[i]}</span>
                          : <span className="text-muted-foreground font-mono text-xs">{i + 1}</span>}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <PlayerAvatar name={s.name} avatar={s.avatar} color={color} size={30} />
                          <span className="font-bold hover:text-primary transition-colors">{s.name}</span>
                        </div>
                      </td>
                      <td className="p-4"><RankBadge rankName={s.rankName} size={20} /></td>
                      <td className="p-4 font-mono font-bold text-primary">{fmt(s.rankScore)}</td>
                      <td className="p-4 font-mono text-muted-foreground">{fmt(s.level)}</td>
                      <td className="p-4 font-mono">{fmt(s.kills)}</td>
                      <td className="p-4 font-mono">{fmtK(s.damage)}</td>
                      <td className="p-4 font-mono text-emerald-400">{s.kd != null && s.kd > 0 ? s.kd.toFixed(2) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
