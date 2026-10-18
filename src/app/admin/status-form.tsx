"use client";

import { startTransition, useActionState } from "react";
import { Button } from "@/components/ui/button";
import { setOrgStatus } from "./actions";

/** Inline suspend / reactivate control with a required reason. */
export function StatusForm({ orgId, orgName, suspended }: { orgId: string; orgName: string; suspended: boolean }) {
  const [state, action, pending] = useActionState(setOrgStatus, {});
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
    >
      <input type="hidden" name="org_id" value={orgId} />
      <input type="hidden" name="status" value={suspended ? "active" : "suspended"} />
      <label htmlFor={`reason-${orgId}`} className="sr-only">Reason for {suspended ? "reactivating" : "suspending"} {orgName}</label>
      <input
        id={`reason-${orgId}`}
        name="reason"
        required
        minLength={3}
        maxLength={300}
        placeholder="Reason"
        className="h-8 w-36 rounded-md border border-border-strong bg-surface px-2 text-xs text-fg focus:border-fg focus:outline-none"
      />
      <Button type="submit" size="sm" variant={suspended ? "secondary" : "danger"} disabled={pending}>
        {pending ? "…" : suspended ? "Reactivate" : "Suspend"}
      </Button>
      {state.error ? <span role="alert" className="w-full text-xs text-danger">{state.error}</span> : null}
      {state.message ? <span role="status" className="w-full text-xs text-success">{state.message}</span> : null}
    </form>
  );
}
