import { z } from "zod";

/**
 * Public Supabase settings. The publishable (anon) key is safe in the browser:
 * Row-Level Security decides what it can read. The service-role key is never
 * used by the web app.
 */
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  NEXT_PUBLIC_SITE_URL: z.url().optional(),
});

export type PublicEnv = z.infer<typeof schema>;

/** Returns the validated env, or null when the app hasn't been configured yet. */
export function readEnv(): PublicEnv | null {
  const parsed = schema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
  });
  return parsed.success ? parsed.data : null;
}

const REQUIRED_IN_PRODUCTION = [
  "SUPABASE_SECRET_KEY",
  "META_APP_SECRET",
  "META_WEBHOOK_VERIFY_TOKEN",
  "NEXT_PUBLIC_SITE_URL",
  // Without these, Inngest Cloud rejects every background job.
  "INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
];
const DEV_ONLY_SWITCHES = ["WA_DRY_RUN", "INNGEST_DEV"];

/**
 * What is wrong with these settings for a production server. Messages name
 * the setting, never its value, so they are safe to print in startup logs.
 */
export function productionEnvProblems(env: Record<string, string | undefined>): string[] {
  const problems = REQUIRED_IN_PRODUCTION.filter((k) => !env[k]?.trim()).map((k) => `${k} is not set`);
  const site = env.NEXT_PUBLIC_SITE_URL?.trim();
  // A bare https origin: links and the sitemap are built on it.
  const url = site && URL.canParse(site) ? new URL(site) : null;
  if (site && (!/^https:\/\//i.test(site) || !url?.host || url.pathname !== "/" || url.search || url.hash)) {
    problems.push("NEXT_PUBLIC_SITE_URL must be an https URL with only the domain, e.g. https://leados.in");
  }
  // Any value but empty/0/false counts as on: Inngest itself reads "true", " 1" or a URL as dev mode.
  for (const k of DEV_ONLY_SWITCHES) {
    const v = env[k]?.trim().toLowerCase();
    if (v && v !== "0" && v !== "false") problems.push(`${k} is for development only; remove it`);
  }
  return problems;
}

/** Throws, listing every problem, when these settings aren't safe for production. */
export function assertProductionEnv(env: Record<string, string | undefined>) {
  const problems = productionEnvProblems(env);
  if (problems.length) throw new Error(`Refusing to run with unsafe production settings:\n- ${problems.join("\n- ")}`);
}

/**
 * Called from next.config: a production build with bad settings fails instead
 * of deploying. `next typegen` loads the config in the same phase but only
 * generates types (CI runs it with no secrets), so it is let through.
 */
export function checkBuild(phase: string, env: Record<string, string | undefined>, argv: string[] = []) {
  if (phase === "phase-production-build" && !argv.includes("typegen")) assertProductionEnv(env);
}

export function requireEnv(): PublicEnv {
  const env = readEnv();
  if (!env) {
    throw new Error("Supabase is not configured. Copy .env.example to .env.local and fill it in.");
  }
  return env;
}
