import { SiteShell } from "@/components/site-shell";

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell>{children}</SiteShell>;
}
