import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { publishedPosts, activeCategories, CATEGORIES } from "@/lib/blog";
import { ALL_POSTS } from "@/content/blog";
import { PostCard } from "@/components/blog/post-card";

export const metadata: Metadata = {
  title: "Blog",
  description: `Real estate marketing guides, speed to lead strategies, and CRM comparisons from ${BRAND.name}.`,
};

export default function BlogIndex() {
  const posts = publishedPosts(ALL_POSTS);
  const categories = activeCategories(ALL_POSTS);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-fg">Blog</h1>
        <p className="mt-2 text-base text-fg-muted max-w-2xl">
          Guides on digital marketing, Meta lead generation, and WhatsApp follow-up for Indian real estate teams.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-4">
        <Link
          href="/blogs"
          className="rounded-full bg-primary px-3.5 py-1 text-xs font-medium text-primary-fg"
        >
          All posts
        </Link>
        {categories.map((catKey) => {
          const meta = CATEGORIES[catKey];
          return (
            <Link
              key={catKey}
              href={`/blogs/category/${catKey}`}
              className="rounded-full border border-border bg-surface px-3.5 py-1 text-xs font-medium text-fg-muted hover:border-fg-muted/40 hover:text-fg transition-colors"
            >
              {meta.name}
            </Link>
          );
        })}
      </div>

      {posts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-fg-muted">
          No published posts yet. Check back soon.
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {posts.map((post) => (
            <PostCard key={post.slug} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}
