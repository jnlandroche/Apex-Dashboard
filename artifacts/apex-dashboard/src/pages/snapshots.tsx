import { useGetSnapshots } from "@workspace/api-client-react";
import { History } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString();
}

export function Snapshots() {
  const { data: rows, isLoading } = useGetSnapshots();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Snapshots"
        description="Apex APIs provide stat snapshots rather than perfect match-by-match history. This app stores each snapshot as it's captured and builds trends from them over time."
      />

      {isLoading ? (
        <div className="rounded-2xl border border-border bg-card p-8 space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-10 rounded-lg bg-background animate-pulse" />
          ))}
        </div>
      ) : !rows?.length ? (
        <EmptyState
          icon={History}
          message="No snapshots yet. Add players and click Refresh Stats on the Dashboard."
        />
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
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
                    <td className="p-4 font-mono">{r.kd != null && r.kd > 0 ? r.kd.toFixed(2) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
