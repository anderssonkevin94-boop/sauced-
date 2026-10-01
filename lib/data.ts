import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { DEMO, photoUrl } from "@/lib/config";
import { demo, demoMe } from "@/lib/demo";
import { supabaseServer } from "@/lib/supabase/server";
import type { Cook, Recipe } from "@/lib/types";

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
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** The signed-in member. Sends people to log in or join the kitchen when needed. */
export async function requireMe(): Promise<Cook> {
  await connection();
  if (DEMO) return demoMe;
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await sb.from("profiles").select("id, display_name").eq("id", user.id).maybeSingle();
  if (!data) redirect("/join");
  return { id: data.id, name: data.display_name };
}

export async function listRecipes(): Promise<Recipe[]> {
  if (DEMO) return demo.list();
  const sb = await supabaseServer();
  const { data, error } = await sb.from("recipes").select(SELECT).order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as RecipeRow[]).map(toRecipe);
}

export async function getRecipe(id: string): Promise<Recipe | null> {
  if (DEMO) return demo.get(id);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sb = await supabaseServer();
  const { data } = await sb.from("recipes").select(SELECT).eq("id", id).maybeSingle();
  return data ? toRecipe(data as RecipeRow) : null;
}

export async function listCooks(): Promise<Cook[]> {
  if (DEMO) return demo.cooks();
  const sb = await supabaseServer();
  const { data } = await sb.from("profiles").select("id, display_name").order("created_at");
  return (data ?? []).map((p) => ({ id: p.id, name: p.display_name }));
}
