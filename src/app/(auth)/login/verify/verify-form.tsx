"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { verifyLoginCode } from "@/app/account/actions";

export function VerifyForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(verifyLoginCode, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <FormMessage error={state.error} />
      <Field label="6-digit code" htmlFor="code">
        <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus className="font-mono text-lg tracking-[0.3em]" />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>{pending ? "Checking…" : "Continue"}</Button>
    </form>
  );
}
