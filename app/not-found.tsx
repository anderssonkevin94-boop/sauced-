import Link from "next/link";

export default function NotFound() {
  return (
    <main className="auth" style={{ textAlign: "center" }}>
      <p className="display">Not in the kitchen</p>
      <p className="lede">That recipe may have been deleted.</p>
      <Link href="/" className="btn ghost">Back to all recipes</Link>
    </main>
  );
}
