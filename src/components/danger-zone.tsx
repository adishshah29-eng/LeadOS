import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { deleteWorkspace } from "@/app/o/[slug]/actions";

/** Owner-only "delete this workspace" card, on Settings and on the trial-ended page. */
export function DangerZone({ slug, name }: { slug: string; name: string }) {
  return (
    <Card className="border-danger p-5">
      <h2 className="font-medium text-danger">Danger zone</h2>
      <p className="mt-1 mb-4 text-sm text-fg-muted">
        Deleting this workspace permanently removes its projects, leads, notes, ad data, WhatsApp chats, team access, report links and saved Meta
        and WhatsApp connections. It can&apos;t be undone. Download your leads first if you need them.
      </p>
      <ActionForm action={deleteWorkspace} slug={slug} className="max-w-md space-y-3">
        <Field label={`Type "${name}" to confirm`} htmlFor="confirm-name">
          <Input id="confirm-name" name="confirm_name" autoComplete="off" spellCheck={false} required />
        </Field>
        <SubmitButton pendingLabel="Deleting…" variant="danger" size="sm">Delete workspace</SubmitButton>
      </ActionForm>
    </Card>
  );
}
