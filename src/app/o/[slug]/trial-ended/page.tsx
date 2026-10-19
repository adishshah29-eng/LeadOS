import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Check, Download } from "lucide-react";
import { atLeast, requireOrg, trialLapsed } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { BRAND, LEGAL } from "@/lib/brand";
import { PLANS } from "@/lib/plans";
import { formatINR, formatNum } from "@/lib/utils";
import { Card, PageHeader } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";

export const metadata: Metadata = { title: "Trial ended", robots: { index: false } };

/**
 * Where every page of a workspace sends people once its trial lapses
 * (see requireOrg). Leads keep arriving in the background, so the page says
 * how many are waiting.
 */
export default async function TrialEndedPage({ params }: PageProps<"/o/[slug]/trial-ended">) {
  const { slug } = await params;
  const ctx = await requireOrg(slug, { allowLapsed: true });
  if (!trialLapsed(ctx.org)) redirect(`/o/${ctx.org.slug}`);

  const supabase = await createClient();
  const { count } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("org_id", ctx.org.id)
    .gte("lead_created_at", ctx.org.trial_ends_at);
  const waiting = count ?? 0;
  const canPay = atLeast(ctx.role, "admin");
  const subject = encodeURIComponent(`Upgrade ${ctx.org.name} (${ctx.org.slug})`);

  return (
    <>
      <PageHeader
        title="Your free trial has ended"
        description={
          waiting
            ? `${formatNum(waiting)} new lead${waiting === 1 ? " has" : "s have"} come in since then. They're safe, and ready the moment you pick a plan.`
            : "Your data is safe and leads are still being collected. Pick a plan to open the workspace again."
        }
      />

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        {PLANS.map((p) => (
          <Card key={p.id} className="flex flex-col p-5">
            <h2 className="font-medium">{p.name}</h2>
            <p className="mt-2">
              <span className="tabular text-2xl font-semibold">{formatINR(p.priceInr)}</span>
              <span className="text-sm text-fg-muted"> / month + GST</span>
            </p>
            <ul className="mt-3 flex-1 space-y-1.5 text-sm text-fg-muted">
              {p.points.map((t) => (
                <li key={t} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-fg" aria-hidden /> {t}</li>
              ))}
            </ul>
            {canPay ? (
              <a href={`mailto:${LEGAL.email}?subject=${subject}%20to%20${p.name}`} className={buttonClass(p.id === "growth" ? "primary" : "secondary", "sm", "mt-4 self-start")}>
                Choose {p.name}
              </a>
            ) : null}
          </Card>
        ))}
      </div>

      <Card className="p-5 text-sm text-fg-muted">
        {canPay ? (
          <>
            <p>
              Online payment is coming soon. Until then, choose a plan above and the {BRAND.name}{" "}team will set it up for you, usually the same day.
            </p>
            <a href={`/o/${ctx.org.slug}/leads/export`} className={buttonClass("ghost", "sm", "mt-3")} download>
              <Download className="size-4" aria-hidden /> Download all leads (CSV)
            </a>
          </>
        ) : (
          <p>Ask your workspace owner to pick a plan. Nothing is lost in the meantime.</p>
        )}
      </Card>
    </>
  );
}
