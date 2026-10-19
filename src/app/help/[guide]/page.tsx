import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock } from "lucide-react";
import { BRAND, LEGAL } from "@/lib/brand";
import { GUIDES, guideBySlug } from "@/lib/guides";

export function generateStaticParams() {
  return GUIDES.map((g) => ({ guide: g.slug }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps<"/help/[guide]">): Promise<Metadata> {
  const g = guideBySlug((await params).guide);
  return g ? { title: g.title, description: g.summary } : {};
}

export default async function GuidePage({ params }: PageProps<"/help/[guide]">) {
  const g = guideBySlug((await params).guide);
  if (!g) notFound();
  const others = GUIDES.filter((o) => o.slug !== g.slug);

  return (
    <>
      <Link href="/help" className="mb-6 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden /> Help center
      </Link>
      <article className="legal">
        <h1>{g.title}</h1>
        <p className="flex items-center gap-1.5 text-sm">
          <Clock className="size-4" aria-hidden /> About {g.minutes} minutes
        </p>
        <p>{g.summary}</p>
        {g.sections.map((s) => (
          <section key={s.heading}>
            <h2>{s.heading}</h2>
            {s.body ? <p>{s.body}</p> : null}
            {s.steps ? (
              <ol>
                {s.steps.map((t) => <li key={t}>{t}</li>)}
              </ol>
            ) : null}
            {s.items ? (
              <ul>
                {s.items.map((t) => <li key={t}>{t}</li>)}
              </ul>
            ) : null}
            {s.sample ? (
              <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-surface-2 p-4 font-mono text-sm whitespace-pre-wrap text-fg">{s.sample}</pre>
            ) : null}
          </section>
        ))}
      </article>

      <div className="mt-12 rounded-lg border border-border bg-surface p-5 text-sm">
        <p className="font-medium">Need a hand?</p>
        <p className="mt-1 text-fg-muted">
          Email{" "}
          <a className="link" href={`mailto:${LEGAL.email}?subject=${encodeURIComponent(`${BRAND.name}: ${g.title}`)}`}>{LEGAL.email}</a>
          {" "}and we&apos;ll set it up with you.
        </p>
      </div>

      <h2 className="mt-10 mb-3 font-semibold">More guides</h2>
      <ul className="space-y-1.5 text-sm">
        {others.map((o) => (
          <li key={o.slug}><Link href={`/help/${o.slug}`} className="link">{o.title}</Link></li>
        ))}
      </ul>
    </>
  );
}
