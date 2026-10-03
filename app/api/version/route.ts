// The deploy that's live now. An app left open compares it with the one it loaded
// (components/Pwa.tsx) and reloads itself when they differ.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ build: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" }, { headers: { "Cache-Control": "no-store" } });
}
