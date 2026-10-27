import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CATEGORIES,
  publishedPosts,
  postBySlug,
  readingMinutes,
  tableOfContents,
  jsonLdScript,
  articleJsonLd,
  breadcrumbJsonLd,
  formatDate,
  BLOG_CTA,
} from "@/lib/blog";
import { siteOrigin } from "@/lib/seo";
import { ALL_POSTS } from "@/content/blog";
import { TableOfContents } from "@/components/blog/toc";
import { ComparisonTable } from "@/components/blog/comparison-table";
import { BlockRenderer } from "@/components/blog/block-renderer";
import { PostCard } from "@/components/blog/post-card";

export const dynamicParams = false;

export function generateStaticParams() {
  const published = publishedPosts(ALL_POSTS);
  return published.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = postBySlug(ALL_POSTS, slug);
  if (!post) return {};

  const origin = siteOrigin();
  const canonical = `${origin}/blogs/${post.slug}`;
  const ogImage = `${origin}/blogs/${post.slug}/opengraph-image`;

  return {
    title: post.title,
    description: post.description,
    alternates: {
      canonical,
    },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      url: canonical,
      publishedTime: post.publishedOn,
      modifiedTime: post.updatedOn ?? post.publishedOn,
      authors: [post.author.name],
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
      images: [ogImage],
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = postBySlug(ALL_POSTS, slug);
  if (!post) notFound();

  const siteUrl = siteOrigin();
  const catMeta = CATEGORIES[post.category] ?? { name: post.category };
  const mins = readingMinutes(post);
  const toc = tableOfContents(post);

  const articleSchema = articleJsonLd(post, siteUrl);
  const breadcrumbSchema = breadcrumbJsonLd(post, siteUrl);

  const relatedPosts = (post.related ?? [])
    .map((relSlug) => postBySlug(ALL_POSTS, relSlug))
    .filter((p): p is typeof post => Boolean(p));

  return (
    <article className="space-y-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(articleSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbSchema) }}
      />

      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-fg-muted">
        <Link href="/blogs" className="hover:text-fg hover:underline">
          Blog
        </Link>
        <span>›</span>
        <Link
          href={`/blogs/category/${post.category}`}
          className="hover:text-fg hover:underline"
        >
          {catMeta.name}
        </Link>
      </nav>

      {/* Header */}
      <header className="space-y-4 border-b border-border pb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
          {post.title}
        </h1>
        <p className="text-lg text-fg-muted">{post.description}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-fg-muted">
          <div>
            By <span className="font-medium text-fg">{post.author.name}</span> ({post.author.role})
          </div>
          <span>·</span>
          <div className="flex items-center gap-1.5">
            <span>Published</span>
            <time dateTime={post.publishedOn}>{formatDate(post.publishedOn)}</time>
            {post.updatedOn && (
              <>
                <span>(Updated</span>
                <time dateTime={post.updatedOn}>{formatDate(post.updatedOn)}</time>
                <span>)</span>
              </>
            )}
          </div>
          <span>·</span>
          <div>{mins} min read</div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="space-y-6">
        <TableOfContents entries={toc} />

        <div>
          {post.blocks.map((block, idx) => (
            <BlockRenderer key={idx} block={block} />
          ))}
        </div>

        {post.comparison && (
          <div className="mt-8">
            <ComparisonTable comparison={post.comparison} />
          </div>
        )}

        {post.sources && post.sources.length > 0 && (
          <section aria-labelledby="sources-heading" className="mt-12 rounded-lg border border-border bg-surface p-5">
            <h2 id="sources-heading" className="text-sm font-semibold uppercase tracking-wider text-fg-muted mb-3">
              Sources & References
            </h2>
            <ul className="space-y-2 text-xs text-fg-muted">
              {post.sources.map((src, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-fg-subtle">[{i + 1}]</span>
                  <a
                    href={src.url}
                    target="_blank"
                    rel="nofollow noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {src.label} ↗
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* Related Posts */}
      {relatedPosts.length > 0 && (
        <section aria-labelledby="related-heading" className="mt-16 border-t border-border pt-10">
          <h2 id="related-heading" className="text-xl font-bold tracking-tight text-fg mb-6">
            Related reading
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {relatedPosts.map((rel) => (
              <PostCard key={rel.slug} post={rel} />
            ))}
          </div>
        </section>
      )}

      {/* Free Trial Call to Action */}
      <div className="mt-12 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 via-surface to-surface-2 p-8 text-center space-y-4">
        <h2 className="text-2xl font-bold tracking-tight text-fg">
          {BLOG_CTA.heading}
        </h2>
        <p className="mx-auto max-w-xl text-sm text-fg-muted leading-relaxed">
          {BLOG_CTA.body}
        </p>
        <div className="pt-2">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-semibold text-primary-fg shadow hover:bg-primary/90 transition-colors"
          >
            {BLOG_CTA.button} →
          </Link>
        </div>
      </div>
    </article>
  );
}
