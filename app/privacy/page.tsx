import Link from "next/link";

export const metadata = { title: "Privacy" };

// Public (see proxy.ts): Google asks for a privacy policy link before "Sign in with Google" can go live.
export default function Privacy() {
  return (
    <main className="page" style={{ maxWidth: 560 }}>
      <h1 className="display" style={{ margin: "24px 0 16px" }}>Privacy</h1>
      <div className="notes" style={{ borderLeft: 0, padding: 0, display: "grid", gap: 14 }}>
        <p>Sauced is a private recipe box for a small group of friends. There are no ads and no tracking.</p>
        <p>
          <b>What we store:</b> your email address (from Google or an email code), the name you choose, and the recipes
          and photos you add. Everyone in the kitchen can see the recipes; only you can edit or delete yours.
        </p>
        <p>
          <b>Google sign-in:</b> we only ask Google for your name and email address, and use them only to sign you in.
          We never see your Google password and don&rsquo;t access anything else in your account.
        </p>
        <p>
          <b>Where it lives:</b> the data is stored with Supabase (in the EU) and the site runs on Vercel. Your
          shopping list and drafts stay on your own device.
        </p>
        <p>
          <b>Leaving:</b> ask the person who runs your kitchen and your account and everything in it will be deleted.
        </p>
      </div>
      <p style={{ marginTop: 28 }}>
        <Link href="/" style={{ color: "var(--accent)", fontWeight: 600 }}>Back to Sauced</Link>
      </p>
    </main>
  );
}
