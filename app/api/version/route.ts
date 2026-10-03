import { createECDH } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { PUSH_PUBLIC_KEY } from "@/lib/push-key";

// The deploy that's live now. An app left open compares it with the one it loaded
// (components/Pwa.tsx) and reloads itself when they differ. Also says whether push
// notifications can be sent: the private key is set and matches the public one (never shown).
export const dynamic = "force-dynamic";

function pushStatus(): "ok" | "missing" | "mismatch" {
  const key = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!key) return "missing";
  try {
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(Buffer.from(key, "base64url"));
    return ecdh.getPublicKey().toString("base64url") === PUSH_PUBLIC_KEY ? "ok" : "mismatch";
  } catch {
    return "mismatch";
  }
}

/** ?check=claude: whether the Anthropic key is set and accepted (a free model lookup, never a billed call). */
async function claudeStatus(): Promise<"ok" | "missing" | "rejected" | "unreachable"> {
  if (!process.env.ANTHROPIC_API_KEY) return "missing";
  try {
    await new Anthropic({ timeout: 8_000, maxRetries: 0 }).models.retrieve("claude-sonnet-5-5");
    return "ok";
  } catch (e) {
    return e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError ? "rejected" : "unreachable";
  }
}

export async function GET(req: Request) {
  const check = new URL(req.url).searchParams.get("check");
  return Response.json(
    { build: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev", push: pushStatus(), ...(check === "claude" ? { claude: await claudeStatus() } : {}) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
