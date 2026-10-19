import Link from "next/link";
import { BRAND, LEGAL, LEGAL_LINKS } from "@/lib/brand";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold" aria-label={`${BRAND.name} home`}>
            <Logo /> {BRAND.name}
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <article className="legal">{children}</article>
        <p className="mt-10 text-sm text-fg-subtle">Last updated {LEGAL.updated}.</p>
      </main>
      <footer className="border-t border-border">
        <nav aria-label="Legal" className="mx-auto flex w-full max-w-3xl flex-wrap gap-x-5 gap-y-2 px-4 py-6 text-sm text-fg-muted sm:px-6">
          {LEGAL_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-fg hover:underline">{l.label}</Link>
          ))}
        </nav>
      </footer>
    </div>
  );
}
