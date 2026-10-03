// The contract between the "Save to Sauced" Apple Shortcut and POST /api/share.
// The Shortcut is built by scripts/build-shortcut.py; the route is app/api/share/route.ts.
//
// Request
//   POST https://sauced-sigma.vercel.app/api/share
//   Authorization: Bearer <the cook's import key, "sauced_…">
//   Content-Type: application/json
//   Body: ShareRequest — at least one of url / text.
//     - A shared link (TikTok, YouTube, a recipe site): { url }
//     - A screenshot: the Shortcut runs Apple's on-device "Extract Text from Image" and sends { text }
//     - Shared text (a copied caption): { text }
//     A shared web page may come with both; the server tries the url first, then the text.
//
// Response (always JSON, always HTTP 200 unless the request is malformed, so the Shortcut
// can simply show `message` in a notification):
//   ShareResponse

export type ShareRequest = {
  url?: string;
  text?: string;
};

export type ShareResponse =
  | { ok: true; message: string; title: string; recipeUrl: string } // message e.g. "Saved to Sauced: Kanelbullar"
  | { ok: false; message: string }; // message e.g. "Instagram doesn't let apps read posts. Share a screenshot of the caption instead."

export const SHARE_PATH = "/api/share";
export const SHORTCUT_PATH = "/save-to-sauced.shortcut";
/** iCloud link to the same Shortcut. iPhone opens these straight in the Shortcuts app;
 *  a downloaded .shortcut file from a website just gets lost. Re-share from Shortcuts on the Mac after rebuilding. */
export const SHORTCUT_ICLOUD_URL = "https://www.icloud.com/shortcuts/36120195a29b4f81bdb155cb7ba921aa";
export const IMPORT_KEY_PREFIX = "sauced_";
