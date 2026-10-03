import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { DEMO, photoUrl } from "@/lib/config";
import { demo, demoMe } from "@/lib/demo";
import { supabaseServer } from "@/lib/supabase/server";
import type { Cook, CookedEntry, CookedWithRecipe, Profile, Recipe } from "@/lib/types";

type RecipeRow = {
  id: string;
  title: string;
  kind: Recipe["kind"];
  ingredients: string[];
  steps: string[];
  notes: string;
  serves: string | null;
  time: string | null;
  photo_path: string | null;
  based_on?: string | null;
  created_at: string;
  updated_at: string;
  author: { id: string; display_name: string } | null;
};

const SELECT = "*, author:profiles(id, display_name)";

function toRecipe(r: RecipeRow): Recipe {
  return {
    id: r.id,
    author: { id: r.author?.id ?? "", name: r.author?.display_name ?? "Someone" },
    title: r.title,
    kind: r.kind,
    ingredients: r.ingredients ?? [],
    steps: r.steps ?? [],
    notes: r.notes ?? "",
    serves: r.serves,
    time: r.time,
    photoPath: r.photo_path,
    photoUrl: photoUrl(r.photo_path),
    basedOn: r.based_on ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * The signed-in member. Sends people to log in or join the kitchen when needed.
 *
 * Wrapped in React `cache()` so the (app) layout and the page share one lookup per request
 * (outside a render, e.g. in server actions, it simply runs each time). `getClaims()` verifies
 * the session JWT locally against the project's cached public keys (asymmetric signing keys),
 * so the only network trip left is the profile row; with legacy shared-secret keys it falls
 * back to asking Supabase Auth, like `getUser()` did.
 */
export const requireMe = cache(async (): Promise<Cook> => {
  await connection();
  if (DEMO) return demoMe;
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getClaims();
  const userId = auth?.claims.sub;
  if (!userId) redirect("/login");
  const { data } = await sb.from("profiles").select("id, display_name").eq("id", userId).maybeSingle();
  if (!data) redirect("/join");
  return { id: data.id, name: data.display_name };
});

// The readers below are cached per request too: e.g. a recipe page's generateMetadata and
// the page itself then share one query, and it starts before the page awaits requireMe().

export const listRecipes = cache(async (): Promise<Recipe[]> => {
  if (DEMO) return demo.list();
  const sb = await supabaseServer();
  const { data, error } = await sb.from("recipes").select(SELECT).order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as RecipeRow[]).map(toRecipe);
});

export const getRecipe = cache(async (id: string): Promise<Recipe | null> => {
  if (DEMO) return demo.get(id);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sb = await supabaseServer();
  const { data } = await sb.from("recipes").select(SELECT).eq("id", id).maybeSingle();
  return data ? toRecipe(data as RecipeRow) : null;
});

export const listCooks = cache(async (): Promise<Cook[]> => {
  if (DEMO) return demo.cooks();
  const sb = await supabaseServer();
  const { data } = await sb.from("profiles").select("id, display_name").order("created_at");
  return (data ?? []).map((p) => ({ id: p.id, name: p.display_name }));
});

// ── Cook log ───────────────────────────────────────────────
// Both return null when the log can't be read (e.g. the table isn't set up yet), so the
// pages hide it rather than fail.

type CookedRow = {
  id: string;
  recipe_id: string;
  cooked_on: string;
  note: string;
  photo_path: string | null;
  cook: { id: string; display_name: string } | null;
  recipe?: { id: string; title: string; photo_path: string | null; author_id: string } | null;
};

const toEntry = (r: CookedRow): CookedEntry => ({
  id: r.id,
  recipeId: r.recipe_id,
  cook: { id: r.cook?.id ?? "", name: r.cook?.display_name ?? "Someone" },
  on: r.cooked_on,
  note: r.note ?? "",
  photoPath: r.photo_path,
  photoUrl: photoUrl(r.photo_path),
});

const COOKED = "id, recipe_id, cooked_on, note, photo_path, cook:profiles(id, display_name)";

/** Everyone's log for one recipe, newest first. */
export const getCookLog = cache(async (recipeId: string): Promise<CookedEntry[] | null> => {
  if (DEMO) return demo.cookLog(recipeId);
  const sb = await supabaseServer();
  const { data, error } = await sb
    .from("cooked")
    .select(COOKED)
    .eq("recipe_id", recipeId)
    .order("cooked_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return null;
  return (data as unknown as CookedRow[]).map(toEntry);
});

/** The whole kitchen's cook log with each recipe, newest first: histories and stats on profiles. */
export const listKitchenLog = cache(async (): Promise<CookedWithRecipe[] | null> => {
  if (DEMO) return demo.kitchenLog();
  const sb = await supabaseServer();
  const { data, error } = await sb
    .from("cooked")
    .select(`${COOKED}, recipe:recipes(id, title, photo_path, author_id)`)
    .order("cooked_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) return null;
  return (data as unknown as CookedRow[])
    .filter((r) => r.recipe)
    .map((r) => ({
      ...toEntry(r),
      recipe: { id: r.recipe!.id, title: r.recipe!.title, photoUrl: photoUrl(r.recipe!.photo_path), authorId: r.recipe!.author_id },
    }));
});

/** One member, for their profile page. */
export const getProfile = cache(async (id: string): Promise<Profile | null> => {
  if (DEMO) return demo.profile(id);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sb = await supabaseServer();
  const { data } = await sb.from("profiles").select("id, display_name, created_at").eq("id", id).maybeSingle();
  return data ? { id: data.id, name: data.display_name, since: data.created_at } : null;
});

// ── Pairings ───────────────────────────────────────────────

/** Ids of the recipes that pair well with this one (either side of the pair), or null if not set up. */
export const getPairIds = cache(async (recipeId: string): Promise<string[] | null> => {
  if (DEMO) return demo.pairs(recipeId);
  if (!/^[0-9a-f-]{36}$/i.test(recipeId)) return null;
  const sb = await supabaseServer();
  const { data, error } = await sb.from("pairings").select("a, b").or(`a.eq.${recipeId},b.eq.${recipeId}`).order("created_at");
  if (error) return null;
  return data.map((p) => (p.a === recipeId ? p.b : p.a));
});
