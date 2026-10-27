import Link from "next/link";
import { CATEGORIES, formatDate, readingMinutes, type Post } from "@/lib/blog";

export function PostCard({ post }: { post: Post }) {
  const cat = CATEGORIES[post.category] ?? { name: post.category };
  const mins = readingMinutes(post);

  return (
    <article className="flex flex-col justify-between rounded-lg border border-border bg-surface p-5 transition-colors hover:border-fg-muted/40">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 text-xs text-fg-muted">
          <Link
            href={`/blogs/category/${post.category}`}
            className="rounded bg-surface-2 px-2 py-0.5 font-medium text-fg hover:bg-border"
          >
            {cat.name}
          </Link>
          <div className="flex items-center gap-1.5">
            <time dateTime={post.publishedOn}>{formatDate(post.publishedOn)}</time>
            <span>·</span>
            <span>{mins} min read</span>
          </div>
        </div>

        <h2 className="text-lg font-semibold tracking-tight text-fg">
          <Link href={`/blogs/${post.slug}`} className="hover:underline">
            {post.title}
          </Link>
        </h2>

        <p className="line-clamp-3 text-sm text-fg-muted">
          {post.description}
        </p>
      </div>

      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-fg-muted">
        <span>By {post.author.name}</span>
        <Link
          href={`/blogs/${post.slug}`}
          className="font-medium text-primary hover:underline"
        >
          Read article →
        </Link>
      </div>
    </article>
  );
}
