import { Router } from "express";
import { db, statSnapshotsTable, playersTable } from "@workspace/db";
import { desc, eq, and } from "drizzle-orm";
import { GetSnapshotsQueryParams } from "@workspace/api-zod";

const router = Router();

// GET /snapshots
router.get("/snapshots", async (req, res) => {
  const parsed = GetSnapshotsQueryParams.safeParse({
    limit: req.query.limit ? Number(req.query.limit) : undefined,
    playerId: req.query.playerId ? Number(req.query.playerId) : undefined,
  });

  const limit = parsed.success ? (parsed.data.limit ?? 250) : 250;
  const playerId = parsed.success ? parsed.data.playerId : undefined;

  let query = db
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
    })
    .from(statSnapshotsTable)
    .innerJoin(playersTable, eq(statSnapshotsTable.playerId, playersTable.id))
    .orderBy(desc(statSnapshotsTable.capturedAt))
    .limit(limit);

  if (playerId) {
    query = query.where(eq(statSnapshotsTable.playerId, playerId)) as typeof query;
  }

  const rows = await query;
  res.json(rows.map(r => ({
    ...r,
    capturedAt: r.capturedAt.toISOString(),
  })));
});

export default router;
