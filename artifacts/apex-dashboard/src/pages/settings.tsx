import { Key, Database, RefreshCw, ExternalLink } from "lucide-react";

export function Settings() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Configuration and reference for the 5SK Apex Dashboard.
        </p>
      </div>

      {/* API key */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Key size={16} className="text-primary" />
          Apex API Key
        </h2>
        <p className="text-sm text-muted-foreground">
          Stats are fetched from the mozambiquehe.re Apex Legends API. Get a free API key at:
        </p>
        <a
          href="https://portal.apexlegendsapi.com"
          target="_blank"
          rel="noopener noreferrer"
          data-testid="link-apex-api-portal"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          portal.apexlegendsapi.com <ExternalLink size={13} />
        </a>
        <div className="rounded-lg bg-background border border-border p-4">
          <p className="text-xs text-muted-foreground font-mono mb-2">Required secret:</p>
          <pre className="text-sm font-mono text-foreground">APEX_API_KEY=your_key_here</pre>
        </div>
        <p className="text-xs text-muted-foreground">
          Add or update this in Replit Secrets. The server reads it on every stat fetch.
        </p>
      </div>

      {/* Data storage */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Database size={16} className="text-primary" />
          Data Storage
        </h2>
        <p className="text-sm text-muted-foreground">
          All player records and stat snapshots are stored in a PostgreSQL database provisioned by Replit. No external database is needed.
        </p>
        <div className="rounded-lg bg-background border border-border p-4">
          <p className="text-xs text-muted-foreground font-mono mb-2">Tables:</p>
          <pre className="text-sm font-mono text-foreground">{`players          — tracked squad members
stat_snapshots   — historical stat captures`}</pre>
        </div>
      </div>

      {/* Refresh / scheduled poll */}
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <RefreshCw size={16} className="text-primary" />
          Refreshing Stats
        </h2>
        <p className="text-sm text-muted-foreground">
          Click <span className="font-semibold text-foreground">Refresh Stats Now</span> on the Dashboard to capture a new snapshot for all active players.
        </p>
        <p className="text-sm text-muted-foreground">
          For automated scheduled refreshes, call this endpoint from an uptime monitor or Replit scheduled job:
        </p>
        <div className="rounded-lg bg-background border border-border p-4">
          <pre className="text-sm font-mono text-foreground">POST /api/poll</pre>
        </div>
      </div>
    </div>
  );
}
