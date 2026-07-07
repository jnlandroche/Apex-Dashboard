import { logger } from "./logger.js";

export type ApexPlatform = "PC" | "X1" | "PS4" | "SWITCH";

export type ApexHistoryEntry = {
  timestamp: number;
  rankScore: number;
  kills: number;
  damage: number;
};

export type ApexProfile = {
  uid?: string;
  name: string;
  platform: ApexPlatform;
  level?: number;
  avatar?: string;
  rankName?: string;
  rankScore?: number;
  global?: unknown;
  raw: unknown;
  history: ApexHistoryEntry[];
};

const API_BASE = "https://api.mozambiquehe.re";

export async function fetchApexProfile(
  playerName: string,
  platform: ApexPlatform,
  apiKey?: string,
): Promise<ApexProfile> {
  const key = apiKey || process.env.APEX_API_KEY;
  if (!key) {
    throw new Error("Missing APEX_API_KEY — add it in Replit Secrets");
  }
  const url = `${API_BASE}/bridge?auth=${encodeURIComponent(key)}&player=${encodeURIComponent(playerName)}&platform=${platform}`;
  let res: Response;
  let data: Record<string, unknown>;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const text = await res.text();
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw Object.assign(new Error(`API returned non-JSON response: ${text.slice(0, 120)}`), { httpStatus: res.status, rawText: text });
    }
  } catch (err: unknown) {
    if (err instanceof Error && "httpStatus" in err) throw err;
    throw Object.assign(new Error("Network error reaching Mozambique API"), { httpStatus: null });
  }

  if (res.status === 429) {
    throw Object.assign(new Error("Rate limited by Mozambique API — try again in a few minutes"), { httpStatus: 429, kind: "rate_limited" });
  }
  if (res.status === 403 || res.status === 401) {
    throw Object.assign(new Error("Invalid API key — check APEX_API_KEY in Secrets"), { httpStatus: res.status, kind: "auth" });
  }

  const errMsg = data?.Error ?? data?.error;
  if (errMsg) {
    const s = String(errMsg).toLowerCase();
    if (s.includes("not found") || s.includes("no player found") || s.includes("player not found")) {
      throw Object.assign(new Error(`Player "${playerName}" not found on ${platform} — check the EA/Origin account name`), { httpStatus: res.status, kind: "not_found" });
    }
    if (s.includes("private") || s.includes("hidden")) {
      throw Object.assign(new Error(`Player "${playerName}" has a private EA profile — stats unavailable`), { httpStatus: res.status, kind: "private" });
    }
    throw Object.assign(new Error(String(errMsg)), { httpStatus: res.status, kind: "api_error" });
  }
  if (!res.ok) {
    throw Object.assign(new Error(`Apex API error ${res.status}`), { httpStatus: res.status, kind: "http_error" });
  }
  const global = (data.global ?? {}) as Record<string, unknown>;
  const rank = (global.rank ?? {}) as Record<string, unknown>;

  const rawHistory = Array.isArray(data.history) ? data.history : [];
  const history: ApexHistoryEntry[] = rawHistory
    .filter(
      (e): e is Record<string, unknown> =>
        e != null && typeof e === "object" && typeof e.timestamp === "number",
    )
    .map((e) => ({
      timestamp: e.timestamp as number,
      rankScore: Number(e.rankScore ?? e.rank_score ?? 0),
      kills: Number(e.kills ?? 0),
      damage: Number(e.damage ?? 0),
    }));

  return {
    uid: String(global.uid ?? ""),
    name: String(global.name ?? playerName),
    platform,
    level: Number(global.level ?? 0),
    avatar: String(global.avatar ?? ""),
    rankName: String(rank.rankName ?? "Unknown"),
    rankScore: Number(rank.rankScore ?? 0),
    global,
    raw: data,
    history,
  };
}

type TotalEntry = { name?: string; value?: number | string };

function totalVal(
  total: Record<string, TotalEntry>,
  ...keys: string[]
): number {
  for (const key of keys) {
    const entry = total[key];
    if (entry?.value != null) {
      const n = Number(entry.value);
      if (!isNaN(n) && n >= 0) return n;
    }
  }
  return 0;
}

function totalMax(
  total: Record<string, TotalEntry>,
  ...keys: string[]
): number {
  let best = 0;
  for (const key of keys) {
    const entry = total[key];
    if (entry?.value != null) {
      const n = Number(entry.value);
      if (!isNaN(n) && n > best) best = n;
    }
  }
  return best;
}

/**
 * Scan every key in the total bag for the highest plausible KD value.
 * Some accounts store it under "kd", others under player-specific keys.
 */
function findBestKd(total: Record<string, TotalEntry>): number {
  let best = 0;
  for (const entry of Object.values(total)) {
    if (!entry?.value) continue;
    const n = Number(entry.value);
    if (isNaN(n) || n <= 0 || n > 50) continue; // plausible KD range
    if (n > best) best = n;
  }
  return best;
}

export function extractMetrics(profile: ApexProfile) {
  const g = (profile.global as Record<string, unknown> | undefined) ?? {};
  const raw = profile.raw as Record<string, unknown>;

  const total = (raw.total ?? {}) as Record<string, TotalEntry>;

  const kills = totalMax(total, "career_kills", "specialEvent_kills", "kills");
  const damage = totalMax(total, "damage", "specialEvent_damage");
  const wins = totalVal(total, "specialEvent_wins", "wins");
  const deaths = totalMax(total, "deaths", "specialEvent_deaths");

  // K/D: try the explicit kd field first, then a broad scan of the total bag
  // (some accounts store it under a different key name), then compute from
  // kills/deaths if both are available.
  const rawKdStr = (total["kd"] as TotalEntry | undefined)?.value;
  const rawKd = rawKdStr != null ? Number(rawKdStr) : 0;

  const computedKd =
    kills > 0 && deaths > 0
      ? Math.round((kills / deaths) * 100) / 100
      : 0;

  const scannedKd = rawKd > 0 ? 0 : findBestKd(total);

  const kd: number =
    rawKd > 0
      ? Math.round(rawKd * 100) / 100
      : scannedKd > 0
        ? Math.round(scannedKd * 100) / 100
        : computedKd;

  logger.debug(
    { playerName: profile.name, kills, damage, kd, deaths, rawKd, scannedKd, computedKd },
    "Extracted metrics from Apex API response",
  );

  return {
    level: Number((g.level as number | undefined) ?? 0),
    kills,
    damage,
    kd,
    deaths,
    wins,
    rankName: profile.rankName ?? "Unknown",
    rankScore: Number(profile.rankScore ?? 0),
    avatar: profile.avatar ?? null,
  };
}
