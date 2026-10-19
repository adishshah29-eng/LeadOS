import { LEGAL } from "@/lib/brand";
import { SiteShell } from "@/components/site-shell";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <SiteShell>
      <article className="legal">{children}</article>
      <p className="mt-10 text-sm text-fg-subtle">Last updated {LEGAL.updated}.</p>
    </SiteShell>
  );
}
