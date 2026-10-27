import Link from "next/link";

export function TableOfContents({
  entries,
}: {
  entries: { text: string; id: string }[];
}) {
  if (entries.length < 3) return null;

  return (
    <nav
      aria-label="Table of contents"
      className="my-6 rounded-lg border border-border bg-surface p-4"
    >
      <div className="text-xs font-semibold uppercase tracking-wider text-fg-muted mb-2">
        Table of contents
      </div>
      <ul className="space-y-1.5 text-sm">
        {entries.map((item) => (
          <li key={item.id}>
            <Link
              href={`#${item.id}`}
              className="text-fg-muted hover:text-fg hover:underline transition-colors"
            >
              {item.text}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
