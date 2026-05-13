import { Router } from "express";
import { db, statSnapshotsTable, playersTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";

const router = Router();

async function getLatestStatsForActivePlayers() {
  const activePlayers = await db.select().from(playersTable).where(eq(playersTable.active, true));

  const results = await Promise.all(
    activePlayers.map(async (player) => {
      const [latest] = await db
        .select()
        .from(statSnapshotsTable)
        .where(eq(statSnapshotsTable.playerId, player.id))
        .orderBy(desc(statSnapshotsTable.capturedAt))
        .limit(1);

      return {
        playerId: player.id,
        name: player.name,
        platform: player.platform,
        avatar: player.avatar,
        capturedAt: latest?.capturedAt?.toISOString() ?? null,
        rankName: latest?.rankName ?? null,
        rankScore: latest?.rankScore ?? null,
        level: latest?.level ?? null,
        kills: latest?.kills ?? null,
        damage: latest?.damage ?? null,
        kd: latest?.kd ?? null,
      };
    }),
  );

  return results;
}

// GET /dashboard/summary
router.get("/dashboard/summary", async (req, res) => {
  const squadStats = await getLatestStatsForActivePlayers();

  const totalKills = squadStats.reduce((sum, p) => sum + (p.kills ?? 0), 0);
  const totalDamage = squadStats.reduce((sum, p) => sum + (p.damage ?? 0), 0);

  const sorted = [...squadStats].sort((a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0));
  const topRanked = sorted[0];

  const byKills = [...squadStats].sort((a, b) => (b.kills ?? 0) - (a.kills ?? 0));
  const topKills = byKills[0];

  res.json({
    playerCount: squadStats.length,
    totalKills,
    totalDamage,
    topRankedPlayer: topRanked?.name ?? null,
    topRankedRank: topRanked?.rankName ?? null,
    topKillsPlayer: topKills?.name ?? null,
    squadStats,
  });
});

// GET /dashboard/leaderboard
router.get("/dashboard/leaderboard", async (req, res) => {
  const stats = await getLatestStatsForActivePlayers();
  const sorted = [...stats].sort((a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0));
  res.json(sorted);
});

// GET /dashboard/trends
router.get("/dashboard/trends", async (req, res) => {
  const activePlayers = await db.select().from(playersTable).where(eq(playersTable.active, true));

  const trends = await Promise.all(
    activePlayers.map(async (player) => {
      const snapshots = await db
        .select({
          capturedAt: statSnapshotsTable.capturedAt,
          rankScore: statSnapshotsTable.rankScore,
          kills: statSnapshotsTable.kills,
          damage: statSnapshotsTable.damage,
        })
        .from(statSnapshotsTable)
        .where(eq(statSnapshotsTable.playerId, player.id))
        .orderBy(statSnapshotsTable.capturedAt)
        .limit(100);

      return {
        playerId: player.id,
        name: player.name,
        dataPoints: snapshots.map(s => ({
          capturedAt: s.capturedAt.toISOString(),
          rankScore: s.rankScore ?? 0,
          kills: s.kills,
          damage: s.damage,
        })),
      };
    }),
  );

  res.json(trends);
});

export default router;
