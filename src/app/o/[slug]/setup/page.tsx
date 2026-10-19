import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BookOpen, CheckCircle2, Clock, Headset } from "lucide-react";
import { atLeast, requireOrg } from "@/lib/auth";
import { BRAND, LEGAL } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import { getSetupSteps, setupComplete } from "@/lib/setup-steps";
import { cn } from "@/lib/utils";
import { Card, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { createProject } from "../actions";

export const metadata: Metadata = { title: "Get set up" };

/**
 * Where a new workspace lands. Walks the admin through each step in order,
 * says why it matters and how long it takes, and offers a done-for-you
 * setup for the Meta step, which is the hard one until Facebook Login is
 * approved by Meta.
 */
export default async function SetupPage({ params }: PageProps<"/o/[slug]/setup">) {
  const { slug } = await params;
  const ctx = await requireOrg(slug);
  if (!atLeast(ctx.role, "admin")) notFound();

  const supabase = await createClient();
  const [steps, { data: me }] = await Promise.all([
    getSetupSteps(ctx.org.id, ctx.org.slug),
    supabase.from("profiles").select("full_name").eq("user_id", ctx.userId).maybeSingle(),
  ]);
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  const complete = setupComplete(steps);
  const firstName = me?.full_name?.trim().split(/\s+/)[0];
  const helpSubject = encodeURIComponent(`Setup help for ${ctx.org.name} (${ctx.org.slug})`);

  return (
    <>
      <PageHeader
        title={complete ? "You're set up" : `Welcome to ${BRAND.name}`}
        description={
          complete
            ? "Your ads and leads are flowing in. The optional steps below make it even more useful."
            : `${firstName ? `Hi ${firstName}. ` : ""}A few steps and your ad spend, leads and follow-ups will live in one place. Most people finish in about 15 minutes.`
        }
        actions={
          <Link href={`/o/${ctx.org.slug}`} className={buttonClass("secondary", "sm")}>
            {complete ? "Go to overview" : "Skip for now"}
          </Link>
        }
      />

      <div className="mb-6">
        <div className="mb-1.5 flex justify-between text-xs text-fg-muted">
          <span>{done} of {steps.length} steps done</span>
          <span>{Math.round((done / steps.length) * 100)}%</span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={done}
        >
          <div className="h-full rounded-full bg-highlight transition-[width] duration-500" style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <ol className="space-y-3">
          {steps.map((s, i) => {
            const current = s.id === next?.id;
            return (
              <li key={s.id}>
                <Card className={cn("p-5", current && "border-fg")}>
                  <div className="flex items-start gap-3">
                    {s.done ? (
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
                    ) : (
                      <span
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                          current ? "bg-highlight text-highlight-fg" : "border border-border-strong text-fg-muted",
                        )}
                        aria-hidden
                      >
                        {i + 1}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className={cn("font-medium", s.done && "text-fg-muted")}>{s.title}</h2>
                        {s.done ? <Badge tone="success">Done</Badge> : null}
                        {s.optional && !s.done ? <Badge>Optional</Badge> : null}
                        {!s.done ? (
                          <span className="flex items-center gap-1 text-xs text-fg-subtle">
                            <Clock className="size-3.5" aria-hidden /> about {s.minutes} min
                          </span>
                        ) : null}
                      </div>
                      {!s.done ? <p className="mt-1 text-sm text-fg-muted">{s.why}</p> : null}

                      {!s.done && s.id === "project" ? (
                        <ActionForm action={createProject} slug={ctx.org.slug} className="mt-3">
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <label htmlFor="setup-project" className="sr-only">Project name</label>
                            <Input id="setup-project" name="name" placeholder="e.g. Skyline Residences" required maxLength={80} />
                            <SubmitButton pendingLabel="Adding…" className="shrink-0">Add project</SubmitButton>
                          </div>
                        </ActionForm>
                      ) : !s.done ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Link href={s.href} className={buttonClass(current ? "primary" : "secondary", "sm")}>
                            {s.action} <ArrowRight className="size-4" aria-hidden />
                          </Link>
                          {s.guide ? (
                            <Link href={s.guide} className={buttonClass("ghost", "sm")}>
                              <BookOpen className="size-4" aria-hidden /> Step-by-step guide
                            </Link>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>

        <aside className="space-y-3">
          <Card className="p-5">
            <Headset className="size-5 text-fg" aria-hidden />
            <h2 className="mt-3 font-medium">Want us to set it up?</h2>
            <p className="mt-1 text-sm text-fg-muted">
              Connecting Meta and WhatsApp means a few clicks in Meta&apos;s Business Settings. We can do it with you on a short call, free.
            </p>
            <a href={`mailto:${LEGAL.email}?subject=${helpSubject}`} className={buttonClass("secondary", "sm", "mt-4")}>
              Book a setup call
            </a>
          </Card>
          <Card className="p-5">
            <BookOpen className="size-5 text-fg" aria-hidden />
            <h2 className="mt-3 font-medium">Guides</h2>
            <ul className="mt-2 space-y-1.5 text-sm">
              <li><Link href="/help/connect-meta" className="link">Connect Meta ads</Link></li>
              <li><Link href="/help/connect-whatsapp" className="link">Connect WhatsApp</Link></li>
              <li><Link href="/help/whatsapp-templates" className="link">WhatsApp message templates</Link></li>
              <li><Link href="/help/roles" className="link">Team roles</Link></li>
            </ul>
          </Card>
        </aside>
      </div>
    </>
  );
}
