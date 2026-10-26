import { useMemo, useRef, useState } from "react";
import type { Candle, Trade } from "./ic";
import { fmtPrice, toMs } from "./format";

interface Point {
  t: number;
  p: number;
}

export function PriceChart({ candles, trades, symbol }: { candles?: Candle[]; trades?: Trade[]; symbol: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const points: Point[] = useMemo(() => {
    if (candles && candles.length >= 3) {
      return candles.map((c) => ({ t: toMs(c.t), p: c.close })).sort((a, b) => a.t - b.t);
    }
    if (trades && trades.length >= 2) {
      return trades.map((t) => ({ t: toMs(t.at), p: t.price })).sort((a, b) => a.t - b.t);
    }
    return [];
  }, [candles, trades]);

  const W = 800;
  const H = 260;
  const PAD = 8;

  const geo = useMemo(() => {
    if (points.length < 2) return null;
    const ps = points.map((d) => d.p);
    let min = Math.min(...ps);
    let max = Math.max(...ps);
    if (max === min) {
      max *= 1.05;
      min *= 0.95;
    }
    const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
    const y = (p: number) => PAD + (1 - (p - min) / (max - min)) * (H - PAD * 2);
    const line = points.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.p).toFixed(1)}`).join(" ");
    const area = `${line} L${x(points.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;
    return { line, area, x, y, min, max };
  }, [points]);

  if (!geo) {
    return <div className="chart-empty">Waiting for enough trades to draw a chart…</div>;
  }

  const up = points[points.length - 1].p >= points[0].p;
  const h = hover !== null ? points[hover] : null;

  const onMove = (e: React.PointerEvent) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    const rel = (e.clientX - r.left) / r.width;
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(rel * (points.length - 1)))));
  };

  return (
    <div className={`chart ${up ? "up" : "down"}`}>
      <div className="chart-readout">
        {h ? (
          <>
            <strong>
              {fmtPrice(h.p)} {symbol}
            </strong>
            <span>{new Date(h.t).toLocaleString()}</span>
          </>
        ) : (
          <>
            <strong>
              {fmtPrice(points[points.length - 1].p)} {symbol}
            </strong>
            <span>{candles && candles.length >= 3 ? "hourly closes, last 7 days" : "price after each recent trade"}</span>
          </>
        )}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label="RIGGY price chart"
      >
        <defs>
          <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--chart)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--chart)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g className="chart-draw">
          <path d={geo.area} fill="url(#area)" />
          <path d={geo.line} fill="none" stroke="var(--chart)" strokeWidth="2.5" className="chart-line" vectorEffect="non-scaling-stroke" />
        </g>
        {h && hover !== null && (
          <>
            <line x1={geo.x(hover)} x2={geo.x(hover)} y1={0} y2={H} className="chart-cross" vectorEffect="non-scaling-stroke" />
            <circle cx={geo.x(hover)} cy={geo.y(h.p)} r={5} className="chart-dot" />
          </>
        )}
      </svg>
    </div>
  );
}
