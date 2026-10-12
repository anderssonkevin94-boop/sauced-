"use client";
import { useEffect, useState } from "react";
import "@/app/styles/list.css";
import { applyTheme, readTheme, type Theme } from "@/lib/theme";

const OPTIONS: { id: Theme; label: string }[] = [
  { id: "system", label: "Phone" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

/** Appearance: follow the phone, or always light, or always dark, on this device. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => setTheme(readTheme()), []);
  if (!theme) return null;
  return (
    <div className="push-card theme-card">
      <p>
        <b>Appearance</b>
      </p>
      <div className="shop-scale" role="radiogroup" aria-label="Appearance">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={theme === o.id}
            aria-pressed={theme === o.id}
            onClick={() => {
              applyTheme(o.id);
              setTheme(o.id);
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
