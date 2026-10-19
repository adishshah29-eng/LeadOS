import type { Metadata } from "next";
import { BRAND, LEGAL } from "@/lib/brand";

export const metadata: Metadata = { title: "Data deletion", description: `How to delete your data from ${BRAND.name}.` };

/** Also the "Data deletion instructions URL" in the Meta app settings. */
export default function DataDeletionPage() {
  return (
    <>
      <h1>Data deletion</h1>
      <p>How to remove your data from {BRAND.name}, depending on who you are.</p>

      <h2>If you run a workspace</h2>
      <ol>
        <li>
          <strong>Disconnect Meta or WhatsApp:</strong> Settings → Meta (or WhatsApp) → Disconnect. The stored access token is deleted at once, and
          syncing and messaging stop.
        </li>
        <li>
          <strong>Delete one lead:</strong> email {LEGAL.email}{" "}from the owner&apos;s address with the workspace name and the lead&apos;s phone number or
          email. We erase the lead, their WhatsApp messages and their history.
        </li>
        <li>
          <strong>Delete the whole workspace:</strong> the owner emails {LEGAL.email}{" "}from the owner&apos;s address. We confirm, then erase the workspace
          within 30 days, and from backups within a further 30 days.
        </li>
      </ol>

      <h2>If you filled in a business&apos;s lead form or messaged them on WhatsApp</h2>
      <p>
        That business controls your data, so ask them first. You can also email {LEGAL.email}{" "}with your phone number and the business&apos;s name; we
        will pass your request on and make sure it is carried out within 30 days. On WhatsApp you can reply <strong>STOP</strong> at any time, and
        no more automated messages will be sent.
      </p>

      <h2>If you used Facebook to connect {BRAND.name}</h2>
      <p>
        Remove {BRAND.name}{" "}in Facebook → Settings → Business integrations, then email {LEGAL.email}. We delete the data that came from your account
        and reply with a confirmation reference.
      </p>
    </>
  );
}
