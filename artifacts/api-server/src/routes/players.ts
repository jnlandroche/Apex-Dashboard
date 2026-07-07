import { Router } from "express";
import { db, playersTable, statSnapshotsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { fetchApexProfile, extractMetrics } from "../lib/apex.js";
import { AddPlayerBody, DeletePlayerParams, TogglePlayerParams } from "@workspace/api-zod";
import { requireApiKey } from "../middleware/auth.js";

const router = Router();

// GET /players — read-only, no auth required
router.get("/players", async (req, res) => {
  const players = await db.select().from(playersTable).orderBy(playersTable.createdAt);
  res.json(players.map((p) => ({
    id: p.id,
    name: p.name,
    platform: p.platform,
    uid: p.uid,
    avatar: p.avatar,
    active: p.active,
    createdAt: p.createdAt.toISOString(),
  })));
});

// POST /players — mutating, requires API key if configured
router.post("/players", requireApiKey, async (req, res) => {
  const parsed = AddPlayerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { name, platform, apiKey } = parsed.data;

  try {
    const profile = await fetchApexProfile(name, platform as "PC" | "X1" | "PS4" | "SWITCH", apiKey ?? undefined);
    const metrics = extractMetrics(profile);

    const existing = await db.select().from(playersTable)
      .where(eq(playersTable.name, profile.name))
      .limit(1);

    let player;
    if (existing.length > 0) {
      const [updated] = await db.update(playersTable)
        .set({ uid: profile.uid, avatar: metrics.avatar, active: true, platform })
        .where(eq(playersTable.id, existing[0].id))
        .returning();
      player = updated;
    } else {
      const [created] = await db.insert(playersTable)
        .values({ name: profile.name, platform, uid: profile.uid, avatar: metrics.avatar, active: true })
        .returning();
      player = created;
    }

    await db.insert(statSnapshotsTable).values({
      playerId: player.id,
      rankName: metrics.rankName,
      rankScore: metrics.rankScore,
      level: metrics.level,
      kills: metrics.kills,
      damage: metrics.damage,
      kd: metrics.kd,
      realtimeState: metrics.realtimeState,
    });

    res.status(201).json({
      id: player.id,
      name: player.name,
      platform: player.platform,
      uid: player.uid,
      avatar: player.avatar,
      active: player.active,
      createdAt: player.createdAt.toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const kind = (err as { kind?: string }).kind ?? "error";
    req.log.error({ err, kind }, "Failed to add player");
    // Map API error kinds to appropriate HTTP status codes.
    const status =
      kind === "not_found" ? 404
      : kind === "private" ? 403
      : kind === "rate_limited" ? 429
      : kind === "auth" ? 502   // our key is bad — upstream auth failure
      : 500;
    res.status(status).json({ error: msg });
  }
});

// DELETE /players/:id — mutating
router.delete("/players/:id", requireApiKey, async (req, res) => {
  const parsed = DeletePlayerParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid player id" });
    return;
  }
  const { id } = parsed.data;
  const result = await db.delete(playersTable).where(eq(playersTable.id, id)).returning();
  if (result.length === 0) {
    res.status(404).json({ error: "Player not found" });
    return;
  }
  res.json({ ok: true });
});

// PATCH /players/:id/toggle — mutating
router.patch("/players/:id/toggle", requireApiKey, async (req, res) => {
  const parsed = TogglePlayerParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid player id" });
    return;
  }
  const { id } = parsed.data;
  const existing = await db.select().from(playersTable).where(eq(playersTable.id, id)).limit(1);
  if (existing.length === 0) {
    res.status(404).json({ error: "Player not found" });
    return;
  }
  const [updated] = await db.update(playersTable)
    .set({ active: !existing[0].active })
    .where(eq(playersTable.id, id))
    .returning();
  res.json({
    id: updated.id,
    name: updated.name,
    platform: updated.platform,
    uid: updated.uid,
    avatar: updated.avatar,
    active: updated.active,
    createdAt: updated.createdAt.toISOString(),
  });
});

export default router;
