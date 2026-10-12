// Appearance: "light" or "dark" chosen on the You tab, or the phone's own setting ("system").
// Kept on the device and put on <html data-theme> before the page paints (THEME_SCRIPT), so
// the CSS in globals.css picks the colours.

export type Theme = "system" | "light" | "dark";
export const THEME_KEY = "sauced:theme";
const COLORS = { light: "#faf8f4", dark: "#151412" };

/** Runs in <head> before anything paints; also keeps the browser's bar colour in step. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;document.addEventListener("DOMContentLoaded",function(){document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute("content",t==="dark"?"${COLORS.dark}":"${COLORS.light}")})})}}catch(e){}})();`;

export function readTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(t: Theme) {
  try {
    if (t === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, t);
  } catch {}
  const root = document.documentElement;
  if (t === "system") delete root.dataset.theme;
  else root.dataset.theme = t;
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    const media = m.getAttribute("media");
    m.setAttribute("content", t === "system" ? (media?.includes("dark") ? COLORS.dark : COLORS.light) : dark ? COLORS.dark : COLORS.light);
  });
}
