import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Megaphone, MessageCircle, Pause, Play } from "lucide-react";
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

/** "Welcome sent" only makes sense when the bot wrote first. */
const stateLabel = (c: Conv) => (c.state === "awaiting_start" && c.leads?.source === "whatsapp" ? "New chat" : (STATE_LABEL[c.state] ?? c.state));

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "";

/** WhatsApp's customer-service window: free replies only within 24h of the lead's last message. */
function inReplyWindow(lastInbound: string | null | undefined) {
  return !!lastInbound && Date.now() - Date.parse(lastInbound) < 86_400_000;
}

/**
 * Two inboxes, as in the original CRM: chats the bot started after a lead
 * form ("We messaged"), and people who WhatsApped the number first
 * ("Messaged us"). A conversation's lead tells which: the bot creates a lead
 * with source "whatsapp" only for someone who wrote first.
 */
const TABS = [
  { id: "outbound", label: "We messaged", hint: "The bot welcomed them after a lead form", Icon: Megaphone },
  { id: "inbound", label: "Messaged us", hint: "They WhatsApped your number first", Icon: MessageCircle },
] as const;
type Tab = (typeof TABS)[number]["id"];

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
  leads: { source: string } | null;
};

export default async function ConversationsPage({ params, searchParams }: PageProps<"/o/[slug]/conversations">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireOrg(slug);
  if (ctx.role === "viewer") notFound();

  const supabase = await createClient();
  const cols = "id, lead_id, name, phone, state, score, summary, bot_paused, needs_attention, attention_reason, last_message, last_inbound_at, updated_at, leads!inner(source)";
  // A link to one conversation (?c=) opens the tab it belongs to.
  const { data: picked } =
    typeof sp.c === "string" && /^[0-9a-f-]{36}$/i.test(sp.c)
      ? await supabase.from("wa_conversations").select(cols).eq("org_id", ctx.org.id).eq("id", sp.c).maybeSingle()
      : { data: null };
  const pickedConv = picked as unknown as Conv | null;
  const tab: Tab = sp.tab === "inbound" || sp.tab === "outbound" ? sp.tab : pickedConv?.leads?.source === "whatsapp" ? "inbound" : "outbound";

  // Filters on the joined lead's source: "whatsapp" means they wrote first.
  const sourceOp = (t: Tab) => (t === "inbound" ? "eq" : "neq");
  const countFor = (t: Tab, attention = false) => {
    const q = supabase.from("wa_conversations").select("id, leads!inner(source)", { count: "exact", head: true }).eq("org_id", ctx.org.id);
    return (attention ? q.eq("needs_attention", true) : q)[sourceOp(t)]("leads.source", "whatsapp");
  };

  const [{ data: rows, error }, outCount, inCount, outAttention, inAttention] = await Promise.all([
    supabase
      .from("wa_conversations")
      .select(cols)
      .eq("org_id", ctx.org.id)
      [sourceOp(tab)]("leads.source", "whatsapp")
      .order("needs_attention", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(60),
    countFor("outbound"),
    countFor("inbound"),
    countFor("outbound", true),
    countFor("inbound", true),
  ]);
  const counts: Record<Tab, { total: number; attention: number }> = {
    outbound: { total: outCount.count ?? 0, attention: outAttention.count ?? 0 },
    inbound: { total: inCount.count ?? 0, attention: inAttention.count ?? 0 },
  };
  const convs = (rows ?? []) as unknown as Conv[];
  const selected = pickedConv && (pickedConv.leads?.source === "whatsapp") === (tab === "inbound") ? pickedConv : (convs[0] ?? null);

  const { data: msgs } = selected
    ? await supabase.from("wa_messages").select("id, direction, kind, body, status, created_at").eq("org_id", ctx.org.id).eq("conversation_id", selected.id).order("created_at").limit(200)
    : { data: [] };
  const base = `/o/${ctx.org.slug}/conversations`;
  const tabBase = `${base}?tab=${tab}`;
  const canReply = inReplyWindow(selected?.last_inbound_at);

  if (error?.code === "PGRST205") {
    return (
      <>
        <PageHeader title="WhatsApp" />
        <Card><EmptyState icon={<MessageCircle className="size-5" aria-hidden />} title="Not set up yet" body="Run migration 0005_whatsapp_bot.sql, then connect a number in Settings → WhatsApp." /></Card>
      </>
    );
  }
  if (error) {
    // Never show an empty inbox when the list simply failed to load.
    console.error("[conversations] list failed", error.code, error.message);
    return (
      <>
        <PageHeader title="WhatsApp" />
        <Card><EmptyState icon={<MessageCircle className="size-5" aria-hidden />} title="Couldn't load conversations" body="Refresh the page. If it keeps happening, contact support." /></Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="WhatsApp" description="Conversations the bot is having with your leads. People who need you are at the top." />
      <nav aria-label="Conversation type" className="mb-4 grid grid-cols-2 gap-2">
        {TABS.map(({ id, label, hint, Icon }) => (
          <Link
            key={id}
            href={`${base}?tab=${id}`}
            aria-current={tab === id ? "page" : undefined}
            className={cn(
              "rounded-lg border p-3 transition-colors sm:p-4",
              tab === id ? "border-fg bg-highlight-soft" : "border-border bg-surface hover:bg-surface-2",
            )}
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Icon className="size-4" aria-hidden /> {label}
              <span className="tabular ml-auto text-xs font-medium text-fg-muted">{counts[id].total}</span>
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-subtle">
              <span className="hidden sm:inline">{hint}</span>
              {counts[id].attention ? <Badge tone="warning">{counts[id].attention} need you</Badge> : null}
            </span>
          </Link>
        ))}
      </nav>
      {!convs.length ? (
        <Card>
          <EmptyState
            icon={tab === "inbound" ? <MessageCircle className="size-5" aria-hidden /> : <Megaphone className="size-5" aria-hidden />}
            title={tab === "inbound" ? "Nobody has messaged you first yet" : "The bot hasn't messaged any leads yet"}
            body={
              tab === "inbound"
                ? "When someone WhatsApps your business number, the chat appears here and the bot starts qualifying them."
                : "When a new lead fills in your form and the bot is on, its welcome message and the chat appear here."
            }
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
                    href={`${tabBase}&c=${c.id}`}
                    aria-current={c.id === selected?.id ? "true" : undefined}
                    className={cn("block px-4 py-3 hover:bg-surface-2", c.id === selected?.id && "bg-highlight-soft")}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{c.name || `+${c.phone}`}</span>
                      <span className="shrink-0 text-xs text-fg-subtle">{time(c.updated_at)}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-fg-muted">{c.last_message ?? stateLabel(c)}</span>
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
                    +{selected.phone} · {stateLabel(selected)}
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
