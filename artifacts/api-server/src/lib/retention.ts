import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger.js";

// At a 15-min poll interval, stat_snapshots grows ~96 rows/player/day indefinitely.
// That's not huge in absolute terms, but there's no reason to keep full 15-min
// resolution once data is a month old — nobody's asking "what was my K/D at 3:47pm
// six weeks ago." This collapses snapshots older than `olderThanDays` down to one
// row per player per calendar day (the latest snapshot of that day), deleting the rest.
//
// Trend charts already downsample to 4h buckets for display, so this doesn't change
// what users see for recent data — it only thins out history nobody's looking at.
export async function rollupOldSnapshots(olderThanDays = 30): Promise<void> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

  try {
    const result = await db.execute(sql`
      DELETE FROM stat_snapshots s
      USING stat_snapshots s2
      WHERE s.player_id = s2.player_id
        AND s.captured_at < ${cutoff.toISOString()}
        AND s2.captured_at < ${cutoff.toISOString()}
        AND date_trunc('day', s.captured_at) = date_trunc('day', s2.captured_at)
        AND s.captured_at < s2.captured_at
    `);

    logger.info(
      { olderThanDays, cutoff: cutoff.toISOString(), rowCount: (result as { rowCount?: number }).rowCount ?? null },
      "Snapshot rollup complete — collapsed old snapshots to 1/day per player",
    );
  } catch (err) {
    logger.warn({ err }, "Snapshot rollup failed");
  }
}
