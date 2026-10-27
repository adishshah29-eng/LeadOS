import type { Post } from "@/lib/blog";

export const post: Post = {
  slug: "whatsapp-real-estate-lead-follow-up-india",
  title: "WhatsApp Follow-Up for Indian Real Estate: Templates & Guide",
  description: "WhatsApp message examples for property developers and brokers, and how to follow up without getting reported or blocked.",
  category: "whatsapp-marketing",
  author: { name: "Adish Shah", role: "Founder" },
  publishedOn: "2026-10-24",
  updatedOn: "2026-10-27",
  blocks: [
    { kind: "h2", id: "why-whatsapp-rules", text: "Why WhatsApp is the main channel for property leads" },
    {
      kind: "p",
      text: "In 2021 the Government of India cited 53 crore WhatsApp users in the country [1]. Many buyers ignore calls from unknown numbers but will read a WhatsApp message about a project they just asked about.",
    },
    {
      kind: "p",
      text: "Sending generic flyers to everyone is the fastest way to get reported or blocked. Messages that refer to what the person asked about, and ask one easy question, get more replies.",
    },
    { kind: "h2", id: "first-response-template", text: "Example 1: the first reply" },
    {
      kind: "p",
      text: "Send it as soon as the lead comes in, and mention the exact project they asked about. On the WhatsApp Business Platform, a first message like this must be a template approved by Meta [2].",
    },
    {
      kind: "quote",
      text: "Namaste [Name]! Thank you for your interest in [Project Name] in [Location]. Are you looking for a 2 BHK or a 3 BHK?",
    },
    { kind: "h2", id: "site-visit-invitation", text: "Example 2: the weekend visit invitation" },
    {
      kind: "p",
      text: "Send it on Thursday or Friday to people who have shown real interest:",
    },
    {
      kind: "quote",
      text: "Hi [Name], the 3 BHK sample flat at [Project Name] is open this Saturday and Sunday. Would morning (11 AM to 1 PM) or evening (4 PM to 7 PM) suit you for a visit?",
    },
    { kind: "h2", id: "avoiding-spam-reports", text: "Follow up without getting blocked" },
    {
      kind: "list",
      items: [
        "Only message people who gave you their number for this project.",
        "Use Meta-approved templates to start conversations, and keep them specific.",
        "Make it easy to opt out, and stop messaging people who do.",
        "Space out follow-ups; a few useful messages beat many generic ones.",
      ],
    },
    { kind: "cta", text: "LeadOS sends your approved welcome to every new Meta lead and follows up automatically. Try it free for 14 days." },
  ],
  sources: [
    { label: "Bar and Bench: IT Rules 2021 and platform user numbers", url: "https://barandbench.com/news/law-policy/platforms-with-more-than-50-lakh-users-to-be-significant-social-media-intermediaries-it-rules" },
    { label: "Meta for Developers: WhatsApp Business Platform pricing", url: "https://developers.facebook.com/docs/whatsapp/pricing" },
  ],
  related: ["real-estate-lead-follow-up-cadence", "whatsapp-business-api-real-estate-india"],
};
