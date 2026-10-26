export const WIDTH = 16;
export const ROWS_PER_BIOME = 100;
export const BIOME_COUNT = 5;
export const MOD32 = 4_294_967_296;
export const MOVE_UP = 0;
export const MOVE_RIGHT = 1;
export const MOVE_DOWN = 2;
export const MOVE_LEFT = 3;
export const MOVE_ROPE = 4;
export const MOVE_SCAN = 5;

export type TileKind = "air" | "dirt" | "stone" | "copper" | "silver" | "gold" | "ruby" | "sapphire" | "emerald" | "diamond" | "boulder" | "bedrock" | "coin";
export type GemKind = "copper" | "silver" | "gold" | "ruby" | "sapphire" | "emerald" | "diamond";

export interface Tile {
  kind: TileKind;
  hardness: number;
  value: number;
  gemIndex: number;
}

export interface GameState {
  seed: number;
  pick: number;
  bagLevel: number;
  lamp: number;
  detector: number;
  maxBiome: number;
  energy: number;
  energyMax: number;
  bagCapacity: number;
  bagValue: number;
  bagGems: number[];
  bankedValue: number;
  bankedGems: number[];
  x: number;
  y: number;
  depth: number;
  maxDepth: number;
  moves: number[];
  dug: Set<number>;
  brokenStones: Set<number>;
  ended: boolean;
  banked: boolean;
  invalidMove: number | null;
}

export interface SimOptions {
  pick: number;
  bag: number;
  lamp: number;
  detector: number;
  energy: number;
  maxBiome: number;
}

export interface ShiftOutcome {
  score: number;
  gems: number;
  maxDepth: number;
  counts: number[];
  hauledValue: number;
  banked: boolean;
  energyLeft: number;
  moves: number;
}

export const GEM_KINDS: GemKind[] = ["copper", "silver", "gold", "ruby", "sapphire", "emerald", "diamond"];
const GEM_BASE_VALUES = [4, 8, 14, 28, 34, 42, 80];
const ORE_RANGES = [90, 60, 40, 22, 18, 13, 7];
const ORE_DEPTH = [160, 130, 100, 70, 55, 45, 30];
const AIR_LIMITS = [1250, 1105, 960, 815, 670];
const ORE_OFFSETS = [11750, 11895, 12040, 12185, 12330];
const EMPTY: Tile = { kind: "air", hardness: 0, value: 0, gemIndex: -1 };

export function createGame(seed: number, options: SimOptions): GameState {
  const maxBiome = Math.max(0, Math.min(BIOME_COUNT - 1, Math.floor(options.maxBiome)));
  return {
    seed: Math.floor(seed) >>> 0,
    pick: Math.max(1, Math.floor(options.pick)),
    bagLevel: Math.max(1, Math.floor(options.bag)),
    lamp: Math.max(1, Math.floor(options.lamp)),
    detector: Math.max(1, Math.floor(options.detector)),
    maxBiome,
    energy: Math.max(0, Math.floor(options.energy)),
    energyMax: Math.max(0, Math.floor(options.energy)),
    bagCapacity: 8 + Math.max(0, Math.floor(options.bag) - 1) * 6,
    bagValue: 0,
    bagGems: Array(GEM_KINDS.length).fill(0),
    bankedValue: 0,
    bankedGems: Array(GEM_KINDS.length).fill(0),
    x: Math.floor(WIDTH / 2),
    y: 0,
    depth: 0,
    maxDepth: 0,
    moves: [],
    dug: new Set<number>(),
    brokenStones: new Set<number>(),
    ended: false,
    banked: false,
    invalidMove: null,
  };
}

function cellIndex(x: number, y: number) {
  return y * WIDTH + x;
}

function hashCell(seed: number, x: number, y: number) {
  const a = ((seed >>> 0) * 1_664_525) % MOD32;
  const b = (y * 1_013_904_223) % MOD32;
  const c = (x * 747_796_405) % MOD32;
  return Math.floor((a + b + c) % MOD32);
}

export function biomeAt(y: number) {
  return Math.floor(y / ROWS_PER_BIOME);
}

export function tileAt(seed: number, x: number, y: number): Tile {
  if (x < 0 || x >= WIDTH || y < 0) return { kind: "bedrock", hardness: 255, value: 0, gemIndex: -1 };
  if (y === 0) return EMPTY;
  const biome = biomeAt(y);
  if (biome >= BIOME_COUNT) return { kind: "bedrock", hardness: 255, value: 0, gemIndex: -1 };
  const roll = hashCell(seed, x, y) % 10_000;
  const airLimit = AIR_LIMITS[biome];
  if (roll < airLimit) return EMPTY;
  if (roll < airLimit + 4450) return { kind: "dirt", hardness: 1, value: 0, gemIndex: -1 };
  if (roll < airLimit + 7000) return { kind: "stone", hardness: biome >= 3 && roll % 5 === 0 ? 3 : 2, value: 0, gemIndex: -1 };
  if (roll > 9900 && biome > 0) return { kind: "boulder", hardness: 2 + Math.min(2, biome), value: 0, gemIndex: -1 };
  if (roll >= 9800 && roll <= 9900) return { kind: "coin", hardness: 1, value: 2 + biome, gemIndex: -1 };

  const oreRoll = (roll + ORE_OFFSETS[biome]) % 10_000;
  let threshold = 0;
  for (let i = 0; i < ORE_RANGES.length; i++) {
    threshold += ORE_RANGES[i] + biome * ORE_DEPTH[i];
    if (oreRoll < threshold) {
      const hardness = 1 + Math.floor(i / 3) + Math.floor(biome / 2);
      return { kind: GEM_KINDS[i], hardness, value: GEM_BASE_VALUES[i] * (biome + 1), gemIndex: i };
    }
  }
  return { kind: "stone", hardness: biome >= 3 ? 3 : 2, value: 0, gemIndex: -1 };
}

export function tileForState(state: GameState, x: number, y: number): Tile {
  const idx = cellIndex(x, y);
  if (state.dug.has(idx)) return EMPTY;
  if (state.brokenStones.has(idx)) return { kind: "dirt", hardness: 1, value: 0, gemIndex: -1 };
  return tileAt(state.seed, x, y);
}

export function applyMove(state: GameState, move: number): "moved" | "banked" | "ended" | "invalid" {
  if (state.ended || !Number.isInteger(move) || move < MOVE_UP || move > MOVE_SCAN) {
    state.invalidMove = state.moves.length;
    return "invalid";
  }
  if (move === MOVE_SCAN) {
    if (state.energy < 2) {
      state.invalidMove = state.moves.length;
      return "invalid";
    }
    state.energy -= 2;
    state.moves.push(move);
    if (state.energy === 0) {
      state.bankedValue += Math.floor(state.bagValue / 2);
      for (let i = 0; i < state.bagGems.length; i++) {
        state.bankedGems[i] += state.bagGems[i];
        state.bagGems[i] = 0;
      }
      state.bagValue = 0;
      state.ended = true;
      return "ended";
    }
    return "moved";
  }
  if (move === MOVE_ROPE) {
    if (state.energy <= 0) {
      state.invalidMove = state.moves.length;
      return "invalid";
    }
    state.energy -= 1;
    state.moves.push(move);
    state.bankedValue += state.bagValue;
    state.bagValue = 0;
    for (let i = 0; i < state.bagGems.length; i++) {
      state.bankedGems[i] += state.bagGems[i];
      state.bagGems[i] = 0;
    }
    state.banked = true;
    state.ended = true;
    return "banked";
  }

  if (state.energy <= 0 || state.bagValue >= state.bagCapacity) {
    state.invalidMove = state.moves.length;
    return "invalid";
  }
  const dx = move === MOVE_LEFT ? -1 : move === MOVE_RIGHT ? 1 : 0;
  const dy = move === MOVE_UP ? -1 : move === MOVE_DOWN ? 1 : 0;
  const nx = state.x + dx;
  const ny = state.y + dy;
  if (nx < 0 || nx >= WIDTH || ny < 0 || ny >= (state.maxBiome + 1) * ROWS_PER_BIOME) {
    state.invalidMove = state.moves.length;
    return "invalid";
  }

  const idx = cellIndex(nx, ny);
  const tile = tileForState(state, nx, ny);
  if (tile.kind === "bedrock") {
    state.invalidMove = state.moves.length;
    return "invalid";
  }
  if (tile.kind !== "air" && !state.dug.has(idx)) {
    const requiredPick = 1 + Math.floor(Math.max(0, tile.hardness - 1) / 2);
    if (state.pick < requiredPick) {
      state.invalidMove = state.moves.length;
      return "invalid";
    }
    const energyCost = tile.kind === "stone" || tile.kind === "boulder" ? 2 : 1;
    if (state.energy < energyCost) {
      state.invalidMove = state.moves.length;
      return "invalid";
    }
    state.energy -= energyCost;
    state.moves.push(move);
    if (tile.kind === "stone" || tile.kind === "boulder") {
      state.brokenStones.add(idx);
    } else {
      state.dug.add(idx);
      if (tile.value > 0 && state.bagValue + tile.value <= state.bagCapacity) {
        state.bagValue += tile.value;
        if (tile.gemIndex >= 0) state.bagGems[tile.gemIndex] += 1;
      }
      state.x = nx;
      state.y = ny;
    }
  } else {
    state.energy -= 1;
    state.moves.push(move);
    state.x = nx;
    state.y = ny;
  }

  state.depth = Math.max(0, state.y);
  state.maxDepth = Math.max(state.maxDepth, state.depth);
  if (state.bagValue >= state.bagCapacity || state.energy <= 0) {
    state.bankedValue += Math.floor(state.bagValue / 2);
    for (let i = 0; i < state.bagGems.length; i++) {
      state.bankedGems[i] += state.bagGems[i];
      state.bagGems[i] = 0;
    }
    state.bagValue = 0;
    state.ended = true;
  }
  return state.ended ? "ended" : "moved";
}

export function replayMoves(seed: number, options: SimOptions, moves: ArrayLike<number>): { state: GameState; invalidMove: number | null } {
  const state = createGame(seed, options);
  for (let i = 0; i < moves.length; i++) {
    const result = applyMove(state, moves[i]);
    if (result === "invalid") return { state, invalidMove: i };
    if (state.ended && i < moves.length - 1) return { state, invalidMove: i + 1 };
  }
  if (!state.ended) return { state, invalidMove: moves.length };
  return { state, invalidMove: null };
}

export function outcomeOf(state: GameState): ShiftOutcome {
  const gems = state.bankedGems.reduce((sum, n) => sum + n, 0);
  const score = state.bankedValue + state.maxDepth * 2 + gems * 10;
  return {
    score,
    gems,
    maxDepth: state.maxDepth,
    counts: [...state.bankedGems],
    hauledValue: state.bankedValue,
    banked: state.banked,
    energyLeft: state.energy,
    moves: state.moves.length,
  };
}

export function makeMoveBytes(moves: number[]): Uint8Array {
  return Uint8Array.from(moves);
}

export function bytesToMoves(bytes: Uint8Array): number[] {
  return Array.from(bytes);
}

export function tileLabel(kind: TileKind): string {
  switch (kind) {
    case "air": return "Open tunnel";
    case "dirt": return "Dirt";
    case "stone": return "Stone";
    case "boulder": return "Boulder";
    case "bedrock": return "Bedrock";
    case "coin": return "Coin";
    default: return kind[0].toUpperCase() + kind.slice(1);
  }
}

export function tileEmoji(kind: TileKind): string {
  switch (kind) {
    case "air": return "";
    case "dirt": return "🟫";
    case "stone": return "🪨";
    case "copper": return "🟠";
    case "silver": return "⚪";
    case "gold": return "🟡";
    case "ruby": return "🔴";
    case "sapphire": return "🔵";
    case "emerald": return "🟢";
    case "diamond": return "💎";
    case "boulder": return "🪨";
    case "bedrock": return "⬛";
    case "coin": return "🪙";
  }
}
