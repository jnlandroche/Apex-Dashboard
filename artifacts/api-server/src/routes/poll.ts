import { Router } from "express";
import { db, playersTable, statSnapshotsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { fetchApexProfile, extractMetrics } from "../lib/apex.js";

const router = Router();

// POST /poll
router.post("/poll", async (req, res) => {
  const activePlayers = await db.select().from(playersTable).where(eq(playersTable.active, true));

  const results: Array<{ name: string; status: string; error: string | null }> = [];

  for (const player of activePlayers) {
    try {
      const profile = await fetchApexProfile(
        player.name,
        player.platform as "PC" | "X1" | "PS4" | "SWITCH",
      );
      const metrics = extractMetrics(profile);

      await db.insert(statSnapshotsTable).values({
        playerId: player.id,
        rankName: metrics.rankName,
        rankScore: metrics.rankScore,
        level: metrics.level,
        kills: metrics.kills,
        damage: metrics.damage,
        kd: metrics.kd,
      });

      // Update player avatar if changed
      if (metrics.avatar && metrics.avatar !== player.avatar) {
        await db.update(playersTable)
          .set({ avatar: metrics.avatar })
          .where(eq(playersTable.id, player.id));
      }

      results.push({ name: player.name, status: "updated", error: null });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      req.log.error({ err, playerName: player.name }, "Poll failed for player");
      results.push({ name: player.name, status: "error", error: msg });
    }
  }

  res.json({ ok: true, results });
});

export default router;
