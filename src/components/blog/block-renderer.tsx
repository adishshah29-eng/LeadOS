import Link from "next/link";
import { Callout } from "./callout";
import type { Block } from "@/lib/blog";

export function BlockRenderer({ block }: { block: Block }) {
  switch (block.kind) {
    case "p":
      return <p className="mb-4 leading-relaxed text-fg/90">{block.text}</p>;

    case "h2":
      return (
        <h2
          id={block.id}
          className="mb-3 mt-8 scroll-mt-20 text-xl font-bold tracking-tight text-fg"
        >
          {block.text}
        </h2>
      );

    case "h3":
      return (
        <h3 className="mb-2 mt-6 text-lg font-semibold tracking-tight text-fg">
          {block.text}
        </h3>
      );

    case "list": {
      const ListTag = block.ordered ? "ol" : "ul";
      const listStyle = block.ordered ? "list-decimal" : "list-disc";
      return (
        <ListTag className={`my-4 pl-6 space-y-1.5 text-fg/90 ${listStyle}`}>
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ListTag>
      );
    }

    case "callout":
      return <Callout tone={block.tone}>{block.text}</Callout>;

    case "quote":
      return (
        <blockquote className="my-6 border-l-4 border-primary/60 bg-surface-2/30 py-2 pl-4 italic text-fg/90">
          <p>{block.text}</p>
          {block.cite && (
            <cite className="mt-1 block text-xs not-italic text-fg-muted">
              — {block.cite}
            </cite>
          )}
        </blockquote>
      );

    case "table":
      return (
        <div className="my-6 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm border-collapse">
            {block.caption && (
              <caption className="p-2 text-xs text-fg-muted font-medium bg-surface-2/40">
                {block.caption}
              </caption>
            )}
            <thead>
              <tr className="border-b border-border bg-surface-2/60 text-xs font-semibold uppercase text-fg-muted">
                {block.head.map((h, i) => (
                  <th key={i} scope="col" className="p-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {block.rows.map((row, i) => (
                <tr key={i} className="hover:bg-surface-2/20">
                  {row.map((cell, j) => (
                    <td key={j} className="p-3 text-fg align-top">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "cta":
      return (
        <div className="my-8 rounded-lg border border-primary/30 bg-primary/5 p-6 text-center space-y-3">
          <p className="text-base font-medium text-fg">{block.text}</p>
          <div>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-fg shadow hover:bg-primary/90 transition-colors"
            >
              Start 14-day free trial →
            </Link>
          </div>
        </div>
      );

    default:
      return null;
  }
}
