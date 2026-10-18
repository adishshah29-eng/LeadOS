import { serve } from "inngest/next";
import { inngest } from "@/server/jobs/client";
import { functions } from "@/server/jobs/meta";

// Inngest calls this endpoint to run jobs. In production, requests are
// verified with INNGEST_SIGNING_KEY.
export const { GET, POST, PUT } = serve({ client: inngest, functions });

// Long syncs need more than the default serverless timeout.
export const maxDuration = 300;
