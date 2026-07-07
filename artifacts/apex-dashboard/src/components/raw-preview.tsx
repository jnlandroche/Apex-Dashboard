import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export function RawPreview({ preview, label = "raw JSON" }: { preview: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        {open ? "Hide" : "Show"} {label}
      </button>
      {open && (
        <pre className="mt-2 p-3 rounded-md bg-black/50 border border-border text-[10px] font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap break-all max-h-96 overflow-y-auto">
          {preview}
        </pre>
      )}
    </div>
  );
}
