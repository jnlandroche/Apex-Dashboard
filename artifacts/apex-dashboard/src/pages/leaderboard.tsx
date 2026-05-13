import { useGetLeaderboard } from "@workspace/api-client-react";
import { Trophy } from "lucide-react";

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString();
}

const RANK_COLORS: Record<string, string> = {
  Rookie: "text-zinc-400",
  Bronze: "text-orange-700",
  Silver: "text-slate-400",
  Gold: "text-yellow-400",
  Platinum: "text-cyan-300",
  Diamond: "text-blue-400",
  Master: "text-purple-400",
  Apex: "text-rose-400",
  Predator: "text-rose-500",
};

function rankColor(rankName: string | null | undefined) {
  if (!rankName) return "text-muted-foreground";
  for (const key of Object.keys(RANK_COLORS)) {
    if (rankName.toLowerCase().includes(key.toLowerCase())) return RANK_COLORS[key];
  }
  return "text-muted-foreground";
}

export function Leaderboard() {
  const { data: rows, isLoading } = useGetLeaderboard();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Team Leaderboard</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Ranked by RP — most recent snapshot.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-background animate-pulse" />
            ))}
          </div>
        ) : !rows?.length ? (
          <div className="p-12 text-center text-muted-foreground">
            No player data yet. Add players and refresh stats from the Dashboard.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                  <th className="text-left p-4 w-12">#</th>
                  <th className="text-left p-4">Player</th>
                  <th className="text-left p-4">Rank</th>
                  <th className="text-left p-4">RP</th>
                  <th className="text-left p-4">Level</th>
                  <th className="text-left p-4">Kills</th>
                  <th className="text-left p-4">Damage</th>
                  <th className="text-left p-4">K/D</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s, i) => (
                  <tr
                    key={s.playerId}
                    data-testid={`row-leaderboard-${s.playerId}`}
                    className="border-b border-border/50 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="p-4">
                      {i === 0 ? (
                        <Trophy size={16} className="text-yellow-400" />
                      ) : (
                        <span className="text-muted-foreground font-mono">{i + 1}</span>
                      )}
                    </td>
                    <td className="p-4 font-bold">{s.name}</td>
                    <td className={`p-4 font-medium ${rankColor(s.rankName)}`}>
                      {s.rankName ?? "—"}
                    </td>
                    <td className="p-4 text-primary font-mono font-semibold">{fmt(s.rankScore)}</td>
                    <td className="p-4">{fmt(s.level)}</td>
                    <td className="p-4">{fmt(s.kills)}</td>
                    <td className="p-4">{fmt(s.damage)}</td>
                    <td className="p-4 font-mono">{s.kd != null ? s.kd.toFixed(2) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
