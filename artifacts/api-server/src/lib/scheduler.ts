import { db, playersTable, statSnapshotsTable, mvpRecordsTable } from "@workspace/db";
import { eq, desc, gte } from "drizzle-orm";
import { fetchApexProfile, extractMetrics } from "./apex.js";
import { fetchTrackerMetrics } from "./tracker.js";
import { logger } from "./logger.js";
import { writePollLog, prunePollLog } from "./pollLogDb.js";

export type PollResult = { name: string; status: "updated" | "error"; error: string | null };

export type SchedulerState = {
  enabled: boolean;
  intervalHours: number;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  lastResults: PollResult[];
};

// A 1-hour default was too coarse: a typical 1-2 hour Apex session could start
// and end entirely between two polls, blending or hiding sessions. 15 minutes
// gives enough resolution to detect real session boundaries via realtimeState
// and stat-delta activity, without hammering the upstream APIs.
const DEFAULT_INTERVAL_HOURS = 0.25;

// Small delay between sequential per-player fetches within one poll cycle so we
// don't burst N requests back-to-back into a per-second rate limit as the squad grows.
const PLAYER_FETCH_DELAY_MS = 350;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const state: SchedulerState = {
  enabled: true,
  intervalHours: DEFAULT_INTERVAL_HOURS,
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
        if (tracker && tracker.kd > 0) {
          logger.debug(
            { playerName: player.name, trackerKd: tracker.kd, prevKd: metrics.kd },
            "Using tracker.gg K/D (authoritative)",
          );
          metrics.kd = tracker.kd;
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

// ─── Scheduler internals ──────────────────────────────────────────────────────

function scheduleNext() {
  if (timer) clearTimeout(timer);
  if (!state.enabled) {
    state.nextRunAt = null;
    return;
  }
  const ms = state.intervalHours * 60 * 60 * 1000;
  state.nextRunAt = new Date(Date.now() + ms);
  timer = setTimeout(runScheduled, ms);
}

let lastPruneAt = 0;
const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function runScheduled() {
  logger.info({ intervalHours: state.intervalHours }, "Scheduled stat poll starting");
  state.lastRunAt = new Date();
  try {
    state.lastResults = await pollAllPlayers();
    const ok = state.lastResults.filter((r) => r.status === "updated").length;
    const errors = state.lastResults.filter((r) => r.status === "error").length;
    logger.info({ ok, errors }, "Scheduled stat poll complete");
  } catch (err) {
    logger.error({ err }, "Scheduled stat poll crashed");
  }

  // Prune poll_log rows older than 14 days once a day (non-fatal, non-blocking on failure).
  if (Date.now() - lastPruneAt > PRUNE_INTERVAL_MS) {
    lastPruneAt = Date.now();
    prunePollLog(14).catch((err) => logger.warn({ err }, "Poll log prune failed"));
  }

  scheduleNext();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function startScheduler() {
  logger.info({ intervalHours: state.intervalHours }, "Auto-refresh scheduler started");

  try {
    const [latest] = await db
      .select({ capturedAt: statSnapshotsTable.capturedAt })
      .from(statSnapshotsTable)
      .orderBy(desc(statSnapshotsTable.capturedAt))
      .limit(1);

    const intervalMs = state.intervalHours * 60 * 60 * 1000;
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

export function setSchedulerConfig(opts: { enabled?: boolean; intervalHours?: number }) {
  if (opts.enabled !== undefined) state.enabled = opts.enabled;
  if (opts.intervalHours !== undefined) state.intervalHours = opts.intervalHours;
  scheduleNext();
}

export function triggerNow() {
  if (timer) clearTimeout(timer);
  state.nextRunAt = null;
  return runScheduled();
}
