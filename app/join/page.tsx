import { JoinForm } from "@/components/AccountForms";

export const metadata = { title: "Join" };

export default function Join() {
  return (
    <main className="auth">
      <h1 className="wordmark">
        Sauced<i>.</i>
      </h1>
      <p className="lede">One last thing. Ask a friend for the kitchen code.</p>
      <JoinForm />
    </main>
  );
}
