import { Router } from "express";
import {
  getSchedulerState,
  setSchedulerConfig,
  triggerNow,
} from "../lib/scheduler.js";

const router = Router();

// GET /scheduler/status
router.get("/scheduler/status", (_req, res) => {
  const s = getSchedulerState();
  res.json({
    enabled: s.enabled,
    intervalHours: s.intervalHours,
    lastRunAt: s.lastRunAt?.toISOString() ?? null,
    nextRunAt: s.nextRunAt?.toISOString() ?? null,
    lastResults: s.lastResults,
  });
});

// PATCH /scheduler/config
router.patch("/scheduler/config", (req, res) => {
  const { enabled, intervalHours } = req.body as {
    enabled?: boolean;
    intervalHours?: number;
  };

  if (intervalHours !== undefined) {
    // Lowered floor from 0.5h to 0.1h (6 min) to support the new 15-min default and
    // tighter adaptive polling during active sessions. Still capped at 168h (weekly).
    if (typeof intervalHours !== "number" || intervalHours < 0.1 || intervalHours > 168) {
      res.status(400).json({ error: "intervalHours must be between 0.1 and 168" });
      return;
    }
  }

  setSchedulerConfig({ enabled, intervalHours });
  const s = getSchedulerState();
  res.json({
    enabled: s.enabled,
    intervalHours: s.intervalHours,
    nextRunAt: s.nextRunAt?.toISOString() ?? null,
  });
});

// POST /scheduler/run-now  — manual trigger via scheduler path
router.post("/scheduler/run-now", async (_req, res) => {
  const results = await triggerNow();
  res.json({ ok: true, results });
});

export default router;
