import Link from "next/link";
import { ArrowRight, Check, Lock } from "lucide-react";
import { BRAND, LEGAL_LINKS } from "@/lib/brand";
import { FAQ } from "@/lib/guides";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Meter } from "@/components/landing/meter";
import { display } from "./fonts";

/*
 * Landing page. World: Mumbai's kaali-peeli taxi. The yellow owns the first
 * viewport, the black is the meter, and the meter is the product: money
 * ticking while ads run, and what it bought. Every claim here is something
 * the app does today; the demo is labelled as example data.
 */

const CATCHES = [
  { figure: "₹8,120", line: "spent on an ad that brought zero leads.", note: "Flagged Wasting, so you pause it this morning, not next month." },
  { figure: "½ the cost", line: "per lead on your best campaign.", note: "Flagged Best, so you know where the next rupee should go." },
  { figure: "6 leads", line: "nobody has called yet.", note: "Each lead has an owner, a status and a timeline. Nothing slips." },
];

const STEPS = [
  { title: "Connect Meta", body: "About ten minutes with our step-by-step guide, or free on a call with us. Your access is stored encrypted." },
  { title: "Link ad accounts to projects", body: "One project per building, launch or client. Spend and leads roll up per project." },
  { title: "Open the overview every morning", body: "What's wasting, what's working, and which new leads to call, in one screen." },
];

const ROLES = [
  { role: "Owner & Admin", sees: "Everything: all projects, team, the Meta connection and the activity log" },
  { role: "Manager", sees: "Dashboards and leads for the projects you give them. Can assign leads" },
  { role: "Agent", sees: "Only the leads assigned to them: call, WhatsApp, notes, status" },
  { role: "Client", sees: "A read-only dashboard for their project. No phone numbers" },
];

export default async function Home({ searchParams }: PageProps<"/">) {
  const accountDeleted = (await searchParams).account === "deleted";
  return (
    <div className={`${display.variable} flex min-h-dvh flex-col`}>
      {/* ------------------------------------------------ first viewport */}
      <div className="bg-taxi text-ink">
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold" aria-label={`${BRAND.name} home`}>
            <Logo variant="taxi" /> {BRAND.name}
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
            <a href="#how" className="hidden rounded-md px-3 py-2 text-sm font-medium hover:bg-ink/10 md:inline-block">How it works</a>
            <a href="#team" className="hidden rounded-md px-3 py-2 text-sm font-medium hover:bg-ink/10 md:inline-block">For teams</a>
            <a href="#faq" className="hidden rounded-md px-3 py-2 text-sm font-medium hover:bg-ink/10 md:inline-block">FAQ</a>
            <Link href="/login" className="rounded-md px-3 py-2 text-sm font-medium hover:bg-ink/10">Sign in</Link>
            <Link href="/signup" className="rounded-md bg-ink px-3 py-2 text-sm font-semibold text-ink-fg hover:bg-ink/85">Start free trial</Link>
          </nav>
        </header>

        <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pt-8 pb-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:pt-14 lg:pb-20">
          <div>
            <h1 className="font-display text-[3.25rem] leading-[0.92] font-extrabold tracking-[-0.02em] text-balance [font-stretch:75%] sm:text-7xl lg:text-[5.5rem]">
              Your ads are running. So is the meter.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink/80">
              {BRAND.name} reads every rupee you spend on Meta ads, pulls in every lead from your forms, and tells you each
              morning which campaigns are wasting money. Built for real-estate teams and agencies in India.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/signup" className="inline-flex h-12 items-center gap-2 rounded-md bg-ink px-6 text-base font-semibold text-ink-fg hover:bg-ink/85">
                Start your 14-day trial <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link href="/login" className="inline-flex h-12 items-center rounded-md border-2 border-ink px-5 text-base font-semibold hover:bg-ink/10">
                Sign in
              </Link>
            </div>
            <p className="mt-4 text-sm text-ink/75">No card needed. Connect Meta in about two minutes.</p>
          </div>
          <Meter />
        </section>
      </div>

      {accountDeleted ? (
        <p role="status" className="bg-success-soft px-4 py-3 text-center text-sm text-success">
          Your account has been deleted. Thank you for trying {BRAND.name}.
        </p>
      ) : null}
      <main className="flex-1">
        {/* ---------------------------------------------- what it catches */}
        <section aria-labelledby="catch-title" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <h2 id="catch-title" className="font-display max-w-3xl text-4xl leading-[0.95] font-extrabold tracking-[-0.01em] [font-stretch:80%] sm:text-5xl">
            The things Ads Manager won&apos;t say out loud.
          </h2>
          <ul className="mt-10 divide-y divide-border border-y border-border">
            {CATCHES.map((c) => (
              <li key={c.figure} className="grid gap-2 py-6 sm:grid-cols-[minmax(11rem,auto)_1fr] sm:items-baseline sm:gap-8">
                <span className="font-display text-4xl font-extrabold tabular-nums [font-stretch:75%] sm:text-5xl">{c.figure}</span>
                <span>
                  <span className="block text-xl font-medium">{c.line}</span>
                  <span className="mt-1 block text-fg-muted">{c.note}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-fg-subtle">
            Examples. Spend is pulled the way Ads Manager counts it, deleted and archived ads included, so totals match to the rupee.
          </p>
        </section>

        {/* --------------------------------------------------- how it works */}
        <section id="how" aria-labelledby="how-title" className="scroll-mt-6 bg-ink text-ink-fg">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <h2 id="how-title" className="font-display text-4xl leading-[0.95] font-extrabold [font-stretch:80%] sm:text-5xl">
              Three stops to your first report.
            </h2>
            <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
              {STEPS.map((s, i) => (
                <li key={s.title} className="relative md:pt-14">
                  {/* The route between stops, like a taxi's path on a map (desktop). */}
                  {i < STEPS.length - 1 ? <span aria-hidden className="absolute top-5 left-12 hidden h-0.5 w-[calc(100%-1rem)] bg-taxi/40 md:block" /> : null}
                  <span className="flex size-10 items-center justify-center rounded-full bg-taxi font-display text-lg font-extrabold text-ink md:absolute md:top-0 md:left-0">
                    {i + 1}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold md:mt-0">{s.title}</h3>
                  <p className="mt-1.5 text-ink-fg/75">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ------------------------------------------------------- for teams */}
        <section id="team" aria-labelledby="team-title" className="mx-auto grid w-full max-w-6xl scroll-mt-6 gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <h2 id="team-title" className="font-display text-4xl leading-[0.95] font-extrabold [font-stretch:80%] sm:text-5xl">
              One account. Everyone sees just their part.
            </h2>
            <p className="mt-5 max-w-md text-fg-muted">
              Give your sales team their leads, your managers their projects, and your clients a dashboard, without
              sharing a single password or spreadsheet.
            </p>
            <p className="mt-6 flex max-w-md items-start gap-2 text-sm text-fg-muted">
              <Lock className="mt-0.5 size-4 shrink-0 text-fg" aria-hidden />
              Each company&apos;s data is walled off inside the database itself, not just hidden in the app. Every
              invite, role change and connection is logged.
            </p>
          </div>
          <table className="w-full self-start text-left">
            <caption className="sr-only">What each role can see</caption>
            <tbody className="divide-y divide-border border-y border-border">
              {ROLES.map((r) => (
                <tr key={r.role}>
                  <th scope="row" className="w-36 py-4 pr-4 align-top font-semibold">{r.role}</th>
                  <td className="py-4 text-fg-muted">{r.sees}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* --------------------------------------------------------- faq */}
        <section id="faq" aria-labelledby="faq-title" className="mx-auto w-full max-w-6xl scroll-mt-6 px-4 pb-16 sm:px-6 sm:pb-24">
          <h2 id="faq-title" className="font-display text-4xl leading-[0.95] font-extrabold [font-stretch:80%] sm:text-5xl">
            Questions, answered.
          </h2>
          <div className="mt-10 divide-y divide-border border-y border-border">
            {FAQ.map((f) => (
              <details key={f.q} className="group py-5">
                <summary className="cursor-pointer list-none text-lg font-semibold [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {f.q}
                    <span aria-hidden className="text-2xl leading-none text-fg-subtle transition-transform group-open:rotate-45 motion-reduce:transition-none">+</span>
                  </span>
                </summary>
                <p className="mt-2 max-w-3xl text-fg-muted">{f.a}</p>
              </details>
            ))}
          </div>
          <p className="mt-6 text-fg-muted">
            More in the <Link href="/help" className="link">help center</Link>.
          </p>
        </section>

        {/* ------------------------------------------------------- close */}
        <section aria-labelledby="cta-title" className="bg-taxi text-ink">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-16 sm:px-6 sm:py-20 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 id="cta-title" className="font-display max-w-2xl text-5xl leading-[0.92] font-extrabold [font-stretch:75%] sm:text-6xl">
                Start the meter on your own ads.
              </h2>
              <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium">
                {["14-day free trial", "No card needed", "Your data stays yours"].map((t) => (
                  <li key={t} className="flex items-center gap-1.5"><Check className="size-4" aria-hidden /> {t}</li>
                ))}
              </ul>
            </div>
            <Link href="/signup" className="inline-flex h-12 items-center gap-2 self-start rounded-md bg-ink px-6 text-base font-semibold text-ink-fg hover:bg-ink/85 lg:self-auto">
              Create your account <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-fg-subtle sm:px-6">
          <span className="flex items-center gap-2"><Logo className="size-5" /> © {new Date().getFullYear()} {BRAND.name}</span>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/help" className="hover:text-fg hover:underline">Help center</Link>
            {LEGAL_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-fg hover:underline">{l.label}</Link>
            ))}
          </nav>
          <ThemeToggle />
        </div>
      </footer>
    </div>
  );
}
