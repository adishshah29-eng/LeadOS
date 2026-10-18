import type { Metadata } from "next";
import Link from "next/link";
import { requireUser, listMyOrgs } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import { Logo } from "@/components/logo";
import { Card } from "@/components/ui/card";
import { CreateOrgForm } from "./create-org-form";

export const metadata: Metadata = { title: "Create your workspace" };

export default async function OnboardingPage() {
  await requireUser();
  const orgs = await listMyOrgs();
  return (
    <main className="mx-auto max-w-md px-4 py-12 sm:py-20">
      <div className="mb-8 flex items-center gap-2 font-semibold">
        <Logo /> {BRAND.name}
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Create your workspace</h1>
      <p className="mt-1 text-sm text-fg-muted">
        One workspace per company. You can invite your team and connect Meta next.
      </p>
      <Card className="mt-6 p-5">
        <CreateOrgForm />
      </Card>
      {orgs.length ? (
        <p className="mt-4 text-sm text-fg-muted">
          Or go back to <Link className="link" href={`/o/${orgs[0].slug}`}>{orgs[0].name}</Link>.
        </p>
      ) : null}
    </main>
  );
}
