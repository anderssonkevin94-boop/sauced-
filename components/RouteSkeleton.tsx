"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import "@/app/styles/skeleton.css";
import { Back } from "@/components/icons";
import { TabBar } from "@/components/TabBar";

/**
 * What a page looks like while its data is on the way (used by the loading.tsx files).
 * It shows the destination's real header and the tab bar at once, with calm placeholders
 * for the rest. It goes by the URL rather than by which loading.tsx caught the wait, so it's
 * right even when a parent boundary catches it (e.g. tapping a tab before its prefetch lands).
 */
export function RouteSkeleton() {
  const path = usePathname();
  if (path === "/") return <WithTabs><Kitchen /></WithTabs>;
  if (path === "/discover") return <WithTabs><Discover /></WithTabs>;
  if (path === "/list") return <WithTabs><List /></WithTabs>;
  if (path === "/me") return <WithTabs><Me /></WithTabs>;
  if (path === "/new") return <Form heading="New recipe" cancel="/" />;
  const edit = path.match(/^\/r\/([^/]+)\/edit$/);
  if (edit) return <Form heading="Edit" cancel={`/r/${edit[1]}`} />;
  if (/^\/r\/[^/]+\/cook$/.test(path)) return <Busy className="page"><Lines n={4} /></Busy>;
  if (path.startsWith("/r/")) return <Recipe />;
  return <Busy className="page"><Lines n={4} /></Busy>;
}

function Busy({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <main className={className} aria-busy="true">
      <span className="sk-status" role="status">Loading</span>
      {children}
    </main>
  );
}

function WithTabs({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Busy className="page with-tabs">{children}</Busy>
      <TabBar />
    </>
  );
}

const Sk = ({ className = "", w, h }: { className?: string; w?: number | string; h?: number }) => (
  <span className={`sk ${className}`} style={{ width: w, height: h }} aria-hidden="true" />
);

function Rows({ n }: { n: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <div className="sk-row" key={i}>
          <Sk className="sk-tile" />
          <div className="sk-text">
            <Sk className="sk-line" w={`${70 - ((i * 13) % 30)}%`} h={16} />
            <Sk className="sk-line" w="40%" h={12} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Lines({ n }: { n: number }) {
  return (
    <div className="sk-stack" aria-hidden="true" style={{ marginTop: 24 }}>
      {Array.from({ length: n }, (_, i) => (
        <Sk key={i} className="sk-line" w={`${85 - ((i * 17) % 40)}%`} />
      ))}
    </div>
  );
}

function Kitchen() {
  return (
    <>
      <header className="feed-head">
        <h1 className="wordmark">
          Sauced<i>.</i>
        </h1>
        <Sk className="sk-line" w={72} />
      </header>
      <Sk className="sk-search" />
      <div className="sk-chips" aria-hidden="true">
        <Sk className="sk-pill" w={52} />
        <Sk className="sk-pill" w={96} />
        <Sk className="sk-pill" w={80} />
        <Sk className="sk-pill" w={88} />
      </div>
      <Sk className="sk-feature" />
      <Sk className="sk-line lg" w="62%" />
      <Rows n={3} />
    </>
  );
}

function Discover() {
  return (
    <>
      <header className="discover-head" style={{ padding: "8px 0 18px" }}>
        <h1 className="display" style={{ fontSize: 30 }}>Discover</h1>
        <p className="muted" style={{ marginTop: 4, fontSize: 15 }}>Find a recipe anywhere, bring it home in metric.</p>
      </header>
      <Sk className="sk-search" h={48} />
      <div className="sk-chips" aria-hidden="true">
        <Sk className="sk-pill" w={76} />
        <Sk className="sk-pill" w={104} />
        <Sk className="sk-pill" w={64} />
        <Sk className="sk-pill" w={90} />
      </div>
      <Sk className="sk-block" h={170} />
    </>
  );
}

function List() {
  return (
    <>
      <header className="shop-head" style={{ display: "flex", alignItems: "center", minHeight: 44, paddingTop: 8 }}>
        <h1 className="display" style={{ fontSize: 30 }}>Shopping list</h1>
      </header>
      <div className="section">
        <Sk className="sk-line" w={96} h={12} />
        <Rows n={2} />
      </div>
      <div className="section">
        <Sk className="sk-line" w={64} h={12} />
        <Lines n={5} />
      </div>
    </>
  );
}

function Me() {
  return (
    <>
      <header style={{ display: "flex", alignItems: "center", gap: 16, paddingTop: 12 }} aria-hidden="true">
        <Sk className="sk-circle" w={56} h={56} />
        <div className="sk-stack" style={{ flex: 1 }}>
          <Sk className="sk-line xl" w="55%" h={28} />
          <Sk className="sk-line" w="45%" />
        </div>
      </header>
      <Sk className="sk-block" h={48} />
      <div className="section">
        <div className="section-head">
          <h2 className="eyebrow">The kitchen</h2>
        </div>
        <div className="sk-stack" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "6px 0" }}>
              <Sk className="sk-circle" w={28} h={28} />
              <Sk className="sk-line" w={`${50 - i * 8}%`} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function Recipe() {
  return (
    <Busy className="page">
      <div className="topbar">
        <Link href="/" className="icon-btn back" aria-label="Back to the kitchen">
          <Back />
        </Link>
      </div>
      {/* No photo block: many recipes have none, and the page shouldn't jump when it lands. */}
      <div className="sk-stack" aria-hidden="true" style={{ paddingTop: 8, gap: 14 }}>
        <Sk className="sk-line" w={84} h={12} />
        <Sk className="sk-line xl" w="80%" />
        <Sk className="sk-line" w="45%" />
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <Sk className="sk-pill" w={92} h={32} />
          <Sk className="sk-pill" w={80} h={32} />
        </div>
        <Sk className="sk-block" h={52} />
      </div>
      <Lines n={6} />
    </Busy>
  );
}

function Form({ heading, cancel }: { heading: string; cancel: string }) {
  return (
    <Busy className="page">
      <div className="topbar">
        <Link href={cancel} className="text-btn">Cancel</Link>
        <span className="eyebrow">{heading}</span>
        <span className="text-btn primary" style={{ opacity: 0.4 }}>Save</span>
      </div>
      <div className="sk-stack" aria-hidden="true" style={{ marginTop: 20, gap: 18 }}>
        <Sk className="sk-block" h={48} />
        <Sk className="sk-block" h={44} />
        <Sk className="sk-block" h={160} />
        <Sk className="sk-block" h={160} />
      </div>
    </Busy>
  );
}
