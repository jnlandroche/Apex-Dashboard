import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useGetSnapshots, useGetLeaderboard } from "@workspace/api-client-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  ArrowLeft,
  Trophy,
  Crosshair,
  Zap,
  Target,
  TrendingUp,
  TrendingDown,
  Monitor,
  Gamepad2,
  Star,
} from "lucide-react";
import { RankBadge } from "@/components/rank-badge";

const PLAYER_COLORS = ["#22d3ee", "#f59e0b", "#f43f5e", "#8b5cf6", "#10b981"];

type Snapshot = {
  id: number;
  playerId: number;
  playerName: string | null;
  capturedAt: string;
  rankName: string | null;
  rankScore: number | null;
  level: number | null;
  kills: number | null;
  damage: number | null;
  kd: number | null;
};

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

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function delta(snapshots: Snapshot[], key: keyof Snapshot): number | null {
  if (snapshots.length < 2) return null;
  const first = snapshots[0][key] as number | null;
  const last = snapshots[snapshots.length - 1][key] as number | null;
  if (first == null || last == null) return null;
  return last - first;
}

const TOOLTIP_STYLE = {
  contentStyle: {
    background: "#0a0a10",
    border: "1px solid rgba(220,38,38,0.25)",
    borderRadius: 6,
    color: "#e2e8f0",
    fontSize: 12,
  },
};

function PlayerAvatar({ name, avatar, color = "#dc2626", size = 64 }: { name: string; avatar?: string | null; color?: string; size?: number }) {
  const [imgFailed, setImgFailed] = useState(false);
  const initials = name.slice(0, 2).toUpperCase();
  if (avatar && !imgFailed) {
    return (
      <img
        src={avatar}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size, boxShadow: `0 0 20px ${color}55` }}
        onError={() => setImgFailed(true)}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold shrink-0 text-black"
      style={{ width: size, height: size, background: color, fontSize: size * 0.3, boxShadow: `0 0 20px ${color}55` }}
    >
      {initials}
    </div>
  );
}

function StatCard({
  icon, label, value, delta: d, color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  delta?: number | null;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">
        <span style={{ color }}>{icon}</span>
        {label}
      </div>
      <div className="text-2xl font-black tracking-tight" style={{ color }}>{value}</div>
      {d != null && d !== 0 && (
        <div className={`flex items-center gap-1 text-xs font-mono font-medium ${d >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
          {d >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {d >= 0 ? "+" : ""}{d.toLocaleString()} since first snapshot
        </div>
      )}
    </div>
  );
}

function MiniChart({
  data, dataKey, color, title, icon, formatter,
}: {
  data: Record<string, unknown>[];
  dataKey: string;
  color: string;
  title: string;
  icon: React.ReactNode;
  formatter?: (v: number) => string;
}) {
  if (data.length < 2) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-4">
        <span style={{ color }}>{icon}</span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="label" stroke="#374151" tick={{ fontSize: 10, fill: "#6b7280" }} />
            <YAxis stroke="#374151" tick={{ fontSize: 10, fill: "#6b7280" }} tickFormatter={formatter} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v: unknown) => [formatter ? formatter(v as number) : String(v), dataKey]} />
            <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={{ r: 2.5, fill: color }} activeDot={{ r: 4 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function PlayerProfile() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const playerId = id ? Number(id) : null;

  const { data: allSnapshots, isLoading } = useGetSnapshots(playerId ? { playerId } : undefined);
  const { data: leaderboard } = useGetLeaderboard();

  const player = useMemo(() => leaderboard?.find((p) => p.playerId === playerId), [leaderboard, playerId]);

  const snapshots = useMemo<Snapshot[]>(() => {
    if (!allSnapshots || !playerId) return [];
    return ([...allSnapshots] as Snapshot[])
      .filter((s) => s.playerId === playerId)
      .sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());
  }, [allSnapshots, playerId]);

  const chartData = useMemo(() =>
    snapshots.map((s) => ({
      label: fmtDate(s.capturedAt),
      RP: s.rankScore ?? 0,
      Kills: s.kills ?? 0,
      Damage: s.damage ?? 0,
      KD: s.kd ?? 0,
    })), [snapshots]);

  const rpDelta = delta(snapshots, "rankScore");
  const killsDelta = delta(snapshots, "kills");
  const damageDelta = delta(snapshots, "damage");

  const name = player?.name ?? snapshots[0]?.playerName ?? `Player ${playerId}`;
  const latestSnap = snapshots[snapshots.length - 1];
  const platformIcon = player?.platform === "PC" ? <Monitor size={12} /> : <Gamepad2 size={12} />;

  // Pick player color based on leaderboard position
  const playerIdx = leaderboard?.findIndex((p) => p.playerId === playerId) ?? 0;
  const playerColor = PLAYER_COLORS[playerIdx >= 0 ? playerIdx % PLAYER_COLORS.length : 0];

  if (!playerId) {
    return <div className="text-muted-foreground font-mono text-sm">Invalid player ID.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Back */}
      <button
        onClick={() => navigate("/leaderboard")}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors font-mono"
      >
        <ArrowLeft size={14} />
        Back to Leaderboard
      </button>

      {/* Player header */}
      <div className="rounded-xl border bg-card p-6 relative overflow-hidden" style={{ borderColor: playerColor + "44" }}>
        <div className="absolute inset-0 opacity-[0.04]" style={{ background: `radial-gradient(ellipse at top left, ${playerColor}, transparent 60%)` }} />
        <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: `linear-gradient(90deg, ${playerColor}, transparent)` }} />
        <div className="relative flex flex-wrap items-center gap-5">
          <PlayerAvatar name={name} avatar={player?.avatar} color={playerColor} size={72} />
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-black tracking-tight truncate" style={{ color: playerColor }}>{name}</h1>
            <div className="flex flex-wrap items-center gap-3 mt-2">
              <RankBadge rankName={latestSnap?.rankName ?? player?.rankName} size={24} />
              <span className="text-muted-foreground text-xs">·</span>
              <span className="text-xs text-muted-foreground flex items-center gap-1 font-mono">
                <Star size={10} />
                Level {latestSnap?.level ?? player?.level ?? "—"}
              </span>
              {player?.platform && (
                <>
                  <span className="text-muted-foreground text-xs">·</span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1 font-mono">
                    {platformIcon}
                    {player.platform}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground mb-1">Snapshots</div>
            <div className="text-3xl font-black" style={{ color: playerColor }}>{snapshots.length}</div>
          </div>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-card border border-border" />
          ))}
        </div>
      )}

      {!isLoading && snapshots.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card/30 p-12 text-center text-muted-foreground text-sm font-mono">
          No snapshots yet. Refresh stats from the Dashboard.
        </div>
      )}

      {!isLoading && snapshots.length > 0 && (
        <>
          {/* Stat cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={<Trophy size={14} />} label="Rank Points" value={fmt(latestSnap.rankScore)} delta={rpDelta} color="#dc2626" />
            <StatCard icon={<Crosshair size={14} />} label="Kills (Career)" value={fmt(latestSnap.kills)} delta={killsDelta} color="#f43f5e" />
            <StatCard icon={<Zap size={14} />} label="Damage (Career)" value={fmtK(latestSnap.damage)} delta={damageDelta} color="#8b5cf6" />
            <StatCard icon={<Target size={14} />} label="K/D Ratio" value={latestSnap.kd != null && latestSnap.kd > 0 ? latestSnap.kd.toFixed(2) : "—"} color="#10b981" />
          </div>

          {/* RP chart */}
          {chartData.length >= 2 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={13} style={{ color: playerColor }} />
                <h3 className="text-sm font-semibold">RP Progression</h3>
                <span className="ml-auto text-xs text-muted-foreground font-mono">{snapshots.length} snapshots</span>
              </div>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="label" stroke="#374151" tick={{ fontSize: 10, fill: "#6b7280" }} />
                    <YAxis stroke="#374151" tick={{ fontSize: 10, fill: "#6b7280" }} />
                    <Tooltip {...TOOLTIP_STYLE} />
                    <ReferenceLine y={latestSnap.rankScore ?? 0} stroke={playerColor} strokeDasharray="4 4" opacity={0.3} />
                    <Line type="monotone" dataKey="RP" stroke={playerColor} strokeWidth={2.5} dot={{ r: 3, fill: playerColor }} activeDot={{ r: 5 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Mini charts */}
          {(() => {
            const hasKdData = chartData.some((d) => (d.KD as number) > 0);
            return (
              <div className="grid gap-4 lg:grid-cols-3">
                <MiniChart data={chartData} dataKey="Kills" color="#f43f5e" title="Kills Over Time" icon={<Crosshair size={13} />} />
                <MiniChart data={chartData} dataKey="Damage" color="#8b5cf6" title="Damage Over Time" icon={<Zap size={13} />} formatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                {hasKdData
                  ? <MiniChart data={chartData} dataKey="KD" color="#10b981" title="K/D Over Time" icon={<Target size={13} />} formatter={(v) => v.toFixed(2)} />
                  : (
                    <div className="rounded-xl border border-border bg-card p-4 flex flex-col items-center justify-center gap-2 text-center">
                      <Target size={18} className="text-muted-foreground opacity-40" />
                      <div className="text-xs font-mono text-muted-foreground">K/D unavailable</div>
                      <div className="text-[10px] text-muted-foreground/60">Pending tracker.gg API approval</div>
                    </div>
                  )
                }
              </div>
            );
          })()}

          {/* Snapshot history */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-wide">Snapshot History</h3>
              <span className="text-xs text-muted-foreground font-mono">{snapshots.length} total</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-[10px] font-mono uppercase tracking-wider border-b border-border">
                    <th className="text-left p-4">Timestamp</th>
                    <th className="text-left p-4">Rank</th>
                    <th className="text-left p-4">RP</th>
                    <th className="text-left p-4">Level</th>
                    <th className="text-left p-4">Kills</th>
                    <th className="text-left p-4">Damage</th>
                    <th className="text-left p-4">K/D</th>
                  </tr>
                </thead>
                <tbody>
                  {[...snapshots].reverse().slice(0, 50).map((s) => (
                    <tr key={s.id} className="border-b border-border/40 hover:bg-white/[0.015] transition-colors">
                      <td className="p-4 text-xs text-muted-foreground font-mono">{new Date(s.capturedAt).toLocaleString()}</td>
                      <td className="p-4"><RankBadge rankName={s.rankName} size={18} /></td>
                      <td className="p-4 text-primary font-mono font-bold">{fmt(s.rankScore)}</td>
                      <td className="p-4 font-mono text-muted-foreground">{fmt(s.level)}</td>
                      <td className="p-4 font-mono">{fmt(s.kills)}</td>
                      <td className="p-4 font-mono">{fmtK(s.damage)}</td>
                      <td className="p-4 font-mono text-emerald-400">{s.kd != null && s.kd > 0 ? s.kd.toFixed(2) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
