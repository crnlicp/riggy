import { AuthClient } from "@icp-sdk/auth/client";
import type { Identity } from "@icp-sdk/core/agent";
import { safeGetCanisterEnv } from "@icp-sdk/core/agent/canister-env";
import { createActor, type Backend } from "../bindings/backend";

export const SOON_URL = "https://soonlaunchpad.fun/t/bp5zr-xaaaa-aaaai-rayva-cai";
const env = safeGetCanisterEnv<{ readonly ["PUBLIC_CANISTER_ID:backend"]: string }>();
export const BACKEND_ID = env?.["PUBLIC_CANISTER_ID:backend"];
// Internet Identity only exists on mainnet. Without an explicit host, the client mints the
// session against the page's own host, which is the local network during local development.
export const auth = new AuthClient({ agentOptions: { host: "https://icp-api.io" } });

export function signInErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/channel is closed/i.test(message)) return "Sign-in was cancelled.";
  if (/could not be opened/i.test(message)) return "The sign-in window was blocked. Allow pop-ups for this site and try again.";
  return message ? `Sign-in failed: ${message}` : "Sign-in failed. Please try again.";
}

export function backend(identity?: Identity): Backend | null {
  if (!BACKEND_ID) return null;
  return createActor(BACKEND_ID, { agentOptions: { identity, rootKey: env?.IC_ROOT_KEY } });
}

export function riggy(e8s: bigint): string {
  const amount = Number(e8s) / 100_000_000;
  return amount.toLocaleString("en-US", { maximumFractionDigits: amount < 10 ? 4 : 0 });
}
