import { Router } from "express";
import { pollAllPlayers } from "../lib/scheduler.js";

const router = Router();

// POST /poll — manual trigger
router.post("/poll", async (req, res) => {
  const results = await pollAllPlayers();
  res.json({ ok: true, results });
});

export default router;
