import type { Post } from "@/lib/blog";

// Draft until a lawyer has reviewed the first named-competitor comparison
// (docs/LAUNCH-CHECKLIST.md). Every "them" claim was checked on HubSpot's own pages.
export const post: Post = {
  slug: "leados-vs-hubspot-real-estate-india",
  title: "LeadOS vs HubSpot for Indian Real Estate Teams",
  description: "How LeadOS and HubSpot compare for Indian property teams: WhatsApp, Meta lead ads sync, pricing basis, and who each one suits.",
  category: "comparisons",
  author: { name: "Adish Shah", role: "Founder" },
  publishedOn: "2026-10-24",
  updatedOn: "2026-10-27",
  draft: true,
  comparison: {
    competitor: "HubSpot",
    website: "https://www.hubspot.com",
    checkedOn: "2026-10-27",
    rows: [
      {
        feature: "WhatsApp",
        us: "Built in: greets each new Meta lead on WhatsApp and asks your qualifying questions",
        them: "Built-in WhatsApp integration for Marketing Hub and Service Hub Professional and Enterprise",
        source: {
          label: "HubSpot: WhatsApp integration announcement",
          url: "https://www.hubspot.com/company-news/hubspot-announces-general-availability-of-whatsapp-integration",
        },
      },
      {
        feature: "Meta lead ads sync",
        us: "Leads arrive through Meta's lead webhook as soon as Meta sends them",
        them: "Built-in Facebook lead ads sync; HubSpot says new leads can take up to two hours to arrive",
        source: {
          label: "HubSpot Knowledge Base: Facebook lead ads FAQ",
          url: "https://knowledge.hubspot.com/ads/facebook-lead-ads-faq",
        },
      },
      {
        feature: "How pricing grows",
        us: "Monthly plans per workspace, priced in rupees, with set limits on users and accounts",
        them: "Marketing Hub is billed by seats plus a marketing-contacts tier, which moves up automatically during a contract",
        source: {
          label: "HubSpot Knowledge Base: marketing contacts billing",
          url: "https://knowledge.hubspot.com/account/understand-marketing-contacts-billing",
        },
      },
      {
        feature: "Breadth",
        us: "Focused on Meta lead ads, WhatsApp qualification and follow-up for real estate",
        them: "A full marketing, sales and service platform with email, automation and reporting across many industries",
        source: {
          label: "HubSpot: Marketing Hub plans",
          url: "https://www.hubspot.com/pricing/marketing",
        },
      },
    ],
    bestFor: {
      us: "Indian real estate teams whose leads come mainly from Meta ads and who follow up mostly on WhatsApp.",
      them: "Businesses that want one platform for email marketing, sales and service, and have the budget and time to set it up.",
    },
  },
  blocks: [
    { kind: "h2", id: "two-different-tools", text: "Two different kinds of tool" },
    {
      kind: "p",
      text: "HubSpot is a broad customer platform used by businesses of every kind. LeadOS does one job: it takes leads from Meta lead ads, greets them on WhatsApp, asks your qualifying questions, and gives your team a clear list of who to call. The right choice depends on how much of HubSpot's breadth you will actually use.",
    },
    { kind: "h2", id: "whatsapp-and-meta", text: "WhatsApp and Meta lead ads" },
    {
      kind: "p",
      text: "Both connect to WhatsApp and to Facebook lead ads. The differences are in plan level and timing: HubSpot's WhatsApp integration is on its Professional and Enterprise plans, and its lead ads sync can take up to two hours for new leads. LeadOS receives leads through Meta's webhook as they are submitted and starts the WhatsApp conversation straight away.",
    },
    { kind: "h2", id: "pricing-basis", text: "How the price grows" },
    {
      kind: "p",
      text: "HubSpot's Marketing Hub counts marketing contacts as part of its price, so a large database of past enquiries can raise the bill. LeadOS plans are per workspace with fixed limits. Check both pricing pages with your own numbers before deciding.",
    },
    { kind: "cta", text: "See whether LeadOS fits your team: try it free for 14 days." },
  ],
  related: ["leados-vs-zoho-crm-real-estate", "speed-to-lead-real-estate"],
};
