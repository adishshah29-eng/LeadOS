"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { createOrganization, type CreateOrgState } from "./actions";

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function CreateOrgForm() {
  const [state, action, pending] = useActionState<CreateOrgState, FormData>(createOrganization, {});
  const [name, setName] = useState(state.name ?? "");
  const [slug, setSlug] = useState(state.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(false);

  return (
    <form action={action} className="space-y-4">
      <FormMessage error={state.error} />
      <Field label="Company name" htmlFor="name">
        <Input
          id="name"
          name="name"
          required
          maxLength={80}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugEdited) setSlug(slugify(e.target.value));
          }}
          placeholder="Parmarr Properties"
        />
      </Field>
      <Field label="Workspace address" htmlFor="slug" hint="Lowercase letters, numbers and dashes.">
        <div className="flex items-center rounded-md border border-border-strong bg-surface-2 focus-within:border-fg focus-within:ring-3 focus-within:ring-highlight/70">
          <span className="pl-3 text-sm text-fg-subtle">/o/</span>
          <Input
            id="slug"
            name="slug"
            required
            pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]"
            value={slug}
            onChange={(e) => {
              setSlugEdited(true);
              setSlug(slugify(e.target.value));
            }}
            className="border-0 focus:ring-0"
            aria-describedby="slug-hint"
          />
        </div>
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating…" : "Create workspace"}
      </Button>
    </form>
  );
}
