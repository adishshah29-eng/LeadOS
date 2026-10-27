import fs from "node:fs";
import path from "node:path";
import { serve } from "inngest/next";
import { inngest } from "@/server/jobs/client";
import { functions as metaFunctions } from "@/server/jobs/meta";
import { whatsappFunctions } from "@/server/jobs/whatsapp";
import { localJobsRefusal } from "@/lib/db-lock";

// Inngest calls this endpoint to run jobs. In production, requests are
// verified with INNGEST_SIGNING_KEY.
const handlers = serve({ client: inngest, functions: [...metaFunctions, ...whatsappFunctions] });

const readEnvFile = (name: string) => {
  try {
    return fs.readFileSync(path.join(/* turbopackIgnore: true */ process.cwd(), name), "utf8");
  } catch {
    return null;
  }
};

/**
 * Local dev shares the live database, so local background jobs refuse to
 * register or run unless allowed for this run (src/lib/db-lock.ts).
 * Production is never locked.
 */
function locked(): Response | null {
  const why = localJobsRefusal(process.env, readEnvFile);
  if (why) console.warn(why);
  return why ? new Response(why, { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } }) : null;
}

type Args = Parameters<typeof handlers.GET>;
export const GET = async (...args: Args) => locked() ?? handlers.GET(...args);
export const POST = async (...args: Args) => locked() ?? handlers.POST(...args);
export const PUT = async (...args: Args) => locked() ?? handlers.PUT(...args);

// Long syncs need more than the default serverless timeout.
export const maxDuration = 300;
