import { redirect } from "next/navigation";
import { listMyOrgs } from "@/lib/auth";

/** After sign-in: open the most recent org, or start onboarding. */
export default async function AppHome() {
  const orgs = await listMyOrgs();
  redirect(orgs[0] ? `/o/${orgs[0].slug}` : "/onboarding");
}
