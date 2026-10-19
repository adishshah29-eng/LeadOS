import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle, Pause, Play } from "lucide-react";
import { requireOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SCORE_META } from "@/lib/leads";
import { cn } from "@/lib/utils";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { setBotPaused } from "../actions";
import { ReplyBox } from "./reply-box";

export const metadata: Metadata = { title: "WhatsApp" };

const STATE_LABEL: Record<string, string> = {
  awaiting_start: "Welcome sent",
  in_progress: "Answering",
  completed: "Qualified",
  not_interested: "Not interested",
  opted_out: "Unsubscribed",
  no_response: "No response",
  undeliverable: "Not on WhatsApp",
  failed: "Send failed",
  duplicate: "Repeat enquiry",
};

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "";

/** WhatsApp's customer-service window: free replies only within 24h of the lead's last message. */
function inReplyWindow(lastInbound: string | null | undefined) {
  return !!lastInbound && Date.now() - Date.parse(lastInbound) < 86_400_000;
}

type Conv = {
  id: string;
  lead_id: string;
  name: string | null;
  phone: string;
  state: string;
  score: "hot" | "warm" | "cold" | null;
  summary: string | null;
  bot_paused: boolean;
  needs_attention: boolean;
  attention_reason: string | null;
  last_message: string | null;
  last_inbound_at: string | null;
  updated_at: string;
};

export default async function ConversationsPage({ params, searchParams }: PageProps<"/o/[slug]/conversations">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireOrg(slug);
  if (ctx.role === "viewer") notFound();

  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("wa_conversations")
    .select("id, lead_id, name, phone, state, score, summary, bot_paused, needs_attention, attention_reason, last_message, last_inbound_at, updated_at")
    .eq("org_id", ctx.org.id)
    .order("needs_attention", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(60);
  const convs = (rows ?? []) as Conv[];
  const selectedId = typeof sp.c === "string" ? sp.c : convs[0]?.id;
  const selected = convs.find((c) => c.id === selectedId) ?? null;

  const { data: msgs } = selected
    ? await supabase.from("wa_messages").select("id, direction, kind, body, status, created_at").eq("org_id", ctx.org.id).eq("conversation_id", selected.id).order("created_at").limit(200)
    : { data: [] };
  const base = `/o/${ctx.org.slug}/conversations`;
  const canReply = inReplyWindow(selected?.last_inbound_at);

  if (error?.code === "PGRST205") {
    return (
      <>
        <PageHeader title="WhatsApp" />
        <Card><EmptyState icon={<MessageCircle className="size-5" aria-hidden />} title="Not set up yet" body="Run migration 0005_whatsapp_bot.sql, then connect a number in Settings → WhatsApp." /></Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="WhatsApp" description="Conversations the bot is having with your leads. People who need you are at the top." />
      {!convs.length ? (
        <Card>
          <EmptyState
            icon={<MessageCircle className="size-5" aria-hidden />}
            title="No conversations yet"
            body="When the bot messages a new lead, or someone messages your number, the chat shows up here."
            action={<Link href={`/o/${ctx.org.slug}/settings/whatsapp`} className={buttonClass("secondary", "sm")}>WhatsApp settings</Link>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Card className="max-h-[70dvh] overflow-y-auto">
            <ul className="divide-y divide-border">
              {convs.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`${base}?c=${c.id}`}
                    aria-current={c.id === selected?.id ? "true" : undefined}
                    className={cn("block px-4 py-3 hover:bg-surface-2", c.id === selected?.id && "bg-highlight-soft")}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{c.name || `+${c.phone}`}</span>
                      <span className="shrink-0 text-xs text-fg-subtle">{time(c.updated_at)}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-fg-muted">{c.last_message ?? STATE_LABEL[c.state]}</span>
                    <span className="mt-1.5 flex flex-wrap gap-1">
                      {c.needs_attention ? <Badge tone="warning">{c.attention_reason ?? "Needs you"}</Badge> : null}
                      {c.score ? <Badge tone={SCORE_META[c.score].tone}>{SCORE_META[c.score].label}</Badge> : null}
                      {c.bot_paused ? <Badge>Bot paused</Badge> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          {selected ? (
            <Card className="flex min-h-[60dvh] flex-col">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-3">
                <div className="min-w-0">
                  <Link href={`/o/${ctx.org.slug}/leads/${selected.lead_id}`} className="font-medium hover:underline">{selected.name || `+${selected.phone}`}</Link>
                  <p className="text-xs text-fg-subtle">
                    +{selected.phone} · {STATE_LABEL[selected.state] ?? selected.state}
                    {selected.summary ? ` · ${selected.summary}` : ""}
                  </p>
                </div>
                <form action={setBotPaused}>
                  <input type="hidden" name="slug" value={ctx.org.slug} />
                  <input type="hidden" name="conversation_id" value={selected.id} />
                  <input type="hidden" name="paused" value={selected.bot_paused ? "false" : "true"} />
                  <Button type="submit" variant="secondary" size="sm">
                    {selected.bot_paused ? <><Play className="size-4" aria-hidden /> Resume bot</> : <><Pause className="size-4" aria-hidden /> Pause bot, I&apos;ll reply</>}
                  </Button>
                </form>
              </div>

              <ol className="flex-1 space-y-2 overflow-y-auto px-5 py-4" aria-label="Messages">
                {(msgs ?? []).map((m) => (
                  <li key={m.id} className={cn("flex", m.direction === "out" ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                        m.direction === "out" ? "bg-highlight-soft text-fg" : "bg-surface-2 text-fg",
                        m.status === "failed" && "border border-danger",
                      )}
                    >
                      {m.body}
                      <span className="mt-1 block text-right text-[11px] text-fg-subtle">
                        {m.direction === "out" ? (m.kind === "manual" ? "You · " : m.kind.startsWith("template") ? "Template · " : "Bot · ") : ""}
                        {time(m.created_at)}
                        {m.direction === "out" && m.status ? ` · ${m.status}` : ""}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="border-t border-border p-4">
                {selected.state === "opted_out" ? (
                  <p className="text-sm text-fg-muted">This lead unsubscribed (sent STOP). WhatsApp doesn&apos;t allow messaging them unless they write START.</p>
                ) : canReply ? (
                  <ReplyBox slug={ctx.org.slug} conversationId={selected.id} />
                ) : (
                  <p className="text-sm text-fg-muted">
                    WhatsApp only allows free replies within 24 hours of the lead&apos;s last message.{" "}
                    <Link href={`/o/${ctx.org.slug}/leads/${selected.lead_id}`} className="link">Call them from the lead page</Link>.
                  </p>
                )}
              </div>
            </Card>
          ) : null}
        </div>
      )}
    </>
  );
}
