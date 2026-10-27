import type { Post } from "@/lib/blog";

export const post: Post = {
  slug: "whatsapp-business-api-real-estate-india",
  title: "WhatsApp Business API vs App for Real Estate in India",
  description: "The free WhatsApp Business app vs the WhatsApp Business Platform for property sales teams: team access, templates, automation and costs.",
  category: "whatsapp-marketing",
  author: { name: "Adish Shah", role: "Founder" },
  publishedOn: "2026-10-24",
  updatedOn: "2026-10-27",
  blocks: [
    { kind: "h2", id: "the-app-limitations", text: "Where the free app runs out" },
    {
      kind: "p",
      text: "Many brokerages start with the free WhatsApp Business app on a sales phone. It works well for one person. It gets harder once ads bring in many enquiries a day: the number lives on one phone and a few linked devices, chats stay on whoever's device answered them, and a manager can't easily see who replied to whom.",
    },
    {
      kind: "table",
      caption: "WhatsApp Business app vs WhatsApp Business Platform",
      head: ["Feature", "WhatsApp Business app", "WhatsApp Business Platform"],
      rows: [
        ["How your team uses it", "One phone plus a few linked devices", "Through software connected to the platform, so a whole team can share one number"],
        ["Starting a conversation", "Message anyone who has your number saved or messages you", "Outside a customer's open 24-hour window, only with Meta-approved message templates"],
        ["Automation", "Greeting, away messages and quick replies", "Whatever the connected software does, such as replying to new leads automatically"],
        ["Cost", "Free app", "Meta charges per delivered message, by message type and country"],
      ],
    },
    {
      kind: "p",
      text: "The platform's rules on templates and the 24-hour customer service window come from Meta's pricing documentation [1].",
    },
    { kind: "h2", id: "multi-agent-shared-inbox", text: "One project number, one shared inbox" },
    {
      kind: "p",
      text: "With the platform, you can show one verified number on all your ads and brochures, and handle the chats in one shared inbox. When an agent leaves, the conversation history stays with the company instead of on a personal phone.",
    },
    { kind: "h2", id: "meta-templates-and-pricing", text: "How Meta charges (as of October 2026)" },
    {
      kind: "list",
      items: [
        "Since 1 July 2025, Meta charges per delivered message, not per conversation [1].",
        "Template messages fall into marketing, utility and authentication; replies inside an open customer service window are service messages [1].",
        "When someone messages you from a click-to-WhatsApp ad, your first reply opens a free entry point window that can stay open for up to 7 days [1].",
        "From 1 October 2026, service messages are charged after a free allowance of 1,000 a month per business number [1].",
      ],
    },
    {
      kind: "callout",
      tone: "note",
      text: "Meta changes these rules and rates often. Check the current pricing page before you plan a campaign budget.",
    },
    { kind: "cta", text: "LeadOS runs on the WhatsApp Business Platform and greets every Meta lead automatically. Try it free for 14 days." },
  ],
  sources: [
    { label: "Meta for Developers: WhatsApp Business Platform pricing", url: "https://developers.facebook.com/docs/whatsapp/pricing" },
  ],
  related: ["whatsapp-real-estate-lead-follow-up-india", "leados-vs-spreadsheets-and-whatsapp"],
};
