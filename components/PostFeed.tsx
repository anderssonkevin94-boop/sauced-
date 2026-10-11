"use client";
import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import "@/app/styles/feed.css";
import { Avatar, Tile } from "@/components/bits";
import { Close } from "@/components/icons";
import { addPostComment, deletePost, deletePostComment, setEdward } from "@/lib/actions";
import { edwards, timeAgo } from "@/lib/parse";
import type { Cook, Post } from "@/lib/types";

/** The kitchen's feed: cooks and recipes people chose to post, with Edwards and comments. */
export function PostFeed({ posts, me }: { posts: Post[]; me: Cook }) {
  if (!posts.length) {
    return (
      <div className="empty">
        <p className="display">Nothing on the feed yet</p>
        <p>Tap &ldquo;Post&rdquo; above to share one of your recipes, or tick &ldquo;Post to the feed&rdquo; when you log a cook.</p>
      </div>
    );
  }
  return (
    <ul className="posts">
      {posts.map((p) => (
        <PostCard key={p.id} post={p} me={me} />
      ))}
    </ul>
  );
}

function PostCard({ post: p, me }: { post: Post; me: Cook }) {
  const mine = p.author.id === me.id;
  const [given, setGiven] = useOptimistic(p.edwards.some((e) => e.id === me.id));
  const [, start] = useTransition();
  const others = p.edwards.filter((e) => e.id !== me.id);
  const count = others.length + (given ? 1 : 0);
  const photo = p.photoUrl ?? p.recipe.photoUrl;

  function toggleEdward() {
    start(async () => {
      setGiven(!given);
      await setEdward(p.id, !given);
    });
  }

  return (
    <li className="post" id={`post-${p.id}`}>
      <header className="post-head">
        <Link href={`/u/${p.author.id}`} aria-label={`${p.author.name}'s profile`}>
          <Avatar name={p.author.name} id={p.author.id} />
        </Link>
        <p>
          <b>{mine ? "You" : p.author.name}</b> {p.cookedId ? "cooked" : "shared"}{" "}
          <Link href={`/r/${p.recipe.id}`} className="name-link">
            {p.recipe.title}
          </Link>
          <span className="muted when" suppressHydrationWarning>
            {timeAgo(p.createdAt)}
          </span>
        </p>
        {mine && (
          <button
            type="button"
            className="icon-btn"
            aria-label="Remove this post"
            onClick={() => confirm("Take this off the feed? The recipe and cook log stay.") && start(() => deletePost(p.id).then(() => {}))}
          >
            <Close size={18} />
          </button>
        )}
      </header>

      <Link href={`/r/${p.recipe.id}`} className="post-photo" tabIndex={-1} aria-hidden="true">
        {photo ? <img src={photo} alt="" loading="lazy" /> : <Tile recipe={p.recipe} className="post-tile" />}
      </Link>

      {p.rating !== null && <p className="post-rating">{edwards(p.rating)}</p>}
      {p.body && <p className="post-body">{p.body}</p>}

      <div className="post-actions">
        <button type="button" className="edward-btn" aria-pressed={given} onClick={toggleEdward}>
          <Thumb />
          {given ? "Edward given" : "Give an Edward"}
        </button>
        {count > 0 && (
          <span className="muted edward-who">
            {count} {count === 1 ? "Edward" : "Edwards"} · {[...(given ? ["you"] : []), ...others.map((e) => e.name.split(" ")[0])].join(", ")}
          </span>
        )}
      </div>

      <Comments post={p} me={me} />
    </li>
  );
}

function Comments({ post: p, me }: { post: Post; me: Cook }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setError("");
    start(async () => {
      const res = await addPostComment(p.id, text);
      if (res.error) setError(res.error);
      else setText("");
    });
  }

  return (
    <div className="post-comments">
      {p.comments.length > 0 && (
        <ul>
          {p.comments.map((c) => (
            <li key={c.id}>
              <p>
                <b>{c.author.id === me.id ? "You" : c.author.name}</b> {c.body}
              </p>
              {c.author.id === me.id && (
                <button type="button" className="text-btn" onClick={() => start(() => deletePostComment(c.id).then(() => {}))}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form className="post-reply" onSubmit={send}>
        <input
          className="input"
          placeholder="Add a comment"
          aria-label={`Comment on ${p.recipe.title}`}
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
          enterKeyHint="send"
        />
        {text.trim() && (
          <button type="submit" className="text-btn primary" disabled={pending}>
            {pending ? "Posting" : "Post"}
          </button>
        )}
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/** A thumbs up: an Edward. */
function Thumb() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 10v10H4.5A1.5 1.5 0 013 18.5v-7A1.5 1.5 0 014.5 10H7zM7 10l4-7a2 2 0 012 2v4h5.2a2 2 0 012 2.3l-1.2 7A2 2 0 0117 20H7" />
    </svg>
  );
}
