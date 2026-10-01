import type { Metadata } from "next";
import { Discover } from "@/components/Discover";
import { TabBar } from "@/components/TabBar";
import { requireMe } from "@/lib/data";
import { discoverAvailable } from "@/lib/discover";

export const metadata: Metadata = { title: "Discover" };

export default async function DiscoverPage() {
  await requireMe();
  const available = await discoverAvailable();
  return (
    <>
      <main className="page with-tabs">
        <header className="discover-head">
          <h1 className="display">Discover</h1>
          <p className="muted">Find a recipe anywhere, bring it home in metric.</p>
        </header>
        <Discover available={available} />
      </main>
      <TabBar />
    </>
  );
}

// With a Claude key a web search takes 20–60 s and its import 15–40 s; a pasted link reads in a few seconds.
export const maxDuration = 300; // a web search plus ranking can take a minute or more
