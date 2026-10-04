# Sauced: notes for Claude

Kevin and Rasmus both build Sauced, each with their own Claude, often at the same time. This file is
the shared memory between those sessions: keep it true, short, and free of secrets (the repo is public).

## Working together

- **Start of every session:** `git pull --rebase`, then `git log --oneline -15` to see what the other
  person changed since you last worked. Read the commit messages; they say why.
- **Push small and often, straight to `main`.** Vercel deploys every push to main within a minute, so
  nothing is "done" until it's pushed. Before pushing: `npx tsc --noEmit` and `npm run build` pass.
  If the push is rejected, `git pull --rebase`, fix any conflict, build again, push.
- **Commit messages explain the change for the other person:** a one-line summary, then bullets on
  what changed and why. They are how the other Claude finds out what happened.
- **Database changes** (new columns, policies, functions) are run by hand in the Supabase SQL editor,
  then mirrored into `supabase/schema.sql` (or `supabase/share.sql`) in the same commit. Run the SQL
  *before* pushing code that needs it. Only someone with access to the Supabase project can run it;
  otherwise ask them.
- **Update this file** when something here stops being true, or when you learn something the other
  Claude needs (a rule from Kevin or Rasmus, a gotcha). Keep it to what isn't obvious from the code.
- Kevin and Rasmus test on their phones on the live site. Keep replies short: a few numbered steps.

## The app

Shared recipe box for a group of friends. Next.js (App Router) on Vercel, Supabase (auth, Postgres,
the `photos` bucket), installable as an iPhone home-screen app. Live at https://sauced-sigma.vercel.app.
`GET /api/version` shows the deployed commit (`?check=claude` also checks the Anthropic key).
Without Supabase keys it runs in demo mode (sample data, no login): `.claude/launch.json` has a
`sauced-demo` config (`npm run build` first, then `preview_start`).

Recipes are stored as plain lines. A line ending in `:` is a part ("Surkål:"). A step carries its
extras as tags at the end of the line, in `lib/step.ts`: `[Pot medium]`, `[Oven 175°C · 18 min]`,
`[time ~3 min]`, `[tip …]`, `[uses 2 msk smör; 1 gul lök, tunt skivad]`, `[photo path]`.

Importing: `lib/link-recipe.ts` reads a page (schema.org JSON-LD, else page text) and
`structurePass()` sends it through Claude (`lib/tidy-core.ts` with the rules in
`lib/recipe-structure.ts`). Every Claude call is logged to `ai_usage` (`lib/ai-usage.ts`). The iPhone
"Save to Sauced" shortcut posts to `app/api/share/route.ts` with no session (an import key instead).

## Kevin's rules for recipe steps (non-negotiable)

Every step card must stand on its own while cooking:

1. A step lists every ingredient it adds, with the amount for that step. Never the same ingredient
   twice on one step; parts never mix (the soup's onion is not the surkål's onion).
2. Each step says where things go ("i kastrullen") and carries its appliance tag even with no heat change.
3. What's already in the pot isn't listed again. The step text names every ingredient on its card.
4. Steps say how things are cut (from the ingredient line or the method).
5. Nothing from the source is dropped. Where the source is silent (when an ingredient goes in, an
   amount, a cut, something the method uses but the list forgot), Claude makes a sensible cook's
   choice, says so in the step's tip ("…är en gissning"), and lists it under "Check these". It never
   adds anything else: no water, no changed amounts.
6. A recipe in parts gets a "Part 2 of 2" card in cook mode, and can be cooked with its parts at once.
7. A re-import keeps the cook's own edits (`recipes.imported` snapshot; edits are sent labelled by part).
8. Notes never say how a recipe reached the app ("screenshot", "shared text"), only a real source.

Test changes to importing against a two-part recipe (the vinsmart svampsoppa with surkål) and a
plain one (Camilla's havrekakor).

## Gotchas

- Supabase uses ES256 keys, so `getClaims()` verifies locally. Vercel functions are pinned to `dub1`
  next to Supabase eu-west-1.
- Adding a second foreign key from a table to `profiles` makes PostgREST embeds ambiguous: name the FK
  in the query (`profiles!cooked_cook_id_fkey`) and ship that right after the migration.
- Storage policies let people insert, update and delete only their own folder (`<user id>/…`).
  Photos are compressed on the server with sharp (`lib/cover-photo.ts`); the browser shrinks first
  because the server can't read HEIC.
- Env var changes on Vercel need a redeploy (an empty commit works).
- The local npm cache has root-owned files: `npm install --cache <some temp dir>` if it complains.
