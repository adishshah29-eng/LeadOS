import { test } from "node:test";
import assert from "node:assert/strict";
import {
  publishedPosts,
  readingMinutes,
  tableOfContents,
  jsonLdScript,
  articleJsonLd,
  breadcrumbJsonLd,
  type Post,
} from "./blog.ts";

const samplePost: Post = {
  slug: "test-post",
  title: "Test Post Title",
  description: "A valid test description with between 50 and 160 characters long.",
  category: "lead-management",
  author: { name: "Adish Shah", role: "Founder" },
  publishedOn: "2026-10-20",
  blocks: [
    { kind: "h2", text: "Introduction", id: "intro" },
    { kind: "p", text: "This is a sample paragraph with several words to test word counting." },
    { kind: "h2", text: "Deep Dive", id: "deep-dive" },
    { kind: "p", text: "Another block of content." },
    { kind: "h2", text: "Heading without id" },
    { kind: "h3", text: "Subheading" },
  ],
};

test("U1: publishedPosts drops drafts and future-dated posts, newest first", () => {
  const posts: Post[] = [
    { ...samplePost, slug: "published-old", publishedOn: "2026-10-15" },
    { ...samplePost, slug: "draft-post", draft: true, publishedOn: "2026-10-22" },
    { ...samplePost, slug: "future-post", publishedOn: "2026-10-28" },
    { ...samplePost, slug: "published-new", publishedOn: "2026-10-25" },
  ];
  const now = new Date("2026-10-26T00:00:00Z");
  const published = publishedPosts(posts, now);
  assert.equal(published.length, 2);
  assert.equal(published[0].slug, "published-new");
  assert.equal(published[1].slug, "published-old");
});

test("U9: readingMinutes calculates ~200 wpm, rounded up, at least 1", () => {
  const empty: Post = { ...samplePost, blocks: [] };
  assert.equal(readingMinutes(empty), 1);

  const words199: Post = {
    ...samplePost,
    blocks: [{ kind: "p", text: Array(199).fill("word").join(" ") }],
  };
  assert.equal(readingMinutes(words199), 1);

  const words201: Post = {
    ...samplePost,
    blocks: [{ kind: "p", text: Array(201).fill("word").join(" ") }],
  };
  assert.equal(readingMinutes(words201), 2);
});

test("U10: tableOfContents returns the h2 blocks that have an id, in order", () => {
  const toc = tableOfContents(samplePost);
  assert.deepEqual(toc, [
    { text: "Introduction", id: "intro" },
    { text: "Deep Dive", id: "deep-dive" },
  ]);
});

test("U11: jsonLdScript escapes < to \\u003c against injection", () => {
  const payload = { title: "</script><script>alert(1)" };
  const script = jsonLdScript(payload);
  assert.ok(!script.includes("<"), "contains no unescaped < character");
  assert.ok(script.includes("\\u003c/script>"));
});

test("U12: articleJsonLd & breadcrumbJsonLd build valid schemas and canonical URLs", () => {
  const base = "https://leados.in/";
  const article = articleJsonLd(samplePost, base);
  assert.equal(article["@context"], "https://schema.org");
  assert.equal(article["@type"], "BlogPosting");
  assert.equal(article.headline, samplePost.title);
  assert.equal(article.url, "https://leados.in/blogs/test-post");
  assert.equal(article.datePublished, samplePost.publishedOn);

  const breadcrumb = breadcrumbJsonLd(samplePost, base);
  assert.equal(breadcrumb["@context"], "https://schema.org");
  assert.equal(breadcrumb["@type"], "BreadcrumbList");
  assert.equal(breadcrumb.itemListElement.length, 3);
  assert.equal(breadcrumb.itemListElement[0].name, "Blog");
  assert.equal(breadcrumb.itemListElement[0].item, "https://leados.in/blogs");
  assert.equal(breadcrumb.itemListElement[1].name, "Lead management");
  assert.equal(breadcrumb.itemListElement[1].item, "https://leados.in/blogs/category/lead-management");
  assert.equal(breadcrumb.itemListElement[2].name, samplePost.title);
  assert.equal(breadcrumb.itemListElement[2].item, "https://leados.in/blogs/test-post");
});

import { ALL_POSTS } from "../content/blog/index.ts";
import { activeCategories } from "./blog.ts";

test("U2: every post slug matches ^[a-z0-9]+(-[a-z0-9]+)*$ and is unique", () => {
  const slugs = new Set<string>();
  const slugRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  for (const p of ALL_POSTS) {
    assert.match(p.slug, slugRegex, `Invalid slug format: ${p.slug}`);
    assert.ok(!slugs.has(p.slug), `Duplicate slug: ${p.slug}`);
    slugs.add(p.slug);
  }
});

test("U3: every post title <= 70 characters and description 50-160 characters", () => {
  for (const p of ALL_POSTS) {
    assert.ok(p.title.length <= 70, `Title too long (${p.title.length} > 70) in ${p.slug}`);
    assert.ok(
      p.description.length >= 50 && p.description.length <= 160,
      `Description length (${p.description.length}) outside 50-160 in ${p.slug}`
    );
  }
});

test("U4: every post dates are valid ISO dates and updatedOn >= publishedOn", () => {
  const isoRegex = /^\d{4}-\d{2}-\d{2}$/;
  for (const p of ALL_POSTS) {
    assert.match(p.publishedOn, isoRegex, `Invalid publishedOn in ${p.slug}`);
    if (p.updatedOn) {
      assert.match(p.updatedOn, isoRegex, `Invalid updatedOn in ${p.slug}`);
      assert.ok(p.updatedOn >= p.publishedOn, `updatedOn before publishedOn in ${p.slug}`);
    }
  }
});

test("U5: every comparisons post has a comparison with >= 3 rows, each with https:// source", () => {
  for (const p of ALL_POSTS) {
    if (p.category === "comparisons") {
      assert.ok(p.comparison, `Missing comparison in comparisons post: ${p.slug}`);
      assert.ok(p.comparison.rows.length >= 3, `Fewer than 3 comparison rows in ${p.slug}`);
      for (const row of p.comparison.rows) {
        assert.ok(row.source.url.startsWith("https://"), `Source URL not https in ${p.slug}: ${row.source.url}`);
        assert.ok(row.source.label.trim().length > 0, `Empty source label in ${p.slug}`);
      }
    }
  }
});

test("U6: every comparison checkedOn is within 180 days of today", () => {
  const now = new Date();
  const maxAgeMs = 180 * 24 * 60 * 60 * 1000;
  for (const p of ALL_POSTS) {
    if (p.comparison) {
      const checkedTime = new Date(p.comparison.checkedOn).getTime();
      const diff = now.getTime() - checkedTime;
      assert.ok(diff >= 0 && diff <= maxAgeMs, `Comparison check is older than 180 days in ${p.slug}`);
    }
  }
});

test("U7: every related slug exists in ALL_POSTS", () => {
  const slugs = new Set(ALL_POSTS.map((p) => p.slug));
  for (const p of ALL_POSTS) {
    if (p.related) {
      for (const rel of p.related) {
        assert.ok(slugs.has(rel), `Related slug "${rel}" in post "${p.slug}" not found in ALL_POSTS`);
      }
    }
  }
});

test("U8: every post that contains digits and % or ₹ figures has sources", () => {
  for (const p of ALL_POSTS) {
    const allText = p.blocks
      .map((b) => ("text" in b ? b.text : ""))
      .join(" ");
    if (/\d+%\s*|₹\s*\d+/.test(allText)) {
      assert.ok(p.sources && p.sources.length > 0, `Post with statistics ${p.slug} must provide sources`);
    }
  }
});

test("U15: each category has at least one published post, or isn't listed", () => {
  const active = activeCategories(ALL_POSTS);
  for (const cat of active) {
    const inCat = ALL_POSTS.filter((p) => !p.draft && p.category === cat);
    assert.ok(inCat.length > 0, `Category ${cat} is listed but has no published posts`);
  }
});


// ---------------------------------------------------------------- review fixes (verified content)

import { formatDate, BLOG_CTA, STAT_PATTERN, OVERCLAIM_PATTERN } from "./blog.ts";

test("T1: dates read as '24 Oct 2026'; anything that isn't a date comes back unchanged", () => {
  assert.equal(formatDate("2026-10-24"), "24 Oct 2026");
  assert.equal(formatDate("2026-01-05"), "5 Jan 2026");
  assert.equal(formatDate("not-a-date"), "not-a-date");
});

test("T2: reading time counts the comparison table and the FAQ", () => {
  const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
  const post: Post = {
    ...samplePost,
    blocks: [],
    comparison: {
      competitor: "Example",
      website: "https://example.com",
      checkedOn: "2026-10-20",
      rows: [{ feature: words(100), us: words(100), them: words(50), source: { label: "x", url: "https://example.com" } }],
      bestFor: { us: words(25), them: words(25) },
    },
    faq: [{ q: words(10), a: words(40) }],
  };
  assert.equal(readingMinutes(post), 2); // 350 words
});

/** Every piece of body text in a post, with where it came from. */
function bodyTexts(p: Post): string[] {
  const out: string[] = [];
  for (const b of p.blocks) {
    if (b.kind === "list") out.push(...b.items);
    else if (b.kind === "table") out.push(b.caption, ...b.head, ...b.rows.flat());
    else out.push(b.text);
  }
  for (const f of p.faq ?? []) out.push(f.q, f.a);
  return out;
}

test("T4: every number in a post's text points to one of its sources with [n]", () => {
  const problems: string[] = [];
  for (const p of ALL_POSTS) {
    const count = p.sources?.length ?? 0;
    for (const text of bodyTexts(p)) {
      if (!STAT_PATTERN.test(text)) continue;
      const refs = [...text.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
      if (!refs.length || refs.some((n) => n < 1 || n > count)) problems.push(`${p.slug}: "${text.slice(0, 70)}…"`);
    }
  }
  assert.deepEqual(problems, []);
});

test("T5: no post claims LeadOS does things it doesn't (brochures, visit booking, team alerts, billing)", () => {
  const problems: string[] = [];
  const claims = (p: Post) => [
    ...(p.comparison ? [...p.comparison.rows.map((r) => r.us), p.comparison.bestFor.us] : []),
    ...p.blocks.filter((b) => b.kind === "cta" || ("text" in b && /LeadOS/.test(b.text))).map((b) => ("text" in b ? b.text : "")),
  ];
  for (const text of [BLOG_CTA.body, BLOG_CTA.button]) if (OVERCLAIM_PATTERN.test(text)) problems.push(`page CTA: ${text}`);
  for (const p of ALL_POSTS) for (const t of claims(p)) if (OVERCLAIM_PATTERN.test(t)) problems.push(`${p.slug}: ${t.slice(0, 90)}`);
  assert.deepEqual(problems, []);
});

test("T6: sources are https and not repeated within a post", () => {
  for (const p of ALL_POSTS) {
    const urls = [...(p.sources ?? []), ...(p.comparison?.rows.map((r) => r.source) ?? [])].map((s) => s.url);
    for (const u of urls) assert.match(u, /^https:\/\//, `${p.slug}: ${u}`);
    const listed = (p.sources ?? []).map((s) => s.url);
    assert.equal(new Set(listed).size, listed.length, `${p.slug} lists a source twice`);
  }
});

test("T4b: the statistic pattern catches percentages, rupee amounts, multiples and big counts, not plain words", () => {
  for (const s of ["80% open", "₹1,600 per lead", "7× more likely", "7x more likely", "53 crore users", "500 million users"]) assert.ok(STAT_PATTERN.test(s), s);
  for (const s of ["3 BHK", "a 2-hour reminder", "within 5 minutes", "Day 1"]) assert.ok(!STAT_PATTERN.test(s), s);
});
