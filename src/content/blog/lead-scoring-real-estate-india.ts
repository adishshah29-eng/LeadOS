import type { Post } from "@/lib/blog";

export const post: Post = {
  slug: "lead-scoring-real-estate-india",
  title: "Lead Scoring for Indian Real Estate: A Practical Framework",
  description: "How Indian property developers score inbound leads into Hot, Warm, and Cold. Boost site visits and ensure top agents focus on genuine buyers.",
  category: "lead-management",
  author: { name: "Adish Shah", role: "Founder" },
  publishedOn: "2026-10-24",
  blocks: [
    {
      kind: "h2",
      id: "why-scoring-matters",
      text: "The lead triage problem on high-volume property launches",
    },
    {
      kind: "p",
      text: "During a new residential project launch or festive promotional drive, an ad campaign might generate 200 to 500 leads in a single weekend. Without an objective scoring system, sales teams dial numbers alphabetically or in order of entry, often reaching casual window-shoppers while genuine buyers with approved home loans wait hours for a callback.",
    },
    {
      kind: "p",
      text: "Lead scoring categorizes every contact into Hot, Warm, or Cold based on demographic fit, financial readiness, and behavioral engagement.",
    },
    {
      kind: "h2",
      id: "the-scoring-matrix",
      text: "The 3-pillar scoring matrix for Indian homebuyers",
    },
    {
      kind: "list",
      ordered: false,
      items: [
        "Financial readiness: Prospect confirms budget matches the project pricing and has either pre-approved home loan status or liquid down payment ready.",
        "Possession timeline: Buyer needs immediate possession within 3 to 6 months for personal use, compared to speculative investors browsing 4 years out.",
        "Engagement velocity: Lead responds to the initial automated WhatsApp inquiry within 5 minutes and chooses a preferred site visit slot.",
      ],
    },
    {
      kind: "h2",
      id: "routing-to-top-closers",
      text: "Routing hot leads directly to your top closers",
    },
    {
      kind: "p",
      text: "Once a lead is scored Hot through conversational qualification, they should bypass the generic telecalling pool and connect directly to a senior sales manager or site specialist via an instant phone transfer or WhatsApp VIP notification.",
    },
    {
      kind: "p",
      text: "Cold leads are not discarded; instead, they are entered into an automated WhatsApp nurture sequence that shares construction updates, sample flat walkthrough videos, and festive payment schemes over the following 60 days.",
    },
    {
      kind: "cta",
      text: "Automate your lead scoring and route high-intent buyers in seconds. Start with LeadOS free.",
    },
  ],
  sources: [
    {
      label: "PropTiger Indian Real Estate Research Reports",
      url: "https://www.proptiger.com/guide",
    },
    {
      label: "Harvard Business Review The Short Life of Online Sales Leads",
      url: "https://hbr.org/2011/03/the-short-life-of-online-sales-leads",
    },
  ],
  related: ["speed-to-lead-real-estate", "cost-per-lead-meta-ads-real-estate-india"],
};
