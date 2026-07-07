import { Router } from "express";
import { db, statSnapshotsTable, playersTable } from "@workspace/db";
import { desc, eq, and, gte } from "drizzle-orm";
import { GetSnapshotsQueryParams } from "@workspace/api-zod";

const router = Router();

// GET /snapshots
router.get("/snapshots", async (req, res) => {
  const parsed = GetSnapshotsQueryParams.safeParse({
    limit: req.query.limit ? Number(req.query.limit) : undefined,
    playerId: req.query.playerId ? Number(req.query.playerId) : undefined,
  });

  const limit = parsed.success ? (parsed.data.limit ?? 500) : 500;
  const playerId = parsed.success ? parsed.data.playerId : undefined;

  // Optional: filter to snapshots captured at or after `since` (ISO timestamp)
  const sinceRaw = typeof req.query.since === "string" ? req.query.since : undefined;
  const sinceDate = sinceRaw ? new Date(sinceRaw) : undefined;

  const conditions = [];
  if (playerId) conditions.push(eq(statSnapshotsTable.playerId, playerId));
  if (sinceDate && !isNaN(sinceDate.getTime())) {
    conditions.push(gte(statSnapshotsTable.capturedAt, sinceDate));
  }

  const rows = await db
    .select({
      id: statSnapshotsTable.id,
      playerId: statSnapshotsTable.playerId,
      playerName: playersTable.name,
      capturedAt: statSnapshotsTable.capturedAt,
      rankName: statSnapshotsTable.rankName,
      rankScore: statSnapshotsTable.rankScore,
      level: statSnapshotsTable.level,
      kills: statSnapshotsTable.kills,
      damage: statSnapshotsTable.damage,
      kd: statSnapshotsTable.kd,
      realtimeState: statSnapshotsTable.realtimeState,
    })
    .from(statSnapshotsTable)
    .innerJoin(playersTable, eq(statSnapshotsTable.playerId, playersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(statSnapshotsTable.capturedAt))
    .limit(limit);

  res.json(rows.map((r) => ({
    ...r,
    capturedAt: r.capturedAt.toISOString(),
  })));
});

export default router;
