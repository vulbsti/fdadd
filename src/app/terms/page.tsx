import type { Metadata } from 'next';
import Link from 'next/link';
import { CONTACT_EMAIL, LEGAL_UPDATED } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Terms of Service | Aidoraa',
  description: 'The terms for using the Aidoraa website and app.',
};

export default function TermsPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-bold mb-8">Terms of Service</h1>
      <div className="prose prose-lg dark:prose-invert max-w-none space-y-4">
        <p className="text-muted-foreground">Last updated: {LEGAL_UPDATED}</p>

        <h2 className="text-2xl font-semibold">1. Agreement</h2>
        <p>
          These terms apply to the Aidoraa website www.aidoraa.com and the Aidoraa app for Android (the
          &quot;Services&quot;), run by an independent developer based in India (&quot;Aidoraa&quot;, &quot;we&quot;,
          &quot;us&quot;). By creating an account or using the Services you agree to them. If you do not agree, please do not
          use the Services. Our <Link href="/privacy">Privacy Policy</Link> explains how we handle your data.
        </p>

        <h2 className="text-2xl font-semibold">2. Who can use Aidoraa</h2>
        <p>
          You must be at least 18 years old. You are responsible for keeping your sign-in details safe and for what happens
          in your account. Only add other people&apos;s details, such as a partner&apos;s birth date, if you have a good
          reason to and would be comfortable telling them.
        </p>

        <h2 className="text-2xl font-semibold">3. What Aidoraa is, and is not</h2>
        <p>
          Aidoraa is a tool for reflection and self-understanding. Its answers are written by AI from your birth chart and
          what you share. They are perspectives, not facts or guarantees, they can be wrong, and they do not predict the
          future. Aidoraa is not a substitute for professional medical, psychological, legal or financial advice. If you are
          in crisis or thinking about harming yourself, contact local emergency services or a crisis line straight away.
          Decisions you make remain your own.
        </p>

        <h2 className="text-2xl font-semibold">4. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>use the Services for anything unlawful, or to harass, threaten or harm anyone, including minors;</li>
          <li>try to make Aidoraa produce sexual, hateful, violent or otherwise harmful content;</li>
          <li>upload content you have no right to share, or someone else&apos;s private data without a good reason;</li>
          <li>impersonate anyone, or misrepresent your connection to anyone;</li>
          <li>
            interfere with, overload, scrape, reverse engineer or get around the limits or security of the Services, except
            where the law allows it.
          </li>
        </ul>
        <p>
          You can report any answer in the app. We may suspend or close accounts that break these terms.
        </p>

        <h2 className="text-2xl font-semibold">5. Your content</h2>
        <p>
          You keep the rights to what you share, including messages and imports. You give us permission to store and
          process it only to provide the Services to you, as described in the Privacy Policy. You can export or delete it at
          any time.
        </p>

        <h2 className="text-2xl font-semibold">6. Plans and payments</h2>
        <p>
          Aidoraa has a free plan and paid monthly plans with higher monthly limits. The current plans and prices are shown
          in the app and on the website before you buy.
        </p>
        <ul>
          <li>
            <strong>In the Android app</strong>, paid plans are sold through Google Play. They renew every month until you
            cancel in Google Play (Payments &amp; subscriptions). Cancelling stops the next renewal; you keep the plan until
            the end of the period you paid for. Refunds follow Google Play&apos;s refund policies.
          </li>
          <li>
            <strong>On the website</strong>, payments are taken by Razorpay. For a refund of a website payment, email us
            within 7 days of the charge.
          </li>
          <li>Taxes may be added where the law requires. We will give notice in the Services before a price change.</li>
        </ul>

        <h2 className="text-2xl font-semibold">7. Ending your account</h2>
        <p>
          You can delete your account at any time in the app (You &gt; Delete account) or at{' '}
          <Link href="/account/delete">www.aidoraa.com/account/delete</Link>. Deleting your account does not by itself cancel
          a Google Play subscription, so please also cancel it in Google Play. We may close an account that breaks these
          terms, and will tell you why unless the law prevents it.
        </p>

        <h2 className="text-2xl font-semibold">8. Our content</h2>
        <p>
          The Services, their design and software belong to Aidoraa and its licensors. You may use the answers written for
          you for your own personal purposes.
        </p>

        <h2 className="text-2xl font-semibold">9. Disclaimers and liability</h2>
        <p>
          The Services are provided &quot;as is&quot; and &quot;as available&quot;. We do not promise that they will always
          be available, error-free, or that answers will be accurate or suit your needs. To the extent the law allows, we
          are not liable for indirect or consequential losses, and our total liability to you for any claim is limited to
          the amount you paid us in the 3 months before the claim. Nothing in these terms limits rights you have under
          consumer law that cannot be limited.
        </p>

        <h2 className="text-2xl font-semibold">10. Changes</h2>
        <p>
          We may update these terms as the Services change. We will update the date above and, for significant changes,
          tell you in the Services before they take effect. Using the Services after that means you accept the new terms.
        </p>

        <h2 className="text-2xl font-semibold">11. Law</h2>
        <p>These terms are governed by the laws of India, without affecting consumer rights where you live.</p>

        <h2 className="text-2xl font-semibold">12. Contact</h2>
        <p>
          Questions about these terms: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </div>
    </div>
  );
}
