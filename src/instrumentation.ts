import { assertProductionEnv } from "./lib/env.ts";

/** Throws in production when settings are missing or a dev-only switch is on. */
export function checkStartup(env: Record<string, string | undefined>) {
  if (env.NODE_ENV === "production") assertProductionEnv(env);
}

/** Next.js runs this once, before the server accepts requests. */
export function register() {
  checkStartup(process.env);
}
