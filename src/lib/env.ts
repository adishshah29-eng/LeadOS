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

export function requireEnv(): PublicEnv {
  const env = readEnv();
  if (!env) {
    throw new Error("Supabase is not configured. Copy .env.example to .env.local and fill it in.");
  }
  return env;
}
