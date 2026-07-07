import { Router } from "express";
import { db, statSnapshotsTable, playersTable, mvpRecordsTable } from "@workspace/db";
import { eq, desc, gte, and } from "drizzle-orm";
import { logger } from "../lib/logger.js";

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

// Collapse sorted snapshots into one data point per bucket (last in bucket wins).
// Bucket size must scale with the requested window: a 4h bucket was fine when polling
// was hourly, but at a 15-min poll interval it silently flattens "Last 1h/4h/8h" views
// down to 1-2 data points — which is exactly why those views were showing "no changes
// detected" even when the /snapshots table clearly had real minute-to-minute movement.
const BUCKET_MS_FOR_WINDOW: Record<string, number> = {
  "1h": 2 * 60 * 1000, // 2 min
  "4h": 5 * 60 * 1000, // 5 min
  "8h": 10 * 60 * 1000, // 10 min
  "24h": 30 * 60 * 1000, // 30 min
  "48h": 60 * 60 * 1000, // 1 hr
  "7d": 4 * 60 * 60 * 1000, // 4 hr
  total: 4 * 60 * 60 * 1000, // 4 hr (unchanged default for the full-history view)
};

function downsample<T extends { capturedAt: Date }>(rows: T[], bucketMs: number): T[] {
  const buckets = new Map<number, T>();
  for (const row of rows) {
    const bucket = Math.floor(row.capturedAt.getTime() / bucketMs);
    buckets.set(bucket, row);
  }
  return [...buckets.values()].sort(
    (a, b) => a.capturedAt.getTime() - b.capturedAt.getTime(),
  );
}

// GET /dashboard/trends?window=1h|4h|8h|24h|48h|7d|total
router.get("/dashboard/trends", async (req, res) => {
  const windowParam = typeof req.query.window === "string" ? req.query.window : "total";
  const bucketMs = BUCKET_MS_FOR_WINDOW[windowParam] ?? BUCKET_MS_FOR_WINDOW.total;
  const windowMs = windowParam !== "total" ? WINDOW_MS[windowParam] : undefined;

  const activePlayers = await db.select().from(playersTable).where(eq(playersTable.active, true));

  const trends = await Promise.all(
    activePlayers.map(async (player) => {
      const conditions = [eq(statSnapshotsTable.playerId, player.id)];
      if (windowMs) conditions.push(gte(statSnapshotsTable.capturedAt, new Date(Date.now() - windowMs)));

      const snapshots = await db
        .select({
          capturedAt: statSnapshotsTable.capturedAt,
          rankScore: statSnapshotsTable.rankScore,
          kills: statSnapshotsTable.kills,
          damage: statSnapshotsTable.damage,
        })
        .from(statSnapshotsTable)
        .where(and(...conditions))
        .orderBy(statSnapshotsTable.capturedAt)
        .limit(2000);

      const downsampled = downsample(snapshots, bucketMs);

      return {
        playerId: player.id,
        name: player.name,
        dataPoints: downsampled.map((s) => ({
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
        return { playerId: player.id, name: player.name, window, killsDelta: 0, damageDelta: 0, kdDelta: 0 };
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

// GET /dashboard/mvp/history?limit=30
router.get("/dashboard/mvp/history", async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
  const rows = await db
    .select()
    .from(mvpRecordsTable)
    .orderBy(desc(mvpRecordsTable.computedAt))
    .limit(limit);

  res.json(rows.map((r) => ({
    id: r.id,
    periodLabel: r.periodLabel,
    periodStart: r.periodStart.toISOString(),
    periodEnd: r.periodEnd.toISOString(),
    playerName: r.playerName,
    rpGained: r.rpGained,
    killsGained: r.killsGained,
    damageGained: r.damageGained,
    score: r.score,
    computedAt: r.computedAt.toISOString(),
  })));
});

// ─── Mozambique map rotation proxy ───────────────────────────────────────────
// Simple in-memory cache so we don't hammer the map API on every dashboard load
let mapCache: { data: unknown; expiresAt: number } | null = null;

router.get("/dashboard/map", async (req, res) => {
  const now = Date.now();
  if (mapCache && mapCache.expiresAt > now) {
    res.json(mapCache.data);
    return;
  }

  const key = process.env.APEX_API_KEY;
  if (!key) {
    res.status(503).json({ error: "APEX_API_KEY not configured" });
    return;
  }

  try {
    const apiRes = await fetch(
      `https://api.mozambiquehe.re/maprotation?auth=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!apiRes.ok) {
      res.status(502).json({ error: `Map API returned ${apiRes.status}` });
      return;
    }
    const data = await apiRes.json();
    // Cache for 2 minutes
    mapCache = { data, expiresAt: now + 2 * 60 * 1000 };
    res.json(data);
  } catch (err) {
    logger.warn({ err }, "Map rotation fetch failed");
    res.status(502).json({ error: "Failed to fetch map rotation" });
  }
});

// ─── Server status proxy ──────────────────────────────────────────────────────
let statusCache: { data: unknown; expiresAt: number } | null = null;

router.get("/dashboard/serverstatus", async (req, res) => {
  const now = Date.now();
  if (statusCache && statusCache.expiresAt > now) {
    res.json(statusCache.data);
    return;
  }

  const key = process.env.APEX_API_KEY;
  if (!key) {
    res.status(503).json({ error: "APEX_API_KEY not configured" });
    return;
  }

  try {
    const apiRes = await fetch(
      `https://api.mozambiquehe.re/servers?auth=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!apiRes.ok) {
      res.status(502).json({ error: `Server status API returned ${apiRes.status}` });
      return;
    }
    const data = await apiRes.json();
    // Cache for 90 seconds
    statusCache = { data, expiresAt: now + 90 * 1000 };
    res.json(data);
  } catch (err) {
    logger.warn({ err }, "Server status fetch failed");
    res.status(502).json({ error: "Failed to fetch server status" });
  }
});

export default router;
