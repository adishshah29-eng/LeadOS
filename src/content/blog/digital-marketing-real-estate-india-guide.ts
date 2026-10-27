import type { Post } from "@/lib/blog";

export const post: Post = {
  slug: "digital-marketing-real-estate-india-guide",
  title: "Digital Marketing for Real Estate in India: Complete Guide",
  description: "A practical guide to real estate digital marketing in India: Meta ads, Google Search, WhatsApp follow-up, RERA rules and lead handling.",
  category: "digital-marketing-india",
  author: { name: "Adish Shah", role: "Founder" },
  publishedOn: "2026-10-24",
  updatedOn: "2026-10-27",
  blocks: [
    { kind: "h2", id: "the-shift-to-digital", text: "Why digital channels matter for property sales" },
    {
      kind: "p",
      text: "Print ads, newspaper inserts and hoardings still build awareness, but they are hard to measure and hard to follow up. Digital ads tell you exactly who enquired, from which ad, and at what cost, and they let you reply to that person within minutes.",
    },
    { kind: "h2", id: "meta-ads-vs-google-search", text: "Meta lead ads and Google Search work together" },
    {
      kind: "p",
      text: "Google Search reaches people who are already searching for something specific, such as a 3 BHK in a particular locality. These searches show clear intent, but clicks in busy markets can be expensive.",
    },
    {
      kind: "p",
      text: "Meta lead ads reach people who were not searching yet, with video walkthroughs, photos and amenities, aimed at chosen areas and audiences. They bring more leads at a lower cost, but those leads need a fast reply, because people forget which ad they filled in.",
    },
    { kind: "h2", id: "whatsapp-the-conversion-bridge", text: "WhatsApp is where the conversation happens" },
    {
      kind: "p",
      text: "In 2021 the Government of India cited 53 crore WhatsApp users in the country [1]. For many homebuyers it is the app they check most, which makes it the natural place for the first reply, sharing project details and confirming a site visit.",
    },
    {
      kind: "p",
      text: "To message a new lead first on WhatsApp at scale, businesses use the WhatsApp Business Platform with message templates approved by Meta [2]. Keep the first message short, mention the project they asked about, and ask one easy question.",
    },
    { kind: "h2", id: "rera-and-compliance", text: "Stay RERA compliant in every ad" },
    {
      kind: "p",
      text: "Section 11(2) of the RERA Act requires advertisements for a registered project to show the project's registration number and the website address of the state RERA authority [3]. State authorities have penalised promoters for leaving these out, so check every creative, landing page and brochure.",
    },
    { kind: "cta", text: "LeadOS connects your Meta lead ads to WhatsApp follow-up in one place. Try it free for 14 days." },
  ],
  sources: [
    { label: "Bar and Bench: IT Rules 2021 and platform user numbers", url: "https://barandbench.com/news/law-policy/platforms-with-more-than-50-lakh-users-to-be-significant-social-media-intermediaries-it-rules" },
    { label: "Meta for Developers: WhatsApp Business Platform pricing", url: "https://developers.facebook.com/docs/whatsapp/pricing" },
    { label: "Andhra Pradesh RERA: advertisement guidelines under the RERA Act", url: "https://rera.ap.gov.in/RERA/Views/AdvertisementGuidelines.aspx" },
  ],
  related: ["speed-to-lead-real-estate", "meta-lead-ads-real-estate-setup"],
};
