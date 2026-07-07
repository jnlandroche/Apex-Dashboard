import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Key, Database, RefreshCw, ExternalLink, Clock, CheckCircle, XCircle, Play, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";

type SchedulerStatus = {
  enabled: boolean;
  adaptive: boolean;
  intervalHours: number;
  activeIntervalHours: number;
  idleIntervalHours: number;
  lastActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastResults: Array<{ name: string; status: string; error: string | null }>;
};

type SchedulerConfigBody = {
  enabled?: boolean;
  adaptive?: boolean;
  intervalHours?: number;
  activeIntervalHours?: number;
  idleIntervalHours?: number;
};

function useSchedulerStatus() {
  return useQuery<SchedulerStatus>({
    queryKey: ["scheduler-status"],
    queryFn: async () => {
      const res = await fetch("/api/scheduler/status");
      if (!res.ok) throw new Error("Failed to fetch scheduler status");
      return res.json() as Promise<SchedulerStatus>;
    },
    refetchInterval: 30_000,
  });
}

function useUpdateScheduler() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: SchedulerConfigBody) => {
      const res = await fetch("/api/scheduler/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Failed to update scheduler");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scheduler-status"] }),
  });
}

function useRunNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/scheduler/run-now", { method: "POST" });
      if (!res.ok) throw new Error("Failed to trigger poll");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduler-status"] });
      qc.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      qc.invalidateQueries({ queryKey: ["/api/dashboard/trends"] });
    },
  });
}

const ACTIVE_INTERVAL_OPTIONS = [
  { label: "10 minutes", value: 1 / 6 },
  { label: "15 minutes", value: 0.25 },
  { label: "30 minutes", value: 0.5 },
  { label: "1 hour", value: 1 },
];

const IDLE_INTERVAL_OPTIONS = [
  { label: "1 hour", value: 1 },
  { label: "2 hours", value: 2 },
  { label: "4 hours", value: 4 },
  { label: "12 hours", value: 12 },
];

const FIXED_INTERVAL_OPTIONS = [
  { label: "30 minutes", value: 0.5 },
  { label: "1 hour", value: 1 },
  { label: "2 hours", value: 2 },
  { label: "4 hours", value: 4 },
  { label: "6 hours", value: 6 },
  { label: "12 hours", value: 12 },
  { label: "24 hours", value: 24 },
];

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function timeUntil(iso: string | null) {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "any moment";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

function IntervalPicker({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: { label: string; value: number }[];
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground uppercase tracking-wide block mb-2">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            disabled={disabled}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 ${
              value === opt.value
                ? "bg-primary text-primary-foreground"
                : "bg-background border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Settings() {
  const { data: scheduler, isLoading } = useSchedulerStatus();
  const updateScheduler = useUpdateScheduler();
  const runNow = useRunNow();
  const { toast } = useToast();

  const isAdaptive = scheduler?.adaptive ?? true;

  function handleToggleEnabled() {
    if (!scheduler) return;
    updateScheduler.mutate(
      { enabled: !scheduler.enabled },
      {
        onSuccess: (data: { enabled: boolean }) => {
          toast({ title: data.enabled ? "Auto-refresh enabled" : "Auto-refresh paused" });
        },
        onError: (err: unknown) => {
          toast({ title: "Update failed", description: (err as Error).message, variant: "destructive" });
        },
      },
    );
  }

  function handleToggleAdaptive() {
    updateScheduler.mutate(
      { adaptive: !isAdaptive },
      {
        onSuccess: (data: { adaptive: boolean }) => {
          toast({ title: data.adaptive ? "Adaptive polling enabled" : "Switched to fixed interval" });
        },
      },
    );
  }

  function handleActiveInterval(val: number) {
    updateScheduler.mutate(
      { activeIntervalHours: val },
      { onSuccess: () => toast({ title: `Active-session polling set to every ${val < 1 ? Math.round(val * 60) + " minutes" : val + " hours"}` }) },
    );
  }

  function handleIdleInterval(val: number) {
    updateScheduler.mutate(
      { idleIntervalHours: val },
      { onSuccess: () => toast({ title: `Idle polling set to every ${val < 1 ? Math.round(val * 60) + " minutes" : val + " hours"}` }) },
    );
  }

  function handleFixedInterval(val: number) {
    updateScheduler.mutate(
      { intervalHours: val },
      { onSuccess: () => toast({ title: `Fixed interval set to every ${val < 1 ? val * 60 + " minutes" : val + " hours"}` }) },
    );
  }

  function handleRunNow() {
    runNow.mutate(undefined, {
      onSuccess: (data: { results: Array<{ name: string; status: string }> }) => {
        const ok = data.results.filter((r) => r.status === "updated").length;
        toast({ title: "Stats refreshed", description: `${ok} player${ok !== 1 ? "s" : ""} updated` });
      },
      onError: () => {
        toast({ title: "Refresh failed", variant: "destructive" });
      },
    });
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader title="Settings" description="Configuration and reference for the 5SK Apex Dashboard." />

      {/* Auto-refresh scheduler */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Clock size={16} className="text-primary" />
          Auto-Refresh Scheduler
        </h2>

        {/* Status row */}
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${scheduler?.enabled ? "bg-emerald-400" : "bg-muted-foreground"}`} />
          <span className="text-sm font-medium">
            {isLoading ? "Loading…" : scheduler?.enabled ? "Active" : "Paused"}
          </span>
          <button
            onClick={handleToggleEnabled}
            disabled={isLoading || updateScheduler.isPending}
            className={`ml-auto px-4 py-1.5 rounded-lg text-xs font-semibold transition-opacity disabled:opacity-40 ${
              scheduler?.enabled
                ? "bg-muted text-muted-foreground hover:bg-muted/80"
                : "bg-primary text-primary-foreground hover:opacity-90"
            }`}
          >
            {scheduler?.enabled ? "Pause" : "Enable"}
          </button>
        </div>

        {/* Times */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg bg-background border border-border p-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Last Run</div>
            <div className="text-sm font-mono">{fmtTime(scheduler?.lastRunAt ?? null)}</div>
          </div>
          <div className="rounded-lg bg-background border border-border p-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Next Run</div>
            <div className="text-sm font-mono">{fmtTime(scheduler?.nextRunAt ?? null)}</div>
            {scheduler?.nextRunAt && (
              <div className="text-[10px] text-primary mt-0.5">in {timeUntil(scheduler.nextRunAt)}</div>
            )}
          </div>
        </div>

        {/* Adaptive vs fixed toggle */}
        <div className="flex items-center gap-3 rounded-lg bg-background border border-border p-3">
          <Zap size={14} className={isAdaptive ? "text-primary" : "text-muted-foreground"} />
          <div className="flex-1">
            <div className="text-sm font-medium">Adaptive polling</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {isAdaptive
                ? `Polls tighter while the squad is active, backs off when idle. Currently: ${scheduler?.lastActive ? "active session detected" : "idle"}.`
                : "Polls on one fixed interval regardless of activity."}
            </div>
          </div>
          <button
            onClick={handleToggleAdaptive}
            disabled={isLoading || updateScheduler.isPending}
            className={`shrink-0 px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 ${
              isAdaptive
                ? "bg-primary text-primary-foreground"
                : "bg-background border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {isAdaptive ? "On" : "Off"}
          </button>
        </div>

        {/* Interval selectors — adaptive shows two, fixed shows one */}
        {isAdaptive ? (
          <div className="space-y-4">
            <IntervalPicker
              label="While active"
              options={ACTIVE_INTERVAL_OPTIONS}
              value={scheduler?.activeIntervalHours ?? 0.25}
              onChange={handleActiveInterval}
              disabled={updateScheduler.isPending}
            />
            <IntervalPicker
              label="While idle"
              options={IDLE_INTERVAL_OPTIONS}
              value={scheduler?.idleIntervalHours ?? 2}
              onChange={handleIdleInterval}
              disabled={updateScheduler.isPending}
            />
          </div>
        ) : (
          <IntervalPicker
            label="Refresh every"
            options={FIXED_INTERVAL_OPTIONS}
            value={scheduler?.intervalHours ?? 1}
            onChange={handleFixedInterval}
            disabled={updateScheduler.isPending}
          />
        )}

        {/* Last results */}
        {scheduler?.lastResults && scheduler.lastResults.length > 0 && (
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Last Poll Results</div>
            <div className="space-y-1.5">
              {scheduler.lastResults.map((r) => (
                <div key={r.name} className="flex items-center gap-2 text-sm rounded-lg bg-background border border-border px-3 py-2">
                  {r.status === "updated" ? (
                    <CheckCircle size={13} className="text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle size={13} className="text-destructive shrink-0" />
                  )}
                  <span className="font-medium">{r.name}</span>
                  {r.error && (
                    <span className="text-destructive text-xs ml-auto truncate max-w-[200px]">{r.error}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Run now */}
        <button
          onClick={handleRunNow}
          disabled={runNow.isPending}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-background border border-border text-sm font-medium hover:bg-white/[0.04] disabled:opacity-40 transition-colors"
        >
          <Play size={13} className={runNow.isPending ? "animate-pulse text-primary" : "text-primary"} />
          {runNow.isPending ? "Refreshing…" : "Run Now"}
        </button>
      </div>

      {/* API key */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Key size={16} className="text-primary" />
          Apex API Key
        </h2>
        <p className="text-sm text-muted-foreground">
          Stats are fetched from the mozambiquehe.re Apex Legends API. Get a free key at:
        </p>
        <a
          href="https://portal.apexlegendsapi.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          portal.apexlegendsapi.com <ExternalLink size={13} />
        </a>
        <div className="rounded-lg bg-background border border-border p-4">
          <p className="text-xs text-muted-foreground font-mono mb-2">Required secret:</p>
          <pre className="text-sm font-mono text-foreground">APEX_API_KEY=your_key_here</pre>
        </div>
      </div>

      {/* Data storage */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Database size={16} className="text-primary" />
          Data Storage
        </h2>
        <p className="text-sm text-muted-foreground">
          All player records and stat snapshots are stored in a PostgreSQL database provisioned by Replit.
        </p>
        <div className="rounded-lg bg-background border border-border p-4">
          <pre className="text-sm font-mono text-foreground">{`players          — tracked squad members
stat_snapshots   — historical stat captures (realtime state, kills, damage, RP, K/D)
mvp_records      — persisted 7-day MVP winners
poll_log         — API poll history for the Debug panel (14-day retention)`}</pre>
        </div>
      </div>

      {/* Manual API endpoint */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <RefreshCw size={16} className="text-primary" />
          Manual Poll Endpoint
        </h2>
        <p className="text-sm text-muted-foreground">
          You can also trigger a stat capture from any external tool or uptime monitor:
        </p>
        <div className="rounded-lg bg-background border border-border p-4">
          <pre className="text-sm font-mono text-foreground">POST /api/poll</pre>
        </div>
      </div>
    </div>
  );
}
