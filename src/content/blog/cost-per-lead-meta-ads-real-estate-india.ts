import type { Post } from "@/lib/blog";

export const post: Post = {
  slug: "cost-per-lead-meta-ads-real-estate-india",
  title: "Cost Per Lead on Meta Ads for Real Estate: Measure What Matters",
  description: "Why cost per lead misleads real estate marketers, and how to work out cost per qualified lead and cost per site visit from your own data.",
  category: "digital-marketing-india",
  author: { name: "Adish Shah", role: "Founder" },
  publishedOn: "2026-10-24",
  updatedOn: "2026-10-27",
  blocks: [
    { kind: "h2", id: "why-cpl-misleads", text: "Why cost per lead on its own misleads" },
    {
      kind: "p",
      text: "Cost per lead (CPL) is the number Ads Manager shows first, so it is the number teams chase. But a cheap lead who never answers the phone costs more than an expensive one who visits the site. Cost per lead varies a lot by city, project and season, so the most useful benchmark is your own history, measured further down the funnel.",
    },
    { kind: "h2", id: "measure-your-own", text: "Work out your own numbers" },
    {
      kind: "table",
      caption: "Metrics to track for each campaign",
      head: ["Metric", "How to calculate it", "Where the numbers come from"],
      rows: [
        ["Cost per lead", "Ad spend ÷ leads", "Ads Manager"],
        ["Cost per qualified lead", "Ad spend ÷ leads who confirmed budget and timeline", "Your CRM or WhatsApp qualification answers"],
        ["Cost per site visit", "Ad spend ÷ completed site visits", "Your sales team's visit records"],
        ["Cost per booking", "Ad spend ÷ bookings", "Your sales and accounts records"],
      ],
    },
    {
      kind: "p",
      text: "Compare campaigns on cost per qualified lead and cost per site visit, not on cost per lead. A campaign with a higher cost per lead often wins once you look further down.",
    },
    { kind: "h2", id: "add-friction", text: "Ask for intent in the form" },
    {
      kind: "p",
      text: "Meta's Higher Intent form type adds a step where people review and confirm their answers before they submit [1]. Adding one or two questions, such as budget band or when they plan to buy, also filters out casual taps. Expect fewer leads but better ones, and judge the change on cost per site visit.",
    },
    { kind: "h2", id: "reply-fast", text: "Reply before the lead goes cold" },
    {
      kind: "p",
      text: "Research in Harvard Business Review found that firms contacting leads within an hour were nearly 7× as likely to qualify them as firms that waited longer [2]. A fast WhatsApp reply also tells you quickly which leads are real, so your callers spend their time on people who answer.",
    },
    { kind: "cta", text: "LeadOS asks every Meta lead your qualifying questions on WhatsApp, so you can see cost per qualified lead. Try it free for 14 days." },
  ],
  sources: [
    { label: "Meta for Developers: lead ads forms and questions", url: "https://developers.facebook.com/docs/marketing-api/guides/lead-ads/forms-questions" },
    { label: "Harvard Business Review: The Short Life of Online Sales Leads (2011)", url: "https://hbr.org/2011/03/the-short-life-of-online-sales-leads" },
  ],
  related: ["meta-lead-ads-real-estate-setup", "speed-to-lead-real-estate"],
};
