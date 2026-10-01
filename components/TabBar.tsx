"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Person, Plus, Pot } from "@/components/icons";

export function TabBar() {
  const path = usePathname();
  return (
    <div className="tabbar">
      <nav aria-label="Main">
        <Link href="/" className="tab" aria-current={path === "/" ? "page" : undefined}>
          <Pot />
          Kitchen
        </Link>
        <Link href="/new" className="tab-add" aria-label="New recipe">
          <Plus size={26} strokeWidth={2.2} />
        </Link>
        <Link href="/me" className="tab" aria-current={path === "/me" ? "page" : undefined}>
          <Person />
          You
        </Link>
      </nav>
    </div>
  );
}
