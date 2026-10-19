import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { NewPasswordForm } from "../password-forms";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

/** Reached from the reset email: /auth/callback signs the user in, then sends them here. */
export default async function ResetPasswordPage() {
  const user = await requireUser();
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-1 mb-6 text-sm text-fg-muted">For {user.email}.</p>
      <NewPasswordForm />
    </>
  );
}
