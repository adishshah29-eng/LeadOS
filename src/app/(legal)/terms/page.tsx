import type { Metadata } from "next";
import Link from "next/link";
import { BRAND, LEGAL } from "@/lib/brand";

export const metadata: Metadata = { title: "Terms of service", description: `The terms for using ${BRAND.name}.` };

export default function TermsPage() {
  return (
    <>
      <h1>Terms of service</h1>
      <p>
        These terms are an agreement between {LEGAL.entity}{" "}(&quot;we&quot;) and the business that creates a {BRAND.name}{" "}workspace (&quot;you&quot;). By
        creating an account you accept them on behalf of that business.
      </p>

      <h2>The service</h2>
      <p>
        {BRAND.name}{" "}shows your Meta ad performance, collects leads from your lead forms, and can message those leads on WhatsApp from your own business
        number. Features depend on the Meta and WhatsApp accounts you connect and on Meta&apos;s rules, which can change.
      </p>

      <h2>Trial and payment</h2>
      <ul>
        <li>New workspaces get a 14-day free trial. No card is needed.</li>
        <li>When the trial ends, the workspace is paused until a paid plan starts. Leads keep being collected while it is paused, so none are lost.</li>
        <li>Paid plans are billed in advance in Indian rupees, plus GST. You can cancel any time; the plan runs to the end of the paid period.</li>
        <li>WhatsApp conversation fees are charged by Meta directly to your WhatsApp Business account, not by us.</li>
      </ul>

      <h2>Your responsibilities</h2>
      <ul>
        <li>Keep sign-in details safe, and give team members only the access they need.</li>
        <li>Have a lawful basis to contact your leads, and honour opt-outs. The assistant stops messaging anyone who replies STOP; don&apos;t work around it.</li>
        <li>Follow Meta&apos;s and WhatsApp&apos;s policies, including the WhatsApp Business and Commerce policies.</li>
        <li>Don&apos;t use {BRAND.name}{" "}for spam, unlawful content, or anything that breaks the law, including the DPDP Act and TRAI rules.</li>
        <li>Check what you tell the assistant. You are responsible for the prices, offers and facts you give it.</li>
      </ul>

      <h2>Your data</h2>
      <p>
        You own your data. We process your customers&apos; personal data only to provide the service, as described in the{" "}
        <Link href="/privacy">privacy policy</Link>. You can export your leads as CSV at any time, including while a workspace is paused.
      </p>

      <h2>Availability</h2>
      <p>
        We work to keep {BRAND.name}{" "}running and your data backed up, but the service is provided &quot;as is&quot;. It depends on Meta, WhatsApp and
        other providers we don&apos;t control, and short outages can happen.
      </p>

      <h2>Suspension and ending</h2>
      <p>
        We may suspend a workspace that breaks these terms, puts others at risk, or is unpaid, and will tell the owner why. You can delete your
        workspace at any time; its data is then erased as described in the privacy policy.
      </p>

      <h2>Liability</h2>
      <p>
        To the extent the law allows, we are not liable for indirect losses such as lost profit or lost leads, and our total liability is limited to
        what you paid us in the 12 months before the claim.
      </p>

      <h2>Law</h2>
      <p>These terms are governed by the laws of India, and the courts of {LEGAL.jurisdiction}{" "}have jurisdiction.</p>

      <h2>Contact</h2>
      <p>{LEGAL.email}</p>
    </>
  );
}
