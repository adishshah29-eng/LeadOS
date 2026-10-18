"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { acceptInvite } from "./actions";

export function AcceptInvite({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptInvite, {});
  return (
    <form action={action} className="mt-5 space-y-3">
      <input type="hidden" name="token" value={token} />
      <FormMessage error={state.error} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Joining…" : "Accept invitation"}
      </Button>
    </form>
  );
}
