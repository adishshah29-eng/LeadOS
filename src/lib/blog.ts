import { BRAND } from "./brand.ts";

export type Category =
  | "comparisons"
  | "digital-marketing-india"
  | "real-estate-marketing"
  | "lead-management"
  | "whatsapp-marketing";

export const CATEGORIES: Record<Category, { name: string; description: string }> = {
  comparisons: {
    name: "LeadOS vs others",
    description: "Side-by-side comparisons of LeadOS against other real estate CRMs and WhatsApp tools.",
  },
  "digital-marketing-india": {
    name: "Digital marketing in India",
    description: "Market overview, acquisition channels, costs, and regulations including DPDP Act and TRAI rules.",
  },
  "real-estate-marketing": {
    name: "Real estate marketing",
    description: "Meta lead ads for property launches, site visit conversion, channel partners, and ad spend efficiency.",
  },
  "lead-management": {
    name: "Lead management",
    description: "Speed to lead, systematic follow-up, lead qualification, scoring, and CRM best practices.",
  },
  "whatsapp-marketing": {
    name: "WhatsApp marketing",
    description: "Approved templates, opt-in rules, conversational bots, and automated follow-up sequences.",
  },
};

export type Source = {
  label: string;
  url: string;
};

export type Block =
  | { kind: "p"; text: string }
  | { kind: "h2"; text: string; id?: string }
  | { kind: "h3"; text: string }
  | { kind: "list"; ordered?: boolean; items: string[] }
  | { kind: "callout"; tone: "tip" | "note" | "warning"; text: string }
  | { kind: "quote"; text: string; cite?: string }
  | { kind: "table"; caption: string; head: string[]; rows: string[][] }
  | { kind: "cta"; text: string };

export type ComparisonRow = {
  feature: string;
  us: string;
  them: string;
  source: Source;
};

export type Comparison = {
  competitor: string;
  website: string;
  checkedOn: string;
  rows: ComparisonRow[];
  bestFor: { us: string; them: string };
};

export type Post = {
  slug: string;
  title: string;
  description: string;
  category: Category;
  author: { name: string; role: string };
  publishedOn: string;
  updatedOn?: string;
  draft?: boolean;
  tags?: string[];
  blocks: Block[];
  comparison?: Comparison;
  faq?: { q: string; a: string }[];
  sources?: Source[];
  related?: string[];
};

/** Normalizes a base URL to a clean origin without trailing slash. */
export function cleanOrigin(base: string): string {
  const trimmed = base.trim();
  try {
    const url = new URL(trimmed);
    return url.origin;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

/** Filters out drafts and future-dated posts, returned newest first. */
export function publishedPosts(posts: Post[], now: Date = new Date()): Post[] {
  const today = now.toISOString().slice(0, 10);
  return posts
    .filter((p) => !p.draft && p.publishedOn <= today)
    .sort((a, b) => b.publishedOn.localeCompare(a.publishedOn));
}

/** Looks up a single published post by slug. */
export function postBySlug(posts: Post[], slug: string, now: Date = new Date()): Post | undefined {
  return publishedPosts(posts, now).find((p) => p.slug === slug);
}

/** Returns published posts within a category, newest first. */
export function postsInCategory(posts: Post[], category: Category, now: Date = new Date()): Post[] {
  return publishedPosts(posts, now).filter((p) => p.category === category);
}

/** Returns categories that have at least one published post. */
export function activeCategories(posts: Post[], now: Date = new Date()): Category[] {
  const published = publishedPosts(posts, now);
  const active = new Set(published.map((p) => p.category));
  const order: Category[] = [
    "comparisons",
    "digital-marketing-india",
    "real-estate-marketing",
    "lead-management",
    "whatsapp-marketing",
  ];
  return order.filter((c) => active.has(c));
}

/** Calculates estimated reading minutes (~200 words per minute, rounded up, at least 1). */
export function readingMinutes(post: Post): number {
  let wordCount = 0;
  for (const b of post.blocks) {
    if ("text" in b && typeof b.text === "string") {
      wordCount += b.text.trim().split(/\s+/).filter(Boolean).length;
    } else if (b.kind === "list") {
      for (const item of b.items) {
        wordCount += item.trim().split(/\s+/).filter(Boolean).length;
      }
    } else if (b.kind === "table") {
      wordCount += b.caption.trim().split(/\s+/).filter(Boolean).length;
      for (const cell of b.head) wordCount += cell.trim().split(/\s+/).filter(Boolean).length;
      for (const row of b.rows) {
        for (const cell of row) wordCount += cell.trim().split(/\s+/).filter(Boolean).length;
      }
    }
  }
  return Math.max(1, Math.ceil(wordCount / 200));
}

/** Returns all h2 sections that have an id attribute, in document order. */
export function tableOfContents(post: Post): { text: string; id: string }[] {
  const toc: { text: string; id: string }[] = [];
  for (const b of post.blocks) {
    if (b.kind === "h2" && b.id) {
      toc.push({ text: b.text, id: b.id });
    }
  }
  return toc;
}

/** Serializes JSON-LD with < escaped to prevent script tag breakout. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** Builds BlogPosting schema for a post. */
export function articleJsonLd(post: Post, baseUrl: string): Record<string, unknown> {
  const origin = cleanOrigin(baseUrl);
  const url = `${origin}/blogs/${post.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    url,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url,
    },
    datePublished: post.publishedOn,
    dateModified: post.updatedOn ?? post.publishedOn,
    author: {
      "@type": "Person",
      name: post.author.name,
      jobTitle: post.author.role,
    },
    publisher: {
      "@type": "Organization",
      name: BRAND.name,
      url: origin,
    },
  };
}

export type BreadcrumbListJsonLd = {
  "@context": "https://schema.org";
  "@type": "BreadcrumbList";
  itemListElement: {
    "@type": "ListItem";
    position: number;
    name: string;
    item: string;
  }[];
};

/** Builds BreadcrumbList schema for a post. */
export function breadcrumbJsonLd(post: Post, baseUrl: string): BreadcrumbListJsonLd {
  const origin = cleanOrigin(baseUrl);
  const categoryMeta = CATEGORIES[post.category] ?? { name: post.category };
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Blog",
        item: `${origin}/blogs`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: categoryMeta.name,
        item: `${origin}/blogs/category/${post.category}`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: post.title,
        item: `${origin}/blogs/${post.slug}`,
      },
    ],
  };
}
