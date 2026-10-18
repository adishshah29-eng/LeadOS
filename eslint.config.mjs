import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // The service-role client bypasses Row-Level Security. Pages, components
  // and server actions must use the user's client; only background jobs
  // (src/server) and signature-verified API routes may import it.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/server/**", "src/app/api/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [{ name: "@/server/supabase-admin", message: "Service-role client is for src/server and src/app/api only." }] },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
