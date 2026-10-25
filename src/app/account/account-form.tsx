"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import type { AccountState } from "./actions";

/** Small form wrapper for account actions; keeps input on error, optionally clears on success. */
export function AccountForm({
  action,
  children,
  submitLabel = "Save",
  resetOnSuccess = false,
  danger = false,
}: {
  action: (prev: AccountState, form: FormData) => Promise<AccountState>;
  children: React.ReactNode;
  submitLabel?: string;
  resetOnSuccess?: boolean;
  danger?: boolean;
}) {
  const [state, run, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state.message) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => run(fd));
      }}
    >
      <FormMessage error={state.error} message={state.message} />
      {children}
      <Button type="submit" size="sm" variant={danger ? "danger" : "primary"} disabled={pending}>{pending ? "Working…" : submitLabel}</Button>
    </form>
  );
}
