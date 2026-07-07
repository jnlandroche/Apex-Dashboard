import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetDashboardSummary,
  useGetTrends,
  useGetMvpHistory,
  useGetMapRotation,
  useGetServerStatus,
  getGetDashboardSummaryQueryKey,
  getGetLeaderboardQueryKey,
  getGetSnapshotsQueryKey,
  getGetTrendsQueryKey,
  getGetMvpHistoryQueryKey,
  usePollStats,
} from "@workspace/api-client-react";
import {
  BarChart,
  Bar,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
  ReferenceLine,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
} from "recharts";
import {
  RefreshCw,
  Users,
  Trophy,
  Crosshair,
  Zap,
  TrendingUp,
  TrendingDown,
  Target,
  Shield,
  Star,
  Swords,
  Flame,
  Activity,
  Clock,
  ChevronRight,
  Minus,
  Server,
  Map,
  History,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { RankBadge } from "@/components/rank-badge";

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PLAYER_COLORS = ["#22d3ee", "#f59e0b", "#f43f5e", "#8b5cf6", "#10b981"];

const QUICK_PERIODS = [
  { key: "total", label: "Total",    ms: 0 },
  { key: "1h",   label: "Last 1h",  ms: 1  * 3_600_000 },
  { key: "4h",   label: "Last 4h",  ms: 4  * 3_600_000 },
  { key: "8h",   label: "Last 8h",  ms: 8  * 3_600_000 },
  { key: "24h",  label: "Last 24h", ms: 24 * 3_600_000 },
  { key: "48h",  label: "Last 48h", ms: 48 * 3_600_000 },
  { key: "7d",   label: "Last 7d",  ms: 7  * 24 * 3_600_000 },
] as const;
type PeriodKey = typeof QUICK_PERIODS[number]["key"];

const TOOLTIP_STYLE = {
  contentStyle: {
    background: "#0a0a10",
    border: "1px solid rgba(220,38,38,0.25)",
    borderRadius: 6,
    color: "#e2e8f0",
    fontSize: 12,
  },
};

// ─── Types ────────────────────────────────────────────────────────────────────

type TrendPlayer = {
  name: string;
  playerId: number;
  dataPoints: Array<{ capturedAt: string; rankScore: number; kills?: number | null; damage?: number | null }>;
};

type SquadPlayer = {
  playerId: number;
  name: string;
  avatar?: string | null;
  capturedAt?: string | null;
  rankName?: string | null;
  rankScore?: number | null;
  level?: number | null;
  kd?: number | null;
  kills?: number | null;
  damage?: number | null;
};

type SessionStats = {
  playerId: number;
  name: string;
  avatar?: string | null;
  rankName: string | null;
  rankScore: number | null;
  level: number | null;
  kd: number | null;
  rpDelta: number;
  killsDelta: number;
  damageDelta: number;
  snapshotCount: number;
  hasData: boolean;
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

type ActivityEntry = {
  player: string;
  playerId: number;
  timestamp: string;
  rpDelta: number;
  killsDelta: number;
  playerIndex: number;
};

// ─── Computation helpers ──────────────────────────────────────────────────────

function computeMvp(trends: TrendPlayer[], periodMs: number): MvpResult | null {
  const now = Date.now();
  const fromTime = periodMs > 0 ? now - periodMs : 0;
  const candidates: MvpResult[] = [];

  trends.forEach((t, i) => {
    const pts = periodMs > 0
      ? t.dataPoints.filter((dp) => new Date(dp.capturedAt).getTime() >= fromTime)
      : t.dataPoints;
    if (pts.length < 2) return;

    const first = pts[0];
    const last = pts[pts.length - 1];
    const rpGained = Math.max(0, last.rankScore - first.rankScore);
    const killsGained = Math.max(0, (last.kills ?? 0) - (first.kills ?? 0));
    const damageGained = Math.max(0, (last.damage ?? 0) - (first.damage ?? 0));
    const score = rpGained * 1 + damageGained * 0.01 + killsGained * 10;

    candidates.push({ name: t.name, rpGained, killsGained, damageGained, score, snapshots: pts.length, color: PLAYER_COLORS[i % PLAYER_COLORS.length] });
  });

  if (!candidates.length) return null;
  const allZero = candidates.every((c) => c.score === 0);
  if (allZero) return null;
  return candidates.sort((a, b) => b.score - a.score)[0];
}

function computeSessionStats(trends: TrendPlayer[], squad: SquadPlayer[], periodMs: number): SessionStats[] {
  const now = Date.now();
  const fromTime = now - periodMs;

  return trends.map((t) => {
    const sp = squad.find((s) => s.playerId === t.playerId);
    const inWindow = t.dataPoints.filter((dp) => new Date(dp.capturedAt).getTime() >= fromTime);
    const first = inWindow[0];
    const last = inWindow[inWindow.length - 1];
    const hasData = inWindow.length >= 1;

    return {
      playerId: t.playerId,
      name: t.name,
      avatar: sp?.avatar,
      rankName: sp?.rankName ?? null,
      rankScore: sp?.rankScore ?? null,
      level: sp?.level ?? null,
      kd: sp?.kd ?? null,
      rpDelta: first && last ? last.rankScore - first.rankScore : 0,
      killsDelta: first && last ? Math.max(0, (last.kills ?? 0) - (first.kills ?? 0)) : 0,
      damageDelta: first && last ? Math.max(0, (last.damage ?? 0) - (first.damage ?? 0)) : 0,
      snapshotCount: inWindow.length,
      hasData,
    };
  });
}

function computeRecentActivity(trends: TrendPlayer[]): ActivityEntry[] {
  const entries: ActivityEntry[] = [];
  trends.forEach((t, i) => {
    const pts = t.dataPoints;
    for (let j = 1; j < pts.length; j++) {
      const prev = pts[j - 1];
      const curr = pts[j];
      entries.push({
        player: t.name,
        playerId: t.playerId,
        timestamp: curr.capturedAt,
        rpDelta: curr.rankScore - prev.rankScore,
        killsDelta: Math.max(0, (curr.kills ?? 0) - (prev.kills ?? 0)),
        playerIndex: i,
      });
    }
  });
  return entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 8);
}

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

  return [...allTimes].sort().map((ts) => {
    const d = new Date(ts);
    const label = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
    const row: Record<string, string | number> = { label };
    for (const t of trends) {
      const val = byPlayer[t.name][ts];
      if (val !== undefined) row[t.name] = val;
    }
    return row;
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PlayerAvatar({ name, avatar, color, size = 38 }: { name: string; avatar?: string | null; color: string; size?: number }) {
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
        style={{ width: size, height: size, boxShadow: `0 0 12px ${color}44` }}
        onError={() => setImgFailed(true)}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold shrink-0 text-black"
      style={{ width: size, height: size, background: color, fontSize: size * 0.3, boxShadow: `0 0 14px ${color}55` }}
    >
      {initials}
    </div>
  );
}

function StatCard({
  icon, label, value, hint, accent = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-2 relative overflow-hidden transition-all duration-200 hover:border-red-900/60 group ${accent ? "border-red-900/40 bg-gradient-to-br from-red-950/30 to-card" : "border-border bg-card"}`}>
      {accent && (
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(220,38,38,0.08),transparent_70%)]" />
      )}
      <div className="relative flex items-center gap-2 text-red-500/80">
        {icon}
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
      </div>
      <div className={`relative text-2xl md:text-3xl font-black tracking-tight leading-none ${accent ? "text-white" : "text-foreground"}`}>{value}</div>
      {hint && <div className="relative text-xs text-muted-foreground font-mono">{hint}</div>}
    </div>
  );
}

function ChartCard({ title, icon, children, className = "" }: { title: string; icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-card p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-red-500">{icon}</span>
        <h3 className="text-sm font-semibold tracking-wide">{title}</h3>
      </div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function DeltaPill({ value, suffix = "" }: { value: number; suffix?: string }) {
  if (value === 0) return <span className="text-xs text-muted-foreground font-mono">—</span>;
  const positive = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-mono font-bold ${positive ? "text-emerald-400" : "text-rose-400"}`}>
      {positive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {positive ? "+" : ""}{fmt(value)}{suffix}
    </span>
  );
}

// ─── Player Card ──────────────────────────────────────────────────────────────

function PlayerCard({
  player,
  color,
  sessionStat,
  isSession,
  onNavigate,
}: {
  player: SquadPlayer;
  color: string;
  sessionStat?: SessionStats;
  isSession: boolean;
  onNavigate: (id: number) => void;
}) {
  return (
    <div
      className="rounded-xl border bg-card flex flex-col overflow-hidden transition-all duration-200 hover:shadow-lg group cursor-pointer"
      style={{ borderColor: color + "33" }}
      onClick={() => onNavigate(player.playerId)}
    >
      {/* Color accent bar */}
      <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, ${color}, transparent)` }} />

      <div className="p-5 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="relative">
            <PlayerAvatar name={player.name} avatar={player.avatar} color={color} size={52} />
          </div>
          <div className="flex-1 min-w-0">
            <div
              className="font-black text-lg leading-tight truncate group-hover:opacity-80 transition-opacity"
              style={{ color }}
            >
              {player.name}
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <RankBadge rankName={player.rankName} size={18} />
            </div>
          </div>
          <ChevronRight size={14} className="text-muted-foreground/50 shrink-0 mt-1 group-hover:text-primary transition-colors" />
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col gap-0.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">RP</div>
            <div className="text-base font-bold font-mono" style={{ color }}>{fmt(player.rankScore)}</div>
            {isSession && sessionStat && (
              <DeltaPill value={sessionStat.rpDelta} />
            )}
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Kills</div>
            <div className="text-base font-bold font-mono text-rose-400">{fmt(player.kills)}</div>
            <div className="text-[10px] text-muted-foreground font-mono">career</div>
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Dmg</div>
            <div className="text-base font-bold font-mono text-violet-400">
              {fmtK(player.damage)}
            </div>
          </div>
        </div>

        {/* Footer: level + K/D + last seen */}
        <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs text-muted-foreground font-mono">
          <span>Lv {player.level ?? "—"}</span>
          <span>K/D {player.kd != null && player.kd > 0 ? player.kd.toFixed(2) : "—"}</span>
          {player.capturedAt && (
            <span>{timeAgo(player.capturedAt)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export function Dashboard() {
  const { data, isLoading } = useGetDashboardSummary();
  const { data: trends } = useGetTrends();
  const { data: mvpHistory } = useGetMvpHistory({ limit: 10 });
  const { data: mapRotation } = useGetMapRotation();
  const { data: serverStatus } = useGetServerStatus();
  const pollStats = usePollStats();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [polling, setPolling] = useState(false);
  const [periodKey, setPeriodKey] = useState<PeriodKey>("7d");
  const [showMvpHistory, setShowMvpHistory] = useState(false);

  const squad = (data?.squadStats ?? []) as SquadPlayer[];
  const isSession = periodKey !== "total";
  const periodMs = QUICK_PERIODS.find((p) => p.key === periodKey)?.ms ?? 0;
  const periodLabel = QUICK_PERIODS.find((p) => p.key === periodKey)?.label ?? "";

  const trendPlayers = (trends ?? []) as TrendPlayer[];
  const trendChartData = buildTrendChartData(trendPlayers);
  const hasTrends = trendChartData.length >= 2;

  const sessionStats = useMemo(
    () => (isSession ? computeSessionStats(trendPlayers, squad, periodMs) : []),
    [isSession, trendPlayers, squad, periodMs],
  );

  // Period-aware MVP: for non-total views show RP gained in selected window
  const mvp = useMemo(() => computeMvp(trendPlayers, periodMs), [trendPlayers, periodMs]);

  const sessionLeader = isSession
    ? [...sessionStats].sort((a, b) => b.rpDelta - a.rpDelta)[0] ?? null
    : null;
  // Suppress session leader banner when all players have zero or negative RP delta
  const sessionLeaderHasData =
    sessionLeader && sessionStats.some((s) => s.rpDelta > 0);

  const recentActivity = useMemo(() => computeRecentActivity(trendPlayers), [trendPlayers]);

  const barData = isSession
    ? sessionStats.map((s) => ({ name: s.name.split(/(?=[A-Z])/)[0], RP: s.rpDelta, Kills: s.killsDelta, Damage: Math.round(s.damageDelta / 1000) }))
    : squad.map((p) => ({ name: p.name.split(/(?=[A-Z])/)[0], RP: p.rankScore ?? 0, Kills: p.kills ?? 0, Damage: Math.round((p.damage ?? 0) / 1000) }));

  const radarData = squad.map((p, i) => {
    const normRP = Math.min(100, Math.round(((p.rankScore ?? 0) / 15000) * 100));
    const normKills = Math.min(100, Math.round(((p.kills ?? 0) / 3000) * 100));
    const normDmg = Math.min(100, Math.round(((p.damage ?? 0) / 1_500_000) * 100));
    const normKD = Math.min(100, Math.round(((p.kd ?? 0) / 3) * 100));
    const normLevel = Math.min(100, Math.round(((p.level ?? 0) / 500) * 100));
    return { stat: p.name.substring(0, 8), RP: normRP, Kills: normKills, Damage: normDmg, KD: normKD, Level: normLevel };
  });

  // ── Map rotation helpers ────────────────────────────────────────────────────
  // mozambiquehe.re /maprotation returns { current: {...}, next: {...} }
  const mapRaw = mapRotation as Record<string, unknown> | undefined;
  const currentMap = (mapRaw?.current ?? (mapRaw?.battle_royale as Record<string, unknown> | undefined)?.current) as Record<string, unknown> | undefined;
  const nextMap = (mapRaw?.next ?? (mapRaw?.battle_royale as Record<string, unknown> | undefined)?.next) as Record<string, unknown> | undefined;

  // ── Server status helpers ───────────────────────────────────────────────────
  // mozambiquehe.re /servers returns top-level keys each with Status + ResponseTime
  const serverRaw = serverStatus as Record<string, unknown> | undefined;
  const getServerPing = (): { region: string; ping: number; status: string }[] => {
    if (!serverRaw) return [];
    const results: { region: string; ping: number; status: string }[] = [];
    for (const [region, val] of Object.entries(serverRaw)) {
      if (!val || typeof val !== "object") continue;
      const v = val as Record<string, unknown>;
      // Skip nested objects like "otherPlatforms" (no ResponseTime at top level)
      const ping = Number(v.ResponseTime ?? v.responseTime ?? 0);
      const status = String(v.Status ?? v.status ?? "UNKNOWN");
      if (ping > 0) {
        results.push({ region, ping, status });
      }
    }
    return results.sort((a, b) => a.ping - b.ping).slice(0, 6);
  };
  const serverPings = getServerPing();
  const allServersUp = serverPings.length > 0 && serverPings.every((s) => s.status === "UP");
  const hasServerIssues = serverPings.some((s) => s.status !== "UP");

  async function handleRefresh() {
    setPolling(true);
    pollStats.mutate(undefined, {
      onSuccess: (result) => {
        const ok = result.results.filter((r) => r.status === "updated").length;
        const errors = result.results.filter((r) => r.status === "error").length;
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetLeaderboardQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSnapshotsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetTrendsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMvpHistoryQueryKey() });
        toast({ title: errors > 0 ? "Partial refresh" : "Stats refreshed", description: errors > 0 ? `${ok} updated, ${errors} failed` : `${ok} player${ok !== 1 ? "s" : ""} updated` });
        setPolling(false);
      },
      onError: (err: unknown) => {
        toast({ title: "Refresh failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
        setPolling(false);
      },
    });
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-48 rounded-2xl bg-card border border-border" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-card border border-border" />)}
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-44 rounded-xl bg-card border border-border" />)}
        </div>
      </div>
    );
  }

  const noPlayers = squad.length === 0;

  return (
    <div className="space-y-6">

      {/* ── Hero Banner ────────────────────────────────────────────────────── */}
      <header className="rounded-2xl border relative overflow-hidden" style={{ borderColor: "rgba(220,38,38,0.25)", minHeight: 210 }}>
        <div className="absolute inset-0 bg-[#050508]" />
        <div className="absolute inset-0 bg-gradient-to-r from-red-950/70 via-[#050508]/90 to-[#050508]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_5%_50%,rgba(220,38,38,0.22),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_85%_10%,rgba(220,38,38,0.06),transparent_45%)]" />

        {/* Hex grid */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.05]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="hexg" x="0" y="0" width="56" height="48" patternUnits="userSpaceOnUse">
              <polygon points="28,2 52,14 52,38 28,50 4,38 4,14" fill="none" stroke="#dc2626" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hexg)" />
        </svg>

        {/* Diagonal slash accents */}
        <div className="absolute top-0 right-0 h-full w-2/3 opacity-[0.07]" style={{ background: "linear-gradient(108deg, transparent 38%, rgba(220,38,38,0.8) 38.4%, rgba(220,38,38,0.3) 39%, transparent 39.5%)" }} />
        <div className="absolute top-0 right-0 h-full w-2/3 opacity-[0.04]" style={{ background: "linear-gradient(108deg, transparent 46%, rgba(255,255,255,0.5) 46.4%, transparent 47%)" }} />

        {/* HUD corners */}
        <div className="absolute top-3 left-3 w-5 h-5 border-t-2 border-l-2 border-red-600/70 rounded-tl-sm" />
        <div className="absolute top-3 right-3 w-5 h-5 border-t-2 border-r-2 border-red-900/50 rounded-tr-sm" />
        <div className="absolute bottom-3 left-3 w-5 h-5 border-b-2 border-l-2 border-red-900/50 rounded-bl-sm" />
        <div className="absolute bottom-3 right-3 w-5 h-5 border-b-2 border-r-2 border-red-900/50 rounded-br-sm" />

        {/* Watermark A */}
        <svg className="absolute -right-6 -top-6 opacity-[0.035] select-none pointer-events-none" width="320" height="320" viewBox="0 0 40 40" fill="none">
          <path d="M20 2L37 11.5V28.5L20 38L3 28.5V11.5L20 2Z" fill="#dc2626" />
          <line x1="13" y1="29" x2="20" y2="11" stroke="white" strokeWidth="2.8" strokeLinecap="round" />
          <line x1="27" y1="29" x2="20" y2="11" stroke="white" strokeWidth="2.8" strokeLinecap="round" />
          <line x1="15" y1="22" x2="25" y2="22" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
        </svg>

        {/* Content */}
        <div className="relative z-10 p-6 md:p-8 flex flex-col md:flex-row md:items-end gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-1 h-4 rounded-full bg-red-500" />
              <span className="text-[10px] font-mono uppercase tracking-[0.4em] text-red-400/80">5SK · Apex Legends</span>
              <div className="flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded-full border border-slate-700/50 bg-slate-800/40">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Snapshot · 1h</span>
              </div>
            </div>

            <h1 className="text-4xl md:text-5xl font-black tracking-tighter leading-none">
              <span className="text-white">SQUAD </span>
              <span style={{ background: "linear-gradient(135deg, #ef4444 0%, #f97316 50%, #dc2626 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                COMMAND
              </span>
              <span className="text-white"> CENTER</span>
            </h1>

            <p className="mt-2 text-sm text-slate-500 max-w-lg">
              Track ranked progression, compare teammates, and review session performance from live Apex Legends API snapshots.
            </p>

            <button
              data-testid="button-refresh-stats"
              onClick={handleRefresh}
              disabled={polling || noPlayers}
              className="mt-5 flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm tracking-wide transition-all disabled:opacity-40 hover:scale-[1.02] active:scale-[0.97]"
              style={{ background: "linear-gradient(135deg, #ef4444, #b91c1c)", boxShadow: "0 0 20px rgba(220,38,38,0.3), inset 0 1px 0 rgba(255,255,255,0.1)", color: "white" }}
            >
              <RefreshCw size={15} className={polling ? "animate-spin" : ""} />
              {polling ? "Refreshing..." : "Refresh Stats Now"}
            </button>
          </div>

          {/* Quick squad stats inline */}
          {!noPlayers && (
            <div className="flex gap-4 md:gap-6 shrink-0">
              {[
                { label: "Squad", value: fmt(data?.playerCount), sub: "players" },
                { label: "Top Rank", value: data?.topRankedPlayer ?? "—", sub: data?.topRankedRank ?? "" },
                { label: "Total Kills", value: fmt(data?.totalKills), sub: "tracked" },
              ].map((s) => (
                <div key={s.label} className="flex flex-col items-center md:items-end gap-0.5">
                  <div className="text-[9px] font-mono uppercase tracking-[0.25em] text-red-400/70">{s.label}</div>
                  <div className="text-xl font-black text-white leading-none">{s.value}</div>
                  <div className="text-[9px] font-mono text-muted-foreground">{s.sub}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* ── Period toggle ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-[0.2em] shrink-0">View</span>
        <div className="flex flex-wrap gap-1">
          {QUICK_PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriodKey(p.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-mono font-medium tracking-wide transition-all duration-150 ${
                periodKey === p.key
                  ? "bg-primary text-white shadow-[0_0_12px_rgba(220,38,38,0.3)]"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-red-900/40"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {isSession && (
          <span className="text-[10px] text-muted-foreground font-mono italic">· RP/kills delta vs career totals</span>
        )}
      </div>

      {/* ── 4 Stat Cards ───────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Users size={16} />} label="Players Tracked" value={fmt(data?.playerCount)} />
        <StatCard icon={<Trophy size={16} />} label="Top Ranked" value={data?.topRankedPlayer ?? "—"} hint={data?.topRankedRank ?? undefined} accent />
        <StatCard icon={<Crosshair size={16} />} label="Squad Kills" value={fmt(data?.totalKills)} hint="career totals" />
        <StatCard icon={<Zap size={16} />} label="Squad Damage" value={fmtK(data?.totalDamage)} hint="career totals" />
      </section>

      {/* ── Empty state ─────────────────────────────────────────────────────── */}
      {noPlayers ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/30 p-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-950/40 border border-red-900/30 flex items-center justify-center mx-auto mb-4">
            <Users size={24} className="text-red-500" />
          </div>
          <h2 className="text-xl font-bold mb-2">No players tracked yet</h2>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto mb-5">
            Go to the Players page, add your squad members by Apex username, then hit Refresh Stats Now.
          </p>
          <button
            onClick={() => navigate("/players")}
            className="px-4 py-2 rounded-lg text-sm font-bold text-white"
            style={{ background: "linear-gradient(135deg, #ef4444, #b91c1c)" }}
          >
            Add Players
          </button>
        </div>
      ) : (
        <>

          {/* ── Squad Roster Cards ─────────────────────────────────────────── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Shield size={13} className="text-red-500" />
              <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">Squad Roster</h2>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {squad.map((p, i) => (
                <PlayerCard
                  key={p.playerId}
                  player={p}
                  color={PLAYER_COLORS[i % PLAYER_COLORS.length]}
                  sessionStat={isSession ? sessionStats.find((s) => s.playerId === p.playerId) : undefined}
                  isSession={isSession}
                  onNavigate={(id) => navigate(`/players/${id}`)}
                />
              ))}
            </div>
          </section>

          {/* ── MVP / Session Leader ───────────────────────────────────────── */}
          {isSession ? (
            sessionLeaderHasData ? (() => {
              const sl = sessionLeader!;
              const idx = trendPlayers.findIndex((t) => t.playerId === sl.playerId);
              const color = PLAYER_COLORS[idx >= 0 ? idx % PLAYER_COLORS.length : 0];
              return (
                <section className="rounded-xl border bg-card p-5 relative overflow-hidden" style={{ borderColor: color + "44" }}>
                  <div className="absolute inset-0 opacity-[0.04]" style={{ background: `radial-gradient(ellipse at top left, ${color}, transparent 60%)` }} />
                  <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: color + "18", border: `1px solid ${color}40` }}>
                        <Star size={20} style={{ color }} />
                      </div>
                      <div>
                        <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground mb-0.5">Session Leader</div>
                        <div className="text-2xl font-black" style={{ color }}>{sl.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{QUICK_PERIODS.find((p) => p.key === periodKey)?.label} · {sl.snapshotCount} snapshot{sl.snapshotCount !== 1 ? "s" : ""}</div>
                      </div>
                    </div>
                    <div className="sm:ml-auto grid grid-cols-3 gap-4">
                      {[
                        { label: "RP Gained", value: sl.rpDelta >= 0 ? `+${fmt(sl.rpDelta)}` : fmt(sl.rpDelta), color: "text-emerald-400" },
                        { label: "Kills", value: sl.killsDelta > 0 ? `+${fmt(sl.killsDelta)}` : "—", color: "text-rose-400" },
                        { label: "Damage", value: sl.damageDelta > 0 ? `+${fmtK(sl.damageDelta)}` : "—", color: "text-violet-400" },
                      ].map((s) => (
                        <div key={s.label} className="text-center">
                          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{s.label}</div>
                          <div className={`text-lg font-black font-mono ${s.color}`}>{s.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              );
            })() : (
              <div className="rounded-xl border border-dashed border-border/50 bg-card/20 px-5 py-4 flex items-center gap-3 text-sm text-muted-foreground">
                <Clock size={14} className="text-muted-foreground shrink-0" />
                No RP changes detected in this window. Try a wider period or refresh stats.
              </div>
            )
          ) : mvp ? (
            <section>
              <div className="rounded-xl border bg-card p-5 relative overflow-hidden" style={{ borderColor: mvp.color + "44" }}>
                <div className="absolute inset-0 opacity-[0.04]" style={{ background: `radial-gradient(ellipse at top left, ${mvp.color}, transparent 60%)` }} />
                <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: mvp.color + "18", border: `1px solid ${mvp.color}40` }}>
                      <Star size={20} style={{ color: mvp.color }} />
                    </div>
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground mb-0.5">
                        {periodKey === "total" ? "All-Time Leader" : `${periodLabel} MVP`}
                      </div>
                      <div className="text-2xl font-black" style={{ color: mvp.color }}>{mvp.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{mvp.snapshots} snapshots · {periodLabel}</div>
                    </div>
                  </div>
                  <div className="sm:ml-auto grid grid-cols-3 gap-4">
                    {[
                      { label: "RP Gained", value: mvp.rpGained > 0 ? `+${fmt(mvp.rpGained)}` : "—", color: "text-emerald-400" },
                      { label: "Kills Δ", value: mvp.killsGained > 0 ? `+${fmt(mvp.killsGained)}` : "—", color: "text-rose-400" },
                      { label: "Damage Δ", value: mvp.damageGained > 0 ? `+${fmtK(mvp.damageGained)}` : "—", color: "text-violet-400" },
                    ].map((s) => (
                      <div key={s.label} className="text-center">
                        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{s.label}</div>
                        <div className={`text-lg font-black font-mono ${s.color}`}>{s.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* MVP History toggle */}
              {mvpHistory && mvpHistory.length > 0 && (
                <div className="mt-2">
                  <button
                    onClick={() => setShowMvpHistory((v) => !v)}
                    className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors px-1 py-1"
                  >
                    <History size={11} />
                    MVP History
                    {showMvpHistory ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                  </button>
                  {showMvpHistory && (
                    <div className="mt-2 rounded-xl border border-border bg-card overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground border-b border-border">
                              <th className="text-left px-4 py-2">Recorded</th>
                              <th className="text-left px-4 py-2">Window</th>
                              <th className="text-left px-4 py-2">MVP</th>
                              <th className="text-left px-4 py-2">RP</th>
                              <th className="text-left px-4 py-2">Kills Δ</th>
                              <th className="text-left px-4 py-2">Score</th>
                            </tr>
                          </thead>
                          <tbody>
                            {mvpHistory.map((r) => {
                              const pi = trendPlayers.findIndex((t) => t.name === r.playerName);
                              const color = PLAYER_COLORS[pi >= 0 ? pi % PLAYER_COLORS.length : 0];
                              return (
                                <tr key={r.id} className="border-b border-border/40 hover:bg-white/[0.015] transition-colors">
                                  <td className="px-4 py-2 font-mono text-muted-foreground">{timeAgo(r.computedAt)}</td>
                                  <td className="px-4 py-2 font-mono text-muted-foreground">{r.periodLabel}</td>
                                  <td className="px-4 py-2 font-bold" style={{ color }}>{r.playerName}</td>
                                  <td className="px-4 py-2 font-mono text-emerald-400">+{fmt(r.rpGained)}</td>
                                  <td className="px-4 py-2 font-mono text-rose-400">{r.killsGained > 0 ? `+${r.killsGained}` : "—"}</td>
                                  <td className="px-4 py-2 font-mono text-muted-foreground">{r.score.toFixed(0)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          ) : (
            <div className="rounded-xl border border-dashed border-border/50 bg-card/20 px-5 py-4 flex items-center gap-3 text-sm text-muted-foreground">
              <Star size={14} className="text-muted-foreground/50 shrink-0" />
              No MVP data for this period — not enough snapshots yet. Try a wider window.
            </div>
          )}

          {/* ── Map Rotation + Server Status ──────────────────────────────── */}
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Map Rotation */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Map size={13} className="text-red-500" />
                <h3 className="text-sm font-semibold tracking-wide">Map Rotation</h3>
              </div>
              {currentMap ? (
                <div className="space-y-2">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                    <div>
                      <div className="text-[10px] font-mono uppercase text-muted-foreground">Now Playing</div>
                      <div className="font-bold text-sm text-white">{String(currentMap.map ?? currentMap.Map ?? "—")}</div>
                      {currentMap.remainingSecs != null && (
                        <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                          {Math.ceil(Number(currentMap.remainingSecs) / 60)}m remaining
                        </div>
                      )}
                    </div>
                  </div>
                  {nextMap && (
                    <div className="flex items-start gap-3 opacity-60">
                      <div className="mt-0.5 w-2 h-2 rounded-full bg-slate-500 shrink-0" />
                      <div>
                        <div className="text-[10px] font-mono uppercase text-muted-foreground">Up Next</div>
                        <div className="text-sm text-slate-300">{String(nextMap.map ?? nextMap.Map ?? "—")}</div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono py-2">
                  <Map size={12} className="opacity-40" />
                  Map data unavailable
                </div>
              )}
            </div>

            {/* Server Status */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Server size={13} className={hasServerIssues ? "text-rose-400" : allServersUp ? "text-emerald-400" : "text-red-500"} />
                <h3 className="text-sm font-semibold tracking-wide">Server Status</h3>
                {serverPings.length > 0 && (
                  <span className={`ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded-full border ${
                    hasServerIssues
                      ? "text-rose-400 border-rose-900/40 bg-rose-950/20"
                      : "text-emerald-400 border-emerald-900/40 bg-emerald-950/20"
                  }`}>
                    {hasServerIssues ? "ISSUES" : "ONLINE"}
                  </span>
                )}
              </div>
              {serverPings.length > 0 ? (
                <div className="space-y-1.5">
                  {serverPings.map((s) => (
                    <div key={s.region} className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.status === "UP" ? "bg-emerald-400" : "bg-rose-400"}`} />
                      <span className="text-[10px] font-mono text-muted-foreground truncate flex-1">{s.region.replace(/_/g, " ")}</span>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">{s.ping}ms</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono py-2">
                  <AlertCircle size={12} className="opacity-40" />
                  Status unavailable
                </div>
              )}
            </div>

            {/* Quick squad RP summary */}
            {!noPlayers && (
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Trophy size={13} className="text-red-500" />
                  <h3 className="text-sm font-semibold tracking-wide">Squad RP</h3>
                </div>
                <div className="space-y-2">
                  {squad.map((p, i) => {
                    const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
                    const maxRp = Math.max(...squad.map((s) => s.rankScore ?? 0), 1);
                    const pct = Math.round(((p.rankScore ?? 0) / maxRp) * 100);
                    return (
                      <div key={p.playerId}>
                        <div className="flex justify-between items-center mb-0.5">
                          <span className="text-xs font-bold" style={{ color }}>{p.name}</span>
                          <span className="text-[10px] font-mono text-muted-foreground">{fmt(p.rankScore)} RP</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* ── RP Trend + Recent Activity ─────────────────────────────────── */}
          <section className="grid gap-4 xl:grid-cols-3">
            {/* RP Trend Chart */}
            {hasTrends && (
              <div className="xl:col-span-2 rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp size={14} className="text-red-500" />
                  <h3 className="text-sm font-semibold tracking-wide">RP Progression</h3>
                  <div className="ml-auto flex gap-3">
                    {trendPlayers.map((t, i) => (
                      <div key={t.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <div className="w-2 h-2 rounded-full" style={{ background: PLAYER_COLORS[i % PLAYER_COLORS.length] }} />
                        {t.name}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="label" stroke="#374151" tick={{ fontSize: 10, fill: "#6b7280" }} interval="preserveStartEnd" />
                      <YAxis stroke="#374151" tick={{ fontSize: 10, fill: "#6b7280" }} />
                      <Tooltip {...TOOLTIP_STYLE} />
                      {trendPlayers.map((t, i) => (
                        <Line key={t.name} type="monotone" dataKey={t.name} stroke={PLAYER_COLORS[i % PLAYER_COLORS.length]} strokeWidth={2} dot={{ r: 2.5, fill: PLAYER_COLORS[i % PLAYER_COLORS.length] }} activeDot={{ r: 4 }} connectNulls />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Snapshot Changes Feed */}
            <div className="rounded-xl border border-border bg-card p-4 flex flex-col">
              <div className="flex items-center gap-2 mb-1">
                <Activity size={14} className="text-red-500" />
                <h3 className="text-sm font-semibold tracking-wide">Snapshot Changes</h3>
              </div>
              <p className="text-[10px] font-mono text-muted-foreground mb-3">
                RP/kill differences between consecutive hourly snapshots — not individual matches.
              </p>
              {recentActivity.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground font-mono">
                  No snapshot deltas yet — data accumulates over time.
                </div>
              ) : (
                <div className="space-y-2 flex-1 overflow-y-auto">
                  {recentActivity.map((entry, i) => {
                    const color = PLAYER_COLORS[entry.playerIndex % PLAYER_COLORS.length];
                    return (
                      <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.02] border border-border/50">
                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold truncate" style={{ color }}>{entry.player}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">{timeAgo(entry.timestamp)}</div>
                        </div>
                        <div className="flex flex-col items-end gap-0.5">
                          <span className={`text-xs font-mono font-bold ${entry.rpDelta > 0 ? "text-emerald-400" : entry.rpDelta < 0 ? "text-rose-400" : "text-muted-foreground"}`}>
                            {entry.rpDelta > 0 ? "+" : ""}{fmt(entry.rpDelta)} RP
                          </span>
                          {entry.killsDelta > 0 && (
                            <span className="text-[10px] font-mono text-rose-400">+{entry.killsDelta} kills</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* ── Comparison Charts ──────────────────────────────────────────── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Swords size={13} className="text-red-500" />
              <h2 className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">Player Comparison</h2>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <ChartCard title={isSession ? "RP Gained" : "Rank Points"} icon={<Trophy size={13} />}>
                <BarChart data={barData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="name" stroke="#374151" tick={{ fontSize: 11, fill: "#6b7280" }} />
                  <YAxis stroke="#374151" tick={{ fontSize: 11, fill: "#6b7280" }} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Bar dataKey="RP" radius={[4, 4, 0, 0]} maxBarSize={52}>
                    {barData.map((_, i) => <Cell key={i} fill={PLAYER_COLORS[i % PLAYER_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ChartCard>

              <ChartCard title={isSession ? "Kills Gained" : "Total Kills"} icon={<Crosshair size={13} />}>
                <BarChart data={barData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="name" stroke="#374151" tick={{ fontSize: 11, fill: "#6b7280" }} />
                  <YAxis stroke="#374151" tick={{ fontSize: 11, fill: "#6b7280" }} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Bar dataKey="Kills" radius={[4, 4, 0, 0]} maxBarSize={52}>
                    {barData.map((_, i) => <Cell key={i} fill={PLAYER_COLORS[i % PLAYER_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ChartCard>

              <ChartCard title={isSession ? "Damage Gained (k)" : "Damage (k)"} icon={<Zap size={13} />}>
                <BarChart data={barData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="name" stroke="#374151" tick={{ fontSize: 11, fill: "#6b7280" }} />
                  <YAxis stroke="#374151" tick={{ fontSize: 11, fill: "#6b7280" }} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [`${v}k`, "Damage"]} />
                  <Bar dataKey="Damage" radius={[4, 4, 0, 0]} maxBarSize={52}>
                    {barData.map((_, i) => <Cell key={i} fill={PLAYER_COLORS[i % PLAYER_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ChartCard>
            </div>
          </section>

          {/* ── Radar + K/D ───────────────────────────────────────────────── */}
          {squad.length >= 2 && (
            <section className="grid gap-4 lg:grid-cols-2">
              {/* Radar comparison */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Target size={13} className="text-red-500" />
                  <h3 className="text-sm font-semibold tracking-wide">Player Performance Radar</h3>
                  <span className="text-[10px] text-muted-foreground font-mono ml-auto">normalized</span>
                </div>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={[
                      { stat: "RP", ...Object.fromEntries(squad.map((p, i) => [p.name, Math.min(100, Math.round(((p.rankScore ?? 0) / 15000) * 100))])) },
                      { stat: "Kills", ...Object.fromEntries(squad.map((p) => [p.name, Math.min(100, Math.round(((p.kills ?? 0) / 3000) * 100))])) },
                      { stat: "Damage", ...Object.fromEntries(squad.map((p) => [p.name, Math.min(100, Math.round(((p.damage ?? 0) / 1_500_000) * 100))])) },
                      { stat: "K/D", ...Object.fromEntries(squad.map((p) => [p.name, Math.min(100, Math.round(((p.kd ?? 0) / 3) * 100))])) },
                      { stat: "Level", ...Object.fromEntries(squad.map((p) => [p.name, Math.min(100, Math.round(((p.level ?? 0) / 500) * 100))])) },
                    ]}>
                      <PolarGrid stroke="rgba(255,255,255,0.06)" />
                      <PolarAngleAxis dataKey="stat" tick={{ fontSize: 10, fill: "#6b7280" }} />
                      {squad.map((p, i) => (
                        <Radar key={p.name} name={p.name} dataKey={p.name} stroke={PLAYER_COLORS[i % PLAYER_COLORS.length]} fill={PLAYER_COLORS[i % PLAYER_COLORS.length]} fillOpacity={0.08} strokeWidth={1.5} />
                      ))}
                      <Tooltip {...TOOLTIP_STYLE} />
                      <Legend iconType="circle" iconSize={8} formatter={(value) => <span style={{ fontSize: 10, color: "#9ca3af" }}>{value}</span>} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* K/D horizontal bars */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Crosshair size={13} className="text-red-500" />
                  <h3 className="text-sm font-semibold tracking-wide">K/D Ratio</h3>
                  <span className="text-[10px] text-muted-foreground font-mono ml-auto">lifetime</span>
                </div>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={squad.map((p, i) => ({ name: p.name, KD: p.kd ?? 0, color: PLAYER_COLORS[i % PLAYER_COLORS.length] }))} layout="vertical" margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                      <XAxis type="number" stroke="#374151" tick={{ fontSize: 10, fill: "#6b7280" }} />
                      <YAxis type="category" dataKey="name" stroke="#374151" tick={{ fontSize: 11, fill: "#9ca3af" }} width={80} />
                      <Tooltip {...TOOLTIP_STYLE} formatter={(v: unknown) => [(v as number) > 0 ? (v as number).toFixed(2) : "—", "K/D"]} />
                      <ReferenceLine x={1} stroke="rgba(220,38,38,0.4)" strokeDasharray="4 4" label={{ value: "1.0", fill: "#6b7280", fontSize: 9 }} />
                      <Bar dataKey="KD" radius={[0, 4, 4, 0]} maxBarSize={28}>
                        {squad.map((_, i) => <Cell key={i} fill={PLAYER_COLORS[i % PLAYER_COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>
          )}

          {/* ── Squad Stats Table ──────────────────────────────────────────── */}
          <section className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-3 p-4 border-b border-border">
              <Shield size={13} className="text-red-500" />
              <h3 className="text-sm font-semibold tracking-wide">
                {isSession ? "Session Breakdown" : "Squad Stats"}
              </h3>
              {isSession && (
                <span className="ml-auto text-[10px] font-mono text-muted-foreground italic">
                  {QUICK_PERIODS.find((p) => p.key === periodKey)?.label} window
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-[10px] font-mono uppercase tracking-wider border-b border-border">
                    <th className="text-left p-4">Player</th>
                    <th className="text-left p-4">Rank</th>
                    <th className="text-left p-4">{isSession ? "RP Δ" : "RP"}</th>
                    <th className="text-left p-4">Level</th>
                    <th className="text-left p-4">{isSession ? "Kills Δ" : "Kills"}</th>
                    <th className="text-left p-4">{isSession ? "Damage Δ" : "Damage"}</th>
                    <th className="text-left p-4">K/D</th>
                    {!isSession && <th className="text-left p-4">Last Seen</th>}
                    {isSession && <th className="text-left p-4">Snapshots</th>}
                  </tr>
                </thead>
                <tbody>
                  {isSession
                    ? sessionStats.map((s, i) => (
                        <tr key={s.playerId} className="border-b border-border/40 hover:bg-white/[0.015] transition-colors">
                          <td className="p-4">
                            <button onClick={() => navigate(`/players/${s.playerId}`)} className="flex items-center gap-3 group">
                              <PlayerAvatar name={s.name} avatar={s.avatar} color={PLAYER_COLORS[i % PLAYER_COLORS.length]} size={32} />
                              <span className="font-bold group-hover:text-primary transition-colors">{s.name}</span>
                            </button>
                          </td>
                          <td className="p-4"><RankBadge rankName={s.rankName} size={20} /></td>
                          <td className={`p-4 font-mono font-bold ${s.rpDelta > 0 ? "text-emerald-400" : s.rpDelta < 0 ? "text-rose-400" : "text-muted-foreground"}`}>
                            {s.rpDelta > 0 ? `+${fmt(s.rpDelta)}` : fmt(s.rpDelta)}
                          </td>
                          <td className="p-4 text-muted-foreground">{fmt(s.level)}</td>
                          <td className={`p-4 font-mono ${s.killsDelta > 0 ? "text-rose-400" : "text-muted-foreground"}`}>
                            {s.hasData ? (s.killsDelta > 0 ? `+${fmt(s.killsDelta)}` : "0") : "—"}
                          </td>
                          <td className={`p-4 font-mono ${s.damageDelta > 0 ? "text-violet-400" : "text-muted-foreground"}`}>
                            {s.hasData ? (s.damageDelta > 0 ? `+${fmtK(s.damageDelta)}` : "0") : "—"}
                          </td>
                          <td className="p-4 font-mono text-emerald-400">{s.kd != null && s.kd > 0 ? s.kd.toFixed(2) : "—"}</td>
                          <td className="p-4 text-muted-foreground">{s.snapshotCount}</td>
                        </tr>
                      ))
                    : squad.map((s, i) => (
                        <tr key={s.playerId} className="border-b border-border/40 hover:bg-white/[0.015] transition-colors">
                          <td className="p-4">
                            <button onClick={() => navigate(`/players/${s.playerId}`)} className="flex items-center gap-3 group">
                              <PlayerAvatar name={s.name} avatar={s.avatar} color={PLAYER_COLORS[i % PLAYER_COLORS.length]} size={32} />
                              <span className="font-bold group-hover:text-primary transition-colors">{s.name}</span>
                            </button>
                          </td>
                          <td className="p-4"><RankBadge rankName={s.rankName} size={20} /></td>
                          <td className="p-4 font-mono font-semibold text-primary">{fmt(s.rankScore)}</td>
                          <td className="p-4 text-muted-foreground">{fmt(s.level)}</td>
                          <td className="p-4 font-mono">{fmt(s.kills)}</td>
                          <td className="p-4 font-mono">{fmtK(s.damage)}</td>
                          <td className="p-4 font-mono text-emerald-400">{s.kd != null && s.kd > 0 ? s.kd.toFixed(2) : "—"}</td>
                          <td className="p-4 text-muted-foreground text-xs font-mono">
                            {s.capturedAt ? timeAgo(s.capturedAt) : "—"}
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Data Limitations Note ──────────────────────────────────── */}
          <div className="rounded-xl border border-border/40 bg-card/40 p-4 flex items-start gap-3">
            <Minus size={13} className="text-muted-foreground/50 shrink-0 mt-0.5" />
            <p className="text-[11px] font-mono text-muted-foreground leading-relaxed">
              <strong className="text-slate-400">About this data:</strong> Kills and damage are all-time career totals from the mozambiquehe.re API — not per-session.
              Session and window views show the <em>difference</em> between snapshots taken in that period.
              Match history is unavailable from this API; tracking begins from the first snapshot taken after a player is added.
              For PC players, the lookup uses the <strong className="text-slate-400">EA/Origin account name</strong>, which may differ from the Steam display name.
              Use the <strong className="text-slate-400">API Debug</strong> panel to inspect raw responses and troubleshoot missing data.
            </p>
          </div>

        </>
      )}
    </div>
  );
}
