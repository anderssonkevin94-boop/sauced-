import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PUBLIC = ["/login", "/offline", "/auth/callback", "/privacy"];

// Keeps the Supabase session fresh and sends signed-out visitors to /login.
export async function proxy(request: NextRequest) {
  if (!URL_ || !KEY) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(URL_, KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getClaims() refreshes an expired session (writing the new cookies above) and then verifies
  // the access token locally against the project's public signing keys, which supabase-js
  // caches in memory for 10 minutes. No call to Supabase Auth on every page and prefetch,
  // unlike getUser(). Projects still on a legacy shared-secret JWT key fall back to a network check.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims.sub);

  const path = request.nextUrl.pathname;
  if (!signedIn && !PUBLIC.includes(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|sw.js|manifest.webmanifest|icons/|favicon.ico|apple-touch-icon.png).*)"],
};
