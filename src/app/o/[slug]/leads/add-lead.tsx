"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { createLead } from "../actions";

/** "Add lead" panel. Inline (not a modal) so it works the same on phones. */
export function AddLead({ slug, projects }: { slug: string; projects: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden /> Add lead
      </Button>
    );
  }
  return (
    <div className="w-full rounded-lg border border-border bg-surface p-4 sm:w-[28rem]">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium">Add a lead</h2>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="cursor-pointer rounded p-1 text-fg-muted hover:bg-surface-2">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <ActionForm action={createLead} slug={slug}>
            <Field label="Name" htmlFor="lead-name">
              <Input id="lead-name" name="name" required />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Phone" htmlFor="lead-phone">
                <Input id="lead-phone" name="phone" type="tel" inputMode="tel" placeholder="98765 43210" />
              </Field>
              <Field label="Email" htmlFor="lead-email">
                <Input id="lead-email" name="email" type="email" />
              </Field>
            </div>
            <Field label="Project" htmlFor="lead-project">
              <Select id="lead-project" name="project_id" defaultValue="">
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <SubmitButton pendingLabel="Saving…" className="w-full">Save lead</SubmitButton>
      </ActionForm>
    </div>
  );
}
