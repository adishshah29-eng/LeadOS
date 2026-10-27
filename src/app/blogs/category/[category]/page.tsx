import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CATEGORIES, postsInCategory, type Category } from "@/lib/blog";
import { ALL_POSTS } from "@/content/blog";
import { PostCard } from "@/components/blog/post-card";

export const dynamicParams = false;

export function generateStaticParams() {
  const categoryKeys = Object.keys(CATEGORIES) as Category[];
  return categoryKeys.map((category) => ({ category }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category } = await params;
  const meta = CATEGORIES[category as Category];
  if (!meta) return {};

  return {
    title: meta.name,
    description: meta.description,
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const meta = CATEGORIES[category as Category];
  if (!meta) notFound();

  const posts = postsInCategory(ALL_POSTS, category as Category);
  const allCategories = Object.keys(CATEGORIES) as Category[];

  return (
    <div className="space-y-10">
      <div>
        <div className="mb-2">
          <Link
            href="/blogs"
            className="text-xs font-medium text-fg-muted hover:text-fg hover:underline"
          >
            ← Back to all posts
          </Link>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-fg">{meta.name}</h1>
        <p className="mt-2 text-base text-fg-muted max-w-2xl">
          {meta.description}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-4">
        <Link
          href="/blogs"
          className="rounded-full border border-border bg-surface px-3.5 py-1 text-xs font-medium text-fg-muted hover:border-fg-muted/40 hover:text-fg transition-colors"
        >
          All posts
        </Link>
        {allCategories.map((catKey) => {
          const isSelected = catKey === category;
          const catMeta = CATEGORIES[catKey];
          return (
            <Link
              key={catKey}
              href={`/blogs/category/${catKey}`}
              className={`rounded-full px-3.5 py-1 text-xs font-medium transition-colors ${
                isSelected
                  ? "bg-primary text-primary-fg"
                  : "border border-border bg-surface text-fg-muted hover:border-fg-muted/40 hover:text-fg"
              }`}
            >
              {catMeta.name}
            </Link>
          );
        })}
      </div>

      {posts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-fg-muted">
          No published posts in this category yet. Check back soon.
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
