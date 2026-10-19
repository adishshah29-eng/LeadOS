import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { atLeast, requireOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BRAND, LEGAL } from "@/lib/brand";
import { settingsFromRow } from "@/server/bot/settings";
import { Card, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { connectWhatsApp, disconnectWhatsApp, recheckWhatsApp, resetQuestions, saveBotSettings } from "./actions";

export const metadata: Metadata = { title: "WhatsApp" };

const textareaCls =
  "w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:border-fg focus:outline-none focus:ring-3 focus:ring-highlight/70";

export default async function WhatsAppSettings({ params, searchParams }: PageProps<"/o/[slug]/settings/whatsapp">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireOrg(slug);
  if (!atLeast(ctx.role, "admin")) notFound();

  const supabase = await createClient();
  const [{ data: integ }, { data: row }] = await Promise.all([
    supabase.from("integrations").select("status, display_name, available, last_error").eq("org_id", ctx.org.id).eq("kind", "whatsapp").maybeSingle(),
    supabase.from("bot_settings").select("*").eq("org_id", ctx.org.id).maybeSingle(),
  ]);
  const connected = integ?.status === "active";
  const s = settingsFromRow(row as Record<string, unknown> | null, ctx.org.name);
  const link = (integ?.available ?? {}) as { waba_id?: string | null; subscribed_at?: string | null; subscribe_error?: string | null };

  return (
    <>
      <Link href={`/o/${ctx.org.slug}/settings`} className="mb-4 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden /> Settings
      </Link>
      <PageHeader
        title="WhatsApp lead bot"
        description={connected ? `Connected: ${integ?.display_name}` : "Reply to every new lead on WhatsApp within seconds, qualify them with buttons, and follow up automatically."}
        actions={connected ? <Badge tone={s.enabled ? "success" : "neutral"}>{s.enabled ? "Bot on" : "Bot off"}</Badge> : undefined}
      />

      {process.env.WA_DRY_RUN === "1" && process.env.NODE_ENV !== "production" ? (
        <p role="alert" className="mb-4 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          Dry-run mode is on (WA_DRY_RUN=1): messages are logged, not sent. Remove it from .env.local to message real leads.
        </p>
      ) : null}
      {integ?.status === "needs_reauth" ? (
        <p role="alert" className="mb-4 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
          Meta stopped accepting the saved WhatsApp token, so the bot has stopped sending. Paste a new token below to resume.
          {integ.last_error ? ` (${integ.last_error})` : ""}
        </p>
      ) : null}
      {sp.connected ? (
        <p role="status" className="mb-4 rounded-md bg-success-soft px-3 py-2 text-sm text-success">
          Number connected. Set up the bot below, then switch it on.
        </p>
      ) : null}

      {!connected ? (
        <Card className="mb-6 max-w-2xl p-5">
          <h2 className="font-medium">{integ?.status === "needs_reauth" ? "Reconnect" : "Connect"} your WhatsApp Business number</h2>
          <ol className="mt-2 mb-4 list-decimal space-y-1 pl-5 text-sm text-fg-muted">
            <li>In Meta Business Settings → Users → System users, give your System User <strong className="font-medium text-fg">full control</strong> of your WhatsApp account.</li>
            <li>Generate a token for it with <code className="font-mono text-xs">whatsapp_business_messaging</code> and <code className="font-mono text-xs">whatsapp_business_management</code>, set to never expire.</li>
            <li>In WhatsApp Manager → Phone numbers, copy the <strong className="font-medium text-fg">Phone number ID</strong> (a long number, not the phone number).</li>
          </ol>
          <p className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link href="/help/connect-whatsapp" className="link">Step-by-step guide with every click</Link>
            <a href={`mailto:${LEGAL.email}?subject=${encodeURIComponent(`Setup help for ${ctx.org.name}`)}`} className="link">Or we&apos;ll set it up with you</a>
          </p>
          <ActionForm action={connectWhatsApp} slug={ctx.org.slug}>
            <Field label="Phone number ID" htmlFor="wa-pnid">
              <Input id="wa-pnid" name="phone_number_id" inputMode="numeric" required />
            </Field>
            <Field label="Access token" htmlFor="wa-token" hint="Stored encrypted. Nobody can view it again after saving.">
              <Input id="wa-token" name="token" type="password" autoComplete="off" spellCheck={false} required aria-describedby="wa-token-hint" />
            </Field>
            <Field label="WhatsApp Business Account ID (optional)" htmlFor="wa-waba" hint="Only needed if we can't find it ourselves.">
              <Input id="wa-waba" name="waba_id" inputMode="numeric" aria-describedby="wa-waba-hint" />
            </Field>
            <SubmitButton pendingLabel="Checking with Meta…">Connect number</SubmitButton>
          </ActionForm>
        </Card>
      ) : link.subscribed_at ? (
        <p role="status" className="mb-6 rounded-md bg-success-soft px-3 py-2 text-sm text-success">
          Receiving replies: your WhatsApp account is linked to {BRAND.name}.
        </p>
      ) : (
        <Card className="mb-6 max-w-2xl border-warning p-5">
          <h2 className="font-medium">Not receiving replies yet</h2>
          <p className="mt-1 text-sm text-fg-muted">
            The bot can send, but it won&apos;t see what leads write back until your WhatsApp Business Account is linked.
            {link.subscribe_error ? ` Reason: ${link.subscribe_error}` : ""}
          </p>
          <p className="mt-2 text-sm text-fg-muted">
            Fix: in Meta Business Settings → System users, give the System User full control of the WhatsApp account, then check again. If it still fails, paste the account ID from WhatsApp Manager → Account tools → Account info.
          </p>
          <ActionForm action={recheckWhatsApp} slug={ctx.org.slug} className="mt-4 flex flex-wrap items-end gap-3">
            <Field label="WhatsApp Business Account ID (optional)" htmlFor="wa-waba-recheck">
              <Input id="wa-waba-recheck" name="waba_id" inputMode="numeric" defaultValue={link.waba_id ?? ""} />
            </Field>
            <SubmitButton pendingLabel="Checking…" size="sm">Check again</SubmitButton>
          </ActionForm>
        </Card>
      )}

      <ActionForm action={saveBotSettings} slug={ctx.org.slug} className="mb-6">
        <Card className="p-5">
          <h2 className="font-medium">Bot</h2>
          <label className="mt-3 flex cursor-pointer items-start gap-3">
            <input type="checkbox" name="enabled" defaultChecked={s.enabled} disabled={!connected} className="mt-1 size-4 accent-[var(--fg)]" />
            <span>
              <span className="block text-sm font-medium">Message new leads automatically</span>
              <span className="block text-xs text-fg-subtle">
                Only leads that arrive after you switch this on, and within 24 hours. Existing leads are never messaged.
                {!connected ? " Connect a number first." : ""}
              </span>
            </span>
          </label>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Business name the bot uses" htmlFor="bot-name">
              <Input id="bot-name" name="business_name" defaultValue={s.businessName} required maxLength={80} />
            </Field>
          </div>
        </Card>

        <Card className="mt-4 p-5">
          <h2 className="font-medium">Message templates</h2>
          <p className="mt-1 mb-3 text-sm text-fg-muted">
            WhatsApp only lets a business start a chat with a template Meta has approved. Create these in WhatsApp Manager. Each takes{" "}
            <code className="font-mono text-xs">{"{{1}}"}</code> = first name and <code className="font-mono text-xs">{"{{2}}"}</code> = project. Give the welcome
            quick-reply buttons such as &quot;Yes, let&apos;s start&quot;, &quot;Call me&quot; and &quot;Not interested&quot;.{" "}
            <Link href="/help/whatsapp-templates" className="link">Ready-to-copy templates</Link>
          </p>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Welcome" htmlFor="t-welcome"><Input id="t-welcome" name="welcome" defaultValue={s.templates.welcome} required /></Field>
            <Field label="Nudge (no reply)" htmlFor="t-nudge"><Input id="t-nudge" name="nudge" defaultValue={s.templates.nudge} required /></Field>
            <Field label="Follow-up" htmlFor="t-followup"><Input id="t-followup" name="followup" defaultValue={s.templates.followup} required /></Field>
            <Field label="Language" htmlFor="t-lang"><Input id="t-lang" name="language" defaultValue={s.templates.language} required /></Field>
          </div>
        </Card>

        <Card className="mt-4 p-5">
          <h2 className="font-medium">What the bot knows</h2>
          <p className="mt-1 mb-3 text-sm text-fg-muted">
            Facts the bot may use to answer questions: projects, locations, possession dates, amenities, prices. It never quotes a number that isn&apos;t written here; anything it can&apos;t answer goes to your team.
          </p>
          <label htmlFor="knowledge" className="sr-only">Facts</label>
          <textarea id="knowledge" name="knowledge" rows={8} maxLength={20000} defaultValue={s.knowledge} className={textareaCls} placeholder={"Skyline Residences, Baner, Pune.\n2 BHK from ₹1.1 Cr, 3 BHK from ₹1.6 Cr.\nPossession December 2027. RERA P52100012345.\nAmenities: pool, gym, clubhouse."} />
        </Card>

        <Card className="mt-4 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-medium">Qualifying questions</h2>
            <span className="text-xs text-fg-subtle">Up to 3 options show as buttons (20 characters max), more as a list (24 max). Order matters.</span>
          </div>
          <ol className="mt-4 space-y-4">
            {s.questions.map((q, i) => (
              <li key={q.id} className="rounded-md border border-border p-4">
                <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
                  <Field label={`Question ${i + 1}`} htmlFor={`q${i}_prompt`}>
                    <Input id={`q${i}_prompt`} name={`q${i}_prompt`} defaultValue={q.prompt} required maxLength={300} />
                  </Field>
                  <div>
                    <label htmlFor={`q${i}_options`} className="mb-1.5 block text-sm font-medium">Options, one per line</label>
                    <textarea id={`q${i}_options`} name={`q${i}_options`} rows={Math.min(Math.max(q.options.length, 3), 7)} defaultValue={q.options.map((o) => o.title).join("\n")} className={textareaCls} />
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-fg-subtle">
                  {q.id === "next_step" ? <span>Ends the chat: the first two options mean &quot;visit&quot; and &quot;call&quot;.</span> : null}
                  {q.showIf ? <span>Only asked after choosing a call or a visit.</span> : null}
                  {!["next_step", "call_time"].includes(q.id) ? (
                    <label className="flex cursor-pointer items-center gap-1.5">
                      <input type="checkbox" name={`q${i}_delete`} className="size-3.5 accent-[var(--danger)]" /> Remove this question
                    </label>
                  ) : null}
                </div>
              </li>
            ))}
            <li className="rounded-md border border-dashed border-border-strong p-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
                <Field label="Add a question (optional)" htmlFor="new_prompt">
                  <Input id="new_prompt" name="new_prompt" placeholder="e.g. Do you need a home loan?" maxLength={300} />
                </Field>
                <div>
                  <label htmlFor="new_options" className="mb-1.5 block text-sm font-medium">Options, one per line</label>
                  <textarea id="new_options" name="new_options" rows={3} className={textareaCls} placeholder={"Yes\nNo\nNot sure"} />
                </div>
              </div>
            </li>
          </ol>
        </Card>

        <div className="mt-4">
          <SubmitButton pendingLabel="Saving…">Save bot settings</SubmitButton>
        </div>
      </ActionForm>

      <div className="flex flex-wrap gap-2">
        <form action={resetQuestions}>
          <input type="hidden" name="slug" value={ctx.org.slug} />
          <Button type="submit" variant="ghost" size="sm">Reset questions to the default</Button>
        </form>
        {connected ? (
          <form action={disconnectWhatsApp}>
            <input type="hidden" name="slug" value={ctx.org.slug} />
            <Button type="submit" variant="danger" size="sm">Disconnect number</Button>
          </form>
        ) : null}
      </div>
    </>
  );
}
