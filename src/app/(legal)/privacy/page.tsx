import type { Metadata } from "next";
import Link from "next/link";
import { BRAND, LEGAL } from "@/lib/brand";

export const metadata: Metadata = { title: "Privacy policy", description: `How ${BRAND.name} handles personal data.` };

/*
 * Written to work worldwide: India's DPDP Act 2023, the EU and UK GDPR, and
 * the common ground of other privacy laws. JSX drops a space after an inserted
 * value at a line's end in some places, so those spaces are written as {" "}.
 */
export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy policy</h1>
      <p>
        {BRAND.name}{" "}is operated by {LEGAL.entity}, {LEGAL.address}{" "}(&quot;we&quot;, &quot;us&quot;). This policy explains what personal data
        we handle, why, and the choices you have, wherever you live. It is written to meet India&apos;s Digital Personal Data Protection Act, 2023
        (DPDP Act), the EU General Data Protection Regulation and its UK version (GDPR), and similar laws in other countries.
      </p>

      <h2>Two kinds of data, two roles</h2>
      <ul>
        <li>
          <strong>Your account data</strong> (your name, email, password, sign-in activity and billing contact): we decide how this is used, so we are
          its controller (&quot;Data Fiduciary&quot; under the DPDP Act).
        </li>
        <li>
          <strong>Your customers&apos; data</strong> (leads from your Meta lead forms and WhatsApp chats: names, phone numbers, emails, answers,
          messages): your business decides how this is used. You are its controller, and we are your processor: we handle it only on your
          instructions, to provide the service. Our{" "}<Link href="/terms">terms</Link>{" "}include the processing commitments we make to you.
        </li>
      </ul>

      <h2>What we collect</h2>
      <ul>
        <li>Account details you give us, and the workspace, team and settings you create.</li>
        <li>
          From Meta, once a workspace admin connects it: ad accounts, campaigns, ads, spend and results; the Facebook Pages you select; leads submitted
          on your lead forms; and, for WhatsApp, your business number&apos;s details and the messages your customers exchange with it.
        </li>
        <li>Billing details if you subscribe. Card numbers go straight to our payment provider; we never see or store them.</li>
        <li>Technical data needed to run and secure the service: IP address, browser type, and logs of actions such as sign-ins, exports and setting changes.</li>
      </ul>
      <p>We do not sell or share personal data for advertising, show ads, or use your customers&apos; data to train AI models.</p>

      <h2>Why we use it, and on what legal basis</h2>
      <ul>
        <li><strong>To provide the service you signed up for</strong>: show ad performance, collect leads, run the WhatsApp assistant you set up (performing our contract with you).</li>
        <li><strong>To keep it secure and working</strong>: prevent abuse, investigate problems, keep logs (our legitimate interest in a safe, reliable service).</li>
        <li><strong>To email you about your account</strong>: sign-in links, password resets, invitations, billing and service notices (contract).</li>
        <li><strong>Product news</strong>, only if you opt in. You can unsubscribe at any time (consent).</li>
        <li><strong>To meet legal obligations</strong>, such as tax records and lawful requests from authorities.</li>
      </ul>

      <h2>Meta data</h2>
      <p>
        We use data from Meta&apos;s APIs only to provide features to the workspace that connected it, and we follow Meta&apos;s Platform Terms. Access
        tokens are stored encrypted and are never shown again after they are saved. Disconnecting Meta or WhatsApp in Settings deletes the stored
        token immediately.
      </p>

      <h2>Who we share it with</h2>
      <p>Only the service providers (&quot;sub-processors&quot;) we need to run {BRAND.name}, each bound by contract to protect the data:</p>
      <ul>
        <li>Supabase: database and sign-in</li>
        <li>Vercel: web hosting</li>
        <li>Inngest: background jobs</li>
        <li>Meta Platforms: the Facebook, Instagram and WhatsApp APIs you connect</li>
        <li>Google: Gemini, to understand typed WhatsApp messages when the assistant is on</li>
        <li>Our email provider, for account emails, and our payment provider, for subscriptions</li>
      </ul>
      <p>
        We tell workspace owners before adding a new sub-processor. We may also disclose data when the law requires it, or to a buyer if our business
        is sold, under this same policy.
      </p>

      <h2>International transfers</h2>
      <p>
        We and our providers may process data in India, the United States, the European Union and other countries. When data from the EU, UK or
        another region with transfer rules leaves it, we rely on safeguards those laws recognise, such as the European Commission&apos;s Standard
        Contractual Clauses.
      </p>

      <h2>How long we keep it</h2>
      <p>
        Workspace data is kept while the workspace exists. When a workspace is deleted, its data is erased within 30 days, and from backups within a
        further 30 days. Security logs are kept for up to one year, and billing records for as long as tax law requires.
      </p>

      <h2>Your rights</h2>
      <p>Depending on where you live, you can:</p>
      <ul>
        <li>see the personal data we hold about you and get a copy;</li>
        <li>correct it, or have it erased;</li>
        <li>object to or restrict how we use it, and take it to another service (portability);</li>
        <li>withdraw consent where we rely on it;</li>
        <li>nominate someone to act for you (DPDP Act);</li>
        <li>complain to your data protection authority.</li>
      </ul>
      <p>
        Email {LEGAL.email}{" "}to use any of these. We may need to confirm your identity first. If you are a lead of one of our customers, that business
        controls your data, so please contact them first; we will help them respond. See{" "}<Link href="/data-deletion">data deletion</Link>.
      </p>

      <h2>Cookies</h2>
      <p>
        We use only the cookies needed to keep you signed in and secure, plus a setting in your browser that remembers light or dark mode. We
        don&apos;t use advertising or tracking cookies, so there is no cookie banner.
      </p>

      <h2>Security</h2>
      <p>
        Data is encrypted in transit and at rest. Each workspace&apos;s data is isolated by database access rules, team members see only what their role
        allows, and two-factor sign-in is available. If a breach puts your data at risk, we will tell you and the authorities the law requires,
        without undue delay.
      </p>

      <h2>Children</h2>
      <p>{BRAND.name}{" "}is a business tool and is not meant for anyone under 18. We don&apos;t knowingly collect children&apos;s data.</p>

      <h2>Contact and grievances</h2>
      <p>
        Privacy contact and grievance officer: {LEGAL.grievanceOfficer}, {LEGAL.email}. We acknowledge within 7 days and resolve within 30. You can also
        complain to the Data Protection Board of India, or to the data protection authority where you live.
      </p>

      <h2>Changes</h2>
      <p>If we change this policy in a way that matters, we will email workspace owners before it takes effect.</p>
    </>
  );
}
