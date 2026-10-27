import { Actor, HttpAgent, type Identity } from "@icp-sdk/core/agent";
import type { IDL } from "@icp-sdk/core/candid";
import { Principal } from "@icp-sdk/core/principal";

export const RIGGY_LEDGER_ID = "bi47f-2yaaa-aaaai-rayvq-cai";
export const RIGGY_DECIMALS = 8;
const UNIT = 10n ** BigInt(RIGGY_DECIMALS);
// The RIGGY ledger only exists on mainnet, so always talk to the public boundary nodes.
const LEDGER_HOST = "https://icp-api.io";

type Account = { owner: Principal; subaccount: [] | [Uint8Array] };

type TransferError =
  | { BadFee: { expected_fee: bigint } }
  | { BadBurn: { min_burn_amount: bigint } }
  | { InsufficientFunds: { balance: bigint } }
  | { TooOld: null }
  | { CreatedInFuture: { ledger_time: bigint } }
  | { TemporarilyUnavailable: null }
  | { Duplicate: { duplicate_of: bigint } }
  | { GenericError: { error_code: bigint; message: string } };

interface LedgerService {
  icrc1_balance_of: (account: Account) => Promise<bigint>;
  icrc1_fee: () => Promise<bigint>;
  icrc1_transfer: (args: {
    from_subaccount: [] | [Uint8Array];
    to: Account;
    amount: bigint;
    fee: [] | [bigint];
    memo: [] | [Uint8Array];
    created_at_time: [] | [bigint];
  }) => Promise<{ Ok: bigint } | { Err: TransferError }>;
}

const ledgerIdl: IDL.InterfaceFactory = ({ IDL }) => {
  const Account = IDL.Record({ owner: IDL.Principal, subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)) });
  const TransferError = IDL.Variant({
    BadFee: IDL.Record({ expected_fee: IDL.Nat }),
    BadBurn: IDL.Record({ min_burn_amount: IDL.Nat }),
    InsufficientFunds: IDL.Record({ balance: IDL.Nat }),
    TooOld: IDL.Null,
    CreatedInFuture: IDL.Record({ ledger_time: IDL.Nat64 }),
    TemporarilyUnavailable: IDL.Null,
    Duplicate: IDL.Record({ duplicate_of: IDL.Nat }),
    GenericError: IDL.Record({ error_code: IDL.Nat, message: IDL.Text }),
  });
  return IDL.Service({
    icrc1_balance_of: IDL.Func([Account], [IDL.Nat], ["query"]),
    icrc1_fee: IDL.Func([], [IDL.Nat], ["query"]),
    icrc1_transfer: IDL.Func(
      [
        IDL.Record({
          from_subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
          to: Account,
          amount: IDL.Nat,
          fee: IDL.Opt(IDL.Nat),
          memo: IDL.Opt(IDL.Vec(IDL.Nat8)),
          created_at_time: IDL.Opt(IDL.Nat64),
        }),
      ],
      [IDL.Variant({ Ok: IDL.Nat, Err: TransferError })],
      [],
    ),
  });
};

const ledgers = new WeakMap<Identity, Promise<LedgerService>>();

function ledgerFor(identity: Identity): Promise<LedgerService> {
  let ledger = ledgers.get(identity);
  if (!ledger) {
    ledger = HttpAgent.create({ host: LEDGER_HOST, identity }).then((agent) =>
      Actor.createActor<LedgerService>(ledgerIdl, { agent, canisterId: RIGGY_LEDGER_ID }),
    );
    ledgers.set(identity, ledger);
  }
  return ledger;
}

export async function riggyBalance(identity: Identity): Promise<bigint> {
  const ledger = await ledgerFor(identity);
  return ledger.icrc1_balance_of({ owner: identity.getPrincipal(), subaccount: [] });
}

export async function riggyFee(identity: Identity): Promise<bigint> {
  return (await ledgerFor(identity)).icrc1_fee();
}

export type WithdrawResult = { ok: bigint } | { err: string };

/** Sends RIGGY from the signed-in II account; the user's own identity signs the ledger call. */
export async function withdrawRiggy(identity: Identity, to: Principal, amount: bigint, fee: bigint): Promise<WithdrawResult> {
  const ledger = await ledgerFor(identity);
  const response = await ledger.icrc1_transfer({
    from_subaccount: [],
    to: { owner: to, subaccount: [] },
    amount,
    fee: [fee],
    memo: [],
    // Lets the ledger reject an accidental resubmission of the same transfer.
    created_at_time: [BigInt(Date.now()) * 1_000_000n],
  });
  if ("Ok" in response) return { ok: response.Ok };
  return { err: describeTransferError(response.Err) };
}

function describeTransferError(error: TransferError): string {
  if ("InsufficientFunds" in error) return `Not enough RIGGY. Balance: ${formatRiggy(error.InsufficientFunds.balance)} RIGGY.`;
  if ("BadFee" in error) return `The ledger fee changed to ${formatRiggy(error.BadFee.expected_fee)} RIGGY. Please try again.`;
  if ("Duplicate" in error) return `This transfer was already sent (block ${error.Duplicate.duplicate_of.toString()}).`;
  if ("TemporarilyUnavailable" in error) return "The RIGGY ledger is temporarily unavailable. Try again shortly.";
  if ("TooOld" in error || "CreatedInFuture" in error) return "Your device clock looks off. Check it and try again.";
  if ("BadBurn" in error) return "This amount is below the ledger minimum.";
  return error.GenericError.message || "The ledger rejected the transfer.";
}

export function formatRiggy(e8s: bigint, maxDecimals = RIGGY_DECIMALS): string {
  const whole = e8s / UNIT;
  const frac = (e8s % UNIT).toString().padStart(RIGGY_DECIMALS, "0").slice(0, maxDecimals).replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}${frac ? `.${frac}` : ""}`;
}

/** Parses a user-entered RIGGY amount into e8s; returns null if it isn't a valid positive amount. */
export function parseRiggy(input: string): bigint | null {
  const text = input.trim().replace(/,/g, "");
  const match = /^(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (!match[1] && !match[2])) return null;
  const frac = match[2] ?? "";
  if (frac.length > RIGGY_DECIMALS) return null;
  const value = BigInt(match[1] || "0") * UNIT + BigInt(frac.padEnd(RIGGY_DECIMALS, "0") || "0");
  return value > 0n ? value : null;
}

export function parseRecipient(input: string): Principal | null {
  try {
    const principal = Principal.fromText(input.trim());
    return principal.isAnonymous() ? null : principal;
  } catch {
    return null;
  }
}
