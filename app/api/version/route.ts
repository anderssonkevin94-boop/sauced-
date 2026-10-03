import { createECDH } from "node:crypto";
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

export function GET() {
  return Response.json(
    { build: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev", push: pushStatus() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
