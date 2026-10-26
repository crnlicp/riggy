import { AuthClient } from "@icp-sdk/auth/client";
import type { Identity } from "@icp-sdk/core/agent";
import { safeGetCanisterEnv } from "@icp-sdk/core/agent/canister-env";
import { createActor, type Backend } from "../bindings/backend";

export const SOON_URL = "https://soonlaunchpad.fun/t/bp5zr-xaaaa-aaaai-rayva-cai";
const env = safeGetCanisterEnv<{ readonly ["PUBLIC_CANISTER_ID:backend"]: string }>();
export const BACKEND_ID = env?.["PUBLIC_CANISTER_ID:backend"];
export const auth = new AuthClient();

export function backend(identity?: Identity): Backend | null {
  if (!BACKEND_ID) return null;
  return createActor(BACKEND_ID, { agentOptions: { identity, rootKey: env?.IC_ROOT_KEY } });
}

export function riggy(e8s: bigint): string {
  const amount = Number(e8s) / 100_000_000;
  return amount.toLocaleString("en-US", { maximumFractionDigits: amount < 10 ? 4 : 0 });
}
