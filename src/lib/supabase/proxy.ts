import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { readEnv } from "@/lib/env";

const PUBLIC_PATHS = ["/", "/login", "/signup", "/auth", "/setup", "/r", "/suspended"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || (p !== "/" && pathname.startsWith(`${p}/`)));
}

/**
 * Content-Security-Policy with a fresh nonce per request: only scripts that
 * Next.js (or our layout) tag with this nonce can run, so injected <script>
 * tags are inert. Inline style attributes stay allowed (React uses them;
 * they cannot execute code).
 */
function buildCsp(nonce: string) {
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/**
 * Refreshes the auth cookie on every request and bounces signed-out users
 * away from app pages. This is only an optimistic check: pages and actions
 * verify the user again, and RLS is the real boundary.
 */
export async function updateSession(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);
  // Next.js reads the nonce from the request's CSP header while rendering.
  const next = () => {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("content-security-policy", csp);
    const res = NextResponse.next({ request: { headers } });
    res.headers.set("content-security-policy", csp);
    return res;
  };

  const env = readEnv();
  if (!env) {
    if (request.nextUrl.pathname === "/setup") return next();
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  let response = next();
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = next();
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // The database rejected this session (see bounceIfSessionRejected): drop
  // the local cookies so the login page shows instead of looping back.
  if (request.nextUrl.pathname === "/login" && request.nextUrl.searchParams.get("error") === "session") {
    await supabase.auth.signOut({ scope: "local" });
    return response;
  }

  // getClaims() verifies the JWT; never trust getSession() on the server.
  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims?.sub;
  const { pathname, search } = request.nextUrl;

  if (!signedIn && !isPublic(pathname)) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  if (signedIn && (pathname === "/login" || pathname === "/signup")) {
    return NextResponse.redirect(new URL("/app", request.url));
  }

  // Accounts with two-factor login must pass the code step before anything else.
  // Read from the session cookie; no network call.
  if (signedIn && pathname !== "/login/verify" && !pathname.startsWith("/auth/")) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      const url = new URL("/login/verify", request.url);
      url.searchParams.set("next", pathname + search);
      return NextResponse.redirect(url);
    }
  }
  return response;
}
