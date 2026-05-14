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

  // kills: use the plain "kills" tracker — this is the active, updating tracker
  // that increments as the player plays. "specialEvent_kills" is a frozen
  // old-season tracker that never updates; we only fall back to it when the
  // active tracker is absent.
  const kills = totalVal(total, "kills", "specialEvent_kills");

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
      : null;
  const kd: number | null =
    rawKd > 0 ? Math.round(rawKd * 100) / 100 : computedKd;

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
