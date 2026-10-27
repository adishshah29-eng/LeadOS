import type { Post } from "@/lib/blog";

// Draft until a lawyer has reviewed the first named-competitor comparison
// (docs/LAUNCH-CHECKLIST.md). Every "them" claim was checked on Zoho's own pages.
export const post: Post = {
  slug: "leados-vs-zoho-crm-real-estate",
  title: "LeadOS vs Zoho CRM for Indian Real Estate Teams",
  description: "How LeadOS and Zoho CRM compare for Indian property teams: WhatsApp, Meta lead ads, access control, and who each one suits.",
  category: "comparisons",
  author: { name: "Adish Shah", role: "Founder" },
  publishedOn: "2026-10-23",
  updatedOn: "2026-10-27",
  draft: true,
  comparison: {
    competitor: "Zoho CRM",
    website: "https://www.zoho.com/crm/",
    checkedOn: "2026-10-27",
    rows: [
      {
        feature: "WhatsApp",
        us: "Built in: greets each new Meta lead on WhatsApp and asks your qualifying questions",
        them: "WhatsApp Business integration in the trial and all paid editions, set up under Business Messaging",
        source: {
          label: "Zoho CRM Help: WhatsApp for Business integration",
          url: "https://help.zoho.com/portal/en/kb/crm/connect-with-customers/business-messaging/articles/business-messaging-using-whatsapp-for-business-integration-with-zoho-crm",
        },
      },
      {
        feature: "Meta lead ads",
        us: "Connects to Meta directly; leads arrive through Meta's lead webhook",
        them: "Through Zoho Social's Lead Ads feature (Premium, Agency and Agency Plus plans), which pushes leads into Zoho CRM",
        source: {
          label: "Zoho Social Help: set up Facebook Lead Generation",
          url: "https://help.zoho.com/portal/en/kb/social/faqs/integrations/articles/how-do-i-set-up-facebook-lead-generation-on-zoho-social",
        },
      },
      {
        feature: "Who sees which leads",
        us: "On every plan: agents see only leads assigned to them, managers their projects; only owners and admins export",
        them: "Territory management (by product line, geography or vertical) on the Enterprise and Ultimate editions",
        source: {
          label: "Zoho CRM pricing and editions",
          url: "https://www.zoho.com/crm/zohocrm-pricing.html",
        },
      },
    ],
    bestFor: {
      us: "Indian real estate teams whose leads come mainly from Meta ads and who want WhatsApp qualification working on day one.",
      them: "Businesses that want a highly customisable CRM across many departments, and possibly the wider Zoho suite.",
    },
  },
  blocks: [
    { kind: "h2", id: "general-vs-focused", text: "A general CRM or a focused lead tool" },
    {
      kind: "p",
      text: "Zoho CRM is a general-purpose CRM that you shape to your business with custom fields, layouts and workflows. LeadOS comes set up for real estate: its WhatsApp questions cover configuration, budget, purpose and timeline out of the box, and you can edit them.",
    },
    { kind: "h2", id: "whatsapp-and-meta", text: "WhatsApp and Meta lead ads" },
    {
      kind: "p",
      text: "Both work with WhatsApp. Zoho connects its WhatsApp integration in every paid edition, and brings Meta lead ads in through Zoho Social. LeadOS connects to Meta directly and starts a WhatsApp conversation with each new lead as it arrives.",
    },
    { kind: "h2", id: "access", text: "Keeping leads with the right people" },
    {
      kind: "p",
      text: "Real estate teams often work with channel partners and junior agents. In LeadOS, agents only see leads assigned to them and only owners and admins can export. In Zoho CRM, territory-based access is part of the Enterprise and Ultimate editions.",
    },
    { kind: "cta", text: "See whether LeadOS fits your team: try it free for 14 days." },
  ],
  related: ["leados-vs-hubspot-real-estate-india", "speed-to-lead-real-estate"],
};
