import Link from "next/link";
import { BookOpen, Compass, LifeBuoy, LogOut, Shield } from "lucide-react";
import { BRAND, LEGAL } from "@/lib/brand";
import { ProductTour, TourButton, type TourStep } from "@/components/product-tour";
import { atLeast, isPlatformAdmin, listMyOrgs, requireOrg, trialDaysLeft } from "@/lib/auth";
import { MobileNav, SideNav, type NavItem } from "@/components/app-nav";
import { OrgSwitcher } from "@/components/org-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui/badge";

export default async function OrgLayout({ children, params }: LayoutProps<"/o/[slug]">) {
  const { slug } = await params;
  const [ctx, orgs, platformRole] = await Promise.all([requireOrg(slug, { allowLapsed: true }), listMyOrgs(), isPlatformAdmin()]);
  const base = `/o/${ctx.org.slug}`;

  const isAdminNav = atLeast(ctx.role, "admin");
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
    ...(isAdminNav
      ? [
          { key: "team" as const, label: "Team", href: `${base}/team` },
          { key: "settings" as const, label: "Settings", href: `${base}/settings` },
        ]
      : []),
  ];

  const trialDays = trialDaysLeft(ctx.org);
  const switcher = <OrgSwitcher current={ctx.org.slug} orgs={orgs} />;
  const isAdmin = atLeast(ctx.role, "admin");
  const tour: TourStep[] = [
    { title: `Welcome to ${BRAND.name}`, body: "A 30-second look around. Use the arrow keys or Next; Esc closes it any time." },
    { target: "overview", title: "Overview", body: "Spend, leads and cost per lead across your projects. Change the date range or pick one project at the top." },
    ...(ctx.role !== "viewer"
      ? [
          { target: "leads", title: "Leads", body: "Every enquiry from your lead forms, the moment it arrives. Assign it, update its status, add notes, or download a list." },
          { target: "conversations", title: "WhatsApp", body: "Chats the assistant is having with your leads. The ones that need a person are at the top; pause the bot and reply yourself." },
        ]
      : []),
    { target: "projects", title: "Projects", body: "One per property, launch or client. Ad accounts and leads are grouped by project, and access can be limited per project." },
    ...(isAdmin
      ? [
          { target: "team", title: "Team", body: "Invite agents, managers and clients. Each sees only what their role allows." },
          { target: "settings", title: "Settings", body: "Connect Meta and WhatsApp, share read-only reports with clients, and see the activity log." },
        ]
      : []),
    { target: "help", title: "Help is always here", body: isAdmin ? "Guides, this tour and support are always in the menu. Next, follow the setup steps to connect your ads." : "Guides, this tour and support are always in the menu." },
  ];
  const helpCls = "flex w-full cursor-pointer items-center gap-2 text-sm text-fg-muted hover:text-fg";
  const footer = (
    <div className="space-y-3 border-t border-border pt-3">
      <div className="space-y-2" data-tour="help">
        {isAdmin ? (
          <Link href={`${base}/setup`} className={helpCls}>
            <Compass className="size-4" aria-hidden /> Setup guide
          </Link>
        ) : null}
        <Link href="/help" className={helpCls}>
          <BookOpen className="size-4" aria-hidden /> Help &amp; guides
        </Link>
        <TourButton className={helpCls}>
          <Compass className="size-4" aria-hidden /> Take the tour
        </TourButton>
        <a href={`mailto:${LEGAL.email}?subject=${encodeURIComponent(`Help with ${ctx.org.name}`)}`} className={helpCls}>
          <LifeBuoy className="size-4" aria-hidden /> Contact support
        </a>
      </div>
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
        <ProductTour steps={tour} autoStart />
      </div>
    </div>
  );
}
