"use client";
import { useEffect, useState } from "react";
import { Share } from "@/components/icons";

export function InstallCard() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    setShow(!standalone);
  }, []);
  if (!show) return null;
  return (
    <section className="card install section">
      <p className="label">Put it on your home screen</p>
      <ol>
        <li>
          <span>
            Tap <Share size={16} style={{ verticalAlign: "-3px" }} /> Share in Safari
          </span>
        </li>
        <li>Choose Add to Home Screen</li>
        <li>Open Sauced from the new icon</li>
      </ol>
    </section>
  );
}
