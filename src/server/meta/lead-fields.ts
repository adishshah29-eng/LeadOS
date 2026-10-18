import { toE164 } from "@/lib/leads";
import type { MetaLead } from "./graph";

/**
 * Meta lead forms name their fields however the advertiser built the form
 * ("full_name", "phone_number", custom questions…). Pick the standard ones.
 */
function first(fields: Record<string, string>, keys: string[]) {
  for (const k of Object.keys(fields)) {
    if (keys.includes(k.toLowerCase())) return fields[k]?.trim() || "";
  }
  return "";
}

export function leadRow(lead: MetaLead, extra: { project_id?: string | null; page_id?: string | null }) {
  const f = lead.field_data;
  const name =
    first(f, ["full_name", "name", "full name"]) ||
    [first(f, ["first_name"]), first(f, ["last_name"])].filter(Boolean).join(" ");
  const phone = toE164(first(f, ["phone_number", "phone", "mobile", "mobile_number", "whatsapp_number"]));
  const email = first(f, ["email", "email_address"]);
  return {
    meta_lead_id: lead.id,
    name: name.slice(0, 200) || null,
    phone_e164: phone,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.toLowerCase() : null,
    ad_id: lead.ad_id || null,
    ad_name: lead.ad_name || null,
    form_id: lead.form_id || null,
    campaign_name: lead.campaign_name || null,
    field_data: f,
    created_time: lead.created_time,
    project_id: extra.project_id ?? null,
    page_id: extra.page_id ?? null,
  };
}
