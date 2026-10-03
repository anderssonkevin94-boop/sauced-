"use client";
import { useEffect, useState } from "react";
import { removePush, savePush } from "@/lib/actions";
import { PUSH_PUBLIC_KEY } from "@/lib/push-key";

type State = "loading" | "unsupported" | "needs-home-screen" | "denied" | "off" | "on" | "busy";

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

function keyBytes(base64: string): Uint8Array {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** "Turn on notifications" for this phone: asks, subscribes, and saves it; or turns it off again. */
export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        // iPhones only offer push to apps added to the home screen.
        return setState(isIos() && !isStandalone() ? "needs-home-screen" : "unsupported");
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function turnOn() {
    setError("");
    setState("busy");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUSH_PUBLIC_KEY) as BufferSource }));
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const res = await savePush(json);
      if (res.error) {
        setError(res.error);
        return setState("off");
      }
      setState("on");
    } catch {
      setError("This phone wouldn't turn notifications on.");
      setState("off");
    }
  }

  async function turnOff() {
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removePush(sub.endpoint);
        await sub.unsubscribe();
      }
    } catch {}
    setState("off");
  }

  if (state === "loading" || state === "unsupported") return null;

  return (
    <div className="push-card">
      {state === "needs-home-screen" ? (
        <p>
          <b>Get notifications on this iPhone:</b> add Sauced to your home screen first (Share, then &ldquo;Add to Home Screen&rdquo;), open it from there, and
          turn them on here.
        </p>
      ) : state === "denied" ? (
        <p>
          <b>Notifications are blocked for Sauced.</b> Turn them on in your phone&rsquo;s Settings (Notifications, Sauced), then come back.
        </p>
      ) : state === "on" ? (
        <>
          <p>
            <b>Notifications are on</b> for this phone.
          </p>
          <button type="button" className="text-btn" onClick={turnOff}>
            Turn off
          </button>
        </>
      ) : (
        <>
          <p>
            <b>Get a notification</b> when someone logs you on a cook, replies, adds a recipe or cooks yours.
          </p>
          <button type="button" className="btn accent" disabled={state === "busy"} onClick={turnOn}>
            {state === "busy" ? "Turning on" : "Turn on"}
          </button>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
