import type { Metadata } from "next";
import Link from "next/link";
import { RenameForm, SignOutButton } from "@/components/AccountForms";
import { Avatar } from "@/components/bits";
import { ProfileBody } from "@/components/ProfileBody";
import { PushToggle } from "@/components/PushToggle";
import { InstallCard } from "@/components/InstallCard";
import { ShareSetup } from "@/components/ShareSetup";
import { TabBar } from "@/components/TabBar";
import { DEMO } from "@/lib/config";
import { listCooks, listKitchenLog, listRecipes, requireMe } from "@/lib/data";
import { hasImportKey } from "@/lib/share-key";

export const metadata: Metadata = { title: "You" };

export default async function Me() {
  const me = await requireMe();
  const [cooks, recipes, shareOn, log] = await Promise.all([listCooks(), listRecipes(), hasImportKey(), listKitchenLog()]);
  const posted = recipes.filter((r) => r.author.id === me.id);
  const count = (id: string) => recipes.filter((r) => r.author.id === id).length;

  return (
    <>
      <main className="page with-tabs">
        <header style={{ display: "flex", alignItems: "center", gap: 16, paddingTop: 12 }}>
          <Avatar name={me.name} id={me.id} large />
          <div>
            <h1 className="display" style={{ fontSize: 28 }}>{me.name}</h1>
            <span style={{ display: "flex", gap: 14 }}>
              <Link href={`/u/${me.id}`} className="text-btn primary" style={{ padding: "2px 0", fontSize: 15 }}>
                See your profile
              </Link>
              <Link href="/notifications" className="text-btn primary" style={{ padding: "2px 0", fontSize: 15 }}>
                Notifications
              </Link>
            </span>
            <p className="muted" style={{ fontSize: 15 }}>
              {count(me.id)} {count(me.id) === 1 ? "recipe" : "recipes"} in the kitchen
            </p>
          </div>
        </header>

        <RenameForm name={me.name} />

        <PushToggle />

        <ProfileBody
          cookId={me.id}
          name={me.name}
          isMe
          log={log}
          posted={posted.map((r) => ({ id: r.id, title: r.title, kind: r.kind, photoUrl: r.photoUrl, updatedAt: r.updatedAt }))}
        />

        <section className="section">
          <div className="section-head">
            <h2 className="eyebrow">The kitchen</h2>
            <span className="eyebrow">{cooks.length} cooks</span>
          </div>
          <ul className="people">
            {cooks.map((c) => (
              <li key={c.id}>
                <Link href={`/u/${c.id}`}>
                  <Avatar name={c.name} id={c.id} />
                  <span className="name">{c.id === me.id ? `${c.name} (you)` : c.name}</span>
                  <span className="muted" style={{ fontSize: 15 }}>{count(c.id)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <ShareSetup connected={shareOn} />

        <InstallCard />

        {!DEMO && (
          <div className="section">
            <SignOutButton />
          </div>
        )}
      </main>
      <TabBar />
    </>
  );
}
