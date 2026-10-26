const SUB = "₀₁₂₃₄₅₆₇₈₉";

export const units = (v: bigint, decimals: number) => Number(v) / 10 ** decimals;

export function fmtPrice(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  if (n >= 0.001) return trimZeros(n.toFixed(6));
  // 0.0000123 -> 0.0₄123 so tiny prices stay readable
  const zeros = Math.ceil(-Math.log10(n)) - 1;
  const digits = trimZeros(String(Math.round(n * 10 ** (zeros + 4))).slice(0, 4));
  const sub = String(zeros).split("").map((d) => SUB[Number(d)]).join("");
  return `0.0${sub}${digits}`;
}

function trimZeros(s: string): string {
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s.replace(/0+$/, "") || "0";
}

export function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return "–";
  if (n >= 0.01) return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return "$" + fmtPrice(n);
}

export function fmtCompact(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "–";
  if (n !== 0 && Math.abs(n) < 0.01) return fmtPrice(n);
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: digits }).format(n);
}

export function fmtInt(n: number | bigint): string {
  return Number(n).toLocaleString("en-US");
}

// Canister timestamps are nanoseconds; tolerate other units just in case.
export function toMs(t: bigint): number {
  const n = Number(t);
  if (n > 1e17) return n / 1e6;
  if (n > 1e14) return n / 1e3;
  if (n > 1e11) return n;
  return n * 1000;
}

export function timeAgo(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 5)}…${id.slice(-3)}` : id;
}

export function safeUrl(u: string | undefined): string | undefined {
  if (!u) return undefined;
  try {
    const url = new URL(u.startsWith("http") ? u : `https://${u}`);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}
