import Link from "next/link";
import { LogOut, Shield } from "lucide-react";
import { atLeast, isPlatformAdmin, listMyOrgs, requireOrg } from "@/lib/auth";
import { MobileNav, SideNav, type NavItem } from "@/components/app-nav";
import { OrgSwitcher } from "@/components/org-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui/badge";

export default async function OrgLayout({ children, params }: LayoutProps<"/o/[slug]">) {
  const { slug } = await params;
  const [ctx, orgs, platformRole] = await Promise.all([requireOrg(slug), listMyOrgs(), isPlatformAdmin()]);
  const base = `/o/${ctx.org.slug}`;

  const items: NavItem[] = [
    { key: "overview", label: "Overview", href: base },
    // Viewers see dashboards only; lead PII is hidden from them by RLS anyway.
    ...(ctx.role !== "viewer"
      ? [
          { key: "leads" as const, label: "Leads", href: `${base}/leads` },
          { key: "conversations" as const, label: "WhatsApp", href: `${base}/conversations` },
        ]
      : []),
    { key: "projects", label: "Projects", href: `${base}/projects` },
    ...(atLeast(ctx.role, "admin")
      ? [
          { key: "team" as const, label: "Team", href: `${base}/team` },
          { key: "settings" as const, label: "Settings", href: `${base}/settings` },
        ]
      : []),
  ];

  // Rounded, not ceil'd: a few seconds of clock skew with the database must not show "15 days" on a 14-day trial.
  const trialDays = Math.max(0, Math.round((new Date(ctx.org.trial_ends_at).getTime() - Date.now()) / 86_400_000));
  const switcher = <OrgSwitcher current={ctx.org.slug} orgs={orgs} />;
  const footer = (
    <div className="space-y-3 border-t border-border pt-3">
      {platformRole ? (
        <Link href="/admin" className="flex items-center gap-2 text-sm text-fg-muted hover:text-fg">
          <Shield className="size-4" aria-hidden /> Platform admin
        </Link>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <Link href="/account" className="truncate text-xs text-fg-subtle hover:text-fg hover:underline" title={`${ctx.email}: your account`}>
          {ctx.email}
        </Link>
        <ThemeToggle />
      </div>
      <form action="/auth/signout" method="post">
        <button type="submit" className="flex cursor-pointer items-center gap-2 text-sm text-fg-muted hover:text-fg">
          <LogOut className="size-4" aria-hidden /> Sign out
        </button>
      </form>
    </div>
  );

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-4 border-r border-border bg-surface p-3 lg:flex">
        <Link href={base} className="flex items-center gap-2 px-1.5 pt-1 font-semibold">
          <Logo /> <span className="truncate">{ctx.org.name}</span>
        </Link>
        {switcher}
        <div className="flex-1">
          <SideNav items={items} />
        </div>
        {footer}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-surface/90 px-2 backdrop-blur lg:hidden">
          <MobileNav
            items={items}
            header={<span className="flex items-center gap-2 font-semibold"><Logo /> {ctx.org.name}</span>}
            footer={<div className="space-y-3">{switcher}{footer}</div>}
          />
          <span className="truncate font-semibold">{ctx.org.name}</span>
        </header>

        {ctx.org.plan === "trial" ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-2 text-sm sm:px-8">
            <Badge tone={trialDays <= 3 ? "warning" : "neutral"}>Trial</Badge>
            <span className="text-fg-muted">
              {trialDays > 0 ? `${trialDays} day${trialDays === 1 ? "" : "s"} left in your free trial.` : "Your trial has ended."}
            </span>
          </div>
        ) : null}

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
