import type { CSSProperties } from "react";
import "./mining-effects.css";

export type DigDirection = "up" | "right" | "down" | "left";
export const COLLECTION_DURATION_MS = 1600;
export const STRIKE_DURATION_MS = 700;
export const STRIKE_IMPACT_MS = STRIKE_DURATION_MS * .62;

export function PickaxeStrike({ direction }: { direction: DigDirection }) {
  return (
    <span className={`mining-pickaxe from-${direction}`} style={{ "--strike-duration": `${STRIKE_DURATION_MS}ms` } as CSSProperties} aria-hidden="true">
      <span className="mining-pickaxe-swing">
        <img src="/pickaxe.png" alt="" />
      </span>
    </span>
  );
}

export function MiningBurst({ kind, glyph, color, stone = false }: { kind: "firework" | "confetti"; glyph?: string; color?: string; stone?: boolean }) {
  const count = kind === "firework" ? stone ? 40 : 16 : 28;
  const spread = kind === "firework" ? stone ? 110 : 70 : 145;
  return (
    <span className={`mining-burst ${kind} ${stone ? "stone-impact" : ""}`} style={{ "--loot-color": color ?? "#78ffd0", "--collection-duration": `${COLLECTION_DURATION_MS}ms` } as CSSProperties} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        const angle = i * Math.PI * 2 / count;
        return <i key={i} style={{
          "--particle-x": `${Math.cos(angle) * (spread + i % 3 * 24)}%`,
          "--particle-y": `${Math.sin(angle) * (spread + i % 3 * 24)}%`,
          "--particle-angle": `${i * 360 / count}deg`,
          "--particle-spin": `${i % 2 ? 280 : -240}deg`,
          "--particle-delay": `${i % 3 * 12}ms`,
        } as CSSProperties} />;
      })}
      {glyph && <b className="mining-loot">{glyph}</b>}
    </span>
  );
}
