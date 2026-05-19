import { Router } from "express";
import { getPollLog } from "../lib/pollLog.js";
import { getSchedulerState } from "../lib/scheduler.js";

const router = Router();

// GET /debug — API debug panel data
router.get("/debug", async (req, res) => {
  const schedulerState = getSchedulerState();
  const pollLog = getPollLog();

  res.json({
    scheduler: {
      enabled: schedulerState.enabled,
      intervalHours: schedulerState.intervalHours,
      lastRunAt: schedulerState.lastRunAt?.toISOString() ?? null,
      nextRunAt: schedulerState.nextRunAt?.toISOString() ?? null,
      lastResults: schedulerState.lastResults,
    },
    pollLog,
    apiBase: "https://api.mozambiquehe.re/bridge",
    apiKeyConfigured: !!process.env.APEX_API_KEY,
  });
});

export default router;
