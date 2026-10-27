import { SiteShell } from "@/components/site-shell";

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell width="max-w-4xl">{children}</SiteShell>;
}
