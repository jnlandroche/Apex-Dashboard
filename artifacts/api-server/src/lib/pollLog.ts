export type PollLogEntry = {
  playerName: string;
  platform: string;
  endpoint: string;
  status: "success" | "error" | "rate_limited" | "not_found" | "private";
  httpStatus: number | null;
  errorMessage: string | null;
  kills: number | null;
  damage: number | null;
  rankScore: number | null;
  rankName: string | null;
  rawPreview: string | null;
  timestamp: string;
};

const MAX_ENTRIES = 50;

const log: PollLogEntry[] = [];

export function writePollLog(entry: PollLogEntry) {
  log.unshift(entry);
  if (log.length > MAX_ENTRIES) log.splice(MAX_ENTRIES);
}

export function getPollLog(): PollLogEntry[] {
  return [...log];
}

export function getLastEntryForPlayer(playerName: string): PollLogEntry | null {
  return log.find((e) => e.playerName === playerName) ?? null;
}
