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
        <li>
          Paid plans are billed in advance, monthly or yearly, in the currency shown when you subscribe, plus any applicable taxes (such as GST or
          VAT). Prices can change; we give at least 30 days&apos; notice before a change applies to you.
        </li>
        <li>You can cancel any time; the plan runs to the end of the period you paid for. Payments already made are not refunded, except where the law requires.</li>
        <li>WhatsApp conversation fees are charged by Meta directly to your WhatsApp Business account, not by us.</li>
      </ul>

      <h2>Your responsibilities</h2>
      <ul>
        <li>Keep sign-in details safe, and give team members only the access they need.</li>
        <li>Have a lawful basis to contact your leads, and honour opt-outs. The assistant stops messaging anyone who replies STOP; don&apos;t work around it.</li>
        <li>Follow Meta&apos;s and WhatsApp&apos;s policies, including the WhatsApp Business and Commerce policies.</li>
        <li>
          Don&apos;t use {BRAND.name}{" "}for spam, unlawful content, or anything that breaks the law where you or your leads are, including privacy
          and marketing laws (for example India&apos;s DPDP Act and TRAI rules, or the GDPR).
        </li>
        <li>Check what you tell the assistant. You are responsible for the prices, offers and facts you give it.</li>
      </ul>

      <h2>Your data</h2>
      <p>
        You own your data. You can export your leads as CSV at any time, including while a workspace is paused. Our{" "}
        <Link href="/privacy">privacy policy</Link>{" "}explains how we handle personal data.
      </p>

      <h2>How we process your customers&apos; data</h2>
      <p>
        For the personal data of your leads and customers, you are the controller and we are your processor. This section is our data processing
        agreement with you. We will:
      </p>
      <ul>
        <li>process it only to provide {BRAND.name}{" "}and on your documented instructions, which are these terms and your settings;</li>
        <li>make sure our staff and contractors who can access it are bound by confidentiality;</li>
        <li>keep appropriate security measures in place, as described in the privacy policy;</li>
        <li>use only the sub-processors listed in the privacy policy, tell you before adding one, and hold each to the same duties;</li>
        <li>help you answer requests from people exercising their rights, and with security and impact assessments where needed;</li>
        <li>tell you without undue delay about a breach affecting your data;</li>
        <li>delete it when your workspace is deleted, except where the law requires us to keep it;</li>
        <li>give you the information you need to show compliance, and answer reasonable audit questions.</li>
      </ul>
      <p>Transfers out of the EU, UK or other regions with transfer rules are covered by the safeguards described in the privacy policy.</p>

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

      <h2>Business use</h2>
      <p>{BRAND.name}{" "}is for businesses. You confirm you are using it for your trade or profession, not as a consumer.</p>

      <h2>Changes to these terms</h2>
      <p>
        We may update these terms. If a change matters, we will email workspace owners at least 30 days before it applies. Continuing to use{" "}
        {BRAND.name}{" "}after that means you accept the new terms.
      </p>

      <h2>Law</h2>
      <p>
        These terms are governed by the laws of India, and the courts of {LEGAL.jurisdiction}{" "}have jurisdiction. This doesn&apos;t take away rights you
        have under the mandatory laws of your own country.
      </p>

      <h2>Contact</h2>
      <p>{LEGAL.email}</p>
    </>
  );
}
