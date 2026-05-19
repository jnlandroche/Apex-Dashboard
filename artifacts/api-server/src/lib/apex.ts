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

// Returns the highest value across all candidate keys. Use when the API stores
// the same logical stat under different field names per player and we want the
// most comprehensive reading rather than a fixed priority order.
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

export function extractMetrics(profile: ApexProfile) {
  const g = (profile.global as Record<string, unknown> | undefined) ?? {};
  const raw = profile.raw as Record<string, unknown>;

  // `total` is the flat aggregated stat bag — most reliable source
  const total = (raw.total ?? {}) as Record<string, TotalEntry>;

  // kills: The Mozambique API stores the same stat under different field names
  // per player. "career_kills" may be a frozen badge on some accounts while
  // "specialEvent_kills" is the live counter, or vice-versa. Taking the MAX
  // across all known kill fields always gives the most comprehensive reading,
  // regardless of which one the API updates for a given player.
  const kills = totalMax(total, "career_kills", "specialEvent_kills", "kills");

  // damage: same issue — for some players "damage" is a partial tracker (e.g.
  // Daveskey reads 84 K from "damage" vs 1.4 M from "specialEvent_damage").
  // Take the max so we never under-report career damage.
  const damage = totalMax(total, "damage", "specialEvent_damage");

  // wins
  const wins = totalVal(total, "specialEvent_wins", "wins");

  // deaths — used to compute K/D when the API hides it
  const deaths = totalVal(total, "deaths", "specialEvent_deaths");

  // K/D: use the API value when valid (> 0), otherwise compute from
  // kills ÷ deaths (both come from the same lifetime total bag).
  const rawKdStr = (total["kd"] as TotalEntry | undefined)?.value;
  const rawKd = rawKdStr != null ? Number(rawKdStr) : 0;
  const computedKd =
    kills > 0 && deaths > 0
      ? Math.round((kills / deaths) * 100) / 100
      : 0;
  const kd: number =
    rawKd > 0 ? Math.round(rawKd * 100) / 100 : computedKd;

  logger.debug(
    { playerName: profile.name, kills, damage, kd, deaths, rawKd },
    "Extracted metrics from Apex API response",
  );

  return {
    level: Number((g.level as number | undefined) ?? 0),
    kills,
    damage,
    kd,
    wins,
    rankName: profile.rankName ?? "Unknown",
    rankScore: Number(profile.rankScore ?? 0),
    avatar: profile.avatar ?? null,
  };
}
