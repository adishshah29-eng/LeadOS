"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import type { ActionState } from "@/app/o/[slug]/actions";

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

const PendingContext = createContext(false);

/**
 * Form wrapper for workspace actions, usable from Server Components (children
 * are plain elements). Shows success/error and offers a copy button when the
 * action returns a link (e.g. an invite).
 *
 * Submits through onSubmit rather than the `action` prop: React resets a form
 * after every `action` submission, which would wipe what the user typed when
 * the server rejects it. Here the form is cleared only on success.
 */
export function ActionForm({
  action,
  slug,
  className,
  children,
}: {
  action: Action;
  slug: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.message && !state.error) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      <input type="hidden" name="slug" value={slug} />
      <div className="space-y-3">
        <FormMessage error={state.error} message={state.message} />
        {state.link ? <CopyLink link={state.link} /> : null}
        <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
      </div>
    </form>
  );
}

/** Submit button that disables itself and swaps its label while the parent ActionForm is saving. */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "type"> & { pendingLabel: string }) {
  const pending = useContext(PendingContext);
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}

function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2 p-2">
      <code className="min-w-0 flex-1 truncate font-mono text-xs">{link}</code>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(link);
          setCopied(true);
        }}
        className="inline-flex h-8 cursor-pointer items-center gap-1 rounded px-2 text-xs font-medium text-fg-muted hover:bg-surface hover:text-fg"
      >
        {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
