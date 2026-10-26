import { Actor, HttpAgent } from "@icp-sdk/core/agent";
import type { IDL } from "@icp-sdk/core/candid";
import type { Principal } from "@icp-sdk/core/principal";

export const MARKET_ID = "bp5zr-xaaaa-aaaai-rayva-cai";
export const LEDGER_ID = "bi47f-2yaaa-aaaai-rayvq-cai";
export const FACTORY_ID = "3jz7z-jqaaa-aaaab-ag6kq-cai";
export const SOCIAL_ID = "phejn-2yaaa-aaaab-ahaaa-cai";
export const TOKEN_DECIMALS = 8;
export const SOON_URL = `https://soonlaunchpad.fun/t/${MARKET_ID}`;

export interface BaseToken {
  fee: bigint;
  decimals: number;
  icpswap_standard: string;
  ledger: Principal;
  symbol: string;
}

export interface TokenMeta {
  x: [] | [string];
  logo: string;
  name: string;
  description: string;
  website: [] | [string];
  telegram: [] | [string];
  symbol: string;
}

export type Phase =
  | { Trading: null }
  | { Graduating: { last_error: [] | [string]; step: unknown } }
  | { Graduated: { pool: Principal; positions: bigint[] } };

export interface MarketInfo {
  x: bigint;
  y: bigint;
  id: Principal;
  x0: bigint;
  height: bigint;
  mine_supply: bigint;
  mined: bigint;
  cycles_balance: bigint;
  reward: bigint;
  outbox: bigint;
  creator: Principal;
  creator_owed: bigint;
  platform_owed: bigint;
  lp_fees_token: bigint;
  expected_hashes: number;
  base: BaseToken;
  trades: bigint;
  meta: TokenMeta;
  sold: bigint;
  created_at: bigint;
  lp_fees_base: bigint;
  target: bigint;
  traders: bigint;
  cycles_burned_rigs: bigint;
  cycles_burned_market: bigint;
  ledger: Principal;
  raised: bigint;
  progress_bps: number;
  gross_to_complete: bigint;
  token_fee: bigint;
  last_block_at: bigint;
  phase: Phase;
  active_rigs: number;
  price: number;
  curve_supply: bigint;
  volume_base: bigint;
  treasury: Principal;
}

export interface Trade {
  at: bigint;
  id: bigint;
  buy: boolean;
  who: Principal;
  base: bigint;
  tokens: bigint;
  price: number;
}

export interface Candle {
  t: bigint;
  low: number;
  high: number;
  close: number;
  open: number;
  volume: bigint;
}

export interface PostView {
  at: bigint;
  id: bigint;
  deleted: boolean;
  imported: boolean;
  subject: [] | [Principal];
  mine: number;
  badges: number;
  hidden: boolean;
  text: string;
  author: Principal;
  pinned: boolean;
  replies: number;
  market: Principal;
  moment: [] | [string];
  reactions: number[];
  parent: [] | [bigint];
}

export interface UsdPrice {
  at: bigint;
  usd: number;
  ledger: Principal;
  symbol: string;
}

interface MarketService {
  info: () => Promise<MarketInfo>;
  trades: (n: number) => Promise<Trade[]>;
  candles: (hourly: boolean, sinceNs: bigint) => Promise<Candle[]>;
}

interface SocialService {
  thread: (market: Principal, before: [] | [bigint], n: number) => Promise<PostView[]>;
}

interface FactoryService {
  prices: () => Promise<UsdPrice[]>;
  names: (ps: Principal[]) => Promise<Array<[Principal, string]>>;
}

const marketIdl: IDL.InterfaceFactory = ({ IDL }) => {
  const BaseToken = IDL.Record({
    fee: IDL.Nat,
    decimals: IDL.Nat8,
    icpswap_standard: IDL.Text,
    ledger: IDL.Principal,
    symbol: IDL.Text,
  });
  const TokenMeta = IDL.Record({
    x: IDL.Opt(IDL.Text),
    logo: IDL.Text,
    name: IDL.Text,
    description: IDL.Text,
    website: IDL.Opt(IDL.Text),
    telegram: IDL.Opt(IDL.Text),
    symbol: IDL.Text,
  });
  const GradStep = IDL.Variant({
    Release: IDL.Record({ pool: IDL.Principal, positions: IDL.Vec(IDL.Nat) }),
    Mint: IDL.Record({ pool: IDL.Principal }),
    Deposit: IDL.Record({ pool: IDL.Principal }),
    MintLp: IDL.Record({ pool: IDL.Principal }),
    RequestPool: IDL.Null,
  });
  const Phase = IDL.Variant({
    Graduating: IDL.Record({ last_error: IDL.Opt(IDL.Text), step: GradStep }),
    Graduated: IDL.Record({ pool: IDL.Principal, positions: IDL.Vec(IDL.Nat) }),
    Trading: IDL.Null,
  });
  const MarketInfo = IDL.Record({
    x: IDL.Nat,
    y: IDL.Nat,
    id: IDL.Principal,
    x0: IDL.Nat,
    height: IDL.Nat64,
    mine_supply: IDL.Nat,
    mined: IDL.Nat,
    cycles_balance: IDL.Nat,
    reward: IDL.Nat,
    outbox: IDL.Nat64,
    creator: IDL.Principal,
    creator_owed: IDL.Nat,
    platform_owed: IDL.Nat,
    lp_fees_token: IDL.Nat,
    expected_hashes: IDL.Float64,
    base: BaseToken,
    trades: IDL.Nat64,
    meta: TokenMeta,
    sold: IDL.Nat,
    created_at: IDL.Nat64,
    lp_fees_base: IDL.Nat,
    target: IDL.Nat,
    traders: IDL.Nat64,
    cycles_burned_rigs: IDL.Nat,
    cycles_burned_market: IDL.Nat,
    ledger: IDL.Principal,
    raised: IDL.Nat,
    progress_bps: IDL.Nat32,
    gross_to_complete: IDL.Nat,
    token_fee: IDL.Nat,
    last_block_at: IDL.Nat64,
    phase: Phase,
    active_rigs: IDL.Nat32,
    price: IDL.Float64,
    curve_supply: IDL.Nat,
    volume_base: IDL.Nat,
    treasury: IDL.Principal,
  });
  const Trade = IDL.Record({
    at: IDL.Nat64,
    id: IDL.Nat64,
    buy: IDL.Bool,
    who: IDL.Principal,
    base: IDL.Nat,
    tokens: IDL.Nat,
    price: IDL.Float64,
  });
  const Candle = IDL.Record({
    t: IDL.Nat64,
    low: IDL.Float64,
    high: IDL.Float64,
    close: IDL.Float64,
    open: IDL.Float64,
    volume: IDL.Nat,
  });
  return IDL.Service({
    info: IDL.Func([], [MarketInfo], ["query"]),
    trades: IDL.Func([IDL.Nat32], [IDL.Vec(Trade)], ["query"]),
    candles: IDL.Func([IDL.Bool, IDL.Nat64], [IDL.Vec(Candle)], ["query"]),
  });
};

const socialIdl: IDL.InterfaceFactory = ({ IDL }) => {
  const PostView = IDL.Record({
    at: IDL.Nat64,
    id: IDL.Nat64,
    deleted: IDL.Bool,
    imported: IDL.Bool,
    subject: IDL.Opt(IDL.Principal),
    mine: IDL.Nat8,
    badges: IDL.Nat8,
    hidden: IDL.Bool,
    text: IDL.Text,
    author: IDL.Principal,
    pinned: IDL.Bool,
    replies: IDL.Nat32,
    market: IDL.Principal,
    moment: IDL.Opt(IDL.Text),
    reactions: IDL.Vec(IDL.Nat32),
    parent: IDL.Opt(IDL.Nat64),
  });
  return IDL.Service({
    thread: IDL.Func([IDL.Principal, IDL.Opt(IDL.Nat64), IDL.Nat32], [IDL.Vec(PostView)], ["query"]),
  });
};

const factoryIdl: IDL.InterfaceFactory = ({ IDL }) => {
  const UsdPrice = IDL.Record({
    at: IDL.Nat64,
    usd: IDL.Float64,
    ledger: IDL.Principal,
    symbol: IDL.Text,
  });
  return IDL.Service({
    prices: IDL.Func([], [IDL.Vec(UsdPrice)], ["query"]),
    names: IDL.Func([IDL.Vec(IDL.Principal)], [IDL.Vec(IDL.Tuple(IDL.Principal, IDL.Text))], ["query"]),
  });
};

// Anonymous, read-only agent: every call below is a free public query.
const actorsPromise = HttpAgent.create({ host: "https://icp-api.io" }).then((agent) => ({
  market: Actor.createActor<MarketService>(marketIdl, { agent, canisterId: MARKET_ID }),
  social: Actor.createActor<SocialService>(socialIdl, { agent, canisterId: SOCIAL_ID }),
  factory: Actor.createActor<FactoryService>(factoryIdl, { agent, canisterId: FACTORY_ID }),
}));

export const api = {
  info: async () => (await actorsPromise).market.info(),
  trades: async (n: number) => (await actorsPromise).market.trades(n),
  candles: async (hourly: boolean, sinceNs: bigint) => (await actorsPromise).market.candles(hourly, sinceNs),
  thread: async (market: Principal, n: number) => (await actorsPromise).social.thread(market, [], n),
  prices: async () => (await actorsPromise).factory.prices(),
  names: async (ps: Principal[]) => (await actorsPromise).factory.names(ps),
};
