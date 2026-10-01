export const APP_NAME = "Sauced";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Without Supabase keys the app runs on in-memory sample data with no login. */
export const DEMO = !SUPABASE_URL || !SUPABASE_ANON_KEY;

export function photoUrl(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("data:") || path.startsWith("/")) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/photos/${path}`;
}
