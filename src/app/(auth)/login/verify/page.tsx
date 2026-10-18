import type { Metadata } from "next";
import { safeNext } from "@/lib/utils";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "Enter your code" };

/** Second sign-in step for accounts with two-factor login. The proxy sends users here. */
export default async function VerifyPage({ searchParams }: PageProps<"/login/verify">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? safeNext(sp.next) : "/app";
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Enter your code</h1>
      <p className="mt-1 mb-6 text-sm text-fg-muted">Open your authenticator app and type the 6-digit code for this account.</p>
      <VerifyForm next={next} />
      <form action="/auth/signout" method="post" className="mt-6 text-center">
        <button type="submit" className="cursor-pointer text-sm text-fg-muted underline underline-offset-4 hover:text-fg">
          Use a different account
        </button>
      </form>
    </>
  );
}
