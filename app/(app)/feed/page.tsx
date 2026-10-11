import type { Metadata } from "next";
import { Bell } from "@/components/Notices";
import { PostFeed } from "@/components/PostFeed";
import { PostPicker } from "@/components/PostPicker";
import { TabBar } from "@/components/TabBar";
import { listPosts, listRecipes, requireMe } from "@/lib/data";

export const metadata: Metadata = { title: "Feed" };

export default async function FeedPage() {
  const [me, posts, recipes] = await Promise.all([requireMe(), listPosts(), listRecipes()]);
  const mine = recipes.filter((r) => r.author.id === me.id && !r.draft).map(({ id, title, photoUrl }) => ({ id, title, photoUrl }));
  return (
    <>
      <main className="page with-tabs">
        <header className="feed-head">
          <h1 className="display" style={{ fontSize: 30 }}>
            Feed
          </h1>
          <span className="feed-head-end">
            <PostPicker recipes={mine} />
            <Bell />
          </span>
        </header>
        <PostFeed posts={posts ?? []} me={me} />
      </main>
      <TabBar />
    </>
  );
}
