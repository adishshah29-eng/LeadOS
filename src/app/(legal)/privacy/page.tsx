import type { Metadata } from "next";
import Link from "next/link";
import { BRAND, LEGAL } from "@/lib/brand";

export const metadata: Metadata = { title: "Privacy policy", description: `How ${BRAND.name}{" "}handles personal data.` };

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy policy</h1>
      <p>
        {BRAND.name}{" "}is operated by {LEGAL.entity}, {LEGAL.address}{" "}(&quot;we&quot;). This policy explains what personal data we handle, why, and
        the choices you have. It is written for India&apos;s Digital Personal Data Protection Act, 2023 (DPDP Act).
      </p>

      <h2>Two kinds of data, two roles</h2>
      <ul>
        <li>
          <strong>Your account data</strong> (your name, email, password, sign-in activity): we decide how this is used, so we are its Data Fiduciary.
        </li>
        <li>
          <strong>Your customers&apos; data</strong> (leads from your Meta lead forms and WhatsApp chats: names, phone numbers, emails, answers, messages):
          your business decides how this is used. You are its Data Fiduciary, and we process it only on your instructions, to provide the service.
        </li>
      </ul>

      <h2>What we collect</h2>
      <ul>
        <li>Account details you give us, and the workspace, team and settings you create.</li>
        <li>
          From Meta, once a workspace admin connects it: ad accounts, campaigns, ads, spend and results; the Facebook Pages you select; leads submitted
          on your lead forms; and, for WhatsApp, your business number&apos;s details and the messages your customers exchange with it.
        </li>
        <li>Technical data needed to run and secure the service: IP address, browser type, and logs of actions such as sign-ins, exports and setting changes.</li>
      </ul>
      <p>We do not sell personal data, show advertising, or use your customers&apos; data to train AI models.</p>

      <h2>Why we use it</h2>
      <ul>
        <li>To show your ad performance, collect your leads, and run the WhatsApp assistant you configure.</li>
        <li>To keep accounts and workspaces secure, prevent abuse, and fix problems.</li>
        <li>To email you about your account: sign-in links, password resets, invitations and service notices.</li>
        <li>To meet legal obligations.</li>
      </ul>

      <h2>Meta data</h2>
      <p>
        We use data from Meta&apos;s APIs only to provide features to the workspace that connected it, and we follow Meta&apos;s Platform Terms. Access
        tokens are stored encrypted and are never shown again after they are saved. Disconnecting Meta or WhatsApp in Settings deletes the stored
        token immediately.
      </p>

      <h2>Who we share it with</h2>
      <p>Only the service providers we need to run {BRAND.name}, each bound by contract to protect the data:</p>
      <ul>
        <li>Supabase (database and sign-in)</li>
        <li>Vercel (web hosting)</li>
        <li>Inngest (background jobs)</li>
        <li>Meta Platforms (the Facebook, Instagram and WhatsApp APIs you connect)</li>
        <li>Google (Gemini, to understand typed WhatsApp messages when the assistant is on)</li>
        <li>Our email provider, for account emails</li>
      </ul>
      <p>These providers may store data outside India. We may also disclose data where the law requires it.</p>

      <h2>How long we keep it</h2>
      <p>
        Workspace data is kept while the workspace exists. When a workspace is deleted, its data is erased within 30 days, and from backups within a
        further 30 days. Security logs are kept for up to one year.
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask to see, correct or erase your personal data, withdraw consent, or nominate someone to act for you. If you are a lead of one of our
        customers, please contact that business first; we will help them respond. See <Link href="/data-deletion">data deletion</Link> for the steps.
      </p>

      <h2>Security</h2>
      <p>
        Data is encrypted in transit and at rest. Each workspace&apos;s data is isolated by database access rules, team members see only what their role
        allows, and two-factor sign-in is available. If a breach affects you, we will tell you and the Data Protection Board of India as the law requires.
      </p>

      <h2>Contact and grievances</h2>
      <p>
        Grievance officer: {LEGAL.grievanceOfficer}, {LEGAL.email}. We acknowledge within 7 days and resolve within 30. If you are not satisfied, you can
        complain to the Data Protection Board of India.
      </p>

      <h2>Changes</h2>
      <p>If we change this policy in a way that matters, we will email workspace owners before it takes effect.</p>
    </>
  );
}
