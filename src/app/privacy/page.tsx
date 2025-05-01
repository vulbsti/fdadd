
export default function PrivacyPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>
      <div className="prose prose-lg dark:prose-invert max-w-none space-y-4">
        <p className="text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>

        <h2 className="text-2xl font-semibold">Introduction</h2>
        <p>
          Aidoraa ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website [Your Website URL] and use our services, including FashionDaddy and DatePlanner (collectively, the "Services"). Please read this privacy policy carefully. If you do not agree with the terms of this privacy policy, please do not access the site or use our services.
        </p>

        <h2 className="text-2xl font-semibold">Information We Collect</h2>
        <p>
          We may collect information about you in a variety of ways. The information we may collect includes:
        </p>
        <ul>
          <li><strong>Personal Data:</strong> Personally identifiable information, such as your name, email address, that you voluntarily give to us when you register with the Services or when you choose to participate in various activities related to the Services, such as chat interactions.</li>
          <li><strong>Derivative Data:</strong> Information our servers automatically collect when you access the Services, such as your IP address, browser type, operating system, access times, and the pages you have viewed directly before and after accessing the Services.</li>
          <li><strong>Interaction Data:</strong> Information related to your interactions with our AI services, such as chat logs with FashionDaddy and descriptions provided to DatePlanner. This data is used to improve the AI models and provide the service.</li>
          {/* Add other types of data collection if applicable, e.g., Mobile Device Data, Wardrobe Data */}
        </ul>

         <h2 className="text-2xl font-semibold">Use of Your Information</h2>
        <p>
          Having accurate information about you permits us to provide you with a smooth, efficient, and customized experience. Specifically, we may use information collected about you via the Services to:
        </p>
         <ul>
           <li>Create and manage your account.</li>
           <li>Provide and improve our AI-powered services (FashionDaddy, DatePlanner).</li>
           <li>Personalize your user experience.</li>
           <li>Respond to your inquiries and offer support.</li>
           <li>Monitor and analyze usage and trends to improve your experience with the Services.</li>
           <li>Prevent fraudulent transactions, monitor against theft, and protect against criminal activity.</li>
            {/* Add other uses */}
         </ul>

         <h2 className="text-2xl font-semibold">Disclosure of Your Information</h2>
         <p>
            We may share information we have collected about you in certain situations. Your information may be disclosed as follows:
         </p>
         <ul>
             <li><strong>By Law or to Protect Rights:</strong> If we believe the release of information about you is necessary to respond to legal process, to investigate or remedy potential violations of our policies, or to protect the rights, property, and safety of others, we may share your information as permitted or required by any applicable law, rule, or regulation.</li>
             <li><strong>Third-Party Service Providers:</strong> We may share your information with third parties that perform services for us or on our behalf, including data analysis, email delivery, hosting services, customer service, and marketing assistance. (e.g., Supabase for authentication, AI model providers).</li>
              {/* Add other disclosures */}
         </ul>

        <h2 className="text-2xl font-semibold">Security of Your Information</h2>
        <p>
          We use administrative, technical, and physical security measures to help protect your personal information. While we have taken reasonable steps to secure the personal information you provide to us, please be aware that despite our efforts, no security measures are perfect or impenetrable, and no method of data transmission can be guaranteed against any interception or other type of misuse.
        </p>

         <h2 className="text-2xl font-semibold">Contact Us</h2>
          <p>
            If you have questions or comments about this Privacy Policy, please contact us at: [Your Contact Email/Link]
          </p>

          <p className="mt-8 text-sm text-muted-foreground">
              [Note: This is a template and should be reviewed and customized by a legal professional to ensure compliance with all applicable laws and regulations specific to your business operations and jurisdiction.]
          </p>

      </div>
    </div>
  );
}
