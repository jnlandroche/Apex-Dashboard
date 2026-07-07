import { db, playersTable, statSnapshotsTable, mvpRecordsTable } from "@workspace/db";
import { eq, desc, gte } from "drizzle-orm";
import { fetchApexProfile, extractMetrics } from "./apex.js";
import { fetchTrackerMetrics } from "./tracker.js";
import { logger } from "./logger.js";
import { writePollLog, prunePollLog } from "./pollLogDb.js";
import { rollupOldSnapshots } from "./retention.js";

export type PollResult = { name: string; status: "updated" | "error"; error: string | null };

export type SchedulerState = {
  enabled: boolean;
  // When adaptive is true, the scheduler ignores intervalHours and instead alternates
  // between activeIntervalHours (recent squad activity detected) and idleIntervalHours
  // (no one's playing) based on the last poll's findings. intervalHours remains available
  // as a fixed-interval fallback for anyone who wants to disable adaptive behavior.
  adaptive: boolean;
  intervalHours: number;
  activeIntervalHours: number;
  idleIntervalHours: number;
  lastActive: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  lastResults: PollResult[];
};

// A 1-hour default was too coarse: a typical 1-2 hour Apex session could start
// and end entirely between two polls, blending or hiding sessions. 15 minutes
// gives enough resolution to detect real session boundaries via realtimeState
// and stat-delta activity, without hammering the upstream APIs.
const DEFAULT_INTERVAL_HOURS = 0.25;

// Adaptive polling bounds: poll tight while the squad is actively playing, back off
// hard when idle so we're not burning API budget for nothing overnight or on off-days.
const DEFAULT_ACTIVE_INTERVAL_HOURS = 0.25; // 15 min
const DEFAULT_IDLE_INTERVAL_HOURS = 2; // 2 hr

// Small delay between sequential per-player fetches within one poll cycle so we
// don't burst N requests back-to-back into a per-second rate limit as the squad grows.
const PLAYER_FETCH_DELAY_MS = 350;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const state: SchedulerState = {
  enabled: true,
  adaptive: true,
  intervalHours: DEFAULT_INTERVAL_HOURS,
  activeIntervalHours: DEFAULT_ACTIVE_INTERVAL_HOURS,
  idleIntervalHours: DEFAULT_IDLE_INTERVAL_HOURS,
  lastActive: false,
  lastRunAt: null,
  nextRunAt: null,
  lastResults: [],
};

let timer: ReturnType<typeof setTimeout> | null = null;

// ─── Core poll function (shared by scheduler + manual route) ──────────────────

export async function pollAllPlayers(): Promise<PollResult[]> {
  const activePlayers = await db
    .select()
    .from(playersTable)
    .where(eq(playersTable.active, true));

  const results: PollResult[] = [];

  for (let i = 0; i < activePlayers.length; i++) {
    const player = activePlayers[i];
    const endpoint = `https://api.mozambiquehe.re/bridge?player=${encodeURIComponent(player.name)}&platform=${player.platform}`;

    // Space out requests within the cycle to avoid bursting a per-second rate limit.
    if (i > 0) await sleep(PLAYER_FETCH_DELAY_MS);

    try {
      const profile = await fetchApexProfile(
        player.name,
        player.platform as "PC" | "X1" | "PS4" | "SWITCH",
      );
      const metrics = extractMetrics(profile);

      // tracker.gg is the authoritative source for K/D when the key is set.
      // Always attempt it so we get accurate values — mozambiquehe.re's total bag
      // contains unrelated stats that can masquerade as a valid K/D.
      if (process.env.TRACKERGG_API_KEY) {
        const tracker = await fetchTrackerMetrics(
          player.name,
          player.platform as "PC" | "X1" | "PS4" | "SWITCH",
        );
        // Sanity guard: even the best Apex players rarely sustain a lifetime K/D above
        // ~15-20. A reading outside that range (seen in production as a one-off 39.00
        // spike with otherwise-unchanged kills/damage) is far more likely a transient
        // upstream glitch than a real stat, so it's logged and discarded rather than
        // silently overwriting a previously good value.
        if (tracker && tracker.kd > 0 && tracker.kd <= 20) {
          logger.debug(
            { playerName: player.name, trackerKd: tracker.kd, prevKd: metrics.kd },
            "Using tracker.gg K/D (authoritative)",
          );
          metrics.kd = tracker.kd;
        } else if (tracker && tracker.kd > 20) {
          logger.warn(
            { playerName: player.name, rejectedKd: tracker.kd },
            "tracker.gg returned an implausible K/D — discarding, keeping previous value",
          );
        }
      }

      if (metrics.kills === 0 && metrics.damage === 0) {
        logger.warn({ playerName: player.name }, "Skipping snapshot: kills and damage both 0 (incomplete API response)");
        await writePollLog({
          playerName: player.name,
          platform: player.platform,
          endpoint,
          status: "error",
          httpStatus: 200,
          errorMessage: "Incomplete stats (kills=0, damage=0) — snapshot not saved",
          kills: null,
          damage: null,
          rankScore: null,
          rankName: null,
          rawPreview: null,
          timestamp: new Date().toISOString(),
        });
        results.push({ name: player.name, status: "error", error: "Incomplete stats (kills=0, damage=0) — snapshot not saved" });
        continue;
      }

      await writePollLog({
        playerName: player.name,
        platform: player.platform,
        endpoint,
        status: "success",
        httpStatus: 200,
        errorMessage: null,
        kills: metrics.kills,
        damage: metrics.damage,
        rankScore: metrics.rankScore,
        rankName: metrics.rankName,
        rawPreview: JSON.stringify(profile.raw).slice(0, 400),
        timestamp: new Date().toISOString(),
      });

      await db.insert(statSnapshotsTable).values({
        playerId: player.id,
        rankName: metrics.rankName,
        rankScore: metrics.rankScore,
        level: metrics.level,
        kills: metrics.kills,
        damage: metrics.damage,
        kd: metrics.kd,
        realtimeState: metrics.realtimeState,
      });

      if (metrics.avatar && metrics.avatar !== player.avatar) {
        await db
          .update(playersTable)
          .set({ avatar: metrics.avatar })
          .where(eq(playersTable.id, player.id));
      }

      results.push({ name: player.name, status: "updated", error: null });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      const httpStatus = (err as { httpStatus?: number }).httpStatus ?? null;
      const kind = (err as { kind?: string }).kind ?? "error";
      logger.error({ err, playerName: player.name }, "Poll failed for player");
      await writePollLog({
        playerName: player.name,
        platform: player.platform,
        endpoint,
        status: kind === "rate_limited" ? "rate_limited" : kind === "not_found" ? "not_found" : kind === "private" ? "private" : "error",
        httpStatus,
        errorMessage: msg,
        kills: null,
        damage: null,
        rankScore: null,
        rankName: null,
        rawPreview: null,
        timestamp: new Date().toISOString(),
      });
      results.push({ name: player.name, status: "error", error: msg });
    }
  }

  // Persist the 7-day MVP record after each successful poll cycle
  const updated = results.filter((r) => r.status === "updated");
  if (updated.length > 0) {
    await persistMvpRecord().catch((err) =>
      logger.warn({ err }, "MVP record persistence failed — non-fatal"),
    );
  }

  return results;
}

// ─── MVP persistence ──────────────────────────────────────────────────────────

async function persistMvpRecord() {
  const activePlayers = await db
    .select()
    .from(playersTable)
    .where(eq(playersTable.active, true));

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const candidates: Array<{
    name: string;
    rpGained: number;
    killsGained: number;
    damageGained: number;
    score: number;
  }> = [];

  for (const player of activePlayers) {
    const snapshots = await db
      .select({
        rankScore: statSnapshotsTable.rankScore,
        kills: statSnapshotsTable.kills,
        damage: statSnapshotsTable.damage,
        capturedAt: statSnapshotsTable.capturedAt,
      })
      .from(statSnapshotsTable)
      .where(
        eq(statSnapshotsTable.playerId, player.id),
      )
      .orderBy(statSnapshotsTable.capturedAt);

    const weekPoints = snapshots.filter((s) => s.capturedAt >= weekAgo);
    if (weekPoints.length < 2) continue;

    const first = weekPoints[0];
    const last = weekPoints[weekPoints.length - 1];
    const rpGained = Math.max(0, (last.rankScore ?? 0) - (first.rankScore ?? 0));
    const killsGained = Math.max(0, (last.kills ?? 0) - (first.kills ?? 0));
    const damageGained = Math.max(0, (last.damage ?? 0) - (first.damage ?? 0));

    candidates.push({ name: player.name, rpGained, killsGained, damageGained, score: 0 });
  }

  if (!candidates.length) return;

  // Normalize each metric against the squad's own range this period (min-max scaling)
  // instead of fixed arbitrary weights (previously: rp*1 + damage*0.01 + kills*10, which
  // silently let one kill outweigh 1,000 damage with no stated rationale). This way no
  // single stat dominates just because of its raw magnitude, and the winner reflects
  // genuinely well-rounded performance across RP, kills, and damage.
  function normalize(values: number[]): number[] {
    const max = Math.max(...values);
    if (max <= 0) return values.map(() => 0);
    return values.map((v) => v / max);
  }
  const rpNorm = normalize(candidates.map((c) => c.rpGained));
  const killsNorm = normalize(candidates.map((c) => c.killsGained));
  const damageNorm = normalize(candidates.map((c) => c.damageGained));
  candidates.forEach((c, i) => {
    c.score = (rpNorm[i] + killsNorm[i] + damageNorm[i]) / 3;
  });

  const allZero = candidates.every((c) => c.score === 0);
  if (allZero) return;

  const winner = candidates.sort((a, b) => b.score - a.score)[0];

  await db.insert(mvpRecordsTable).values({
    periodLabel: "7d",
    periodStart: weekAgo,
    periodEnd: now,
    playerName: winner.name,
    rpGained: winner.rpGained,
    killsGained: winner.killsGained,
    damageGained: winner.damageGained,
    score: winner.score,
  });

  logger.info({ mvp: winner.name, score: winner.score }, "MVP record persisted");
}

// ─── Adaptive polling: detect whether the squad is actively playing ───────────

// Looks at each active player's two most recent snapshots. Treats the squad as
// "active" if any player's realtimeState says online, or if kills/damage/rankScore
// moved between the last two snapshots — i.e. someone is clearly mid-session.
async function computeSquadActivity(): Promise<boolean> {
  const activePlayers = await db
    .select()
    .from(playersTable)
    .where(eq(playersTable.active, true));

  for (const player of activePlayers) {
    const snaps = await db
      .select({
        kills: statSnapshotsTable.kills,
        damage: statSnapshotsTable.damage,
        rankScore: statSnapshotsTable.rankScore,
        realtimeState: statSnapshotsTable.realtimeState,
      })
      .from(statSnapshotsTable)
      .where(eq(statSnapshotsTable.playerId, player.id))
      .orderBy(desc(statSnapshotsTable.capturedAt))
      .limit(2);

    if (snaps.length === 0) continue;
    if (snaps[0].realtimeState?.toLowerCase() === "online") return true;
    if (snaps.length < 2) continue;

    const [latest, prev] = snaps;
    const moved =
      (latest.kills ?? 0) !== (prev.kills ?? 0) ||
      (latest.damage ?? 0) !== (prev.damage ?? 0) ||
      (latest.rankScore ?? 0) !== (prev.rankScore ?? 0);
    if (moved) return true;
  }

  return false;
}

// ─── Scheduler internals ──────────────────────────────────────────────────────

function scheduleNext() {
  if (timer) clearTimeout(timer);
  if (!state.enabled) {
    state.nextRunAt = null;
    return;
  }
  const hours = state.adaptive
    ? state.lastActive
      ? state.activeIntervalHours
      : state.idleIntervalHours
    : state.intervalHours;
  const ms = hours * 60 * 60 * 1000;
  state.nextRunAt = new Date(Date.now() + ms);
  timer = setTimeout(runScheduled, ms);
}

let lastPruneAt = 0;
const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function runScheduled() {
  logger.info(
    { adaptive: state.adaptive, intervalHours: state.intervalHours, lastActive: state.lastActive },
    "Scheduled stat poll starting",
  );
  state.lastRunAt = new Date();
  try {
    state.lastResults = await pollAllPlayers();
    const ok = state.lastResults.filter((r) => r.status === "updated").length;
    const errors = state.lastResults.filter((r) => r.status === "error").length;
    logger.info({ ok, errors }, "Scheduled stat poll complete");
  } catch (err) {
    logger.error({ err }, "Scheduled stat poll crashed");
  }

  // Re-evaluate activity after this poll so the *next* interval reflects what we just saw.
  try {
    state.lastActive = await computeSquadActivity();
  } catch (err) {
    logger.warn({ err }, "Squad activity check failed — keeping previous adaptive state");
  }

  // Daily maintenance: prune poll_log and roll up old snapshots (non-fatal, non-blocking).
  if (Date.now() - lastPruneAt > PRUNE_INTERVAL_MS) {
    lastPruneAt = Date.now();
    prunePollLog(14).catch((err) => logger.warn({ err }, "Poll log prune failed"));
    rollupOldSnapshots(30).catch((err) => logger.warn({ err }, "Snapshot rollup failed"));
  }

  scheduleNext();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function startScheduler() {
  logger.info(
    { adaptive: state.adaptive, intervalHours: state.intervalHours },
    "Auto-refresh scheduler started",
  );

  try {
    const [latest] = await db
      .select({ capturedAt: statSnapshotsTable.capturedAt })
      .from(statSnapshotsTable)
      .orderBy(desc(statSnapshotsTable.capturedAt))
      .limit(1);

    // We don't know the squad's activity state before the first poll, so use the
    // active interval as the freshness bar on startup — better to poll a bit early
    // than to sit on stale data for up to idleIntervalHours before we've even checked.
    const baselineHours = state.adaptive ? state.activeIntervalHours : state.intervalHours;
    const intervalMs = baselineHours * 60 * 60 * 1000;
    const ageMs = latest ? Date.now() - latest.capturedAt.getTime() : Infinity;

    if (ageMs >= intervalMs) {
      logger.info(
        { ageMinutes: Math.round(ageMs / 60000) },
        "Snapshots are stale on startup — running immediate poll",
      );
      runScheduled();
    } else {
      const remainingMs = intervalMs - ageMs;
      logger.info(
        { nextPollInMinutes: Math.round(remainingMs / 60000) },
        "Snapshots are fresh — scheduling next poll for remaining window",
      );
      state.nextRunAt = new Date(Date.now() + remainingMs);
      timer = setTimeout(runScheduled, remainingMs);
    }
  } catch (err) {
    logger.error({ err }, "Could not read last snapshot on startup — falling back to normal schedule");
    scheduleNext();
  }
}

export function getSchedulerState(): SchedulerState {
  return { ...state };
}

export function setSchedulerConfig(opts: {
  enabled?: boolean;
  adaptive?: boolean;
  intervalHours?: number;
  activeIntervalHours?: number;
  idleIntervalHours?: number;
}) {
  if (opts.enabled !== undefined) state.enabled = opts.enabled;
  if (opts.adaptive !== undefined) state.adaptive = opts.adaptive;
  if (opts.intervalHours !== undefined) state.intervalHours = opts.intervalHours;
  if (opts.activeIntervalHours !== undefined) state.activeIntervalHours = opts.activeIntervalHours;
  if (opts.idleIntervalHours !== undefined) state.idleIntervalHours = opts.idleIntervalHours;
  scheduleNext();
}

export function triggerNow() {
  if (timer) clearTimeout(timer);
  state.nextRunAt = null;
  return runScheduled();
}
