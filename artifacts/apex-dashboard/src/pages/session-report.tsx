import { useState, useMemo } from "react";
import { useGetSnapshots, useGetLeaderboard } from "@workspace/api-client-react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Trophy,
  Crosshair,
  Zap,
  Target,
  Clock,
  Star,
  ChevronDown,
  Copy,
  Check,
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
  realtimeState?: string | null;
};

type PlayerReport = {
  playerId: number;
  name: string;
  avatar?: string | null;
  from: Snapshot;
  to: Snapshot;
  rpDelta: number;
  killsDelta: number;
  damageDelta: number;
  kdDelta: number;
  colorIdx: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PLAYER_COLORS = ["#22d3ee", "#f59e0b", "#f43f5e", "#8b5cf6", "#10b981"];

const QUICK_RANGES = [
  { label: "Last 1h", hours: 1 },
  { label: "Last 4h", hours: 4 },
  { label: "Last 8h", hours: 8 },
  { label: "Last 24h", hours: 24 },
  { label: "Last 48h", hours: 48 },
  { label: "Last 7d", hours: 24 * 7 },
];

// A gap of this length with no stat movement (kills/damage/RP flat) across the whole
// squad is treated as "between sessions." 40 minutes sits between typical lobby-queue
// downtime (shouldn't count as a break) and an actual step-away (should). Tune this if
// realtimeState (online/offline) proves reliable enough to replace the heuristic entirely.
const SESSION_GAP_MS = 40 * 60 * 1000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString();
}

function fmtDelta(n: number, suffix = "") {
  if (n === 0) return `0${suffix}`;
  return `${n > 0 ? "+" : ""}${n.toLocaleString()}${suffix}`;
}

function toLocalDatetimeValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Find the most recent snapshot at or before a given time
function closestBefore(snaps: Snapshot[], time: Date): Snapshot | null {
  const ts = time.getTime();
  const candidates = snaps.filter((s) => new Date(s.capturedAt).getTime() <= ts);
  if (!candidates.length) return null;
  return candidates.reduce((best, s) =>
    new Date(s.capturedAt).getTime() > new Date(best.capturedAt).getTime() ? s : best,
  );
}

// Find the closest snapshot to a time (either direction)
function closestTo(snaps: Snapshot[], time: Date): Snapshot | null {
  if (!snaps.length) return null;
  const ts = time.getTime();
  return snaps.reduce((best, s) => {
    const da = Math.abs(new Date(s.capturedAt).getTime() - ts);
    const db = Math.abs(new Date(best.capturedAt).getTime() - ts);
    return da < db ? s : best;
  });
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SessionReport() {
  const { data: allSnapshots, isLoading } = useGetSnapshots();
  const { data: leaderboard } = useGetLeaderboard();

  // Build name → avatar map from leaderboard data
  const avatarByName = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const p of leaderboard ?? []) {
      map[p.name] = p.avatar ?? null;
    }
    return map;
  }, [leaderboard]);

  // Default: last 8 hours
  const [fromDate, setFromDate] = useState<Date>(() => new Date(Date.now() - 8 * 60 * 60 * 1000));
  const [toDate, setToDate] = useState<Date>(() => new Date());
  const [activeQuick, setActiveQuick] = useState<number>(8);

  function applyQuick(hours: number) {
    setActiveQuick(hours);
    setFromDate(new Date(Date.now() - hours * 60 * 60 * 1000));
    setToDate(new Date());
  }

  // Finds the most recent "session": walk all snapshots across the squad backward from
  // now and stop at the first gap ≥ SESSION_GAP_MS with no activity, or the first snapshot
  // whose realtimeState explicitly says "offline" (when the API provides it — treated as
  // a stronger signal than the timing heuristic alone).
  function detectLastSession() {
    const allSnaps: Snapshot[] = [];
    for (const snaps of byPlayer.values()) allSnaps.push(...snaps);
    if (!allSnaps.length) return;

    allSnaps.sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime());

    let sessionEnd = new Date(allSnaps[0].capturedAt);
    let sessionStart = sessionEnd;

    for (let i = 0; i < allSnaps.length - 1; i++) {
      const current = new Date(allSnaps[i].capturedAt);
      const prev = new Date(allSnaps[i + 1].capturedAt);
      const gap = current.getTime() - prev.getTime();

      const wentOffline =
        allSnaps[i + 1].realtimeState?.toLowerCase() === "offline" &&
        allSnaps[i].realtimeState?.toLowerCase() !== "offline";

      if (gap >= SESSION_GAP_MS || wentOffline) break;
      sessionStart = prev;
    }

    setActiveQuick(-1);
    setFromDate(sessionStart);
    setToDate(sessionEnd);
  }

  // Group snapshots by player (sorted oldest-first per player)
  const byPlayer = useMemo(() => {
    const map = new Map<number, Snapshot[]>();
    for (const s of (allSnapshots ?? []) as Snapshot[]) {
      if (!map.has(s.playerId)) map.set(s.playerId, []);
      map.get(s.playerId)!.push(s);
    }
    // Sort each player's snapshots oldest-first
    for (const snaps of map.values()) {
      snaps.sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime());
    }
    return map;
  }, [allSnapshots]);

  // Build per-player reports
  const reports = useMemo<PlayerReport[]>(() => {
    const results: PlayerReport[] = [];
    let colorIdx = 0;

    for (const [playerId, snaps] of byPlayer) {
      const name = snaps[0]?.playerName ?? `Player ${playerId}`;

      // "from" = closest snapshot at or before fromDate (fall back to closest overall)
      const fromSnap = closestBefore(snaps, fromDate) ?? closestTo(snaps, fromDate);
      // "to" = closest snapshot at or before toDate
      const toSnap = closestBefore(snaps, toDate) ?? closestTo(snaps, toDate);

      if (!fromSnap || !toSnap) continue;

      results.push({
        playerId,
        name,
        avatar: avatarByName[name] ?? null,
        from: fromSnap,
        to: toSnap,
        rpDelta: (toSnap.rankScore ?? 0) - (fromSnap.rankScore ?? 0),
        killsDelta: (toSnap.kills ?? 0) - (fromSnap.kills ?? 0),
        damageDelta: (toSnap.damage ?? 0) - (fromSnap.damage ?? 0),
        kdDelta: Math.round(((toSnap.kd ?? 0) - (fromSnap.kd ?? 0)) * 100) / 100,
        colorIdx: colorIdx++,
      });
    }

    // Sort by RP delta descending
    return results.sort((a, b) => b.rpDelta - a.rpDelta);
  }, [byPlayer, fromDate, toDate, avatarByName]);

  // Winner only exists when at least one player has a positive RP delta
  const sessionWinner = reports.find((r) => r.rpDelta > 0) ?? null;
  const hasData = reports.length > 0;
  const sameSnapshot = reports.some((r) => r.from.id === r.to.id);

  // Compute actual session duration from real snapshot timestamps
  const sessionDurationLabel = useMemo(() => {
    if (reports.length === 0) return null;
    const starts = reports.map((r) => new Date(r.from.capturedAt).getTime());
    const ends = reports.map((r) => new Date(r.to.capturedAt).getTime());
    const minStart = Math.min(...starts);
    const maxEnd = Math.max(...ends);
    const diffMs = maxEnd - minStart;
    if (diffMs <= 0) return null;
    const h = Math.floor(diffMs / 3600000);
    const m = Math.floor((diffMs % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }, [reports]);

  // Track which players had closestBefore fallback (window expansion)
  const expandedPlayers = useMemo(() => {
    const expanded = new Set<number>();
    for (const [playerId, snaps] of byPlayer) {
      const fromSnap = closestBefore(snaps, fromDate);
      if (!fromSnap) expanded.add(playerId);
    }
    return expanded;
  }, [byPlayer, fromDate]);

  const [copied, setCopied] = useState(false);

  function buildDiscordSummary() {
    const rangeLabel =
      activeQuick > 0
        ? `Last ${activeQuick >= 24 ? activeQuick / 24 + "d" : activeQuick + "h"}`
        : `${fromDate.toLocaleString()} → ${toDate.toLocaleString()}`;

    const lines: string[] = [
      `🎮 **5SK Apex Legends — Session Report** (${rangeLabel})`,
      "",
    ];

    if (sessionWinner && reports.length > 1) {
      lines.push(`🏆 **Session Winner: ${sessionWinner.name}**`);
      const parts = [];
      if (sessionWinner.rpDelta !== 0) parts.push(`${sessionWinner.rpDelta > 0 ? "+" : ""}${sessionWinner.rpDelta.toLocaleString()} RP`);
      if (sessionWinner.killsDelta > 0) parts.push(`+${sessionWinner.killsDelta.toLocaleString()} kills`);
      if (sessionWinner.damageDelta > 0) parts.push(`+${sessionWinner.damageDelta.toLocaleString()} dmg`);
      if (parts.length) lines.push(`> ${parts.join(" | ")}`);
      lines.push("");
    }

    lines.push("**Squad Stats:**");
    for (const r of reports) {
      const rpStr = r.rpDelta === 0 ? "±0 RP" : `${r.rpDelta > 0 ? "+" : ""}${r.rpDelta.toLocaleString()} RP`;
      const killStr = r.killsDelta === 0 ? "" : ` | ${r.killsDelta > 0 ? "+" : ""}${r.killsDelta.toLocaleString()} kills`;
      const dmgStr = r.damageDelta === 0 ? "" : ` | ${r.damageDelta > 0 ? "+" : ""}${r.damageDelta.toLocaleString()} dmg`;
      const kdStr = r.kdDelta !== 0 ? ` | K/D ${r.kdDelta > 0 ? "+" : ""}${r.kdDelta.toFixed(2)}` : "";
      lines.push(`• **${r.name}** — ${r.to.rankName ?? "?"} ${rpStr}${killStr}${dmgStr}${kdStr}`);
    }

    return lines.join("\n");
  }

  function handleCopy() {
    const text = buildDiscordSummary();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Session Report</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Compare squad stats between any two points in time.
            {sessionDurationLabel && (
              <> · <span className="text-foreground font-medium">{sessionDurationLabel}</span> of snapshots</>
            )}
          </p>
        </div>
        {hasData && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 shrink-0 px-4 py-2 rounded-lg border border-border bg-card text-sm font-medium hover:bg-white/[0.04] transition-colors"
          >
            {copied ? (
              <>
                <Check size={14} className="text-emerald-400" />
                <span className="text-emerald-400">Copied!</span>
              </>
            ) : (
              <>
                <Copy size={14} className="text-primary" />
                Copy for Discord
              </>
            )}
          </button>
        )}
      </div>

      {/* Range picker */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Clock size={15} className="text-primary" />
          <h2 className="text-sm font-semibold">Session Window</h2>
        </div>

        {/* Quick ranges */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={detectLastSession}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-background border border-primary/50 text-primary hover:bg-primary/10"
            title={`Detects the last session as a continuous block of activity with no gap ≥ ${SESSION_GAP_MS / 60000} min`}
          >
            Auto-detect last session
          </button>
          {QUICK_RANGES.map((r) => (
            <button
              key={r.hours}
              onClick={() => applyQuick(r.hours)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeQuick === r.hours
                  ? "bg-primary text-primary-foreground"
                  : "bg-background border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Custom range */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1.5">
              From
            </label>
            <input
              type="datetime-local"
              value={toLocalDatetimeValue(fromDate)}
              onChange={(e) => {
                setFromDate(new Date(e.target.value));
                setActiveQuick(-1);
              }}
              className="w-full rounded-lg bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 [color-scheme:dark]"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-1.5">
              To
            </label>
            <input
              type="datetime-local"
              value={toLocalDatetimeValue(toDate)}
              onChange={(e) => {
                setToDate(new Date(e.target.value));
                setActiveQuick(-1);
              }}
              className="w-full rounded-lg bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 [color-scheme:dark]"
            />
          </div>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-48 rounded-2xl bg-card animate-pulse" />
          ))}
        </div>
      )}

      {/* No data */}
      {!isLoading && !hasData && (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
          No snapshots found in this window. Try a wider time range or refresh stats from the Dashboard.
        </div>
      )}

      {/* Same snapshot warning */}
      {!isLoading && hasData && sameSnapshot && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 px-4 py-3 text-sm text-yellow-400 flex gap-2 items-start">
          <ChevronDown size={15} className="shrink-0 mt-0.5 rotate-90" />
          Some players have only one snapshot in this window — deltas will show as 0. Widen the range or wait for more snapshots to accumulate.
        </div>
      )}

      {/* Window expansion warning */}
      {!isLoading && hasData && expandedPlayers.size > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-400 flex gap-2 items-start">
          <ChevronDown size={15} className="shrink-0 mt-0.5" />
          <span>
            No snapshots found exactly at the start of your window for some players — using the nearest earlier snapshot as the baseline.
            The actual window may be slightly wider than selected.
          </span>
        </div>
      )}

      {/* Session winner — only shown when at least one player gained RP */}
      {!isLoading && hasData && sessionWinner && reports.length > 1 && (
        <div
          className="rounded-2xl border bg-gradient-to-br from-slate-900 to-slate-800 p-6 relative overflow-hidden"
          style={{ borderColor: PLAYER_COLORS[sessionWinner.colorIdx % PLAYER_COLORS.length] + "44" }}
        >
          <div
            className="absolute inset-0 opacity-5"
            style={{
              background: `radial-gradient(ellipse at top left, ${PLAYER_COLORS[sessionWinner.colorIdx % PLAYER_COLORS.length]}, transparent 70%)`,
            }}
          />
          <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: PLAYER_COLORS[sessionWinner.colorIdx % PLAYER_COLORS.length] + "22",
                  border: `1.5px solid ${PLAYER_COLORS[sessionWinner.colorIdx % PLAYER_COLORS.length]}44`,
                }}
              >
                <Star size={20} style={{ color: PLAYER_COLORS[sessionWinner.colorIdx % PLAYER_COLORS.length] }} />
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-0.5">
                  Session Winner
                </div>
                <div
                  className="text-2xl font-bold"
                  style={{ color: PLAYER_COLORS[sessionWinner.colorIdx % PLAYER_COLORS.length] }}
                >
                  {sessionWinner.name}
                </div>
                <div className="mt-1">
                  <RankBadge rankName={sessionWinner.to.rankName} size={20} />
                </div>
              </div>
            </div>
            <div className="sm:ml-auto flex gap-6 flex-wrap">
              <WinnerStat label="RP" value={fmtDelta(sessionWinner.rpDelta)} positive={sessionWinner.rpDelta >= 0} />
              <WinnerStat label="Kills" value={fmtDelta(sessionWinner.killsDelta)} positive={sessionWinner.killsDelta >= 0} />
              <WinnerStat label="Damage" value={fmtDelta(sessionWinner.damageDelta)} positive={sessionWinner.damageDelta >= 0} />
            </div>
          </div>
        </div>
      )}

      {/* Player report cards */}
      {!isLoading && hasData && (
        <div className="space-y-4">
          {reports.map((r) => (
            <PlayerCard key={r.playerId} report={r} expanded={expandedPlayers.has(r.playerId)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function PlayerAvatar({ name, avatar, color, size = 36 }: { name: string; avatar?: string | null; color?: string; size?: number }) {
  const [imgFailed, setImgFailed] = useState(false);
  const initials = name.slice(0, 2).toUpperCase();
  if (avatar && !imgFailed) {
    return (
      <img
        src={avatar}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover shrink-0 ring-2 ring-border"
        style={{ width: size, height: size }}
        onError={() => setImgFailed(true)}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center text-xs font-bold shrink-0 text-background"
      style={{ width: size, height: size, background: color ?? "#22d3ee" }}
    >
      {initials}
    </div>
  );
}

// ─── Player report card ───────────────────────────────────────────────────────

function PlayerCard({ report: r, expanded }: { report: PlayerReport; expanded?: boolean }) {
  const color = PLAYER_COLORS[r.colorIdx % PLAYER_COLORS.length];
  const sameSnap = r.from.id === r.to.id;
  const formatTs = (iso: string) =>
    new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border flex-wrap">
        <div className="w-1 h-6 rounded-full shrink-0" style={{ background: color }} />
        <PlayerAvatar name={r.name} avatar={r.avatar} color={color} size={36} />
        <div className="font-bold text-lg">{r.name}</div>
        {expanded && (
          <span className="text-[10px] font-mono text-amber-400 border border-amber-800/50 bg-amber-950/20 px-1.5 py-0.5 rounded">
            window expanded
          </span>
        )}
        <div className="ml-auto text-xs text-muted-foreground font-mono">
          {formatTs(r.from.capturedAt)} → {formatTs(r.to.capturedAt)}
        </div>
      </div>

      <div className="p-4 grid gap-4 md:grid-cols-[1fr_auto_1fr]">
        {/* Start snapshot */}
        <SnapshotSide label="Session Start" snap={r.from} />

        {/* Deltas */}
        <div className="flex md:flex-col gap-3 items-center justify-center py-2 md:py-0 md:px-4 border-t md:border-t-0 md:border-x border-border/60">
          {sameSnap ? (
            <div className="text-xs text-muted-foreground italic text-center">
              Only 1 snapshot in window
            </div>
          ) : (
            <>
              <DeltaBadge icon={<Trophy size={12} />} label="RP" value={r.rpDelta} color={color} />
              <DeltaBadge icon={<Crosshair size={12} />} label="Kills" value={r.killsDelta} />
              <DeltaBadge icon={<Zap size={12} />} label="Damage" value={r.damageDelta} />
              <DeltaBadge icon={<Target size={12} />} label="K/D" value={r.kdDelta} decimals={2} />
            </>
          )}
        </div>

        {/* End snapshot */}
        <SnapshotSide label="Session End" snap={r.to} />
      </div>
    </div>
  );
}

function SnapshotSide({ label, snap }: { label: string; snap: Snapshot }) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-mono">{label}</div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-background border border-border/60 px-2.5 py-2">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Rank</div>
          <RankBadge rankName={snap.rankName} size={18} />
        </div>
        <StatMini label="RP" value={fmt(snap.rankScore)} mono />
        <StatMini label="Kills" value={fmt(snap.kills)} />
        <StatMini label="Damage" value={fmt(snap.damage)} />
        <StatMini label="K/D" value={snap.kd != null && snap.kd > 0 ? snap.kd.toFixed(2) : "—"} mono />
        <StatMini label="Level" value={fmt(snap.level)} />
      </div>
    </div>
  );
}

function StatMini({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg bg-background border border-border/60 px-2.5 py-2">
      <div className="text-[9px] text-muted-foreground uppercase tracking-wide mb-0.5">{label}</div>
      <div className={`text-sm font-semibold truncate ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function DeltaBadge({
  icon,
  label,
  value,
  decimals = 0,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  decimals?: number;
  color?: string;
}) {
  const isPos = value > 0;
  const isNeg = value < 0;
  const formatted =
    decimals > 0
      ? `${isPos ? "+" : ""}${value.toFixed(decimals)}`
      : fmtDelta(value);

  return (
    <div className="flex flex-col items-center gap-0.5 min-w-[56px]">
      <div className="flex items-center gap-1 text-[9px] text-muted-foreground uppercase tracking-wide">
        {icon} {label}
      </div>
      <div
        className="flex items-center gap-0.5 text-sm font-bold"
        style={color && isPos ? { color } : undefined}
      >
        {isPos ? (
          <TrendingUp size={11} className="shrink-0" style={color ? { color } : { color: "#10b981" }} />
        ) : isNeg ? (
          <TrendingDown size={11} className="shrink-0 text-rose-400" />
        ) : (
          <Minus size={11} className="shrink-0 text-muted-foreground" />
        )}
        <span className={isNeg ? "text-rose-400" : isPos ? "" : "text-muted-foreground"}>
          {formatted}
        </span>
      </div>
    </div>
  );
}

function WinnerStat({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive: boolean;
}) {
  return (
    <div className="text-center">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-xl font-bold ${positive ? "text-emerald-400" : "text-rose-400"}`}>
        {value}
      </div>
    </div>
  );
}
