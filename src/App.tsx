import { useEffect, useMemo, useRef, useState } from "react";
import { Principal } from "@icp-sdk/core/principal";
import { api, LEDGER_ID, MARKET_ID, SOON_URL, TOKEN_DECIMALS, type MarketInfo, type PostView, type Trade } from "./ic";
import { fmtCompact, fmtInt, fmtPrice, fmtUsd, safeUrl, shortId, timeAgo, toMs, units } from "./format";
import { Reveal, useNow, usePoll, useTween } from "./hooks";
import { PriceChart } from "./Chart";
import DigScene from "./game/DigScene";

const MARKET = Principal.fromText(MARKET_ID);
const WEEK_NS = 7n * 24n * 3600n * 1_000_000_000n;
const REACTIONS = ["⏳", "🔥", "👀", "WEN?"];

export default function App() {
  const info = usePoll(api.info, 5000);
  const trades = usePoll(() => api.trades(40), 5000);
  const posts = usePoll(() => api.thread(MARKET, 40), 12000);
  const prices = usePoll(api.prices, 60000);
  const candles = usePoll(() => api.candles(true, BigInt(Date.now()) * 1_000_000n - WEEK_NS), 60000);

  const m = info.data;
  const baseUsd = useMemo(() => {
    if (!m || !prices.data) return undefined;
    const ledger = m.base.ledger.toText();
    return prices.data.find((p) => p.ledger.toText() === ledger)?.usd;
  }, [m, prices.data]);

  const names = useNames([...(trades.data ?? []).map((t) => t.who), ...(posts.data ?? []).map((p) => p.author)]);

  const change24h = useMemo(() => {
    if (!m || !candles.data?.length) return undefined;
    const since = Date.now() - 24 * 3600 * 1000;
    const first = [...candles.data].sort((a, b) => Number(a.t - b.t)).find((c) => toMs(c.t) >= since);
    return first && first.open > 0 ? (m.price / first.open - 1) * 100 : undefined;
  }, [m, candles.data]);

  return (
    <>
      <Backdrop />
      <Nav />
      <main>
        <Hero m={m} baseUsd={baseUsd} change24h={change24h} failed={!m && !!info.error} />
        {m && <StatsStrip m={m} baseUsd={baseUsd} />}
        {m && <Curve m={m} />}
        <section className="section" id="chart">
          <Reveal>
            <SectionHead kicker="Chart" title="Price on the curve" />
            <div className="card">
              <PriceChart candles={candles.data} trades={trades.data} symbol={m?.base.symbol ?? ""} />
            </div>
          </Reveal>
        </section>
        <section className="section feeds" id="live">
          <Reveal className="feed-col">
            <SectionHead kicker="Live tape" title="Latest trades" />
            <Trades trades={trades.data} m={m} names={names} baseUsd={baseUsd} />
          </Reveal>
          <Reveal className="feed-col" delay={120}>
            <SectionHead kicker="Community" title="Riggy chat" />
            <Chat posts={posts.data} names={names} />
          </Reveal>
        </section>
        {m && <Mining m={m} />}
        <GamePromo />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}

function useNames(ps: Principal[]) {
  const [names, setNames] = useState<Record<string, string>>({});
  const asked = useRef(new Set<string>());
  const key = ps.map((p) => p.toText()).join(",");

  useEffect(() => {
    const missing = [...new Set(key.split(",").filter(Boolean))].filter((id) => !asked.current.has(id)).slice(0, 200);
    if (!missing.length) return;
    missing.forEach((id) => asked.current.add(id));
    api
      .names(missing.map((id) => Principal.fromText(id)))
      .then((rows) => setNames((n) => ({ ...n, ...Object.fromEntries(rows.map(([p, name]) => [p.toText(), name])) })))
      .catch(() => missing.forEach((id) => asked.current.delete(id)));
  }, [key]);

  return names;
}

function Backdrop() {
  return (
    <div className="backdrop" aria-hidden>
      <div className="blob b1" />
      <div className="blob b2" />
      <div className="blob b3" />
      <div className="grid" />
      {Array.from({ length: 18 }, (_, i) => (
        <span key={i} className="spark" style={{ ["--i" as string]: i }} />
      ))}
    </div>
  );
}

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={`nav ${scrolled ? "scrolled" : ""}`}>
      <a className="brand" href="#top">
        <img src="/riggy.webp" alt="" width={36} height={36} />
        <span>$RIGGY</span>
      </a>
      <nav className="nav-links">
        <a href="#curve">Curve</a>
        <a href="#chart">Chart</a>
        <a href="#live">Trades & chat</a>
        <a href="#mine">Mining</a>
      </nav>
      <a className="btn primary sm play-link" href="/play">
        <span>⛏ Deep Dig</span>
      </a>
      <a className="btn primary sm" href={SOON_URL} target="_blank" rel="noopener noreferrer">
        Open on Soon <Arrow />
      </a>
    </header>
  );
}

function Hero({ m, baseUsd, change24h, failed }: { m?: MarketInfo; baseUsd?: number; change24h?: number; failed: boolean }) {
  const price = m?.price ?? 0;
  const prev = useRef(price);
  const [flash, setFlash] = useState<"" | "up" | "down">("");

  useEffect(() => {
    if (prev.current && price !== prev.current) {
      setFlash(price > prev.current ? "up" : "down");
      const t = setTimeout(() => setFlash(""), 1200);
      prev.current = price;
      return () => clearTimeout(t);
    }
    prev.current = price;
  }, [price]);

  const meta = m?.meta;
  const socials = [
    { label: "X", href: safeUrl(meta?.x[0]) },
    { label: "Telegram", href: safeUrl(meta?.telegram[0]) },
    { label: "Website", href: safeUrl(meta?.website[0]) },
  ].filter((s) => s.href);

  return (
    <section className="hero" id="top">
      <div className="hero-copy">
        <span className="pill">
          <span className="live-dot" /> Proof-of-work token · built on Soon
        </span>
        <h1>
          <span className="ticker">$RIGGY</span>
          <span className="tagline">Riggy, the hamster who never stops digging.</span>
        </h1>
        <p className="lead">
          {meta?.description?.trim() ||
            "A community token mined by rigs on the Internet Computer. Every block, trade and chat message lives on-chain."}
        </p>

        <div className={`price-card ${flash}`}>
          <div className="price-label">
            <span className="live-dot" /> Live price
            {m && <PhaseBadge m={m} />}
          </div>
          {m ? (
            <>
              <div className="price-main">
                <span className="price-num">{fmtPrice(price)}</span>
                <span className="price-sym">{m.base.symbol}</span>
                {change24h !== undefined && (
                  <span className={`chip ${change24h >= 0 ? "pos" : "neg"}`}>
                    {change24h >= 0 ? "▲" : "▼"} {Math.abs(change24h).toFixed(2)}% 24h
                  </span>
                )}
              </div>
              <div className="price-usd">{baseUsd ? `≈ ${fmtUsd(price * baseUsd)} per RIGGY` : "per RIGGY"}</div>
            </>
          ) : failed ? (
            <div className="price-main muted">Couldn't reach the Internet Computer. Retrying…</div>
          ) : (
            <div className="skeleton" />
          )}
        </div>

        <div className="cta-row">
          <a className="btn primary lg" href={SOON_URL} target="_blank" rel="noopener noreferrer">
            Buy on Soon <Arrow />
          </a>
          <a className="btn ghost lg" href={SOON_URL} target="_blank" rel="noopener noreferrer">
            ⛏ Mine on Soon
          </a>
          <a className="btn primary lg play-link" href="/play">
            <span>⛏ Play Deep Dig</span> <Arrow />
          </a>
        </div>
        <p className="fine">You sign with your own wallet on Soon (Internet Identity, Plug or OISY). This site never touches your funds.</p>
        {socials.length > 0 && (
          <div className="socials">
            {socials.map((s) => (
              <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer">
                {s.label} <Arrow />
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="hero-art dig-hero-art">
        <DigScene />
      </div>
    </section>
  );
}

function PhaseBadge({ m }: { m: MarketInfo }) {
  if ("Graduated" in m.phase) return <span className="phase done">Listed on ICPSwap</span>;
  if ("Graduating" in m.phase) return <span className="phase grad">Graduating</span>;
  return <span className="phase">Bonding curve</span>;
}

function StatsStrip({ m, baseUsd }: { m: MarketInfo; baseUsd?: number }) {
  const dec = m.base.decimals;
  const raised = units(m.raised, dec);
  const volume = units(m.volume_base, dec);
  const usd = (v: number) => (baseUsd ? fmtUsd(v * baseUsd) : undefined);
  const stats = [
    { label: "Raised on curve", value: raised, fmt: (v: number) => `${fmtCompact(v)} ${m.base.symbol}`, sub: usd(raised) },
    { label: "Volume", value: volume, fmt: (v: number) => `${fmtCompact(v)} ${m.base.symbol}`, sub: usd(volume) },
    { label: "Traders", value: Number(m.traders), fmt: (v: number) => fmtInt(Math.round(v)) },
    { label: "Trades", value: Number(m.trades), fmt: (v: number) => fmtInt(Math.round(v)) },
    { label: "Active rigs", value: m.active_rigs, fmt: (v: number) => fmtInt(Math.round(v)) },
    { label: "Blocks mined", value: Number(m.height), fmt: (v: number) => fmtInt(Math.round(v)) },
  ];
  return (
    <section className="stats">
      {stats.map((s, i) => (
        <Reveal key={s.label} delay={i * 70} className="stat">
          <span className="stat-label">{s.label}</span>
          <Tweened value={s.value} fmt={s.fmt} className="stat-value" />
          {s.sub && <span className="stat-sub">≈ {s.sub}</span>}
        </Reveal>
      ))}
    </section>
  );
}

function Tweened({ value, fmt, className }: { value: number; fmt: (v: number) => string; className?: string }) {
  const v = useTween(value);
  return <span className={className}>{fmt(v)}</span>;
}

function Curve({ m }: { m: MarketInfo }) {
  const pct = Math.min(100, m.progress_bps / 100);
  const shown = useTween(pct, 1600);
  const dec = m.base.decimals;
  const graduated = "Graduated" in m.phase;
  return (
    <section className="section" id="curve">
      <Reveal>
        <SectionHead kicker="Bonding curve" title={graduated ? "The curve is full" : "Filling the curve"} />
        <div className="card curve-card">
          <div className="curve-top">
            <div>
              <span className="big-pct">{shown.toFixed(2)}%</span>
              <span className="muted"> complete</span>
            </div>
            <PhaseBadge m={m} />
          </div>
          <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
            <div className="bar-fill" style={{ width: `${shown}%` }}>
              <span className="bar-shine" />
            </div>
            <img className="bar-rider" src="/riggy.webp" alt="" style={{ left: `${shown}%` }} />
          </div>
          <div className="curve-meta">
            <div>
              <span className="muted">Raised</span>
              <strong>
                {fmtCompact(units(m.raised, dec), 4)} {m.base.symbol}
              </strong>
            </div>
            {!graduated && (
              <div>
                <span className="muted">Left to fill</span>
                <strong>
                  {fmtCompact(units(m.gross_to_complete, dec), 4)} {m.base.symbol}
                </strong>
              </div>
            )}
            <div>
              <span className="muted">Sold from curve</span>
              <strong>{fmtCompact(units(m.sold, TOKEN_DECIMALS))} RIGGY</strong>
            </div>
          </div>
          <p className="fine">
            When the curve fills, Soon lists RIGGY on ICPSwap with the raised liquidity. Progress is read live from the market canister.
          </p>
        </div>
      </Reveal>
    </section>
  );
}

function Trades({ trades, m, names, baseUsd }: { trades?: Trade[]; m?: MarketInfo; names: Record<string, string>; baseUsd?: number }) {
  const now = useNow(5000);
  if (!trades) return <div className="card list">{<ListSkeleton />}</div>;
  if (!trades.length) return <div className="card list empty">No trades yet. Be the first on Soon.</div>;
  const dec = m?.base.decimals ?? 8;
  const sym = m?.base.symbol ?? "";
  return (
    <div className="card list">
      {trades.map((t) => {
        const id = t.who.toText();
        const base = units(t.base, dec);
        return (
          <div key={String(t.id)} className={`trade ${t.buy ? "buy" : "sell"}`}>
            <span className="side">{t.buy ? "BUY" : "SELL"}</span>
            <span className="who" title={id}>
              {names[id] ?? shortId(id)}
            </span>
            <span className="amt">
              <strong>{fmtCompact(units(t.tokens, TOKEN_DECIMALS))}</strong> RIGGY
            </span>
            <span className="base">
              {fmtCompact(base, 4)} {sym}
              {baseUsd ? <em>{fmtUsd(base * baseUsd)}</em> : null}
            </span>
            <span className="when">{timeAgo(toMs(t.at), now)}</span>
          </div>
        );
      })}
    </div>
  );
}

function Chat({ posts, names }: { posts?: PostView[]; names: Record<string, string> }) {
  const now = useNow(10000);
  const visible = (posts ?? []).filter((p) => !p.hidden && !p.deleted && (p.text.trim() || p.moment[0]));
  return (
    <div className="card list chat">
      {!posts ? (
        <ListSkeleton />
      ) : !visible.length ? (
        <div className="empty">The chat is quiet. Say hi on Soon.</div>
      ) : (
        visible.map((p) => {
          const id = p.author.toText();
          const name = names[id] ?? shortId(id);
          const isMoment = !!p.moment[0];
          return (
            <article key={String(p.id)} className={`post ${p.pinned ? "pinned" : ""} ${isMoment ? "moment" : ""}`}>
              <div className="avatar" style={{ background: hue(id) }}>
                {isMoment ? "✦" : name.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase()}
              </div>
              <div className="post-body">
                <div className="post-head">
                  <strong title={id}>{isMoment ? "Soon moment" : name}</strong>
                  {p.pinned && <span className="tag">Pinned</span>}
                  <span className="muted">{timeAgo(toMs(p.at), now)}</span>
                </div>
                <p>{p.text || p.moment[0]}</p>
                <div className="post-foot">
                  {Array.from(p.reactions, (n, i) =>
                    n > 0 ? (
                      <span key={i} className="react">
                        {REACTIONS[i] ?? "•"} {n}
                      </span>
                    ) : null,
                  )}
                  {p.replies > 0 && <span className="react">💬 {p.replies}</span>}
                </div>
              </div>
            </article>
          );
        })
      )}
      <a className="chat-cta" href={SOON_URL} target="_blank" rel="noopener noreferrer">
        Join the conversation on Soon <Arrow />
      </a>
    </div>
  );
}

function Mining({ m }: { m: MarketInfo }) {
  const now = useNow(1000);
  const minedPct = m.mine_supply > 0n ? (Number(m.mined) / Number(m.mine_supply)) * 100 : 0;
  const shown = useTween(minedPct, 1600);
  const last = m.height > 0n && m.last_block_at > 0n ? timeAgo(toMs(m.last_block_at), now) : "No blocks yet";
  return (
    <section className="section" id="mine">
      <Reveal>
        <SectionHead kicker="Proof of work" title="Riggy's mine" />
        <div className="mine-grid">
          <div className="card mine-card">
            <div className="pickaxe" aria-hidden>
              ⛏️
            </div>
            <h3>Run a rig, earn RIGGY</h3>
            <p className="muted">
              Rigs are canisters that hash for new blocks. Each block found pays a reward in RIGGY. Mined rewards stay locked until the
              token lists. Spin one up on Soon with ICP or cycles.
            </p>
            <a className="btn primary" href={SOON_URL} target="_blank" rel="noopener noreferrer">
              Start mining on Soon <Arrow />
            </a>
          </div>
          <div className="card mine-stats">
            <div className="ms">
              <span className="muted">Mined supply</span>
              <strong>
                {fmtCompact(units(m.mined, TOKEN_DECIMALS))} / {fmtCompact(units(m.mine_supply, TOKEN_DECIMALS))}
              </strong>
              <div className="bar thin">
                <div className="bar-fill alt" style={{ width: `${shown}%` }} />
              </div>
            </div>
            <div className="ms">
              <span className="muted">Reward per block</span>
              <strong>{fmtCompact(units(m.reward, TOKEN_DECIMALS))} RIGGY</strong>
            </div>
            <div className="ms">
              <span className="muted">Block height</span>
              <strong>{fmtInt(m.height)}</strong>
            </div>
            <div className="ms">
              <span className="muted">Active rigs</span>
              <strong className="rigs">
                {m.active_rigs}
                <span className="rig-dots">
                  {Array.from({ length: Math.min(m.active_rigs, 12) }, (_, i) => (
                    <i key={i} style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </span>
              </strong>
            </div>
            <div className="ms">
              <span className="muted">Last block</span>
              <strong>{last}</strong>
            </div>
            <div className="ms">
              <span className="muted">Expected hashes / block</span>
              <strong>{fmtCompact(m.expected_hashes)}</strong>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function GamePromo() {
  return (
    <section className="section" id="game">
      <Reveal>
        <SectionHead kicker="Mini game" title="Riggy Deep Dig" />
        <a className="game-promo" href="/play">
          <div className="game-promo-art">
            <DigScene variant="compact" />
          </div>
          <div>
            <h3>Dig down the shaft, dodge the rocks, top the leaderboard.</h3>
            <p className="muted">
              Sign in, then send RIGGY from your Soon wallet to your game account. Holder tiers unlock deeper biomes and add daily energy; your tokens stay yours.
            </p>
            <span className="btn primary play-link">
              <span>⛏ Play Deep Dig</span> <Arrow />
            </span>
          </div>
        </a>
      </Reveal>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="section final">
      <Reveal className="card final-card">
        <img src="/riggy.webp" alt="" width={96} height={96} className="final-logo" />
        <h2>Grab a helmet.</h2>
        <p className="muted">Buy, sell or mine $RIGGY on Soon. You stay in control of your own wallet the whole time.</p>
        <a className="btn primary lg" href={SOON_URL} target="_blank" rel="noopener noreferrer">
          Open $RIGGY on Soon <Arrow />
        </a>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="ids">
        <IdChip label="Market" id={MARKET_ID} />
        <IdChip label="Ledger (ICRC-1/2)" id={LEDGER_ID} />
      </div>
      <p>
        A community site for $RIGGY, built on{" "}
        <a href="https://soonlaunchpad.fun" target="_blank" rel="noopener noreferrer">
          Soon
        </a>
        . Not affiliated with or endorsed by Soon. All data is read live from public Internet Computer canisters.
      </p>
      <p className="muted">
        Soon is in beta. Nothing here is financial advice or a promise of price or returns. Tokens can lose all their value. Never share your
        seed phrase or private key with anyone.
      </p>
    </footer>
  );
}

function IdChip({ label, id }: { label: string; id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="id-chip"
      onClick={() => {
        navigator.clipboard?.writeText(id).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        });
      }}
      title="Copy"
    >
      <span className="muted">{label}</span> <code>{id}</code> <span>{copied ? "✓" : "⧉"}</span>
    </button>
  );
}

function SectionHead({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="section-head">
      <span className="kicker">{kicker}</span>
      <h2>{title}</h2>
    </div>
  );
}

function ListSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="skeleton row" style={{ animationDelay: `${i * 0.1}s` }} />
      ))}
    </>
  );
}

function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  );
}

function hue(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return `linear-gradient(135deg, hsl(${h} 80% 60%), hsl(${(h + 50) % 360} 80% 45%))`;
}
