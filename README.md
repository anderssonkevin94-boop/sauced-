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
4. **Authentication → Emails → SMTP Settings**: turn on custom SMTP. Supabase's built-in sender only emails
   members of your Supabase team and won't let you edit templates, so friends can't sign in without this.
   Gmail works: host `smtp.gmail.com`, port `587`, your Gmail address as username, and a Google
   [app password](https://myaccount.google.com/apppasswords) as the password.
5. **Authentication → Emails → Templates**: in both **Confirm sign up** (first sign-in) and **Magic link or OTP**
   (later sign-ins), make the body show the code, e.g. `<p>Your Sauced code: <strong>{{ .Token }}</strong></p>`.
   (The app signs in with a typed code, not a link: on iPhone a link opens Safari instead of the home-screen app.)
6. **Authentication → URL Configuration**: set Site URL to your Vercel URL.
7. **Project Settings → API Keys**: copy the Project URL and the **publishable** key (`sb_publishable_…`;
   the legacy `anon` key also works). Never use a secret or `service_role` key.

### 2. Vercel
1. Import this repo at vercel.com/new (framework is detected automatically).
2. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the publishable key)
3. Deploy.

### 3. On each iPhone
Open the site in Safari → Share → **Add to Home Screen** → open Sauced from the icon, sign in with your email code,
enter your name and the kitchen code.

### 4. Tidy up (optional)
"Tidy up" on the new/edit recipe form takes anything pasted (messy notes, a copied web recipe) and/or a photo
(a handwritten card, a cookbook page, a screenshot) and has Claude sort it into the usual format: amounts first,
one step per line, sections, timers. You check it, then save as usual.

1. Get an API key at console.anthropic.com → **API Keys** (set a monthly spend limit while you're there).
2. In Vercel add `ANTHROPIC_API_KEY` (server-only, no `NEXT_PUBLIC_` prefix) and redeploy.

Without the key (and in demo mode) the Tidy up card simply doesn't show. Only signed-in kitchen members can use it.
The code is in `lib/tidy.ts` (the prompt and format rules) and `components/TidyUp.tsx`.

## How it fits together

| Path | What |
| --- | --- |
| `app/(app)/page.tsx` | The kitchen: everyone's recipes, search, filters |
| `app/(app)/new`, `r/[id]`, `r/[id]/edit` | Capture, view (tap ingredients off, keep screen on), edit |
| `app/(app)/me` | Your name, the friend list, install help |
| `lib/actions.ts` | Server actions for every write |
| `lib/tidy.ts` | Tidy up: Claude turns a pasted recipe or photo into the app's format |
| `lib/data.ts` | Reads (Supabase, or `lib/demo.ts` in demo mode) |
| `supabase/schema.sql` | Tables, row-level security, photo bucket, kitchen code |
| `public/sw.js` | Offline: pages you've opened and their photos keep working |
| `scripts/make-icons.mjs` | Regenerates the app icons (`npm run icons`) |

Everyone in the kitchen can read every recipe; only the author can edit or delete theirs.
The kitchen code can't be read through the API, so a stranger with the URL can sign in but sees nothing.
Drafts autosave on the device, so a half-written recipe survives closing the app.
