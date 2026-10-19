import Link from "next/link";
import { BRAND, LEGAL_LINKS } from "@/lib/brand";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

/** Header and footer for public reading pages: help center and legal. */
export function SiteShell({ children, width = "max-w-3xl" }: { children: React.ReactNode; width?: string }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className={`mx-auto flex w-full ${width} items-center justify-between gap-3 px-4 py-4 sm:px-6`}>
          <Link href="/" className="flex items-center gap-2 font-semibold" aria-label={`${BRAND.name} home`}>
            <Logo /> {BRAND.name}
          </Link>
          <div className="flex items-center gap-1">
            <Link href="/help" className="rounded-md px-3 py-2 text-sm font-medium text-fg-muted hover:bg-surface-2 hover:text-fg">Help</Link>
            <Link href="/app" className="rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap text-fg-muted hover:bg-surface-2 hover:text-fg">Open app</Link>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className={`mx-auto w-full ${width} flex-1 px-4 py-10 sm:px-6`}>{children}</main>
      <footer className="border-t border-border">
        <nav aria-label="Legal" className={`mx-auto flex w-full ${width} flex-wrap gap-x-5 gap-y-2 px-4 py-6 text-sm text-fg-muted sm:px-6`}>
          <Link href="/help" className="hover:text-fg hover:underline">Help center</Link>
          {LEGAL_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-fg hover:underline">{l.label}</Link>
          ))}
        </nav>
      </footer>
    </div>
  );
}
