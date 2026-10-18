"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { signIn, signUp, type AuthState } from "./actions";

/** Sign-in and sign-up share one form. Entered values survive a failed submit. */
export function AuthForm({ mode, next, notice }: { mode: "login" | "signup"; next?: string; notice?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "login" ? signIn : signUp, {});
  const isSignup = mode === "signup";

  return (
    <form action={action} className="space-y-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <FormMessage error={state.error ?? notice} message={state.message} />
      {isSignup ? (
        <Field label="Your name" htmlFor="name">
          <Input id="name" name="name" autoComplete="name" required defaultValue={state.name} />
        </Field>
      ) : null}
      <Field label="Work email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.email} />
      </Field>
      <Field label="Password" htmlFor="password" hint={isSignup ? "At least 10 characters." : undefined}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          required
          minLength={10}
          aria-describedby={isSignup ? "password-hint" : undefined}
        />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {isSignup ? "Create account" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-fg-muted">
        {isSignup ? "Already have an account? " : "New here? "}
        <Link
          href={`${isSignup ? "/login" : "/signup"}${next ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="link"
        >
          {isSignup ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
