import type { Metadata } from "next";
import { Bell } from "@/components/Notices";
import { PostFeed } from "@/components/PostFeed";
import { TabBar } from "@/components/TabBar";
import { listPosts, requireMe } from "@/lib/data";

export const metadata: Metadata = { title: "Feed" };

export default async function FeedPage() {
  const [me, posts] = await Promise.all([requireMe(), listPosts()]);
  return (
    <>
      <main className="page with-tabs">
        <header className="feed-head">
          <h1 className="display" style={{ fontSize: 30 }}>
            Feed
          </h1>
          <Bell />
        </header>
        <PostFeed posts={posts ?? []} me={me} />
      </main>
      <TabBar />
    </>
  );
}
