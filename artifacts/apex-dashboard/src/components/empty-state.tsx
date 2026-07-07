import { ReactNode } from "react";
import { LucideIcon, Inbox } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  message: ReactNode;
  action?: ReactNode;
}

// One consistent "no data yet" treatment, used everywhere a table or chart has
// nothing to show. Previously every page improvised its own version — some with
// a dashed border, some without, some with an icon, some in font-mono, some not —
// which reads as unfinished rather than intentional.
export function EmptyState({ icon: Icon = Inbox, message, action }: EmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 flex flex-col items-center gap-3 p-12 text-center text-muted-foreground">
      <Icon size={22} className="text-muted-foreground/50" />
      <p className="text-sm max-w-sm">{message}</p>
      {action}
    </div>
  );
}
