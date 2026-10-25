import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ThemeToggle } from "@/components/theme-toggle";
import { AccountForm } from "./account-form";
import { changePassword, deleteAccount, removeTwoFactor, updateProfile } from "./actions";
import { TwoFactorSetup } from "./two-factor";

export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const sp = await searchParams;
  const user = await requireUser();
  const supabase = await createClient();
  const [{ data: profile }, { data: factors }, { data: owned }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle(),
    supabase.auth.mfa.listFactors(),
    supabase.from("memberships").select("org_id, organizations!inner(name)").eq("user_id", user.id).eq("role", "owner"),
  ]);
  // Workspaces this user owns, split by whether anyone else is in them.
  const ownedIds = (owned ?? []).map((m) => m.org_id as string);
  const { data: others } = ownedIds.length
    ? await supabase.from("memberships").select("org_id").in("org_id", ownedIds).neq("user_id", user.id)
    : { data: [] };
  const shared = new Set((others ?? []).map((m) => m.org_id as string));
  const ownedNames = (owned ?? []).map((m) => ({ id: m.org_id as string, name: (m.organizations as unknown as { name: string }).name }));
  const blocking = ownedNames.filter((o) => shared.has(o.id));
  const solo = ownedNames.filter((o) => !shared.has(o.id));
  const totp = factors?.totp?.[0];

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link href="/app" className="mb-4 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden /> Back to the app
      </Link>
      <PageHeader title="Your account" description={user.email} />

      {sp.mfa === "required" ? (
        <p role="alert" className="mb-6 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          Turn on two-factor login to open the platform admin console.
        </p>
      ) : null}
      {sp.mfa === "reverify" ? (
        <p role="alert" className="mb-6 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          To remove two-factor login, sign out, sign back in with your code, then try again.
        </p>
      ) : null}

      <Card className="mb-6 p-5">
        <h2 className="mb-3 font-medium">Profile</h2>
        <AccountForm action={updateProfile}>
          <Field label="Your name" htmlFor="full_name" hint="Shown to your team on leads and in the activity log.">
            <Input id="full_name" name="full_name" defaultValue={profile?.full_name ?? ""} required aria-describedby="full_name-hint" />
          </Field>
        </AccountForm>
      </Card>

      <Card className="mb-6 p-5">
        <h2 className="mb-1 font-medium">Two-factor login</h2>
        <p className="mb-4 text-sm text-fg-muted">
          Asks for a code from your phone when you sign in, so a stolen password isn&apos;t enough. Strongly recommended for owners and admins.
        </p>
        {totp ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-medium text-success">
              <ShieldCheck className="size-4" aria-hidden /> On ({totp.friendly_name ?? "authenticator app"})
            </p>
            <form action={removeTwoFactor}>
              <input type="hidden" name="factor_id" value={totp.id} />
              <Button type="submit" variant="danger" size="sm">Turn off</Button>
            </form>
          </div>
        ) : (
          <TwoFactorSetup />
        )}
      </Card>

      <Card className="mb-6 p-5">
        <h2 className="mb-3 font-medium">Change password</h2>
        <AccountForm action={changePassword} submitLabel="Change password" resetOnSuccess>
          <Field label="New password" htmlFor="password" hint="At least 10 characters.">
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required aria-describedby="password-hint" />
          </Field>
          <Field label="Confirm new password" htmlFor="confirm">
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
          </Field>
        </AccountForm>
      </Card>

      <Card className="mb-6 flex items-center justify-between gap-3 p-5">
        <div>
          <h2 className="font-medium">Appearance</h2>
          <p className="text-sm text-fg-muted">Saved on this device.</p>
        </div>
        <ThemeToggle />
      </Card>

      <Card className="border-danger p-5">
        <h2 className="font-medium text-danger">Delete my account</h2>
        {blocking.length ? (
          <p className="mt-1 text-sm text-fg-muted">
            You own {blocking.map((o) => `"${o.name}"`).join(", ")}, which {blocking.length === 1 ? "has" : "have"} other members. Remove them, or delete
            {blocking.length === 1 ? " that workspace" : " those workspaces"} in its Settings, before deleting your account.
          </p>
        ) : (
          <>
            <p className="mt-1 mb-4 text-sm text-fg-muted">
              Permanently deletes your login and removes you from every workspace.
              {solo.length ? ` These workspaces, which only you are in, are deleted with all their data: ${solo.map((o) => `"${o.name}"`).join(", ")}.` : ""}{" "}
              It can&apos;t be undone.
            </p>
            <div className="max-w-md">
              <AccountForm action={deleteAccount} submitLabel="Delete my account" danger>
                <Field label={`Type your email (${user.email}) to confirm`} htmlFor="confirm-email">
                  <Input id="confirm-email" name="confirm_email" type="email" autoComplete="off" required />
                </Field>
                <Field label="Your password" htmlFor="delete-password">
                  <Input id="delete-password" name="password" type="password" autoComplete="current-password" required />
                </Field>
              </AccountForm>
            </div>
          </>
        )}
      </Card>
    </main>
  );
}
