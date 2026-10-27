import path from "node:path";
import type { NextConfig } from "next";
import { extraHeaders } from "./src/lib/security-headers";
import { checkBuild } from "./src/lib/env";

// Baseline security headers on every response. The page CSP (with a
// per-request script nonce) is set in src/lib/supabase/proxy.ts; this one
// covers API responses and anything the proxy skips.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: { root: path.resolve(__dirname) },
  async redirects() {
    return [
      {
        source: "/blog",
        destination: "/blogs",
        permanent: true,
      },
      {
        source: "/blog/:path*",
        destination: "/blogs/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    const hsts = Object.entries(extraHeaders(process.env.NODE_ENV !== "production")).map(([key, value]) => ({ key, value }));
    return [{ source: "/:path*", headers: [...securityHeaders, ...hsts] }];
  },
};

export default function config(phase: string): NextConfig {
  // A production build with missing secrets or dev switches fails here instead of deploying.
  checkBuild(phase, process.env, process.argv);
  return nextConfig;
}
