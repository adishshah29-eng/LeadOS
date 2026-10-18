import type { Metadata } from "next";
import { safeNext } from "@/lib/utils";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? safeNext(sp.next) : undefined;
  const notice = sp.error === "link" ? "That link has expired or was already used. Sign in instead." : undefined;
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1 mb-6 text-sm text-fg-muted">Welcome back.</p>
      <AuthForm mode="login" next={next} notice={notice} />
    </>
  );
}
