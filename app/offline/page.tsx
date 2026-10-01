export const metadata = { title: "Offline" };

export default function Offline() {
  return (
    <main className="auth" style={{ textAlign: "center" }}>
      <p className="display">You&rsquo;re offline</p>
      <p className="lede" style={{ marginBottom: 0 }}>
        Recipes you&rsquo;ve opened before still work. This one will be here when you&rsquo;re back online.
      </p>
    </main>
  );
}
