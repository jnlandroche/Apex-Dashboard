import { Link } from "wouter";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] w-full flex items-center justify-center">
      <div className="text-center max-w-sm px-4">
        <div className="mx-auto mb-5 w-12 h-12 rounded-xl border border-border bg-card flex items-center justify-center">
          <Compass size={20} className="text-primary" />
        </div>
        <h1 className="text-2xl font-black tracking-tight">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          There's nothing here. The page may have moved, or the link might be wrong.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
