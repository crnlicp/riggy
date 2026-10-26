import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Principal } from "@icp-sdk/core/principal";
import type { Identity } from "@icp-sdk/core/agent";
import {
  auth,
  backend,
  BACKEND_ID,
  riggy,
  SOON_URL,
} from "./api";
import {
  applyMove,
  biomeAt,
  createGame,
  MOVE_DOWN,
  MOVE_LEFT,
  MOVE_RIGHT,
  MOVE_ROPE,
  MOVE_SCAN,
  MOVE_UP,
  outcomeOf,
  replayMoves,
  tileForState,
  tileEmoji,
  tileLabel,
  WIDTH,
  ROWS_PER_BIOME,
  type GameState,
  type ShiftOutcome,
} from "./sim";
import {
  type Community,
  type DayRow,
  type FameRow,
  type GameConfig,
  type ProfileView,
  type ShiftView,
  type Upgrade,
  type StartError,
} from "../bindings/backend";
import { shortId, timeAgo } from "../format";
import DigScene from "./DigScene";
import { COLLECTION_DURATION_MS, MiningBurst, PickaxeStrike, STRIKE_IMPACT_MS, type DigDirection } from "./MiningEffects";

const LOGO = "/riggy.webp";
const VISIBLE_ROWS = 13;
const BIOMES = [
  { name: "Topsoil", icon: "🌱", accent: "#ffb347" },
  { name: "Coal Seam", icon: "⛏️", accent: "#adb5bd" },
  { name: "Deep Shaft", icon: "🦇", accent: "#5ef2b0" },
  { name: "Crystal Caverns", icon: "💎", accent: "#c08bff" },
  { name: "The Core", icon: "🌋", accent: "#ff7043" },
];
const E8S = 100_000_000n;

type BoardTab = "daily" | "hall";
type Toast = { text: string; kind: "info" | "error" | "success" };
type DigEffect = { id: number; x: number; y: number; stage: "hammer" | "break" | "move" | "pickup"; direction?: DigDirection; lootKind?: "coin" | "gem"; stone?: boolean; glyph?: string; color?: string };
const LOOT_COLORS: Record<string, string> = { coin: "#ffd45e", copper: "#ff9d55", silver: "#d6e6ff", gold: "#ffd45e", ruby: "#ff5876", sapphire: "#59a6ff", emerald: "#5ef2b0", diamond: "#baf7ff" };

function savedMovesKey(player: string, day: bigint) {
  return `riggy-deep-dig:${player}:${day}`;
}

function readSavedMoves(player: string, day: bigint): number[] {
  try {
    const value = JSON.parse(localStorage.getItem(savedMovesKey(player, day)) ?? "[]");
    return Array.isArray(value) && value.length <= 512 && value.every((n) => Number.isInteger(n)) ? value : [];
  } catch {
    return [];
  }
}

function fmtNum(v: number | bigint) {
  return Number(v).toLocaleString("en-US");
}

function principalFromIdentity(identity: Identity | null) {
  if (!identity) return null;
  const principal = identity.getPrincipal();
  return principal.isAnonymous() ? null : principal;
}

export default function DeepDigApp() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const player = principalFromIdentity(identity);
  const playerText = player?.toText();
  const api = useMemo(() => backend(identity ?? undefined), [identity]);
  const publicApi = useMemo(() => backend(), []);

  const [config, setConfig] = useState<GameConfig | null>(null);
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [shift, setShift] = useState<ShiftView | null>(null);
  const [community, setCommunity] = useState<Community | null>(null);
  const [boardTab, setBoardTab] = useState<BoardTab>("daily");
  const [dailyRows, setDailyRows] = useState<DayRow[]>([]);
  const [fameRows, setFameRows] = useState<FameRow[]>([]);
  const [boardLoading, setBoardLoading] = useState(false);

  const [game, setGame] = useState<GameState | null>(null);
  const gameRef = useRef<GameState | null>(null);
  const [result, setResult] = useState<ShiftOutcome | null>(null);
  const [savedResult, setSavedResult] = useState<ShiftView["result"]>(undefined);
  const [revision, setRevision] = useState(0);
  const [scanPulse, setScanPulse] = useState(false);
  const [digEffect, setDigEffect] = useState<DigEffect | null>(null);
  const [animating, setAnimating] = useState(false);
  const animatingRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [name, setName] = useState("");
  const [nameBusy, setNameBusy] = useState(false);
  const [upgradeBusy, setUpgradeBusy] = useState<Upgrade | null>(null);
  const [leaderboardVersion, setLeaderboardVersion] = useState(0);
  const effectId = useRef(0);

  const notify = useCallback((text: string, kind: Toast["kind"] = "info") => setToast({ text, kind }), []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const sync = () => {
      if (auth.isAuthenticated()) auth.getIdentity().then(setIdentity, () => setIdentity(null));
      else setIdentity(null);
    };
    sync();
    return auth.subscribe(sync);
  }, []);

  useEffect(() => {
    if (!publicApi) return;
    publicApi.config().then(setConfig).catch(() => undefined);
    const refresh = () => publicApi.refreshMarket().then(setCommunity).catch(() => publicApi.community().then(setCommunity).catch(() => undefined));
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => clearInterval(timer);
  }, [publicApi]);

  const refreshProfile = useCallback(async () => {
    if (!publicApi || !player) {
      setProfile(null);
      return;
    }
    const next = await publicApi.profile(player).catch(() => null);
    setProfile(next);
    if (next?.name) setName(next.name);
  }, [publicApi, playerText]);

  useEffect(() => {
    refreshProfile().catch(() => undefined);
  }, [refreshProfile]);

  const loadBoards = useCallback(async () => {
    if (!publicApi) return;
    setBoardLoading(true);
    try {
      if (boardTab === "daily") setDailyRows(await publicApi.dayBoard(null, 20n));
      else setFameRows(await publicApi.hallOfFame(20n));
    } catch {
      notify("Couldn't refresh the leaderboard.", "error");
    } finally {
      setBoardLoading(false);
    }
  }, [publicApi, boardTab, leaderboardVersion, notify]);

  useEffect(() => {
    loadBoards();
    const timer = window.setInterval(loadBoards, 30_000);
    return () => clearInterval(timer);
  }, [loadBoards]);

  const installShift = useCallback((view: ShiftView, signedPlayer?: string) => {
    setShift(view);
    setSavedResult(view.result);
    setResult(null);
    if (view.result || !signedPlayer) {
      setGame(null);
      gameRef.current = null;
      return;
    }
    const options = {
      pick: Number(view.pick),
      bag: Number(view.bag),
      lamp: Number(view.lamp),
      detector: Number(view.detector),
      energy: Number(view.energy),
      maxBiome: Number(view.maxBiome),
    };
    const next = createGame(Number(view.seed), options);
    const moves = readSavedMoves(signedPlayer, view.day);
    for (const move of moves) {
      if (next.ended || applyMove(next, move) === "invalid") break;
    }
    next.moves = moves.slice(0, next.moves.length);
    gameRef.current = next;
    setGame(next);
    setRevision((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!player || !publicApi) {
      setShift(null);
      setSavedResult(undefined);
      setGame(null);
      gameRef.current = null;
      return;
    }
    let alive = true;
    publicApi.myShift(player).then((existing) => {
      if (alive && existing) installShift(existing, player.toText());
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [playerText, publicApi, installShift]);

  const beginShift = async () => {
    if (busy) return;
    setResult(null);
    if (!player || !api) {
      const seed = Math.floor(Math.random() * 0xffff_ffff);
      const practice = createGame(seed, { pick: 1, bag: 1, lamp: 1, detector: 1, energy: 80, maxBiome: 1 });
      gameRef.current = practice;
      setGame(practice);
      setShift(null);
      setSavedResult(undefined);
      setRevision((v) => v + 1);
      notify("Practice shift: this mine isn't shared and its score won't be saved.");
      return;
    }
    setBusy(true);
    try {
      const response = await api.startShift();
      if (response.__kind__ === "err") {
        const error = response.err as StartError;
        notify(error.__kind__ === "busy" ? "A shift is already active." : error.__kind__ === "ledgerUnavailable" ? error.ledgerUnavailable : "Sign in to start a daily shift.", "error");
      } else {
        installShift(response.ok, player.toText());
        if (response.ok.result) notify("Today's shift has already been banked.");
      }
    } catch {
      notify("Couldn't start a shift. Try again in a moment.", "error");
    } finally {
      setBusy(false);
    }
  };

  const finish = useCallback(async (finished: GameState) => {
    const outcome = outcomeOf(finished);
    setResult(outcome);
    setGame(null);
    gameRef.current = null;
    setBusy(true);
    if (!player || !api || !shift) {
      setBusy(false);
      return;
    }
    try {
      const response = await api.submitShift(Uint8Array.from(finished.moves));
      if (response.__kind__ === "err") {
        const err = response.err;
        const message = err.__kind__ === "invalidMove"
          ? `The server rejected move ${Number(err.invalidMove) + 1}; this shift wasn't saved.`
          : err.__kind__ === "alreadySubmitted"
            ? "This daily shift has already been submitted."
            : err.__kind__ === "expired"
              ? "This daily shift expired before it could be saved."
              : err.__kind__ === "tooLong"
                ? "This shift exceeded the move limit."
                : "The shift couldn't be submitted.";
        notify(message, "error");
      } else {
        setSavedResult(response.ok);
        notify(`Haul banked: ${fmtNum(response.ok.score)} points.`, "success");
        setLeaderboardVersion((v) => v + 1);
        await refreshProfile();
      }
    } catch {
      notify("Couldn't submit your move log. The run remains in this browser for retry.", "error");
    } finally {
      setBusy(false);
    }
  }, [api, playerText, refreshProfile, shift]);

  const doMove = useCallback((move: number) => {
    const current = gameRef.current;
    if (!current || current.ended || busy || animatingRef.current) return;
    const fromX = current.x;
    const fromY = current.y;
    const targetX = fromX + (move === MOVE_LEFT ? -1 : move === MOVE_RIGHT ? 1 : 0);
    const targetY = fromY + (move === MOVE_UP ? -1 : move === MOVE_DOWN ? 1 : 0);
    const targetIdx = targetY * WIDTH + targetX;
    const targetTile = move <= MOVE_LEFT ? tileForState(current, targetX, targetY) : null;
    const alreadyDug = targetTile ? current.dug.has(targetIdx) : false;
    const preview: GameState = {
      ...current,
      bagGems: current.bagGems.slice(),
      bankedGems: current.bankedGems.slice(),
      moves: current.moves.slice(),
      dug: new Set(current.dug),
      brokenStones: new Set(current.brokenStones),
      invalidMove: null,
    };
    const action = applyMove(preview, move);
    if (action === "invalid") {
      if (move === MOVE_SCAN) notify("The lamp needs 2 energy for a detector pulse.");
      else if (move !== MOVE_ROPE && (targetX < 0 || targetX >= WIDTH || targetY < 0 || targetY >= (current.maxBiome + 1) * ROWS_PER_BIOME)) notify("Bedrock blocks that way. Find another route.");
      else if (targetTile && !alreadyDug && current.pick < 1 + Math.floor(Math.max(0, targetTile.hardness - 1) / 2)) notify("That seam is too tough for this pick. Upgrade it at the surface.");
      else if (targetTile && !alreadyDug && (targetTile.kind === "stone" || targetTile.kind === "boulder") && current.energy < 2) notify("Stone takes 2 energy per hammer swing.");
      else notify("You can't make that move right now.");
      return;
    }
    const saveMoveLog = (state: GameState) => {
      if (!playerText || !shift) return;
      try {
        localStorage.setItem(savedMovesKey(playerText, shift.day), JSON.stringify(state.moves));
      } catch {
        notify("Browser storage is unavailable. Keep this tab open until the shift is banked.", "error");
      }
    };
    const finishVisual = (state: GameState) => {
      setDigEffect(null);
      animatingRef.current = false;
      setAnimating(false);
      if (state.ended) finish(state);
    };
    const commitMove = () => {
      gameRef.current = preview;
      setGame(preview);
      setRevision((v) => v + 1);
      saveMoveLog(preview);
      if (preview.x === fromX && preview.y === fromY) {
        finishVisual(preview);
        return;
      }
      const color = targetTile ? LOOT_COLORS[targetTile.kind] ?? "#baf7ff" : "#baf7ff";
      const collectible = !!targetTile && !alreadyDug && targetTile.value > 0 && current.bagValue + targetTile.value <= current.bagCapacity;
      setDigEffect({ id: ++effectId.current, x: targetX, y: targetY, stage: "move", color });
      window.setTimeout(() => {
        if (collectible && targetTile) {
          setDigEffect({ id: ++effectId.current, x: targetX, y: targetY, stage: "pickup", lootKind: targetTile.kind === "coin" ? "coin" : "gem", glyph: tileEmoji(targetTile.kind), color });
          window.setTimeout(() => finishVisual(preview), COLLECTION_DURATION_MS);
        } else {
          finishVisual(preview);
        }
      }, 700);
    };

    if (move === MOVE_SCAN) {
      gameRef.current = preview;
      setGame(preview);
      setRevision((v) => v + 1);
      saveMoveLog(preview);
      animatingRef.current = true;
      setAnimating(true);
      setScanPulse(true);
      window.setTimeout(() => {
        setScanPulse(false);
        finishVisual(preview);
      }, 700);
      return;
    }
    if (move === MOVE_ROPE) {
      gameRef.current = preview;
      setGame(preview);
      setRevision((v) => v + 1);
      saveMoveLog(preview);
      finish(preview);
      return;
    }

    const needsHammer = !!targetTile && !alreadyDug && targetTile.kind !== "air";
    animatingRef.current = true;
    setAnimating(true);
    if (!needsHammer) {
      commitMove();
      return;
    }
    const direction: DigDirection = move === MOVE_UP ? "up" : move === MOVE_DOWN ? "down" : move === MOVE_LEFT ? "left" : "right";
    const strikeId = ++effectId.current;
    const stone = targetTile?.kind === "stone" || targetTile?.kind === "boulder";
    setDigEffect({ id: strikeId, x: targetX, y: targetY, stage: "hammer", direction, stone });
    window.setTimeout(() => {
      setDigEffect({ id: strikeId, x: targetX, y: targetY, stage: "break", direction, stone, color: "#ffc17b" });
      window.setTimeout(commitMove, 700);
    }, STRIKE_IMPACT_MS);
  }, [busy, finish, notify, playerText, shift]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const key = event.key.toLowerCase();
      const move = key === "arrowup" || key === "w" ? MOVE_UP
        : key === "arrowright" || key === "d" ? MOVE_RIGHT
          : key === "arrowdown" || key === "s" ? MOVE_DOWN
            : key === "arrowleft" || key === "a" ? MOVE_LEFT
              : null;
      if (move !== null && gameRef.current) {
        event.preventDefault();
        doMove(move);
      }
      if (key === " " && gameRef.current) {
        event.preventDefault();
        doMove(MOVE_ROPE);
      }
      if (key === "f" && gameRef.current) {
        event.preventDefault();
        doMove(MOVE_SCAN);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doMove]);

  const signIn = () => auth.signIn().then(setIdentity, () => notify("Sign-in was cancelled."));
  const signOut = () => auth.signOut().finally(() => setIdentity(null));

  const saveName = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!api || !name.trim()) return;
    setNameBusy(true);
    try {
      const response = await api.setName(name.trim());
      if (response.__kind__ === "ok") {
        setName(response.ok);
        notify("Miner name saved.", "success");
        refreshProfile();
      } else notify(response.err.__kind__ === "invalid" ? response.err.invalid : "Sign in first.", "error");
    } catch {
      notify("Couldn't save the miner name.", "error");
    } finally {
      setNameBusy(false);
    }
  };

  const buyUpgrade = async (kind: Upgrade) => {
    if (!api || upgradeBusy) return;
    setUpgradeBusy(kind);
    try {
      const response = await api.buyUpgrade(kind);
      if (response.__kind__ === "ok") {
        setProfile(response.ok);
        notify(`${kind} upgraded for tomorrow's shift.`, "success");
      } else if (response.err.__kind__ === "notEnoughCoins") {
        notify(`Need ${fmtNum(response.err.notEnoughCoins.cost)} coins; you have ${fmtNum(response.err.notEnoughCoins.coins)}.`, "error");
      } else notify("That upgrade is maxed out.", "error");
    } catch {
      notify("Couldn't buy that upgrade.", "error");
    } finally {
      setUpgradeBusy(null);
    }
  };

  const recheck = async () => {
    if (!api) return;
    setBusy(true);
    try {
      const response = await api.recheckHolding();
      if (response.__kind__ === "ok") {
        installShift(response.ok, playerText);
        notify("Holder tier refreshed.", "success");
      } else if (response.err.__kind__ === "tooSoon") notify(`Check again in ${response.err.tooSoon.retryAfterSeconds.toString()} seconds.`);
      else notify("Could not verify your holding yet.", "error");
    } catch {
      notify("Couldn't check the RIGGY ledger.", "error");
    } finally {
      setBusy(false);
    }
  };

  const claimRush = async () => {
    if (!api || !player) return;
    setBusy(true);
    try {
      const response = await api.claimRush();
      if (response.__kind__ === "ok") {
        installShift(response.ok, player.toText());
        notify("Gem Rush claimed: +8 energy!", "success");
      } else {
        notify(response.err === "noRush" ? "That Gem Rush has ended." : "You've already claimed this rush.", "error");
      }
    } catch {
      notify("Couldn't claim the Gem Rush.", "error");
    } finally {
      setBusy(false);
    }
  };

  const active = game;
  const topRow = active ? Math.max(0, Math.min(active.y - Math.floor(VISIBLE_ROWS / 2), (active.maxBiome + 1) * ROWS_PER_BIOME - VISIBLE_ROWS)) : 0;
  const currentBiome = active ? Math.min(4, biomeAt(active.y)) : 0;
  const biome = BIOMES[currentBiome];
  useEffect(() => {
    if (!scanPulse) return;
    const timer = window.setTimeout(() => setScanPulse(false), 700);
    return () => clearTimeout(timer);
  }, [scanPulse, revision]);

  return (
    <>
      <div className="g-backdrop" aria-hidden>
        <div className="g-glow a" />
        <div className="g-glow b" />
        {Array.from({ length: 14 }, (_, i) => <span key={i} className="g-ore" style={{ ["--i" as string]: i }} />)}
      </div>
      <header className="g-top">
        <a className="g-brand" href="/play">
          <img src={LOGO} alt="" width={34} height={34} />
          <span>Riggy <b>Deep Dig</b></span>
        </a>
        <a className="g-link" href="/">📈 RIGGY price & charts</a>
        {player ? <button className="g-btn ghost sm" onClick={signOut}>{profile?.name ?? shortId(playerText!)} · Sign out</button> : <button className="g-btn primary sm" onClick={signIn}>Sign in</button>}
      </header>

      <main className="g-main dig-main">
        <section className="dig-intro">
          <div>
            <span className="g-pill">⛏ Daily mine · holder biomes · built on Soon</span>
            <h1>Riggy <span>Deep Dig</span></h1>
            <p>Break through the layers, sniff out rare ore, then decide when to haul it home. A shared daily mine, with scores replayed and checked on-chain.</p>
          </div>
          <div className="dig-intro-art"><DigScene variant="compact" /></div>
        </section>

        {community && <CommunityBar community={community} shift={shift} disabled={busy} onClaim={claimRush} />}

        <section className="dig-layout">
          <div className={`dig-primary ${active ? "" : "dig-primary-intro"}`}>
            <div className="dig-mine-head">
              <div>
                <span className="dig-eyebrow">{active ? `${biome.icon} ${biome.name}` : "TODAY'S SHAFT"}</span>
                <h2>{active ? "Your mining shift" : "The daily mine"}</h2>
              </div>
              {active && <span className="dig-day">Shift #{shift?.day.toString() ?? "practice"}</span>}
            </div>

            {active ? (
              <>
                <MineHUD state={active} biome={biome} />
                <MineGrid state={active} topRow={topRow} scanPulse={scanPulse} effect={digEffect} animating={animating} onStep={doMove} />
                <div className="dig-controls">
                  <div className="dig-pad" aria-label="Movement controls">
                    <button onClick={() => doMove(MOVE_UP)} aria-label="Move up">↑</button>
                    <button onClick={() => doMove(MOVE_LEFT)} aria-label="Move left">←</button>
                    <button onClick={() => doMove(MOVE_DOWN)} aria-label="Move down">↓</button>
                    <button onClick={() => doMove(MOVE_RIGHT)} aria-label="Move right">→</button>
                  </div>
                  <div className="dig-actions">
                    <button className="g-btn ghost" onClick={() => doMove(MOVE_SCAN)} disabled={busy || animating || active.energy < 2}>◎ Detect · 2 energy <kbd>F</kbd></button>
                    <button className="g-btn primary" onClick={() => doMove(MOVE_ROPE)} disabled={busy || animating || active.energy < 1}>↥ Rope up <kbd>Space</kbd></button>
                  </div>
                </div>
                <p className="dig-hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrows to dig · break stone for 2 energy, then dig the dirt for 1 energy to move in · coins and gems go in your bag · rope up to bank at full value.</p>
                {active.ended && <div className="dig-bank-note">Shift complete. Your move log is being replayed by the game canister…</div>}
              </>
            ) : (
              <MineStart
                player={playerText}
                busy={busy}
                savedResult={savedResult}
                result={result}
                onStart={beginShift}
              />
            )}

            {result && !active && <ResultPanel outcome={result} saved={savedResult} onAgain={beginShift} />}
            {savedResult && !active && !result && <SavedResult result={savedResult} />}
          </div>

          <aside className="dig-sidebar">
            <ProfilePanel player={playerText} profile={profile} name={name} setName={setName} busy={nameBusy} onSave={saveName} onSignIn={signIn} />
            <UpgradePanel profile={profile} busy={upgradeBusy} onBuy={buyUpgrade} />
            <Album profile={profile} />
            <Leaderboard tab={boardTab} setTab={setBoardTab} dailyRows={dailyRows} fameRows={fameRows} loading={boardLoading} player={playerText} />
            <HolderPanel player={playerText} shift={shift} onSignIn={signIn} onRecheck={recheck} busy={busy} />
          </aside>
        </section>

        <section className="dig-real-mining">
          <div className="dig-cta-icon">⚙️</div>
          <div>
            <span className="dig-eyebrow">REAL PROOF OF WORK</span>
            <h2>Want to mine actual RIGGY?</h2>
            <p>Riggy Deep Dig is a game; real RIGGY mining happens through Soon rigs. You stay in your wallet and approve there.</p>
          </div>
          <a className="g-btn primary" href={SOON_URL} target="_blank" rel="noopener noreferrer">Start a rig on Soon ↗</a>
        </section>
      </main>

      <footer className="g-foot">
        <p>A community game for $RIGGY, built on <a href="https://soonlaunchpad.fun" target="_blank" rel="noopener noreferrer">Soon</a>. Not affiliated with or endorsed by Soon. The game only reads balances; it never moves tokens.</p>
        <p className="g-muted">Scores are game-only. Nothing here is financial advice. Never share a seed phrase or private key.</p>
      </footer>
      {toast && <button className={`g-toast dig-toast ${toast.kind}`} role="status" onClick={() => setToast(null)}>{toast.text}</button>}
    </>
  );
}

function MineStart({ player, busy, savedResult, result, onStart }: { player?: string; busy: boolean; savedResult: ShiftView["result"]; result: ShiftOutcome | null; onStart: () => void }) {
  if (savedResult || result) return null;
  return (
    <div className="dig-start">
      <div className="dig-shaft-preview"><DigScene variant="compact" /></div>
      <div className="dig-start-copy">
        <h3>{player ? "Your tools are waiting." : "A shaft full of secrets."}</h3>
        <p>{player ? "Today's mine is shared with every miner. Each swing uses energy; bag upgrades carry to tomorrow." : "Sign in to claim today's shared seed and save your score. Or try a local practice shift first."}</p>
        <button className="g-btn primary lg" onClick={onStart} disabled={busy}>{busy ? "Opening today's shaft…" : player ? "Start today's shift" : "Practice dig"} <span>⛏</span></button>
        {player && <p className="g-muted small">One scored shift per day. Your move log stays in this browser until it's banked.</p>}
      </div>
    </div>
  );
}

function MineHUD({ state, biome }: { state: GameState; biome: typeof BIOMES[number] }) {
  const bagPercent = Math.min(100, (state.bagValue / state.bagCapacity) * 100);
  const energyPercent = state.energyMax ? (state.energy / state.energyMax) * 100 : 0;
  return (
    <div className="dig-hud" style={{ ["--biome-accent" as string]: biome.accent }}>
      <div className="dig-metric depth"><span>Depth</span><strong>{state.y}<small>m</small></strong><em>Peak {state.maxDepth} m</em></div>
      <div className="dig-meter energy"><div><span>⛽ Energy</span><b>{state.energy} / {state.energyMax}</b></div><div className="dig-meter-track"><i style={{ width: `${energyPercent}%` }} /></div></div>
      <div className="dig-meter bag"><div><span>🎒 Haul value</span><b>{state.bagValue} / {state.bagCapacity}</b></div><div className="dig-meter-track"><i style={{ width: `${bagPercent}%` }} /></div></div>
      <div className="dig-metric"><span>Biome</span><strong>{biome.icon} {biome.name}</strong><em>{state.maxBiome + 1} layers open</em></div>
    </div>
  );
}

function MineGrid({ state, topRow, scanPulse, effect, animating, onStep }: { state: GameState; topRow: number; scanPulse: boolean; effect: DigEffect | null; animating: boolean; onStep: (move: number) => void }) {
  const rows = Array.from({ length: VISIBLE_ROWS }, (_, i) => topRow + i);
  const scanRange = 3 + state.detector * 2;
  return (
    <div className="dig-grid-wrap" key={state.y}>
      <div className="dig-depth-ruler">
        {rows.map((row) => <span key={row} className={row % ROWS_PER_BIOME === 0 ? "biome-mark" : ""}>{row % 10 === 0 ? row : "·"}</span>)}
      </div>
      <div className="dig-grid" role="grid" aria-label="Mining shaft">
        {rows.flatMap((row) => Array.from({ length: WIDTH }, (_, col) => {
          const idx = row * WIDTH + col;
          const isPlayer = state.x === col && state.y === row;
          const dug = state.dug.has(idx);
          const tile = tileForState(state, col, row);
          const distance = Math.abs(col - state.x) + Math.abs(row - state.y);
          const darkRange = 2 + state.lamp;
          const scanned = scanPulse && distance <= scanRange;
          const visible = isPlayer || tile.kind === "air" || distance <= darkRange || scanned;
          const isOre = tile.gemIndex >= 0;
          const isValuable = isOre || tile.kind === "coin";
          const revealed = visible && isValuable;
          const energyCost = !dug && (tile.kind === "stone" || tile.kind === "boulder") ? 2 : 1;
          const canReach = distance === 1 && visible && !state.ended && !animating;
          const effectHere = effect?.x === col && effect.y === row ? effect : null;
          const kind = revealed ? tile.kind : tile.kind === "bedrock" ? "bedrock" : tile.kind === "air" || dug ? "air" : tile.kind === "stone" ? "stone" : tile.kind === "boulder" ? "boulder" : "dirt";
          const move = row < state.y ? MOVE_UP : row > state.y ? MOVE_DOWN : col < state.x ? MOVE_LEFT : MOVE_RIGHT;
          const title = isPlayer ? "Riggy" : !visible ? "Unexplored" : `${tileLabel(tile.kind)}${tile.hardness > 1 ? ` · pick level ${1 + Math.floor((tile.hardness - 1) / 2)} required` : ""}${energyCost === 2 ? " · 2 energy to break stone; dig again for 1 energy to move in" : tile.kind === "dirt" ? " · 1 energy to dig and move in" : ""}${revealed ? ` · value ${tile.value}` : ""}`;
          return (
            <button
              role="gridcell"
              aria-label={title}
              title={title}
              key={`${row}-${col}`}
              className={`dig-cell ${kind} ${isPlayer ? "player" : ""} ${effectHere ? "has-effect" : ""} ${canReach ? "reachable" : ""} ${canReach && state.energy < energyCost ? "low-energy" : ""} ${revealed ? "revealed" : ""} ${scanned && isValuable ? "scanned" : ""}`}
              onClick={() => { if (canReach) onStep(move); }}
              disabled={!canReach}
            >
              {isPlayer ? <img key={state.moves.length} className={effectHere?.stage === "move" ? "board-step" : ""} src={LOGO} alt="Riggy" /> : !visible ? <span className="unknown-mark">·</span> : tile.kind === "air" || dug ? null : revealed ? (
                <span className="dig-collectible" aria-hidden="true">{tileEmoji(tile.kind)}</span>
              ) : tile.kind === "stone" || tile.kind === "boulder" ? (
                <span className="dig-stone" aria-hidden="true"><span>{tileEmoji(tile.kind)}</span></span>
              ) : ""}
              {(effectHere?.stage === "hammer" || effectHere?.stage === "break") && effectHere.direction && <PickaxeStrike key={`strike-${effectHere.id}`} direction={effectHere.direction} />}
              {effectHere?.stage === "break" && <MiningBurst key={effectHere.id} kind="firework" stone={effectHere.stone} />}
              {effectHere?.stage === "pickup" && <MiningBurst key={effectHere.id} kind="confetti" glyph={effectHere.glyph} color={effectHere.color} />}
            </button>
          );
        }))}
      </div>
      <div className="dig-ruler-label">m<br />{rows[0]}<br />↓<br />{rows[rows.length - 1]}</div>
    </div>
  );
}

function ResultPanel({ outcome, saved, onAgain }: { outcome: ShiftOutcome; saved?: ShiftView["result"]; onAgain: () => void }) {
  return (
    <div className="dig-result">
      <div className="dig-result-icon">{saved?.newBest ? "🏆" : "🧺"}</div>
      <div className="dig-result-main"><span className="dig-eyebrow">SHIFT BANKED</span><strong>{fmtNum(saved?.score ?? outcome.score)} <small>points</small></strong><span>{saved ? `Daily rank #${saved.rank.toString()}` : "Practice score · not submitted"}</span></div>
      <div className="dig-result-stats"><span>Peak depth <b>{saved?.maxDepth.toString() ?? outcome.maxDepth} m</b></span><span>Gems found <b>{saved?.gems.toString() ?? outcome.gems}</b></span>{!saved && <span>Haul banked <b>{outcome.hauledValue}</b></span>}</div>
      {saved ? <button className="g-btn ghost" disabled>Today's shift complete</button> : <button className="g-btn ghost" onClick={onAgain}>Try another practice shift</button>}
    </div>
  );
}

function SavedResult({ result }: { result: NonNullable<ShiftView["result"]> }) {
  return <ResultPanel outcome={{ score: Number(result.score), gems: Number(result.gems), maxDepth: Number(result.maxDepth), counts: result.counts.map(Number), hauledValue: Number(result.score), banked: true, energyLeft: 0, moves: 0 }} saved={result} onAgain={() => window.scrollTo({ top: 0, behavior: "smooth" })} />;
}

function ProfilePanel({ player, profile, name, setName, busy, onSave, onSignIn }: { player?: string; profile: ProfileView | null; name: string; setName: (v: string) => void; busy: boolean; onSave: (e: React.FormEvent) => void; onSignIn: () => void }) {
  const [copied, setCopied] = useState(false);
  const copyAddress = async () => {
    if (!player) return;
    try {
      await navigator.clipboard.writeText(player);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };
  if (!player) return <div className="dig-side-section sign-in-panel"><div className="dig-panel-icon">🐹</div><h3>Your miner account</h3><p>Sign in with Internet Identity to claim today's shared mine, save a score and earn game coins.</p><div className="sign-in-actions"><button className="g-btn primary" onClick={onSignIn}>Sign in to dig</button><small>Sign-in uses a passkey. This game never asks for a seed phrase or private key.</small></div></div>;
  return (
    <div className="dig-side-section">
      <div className="dig-side-title"><span>⛏</span><h3>Miner profile</h3></div>
      <div className="dig-profile-id"><img src={LOGO} alt="" /><div><strong>{profile?.name ?? "New miner"}</strong><small title={player}>{shortId(player)}</small></div><button type="button" className="dig-copy-address" onClick={copyAddress}>{copied ? "Copied" : "Copy address"}</button><b>{fmtNum(profile?.coins ?? 0n)}<small> coins</small></b></div>
      <form className="dig-name-form" onSubmit={onSave}><input aria-label="Miner name" maxLength={16} minLength={3} value={name} onChange={(e) => setName(e.target.value)} placeholder="Choose a miner name" /><button className="g-btn ghost sm" disabled={busy || name.trim().length < 3}>{busy ? "…" : "Save"}</button></form>
      <div className="dig-profile-stats"><span>Shifts <b>{profile?.shifts.toString() ?? "0"}</b></span><span>Holding streak <b>{profile?.streak.toString() ?? "0"} days</b></span><span>All-time score <b>{fmtNum(profile?.totalScore ?? 0n)}</b></span></div>
    </div>
  );
}

function UpgradePanel({ profile, busy, onBuy }: { profile: ProfileView | null; busy: Upgrade | null; onBuy: (u: Upgrade) => void }) {
  const items: Array<{ kind: Upgrade; icon: string; title: string; desc: string; level: bigint }> = [
    { kind: "pick" as Upgrade, icon: "⛏️", title: "Steel pick", desc: "Break tougher seams", level: profile?.pick ?? 1n },
    { kind: "bag" as Upgrade, icon: "🎒", title: "Ore satchel", desc: "Carry a bigger haul", level: profile?.bag ?? 1n },
    { kind: "lamp" as Upgrade, icon: "🔦", title: "Headlamp", desc: "See farther underground", level: profile?.lamp ?? 1n },
    { kind: "detector" as Upgrade, icon: "📡", title: "Ore detector", desc: "Longer gem scan radius", level: profile?.detector ?? 1n },
  ];
  return (
    <div className="dig-side-section">
      <div className="dig-side-title"><span>⚒</span><h3>Workshop</h3><em>Coins buy tools</em></div>
      <div className="dig-upgrades">{items.map((item) => <div className="dig-upgrade" key={item.kind}><span className="upgrade-icon">{item.icon}</span><div><strong>{item.title} <small>Lv {item.level.toString()}</small></strong><span>{item.desc}</span></div><button className="dig-upgrade-btn" onClick={() => onBuy(item.kind)} disabled={!profile || !!busy}>{busy === item.kind ? "…" : "Upgrade"}</button></div>)}</div>
      <p className="dig-footnote">Upgrades persist and improve tomorrow's shift. They don't spend RIGGY.</p>
    </div>
  );
}

function Album({ profile }: { profile: ProfileView | null }) {
  const names = ["Copper", "Silver", "Gold", "Ruby", "Sapphire", "Emerald", "Diamond"];
  const icons = ["🟠", "⚪", "🟡", "🔴", "🔵", "🟢", "💎"];
  const found = new Set((profile?.album ?? []).map(Number));
  return (
    <div className="dig-side-section">
      <div className="dig-side-title"><span>💎</span><h3>Gem album</h3><em>{found.size}/7 found</em></div>
      <div className="dig-album">{names.map((n, i) => <div key={n} className={found.has(i) ? "found" : "unknown"} title={`${n}${found.has(i) ? " · found" : " · undiscovered"}`}><span>{found.has(i) ? icons[i] : "?"}</span><small>{n}</small></div>)}</div>
    </div>
  );
}

function Leaderboard({ tab, setTab, dailyRows, fameRows, loading, player }: { tab: BoardTab; setTab: (t: BoardTab) => void; dailyRows: DayRow[]; fameRows: FameRow[]; loading: boolean; player?: string }) {
  const rows = tab === "daily" ? dailyRows : fameRows;
  return (
    <div className="dig-side-section">
      <div className="dig-side-title"><span>🏆</span><h3>Leaderboard</h3></div>
      <div className="dig-tabs"><button className={tab === "daily" ? "active" : ""} onClick={() => setTab("daily")}>Today</button><button className={tab === "hall" ? "active" : ""} onClick={() => setTab("hall")}>Hall of fame</button></div>
      {loading ? <div className="dig-loading">Reading the ledger…</div> : rows.length === 0 ? <p className="dig-empty-board">No miners on the board yet.<br />The first haul is yours.</p> : <ol className="dig-board">{rows.map((row, i) => {
        const id = row.player.toText();
        const score = "totalScore" in row ? row.totalScore : row.score;
        const subtitle = "totalScore" in row ? `${row.kinds.toString()} gems in collection` : `${row.maxDepth.toString()} m deep · ${row.gems.toString()} gems`;
        return <li key={id} className={id === player ? "self" : ""}><b className="board-rank">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${row.rank.toString()}`}</b><span><strong>{row.name ?? shortId(id)}{id === player && <em>you</em>}</strong><small>{subtitle}</small></span><b className="board-score">{fmtNum(score)}</b></li>;
      })}</ol>}
    </div>
  );
}

function HolderPanel({ player, shift, onSignIn, onRecheck, busy }: { player?: string; shift: ShiftView | null; onSignIn: () => void; onRecheck: () => void; busy: boolean }) {
  const tier = Number(shift?.tier ?? 0n);
  const maxBiome = Number(shift?.maxBiome ?? 1n);
  return (
    <div className="dig-side-section holder-panel">
      <div className="dig-side-title"><span>🪙</span><h3>Holder access</h3></div>
      {player ? <><p>Current shift tier: <b>Tier {tier}</b> · {maxBiome + 1} biomes open.</p>{shift && !shift.verified && <p className="dig-ledger-note">RIGGY balance couldn't be verified; this shift has free-tier access only.</p>}<button className="g-btn ghost sm" onClick={onRecheck} disabled={busy}>↻ Recheck RIGGY balance</button></> : <><p>Hold RIGGY in your game account to unlock deeper biomes and add energy each day.</p><button className="g-text-btn" onClick={onSignIn}>Sign in to create your game account</button></>}
      <ol className="holder-steps">
        <li>Sign in. Copy your game account address from Miner profile.</li>
        <li>Buy RIGGY on Soon with your own wallet.</li>
        <li>Send RIGGY to your game account. The game checks its balance when you start a shift.</li>
      </ol>
      <div className="holder-tiers">
        <span><b>1,000</b> RIGGY <em>Deep Shaft · +20 energy</em></span>
        <span><b>25,000</b> RIGGY <em>Crystal Caverns · +40 energy</em></span>
        <span><b>100,000</b> RIGGY <em>The Core · +60 energy</em></span>
      </div>
      <a href={SOON_URL} target="_blank" rel="noopener noreferrer">Buy RIGGY on Soon ↗</a>
      <small>Internet Identity has a different principal on each site. Transfer RIGGY to your game account to qualify; account linking is planned.</small>
    </div>
  );
}

function CommunityBar({ community, shift, disabled, onClaim }: { community: Community; shift: ShiftView | null; disabled: boolean; onClaim: () => void }) {
  const goal = 100;
  const pct = Math.min(100, Number(community.gemsToday) / goal * 100);
    const rushActive = Number(community.rushUntil) / 1_000_000 > Date.now();
    const claimed = !!shift?.rushClaims.includes(community.rushId);
    return (
      <section className="dig-community">
        <div className="dig-community-icon">🌟</div>
        <div className="dig-community-copy">
          <span className="dig-eyebrow">TODAY'S COMMUNITY HAUL</span>
          <strong>{fmtNum(community.gemsToday)} / {goal} gems unearthed</strong>
          <div className="dig-community-meter"><i style={{ width: `${pct}%` }} /></div>
        </div>
        <div className="dig-community-stat"><b>{fmtNum(community.playersToday)}</b><small>miners</small></div>
        <div className="dig-community-stat"><b>{fmtNum(community.blocksToday)}</b><small>RIGGY blocks seen</small></div>
        {rushActive && (
          <>
            <span className="dig-rush">⚡ GEM RUSH</span>
            {shift && !shift.result && (
              <button className="dig-claim-rush" onClick={onClaim} disabled={disabled || claimed}>
                {claimed ? "Claimed" : "+8 energy"}
              </button>
            )}
          </>
        )}
      </section>
    );
}
