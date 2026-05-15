import { Router } from "express";
import { db, statSnapshotsTable, playersTable } from "@workspace/db";
import { eq, desc, gte, and } from "drizzle-orm";

const router = Router();

const WINDOW_MS: Record<string, number> = {
  "1h": 1 * 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "8h": 8 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "48h": 48 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

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
        rankScore: latest?.rankScore ?? 0,
        level: latest?.level ?? 0,
        kills: latest?.kills ?? 0,
        damage: latest?.damage ?? 0,
        kd: latest?.kd ?? 0,
      };
    }),
  );

  return results;
}

// GET /dashboard/summary
router.get("/dashboard/summary", async (req, res) => {
  const squadStats = await getLatestStatsForActivePlayers();

  const totalKills = squadStats.reduce((sum, p) => sum + p.kills, 0);
  const totalDamage = squadStats.reduce((sum, p) => sum + p.damage, 0);

  const sorted = [...squadStats].sort((a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0));
  const topRanked = sorted[0];

  const byKills = [...squadStats].sort((a, b) => b.kills - a.kills);
  const topKills = byKills[0];

  const sessionKills = squadStats.reduce((sum, p) => sum + p.kills, 0);
  const sessionDamage = squadStats.reduce((sum, p) => sum + p.damage, 0);

  res.json({
    playerCount: squadStats.length,
    totalKills,
    totalDamage,
    sessionKills,
    sessionDamage,
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

// Collapse a sorted list of snapshots into one data point per 4-hour bucket.
// Keeps the last snapshot in each bucket so the chart plots the final RP value
// reached in that window — this makes ranked swings more visible.
const TREND_BUCKET_MS = 4 * 60 * 60 * 1000;

function downsampleTo4h<T extends { capturedAt: Date }>(rows: T[]): T[] {
  const buckets = new Map<number, T>();
  for (const row of rows) {
    const bucket = Math.floor(row.capturedAt.getTime() / TREND_BUCKET_MS);
    buckets.set(bucket, row);
  }
  return [...buckets.values()].sort(
    (a, b) => a.capturedAt.getTime() - b.capturedAt.getTime(),
  );
}

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
        .limit(500);

      const downsampled = downsampleTo4h(snapshots);

      return {
        playerId: player.id,
        name: player.name,
        dataPoints: downsampled.map(s => ({
          capturedAt: s.capturedAt.toISOString(),
          rankScore: s.rankScore ?? 0,
          kills: s.kills ?? 0,
          damage: s.damage ?? 0,
        })),
      };
    }),
  );

  res.json(trends);
});

// GET /dashboard/deltas?window=1h|4h|8h|24h|48h|7d
router.get("/dashboard/deltas", async (req, res) => {
  const window = typeof req.query.window === "string" ? req.query.window : "1h";
  const windowMs = WINDOW_MS[window];
  if (!windowMs) {
    res.status(400).json({ error: `Invalid window. Must be one of: ${Object.keys(WINDOW_MS).join(", ")}` });
    return;
  }

  const activePlayers = await db.select().from(playersTable).where(eq(playersTable.active, true));
  const since = new Date(Date.now() - windowMs);

  const deltas = await Promise.all(
    activePlayers.map(async (player) => {
      const snapshots = await db
        .select({
          capturedAt: statSnapshotsTable.capturedAt,
          kills: statSnapshotsTable.kills,
          damage: statSnapshotsTable.damage,
          kd: statSnapshotsTable.kd,
        })
        .from(statSnapshotsTable)
        .where(
          and(
            eq(statSnapshotsTable.playerId, player.id),
            gte(statSnapshotsTable.capturedAt, since),
          ),
        )
        .orderBy(statSnapshotsTable.capturedAt);

      if (snapshots.length < 2) {
        return {
          playerId: player.id,
          name: player.name,
          window,
          killsDelta: 0,
          damageDelta: 0,
          kdDelta: 0,
        };
      }

      const oldest = snapshots[0];
      const latest = snapshots[snapshots.length - 1];

      return {
        playerId: player.id,
        name: player.name,
        window,
        killsDelta: (latest.kills ?? 0) - (oldest.kills ?? 0),
        damageDelta: (latest.damage ?? 0) - (oldest.damage ?? 0),
        kdDelta: Math.round(((latest.kd ?? 0) - (oldest.kd ?? 0)) * 100) / 100,
      };
    }),
  );

  res.json(deltas);
});

export default router;
