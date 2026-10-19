import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
import { BRAND, LEGAL } from "@/lib/brand";
import { FAQ, GUIDES } from "@/lib/guides";
import { Card } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";

export const metadata: Metadata = { title: "Help center", description: `Guides for setting up and using ${BRAND.name}.` };

export default function HelpIndex() {
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Help center</h1>
      <p className="mt-2 text-fg-muted">Step-by-step guides for getting {BRAND.name} running, and answers to common questions.</p>

      <h2 className="mt-10 mb-3 text-lg font-semibold">Guides</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {GUIDES.map((g) => (
          <li key={g.slug}>
            <Link href={`/help/${g.slug}`} className="block h-full rounded-lg border border-border bg-surface p-5 hover:border-border-strong hover:bg-surface-2">
              <span className="flex items-center justify-between gap-2 font-medium">
                {g.title} <ArrowRight className="size-4 shrink-0 text-fg-subtle" aria-hidden />
              </span>
              <span className="mt-1 block text-sm text-fg-muted">{g.summary}</span>
              <span className="mt-3 flex items-center gap-1 text-xs text-fg-subtle">
                <Clock className="size-3.5" aria-hidden /> {g.minutes} min
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <h2 className="mt-12 mb-3 text-lg font-semibold">Common questions</h2>
      <div className="divide-y divide-border rounded-lg border border-border bg-surface">
        {FAQ.map((f) => (
          <details key={f.q} className="group px-5 py-4">
            <summary className="cursor-pointer list-none font-medium marker:hidden [&::-webkit-details-marker]:hidden">
              <span className="flex items-center justify-between gap-3">
                {f.q}
                <span aria-hidden className="text-fg-subtle transition-transform group-open:rotate-45">+</span>
              </span>
            </summary>
            <p className="mt-2 text-sm text-fg-muted">{f.a}</p>
          </details>
        ))}
      </div>

      <Card className="mt-12 p-5">
        <h2 className="font-medium">Still stuck?</h2>
        <p className="mt-1 text-sm text-fg-muted">Write to us and a person will reply, usually within a working day. We can also set things up with you on a short call.</p>
        <a href={`mailto:${LEGAL.email}?subject=${encodeURIComponent(`${BRAND.name} help`)}`} className={buttonClass("secondary", "sm", "mt-4")}>
          Contact support
        </a>
      </Card>
    </>
  );
}
