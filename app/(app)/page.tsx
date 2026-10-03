import { Feed } from "@/components/Feed";
import { Bell } from "@/components/Notices";
import { TabBar } from "@/components/TabBar";
import { listCooks, listRecipes, requireMe } from "@/lib/data";

export default async function Kitchen({ searchParams }: { searchParams: Promise<{ cook?: string }> }) {
  const [me, recipes, cooks, { cook }] = await Promise.all([requireMe(), listRecipes(), listCooks(), searchParams]);
  return (
    <>
      <main className="page with-tabs">
        <header className="feed-head">
          <h1 className="wordmark">
            Sauced<i>.</i>
          </h1>
          <span className="feed-head-end">
            <span className="muted" style={{ fontSize: 15 }}>
              {recipes.length} {recipes.length === 1 ? "recipe" : "recipes"}
            </span>
            <Bell />
          </span>
        </header>
        <Feed key={cook ?? "all"} recipes={recipes} me={me} cooks={cooks} initialCook={cook} />
      </main>
      <TabBar />
    </>
  );
}
