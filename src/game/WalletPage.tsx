import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import type { Identity } from "@icp-sdk/core/agent";
import type { Principal } from "@icp-sdk/core/principal";
import type { GameConfig, ShiftView } from "../bindings/backend";
import { formatRiggy, parseRecipient, parseRiggy, riggyBalance, riggyFee, withdrawRiggy } from "./wallet";

const TIER_NAMES = ["Free", "Deep Shaft", "Crystal Caverns", "The Core"];
const DEFAULT_MIN_HOLDING = [0n, 100_000_000_000n, 2_500_000_000_000n, 10_000_000_000_000n];

type Notify = (text: string, kind?: "info" | "error" | "success") => void;
type Pending = { to: Principal; amount: bigint; fee: bigint };

function tierForBalance(balance: bigint, minHolding: bigint[]) {
  let tier = 0;
  minHolding.forEach((min, i) => {
    if (i > 0 && balance >= min) tier = i;
  });
  return tier;
}

export default function WalletPage({ identity, player, config, shift, recheckBusy, onRecheck, onSignIn, onBack, notify }: {
  identity: Identity | null;
  player?: string;
  config: GameConfig | null;
  shift: ShiftView | null;
  recheckBusy: boolean;
  onRecheck: () => void;
  onSignIn: () => void;
  onBack: () => void;
  notify: Notify;
}) {
  const [balance, setBalance] = useState<bigint | null>(null);
  const [fee, setFee] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState(false);

  const refresh = useCallback(async () => {
    if (!identity || !player) return;
    setLoading(true);
    try {
      const [nextBalance, nextFee] = await Promise.all([riggyBalance(identity), riggyFee(identity)]);
      setBalance(nextBalance);
      setFee(nextFee);
      setLedgerError(false);
    } catch {
      setLedgerError(true);
    } finally {
      setLoading(false);
    }
  }, [identity, player]);

  useEffect(() => {
    setBalance(null);
    setFee(null);
    refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 20_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const minHolding = config?.tierMinHolding.length === 4 ? config.tierMinHolding : DEFAULT_MIN_HOLDING;

  return (
    <section className="wallet-page">
      <div className="wallet-head">
        <div>
          <span className="dig-eyebrow">GAME WALLET</span>
          <h2>Your RIGGY wallet</h2>
          <p>This wallet belongs to your Internet Identity sign-in for Riggy Deep Dig. The RIGGY held here sets your holder tier.</p>
        </div>
        <button className="g-btn ghost sm" onClick={onBack}>← Back to the mine</button>
      </div>

      {!player || !identity ? (
        <div className="wallet-card wallet-signin">
          <h3>Sign in to open your wallet</h3>
          <p>Internet Identity creates a game wallet just for this site. You can receive RIGGY there to unlock holder biomes and withdraw it any time.</p>
          <button className="g-btn primary" onClick={onSignIn}>Sign in with Internet Identity</button>
        </div>
      ) : (
        <div className="wallet-grid">
          <BalanceCard
            balance={balance}
            loading={loading}
            ledgerError={ledgerError}
            minHolding={minHolding}
            shift={shift}
            recheckBusy={recheckBusy}
            onRefresh={refresh}
            onRecheck={onRecheck}
          />
          <ReceiveCard player={player} />
          <WithdrawCard
            identity={identity}
            player={player}
            balance={balance}
            fee={fee}
            minHolding={minHolding}
            onSent={refresh}
            notify={notify}
          />
        </div>
      )}
    </section>
  );
}

function BalanceCard({ balance, loading, ledgerError, minHolding, shift, recheckBusy, onRefresh, onRecheck }: {
  balance: bigint | null;
  loading: boolean;
  ledgerError: boolean;
  minHolding: bigint[];
  shift: ShiftView | null;
  recheckBusy: boolean;
  onRefresh: () => void;
  onRecheck: () => void;
}) {
  const tier = balance === null ? null : tierForBalance(balance, minHolding);
  const nextMin = tier !== null && tier < minHolding.length - 1 ? minHolding[tier + 1] : null;
  const shiftTier = shift ? Number(shift.tier) : null;
  const canRecheck = shift && !shift.result && tier !== null && shiftTier !== null && tier > shiftTier;
  return (
    <div className="wallet-card wallet-balance">
      <div className="wallet-card-title"><span>🪙</span><h3>Balance</h3><button className="wallet-icon-btn" onClick={onRefresh} disabled={loading} aria-label="Refresh balance">{loading ? "…" : "↻"}</button></div>
      <strong className="wallet-amount">{balance === null ? (ledgerError ? "—" : "Loading…") : formatRiggy(balance, 4)}<small> RIGGY</small></strong>
      {ledgerError && <p className="wallet-warn">Couldn't reach the RIGGY ledger. Try refreshing in a moment.</p>}
      {tier !== null && (
        <div className="wallet-tier">
          <span>Holder tier for this balance: <b>Tier {tier} · {TIER_NAMES[tier]}</b></span>
          {nextMin !== null && balance !== null && <span>Hold <b>{formatRiggy(nextMin - balance, 2)}</b> more RIGGY for Tier {tier + 1} · {TIER_NAMES[tier + 1]}.</span>}
          {shiftTier !== null && <span>Today's shift is using <b>Tier {shiftTier}</b>.</span>}
        </div>
      )}
      {canRecheck && <button className="g-btn ghost sm" onClick={onRecheck} disabled={recheckBusy}>{recheckBusy ? "Checking…" : "↻ Update today's shift tier"}</button>}
      <p className="wallet-note">The game reads this balance when you start a shift. Deposits made later in the day count after you update your shift tier.</p>
    </div>
  );
}

function ReceiveCard({ player }: { player: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    QRCode.toString(player, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#140726", light: "#ffffff" } })
      .then((svg) => { if (alive) setQr(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`); })
      .catch(() => { if (alive) setQr(null); });
    return () => { alive = false; };
  }, [player]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(player);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="wallet-card wallet-receive">
      <div className="wallet-card-title"><span>⬇</span><h3>Receive</h3></div>
      <div className="wallet-qr">{qr ? <img src={qr} alt="QR code of your game wallet principal" width={180} height={180} /> : <span>QR unavailable</span>}</div>
      <span className="wallet-label">Your game wallet principal</span>
      <div className="wallet-principal">
        <code>{player}</code>
        <button className="g-btn ghost sm" onClick={copy}>{copied ? "Copied ✓" : "Copy"}</button>
      </div>
      <ol className="wallet-steps">
        <li>Copy this principal or scan the QR code.</li>
        <li>In Soon (or any ICRC-1 wallet), send <b>RIGGY</b> to it.</li>
        <li>Your balance updates here within seconds.</li>
      </ol>
      <p className="wallet-warn">Only send RIGGY on the Internet Computer to this address. Other tokens sent here won't show up in the game.</p>
    </div>
  );
}

function WithdrawCard({ identity, player, balance, fee, minHolding, onSent, notify }: {
  identity: Identity;
  player: string;
  balance: bigint | null;
  fee: bigint | null;
  minHolding: bigint[];
  onSent: () => void;
  notify: Notify;
}) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [sending, setSending] = useState(false);
  const [lastBlock, setLastBlock] = useState<bigint | null>(null);

  const recipient = to.trim() ? parseRecipient(to) : null;
  const value = amount.trim() ? parseRiggy(amount) : null;
  const max = balance !== null && fee !== null && balance > fee ? balance - fee : 0n;

  let problem: string | null = null;
  if (to.trim() && !recipient) problem = "That isn't a valid principal.";
  else if (recipient?.toText() === player) problem = "That's this game wallet. Enter a different principal.";
  else if (amount.trim() && value === null) problem = "Enter a positive amount with up to 8 decimals.";
  else if (value !== null && fee !== null && balance !== null && value + fee > balance) problem = `Not enough RIGGY. Max you can send is ${formatRiggy(max)}.`;
  const ready = !!recipient && value !== null && fee !== null && balance !== null && !problem;

  const review = (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready || !recipient || value === null || fee === null) return;
    setPending({ to: recipient, amount: value, fee });
  };

  const confirm = async () => {
    if (!pending || sending) return;
    setSending(true);
    try {
      const response = await withdrawRiggy(identity, pending.to, pending.amount, pending.fee);
      if ("ok" in response) {
        setLastBlock(response.ok);
        setPending(null);
        setAmount("");
        notify(`Sent ${formatRiggy(pending.amount)} RIGGY.`, "success");
        onSent();
      } else {
        notify(response.err, "error");
        setPending(null);
      }
    } catch {
      notify("The withdrawal couldn't be confirmed. Check your balance before trying again.", "error");
      setPending(null);
      onSent();
    } finally {
      setSending(false);
    }
  };

  const tierAfter = pending && balance !== null ? tierForBalance(balance - pending.amount - pending.fee, minHolding) : null;
  const tierNow = balance !== null ? tierForBalance(balance, minHolding) : null;

  return (
    <div className="wallet-card wallet-withdraw">
      <div className="wallet-card-title"><span>⬆</span><h3>Withdraw</h3></div>
      {pending ? (
        <div className="wallet-confirm">
          <p>Please review. Ledger transfers can't be reversed.</p>
          <dl>
            <div><dt>To</dt><dd><code>{pending.to.toText()}</code></dd></div>
            <div><dt>Amount</dt><dd>{formatRiggy(pending.amount)} RIGGY</dd></div>
            <div><dt>Ledger fee</dt><dd>{formatRiggy(pending.fee)} RIGGY</dd></div>
            <div><dt>Total</dt><dd><b>{formatRiggy(pending.amount + pending.fee)} RIGGY</b></dd></div>
          </dl>
          {tierAfter !== null && tierNow !== null && tierAfter < tierNow && <p className="wallet-warn">After this withdrawal your holder tier drops to Tier {tierAfter} from your next shift.</p>}
          <div className="wallet-actions">
            <button className="g-btn ghost" onClick={() => setPending(null)} disabled={sending}>Cancel</button>
            <button className="g-btn primary" onClick={confirm} disabled={sending}>{sending ? "Sending…" : "Confirm withdrawal"}</button>
          </div>
        </div>
      ) : (
        <form className="wallet-form" onSubmit={review}>
          <label className="wallet-label" htmlFor="wallet-to">Recipient principal</label>
          <input id="wallet-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="e.g. your Soon wallet principal" autoComplete="off" spellCheck={false} />
          <label className="wallet-label" htmlFor="wallet-amount">Amount (RIGGY)</label>
          <div className="wallet-amount-row">
            <input id="wallet-amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" autoComplete="off" />
            <button type="button" className="g-btn ghost sm" onClick={() => setAmount(formatRiggy(max).replace(/,/g, ""))} disabled={max === 0n}>Max</button>
          </div>
          <small className="wallet-note">Ledger fee: {fee === null ? "…" : `${formatRiggy(fee)} RIGGY`} · Available: {balance === null ? "…" : `${formatRiggy(balance, 4)} RIGGY`}</small>
          {problem && <p className="wallet-warn">{problem}</p>}
          <button className="g-btn primary" disabled={!ready}>Review withdrawal</button>
          <p className="wallet-note">You sign this transfer yourself with Internet Identity. It goes straight to the RIGGY ledger, and the game canister never holds your tokens.</p>
        </form>
      )}
      {lastBlock !== null && <p className="wallet-success">Last withdrawal confirmed in ledger block #{lastBlock.toString()}.</p>}
    </div>
  );
}
