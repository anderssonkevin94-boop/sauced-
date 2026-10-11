import { NextResponse } from "next/server";
import { askEdward, type EdwardTurn } from "@/lib/edward";

// Edward's chat (lib/edward.ts). A route rather than a server action so saving a recipe,
// which tidies it with Claude first, has time to finish.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  let history: EdwardTurn[] = [];
  try {
    const body = (await req.json()) as { history?: unknown };
    if (Array.isArray(body.history)) history = body.history.slice(-30) as EdwardTurn[];
  } catch {
    return NextResponse.json({ error: "Något gick fel. Försök igen." }, { status: 400 });
  }
  return NextResponse.json(await askEdward(history));
}
