# Implementation plan: `/blogs`

A public blog on the LeadOS site. It covers two kinds of posts:

1. **Comparisons**: LeadOS against other tools on the market (CRMs, lead tools, WhatsApp tools).
2. **Digital marketing guides**: digital marketing in India, in real estate, its benefits, Meta ads and lead handling, and WhatsApp follow-up.

The goal is search traffic from Indian real estate businesses that turns into trial sign-ups.

> Status: plan only. Nothing is built. When it's built, it goes through the `tdd-build-break-fix` workflow: scope lock, test plan, TDD, adversarial review, fixes, then close-out. Sections 4 and 9 below are the draft scope and test plan for those gates.

---

## 1. How it fits this codebase

| Area | What exists today | What the blog does |
|---|---|---|
| Content | Help guides are typed data in `src/lib/guides.ts`, rendered by `src/app/help/[guide]/page.tsx`, with no extra packages | Same pattern: posts as typed data in `src/content/blog/*.ts` |
| Public access | `PUBLIC_PATHS` in `src/lib/supabase/proxy.ts` lets visitors in without signing in | Add `/blogs` |
| Sitemap / robots | `src/lib/seo.ts` (`sitemapEntries`, `robotsRules`), tested in `src/lib/seo.test.ts` | Add the blog index, category pages and every published post, with `lastModified` |
| Page titles | Root layout uses the template `%s · LeadOS` | Each post sets its own title, description, canonical URL and Open Graph data |
| Styles | Articles use the `.legal` prose class plus design tokens | Reuse `.legal` for post bodies. Add only what's new: comparison table, callout, author line |
| Brand | `BRAND` in `src/lib/brand.ts` | Use `BRAND.name` everywhere, never a hard-coded "LeadOS" |
| Links in | Landing page footer links to `/help` | Add a "Blog" link to the landing page nav and footer |

### Why typed data, not MDX

Next.js 16 supports MDX (`node_modules/next/dist/docs/01-app/02-guides/mdx.md`). It would need 4 new packages (`@next/mdx`, `@mdx-js/loader`, `@mdx-js/react`, `@types/mdx`), changes to `next.config`, a required `mdx-components.tsx`, and 2 more remark plugins for frontmatter.

Typed data needs none of that, and it matches the help center. The bigger win is that the compiler and unit tests can check every post: missing sources, out-of-date comparisons, broken internal links, descriptions that are too long. With MDX, those checks would need a separate parser.

**Trade-off:** writing a post means editing a `.ts` file instead of a Markdown file. If someone other than a developer will write posts often, move to MDX or a headless CMS later. The page code doesn't change; only the loader that turns content into `Post` objects does.

---

## 2. Routes

| Route | What it shows | Rendering |
|---|---|---|
| `/blogs` | All published posts, newest first. Category chips at the top, one featured post | Static |
| `/blogs/category/[category]` | Posts in one category | Static, `generateStaticParams`, `dynamicParams = false` |
| `/blogs/[slug]` | One post | Static, `generateStaticParams`, `dynamicParams = false` |
| `/blogs/[slug]/opengraph-image` | Share image (title, category, brand), built with `next/og` | Static, built in, no package |
| `/blog` → `/blogs` | Permanent redirect, since people often type the singular | `redirects()` in `next.config` |

An unknown slug or category returns a real 404 (`notFound()`).

### Categories (fixed list)

| Slug | Name | Covers |
|---|---|---|
| `comparisons` | LeadOS vs others | Side-by-side comparisons with other tools |
| `digital-marketing-india` | Digital marketing in India | Market overview, channels, costs, rules (DPDP Act, TRAI/DLT, WhatsApp policy) |
| `real-estate-marketing` | Real estate marketing | Meta lead ads for projects, site visits, channel partners, lead quality |
| `lead-management` | Lead management | Speed to lead, follow-up, scoring, CRM habits |
| `whatsapp-marketing` | WhatsApp marketing | Templates, opt-in, bots, follow-up sequences |

---

## 3. Content model (`src/lib/blog.ts`)

```ts
export type Category = "comparisons" | "digital-marketing-india" | "real-estate-marketing" | "lead-management" | "whatsapp-marketing";

export type Source = { label: string; url: string };

export type Block =
  | { kind: "p"; text: string }
  | { kind: "h2"; text: string; id?: string }      // id drives the table of contents
  | { kind: "h3"; text: string }
  | { kind: "list"; ordered?: boolean; items: string[] }
  | { kind: "callout"; tone: "tip" | "note" | "warning"; text: string }
  | { kind: "quote"; text: string; cite?: string }
  | { kind: "table"; caption: string; head: string[]; rows: string[][] }
  | { kind: "cta"; text: string };                  // "Start your free trial" box

/** One feature row in a comparison. Every claim about the other product has a source. */
export type ComparisonRow = {
  feature: string;
  us: string;                  // what LeadOS does, true today
  them: string;                // what they do, from their public pages
  source: Source;              // where "them" comes from
};

export type Comparison = {
  competitor: string;          // their name as they write it
  website: string;
  checkedOn: string;           // ISO date the "them" column was last checked
  rows: ComparisonRow[];
  bestFor: { us: string; them: string };  // fair summary: who each one suits
};

export type Post = {
  slug: string;                // lowercase-hyphen, unique, never changed after publishing
  title: string;               // 70 characters or fewer
  description: string;         // 50–160 characters: meta description and card text
  category: Category;
  author: { name: string; role: string };
  publishedOn: string;         // ISO date
  updatedOn?: string;          // ISO date, on or after publishedOn
  draft?: boolean;             // drafts never appear in lists, sitemap or routes
  tags?: string[];
  blocks: Block[];
  comparison?: Comparison;     // required when category is "comparisons"
  faq?: { q: string; a: string }[];
  sources?: Source[];          // required when the post cites any number
  related?: string[];          // slugs of other posts
};
```

Helpers, all pure and unit-tested:
- `publishedPosts(now)`: drops drafts and posts dated in the future, newest first.
- `postBySlug`, `postsInCategory`.
- `readingMinutes(post)`: about 200 words a minute, rounded up, at least 1.
- `tableOfContents(post)`: the `h2` blocks that have an `id`.
- `articleJsonLd(post, base)`, `breadcrumbJsonLd(post, base)`.
- `jsonLdScript(obj)`: `JSON.stringify` with `<` escaped to `<`, as the Next.js JSON-LD guide recommends.

Content files: one post per file, `src/content/blog/<slug>.ts`, each exporting a `Post`. `src/content/blog/index.ts` lists them all.

---

## 4. Draft acceptance criteria (for the scope-lock gate)

1. A signed-out visitor can open `/blogs`, any category page and any published post. None of them redirect to sign-in.
2. `/blogs` lists published posts, newest first. Each card shows title, description, category, date and reading time. Drafts and future-dated posts never appear.
3. A post page shows:
   - title, author, published and updated dates, reading time;
   - a table of contents when it has 3 or more `h2` sections;
   - the body, plus a sources list;
   - related posts and a call-to-action to start the free trial.
4. A comparison post also shows:
   - the comparison table, with each row of the other product's column linked to its source;
   - the date it was last checked;
   - a "best for" summary;
   - the disclaimer in section 6.
5. Unknown slugs and categories return a 404.
6. Each post has:
   - its own title (via the `%s · LeadOS` template), description, canonical URL and Open Graph data (type `article`, published and updated times, share image);
   - `BlogPosting` and `BreadcrumbList` JSON-LD, with `<` escaped.
7. The sitemap lists `/blogs`, every category and every published post, with `lastModified`. Drafts aren't listed.
8. The build fails (through unit tests in CI) if:
   - a slug is duplicated or badly formed, or a description is outside 50–160 characters;
   - a comparison post has no comparison, a comparison row has no source, or a comparison is older than 180 days;
   - a `related` slug doesn't exist, or `updatedOn` is before `publishedOn`.
9. `/blog` permanently redirects to `/blogs`.
10. The landing page nav and footer link to the blog.
11. It works on a phone: the comparison table scrolls sideways inside its own box, and the page itself never scrolls sideways.

**Out of scope (suggestions, not built):**
- Comments.
- Newsletter sign-up (needs an email provider; see the launch checklist).
- Search inside the blog.
- An RSS feed (small, could be added later).
- A CMS or admin editor.
- Hindi or other language versions (that would also need `hreflang` tags).
- View counters and analytics events.

---

## 5. Pages and components

- **`src/app/blogs/layout.tsx`**: the public site frame used by `/help` (header with the logo, sign-in and start trial buttons; footer with the legal links), plus a "Blog" link.
- **`src/app/blogs/page.tsx`**: featured post (the newest, or one marked `featured`), category chips, and a grid of post cards. One column on phones, two on tablets, three on desktop.
- **`src/app/blogs/category/[category]/page.tsx`**: the same grid filtered to one category, with a short intro per category (also used as the page description).
- **`src/app/blogs/[slug]/page.tsx`**:
  - Breadcrumb: Blog › Category.
  - Header: H1, author, dates, reading time.
  - Table of contents (on desktop, a sticky side column).
  - Body: a `renderBlock` switch that renders every block as plain React text, never as HTML.
  - Comparison table (when present), FAQ, sources, related posts, then the CTA.
- **`src/components/blog/`**: `post-card.tsx`, `comparison-table.tsx`, `callout.tsx`, `toc.tsx`.
- **`src/app/blogs/[slug]/opengraph-image.tsx`**: a 1200×630 share image using `ImageResponse` from `next/og`, in brand colours.

Accessibility:
- One H1 per page, headings in order.
- The comparison table uses `<th scope>` and a `<caption>`.
- Links to other sites say where they go.
- Every interactive element has a visible focus style.
- Text contrast follows the existing design tokens.

---

## 6. Rules for comparison posts (important)

Comparison posts name other companies, so they carry legal and trust risk.

- **Every claim about another product needs a source:** their own public pricing, feature or docs pages, with the date it was checked. No claims from memory, reviews of unknown origin, or guesses. The data model enforces this (`ComparisonRow.source`), and a test fails if a comparison is over 180 days old.
- **Be fair, not disparaging.** Say what each tool is best for, including where the other tool is the better choice. Use neutral words ("doesn't include", "available on higher plans") rather than "bad" or "outdated".
- **Facts only about LeadOS too.** Only list LeadOS features that exist today: Meta lead sync, the WhatsApp bot and follow-ups, client report links, plan limits. Use real plan prices from `src/lib/plans.ts`, never planned features.
- **Trademarks:** use the other company's name only to identify it. Don't use their logo or anything that suggests a partnership.
- **Show this disclaimer on every comparison post:** "{Competitor} is a trademark of its owner. LeadOS is not affiliated with {Competitor}. Information checked on {checkedOn} from their public website. Prices and features change; check their site for the latest. Spotted a mistake? Email us and we'll fix it."
- **Follow the ASCI comparative-advertising rules and Indian trademark law. Have a lawyer read the first comparison post before it goes live.** This is added to `docs/LAUNCH-CHECKLIST.md`.
- **Links to other companies' sites** use `rel="nofollow noopener noreferrer"`.

Candidate tools to compare against, to be researched and confirmed first since nothing here is a claim about them yet:
- Real estate and sales CRMs used in India: Sell.Do, LeadSquared, Kylas, Zoho CRM, HubSpot, Salesforce.
- Lead and WhatsApp tools: Privyr, TeleCRM, WATI, Interakt.

Pick the 3–4 that your customers actually mention.

---

## 7. First posts (content plan)

Every number in a post needs a source in `sources` (reports from IAMAI, KPMG, Meta, Google, or government data). No made-up statistics.

| # | Category | Working title | Search intent |
|---|---|---|---|
| 1 | comparisons | LeadOS vs Sell.Do: which suits a small real estate team? | Comparison |
| 2 | comparisons | LeadOS vs LeadSquared for real estate lead follow-up | Comparison |
| 3 | comparisons | Best CRM for real estate agents in India (honest comparison) | Comparison roundup |
| 4 | comparisons | LeadOS vs a spreadsheet and WhatsApp: when to switch | Comparison |
| 5 | digital-marketing-india | Digital marketing in India: a guide for small businesses | Learn |
| 6 | digital-marketing-india | Benefits of digital marketing over print and hoardings | Learn |
| 7 | real-estate-marketing | Digital marketing for real estate in India: the complete playbook | Learn |
| 8 | real-estate-marketing | Facebook and Instagram lead ads for real estate projects: setup and costs | How-to |
| 9 | real-estate-marketing | Why real estate leads go cold, and how to answer in 5 minutes | Problem |
| 10 | lead-management | Speed to lead: why the first 5 minutes decide the site visit | Learn |
| 11 | whatsapp-marketing | WhatsApp follow-up for real estate leads: templates that get replies | How-to |
| 12 | digital-marketing-india | DPDP Act basics for marketers collecting leads in India | Compliance |

Each post should be 1,200–2,000 words, with at least one internal link to another post or help guide and a CTA to start the free trial. Comparisons go out first, since they're the most likely to convert. Then publish one guide a week.

**Who writes the posts:** you write them, or I draft and you check the facts. AI-drafted posts must be fact-checked and edited by a person before publishing, so `draft: true` is the default for new posts.

---

## 8. SEO details

- Canonical URL: `https://<domain>/blogs/<slug>`. Slugs never change. If one ever must, add a permanent redirect.
- Use `generateMetadata` per post: `title`, `description`, `alternates.canonical`, and `openGraph` (`type: "article"`, `publishedTime`, `modifiedTime`, `authors`, image) plus `twitter` (`summary_large_image`).
- JSON-LD:
  - `BlogPosting`: headline, description, datePublished, dateModified, author, publisher, image, mainEntityOfPage.
  - `BreadcrumbList`.
  - FAQ markup is optional; Google now shows FAQ results for very few sites, so don't count on it.
- Sitemap: add the posts to `sitemapEntries` in `src/lib/seo.ts`, with `lastModified = updatedOn ?? publishedOn`.
- Internal links: every post links to 2 or more others. Category pages link to every post in them. Help guides can link to related posts.
- Performance: every page is static, with no client JavaScript except the existing theme toggle. Share images are generated at build time.

---

## 9. Draft test plan (for the test-plan gate)

| ID | Type | Scenario | Expected |
|---|---|---|---|
| U1 | Unit | `publishedPosts` with a draft and a future-dated post | Both left out; the rest newest first |
| U2 | Unit | Every post: slug format `^[a-z0-9]+(-[a-z0-9]+)*$` and unique | Passes for all content |
| U3 | Unit | Every post: title ≤ 70 characters, description 50–160 characters | Passes for all content |
| U4 | Unit | Every post: dates are valid ISO dates, `updatedOn` ≥ `publishedOn` | Passes for all content |
| U5 | Unit | Every `comparisons` post has a `comparison` with ≥ 3 rows, each with a source URL using `https://` | Passes for all content |
| U6 | Unit | Every comparison's `checkedOn` is within 180 days of today | Fails the build when out of date |
| U7 | Unit | Every `related` slug and internal `/blogs/...` link exists | Passes for all content |
| U8 | Unit | Every post that contains a digit-and-percent or ₹ figure has `sources` | Passes for all content |
| U9 | Unit | `readingMinutes`: empty post, 199 words, 201 words | 1, 1, 2 |
| U10 | Unit | `tableOfContents` returns the `h2` blocks that have an `id`, in order | Matches |
| U11 | Unit | `jsonLdScript` on a title containing `</script><script>alert(1)` | Has no `<`; it becomes `<` |
| U12 | Unit | `articleJsonLd` fields: headline, dates, canonical URL built from origin | Correct; no double slashes |
| U13 | Unit | `sitemapEntries` includes `/blogs`, every category and each published post with `lastModified`; no drafts | Matches |
| U14 | Unit | `robotsRules` does not block `/blogs` | Not in disallow |
| U15 | Unit | Each category has at least one published post, or isn't listed | No empty category pages |
| I1 | Site (`tests/integration/site.test.ts`) | Signed-out GET `/blogs`, a category page, a post | 200, no redirect to `/login` |
| I2 | Site | GET `/blogs/does-not-exist`, `/blogs/category/nope` | 404 |
| I3 | Site | Post HTML has `<link rel="canonical">`, `og:type=article`, one `<h1>`, `application/ld+json` | Present |
| I4 | Site | GET `/blog` | 308 to `/blogs` |
| I5 | Site | A comparison post shows the disclaimer and a "checked on" date | Present |
| I6 | Site | `/sitemap.xml` contains a published post URL and not a draft's | Matches |
| E1 | Browser | Phone width 375 px: index, post, comparison table | No sideways page scroll; table scrolls inside its box |
| E2 | Browser | Keyboard: tab through the table of contents and CTA | Visible focus; links work |

Acceptance mapping:

| Criterion | Tests |
|---|---|
| 1 | I1 |
| 2 | U1, I1 |
| 3 | U9, U10, E2 |
| 4 | U5, U6, I5 |
| 5 | I2 |
| 6 | U11, U12, I3 |
| 7 | U13, I6 |
| 8 | U2–U8 |
| 9 | I4 |
| 10 | I1 (landing page link) |
| 11 | E1 |

---

## 10. Build order

1. `src/lib/blog.ts` types and helpers, plus `blog.test.ts` (U1, U9–U12), red then green.
2. Content checks over all posts (U2–U8, U15) and 2 starter posts as `draft: true`, so the checks have data.
3. Pages: index, category, post, components. Public access in `PUBLIC_PATHS`. The `/blog` redirect.
4. SEO: metadata, JSON-LD, share image, sitemap (U13, U14, I3, I6).
5. Nav and footer links. Site tests (I1–I6). Browser checks (E1, E2).
6. Adversarial review, then approved fixes, close-out and commit.
7. Content: write and fact-check posts 1–4, legal review of the first comparison, then publish by setting `draft: false`.

Rough size: 3–4 files of logic, 4 pages, 4 small components, about 25 tests. No new dependencies, no database changes, no migrations.

## 11. Risks

| Risk | Mitigation |
|---|---|
| A comparison goes out of date and becomes untrue | 180-day check fails CI; "checked on" date shown; mistake-report email in the disclaimer |
| Legal complaint from a named competitor | Sourced facts only, neutral wording, disclaimer, no logos, lawyer review before the first one goes live |
| Thin AI-written content hurts search ranking | Drafts by default; a person edits and adds real examples from your work; sources required for numbers |
| Blog pages accidentally need sign-in | `PUBLIC_PATHS` entry plus site test I1 |
| Unsafe HTML in content | Blocks render as React text; only JSON-LD uses raw HTML, and it is escaped (U11) |
