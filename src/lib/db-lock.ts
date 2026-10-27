/**
 * Safety lock for the shared database: the live site and local development
 * use the same Supabase project, so anything on a developer's PC that writes
 * to it (integration tests, local background jobs) refuses to run unless the
 * developer allows that one run by typing LEADOS_ALLOW_LIVE_DB=yes before the
 * command. The switch is refused if it's left in a .env file, so it can't stay
 * on by accident.
 *
 * Plain module (no "@/" imports) so the integration tests can load it too.
 */

type Env = Record<string, string | undefined>;
/** Returns the text of the named file in the project folder, or null if there isn't one. Only read when needed. */
type ReadEnvFile = (name: string) => string | null;

/** The files Next.js loads in development (`.env.local` first, since that's where the switch would usually end up). */
export const ENV_FILES = [".env.local", ".env.development.local", ".env.development", ".env"];

const SWITCH = "LEADOS_ALLOW_LIVE_DB";
const SWITCH_LINE = new RegExp(`^\\s*(?:export\\s+)?${SWITCH}\\s*[=:]`, "m"); // dotenv accepts KEY=val and KEY: val

/** Same rule as the production check in env.ts: anything but empty/0/false counts as on. */
const isOn = (v: string | undefined) => {
  const t = v?.trim().toLowerCase();
  return !!t && t !== "0" && t !== "false";
};

function refusal(what: string, command: string, env: Env, readEnvFile: ReadEnvFile): string | null {
  const file = ENV_FILES.find((name) => SWITCH_LINE.test(readEnvFile(name) ?? ""));
  if (file) {
    return `${SWITCH} is set in ${file}. Remove that line: allow one run at a time by typing it before the command, e.g. ${SWITCH}=yes ${command}`;
  }
  if (env[SWITCH]?.trim().toLowerCase() === "yes") return null;
  return [
    `${what} are locked: this PC uses the same Supabase database as the live site.`,
    "To allow this one run, type the switch before the command:",
    `  Git Bash:   ${SWITCH}=yes ${command}`,
    `  PowerShell: $env:${SWITCH}="yes"; try { ${command} } finally { Remove-Item Env:${SWITCH} }`,
  ].join("\n");
}

/** Why integration tests must not run now, or null when they may. */
export function integrationTestsRefusal(env: Env, readEnvFile: ReadEnvFile): string | null {
  return refusal("Integration tests (they create and delete users and workspaces)", "npm run test:int", env, readEnvFile);
}

/** Why local background jobs must not run now, or null when they may. Production is never locked. */
export function localJobsRefusal(env: Env, readEnvFile: ReadEnvFile): string | null {
  if (env.NODE_ENV === "production" || !isOn(env.INNGEST_DEV)) return null;
  return refusal("Local background jobs (syncs, WhatsApp follow-ups)", "npm run dev", env, readEnvFile);
}
