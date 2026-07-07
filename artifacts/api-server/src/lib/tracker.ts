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
