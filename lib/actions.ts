"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DEMO } from "@/lib/config";
import { listCooks, requireMe } from "@/lib/data";
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

/**
 * "Save as a variation": what's in the edit form becomes a new recipe, made from `baseId`;
 * the original stays as it was. Same name as the original gets " (variation)".
 */
export async function createVariation(baseId: string, baseTitle: string, _: FormState, form: FormData): Promise<FormState> {
  await requireMe();
  const input = readRecipe(form);
  if (typeof input === "string") return { error: input };
  if (input.title.trim().toLowerCase() === baseTitle.trim().toLowerCase()) {
    input.title = `${input.title} (variation)`.slice(0, 120);
  }
  let id: string;
  if (DEMO) {
    id = demo.create(input, baseId);
  } else {
    const sb = await supabaseServer();
    const { data, error } = await sb.from("recipes").insert({ ...toRow(input), based_on: baseId }).select("id").single();
    if (error) return { error: "Couldn't save the variation. Try again in a moment." };
    id = data.id;
  }
  revalidatePath("/");
  revalidatePath(`/r/${baseId}`);
  redirect(`/r/${id}?saved=variation`);
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
    if (data?.photo_path) {
      // A variation can share the photo; only remove it when nothing else uses it.
      const { count } = await sb.from("recipes").select("id", { count: "exact", head: true }).eq("photo_path", data.photo_path);
      if (!count) await sb.storage.from("photos").remove([data.photo_path]);
    }
  }
  revalidatePath("/");
  redirect("/");
}

/** Saves just the steps or just the ingredients, from the editors on the recipe page and in cook mode. */
export async function saveLines(recipeId: string, field: "steps" | "ingredients", text: string): Promise<{ error?: string }> {
  await requireMe();
  const lines = toLines(text);
  if (DEMO) {
    demo.patch(recipeId, { [field]: lines });
  } else {
    const sb = await supabaseServer();
    const { data, error } = await sb.from("recipes").update({ [field]: lines }).eq("id", recipeId).select("id");
    if (error) return { error: "Couldn't save that. Try again in a moment." };
    if (!data?.length) return { error: "Couldn't save that. Try again in a moment." };
  }
  revalidatePath("/");
  revalidatePath(`/r/${recipeId}`);
  revalidatePath(`/r/${recipeId}/cook`);
  return {};
}

// ── Pairings ───────────────────────────────────────────────

/** Sorted, so each pair is stored once whichever recipe it was added from. */
const pairOf = (x: string, y: string) => (x < y ? { a: x, b: y } : { a: y, b: x });

/** Sets which recipes pair well with this one: adds the new ones, removes the ones left out. */
export async function setPairings(recipeId: string, ids: string[], before: string[]): Promise<{ error?: string }> {
  await requireMe();
  const want = [...new Set(ids)].filter((id) => id !== recipeId).slice(0, 24);
  const add = want.filter((id) => !before.includes(id));
  const drop = before.filter((id) => !want.includes(id));
  if (DEMO) {
    demo.setPairs(recipeId, want);
  } else {
    const sb = await supabaseServer();
    if (add.length) {
      const { error } = await sb.from("pairings").upsert(add.map((id) => pairOf(recipeId, id)), { onConflict: "a,b", ignoreDuplicates: true });
      if (error) return { error: "Couldn't save that. Try again in a moment." };
    }
    for (const id of drop) {
      const { a, b } = pairOf(recipeId, id);
      const { error } = await sb.from("pairings").delete().eq("a", a).eq("b", b);
      if (error) return { error: "Couldn't save that. Try again in a moment." };
    }
  }
  revalidatePath(`/r/${recipeId}`);
  for (const id of [...add, ...drop]) revalidatePath(`/r/${id}`);
  return {};
}

// ── Cook log ───────────────────────────────────────────────

export type LogResult = { error?: string };

/**
 * Logs that the signed-in cook made a recipe on `on` ("2026-10-03", their own calendar day),
 * along with anyone in `withIds` who cooked it with them: each gets their own +1, sharing one
 * comment and photo.
 */
export async function logCooked(
  recipeId: string,
  on: string,
  note = "",
  photoPath: string | null = null,
  withIds: string[] = [],
): Promise<LogResult> {
  const me = await requireMe();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(on) ? new Date(`${on}T00:00:00Z`) : null;
  // A day ahead of UTC is still today somewhere east of here.
  if (!day || Number.isNaN(day.getTime()) || day.getTime() > Date.now() + 86_400_000 || on < "2000-01-01") {
    return { error: "Pick a day that's already happened." };
  }
  const text = note.trim().slice(0, 280);
  // Only a photo this cook uploaded (their folder in the bucket).
  const photo = photoPath && (DEMO || photoPath.startsWith(`${me.id}/`)) ? photoPath : null;
  const members = new Set((await listCooks()).map((c) => c.id));
  const cooks = [me.id, ...new Set(withIds.filter((id) => id !== me.id && members.has(id)))].slice(0, 12);
  const groupId = cooks.length > 1 ? crypto.randomUUID() : null;
  if (DEMO) {
    demo.logCooked(recipeId, on, text, photo, cooks, groupId);
  } else {
    const sb = await supabaseServer();
    const { error } = await sb.from("cooked").insert(
      cooks.map((cookId) => ({ recipe_id: recipeId, cook_id: cookId, cooked_on: on, note: text, photo_path: photo, group_id: groupId })),
    );
    if (error) return { error: "Couldn't log that. Try again in a moment." };
  }
  revalidatePath(`/r/${recipeId}`);
  revalidatePath("/me");
  for (const id of cooks) revalidatePath(`/u/${id}`);
  return {};
}

/** Removes a cook: the whole shared cook if you logged it, or just yourself from someone else's. */
export async function unlogCooked(id: string, recipeId: string): Promise<LogResult> {
  const me = await requireMe();
  if (DEMO) {
    demo.unlogCooked(id);
  } else {
    const sb = await supabaseServer();
    const { data: row } = await sb.from("cooked").select("group_id, logged_by, photo_path").eq("id", id).maybeSingle();
    if (!row) return { error: "Couldn't remove that." };
    let q = sb.from("cooked").delete();
    // RLS only lets people remove their own rows and the ones they logged.
    q = row.group_id && row.logged_by === me.id ? q.eq("group_id", row.group_id) : q.eq("id", id);
    const { error } = await q;
    if (error) return { error: "Couldn't remove that." };
    if (row.photo_path) {
      const { count } = await sb.from("cooked").select("id", { count: "exact", head: true }).eq("photo_path", row.photo_path);
      if (!count) await sb.storage.from("photos").remove([row.photo_path]);
    }
  }
  revalidatePath(`/r/${recipeId}`);
  revalidatePath("/me");
  return {};
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
