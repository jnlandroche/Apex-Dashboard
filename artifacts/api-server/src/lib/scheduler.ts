import { db, playersTable, statSnapshotsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { fetchApexProfile, extractMetrics } from "./apex.js";
import { logger } from "./logger.js";

export type PollResult = { name: string; status: "updated" | "error"; error: string | null };

export type SchedulerState = {
  enabled: boolean;
  intervalHours: number;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  lastResults: PollResult[];
};

const DEFAULT_INTERVAL_HOURS = 4;

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

  for (const player of activePlayers) {
    try {
      const profile = await fetchApexProfile(
        player.name,
        player.platform as "PC" | "X1" | "PS4" | "SWITCH",
      );
      const metrics = extractMetrics(profile);

      // Skip saving if kills AND damage are both 0 — the API returned incomplete
      // data (e.g. privacy-hidden profile or a failed stat extraction). Storing
      // a zero snapshot would corrupt session deltas.
      if (metrics.kills === 0 && metrics.damage === 0) {
        logger.warn({ playerName: player.name }, "Skipping snapshot: kills and damage both 0 (incomplete API response)");
        results.push({ name: player.name, status: "error", error: "Incomplete stats (kills=0, damage=0) — snapshot not saved" });
        continue;
      }

      await db.insert(statSnapshotsTable).values({
        playerId: player.id,
        rankName: metrics.rankName,
        rankScore: metrics.rankScore,
        level: metrics.level,
        kills: metrics.kills,
        damage: metrics.damage,
        kd: metrics.kd,
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
      logger.error({ err, playerName: player.name }, "Poll failed for player");
      results.push({ name: player.name, status: "error", error: msg });
    }
  }

  return results;
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
  scheduleNext();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function startScheduler() {
  logger.info({ intervalHours: state.intervalHours }, "Auto-refresh scheduler started");
  scheduleNext();
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
