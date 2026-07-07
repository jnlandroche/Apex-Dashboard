import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePollStats } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Terminal, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Clock, Key, Wifi } from "lucide-react";
import { RawPreview } from "@/components/raw-preview";

type PollLogEntry = {
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

type DebugData = {
  scheduler: {
    enabled: boolean;
    adaptive: boolean;
    intervalHours: number;
    activeIntervalHours: number;
    idleIntervalHours: number;
    lastActive: boolean;
    lastRunAt: string | null;
    nextRunAt: string | null;
    lastResults: { name: string; status: string; error: string | null }[];
  };
  pollLog: PollLogEntry[];
  apiBase: string;
  apiKeyConfigured: boolean;
};

function fmtHours(h: number): string {
  return h < 1 ? `${Math.round(h * 60)}m` : `${h}h`;
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  success: <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />,
  error: <XCircle size={13} className="text-rose-400 shrink-0" />,
  rate_limited: <AlertTriangle size={13} className="text-yellow-400 shrink-0" />,
  not_found: <XCircle size={13} className="text-orange-400 shrink-0" />,
  private: <AlertTriangle size={13} className="text-orange-400 shrink-0" />,
};

const STATUS_COLOR: Record<string, string> = {
  success: "text-emerald-400",
  error: "text-rose-400",
  rate_limited: "text-yellow-400",
  not_found: "text-orange-400",
  private: "text-orange-400",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function Debug() {
  const [data, setData] = useState<DebugData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const pollStats = usePollStats();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  async function fetchDebug() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/debug`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load debug data");
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setPolling(true);
    pollStats.mutate(undefined, {
      onSuccess: () => {
        toast({ title: "Poll complete", description: "Debug data refreshed" });
        fetchDebug();
        queryClient.invalidateQueries();
        setPolling(false);
      },
      onError: (err: unknown) => {
        toast({ title: "Poll failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
        fetchDebug();
        setPolling(false);
      },
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-1 h-4 rounded-full bg-red-500" />
          <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-red-400/80">Admin</span>
        </div>
        <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
          <Terminal size={24} className="text-red-500" />
          API Debug Panel
        </h1>
        <p className="text-muted-foreground text-sm mt-1 font-mono">
          Inspect API calls, response status, and raw data per player. Log clears on server restart.
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={fetchDebug}
          disabled={loading}
          className="px-4 py-2 rounded-lg border border-border bg-card text-sm font-semibold hover:bg-white/[0.04] transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          {loading ? "Loading..." : "Load Debug Data"}
        </button>
        <button
          onClick={handleRefresh}
          disabled={polling}
          className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
          style={{ background: "linear-gradient(135deg, #ef4444, #b91c1c)", color: "white" }}
        >
          <RefreshCw size={13} className={polling ? "animate-spin" : ""} />
          {polling ? "Polling..." : "Force Poll Now"}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-900/40 bg-rose-950/20 p-4 text-sm text-rose-400 font-mono">
          {error}
        </div>
      )}

      {!data && !error && (
        <div className="rounded-xl border border-dashed border-border bg-card/30 p-12 text-center text-muted-foreground text-sm font-mono">
          Click "Load Debug Data" to inspect API activity.
        </div>
      )}

      {data && (
        <div className="space-y-5">
          {/* API Config */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Key size={13} className="text-red-500" />
              API Configuration
            </h2>
            <div className="grid sm:grid-cols-2 gap-4 text-sm font-mono">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Base Endpoint</div>
                <div className="text-xs text-slate-300 break-all">{data.apiBase}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">API Key</div>
                <div className={`flex items-center gap-2 ${data.apiKeyConfigured ? "text-emerald-400" : "text-rose-400"}`}>
                  {data.apiKeyConfigured ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                  {data.apiKeyConfigured ? "Configured (APEX_API_KEY secret)" : "Missing — add APEX_API_KEY in Secrets"}
                </div>
              </div>
            </div>
          </div>

          {/* Scheduler */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Clock size={13} className="text-red-500" />
              Scheduler
            </h2>
            <div className="grid sm:grid-cols-4 gap-4 text-sm font-mono">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Status</div>
                <div className={data.scheduler.enabled ? "text-emerald-400" : "text-muted-foreground"}>
                  {data.scheduler.enabled ? "Enabled" : "Disabled"}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Interval</div>
                {data.scheduler.adaptive ? (
                  <div className="flex items-center gap-1.5">
                    <span className={data.scheduler.lastActive ? "text-primary" : "text-muted-foreground"}>
                      {data.scheduler.lastActive ? fmtHours(data.scheduler.activeIntervalHours) : fmtHours(data.scheduler.idleIntervalHours)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      ({data.scheduler.lastActive ? "active" : "idle"})
                    </span>
                  </div>
                ) : (
                  <div>Every {fmtHours(data.scheduler.intervalHours)}</div>
                )}
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Last Run</div>
                <div className="text-xs">{data.scheduler.lastRunAt ? timeAgo(data.scheduler.lastRunAt) : "—"}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Next Run</div>
                <div className="text-xs">{data.scheduler.nextRunAt ? timeAgo(data.scheduler.nextRunAt).replace("ago", "from now") : "—"}</div>
              </div>
            </div>
            {data.scheduler.lastResults.length > 0 && (
              <div className="mt-4 space-y-1.5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Last Poll Results</div>
                {data.scheduler.lastResults.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs font-mono">
                    {r.status === "updated" ? <CheckCircle2 size={11} className="text-emerald-400" /> : <XCircle size={11} className="text-rose-400" />}
                    <span className="font-semibold">{r.name}</span>
                    <span className={r.status === "updated" ? "text-emerald-400" : "text-rose-400"}>{r.status}</span>
                    {r.error && <span className="text-muted-foreground truncate max-w-xs">{r.error}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Poll Log */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-4 border-b border-border flex items-center gap-2">
              <Wifi size={13} className="text-red-500" />
              <h2 className="text-sm font-semibold">API Poll Log</h2>
              <span className="ml-auto text-xs text-muted-foreground font-mono">{data.pollLog.length} entries (clears on restart)</span>
            </div>
            {data.pollLog.length === 0 ? (
              <div className="p-8 text-center text-sm font-mono text-muted-foreground">
                No polls recorded yet. Click "Force Poll Now" to generate entries.
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {data.pollLog.map((entry, i) => (
                  <div key={i} className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-2 min-w-0">
                        {STATUS_ICON[entry.status] ?? <XCircle size={13} className="text-rose-400 shrink-0" />}
                        <span className="font-bold text-sm">{entry.playerName}</span>
                        <span className="text-[10px] font-mono bg-white/[0.06] px-1.5 py-0.5 rounded text-muted-foreground">{entry.platform}</span>
                        <span className={`text-xs font-mono font-semibold ${STATUS_COLOR[entry.status] ?? "text-rose-400"}`}>
                          {entry.status}
                          {entry.httpStatus != null ? ` (HTTP ${entry.httpStatus})` : ""}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground shrink-0">{timeAgo(entry.timestamp)}</span>
                    </div>

                    {entry.errorMessage && (
                      <div className="mt-2 text-xs font-mono text-rose-300 bg-rose-950/20 px-3 py-2 rounded-md border border-rose-900/30">
                        {entry.errorMessage}
                      </div>
                    )}

                    {entry.status === "success" && (
                      <div className="mt-2 flex gap-6 text-xs font-mono text-muted-foreground">
                        <span>RP: <span className="text-primary font-semibold">{entry.rankScore?.toLocaleString() ?? "—"}</span></span>
                        <span>Kills: <span className="text-rose-400 font-semibold">{entry.kills?.toLocaleString() ?? "—"}</span></span>
                        <span>Damage: <span className="text-violet-400 font-semibold">{entry.damage?.toLocaleString() ?? "—"}</span></span>
                        <span>Rank: <span className="text-slate-300">{entry.rankName ?? "—"}</span></span>
                      </div>
                    )}

                    <div className="mt-1.5 text-[10px] font-mono text-muted-foreground/60 truncate">{entry.endpoint}</div>

                    {entry.rawPreview && <RawPreview preview={entry.rawPreview} />}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Data Reliability Note */}
          <div className="rounded-xl border border-yellow-900/30 bg-yellow-950/10 p-5">
            <h2 className="text-sm font-semibold mb-2 flex items-center gap-2 text-yellow-400">
              <AlertTriangle size={13} />
              Data Reliability Notes
            </h2>
            <ul className="text-xs font-mono text-muted-foreground space-y-1.5">
              <li>• The Mozambique API returns <strong className="text-slate-300">lifetime totals</strong> — kills and damage reflect all-time career stats, not per-session.</li>
              <li>• There is <strong className="text-slate-300">no match history endpoint</strong> available on this API tier. Session deltas are computed from snapshot differences.</li>
              <li>• For PC players, the lookup uses the <strong className="text-slate-300">EA/Origin account name</strong> — not the Steam display name, which may differ.</li>
              <li>• Stats are captured {data.scheduler.adaptive
                ? <>every <strong className="text-slate-300">{fmtHours(data.scheduler.activeIntervalHours)}</strong> while the squad is active, backing off to every <strong className="text-slate-300">{fmtHours(data.scheduler.idleIntervalHours)}</strong> when idle</>
                : <>every <strong className="text-slate-300">{fmtHours(data.scheduler.intervalHours)}</strong></>
              }. Values between polls are not recorded.</li>
              <li>• If a player's EA profile is set to private, stats will not be available regardless of API key validity.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
