import type { Post } from "@/lib/blog";

export const post: Post = {
  slug: "meta-lead-ads-real-estate-setup",
  title: "How to Set Up Meta Lead Ads for Real Estate in India",
  description: "Set up Facebook and Instagram lead forms for property campaigns: form type, the questions to ask, and getting leads to your team quickly.",
  category: "real-estate-marketing",
  author: { name: "Adish Shah", role: "Founder" },
  publishedOn: "2026-10-24",
  updatedOn: "2026-10-27",
  blocks: [
    { kind: "h2", id: "instant-forms-vs-landing-pages", text: "Instant forms or a landing page?" },
    {
      kind: "p",
      text: "Meta instant forms open inside Facebook and Instagram, with the person's name and phone number filled in from their profile. That makes them quick to submit on a phone, with no website to load. The same convenience means people can submit by accident, so the form settings matter.",
    },
    { kind: "h2", id: "more-volume-vs-higher-intent", text: "Choose Higher Intent over More Volume" },
    {
      kind: "p",
      text: "When you create the form, the Higher Intent type adds a step where people review and confirm their answers before submitting [1]. You will usually get fewer leads, but more of them will be real. Judge it on cost per site visit, not cost per lead.",
    },
    { kind: "h2", id: "essential-custom-questions", text: "Three questions every property form should ask" },
    {
      kind: "list",
      ordered: true,
      items: [
        "Configuration: multiple choice, matching the unit types you actually have (for example 2 BHK, 3 BHK).",
        "Budget: multiple-choice price bands that match your project's real price range. Avoid open text boxes.",
        "Timeline: when they plan to buy or move in, as multiple choice (for example ready to move, within 6 months, later).",
      ],
    },
    {
      kind: "callout",
      tone: "tip",
      text: "Keep it to two or three questions. Every extra question lowers the number of people who finish the form.",
    },
    { kind: "h2", id: "instant-crm-sync", text: "Don't leave leads sitting in Ads Manager" },
    {
      kind: "p",
      text: "Downloading leads once a day means some buyers wait hours for a reply. Connect your lead forms to your CRM through Meta's lead webhook, so each lead reaches your team as soon as it is submitted.",
    },
    { kind: "cta", text: "Connect your Meta lead forms to LeadOS in about 10 minutes with our step-by-step guide. Try it free for 14 days." },
  ],
  sources: [
    { label: "Meta for Developers: lead ads forms and questions", url: "https://developers.facebook.com/docs/marketing-api/guides/lead-ads/forms-questions" },
  ],
  related: ["cost-per-lead-meta-ads-real-estate-india", "speed-to-lead-real-estate"],
};
