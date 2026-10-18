"use client";

import { startTransition, useActionState, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { confirmTwoFactor, startTwoFactor, type EnrollState } from "./actions";

/** Authenticator-app setup: show QR + secret, then confirm with a code. */
export function TwoFactorSetup() {
  const [setup, setSetup] = useState<EnrollState | null>(null);
  const [starting, setStarting] = useState(false);
  const [state, action, pending] = useActionState(confirmTwoFactor, {});
  const active = state.factorId ? state : setup;

  if (state.message) {
    return (
      <p role="status" className="flex items-center gap-2 rounded-md bg-success-soft px-3 py-2 text-sm text-success">
        <ShieldCheck className="size-4" aria-hidden /> {state.message}
      </p>
    );
  }

  if (!active?.factorId) {
    return (
      <div className="space-y-3">
        <FormMessage error={setup?.error} />
        <Button
          type="button"
          variant="secondary"
          disabled={starting}
          onClick={async () => {
            setStarting(true);
            setSetup(await startTwoFactor());
            setStarting(false);
          }}
        >
          {starting ? "Starting…" : "Set up two-factor login"}
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
    >
      <input type="hidden" name="factor_id" value={active.factorId} />
      <input type="hidden" name="qr" value={active.qr ?? ""} />
      <input type="hidden" name="secret" value={active.secret ?? ""} />
      <ol className="list-decimal space-y-1 pl-5 text-sm text-fg-muted">
        <li>Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…).</li>
        <li>Scan this code, or type the key below.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Supabase returns the QR as an SVG data URI; it never leaves this page. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={active.qr} alt="QR code for your authenticator app" className="size-40 rounded-md bg-white p-2" />
        <div className="min-w-0">
          <p className="text-xs text-fg-subtle">Setup key</p>
          <code className="block font-mono text-sm break-all">{active.secret}</code>
        </div>
      </div>
      <FormMessage error={state.error} />
      <Field label="6-digit code" htmlFor="mfa-code">
        <Input id="mfa-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required className="max-w-40 font-mono tracking-widest" />
      </Field>
      <Button type="submit" disabled={pending}>{pending ? "Checking…" : "Turn on"}</Button>
    </form>
  );
}
