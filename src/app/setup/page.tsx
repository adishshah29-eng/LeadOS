import { redirect } from "next/navigation";
import { readEnv } from "@/lib/env";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Setup" };

/** Shown until the Supabase keys are configured, instead of a crash. */
export default function SetupPage() {
  if (readEnv()) redirect("/");
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <Card className="p-6">
        <h1 className="text-lg font-semibold">Connect a Supabase project</h1>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-fg-muted">
          <li>Create a free project at supabase.com.</li>
          <li>
            In the SQL Editor, run <code className="font-mono text-fg">supabase/migrations/0001_tenancy.sql</code>.
          </li>
          <li>
            Copy <code className="font-mono text-fg">.env.example</code> to <code className="font-mono text-fg">.env.local</code> and
            paste the Project URL and the publishable (anon) key from Project Settings → API.
          </li>
          <li>Restart the dev server.</li>
        </ol>
      </Card>
    </main>
  );
}
