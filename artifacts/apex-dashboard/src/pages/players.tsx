import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetPlayers,
  getGetPlayersQueryKey,
  getGetDashboardSummaryQueryKey,
  useAddPlayer,
  useDeletePlayer,
} from "@workspace/api-client-react";
import { UserPlus, Trash2, Monitor, Gamepad2, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

const PLATFORMS = [
  { value: "PC", label: "PC" },
  { value: "X1", label: "Xbox" },
  { value: "PS4", label: "PlayStation" },
  { value: "SWITCH", label: "Switch" },
];

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  PC: <Monitor size={14} />,
  X1: <Gamepad2 size={14} />,
  PS4: <Gamepad2 size={14} />,
  SWITCH: <Gamepad2 size={14} />,
};

export function Players() {
  const { data: players, isLoading } = useGetPlayers();
  const addPlayer = useAddPlayer();
  const deletePlayer = useDeletePlayer();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [platform, setPlatform] = useState("PC");
  const [apiKey, setApiKey] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getGetPlayersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setMsg(null);
    addPlayer.mutate(
      { data: { name: name.trim(), platform: platform as "PC" | "X1" | "PS4" | "SWITCH", apiKey: apiKey || null } },
      {
        onSuccess: (player) => {
          setMsg({ text: `Added ${player.name}. Refresh dashboard to view full stats.`, ok: true });
          setName("");
          setApiKey("");
          invalidate();
        },
        onError: (err: unknown) => {
          const errMsg = (err as { data?: { error?: string } })?.data?.error
            ?? (err instanceof Error ? err.message : "Failed to add player");
          setMsg({ text: errMsg, ok: false });
        },
      },
    );
  }

  function handleDelete(id: number, playerName: string) {
    deletePlayer.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: `${playerName} removed` });
          invalidate();
        },
        onError: () => {
          toast({ title: "Failed to remove player", variant: "destructive" });
        },
      },
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Players"
        description="Add your squad members by their Apex Legends username."
      />

      {/* Add player form */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
          <UserPlus size={16} className="text-primary" />
          Add Player
        </h2>

        {/* EA/Origin name notice */}
        <div className="mb-4 rounded-lg border border-yellow-900/30 bg-yellow-950/10 px-4 py-3 text-xs font-mono text-yellow-300/80 leading-relaxed">
          <strong className="text-yellow-200">PC players:</strong> Enter the <strong className="text-yellow-200">EA/Origin account name</strong>, not the Steam display name — these are often different.
          The API looks up stats by EA account, not Steam username.
          If a player's EA profile is set to <strong className="text-yellow-200">private</strong>, stats will not be available.
        </div>

        <form onSubmit={handleAdd} className="grid gap-3 md:grid-cols-[1fr_140px_1fr_auto]">
          <input
            data-testid="input-player-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="EA/Origin account name"
            className="rounded-lg bg-background border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground"
          />
          <select
            data-testid="select-platform"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="rounded-lg bg-background border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <input
            data-testid="input-api-key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Override API key (optional)"
            className="rounded-lg bg-background border border-border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground"
          />
          <button
            data-testid="button-add-player"
            type="submit"
            disabled={addPlayer.isPending || !name.trim()}
            className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 disabled:opacity-40 transition-opacity whitespace-nowrap"
          >
            {addPlayer.isPending ? "Validating..." : "Validate & Add"}
          </button>
          {msg && (
            <p
              className={`md:col-span-4 text-sm ${msg.ok ? "text-primary" : "text-destructive"}`}
            >
              {msg.text}
            </p>
          )}
        </form>
      </div>

      {/* Player list */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-36 rounded-2xl bg-card animate-pulse" />
          ))}
        </div>
      ) : !players?.length ? (
        <EmptyState
          icon={Users}
          message="No players added yet. Use the form above to add your squad."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {players.map((p) => (
            <div
              key={p.id}
              data-testid={`card-player-${p.id}`}
              className="rounded-2xl border border-border bg-card p-5 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xl font-bold">{p.name}</div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                    {PLATFORM_ICONS[p.platform]}
                    {p.platform}
                  </div>
                </div>
                <button
                  data-testid={`button-delete-player-${p.id}`}
                  onClick={() => handleDelete(p.id, p.name)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title="Remove player"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              {p.uid && (
                <div className="text-xs text-muted-foreground font-mono bg-background rounded px-2 py-1">
                  UID: {p.uid}
                </div>
              )}
              <div
                className={`text-xs px-2 py-1 rounded-full self-start font-medium ${
                  p.active
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {p.active ? "Active" : "Inactive"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
