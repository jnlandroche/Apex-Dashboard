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

type TrackerEntry = { name?: string; key?: string; value?: number | string };

function findTracker(data: unknown[], keys: string[]): number {
  const lowerKeys = keys.map((k) => k.toLowerCase());
  const entry = (data as TrackerEntry[]).find(
    (t) =>
      lowerKeys.includes((t.key ?? "").toLowerCase()) ||
      lowerKeys.includes((t.name ?? "").toLowerCase()),
  );
  return entry ? Number(entry.value ?? 0) : 0;
}

export function extractMetrics(profile: ApexProfile) {
  const g = (profile.global as Record<string, unknown> | undefined) ?? {};
  const raw = profile.raw as Record<string, unknown>;

  const legends = (raw.legends ?? {}) as Record<string, unknown>;
  const all = (legends.all ?? {}) as Record<string, Record<string, unknown>>;

  const globalLegend = all["Global"] ?? all["global"] ?? {};
  const globalTrackers = Array.isArray(globalLegend.data)
    ? (globalLegend.data as TrackerEntry[])
    : [];

  const selectedLegend = (
    (legends.selected ?? {}) as Record<string, unknown>
  );
  const selectedTrackers = Array.isArray(selectedLegend.data)
    ? (selectedLegend.data as TrackerEntry[])
    : [];

  const allTrackers = [...globalTrackers, ...selectedTrackers];

  const kills =
    findTracker(globalTrackers, ["kills", "Kills"]) ||
    findTracker(selectedTrackers, ["kills", "Kills"]) ||
    Number(
      ((g.kills as Record<string, unknown> | undefined)?.value ?? g.kills ?? 0) as number,
    );

  const damage =
    findTracker(globalTrackers, ["damage", "Damage"]) ||
    findTracker(selectedTrackers, ["damage", "Damage"]) ||
    Number(
      ((g.damage as Record<string, unknown> | undefined)?.value ?? g.damage ?? 0) as number,
    );

  const wins =
    findTracker(allTrackers, ["wins", "Wins", "br_wins"]) || 0;

  const matches =
    findTracker(allTrackers, ["matches played", "matches", "games played"]) || 0;

  const rawKd = findTracker(allTrackers, ["k/d ratio", "kd", "k/d"]);
  const kd =
    rawKd ||
    Number(
      ((g.kd as Record<string, unknown> | undefined)?.value ?? g.kd ?? 0) as number,
    ) ||
    (kills > 0 && matches > 0 ? kills / matches : 0);

  return {
    level: Number((g.level as number | undefined) ?? 0),
    kills,
    damage,
    kd: Math.round(kd * 100) / 100,
    wins,
    rankName: profile.rankName ?? "Unknown",
    rankScore: Number(profile.rankScore ?? 0),
    avatar: profile.avatar ?? null,
  };
}
