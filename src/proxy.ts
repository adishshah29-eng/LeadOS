import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Skip static files, the Meta webhook and the Inngest endpoint: those
  // authenticate by signature, not by user session.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/inngest|api/health$|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
