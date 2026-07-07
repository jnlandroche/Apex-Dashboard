import { db, pollLogTable } from "@workspace/db";
import { desc, lt } from "drizzle-orm";
import { logger } from "./logger.js";

export type PollLogEntry = {
  playerName: string;
  platform: string;
  endpoint: string;
  status: "success" | "error" | "rate_limited" | "not_found" | "private";
  httpStatus: number | null;
  errorMessage: string | null;
  kills: number | null;
  damage: number | null;
  rankScore: number | null;
  rankName: string | null;
  rawPreview: string | null;
  timestamp: string;
};

const MAX_ROWS = 500;

// Persists poll log entries to Postgres so debug history survives redeploys/restarts
// (the previous in-memory version was wiped every time Replit restarted the server).
export async function writePollLog(entry: PollLogEntry): Promise<void> {
  try {
    await db.insert(pollLogTable).values({
      playerName: entry.playerName,
      platform: entry.platform,
      endpoint: entry.endpoint,
      status: entry.status,
      httpStatus: entry.httpStatus,
      errorMessage: entry.errorMessage,
      kills: entry.kills,
      damage: entry.damage,
      rankScore: entry.rankScore,
      rankName: entry.rankName,
      rawPreview: entry.rawPreview,
    });
  } catch (err) {
    // Never let debug logging take down a poll cycle.
    logger.warn({ err }, "Failed to persist poll log entry");
  }
}

export async function getPollLog(limit = 50): Promise<PollLogEntry[]> {
  const rows = await db
    .select()
    .from(pollLogTable)
    .orderBy(desc(pollLogTable.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    playerName: r.playerName,
    platform: r.platform,
    endpoint: r.endpoint,
    status: r.status as PollLogEntry["status"],
    httpStatus: r.httpStatus,
    errorMessage: r.errorMessage,
    kills: r.kills,
    damage: r.damage,
    rankScore: r.rankScore,
    rankName: r.rankName,
    rawPreview: r.rawPreview,
    timestamp: r.createdAt.toISOString(),
  }));
}

// Prune old rows so this table doesn't grow unbounded. Call periodically (see scheduler).
export async function prunePollLog(olderThanDays = 14): Promise<void> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  try {
    await db.delete(pollLogTable).where(lt(pollLogTable.createdAt, cutoff));
  } catch (err) {
    logger.warn({ err }, "Failed to prune poll log");
  }
}

void MAX_ROWS; // reserved for a future row-count-based cap if day-based pruning isn't enough
