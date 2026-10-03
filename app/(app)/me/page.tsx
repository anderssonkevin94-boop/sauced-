import type { Metadata } from "next";
import Link from "next/link";
import { RenameForm, SignOutButton } from "@/components/AccountForms";
import { Avatar } from "@/components/bits";
import { CookHistory } from "@/components/CookHistory";
import { InstallCard } from "@/components/InstallCard";
import { ShareSetup } from "@/components/ShareSetup";
import { TabBar } from "@/components/TabBar";
import { DEMO } from "@/lib/config";
import { listCookedBy, listCooks, listRecipes, requireMe } from "@/lib/data";
import { hasImportKey } from "@/lib/share-key";

export const metadata: Metadata = { title: "You" };

export default async function Me() {
  const me = await requireMe();
  const [cooks, recipes, shareOn, cooked] = await Promise.all([listCooks(), listRecipes(), hasImportKey(), listCookedBy(me.id)]);
  const count = (id: string) => recipes.filter((r) => r.author.id === id).length;

  return (
    <>
      <main className="page with-tabs">
        <header style={{ display: "flex", alignItems: "center", gap: 16, paddingTop: 12 }}>
          <Avatar name={me.name} id={me.id} large />
          <div>
            <h1 className="display" style={{ fontSize: 28 }}>{me.name}</h1>
            <p className="muted" style={{ fontSize: 15 }}>
              {count(me.id)} {count(me.id) === 1 ? "recipe" : "recipes"} in the kitchen
            </p>
          </div>
        </header>

        <RenameForm name={me.name} />

        {cooked && <CookHistory entries={cooked} />}

        <section className="section">
          <div className="section-head">
            <h2 className="eyebrow">The kitchen</h2>
            <span className="eyebrow">{cooks.length} cooks</span>
          </div>
          <ul className="people">
            {cooks.map((c) => (
              <li key={c.id}>
                <Link href={`/?cook=${c.id}`}>
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
