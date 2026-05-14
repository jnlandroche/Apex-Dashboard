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

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
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
    background: "hsl(222,47%,9%)",
    border: "1px solid hsl(217,32%,17%)",
    borderRadius: 8,
    color: "#e2e8f0",
    fontSize: 12,
  },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function PlayerAvatar({ name, avatar, color = "#22d3ee", size = 64 }: { name: string; avatar?: string | null; color?: string; size?: number }) {
  const [imgFailed, setImgFailed] = useState(false);
  const initials = name.slice(0, 2).toUpperCase();
  if (avatar && !imgFailed) {
    return (
      <img
        src={avatar}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover ring-2 ring-border shrink-0"
        style={{ width: size, height: size }}
        onError={() => setImgFailed(true)}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold shrink-0 text-background"
      style={{ width: size, height: size, background: color, fontSize: size * 0.3 }}
    >
      {initials}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  delta: d,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  delta?: number | null;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-2">
      <div className={`flex items-center gap-2 ${color}`}>{icon}</div>
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className={`text-2xl font-bold tracking-tight ${color}`}>{value}</div>
      {d != null && (
        <div className={`flex items-center gap-1 text-xs font-medium ${d >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
          {d >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {d >= 0 ? "+" : ""}{d.toLocaleString()} over period
        </div>
      )}
    </div>
  );
}

function MiniChart({
  data,
  dataKey,
  color,
  title,
  icon,
  formatter,
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
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <span style={{ color }}>{icon}</span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" />
            <XAxis dataKey="label" stroke="#64748b" tick={{ fontSize: 10 }} />
            <YAxis stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={formatter} />
            <Tooltip
              {...TOOLTIP_STYLE}
              formatter={(v: unknown) => [formatter ? formatter(v as number) : String(v), dataKey]}
            />
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={2.5}
              dot={{ r: 3, fill: color }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PlayerProfile() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const playerId = id ? Number(id) : null;

  const { data: allSnapshots, isLoading } = useGetSnapshots(
    playerId ? { playerId } : undefined,
  );
  const { data: leaderboard } = useGetLeaderboard();

  // Current player info from leaderboard
  const player = useMemo(
    () => leaderboard?.find((p) => p.playerId === playerId),
    [leaderboard, playerId],
  );

  // Snapshots for this player, sorted oldest→newest
  const snapshots = useMemo<Snapshot[]>(() => {
    if (!allSnapshots || !playerId) return [];
    return ([...allSnapshots] as Snapshot[])
      .filter((s) => s.playerId === playerId)
      .sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());
  }, [allSnapshots, playerId]);

  // Chart data
  const chartData = useMemo(
    () =>
      snapshots.map((s) => ({
        label: fmtDate(s.capturedAt),
        RP: s.rankScore ?? 0,
        Kills: s.kills ?? 0,
        Damage: s.damage ?? 0,
        KD: s.kd ?? 0,
      })),
    [snapshots],
  );

  // Deltas over the full period
  const rpDelta = delta(snapshots, "rankScore");
  const killsDelta = delta(snapshots, "kills");
  const damageDelta = delta(snapshots, "damage");

  const name = player?.name ?? snapshots[0]?.playerName ?? `Player ${playerId}`;
  const latestSnap = snapshots[snapshots.length - 1];
  const platformIcon =
    player?.platform === "PC" ? <Monitor size={13} /> : <Gamepad2 size={13} />;

  if (!playerId) {
    return (
      <div className="text-muted-foreground">Invalid player ID.</div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Back button */}
      <button
        onClick={() => navigate("/leaderboard")}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={15} />
        Back to Leaderboard
      </button>

      {/* Player header */}
      <div className="rounded-2xl border border-border bg-card p-6 flex flex-wrap items-center gap-5">
        <PlayerAvatar
          name={name}
          avatar={player?.avatar}
          color="#22d3ee"
          size={72}
        />
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-bold tracking-tight truncate">{name}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-1.5">
            <RankBadge rankName={latestSnap?.rankName ?? player?.rankName} size={26} />
            <span className="text-muted-foreground text-xs">·</span>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Star size={11} />
              Level {latestSnap?.level ?? player?.level ?? "—"}
            </span>
            {player?.platform && (
              <>
                <span className="text-muted-foreground text-xs">·</span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  {platformIcon}
                  {player.platform}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Snapshots</div>
          <div className="text-3xl font-bold text-primary">{snapshots.length}</div>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 rounded-2xl bg-card border border-border animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && snapshots.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground">
          No snapshots yet for this player. Refresh stats from the Dashboard.
        </div>
      )}

      {!isLoading && snapshots.length > 0 && (
        <>
          {/* Stat cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={<Trophy size={16} />}
              label="Rank Points"
              value={fmt(latestSnap.rankScore)}
              delta={rpDelta}
              color="text-cyan-400"
            />
            <StatCard
              icon={<Crosshair size={16} />}
              label="Total Kills"
              value={fmt(latestSnap.kills)}
              delta={killsDelta}
              color="text-rose-400"
            />
            <StatCard
              icon={<Zap size={16} />}
              label="Total Damage"
              value={fmt(latestSnap.damage)}
              delta={damageDelta}
              color="text-violet-400"
            />
            <StatCard
              icon={<Target size={16} />}
              label="K/D Ratio"
              value={latestSnap.kd != null ? latestSnap.kd.toFixed(2) : "—"}
              color="text-emerald-400"
            />
          </div>

          {/* RP chart – full width */}
          {chartData.length >= 2 && (
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={14} className="text-cyan-400" />
                <h3 className="text-sm font-semibold">RP Progression</h3>
                <span className="ml-auto text-xs text-muted-foreground">
                  {snapshots.length} snapshot{snapshots.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" />
                    <XAxis dataKey="label" stroke="#64748b" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                    <Tooltip {...TOOLTIP_STYLE} />
                    <ReferenceLine
                      y={latestSnap.rankScore ?? 0}
                      stroke="#22d3ee"
                      strokeDasharray="4 4"
                      opacity={0.3}
                    />
                    <Line
                      type="monotone"
                      dataKey="RP"
                      stroke="#22d3ee"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#22d3ee" }}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Kills + Damage + K/D mini charts */}
          <div className="grid gap-6 lg:grid-cols-3">
            <MiniChart
              data={chartData}
              dataKey="Kills"
              color="#f43f5e"
              title="Kills Over Time"
              icon={<Crosshair size={14} />}
            />
            <MiniChart
              data={chartData}
              dataKey="Damage"
              color="#8b5cf6"
              title="Damage Over Time"
              icon={<Zap size={14} />}
              formatter={(v) => `${(v / 1000).toFixed(0)}k`}
            />
            <MiniChart
              data={chartData}
              dataKey="KD"
              color="#10b981"
              title="K/D Over Time"
              icon={<Target size={14} />}
              formatter={(v) => v.toFixed(2)}
            />
          </div>

          {/* Snapshot history table */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h3 className="text-base font-semibold">Snapshot History</h3>
              <span className="text-xs text-muted-foreground">{snapshots.length} total — newest first</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
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
                    <tr
                      key={s.id}
                      className="border-b border-border/50 hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="p-4 text-xs text-muted-foreground font-mono">
                        {new Date(s.capturedAt).toLocaleString()}
                      </td>
                      <td className="p-4">
                        <RankBadge rankName={s.rankName} size={18} />
                      </td>
                      <td className="p-4 text-primary font-mono font-semibold">{fmt(s.rankScore)}</td>
                      <td className="p-4">{fmt(s.level)}</td>
                      <td className="p-4">{fmt(s.kills)}</td>
                      <td className="p-4">{fmt(s.damage)}</td>
                      <td className="p-4 font-mono">{s.kd != null ? s.kd.toFixed(2) : "—"}</td>
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
