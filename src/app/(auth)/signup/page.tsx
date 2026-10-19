import type { Metadata } from "next";
import Link from "next/link";
import { safeNext } from "@/lib/utils";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? safeNext(sp.next) : undefined;
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1 mb-6 text-sm text-fg-muted">14-day free trial. No card needed.</p>
      <AuthForm mode="signup" next={next} />
      <p className="mt-6 text-center text-xs text-fg-subtle">
        By creating an account you agree to the <Link href="/terms" className="underline underline-offset-2 hover:text-fg">terms</Link> and{" "}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-fg">privacy policy</Link>.
      </p>
    </>
  );
}
