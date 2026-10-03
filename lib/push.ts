import "server-only";
import webpush from "web-push";
import { DEMO } from "@/lib/config";
import { PUSH_PUBLIC_KEY } from "@/lib/push-key";
import { supabaseServer } from "@/lib/supabase/server";

// Sends the push notifications for whatever the signed-in member just did. The database
// writes the notifications (triggers); claim_pushes() hands each one, once, to the person
// who caused it, with the devices to send it to. Without VAPID_PRIVATE_KEY this does nothing.

type Claimed = {
  endpoint: string;
  p256dh: string;
  auth: string;
  kind: "cooked_with" | "reply" | "new_recipe" | "cooked_yours";
  actor: string | null;
  recipe_id: string | null;
  recipe_title: string | null;
  body: string;
};

const quote = (s: string) => (s.trim() ? ` · “${s.trim()}”` : "");

function message(n: Claimed): { title: string; body: string; url: string } {
  const who = n.actor ?? "Someone";
  const recipe = n.recipe_title ?? "a recipe";
  const url = n.recipe_id ? `/r/${n.recipe_id}${n.kind === "new_recipe" ? "" : "#cooked"}` : "/notifications";
  switch (n.kind) {
    case "cooked_with":
      return { title: `${who} logged you cooking`, body: `${recipe}${quote(n.body)}`, url };
    case "reply":
      return { title: `${who} replied`, body: `On ${recipe}${quote(n.body)}`, url };
    case "new_recipe":
      return { title: "New in the kitchen", body: `${who} added ${recipe}`, url };
    case "cooked_yours":
      return { title: `${who} cooked your recipe`, body: `${recipe}${quote(n.body)}`, url };
  }
}

export async function sendPushes(): Promise<void> {
  const key = process.env.VAPID_PRIVATE_KEY?.trim();
  if (DEMO || !key) return;
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("claim_pushes");
  if (error || !data?.length) return;

  const gone: string[] = [];
  await Promise.all(
    (data as Claimed[]).map(async (n) => {
      try {
        await webpush.sendNotification(
          { endpoint: n.endpoint, keys: { p256dh: n.p256dh, auth: n.auth } },
          JSON.stringify(message(n)),
          {
            vapidDetails: { subject: "https://sauced-sigma.vercel.app", publicKey: PUSH_PUBLIC_KEY, privateKey: key },
            TTL: 24 * 3600,
            urgency: "normal",
          },
        );
      } catch (e) {
        // The phone turned notifications off or the app was removed: forget that device.
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(n.endpoint);
      }
    }),
  );
  if (gone.length) await sb.rpc("forget_push", { endpoints: gone });
}
