import Link from "next/link";
import { BarChart3, MessageCircle, ShieldCheck, Users } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonClass } from "@/components/ui/button";

const FEATURES = [
  { Icon: BarChart3, title: "Spend you can trust", body: "Ad spend, leads and cost per lead that match Ads Manager, per project." },
  { Icon: MessageCircle, title: "Instant WhatsApp follow-up", body: "New leads get a reply in seconds, are qualified with buttons and scored." },
  { Icon: Users, title: "Built for teams", body: "Assign leads to agents, track the pipeline, give clients a read-only view." },
  { Icon: ShieldCheck, title: "Private by design", body: "Every company's data is isolated at the database level. Roles decide the rest." },
];

export default function Home() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <span className="flex items-center gap-2 font-semibold">
          <Logo /> {BRAND.name}
        </span>
        <nav className="flex items-center gap-2">
          <ThemeToggle className="hidden sm:inline-flex" />
          <Link href="/login" className={buttonClass("ghost", "sm")}>
            Sign in
          </Link>
          <Link href="/signup" className={buttonClass("primary", "sm")}>
            Start free trial
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6">
        <section className="py-16 sm:py-24">
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Know which ads bring buyers, and follow up before your competitor does.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-fg-muted">{BRAND.tagline}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className={buttonClass("primary", "md")}>
              Start free trial
            </Link>
            <Link href="/login" className={buttonClass("secondary", "md")}>
              Sign in
            </Link>
          </div>
        </section>

        <section className="grid gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ Icon, title, body }) => (
            <div key={title} className="rounded-lg border border-border bg-surface p-5">
              <Icon className="size-5 text-fg" aria-hidden />
              <h2 className="mt-3 font-medium">{title}</h2>
              <p className="mt-1 text-sm text-fg-muted">{body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-fg-subtle">
        © {new Date().getFullYear()} {BRAND.name}
      </footer>
    </div>
  );
}
