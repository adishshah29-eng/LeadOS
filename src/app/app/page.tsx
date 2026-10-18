import { redirect } from "next/navigation";
import { listMyOrgs } from "@/lib/auth";

/** After sign-in: open the most recent org, or start onboarding. */
export default async function AppHome() {
  const orgs = await listMyOrgs();
  if (!orgs.length) redirect("/onboarding");
  const open = orgs.find((o) => o.status !== "suspended");
  redirect(open ? `/o/${open.slug}` : "/suspended");
}
