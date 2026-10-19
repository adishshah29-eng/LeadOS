"use client";

import { startTransition, useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { PLAN_IDS } from "@/lib/plans";
import { setOrgPlan } from "./actions";

const inputCls = "h-8 rounded-md border border-border-strong bg-surface px-2 text-xs text-fg focus:border-fg focus:outline-none";

/** Inline plan change / trial extension with a required reason. */
export function PlanForm({ orgId, orgName, plan }: { orgId: string; orgName: string; plan: string }) {
  const [state, action, pending] = useActionState(setOrgPlan, {});
  const [chosen, setChosen] = useState(plan);
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
      <label htmlFor={`plan-${orgId}`} className="sr-only">Plan for {orgName}</label>
      <select id={`plan-${orgId}`} name="plan" value={chosen} onChange={(e) => setChosen(e.target.value)} className={inputCls}>
        {PLAN_IDS.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
      {chosen === "trial" ? (
        <>
          <label htmlFor={`days-${orgId}`} className="sr-only">Trial days to add for {orgName}</label>
          <input id={`days-${orgId}`} name="trial_days" type="number" min={1} max={90} defaultValue={7} className={`${inputCls} w-16`} />
        </>
      ) : null}
      <label htmlFor={`plan-reason-${orgId}`} className="sr-only">Reason for changing {orgName}&apos;s plan</label>
      <input id={`plan-reason-${orgId}`} name="reason" required minLength={3} maxLength={300} placeholder="Reason" className={`${inputCls} w-32`} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? "…" : chosen === "trial" ? "Extend" : "Set plan"}
      </Button>
      {state.error ? <span role="alert" className="w-full text-xs text-danger">{state.error}</span> : null}
      {state.message ? <span role="status" className="w-full text-xs text-success">{state.message}</span> : null}
    </form>
  );
}
