---
name: tracker.gg K/D supplement
description: How tracker.gg is used to fill in missing K/D data
---

# tracker.gg integration

**Endpoint:** `GET https://public-api.tracker.gg/v2/apex/standard/profile/{platform}/{playerName}`
**Header:** `TRN-Api-Key: {key}`
**Platform mapping:** PC→origin, X1→xbl, PS4→psn, SWITCH→origin

**Response:** `data.segments[0]` (type="overview") contains `stats.kd.value`, `stats.kills.value`, `stats.deaths.value`, `stats.damage.value`.

**Usage pattern:** Only called when mozambiquehe.re returns kd=0. Configured via `TRACKERGG_API_KEY` env var. If absent, skip gracefully. Rate limit: ~30/min on free tier — safe for 3 players at 1h intervals.

**Why:** mozambiquehe.re often returns kd=0 for PC players; tracker.gg is the reliable fallback.

**How to apply:** In scheduler `pollAllPlayers()`, after `extractMetrics()` returns kd=0, call `fetchTrackerMetrics()` and merge the result.
