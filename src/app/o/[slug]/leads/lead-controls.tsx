"use client";

import { useTransition } from "react";
import { LEAD_STATUSES, STATUS_META, type LeadStatus } from "@/lib/leads";
import { assignLead, updateLeadStatus } from "../actions";
import { cn } from "@/lib/utils";

const selectCls =
  "h-8 cursor-pointer rounded-md border border-border bg-surface px-2 text-xs text-fg disabled:opacity-50 focus:border-fg focus:outline-none";

/** Inline status change; saves on select. */
export function StatusSelect({ slug, leadId, status }: { slug: string; leadId: string; status: LeadStatus }) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Lead status"
      defaultValue={status}
      disabled={pending}
      className={cn(selectCls, "font-medium")}
      onChange={(e) => {
        const fd = new FormData();
        fd.set("slug", slug);
        fd.set("lead_id", leadId);
        fd.set("status", e.target.value);
        start(() => updateLeadStatus(fd));
      }}
    >
      {LEAD_STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_META[s].label}
        </option>
      ))}
    </select>
  );
}

export function AssignSelect({
  slug,
  leadId,
  assignedTo,
  people,
}: {
  slug: string;
  leadId: string;
  assignedTo: string | null;
  people: { id: string; name: string }[];
}) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Assign lead"
      defaultValue={assignedTo ?? ""}
      disabled={pending}
      className={cn(selectCls, "max-w-44")}
      onChange={(e) => {
        const fd = new FormData();
        fd.set("slug", slug);
        fd.set("lead_id", leadId);
        fd.set("assigned_to", e.target.value);
        start(() => assignLead(fd));
      }}
    >
      <option value="">Unassigned</option>
      {people.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
