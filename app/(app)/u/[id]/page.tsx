import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/bits";
import { Back } from "@/components/icons";
import { ProfileBody } from "@/components/ProfileBody";
import { getProfile, listKitchenLog, listRecipes, requireMe } from "@/lib/data";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await getProfile((await params).id);
  return { title: p?.name ?? "Cook" };
}

/** A member's page: what they've posted and cooked, and their numbers. */
export default async function ProfilePage({ params }: Props) {
  const { id } = await params;
  const [me, profile, recipes, log] = await Promise.all([requireMe(), getProfile(id), listRecipes(), listKitchenLog()]);
  if (!profile) notFound();
  const isMe = profile.id === me.id;
  const posted = recipes.filter((r) => r.author.id === profile.id);
  const since = new Date(profile.since).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <main className="page">
      <div className="topbar">
        <Link href="/me" className="icon-btn back" aria-label="Back">
          <Back />
        </Link>
        {isMe && (
          <Link href="/me" className="text-btn">
            Settings
          </Link>
        )}
      </div>

      <header className="profile-head">
        <Avatar name={profile.name} id={profile.id} large />
        <div>
          <h1 className="display">{isMe ? `${profile.name} (you)` : profile.name}</h1>
          <p className="muted">In the kitchen since {since}</p>
        </div>
      </header>

      <ProfileBody
        cookId={profile.id}
        name={profile.name}
        isMe={isMe}
        log={log}
        posted={posted.map((r) => ({ id: r.id, title: r.title, kind: r.kind, photoUrl: r.photoUrl, updatedAt: r.updatedAt }))}
      />
    </main>
  );
}
