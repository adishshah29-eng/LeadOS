"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { startSupportView } from "../../actions";

/** The only form in the support view: why you're opening this workspace. */
export function StartForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(startSupportView, {});
  return (
    <form action={action} className="max-w-lg space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <FormMessage error={state.error} />
      <Field label="Why are you opening this workspace?" htmlFor="reason" hint="The customer sees this in their activity log.">
        <Input id="reason" name="reason" required minLength={3} maxLength={300} aria-describedby="reason-hint" placeholder="e.g. Customer emailed about a failed sync" />
      </Field>
      <Button type="submit" disabled={pending}>{pending ? "Opening…" : "Open read-only for 30 minutes"}</Button>
    </form>
  );
}
