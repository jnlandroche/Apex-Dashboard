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
import {
  RefreshCw,
  Users,
  Trophy,
  Crosshair,
  Zap,
  TrendingUp,
  Target,
  Shield,
  Star,
  Swords,
  Flame,
} from "lucide-react";
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

// ─── Types ───────────────────────────────────────────────────────────────────

type TrendPlayer = {
  name: string;
  playerId: number;
  dataPoints: Array<{ capturedAt: string; rankScore: number; kills?: number | null; damage?: number | null }>;
};

type MvpResult = {
  name: string;
  rpGained: number;
  killsGained: number;
  damageGained: number;
  score: number;
  snapshots: number;
  color: string;
};

// ─── Weekly MVP logic ─────────────────────────────────────────────────────────

function computeWeeklyMvp(trends: TrendPlayer[], playerColors: string[]): MvpResult | null {
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const candidates: MvpResult[] = [];

  trends.forEach((t, i) => {
    const weekPoints = t.dataPoints.filter(
      (dp) => new Date(dp.capturedAt).getTime() >= weekAgo,
    );
    if (weekPoints.length < 2) return;

    const first = weekPoints[0];
    const last = weekPoints[weekPoints.length - 1];

    const rpGained = Math.max(0, last.rankScore - first.rankScore);
    const killsGained = Math.max(0, (last.kills ?? 0) - (first.kills ?? 0));
    const damageGained = Math.max(0, (last.damage ?? 0) - (first.damage ?? 0));

    // Weighted score: RP counts most, then damage, then kills
    const score = rpGained * 1 + damageGained * 0.01 + killsGained * 10;

    candidates.push({
      name: t.name,
      rpGained,
      killsGained,
      damageGained,
      score,
      snapshots: weekPoints.length,
      color: PLAYER_COLORS[i % PLAYER_COLORS.length],
    });
  });

  if (!candidates.length) return null;
  return candidates.sort((a, b) => b.score - a.score)[0];
}

// ─── Chart helpers ────────────────────────────────────────────────────────────

function buildTrendChartData(trends: TrendPlayer[]) {
  if (!trends.length) return [];

  const allTimes = new Set<string>();
  const byPlayer: Record<string, Record<string, number>> = {};

  for (const t of trends) {
    byPlayer[t.name] = {};
    for (const dp of t.dataPoints) {
      allTimes.add(dp.capturedAt);
      byPlayer[t.name][dp.capturedAt] = dp.rankScore;
    }
  }

  return [...allTimes]
    .sort()
    .map((ts) => {
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

// ─── Main component ───────────────────────────────────────────────────────────

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

  const trendPlayers = (trends ?? []) as TrendPlayer[];
  const trendChartData = buildTrendChartData(trendPlayers);
  const hasTrends = trendChartData.length >= 2;

  const mvp = computeWeeklyMvp(trendPlayers, PLAYER_COLORS);

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
      </div>
    );
  }

  const noPlayers = squad.length === 0;

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
        <StatCard icon={<Users size={18} />} label="Players Tracked" value={fmt(data?.playerCount)} />
        <StatCard icon={<Trophy size={18} />} label="Top Ranked" value={data?.topRankedPlayer ?? "—"} hint={data?.topRankedRank ?? undefined} />
        <StatCard icon={<Crosshair size={18} />} label="Squad Kills" value={fmt(data?.totalKills)} />
        <StatCard icon={<Zap size={18} />} label="Squad Damage" value={fmt(data?.totalDamage)} />
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
          {/* Weekly MVP */}
          {mvp ? (
            <section
              className="rounded-2xl border border-border bg-gradient-to-br from-slate-900 to-slate-800 p-6 relative overflow-hidden"
              style={{ borderColor: mvp.color + "44" }}
            >
              <div
                className="absolute inset-0 opacity-5"
                style={{
                  background: `radial-gradient(ellipse at top left, ${mvp.color}, transparent 70%)`,
                }}
              />
              <div className="relative flex flex-col sm:flex-row sm:items-center gap-6">
                <div className="flex items-center gap-4">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                    style={{ background: mvp.color + "22", border: `1.5px solid ${mvp.color}44` }}
                  >
                    <Star size={24} style={{ color: mvp.color }} />
                  </div>
                  <div>
                    <div className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground mb-0.5">
                      Weekly MVP
                    </div>
                    <div className="text-3xl font-bold" style={{ color: mvp.color }}>
                      {mvp.name}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Based on {mvp.snapshots} snapshots in the last 7 days
                    </div>
                  </div>
                </div>

                <div className="sm:ml-auto flex gap-6 flex-wrap">
                  <MvpStat
                    icon={<TrendingUp size={14} />}
                    label="RP Gained"
                    value={`+${fmt(mvp.rpGained)}`}
                    color="text-cyan-400"
                  />
                  <MvpStat
                    icon={<Swords size={14} />}
                    label="New Kills"
                    value={mvp.killsGained > 0 ? `+${fmt(mvp.killsGained)}` : "—"}
                    color="text-rose-400"
                  />
                  <MvpStat
                    icon={<Flame size={14} />}
                    label="New Damage"
                    value={mvp.damageGained > 0 ? `+${fmt(mvp.damageGained)}` : "—"}
                    color="text-violet-400"
                  />
                </div>
              </div>
            </section>
          ) : hasTrends ? null : (
            <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 px-5 py-4 flex items-center gap-3 text-sm text-muted-foreground">
              <Star size={15} className="text-primary shrink-0" />
              Weekly MVP will appear once you have snapshots across at least 2 days this week.
            </div>
          )}

          {/* RP Trend */}
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
                    <XAxis dataKey="label" stroke="#64748b" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                    <Tooltip {...TOOLTIP_STYLE} />
                    <Legend />
                    {trendPlayers.map((t, i) => (
                      <Line
                        key={t.name}
                        type="monotone"
                        dataKey={t.name}
                        stroke={PLAYER_COLORS[i % PLAYER_COLORS.length]}
                        strokeWidth={2.5}
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

          {/* Comparison charts */}
          <section className="grid gap-6 xl:grid-cols-3">
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

            <ChartCard title="Total Kills" icon={<Crosshair size={14} className="text-primary" />}>
              <BarChart data={barData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" />
                <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Bar dataKey="Kills" fill="#f43f5e" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartCard>

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

          {/* K/D + player breakdown */}
          <section className="grid gap-6 xl:grid-cols-2">
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

            <div>
              <div className="flex items-center gap-2 mb-3">
                <Shield size={14} className="text-primary" />
                <h2 className="text-base font-semibold">Player Breakdown</h2>
              </div>
              <div className="space-y-3">
                {squad.map((p, i) => (
                  <div
                    key={p.playerId}
                    className="rounded-xl border border-border bg-card p-4 flex items-center gap-4"
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
            </div>
          </section>

          {/* Full squad table */}
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function MvpStat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color?: string }) {
  return (
    <div className="text-center">
      <div className={`flex items-center gap-1 justify-center text-xs text-muted-foreground mb-1 ${color}`}>
        {icon} {label}
      </div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function ChartCard({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
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

function Pill({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="text-right">
      <div className={`text-sm font-bold ${color ?? ""}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
    </div>
  );
}

function StatCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-primary">{icon}</div>
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className="text-2xl font-bold tracking-tight">{value}</div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
