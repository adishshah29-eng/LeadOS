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

