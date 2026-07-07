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
    adaptive: s.adaptive,
    intervalHours: s.intervalHours,
    activeIntervalHours: s.activeIntervalHours,
    idleIntervalHours: s.idleIntervalHours,
    lastActive: s.lastActive,
    lastRunAt: s.lastRunAt?.toISOString() ?? null,
    nextRunAt: s.nextRunAt?.toISOString() ?? null,
    lastResults: s.lastResults,
  });
});

// PATCH /scheduler/config
router.patch("/scheduler/config", (req, res) => {
  const { enabled, adaptive, intervalHours, activeIntervalHours, idleIntervalHours } = req.body as {
    enabled?: boolean;
    adaptive?: boolean;
    intervalHours?: number;
    activeIntervalHours?: number;
    idleIntervalHours?: number;
  };

  // Lowered floor from 0.5h to 0.1h (6 min) to support the 15-min default and
  // tighter adaptive polling during active sessions. Still capped at 168h (weekly).
  for (const [name, value] of [
    ["intervalHours", intervalHours],
    ["activeIntervalHours", activeIntervalHours],
    ["idleIntervalHours", idleIntervalHours],
  ] as const) {
    if (value !== undefined && (typeof value !== "number" || value < 0.1 || value > 168)) {
      res.status(400).json({ error: `${name} must be between 0.1 and 168` });
      return;
    }
  }

  setSchedulerConfig({ enabled, adaptive, intervalHours, activeIntervalHours, idleIntervalHours });
  const s = getSchedulerState();
  res.json({
    enabled: s.enabled,
    adaptive: s.adaptive,
    intervalHours: s.intervalHours,
    activeIntervalHours: s.activeIntervalHours,
    idleIntervalHours: s.idleIntervalHours,
    nextRunAt: s.nextRunAt?.toISOString() ?? null,
  });
});

// POST /scheduler/run-now  — manual trigger via scheduler path
router.post("/scheduler/run-now", async (_req, res) => {
  const results = await triggerNow();
  res.json({ ok: true, results });
});

export default router;
