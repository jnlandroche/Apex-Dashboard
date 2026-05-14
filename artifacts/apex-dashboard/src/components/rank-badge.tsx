import { useState } from "react";

const BASE = "https://api.mozambiquehe.re/assets/ranks/";

const TIER_MAP: Array<[string, string, string]> = [
  ["apex predator", BASE + "apexpredator1.png", "#f43f5e"],
  ["predator",      BASE + "apexpredator1.png", "#f43f5e"],
  ["master",        BASE + "master.png",        "#c084fc"],
  ["diamond",       BASE + "diamond1.png",      "#60a5fa"],
  ["platinum",      BASE + "platinum1.png",     "#22d3ee"],
  ["gold",          BASE + "gold1.png",         "#f59e0b"],
  ["silver",        BASE + "silver1.png",       "#94a3b8"],
  ["bronze",        BASE + "bronze1.png",       "#b45309"],
  ["rookie",        BASE + "rookie1.png",       "#9ca3af"],
];

function resolveTier(rankName: string | null | undefined): { url: string; color: string } | null {
  if (!rankName) return null;
  const lower = rankName.toLowerCase();
  for (const [key, url, color] of TIER_MAP) {
    if (lower.includes(key)) return { url, color };
  }
  return null;
}

interface RankBadgeProps {
  rankName: string | null | undefined;
  size?: number;
  showText?: boolean;
  className?: string;
}

export function RankBadge({ rankName, size = 22, showText = true, className = "" }: RankBadgeProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const tier = resolveTier(rankName);

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {tier && !imgFailed ? (
        <img
          src={tier.url}
          alt={rankName ?? "rank"}
          width={size}
          height={size}
          className="object-contain flex-shrink-0 drop-shadow"
          style={{ width: size, height: size }}
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span
          className="rounded-full flex-shrink-0 inline-block"
          style={{
            width: size * 0.45,
            height: size * 0.45,
            background: tier?.color ?? "#6b7280",
          }}
        />
      )}
      {showText && (
        <span style={{ color: tier?.color ?? "#6b7280" }} className="font-medium">
          {rankName ?? "—"}
        </span>
      )}
    </span>
  );
}
