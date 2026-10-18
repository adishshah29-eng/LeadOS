import { NextResponse, type NextRequest } from "next/server";
import { atLeast, requireOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cleanSearch, LEAD_STATUSES, STATUS_META, type LeadStatus } from "@/lib/leads";
import { csvRow } from "@/lib/csv";

/**
 * GET /o/[slug]/leads/export — CSV of the leads matching the current filters.
 * Admins and owners only (contact details in bulk), runs as the user so RLS
 * applies, capped at 20,000 rows, and recorded in the activity log.
 */
const MAX_ROWS = 20_000;
const PAGE = 1000;

export async function GET(req: NextRequest, { params }: RouteContext<"/o/[slug]/leads/export">) {
  const { slug } = await params;
  const ctx = await requireOrg(slug);
  if (!atLeast(ctx.role, "admin")) return new NextResponse("Only owners and admins can export leads.", { status: 403 });

  const sp = req.nextUrl.searchParams;
  const status = LEAD_STATUSES.includes(sp.get("status") as LeadStatus) ? (sp.get("status") as LeadStatus) : undefined;
  const project = /^[0-9a-f-]{36}$/i.test(sp.get("project") ?? "") ? sp.get("project")! : undefined;
  const q = cleanSearch(sp.get("q") ?? undefined);

  const supabase = await createClient();
  const rows: string[] = [
    csvRow(["Name", "Phone", "Email", "Status", "Score", "Project", "Assigned to", "Source", "Campaign", "Ad", "Received (IST)"]),
  ];

  const { data: members } = await supabase.from("memberships").select("user_id, profiles(full_name, email)").eq("org_id", ctx.org.id);
  const names = new Map(
    (members ?? []).map((m) => {
      const p = m.profiles as unknown as { full_name: string | null; email: string | null } | null;
      return [m.user_id as string, p?.full_name || p?.email || ""];
    }),
  );

  let count = 0;
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    let query = supabase
      .from("leads")
      .select("name, phone_e164, email, status, score, source, campaign_name, ad_name, assigned_to, lead_created_at, projects(name)")
      .eq("org_id", ctx.org.id)
      .order("lead_created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + PAGE - 1);
    if (status) query = query.eq("status", status);
    if (project) query = query.eq("project_id", project);
    if (q) query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,phone_e164.ilike.%${q.replace(/\s/g, "")}%`);
    const { data, error } = await query;
    if (error) return new NextResponse("Export failed. Try again.", { status: 500 });
    for (const l of data ?? []) {
      rows.push(
        csvRow([
          l.name,
          l.phone_e164,
          l.email,
          STATUS_META[l.status as LeadStatus]?.label ?? l.status,
          l.score,
          (l.projects as unknown as { name: string } | null)?.name,
          l.assigned_to ? names.get(l.assigned_to) : "",
          l.source === "meta" ? "Meta form" : "Manual",
          l.campaign_name,
          l.ad_name,
          new Date(l.lead_created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
        ]),
      );
    }
    count += data?.length ?? 0;
    if ((data?.length ?? 0) < PAGE) break;
  }

  await supabase.rpc("write_audit", {
    p_org: ctx.org.id,
    p_action: "leads.exported",
    p_target: `${count} leads`,
    p_meta: { status: status ?? null, project: project ?? null, search: q || null },
  });

  const day = new Date().toISOString().slice(0, 10);
  // The BOM makes Excel open the file as UTF-8 (₹ and Indian names stay intact).
  return new NextResponse("﻿" + rows.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${ctx.org.slug}-${day}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
