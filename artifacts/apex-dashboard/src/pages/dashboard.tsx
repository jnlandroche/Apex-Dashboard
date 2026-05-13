import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetDashboardSummary,
  useGetTrends,
  getGetDashboardSummaryQueryKey,
  getGetLeaderboardQueryKey,
  getGetSnapshotsQueryKey,
  getGetTrendsQueryKey,
  usePollStats,
} from "@workspace/api-client-react";
import {
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
  ReferenceLine,
} from "recharts";
import { RefreshCw, Users, Trophy, Crosshair, Zap, TrendingUp, Target, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString();
}

const PLAYER_COLORS = ["#22d3ee", "#f59e0b", "#f43f5e", "#8b5cf6", "#10b981"];

const TOOLTIP_STYLE = {
  contentStyle: {
    background: "hsl(222,47%,9%)",
    border: "1px solid hsl(217,32%,17%)",
    borderRadius: 8,
    color: "#e2e8f0",
    fontSize: 12,
  },
};

export function Dashboard() {
  const { data, isLoading } = useGetDashboardSummary();
  const { data: trends } = useGetTrends();
  const pollStats = usePollStats();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [polling, setPolling] = useState(false);

  const squad = data?.squadStats ?? [];

  const barData = squad.map((p) => ({
    name: p.name,
    RP: p.rankScore ?? 0,
    Kills: p.kills ?? 0,
    Damage: Math.round((p.damage ?? 0) / 1000),
    KD: p.kd ?? 0,
  }));

  const trendChartData = buildTrendChartData(trends ?? []);
  const playerNames = (trends ?? []).map((t) => t.name);

  async function handleRefresh() {
    setPolling(true);
    pollStats.mutate(
      {},
      {
        onSuccess: (result) => {
          const ok = result.results.filter((r) => r.status === "updated").length;
          const errors = result.results.filter((r) => r.status === "error").length;
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetLeaderboardQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetSnapshotsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetTrendsQueryKey() });
          toast({
            title: errors > 0 ? "Partial refresh" : "Stats refreshed",
            description:
              errors > 0
                ? `${ok} updated, ${errors} failed`
                : `${ok} player${ok !== 1 ? "s" : ""} updated`,
          });
          setPolling(false);
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Unknown error";
          toast({ title: "Refresh failed", description: msg, variant: "destructive" });
          setPolling(false);
        },
      },
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-40 rounded-2xl bg-card animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-card animate-pulse" />
          ))}
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="h-72 rounded-2xl bg-card animate-pulse" />
          <div className="h-72 rounded-2xl bg-card animate-pulse" />
        </div>
      </div>
    );
  }

  const noPlayers = squad.length === 0;
  const hasTrends = trendChartData.length > 1;

  return (
    <div className="space-y-8">
      {/* Hero header */}
      <header className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-cyan-950 p-6 md:p-8 border border-border relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(34,211,238,0.08),transparent_70%)]" />
        <div className="relative">
          <div className="text-xs font-mono uppercase tracking-[0.3em] text-primary mb-2">
            5SK Apex Legends
          </div>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight">
            Squad Command Center
          </h1>
          <p className="mt-2 text-muted-foreground max-w-xl">
            Track ranked progression, compare teammates, and build weekly MVP summaries from Apex Legends API snapshots.
          </p>
          <button
            data-testid="button-refresh-stats"
            onClick={handleRefresh}
            disabled={polling || noPlayers}
            className="mt-5 flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 active:opacity-75 disabled:opacity-40 transition-opacity"
          >
            <RefreshCw size={16} className={polling ? "animate-spin" : ""} />
            {polling ? "Refreshing..." : "Refresh Stats Now"}
          </button>
        </div>
      </header>

      {/* Stat cards */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Users size={18} />}
          label="Players Tracked"
          value={fmt(data?.playerCount)}
          data-testid="stat-players-tracked"
        />
        <StatCard
          icon={<Trophy size={18} />}
          label="Top Ranked"
          value={data?.topRankedPlayer ?? "—"}
          hint={data?.topRankedRank ?? undefined}
          data-testid="stat-top-ranked"
        />
        <StatCard
          icon={<Crosshair size={18} />}
          label="Squad Kills"
          value={fmt(data?.totalKills)}
          data-testid="stat-squad-kills"
        />
        <StatCard
          icon={<Zap size={18} />}
          label="Squad Damage"
          value={fmt(data?.totalDamage)}
          data-testid="stat-squad-damage"
        />
      </section>

      {noPlayers ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center">
          <Users size={40} className="mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">No players yet</h2>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            Go to the Players page, add your squad members by Apex username, then come back and click Refresh Stats Now.
          </p>
        </div>
      ) : (
        <>
          {/* RP Trend — only show if ≥2 snapshots exist */}
          {hasTrends && (
            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp size={16} className="text-primary" />
                <h2 className="text-base font-semibold">RP Progression Over Time</h2>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendChartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" />
                    <XAxis
                      dataKey="label"
                      stroke="#64748b"
                      tick={{ fontSize: 11 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                    <Tooltip {...TOOLTIP_STYLE} />
                    <Legend />
                    {playerNames.map((name, i) => (
                      <Line
                        key={name}
                        type="monotone"
                        dataKey={name}
                        stroke={PLAYER_COLORS[i % PLAYER_COLORS.length]}
                        strokeWidth={2}
                        dot={{ r: 3, fill: PLAYER_COLORS[i % PLAYER_COLORS.length] }}
                        activeDot={{ r: 5 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          {/* Comparison charts row */}
          <section className="grid gap-6 xl:grid-cols-3">
            {/* RP bar */}
            <ChartCard title="Rank Points" icon={<Trophy size={14} className="text-primary" />}>
              <BarChart data={barData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" />
                <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Bar dataKey="RP" radius={[6, 6, 0, 0]}>
                  {barData.map((_, i) => (
                    <rect key={i} fill={PLAYER_COLORS[i % PLAYER_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ChartCard>

            {/* Kills bar */}
            <ChartCard title="Total Kills" icon={<Crosshair size={14} className="text-primary" />}>
              <BarChart data={barData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" />
                <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Bar dataKey="Kills" fill="#f43f5e" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartCard>

            {/* Damage bar */}
            <ChartCard title="Damage (thousands)" icon={<Zap size={14} className="text-primary" />}>
              <BarChart data={barData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" />
                <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [`${v}k`, "Damage"]} />
                <Bar dataKey="Damage" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartCard>
          </section>

          {/* K/D and per-player cards */}
          <section className="grid gap-6 xl:grid-cols-2">
            {/* K/D */}
            <ChartCard title="K/D Ratio" icon={<Target size={14} className="text-primary" />}>
              <BarChart data={barData} layout="vertical" margin={{ top: 4, right: 16, left: 40, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" horizontal={false} />
                <XAxis type="number" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" stroke="#64748b" tick={{ fontSize: 11 }} width={70} />
                <Tooltip {...TOOLTIP_STYLE} />
                <ReferenceLine x={1} stroke="#64748b" strokeDasharray="4 4" label={{ value: "1.0", fill: "#64748b", fontSize: 10 }} />
                <Bar dataKey="KD" fill="#10b981" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ChartCard>

            {/* Player cards */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <Shield size={14} className="text-primary" />
                <h2 className="text-base font-semibold">Player Breakdown</h2>
              </div>
              {squad.map((p, i) => (
                <div
                  key={p.playerId}
                  className="rounded-xl border border-border bg-background p-4 flex items-center gap-4"
                >
                  <div
                    className="w-1 self-stretch rounded-full"
                    style={{ background: PLAYER_COLORS[i % PLAYER_COLORS.length] }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.rankName ?? "Unknown"} · Level {p.level ?? "—"}
                    </div>
                  </div>
                  <div className="flex gap-4 text-right">
                    <Pill label="RP" value={fmt(p.rankScore)} color="text-cyan-400" />
                    <Pill label="Kills" value={fmt(p.kills)} color="text-rose-400" />
                    <Pill label="K/D" value={p.kd != null ? p.kd.toFixed(2) : "—"} color="text-emerald-400" />
                    <Pill label="Dmg" value={p.damage ? `${(p.damage / 1000).toFixed(0)}k` : "—"} color="text-violet-400" />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Squad table */}
          <section className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="p-5 border-b border-border">
              <h2 className="text-base font-semibold">Full Squad Snapshot</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                    <th className="text-left p-4">Player</th>
                    <th className="text-left p-4">Rank</th>
                    <th className="text-left p-4">RP</th>
                    <th className="text-left p-4">Level</th>
                    <th className="text-left p-4">Kills</th>
                    <th className="text-left p-4">Damage</th>
                    <th className="text-left p-4">K/D</th>
                    <th className="text-left p-4">Last Update</th>
                  </tr>
                </thead>
                <tbody>
                  {squad.map((s) => (
                    <tr
                      key={s.playerId}
                      data-testid={`row-player-${s.playerId}`}
                      className="border-b border-border/50 hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="p-4 font-semibold text-foreground">{s.name}</td>
                      <td className="p-4 text-muted-foreground">{s.rankName ?? "—"}</td>
                      <td className="p-4 text-primary font-mono">{fmt(s.rankScore)}</td>
                      <td className="p-4">{fmt(s.level)}</td>
                      <td className="p-4">{fmt(s.kills)}</td>
                      <td className="p-4">{fmt(s.damage)}</td>
                      <td className="p-4 font-mono">{s.kd != null ? s.kd.toFixed(2) : "—"}</td>
                      <td className="p-4 text-muted-foreground text-xs">
                        {s.capturedAt ? new Date(s.capturedAt).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function buildTrendChartData(
  trends: Array<{ name: string; dataPoints: Array<{ capturedAt: string; rankScore: number }> }>,
) {
  if (!trends.length) return [];

  const allTimes = new Set<string>();
  const byPlayer: Record<string, Record<string, number>> = {};

  for (const t of trends) {
    byPlayer[t.name] = {};
    for (const dp of t.dataPoints) {
      const label = formatTrendLabel(dp.capturedAt);
      allTimes.add(dp.capturedAt);
      byPlayer[t.name][dp.capturedAt] = dp.rankScore;
    }
  }

  const sorted = [...allTimes].sort();
  return sorted.map((ts) => {
    const row: Record<string, string | number> = { label: formatTrendLabel(ts) };
    for (const t of trends) {
      const val = byPlayer[t.name][ts];
      if (val !== undefined) row[t.name] = val;
    }
    return row;
  });
}

function formatTrendLabel(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function ChartCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Pill({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="text-right">
      <div className={`text-sm font-bold ${color ?? ""}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  "data-testid": testId,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  hint?: string;
  "data-testid"?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-2"
    >
      <div className="flex items-center gap-2 text-primary">{icon}</div>
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className="text-2xl font-bold tracking-tight">{value}</div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
