import { logger } from "./logger.js";

export type ApexPlatform = "PC" | "X1" | "PS4" | "SWITCH";

export type TrackerMetrics = {
  kd: number;
  kills: number;
  deaths: number;
  damage: number;
};

const PLATFORM_MAP: Record<string, string> = {
  PC: "origin",
  X1: "xbl",
  PS4: "psn",
  SWITCH: "origin",
};

// tracker.gg is far more rate-limit-sensitive than mozambiquehe.re, and K/D
// doesn't move fast enough to justify hitting it on every poll cycle once
// polling drops to 10-15 min. Cache per player+platform for 30 minutes.
const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, { data: TrackerMetrics; expiresAt: number }>();

function cacheKey(playerName: string, platform: ApexPlatform): string {
  return `${platform}:${playerName.toLowerCase()}`;
}

function extractStatValue(stats: Record<string, unknown>, key: string): number {
  const entry = stats[key];
  if (!entry || typeof entry !== "object") return 0;
  const v = (entry as Record<string, unknown>).value;
  if (v == null) return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

export type TrackerRawResult = {
  ok: boolean;
  status: number | null;
  data: unknown;
  error: string | null;
};

// Cache raw sessions/segments responses separately from the K/D cache above —
// these are fetched on-demand (not every poll cycle) so a shorter TTL is fine.
const RAW_CACHE_TTL_MS = 15 * 60 * 1000;
const rawCache = new Map<string, { data: TrackerRawResult; expiresAt: number }>();

function rawCacheKey(kind: string, playerName: string, platform: ApexPlatform): string {
  return `${kind}:${platform}:${playerName.toLowerCase()}`;
}

// Fetches tracker.gg's /sessions endpoint, which per their own docs clusters match
// history into gaming sessions (45+ min gap = new session) — real match-level session
// detection, rather than our own snapshot-delta heuristic. NOTE: the exact response
// shape hasn't been verified against a live key — there are unresolved reports of this
// specific endpoint returning 401 even with a valid key, possibly requiring elevated
// tracker.gg access beyond the standard tier. This returns the raw response so the
// actual shape (or failure reason) is visible and diagnosable rather than guessed at.
export async function fetchTrackerSessions(
  playerName: string,
  platform: ApexPlatform,
  apiKey?: string,
): Promise<TrackerRawResult> {
  return fetchTrackerRaw("sessions", playerName, platform, "sessions", apiKey);
}

// Fetches tracker.gg's /segments/{type} endpoint for per-legend/per-mode breakdowns
// instead of just the career-total blob the main profile call returns. Same caveat as
// fetchTrackerSessions: shape not yet verified against a live key.
export async function fetchTrackerSegments(
  playerName: string,
  platform: ApexPlatform,
  segmentType: string = "legend",
  apiKey?: string,
): Promise<TrackerRawResult> {
  return fetchTrackerRaw("segments", playerName, platform, `segments/${segmentType}`, apiKey);
}

async function fetchTrackerRaw(
  kind: string,
  playerName: string,
  platform: ApexPlatform,
  urlSuffix: string,
  apiKey?: string,
): Promise<TrackerRawResult> {
  const key = apiKey ?? process.env.TRACKERGG_API_KEY;
  if (!key) {
    return { ok: false, status: null, data: null, error: "TRACKERGG_API_KEY not configured" };
  }

  const ck = rawCacheKey(kind, playerName, platform);
  const cached = rawCache.get(ck);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const trnPlatform = PLATFORM_MAP[platform] ?? "origin";
  const url = `https://public-api.tracker.gg/v2/apex/standard/profile/${trnPlatform}/${encodeURIComponent(playerName)}/${urlSuffix}`;

  try {
    const res = await fetch(url, {
      headers: { "TRN-Api-Key": key, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      logger.warn({ playerName, kind, status: res.status, body: JSON.stringify(data).slice(0, 300) }, "tracker.gg raw fetch returned non-OK status");
      const result: TrackerRawResult = { ok: false, status: res.status, data, error: `tracker.gg returned ${res.status}` };
      // Cache failures too (shorter effective benefit, but avoids hammering a 401/403 repeatedly)
      rawCache.set(ck, { data: result, expiresAt: Date.now() + RAW_CACHE_TTL_MS });
      return result;
    }

    logger.info({ playerName, kind, keys: data && typeof data === "object" ? Object.keys(data as Record<string, unknown>) : null }, "tracker.gg raw response shape");

    const result: TrackerRawResult = { ok: true, status: res.status, data, error: null };
    rawCache.set(ck, { data: result, expiresAt: Date.now() + RAW_CACHE_TTL_MS });
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.warn({ err, playerName, kind }, "tracker.gg raw fetch failed");
    return { ok: false, status: null, data: null, error: msg };
  }
}

export async function fetchTrackerMetrics(
  playerName: string,
  platform: ApexPlatform,
  apiKey?: string,
): Promise<TrackerMetrics | null> {
  const key = apiKey ?? process.env.TRACKERGG_API_KEY;
  if (!key) {
    return null;
  }

  const ck = cacheKey(playerName, platform);
  const cached = cache.get(ck);
  if (cached && cached.expiresAt > Date.now()) {
    logger.debug({ playerName }, "tracker.gg: using cached metrics");
    return cached.data;
  }

  const trnPlatform = PLATFORM_MAP[platform] ?? "origin";
  const url = `https://public-api.tracker.gg/v2/apex/standard/profile/${trnPlatform}/${encodeURIComponent(playerName)}`;

  try {
    const res = await fetch(url, {
      headers: {
        "TRN-Api-Key": key,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (res.status === 429) {
      logger.warn({ playerName }, "tracker.gg rate limited");
      return null;
    }
    if (res.status === 404) {
      logger.debug({ playerName }, "tracker.gg: player not found");
      return null;
    }
    if (!res.ok) {
      logger.warn({ playerName, status: res.status }, "tracker.gg returned error status");
      return null;
    }

    const data = (await res.json()) as Record<string, unknown>;
    const segments = (data?.data as Record<string, unknown>)?.segments;
    if (!Array.isArray(segments)) return null;

    const overview = segments.find(
      (s: unknown) =>
        s != null &&
        typeof s === "object" &&
        (s as Record<string, unknown>).type === "overview",
    ) as Record<string, unknown> | undefined;

    if (!overview) return null;

    const stats = (overview.stats ?? {}) as Record<string, unknown>;
    const kd = extractStatValue(stats, "kd");
    const kills = extractStatValue(stats, "kills");
    const deaths = extractStatValue(stats, "deaths");
    const damage = extractStatValue(stats, "damage");

    logger.debug({ playerName, kd, kills, deaths, damage }, "tracker.gg metrics fetched");

    const result: TrackerMetrics = { kd, kills, deaths, damage };
    cache.set(ck, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch (err) {
    logger.warn({ err, playerName }, "tracker.gg fetch failed");
    return null;
  }
}
