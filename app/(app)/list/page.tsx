import type { Metadata } from "next";
import { ShoppingList } from "@/components/ShoppingList";
import { TabBar } from "@/components/TabBar";
import { listRecipes, requireMe } from "@/lib/data";

export const metadata: Metadata = { title: "Shopping list" };

export default async function List() {
  const [, recipes] = await Promise.all([requireMe(), listRecipes()]);
  // Only what the list needs: the whole page is kept for offline use, so keep it light.
  const slim = recipes.map(({ id, title, ingredients, serves, photoUrl }) => ({ id, title, ingredients, serves, photoUrl }));
  return (
    <>
      <main className="page with-tabs">
        <ShoppingList recipes={slim} />
      </main>
      <TabBar />
    </>
  );
}
