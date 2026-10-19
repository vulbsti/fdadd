import type { Metadata } from 'next';
import Link from 'next/link';
import { CONTACT_EMAIL, LEGAL_UPDATED } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Privacy Policy | Aidoraa',
  description: 'What Aidoraa collects, why, who processes it, and how to export or delete it.',
};

export default function PrivacyPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>
      <div className="prose prose-lg dark:prose-invert max-w-none space-y-4">
        <p className="text-muted-foreground">Last updated: {LEGAL_UPDATED}</p>

        <p>
          Aidoraa (&quot;Aidoraa&quot;, &quot;we&quot;, &quot;us&quot;) helps you understand yourself and your life through
          conversations with an AI guide that draws on your birth chart and what you choose to share. This policy explains
          what we collect on the website www.aidoraa.com and in the Aidoraa app for Android (together, the
          &quot;Services&quot;), why, who helps us process it, and the choices you have. Aidoraa is run by an independent
          developer based in India.
        </p>

        <h2 className="text-2xl font-semibold">What we collect</h2>
        <ul>
          <li>
            <strong>Account details:</strong> your email address, a display name, and an account id. If you sign in with
            Google, we receive your name and email from Google.
          </li>
          <li>
            <strong>Birth details:</strong> the date, time and place of birth you type in (with the place&apos;s coordinates
            and time zone), and the same for anyone else you add, such as a partner or family member. We use these to
            calculate birth charts. We never read your device&apos;s location.
          </li>
          <li>
            <strong>Conversations:</strong> the messages you send and the answers Aidoraa writes, and the notes Aidoraa keeps
            about you and the people you add so that it does not start from zero each time.
          </li>
          <li>
            <strong>Things you bring in:</strong> exports you upload (for example from Google Keep, ChatGPT, Claude or
            Gemini) and the Notion pages or Google Drive files you choose to share. Only the text is stored. If you connect
            Notion or Google Drive, we store the access token needed to read what you picked.
          </li>
          <li>
            <strong>Reports you send:</strong> when you report an answer, we store the answer, your reason and any note.
          </li>
          <li>
            <strong>Purchases:</strong> your plan, its status and renewal dates. For Google Play purchases we receive a
            purchase token from Google; for website payments, an order record from Razorpay. Card and bank details stay with
            Google Play or Razorpay and never reach us.
          </li>
          <li>
            <strong>App settings:</strong> such as how you arranged your home screen.
          </li>
          <li>
            <strong>Technical data:</strong> our servers log requests (IP address, time, the page or API called, errors) to
            keep the Services running and secure. The website uses cookies only to keep you signed in. The Services contain
            no advertising and no third-party analytics or tracking.
          </li>
        </ul>

        <h2 className="text-2xl font-semibold">How we use it</h2>
        <ul>
          <li>To run your account and sign you in.</li>
          <li>To calculate charts and write answers that reflect what you have shared.</li>
          <li>To manage plans, check purchases with Google Play or Razorpay, and enforce plan limits.</li>
          <li>To review reported answers and make Aidoraa safer and more accurate.</li>
          <li>To answer your messages to support, and to keep the Services secure and working.</li>
        </ul>
        <p>
          We do not sell your data, use it for advertising, or use your conversations to train AI models. We process your
          data because you asked us to provide the Services, and with your consent for optional things such as imports.
        </p>

        <h2 className="text-2xl font-semibold">Who processes it for us</h2>
        <p>
          We use these service providers. They process data only to provide their service to us and may store it outside
          your country, including in the United States.
        </p>
        <ul>
          <li><strong>Supabase:</strong> sign-in, database and file storage.</li>
          <li><strong>Vercel:</strong> website and API hosting, and the isolated workspaces where answers are prepared.</li>
          <li><strong>Cloudflare:</strong> storage and delivery of workspace files and streamed answers.</li>
          <li>
            <strong>AI model providers</strong> (currently reached through OpenCode, and OpenRouter as a fallback): the
            parts of your profile and conversation needed to write each answer are sent to them to generate it.
          </li>
          <li><strong>Google:</strong> Google sign-in, Google Play billing, and Google Drive when you connect it.</li>
          <li><strong>Notion:</strong> when you connect it.</li>
          <li><strong>Razorpay:</strong> payments made on the website.</li>
        </ul>
        <p>
          We may also disclose information if the law requires it, or to protect the rights, safety or property of our
          users or others.
        </p>

        <h2 className="text-2xl font-semibold">How long we keep it</h2>
        <p>
          We keep your data while your account exists. When you delete your account, your profile, the people you added,
          conversations, notes, imports, connections, plan details and settings are deleted, and stored files are removed
          right away or by a daily clean-up. Server logs are kept for a short period by our hosting providers. Google Play
          and Razorpay keep their own records of payments.
        </p>

        <h2 className="text-2xl font-semibold">Your choices</h2>
        <ul>
          <li><strong>Export:</strong> download a copy of your data from the app (You &gt; Download my data).</li>
          <li>
            <strong>Delete:</strong> delete your account in the app (You &gt; Delete account) or at{' '}
            <Link href="/account/delete">www.aidoraa.com/account/delete</Link>. Cancelling a Google Play subscription is
            done in Google Play.
          </li>
          <li><strong>Disconnect:</strong> remove Notion or Google Drive, or delete an import, at any time.</li>
          <li>
            <strong>Correct or ask:</strong> edit your details in the app, or write to us to access, correct or erase your
            data, or to raise a concern.
          </li>
        </ul>

        <h2 className="text-2xl font-semibold">Security</h2>
        <p>
          Data travels over HTTPS. In the app, your sign-in session is encrypted on the device with an Android Keystore
          key. Access to our systems is limited to what is needed to run the Services. No system is perfectly secure, so we
          cannot guarantee absolute security.
        </p>

        <h2 className="text-2xl font-semibold">Age</h2>
        <p>
          The Services are for people aged 18 and over. We do not knowingly collect data from anyone younger. If you
          believe a minor has an account, contact us and we will delete it.
        </p>

        <h2 className="text-2xl font-semibold">Changes</h2>
        <p>
          If we change this policy, we will update the date above, and tell you in the Services before a significant
          change takes effect.
        </p>

        <h2 className="text-2xl font-semibold">Contact</h2>
        <p>
          For questions, requests or complaints about your data, email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We aim to reply within 30 days.
        </p>
      </div>
    </div>
  );
}
