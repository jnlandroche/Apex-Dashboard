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

export function extractMetrics(profile: ApexProfile) {
  const g = profile.global as Record<string, unknown> | undefined ?? {};
  return {
    level: Number((g.level as number | undefined) ?? 0),
    kills: Number(
      ((g.kills as Record<string, unknown> | undefined)?.value ??
        g.kills ??
        0) as number,
    ),
    damage: Number(
      ((g.damage as Record<string, unknown> | undefined)?.value ??
        g.damage ??
        0) as number,
    ),
    kd: Number(
      ((g.kd as Record<string, unknown> | undefined)?.value ?? g.kd ?? 0) as number,
    ),
    rankName: profile.rankName ?? "Unknown",
    rankScore: Number(profile.rankScore ?? 0),
    avatar: profile.avatar ?? null,
  };
}
