import { Router } from "express";
import { pollAllPlayers } from "../lib/scheduler.js";
import { requireApiKey } from "../middleware/auth.js";

const router = Router();

// POST /poll — manual trigger (mutating, requires API key if configured)
router.post("/poll", requireApiKey, async (req, res) => {
  const results = await pollAllPlayers();
  res.json({ ok: true, results });
});

export default router;
