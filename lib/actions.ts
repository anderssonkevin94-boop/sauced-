"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DEMO } from "@/lib/config";
import { requireMe } from "@/lib/data";
import { demo } from "@/lib/demo";
import { toLines } from "@/lib/parse";
import { supabaseServer } from "@/lib/supabase/server";
import type { Kind, RecipeInput } from "@/lib/types";

export type FormState = { error?: string } | undefined;

function readRecipe(form: FormData): RecipeInput | string {
  const str = (k: string) => String(form.get(k) ?? "").trim();
  const title = str("title");
  if (!title) return "Give it a name, even a silly one.";
  if (title.length > 120) return "That name is a bit long.";
  const kind: Kind = str("kind") === "classic" ? "classic" : "experiment";
  return {
    title,
    kind,
    ingredients: toLines(str("ingredients")),
    steps: toLines(str("steps")),
    notes: str("notes"),
    serves: str("serves") || null,
    time: str("time") || null,
    photoPath: str("photoPath") || null,
  };
}

const toRow = (r: RecipeInput) => ({
  title: r.title,
  kind: r.kind,
  ingredients: r.ingredients,
  steps: r.steps,
  notes: r.notes,
  serves: r.serves,
  time: r.time,
  photo_path: r.photoPath,
});

export async function createRecipe(_: FormState, form: FormData): Promise<FormState> {
  await requireMe();
  const input = readRecipe(form);
  if (typeof input === "string") return { error: input };
  let id: string;
  if (DEMO) {
    id = demo.create(input);
  } else {
    const sb = await supabaseServer();
    const { data, error } = await sb.from("recipes").insert(toRow(input)).select("id").single();
    if (error) return { error: "Couldn't save that. Try again in a moment." };
    id = data.id;
  }
  revalidatePath("/");
  redirect(`/r/${id}?saved=1`);
}

export async function updateRecipe(id: string, _: FormState, form: FormData): Promise<FormState> {
  await requireMe();
  const input = readRecipe(form);
  if (typeof input === "string") return { error: input };
  if (DEMO) {
    demo.update(id, input);
  } else {
    const sb = await supabaseServer();
    const { error } = await sb.from("recipes").update(toRow(input)).eq("id", id);
    if (error) return { error: "Couldn't save that. Try again in a moment." };
  }
  revalidatePath("/");
  revalidatePath(`/r/${id}`);
  redirect(`/r/${id}`);
}

export async function deleteRecipe(id: string) {
  await requireMe();
  if (DEMO) {
    demo.remove(id);
  } else {
    const sb = await supabaseServer();
    const { data } = await sb.from("recipes").delete().eq("id", id).select("photo_path").maybeSingle();
    if (data?.photo_path) await sb.storage.from("photos").remove([data.photo_path]);
  }
  revalidatePath("/");
  redirect("/");
}

export async function joinKitchen(_: FormState, form: FormData): Promise<FormState> {
  const name = String(form.get("name") ?? "").trim();
  const code = String(form.get("code") ?? "").trim();
  if (!name) return { error: "What should your friends call you?" };
  if (name.length > 40) return { error: "Keep the name under 40 characters." };
  if (DEMO) redirect("/");
  const sb = await supabaseServer();
  const { error } = await sb.rpc("join_kitchen", { code, name });
  if (error) return { error: error.message.includes("code") ? "That kitchen code isn't right." : "Couldn't join. Try again." };
  revalidatePath("/", "layout");
  redirect("/");
}

export async function renameMe(_: FormState, form: FormData): Promise<FormState> {
  const me = await requireMe();
  const name = String(form.get("name") ?? "").trim();
  if (!name || name.length > 40) return { error: "Names are 1 to 40 characters." };
  if (DEMO) {
    demo.rename(name);
  } else {
    const sb = await supabaseServer();
    const { error } = await sb.from("profiles").update({ display_name: name }).eq("id", me.id);
    if (error) return { error: "Couldn't save that." };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function signOut() {
  if (!DEMO) {
    const sb = await supabaseServer();
    await sb.auth.signOut();
  }
  redirect("/login");
}
