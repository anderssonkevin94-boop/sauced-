"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { DEMO } from "@/lib/config";
import { listCooks, requireMe } from "@/lib/data";
import { demo } from "@/lib/demo";
import { toLines } from "@/lib/parse";
import { sendPushes } from "@/lib/push";
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
  after(sendPushes);
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
  after(sendPushes);
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

/** A rating as stored: 0.0–5.0 Edwards to one decimal, or null. */
const toRating = (r: number | null | undefined) =>
  typeof r === "number" && Number.isFinite(r) ? Math.round(Math.min(5, Math.max(0, r)) * 10) / 10 : null;

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
  rating: number | null = null,
): Promise<LogResult> {
  const me = await requireMe();
  const stars = toRating(rating);
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
    demo.logCooked(recipeId, on, text, photo, cooks, groupId, stars);
  } else {
    const sb = await supabaseServer();
    const { error } = await sb.from("cooked").insert(
      cooks.map((cookId) => ({ recipe_id: recipeId, cook_id: cookId, cooked_on: on, note: text, photo_path: photo, group_id: groupId, rating: stars })),
    );
    if (error) return { error: "Couldn't log that. Try again in a moment." };
  }
  after(sendPushes);
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

/**
 * Edits a cook you logged: the day, comment and photo for everyone on it, and who cooked
 * (people added get their own +1 and a notification; people taken off lose theirs).
 */
export async function updateCooked(
  id: string,
  recipeId: string,
  on: string,
  note: string,
  photoPath: string | null,
  withIds: string[],
  rating: number | null = null,
): Promise<LogResult> {
  const me = await requireMe();
  const stars = toRating(rating);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(on) ? new Date(`${on}T00:00:00Z`) : null;
  if (!day || Number.isNaN(day.getTime()) || day.getTime() > Date.now() + 86_400_000 || on < "2000-01-01") {
    return { error: "Pick a day that's already happened." };
  }
  const text = note.trim().slice(0, 280);
  const members = new Set((await listCooks()).map((c) => c.id));
  const want = [me.id, ...new Set(withIds.filter((x) => x !== me.id && members.has(x)))].slice(0, 12);

  if (DEMO) {
    const err = demo.updateCooked(id, me.id, on, text, photoPath, want, stars);
    if (err) return { error: err };
  } else {
    const sb = await supabaseServer();
    const { data: row } = await sb.from("cooked").select("id, group_id, logged_by, photo_path, cook_id").eq("id", id).maybeSingle();
    if (!row || row.logged_by !== me.id) return { error: "Only the person who logged this can edit it." };
    // Keep an old photo only if it's this one's; a new one must be from your own folder.
    const photo = photoPath === row.photo_path || (photoPath && photoPath.startsWith(`${me.id}/`)) ? photoPath : null;
    const groupId = row.group_id ?? (want.length > 1 ? crypto.randomUUID() : null);
    const sameCook = row.group_id ? sb.from("cooked").select("id, cook_id").eq("group_id", row.group_id) : null;
    const rows = sameCook ? ((await sameCook).data ?? []) : [{ id: row.id, cook_id: row.cook_id }];
    const ids = rows.map((r) => r.id);

    const { error: upErr } = await sb
      .from("cooked")
      .update({ cooked_on: on, note: text, photo_path: photo, group_id: groupId, rating: stars })
      .in("id", ids);
    if (upErr) return { error: "Couldn't save that. Try again in a moment." };

    const have = rows.map((r) => r.cook_id);
    const add = want.filter((c) => !have.includes(c));
    const drop = rows.filter((r) => !want.includes(r.cook_id));
    if (add.length) {
      const { error } = await sb.from("cooked").insert(
        add.map((cookId) => ({ recipe_id: recipeId, cook_id: cookId, cooked_on: on, note: text, photo_path: photo, group_id: groupId, rating: stars })),
      );
      if (error) return { error: "Couldn't add everyone. Try again in a moment." };
    }
    if (drop.length) await sb.from("cooked").delete().in("id", drop.map((r) => r.id));
    if (row.photo_path && row.photo_path !== photo) {
      const { count } = await sb.from("cooked").select("id", { count: "exact", head: true }).eq("photo_path", row.photo_path);
      if (!count) await sb.storage.from("photos").remove([row.photo_path]);
    }
  }
  after(sendPushes);
  revalidatePath(`/r/${recipeId}`);
  revalidatePath("/me");
  return {};
}

// ── Notifications ──────────────────────────────────────────

/** Unread notifications, for the badge. 0 when they aren't set up. */
export async function unreadNotices(): Promise<number> {
  const me = await requireMe();
  if (DEMO) return demo.notices(me.id).filter((n) => !n.read).length;
  const sb = await supabaseServer();
  const { count } = await sb.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  return count ?? 0;
}

export async function markNoticesRead(): Promise<void> {
  const me = await requireMe();
  if (DEMO) return demo.readNotices(me.id);
  const sb = await supabaseServer();
  await sb.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
}

// ── Push notifications ─────────────────────────────────────

/** This phone wants push notifications: keep its subscription. */
export async function savePush(sub: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<{ error?: string }> {
  await requireMe();
  if (DEMO) return {};
  if (!/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) return { error: "That didn't work on this phone." };
  const sb = await supabaseServer();
  // Same phone again (or after someone else used it): it's yours now.
  await sb.rpc("forget_push", { endpoints: [sub.endpoint] });
  const { error } = await sb.from("push_subscriptions").insert({ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth });
  return error ? { error: "Couldn't turn notifications on. Try again." } : {};
}

export async function removePush(endpoint: string): Promise<void> {
  await requireMe();
  if (DEMO) return;
  const sb = await supabaseServer();
  await sb.from("push_subscriptions").delete().eq("endpoint", endpoint);
}

// ── Replies ────────────────────────────────────────────────

export async function addReply(recipeId: string, cookedId: string, body: string): Promise<{ error?: string }> {
  await requireMe();
  const text = body.trim().slice(0, 500);
  if (!text) return { error: "Write something first." };
  if (DEMO) {
    demo.addReply(recipeId, cookedId, text);
  } else {
    const sb = await supabaseServer();
    const { error } = await sb.from("cook_replies").insert({ recipe_id: recipeId, cooked_id: cookedId, body: text });
    if (error) return { error: "Couldn't post that. Try again in a moment." };
  }
  after(sendPushes);
  revalidatePath(`/r/${recipeId}`);
  return {};
}

export async function deleteReply(id: string, recipeId: string): Promise<{ error?: string }> {
  await requireMe();
  if (DEMO) {
    demo.deleteReply(id);
  } else {
    const sb = await supabaseServer();
    // RLS: only the person who wrote it.
    const { error } = await sb.from("cook_replies").delete().eq("id", id);
    if (error) return { error: "Couldn't remove that." };
  }
  revalidatePath(`/r/${recipeId}`);
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
