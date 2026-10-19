"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/field";
import { sendWhatsAppReply } from "../actions";

/** Reply box. The send happens in a worker, so the thread refreshes shortly after. */
export function ReplyBox({ slug, conversationId }: { slug: string; conversationId: string }) {
  const [state, action, pending] = useActionState(sendWhatsAppReply, {});
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.message) return;
    form.current?.reset();
    const t = setTimeout(() => router.refresh(), 2500);
    return () => clearTimeout(t);
  }, [state, router]);

  return (
    <form
      ref={form}
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="conversation_id" value={conversationId} />
      <FormMessage error={state.error} message={state.message} />
      <div className="flex gap-2">
        <label htmlFor="reply" className="sr-only">Reply on WhatsApp</label>
        <textarea
          id="reply"
          name="text"
          rows={2}
          maxLength={4000}
          required
          defaultValue={state.values?.text}
          placeholder="Write a WhatsApp reply…"
          className="min-h-11 flex-1 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none focus:ring-3 focus:ring-highlight/70"
        />
        <Button type="submit" disabled={pending} className="self-end" aria-label="Send reply">
          <Send className="size-4" aria-hidden /> {pending ? "…" : "Send"}
        </Button>
      </div>
    </form>
  );
}
