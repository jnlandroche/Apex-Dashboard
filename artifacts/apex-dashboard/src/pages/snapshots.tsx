import { useGetSnapshots } from "@workspace/api-client-react";
import { History } from "lucide-react";

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString();
}

export function Snapshots() {
  const { data: rows, isLoading } = useGetSnapshots();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Snapshots</h1>
        <div className="mt-2 rounded-xl border border-border/60 bg-card/50 px-4 py-3 text-sm text-muted-foreground flex gap-2 items-start max-w-2xl">
          <History size={15} className="mt-0.5 shrink-0 text-primary" />
          <span>
            Apex APIs provide stat snapshots rather than perfect match-by-match history. This app stores each snapshot as it's captured and builds trends from them over time.
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-10 rounded-lg bg-background animate-pulse" />
            ))}
          </div>
        ) : !rows?.length ? (
          <div className="p-12 text-center text-muted-foreground">
            No snapshots yet. Add players and click Refresh Stats on the Dashboard.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                  <th className="text-left p-4">Time</th>
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
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    data-testid={`row-snapshot-${r.id}`}
                    className="border-b border-border/50 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="p-4 text-xs text-muted-foreground font-mono whitespace-nowrap">
                      {new Date(r.capturedAt).toLocaleString()}
                    </td>
                    <td className="p-4 font-semibold">{r.playerName ?? "—"}</td>
                    <td className="p-4 text-muted-foreground">{r.rankName ?? "—"}</td>
                    <td className="p-4 text-primary font-mono">{fmt(r.rankScore)}</td>
                    <td className="p-4">{fmt(r.level)}</td>
                    <td className="p-4">{fmt(r.kills)}</td>
                    <td className="p-4">{fmt(r.damage)}</td>
                    <td className="p-4 font-mono">{r.kd != null ? r.kd.toFixed(2) : "—"}</td>
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
