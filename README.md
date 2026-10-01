# Sauced

A shared recipe box for a group of friends: the things you invent at 1am and the dishes you swear by.
Next.js (App Router) on Vercel, Supabase for login, database and photos. Installable on iPhone as a home-screen app.

## Try it locally

```bash
npm install
npm run dev
```

With no Supabase keys it runs in **demo mode**: sample recipes, no login, nothing saved after a restart.

## Set up for real (about 10 minutes)

### 1. Supabase (free tier is plenty)
1. Create a project at supabase.com.
2. **SQL editor → New query**: paste `supabase/schema.sql`, run it.
3. Set your kitchen code (friends type it once when they first sign in):
   `update public.kitchen_settings set invite_code = 'something-only-you-know';`
4. **Authentication → Emails → Magic Link template**: make the body show the code, e.g.
   `<p>Your Sauced code: <strong>{{ .Token }}</strong></p>`.
   (The app signs in with a typed code, not a link: on iPhone a link opens Safari instead of the home-screen app.)
5. **Authentication → URL Configuration**: set Site URL to your Vercel URL.
6. **Project Settings → API**: copy the Project URL and the `anon` public key.

Supabase's built-in email sender only allows a few emails an hour. That's fine for a handful of friends signing in once;
if it starts to bite, add a free SMTP provider (e.g. Resend) under Authentication → Emails → SMTP.

### 2. Vercel
1. Import this repo at vercel.com/new (framework is detected automatically).
2. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Deploy.

### 3. On each iPhone
Open the site in Safari → Share → **Add to Home Screen** → open Sauced from the icon, sign in with your email code,
enter your name and the kitchen code.

## How it fits together

| Path | What |
| --- | --- |
| `app/(app)/page.tsx` | The kitchen: everyone's recipes, search, filters |
| `app/(app)/new`, `r/[id]`, `r/[id]/edit` | Capture, view (tap ingredients off, keep screen on), edit |
| `app/(app)/me` | Your name, the friend list, install help |
| `lib/actions.ts` | Server actions for every write |
| `lib/data.ts` | Reads (Supabase, or `lib/demo.ts` in demo mode) |
| `supabase/schema.sql` | Tables, row-level security, photo bucket, kitchen code |
| `public/sw.js` | Offline: pages you've opened and their photos keep working |
| `scripts/make-icons.mjs` | Regenerates the app icons (`npm run icons`) |

Everyone in the kitchen can read every recipe; only the author can edit or delete theirs.
The kitchen code can't be read through the API, so a stranger with the URL can sign in but sees nothing.
Drafts autosave on the device, so a half-written recipe survives closing the app.
