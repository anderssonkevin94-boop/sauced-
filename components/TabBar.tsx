"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import "@/app/styles/tabbar.css";
import { Basket, Person, Plus, Pot } from "@/components/icons";
import { onListChange, readList } from "@/lib/shopping";

export function TabBar() {
  const path = usePathname();
  const count = useListCount();
  const current = (href: string) => (path === href ? "page" : undefined);
  return (
    <div className="tabbar">
      <nav aria-label="Main" className="tabs">
        <Link href="/" className="tab" aria-current={current("/")}>
          <Pot />
          Kitchen
        </Link>
        <Link
          href="/list"
          className="tab"
          aria-current={current("/list")}
          aria-label={count ? `Shopping list, ${count} ${count === 1 ? "recipe" : "recipes"}` : "Shopping list"}
        >
          <span className="tab-icon">
            <Basket />
            {count > 0 && <span className="tab-badge">{count > 9 ? "9+" : count}</span>}
          </span>
          List
        </Link>
        <Link href="/new" className="tab-add" aria-label="New recipe">
          <Plus size={26} strokeWidth={2.2} />
        </Link>
        <Link href="/me" className="tab" aria-current={current("/me")}>
          <Person />
          You
        </Link>
      </nav>
    </div>
  );
}

/** Recipes on the shopping list. Starts at 0 so server and first client render match. */
function useListCount() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const sync = () => setN(readList().recipes.length);
    sync();
    return onListChange(sync);
  }, []);
  return n;
}
