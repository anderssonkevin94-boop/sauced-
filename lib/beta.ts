import "server-only";
import { cookies } from "next/headers";

export const BETA_COOKIE = "sauced_beta";

/**
 * Beta: new features show only on phones where the kitchen owner switched Beta on (You page).
 * It's a cookie, so it's per device (a home-screen app keeps its own, apart from Safari).
 */
export async function isBeta(): Promise<boolean> {
  return (await cookies()).get(BETA_COOKIE)?.value === "1";
}
