import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Workspace paused", robots: { index: false } };

export default function SuspendedPage() {
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <Card className="p-6">
        <h1 className="text-lg font-semibold">This workspace is paused</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Its data is safe, but it can&apos;t be opened right now. The workspace owner can contact support to restore access.
        </p>
        <Link href="/onboarding" className="link mt-4 inline-block text-sm">Create or switch workspace</Link>
      </Card>
    </main>
  );
}
