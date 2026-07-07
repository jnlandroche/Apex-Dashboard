import { Router } from "express";
import { db, playersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { fetchTrackerSessions, fetchTrackerSegments } from "../lib/tracker.js";

const router = Router();

// GET /players/:id/tracker-sessions — raw tracker.gg /sessions response for this player.
// Shape not yet verified against a live key (see tracker.ts caveat), so this returns
// the raw response as-is rather than a parsed/summarized structure.
router.get("/players/:id/tracker-sessions", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid player id" });
    return;
  }

  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, id)).limit(1);
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  if (!process.env.TRACKERGG_API_KEY) {
    res.status(503).json({ error: "TRACKERGG_API_KEY not configured" });
    return;
  }

  const result = await fetchTrackerSessions(player.name, player.platform as "PC" | "X1" | "PS4" | "SWITCH");
  res.status(result.ok ? 200 : 502).json(result);
});

// GET /players/:id/tracker-segments?type=legend — raw tracker.gg /segments/{type} response.
router.get("/players/:id/tracker-segments", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid player id" });
    return;
  }

  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, id)).limit(1);
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  if (!process.env.TRACKERGG_API_KEY) {
    res.status(503).json({ error: "TRACKERGG_API_KEY not configured" });
    return;
  }

  const segmentType = typeof req.query.type === "string" ? req.query.type : "legend";
  const result = await fetchTrackerSegments(player.name, player.platform as "PC" | "X1" | "PS4" | "SWITCH", segmentType);
  res.status(result.ok ? 200 : 502).json(result);
});

export default router;
