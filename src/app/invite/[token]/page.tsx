import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { AcceptInvite } from "./accept";

export const metadata: Metadata = { title: "Join workspace", robots: { index: false } };

/** Invite links: the proxy sends signed-out visitors to /login?next=/invite/… first. */
export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const user = await requireUser();
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <Card className="p-6">
        <h1 className="text-lg font-semibold">You&apos;ve been invited</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Accept to join the workspace as <span className="font-medium text-fg">{user.email}</span>. The invitation must have been
          sent to this email address.
        </p>
        <AcceptInvite token={token} />
      </Card>
    </main>
  );
}
