import { logger } from "./logger.js";

export type ApexPlatform = "PC" | "X1" | "PS4" | "SWITCH";

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
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok || data?.Error || data?.error) {
    throw new Error(
      String(data?.Error ?? data?.error ?? `Apex API error ${res.status}`),
    );
  }
  const global = (data.global ?? {}) as Record<string, unknown>;
  const rank = (global.rank ?? {}) as Record<string, unknown>;
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

export function extractMetrics(profile: ApexProfile) {
  const g = (profile.global as Record<string, unknown> | undefined) ?? {};
  const raw = profile.raw as Record<string, unknown>;

  // `total` is the flat aggregated stat bag — most reliable source
  const total = (raw.total ?? {}) as Record<string, TotalEntry>;

  // kills: The Mozambique API uses inconsistent key names across players:
  //   - "career_kills"       → all-time total, the most reliable live counter
  //   - "specialEvent_kills" → often the broadest aggregate when career_kills absent
  //   - "kills"              → per-player meaning varies (season badge, event, etc.)
  // Priority: career_kills > specialEvent_kills > kills
  const kills = totalVal(total, "career_kills", "specialEvent_kills", "kills");

  // damage: same logic — plain "damage" is the actively updated tracker
  const damage = totalVal(total, "damage", "specialEvent_damage");

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
