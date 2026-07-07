import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}

// Standardizes the title/description/action-slot pattern used across every secondary
// page (Players, Leaderboard, Session, Snapshots, Settings, API Debug, Player Profile).
// The Dashboard keeps its own larger hero treatment deliberately — it's the flagship
// landing page — but every other page should read as siblings of each other, not as
// separately-styled one-offs.
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 className="text-3xl font-black tracking-tight">{title}</h1>
        {description && (
          <p className="text-muted-foreground mt-1 text-sm max-w-2xl">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
