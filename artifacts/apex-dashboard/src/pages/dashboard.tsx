import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetDashboardSummary,
  getGetDashboardSummaryQueryKey,
  getGetLeaderboardQueryKey,
  getGetSnapshotsQueryKey,
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
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { RefreshCw, Users, Trophy, Crosshair, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString();
}

const CHART_COLORS = ["#22d3ee", "#f59e0b", "#f43f5e", "#8b5cf6", "#10b981"];

export function Dashboard() {
  const { data, isLoading } = useGetDashboardSummary();
  const pollStats = usePollStats();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [polling, setPolling] = useState(false);

  const squad = data?.squadStats ?? [];
  const chartData = squad.map((p) => ({
    name: p.name,
    rank_score: p.rankScore ?? 0,
    kills: p.kills ?? 0,
    damage: p.damage ?? 0,
  }));

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
          {/* Charts */}
          <section className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-base font-semibold mb-4 text-foreground">Rank Score by Player</h2>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                    <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 12 }} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(222,47%,9%)",
                        border: "1px solid hsl(217,32%,17%)",
                        borderRadius: 8,
                        color: "#e2e8f0",
                      }}
                    />
                    <Bar dataKey="rank_score" fill="#22d3ee" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5">
              <h2 className="text-base font-semibold mb-4 text-foreground">Kill Share</h2>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      dataKey="kills"
                      nameKey="name"
                      outerRadius={90}
                      label={({ name, percent }) =>
                        `${name} ${(percent * 100).toFixed(0)}%`
                      }
                      labelLine={false}
                    >
                      {chartData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "hsl(222,47%,9%)",
                        border: "1px solid hsl(217,32%,17%)",
                        borderRadius: 8,
                        color: "#e2e8f0",
                      }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* Squad table */}
          <section className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="p-5 border-b border-border">
              <h2 className="text-base font-semibold">Current Squad Snapshot</h2>
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
