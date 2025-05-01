
export default function TermsPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-bold mb-8">Terms of Service</h1>
       <div className="prose prose-lg dark:prose-invert max-w-none space-y-4">
         <p className="text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>

         <h2 className="text-2xl font-semibold">1. Acceptance of Terms</h2>
         <p>
           By accessing and using the Aidoraa website and its services, including FashionDaddy and DatePlanner (collectively, the "Services"), you accept and agree to be bound by the terms and provision of this agreement. In addition, when using these particular services, you shall be subject to any posted guidelines or rules applicable to such services. Any participation in this service will constitute acceptance of this agreement. If you do not agree to abide by the above, please do not use this service.
         </p>

         <h2 className="text-2xl font-semibold">2. Description of Service</h2>
         <p>
           Aidoraa provides AI-powered fashion assistance tools. These services are provided "AS IS" and Aidoraa assumes no responsibility for the timeliness, deletion, mis-delivery, or failure to store any user communications or personalization settings. The AI responses are generated based on patterns in data and may not always be accurate, complete, or suitable for your specific needs. Use the information provided by the Services at your own discretion.
         </p>

         <h2 className="text-2xl font-semibold">3. User Conduct</h2>
         <p>
           You agree not to use the Service to:
         </p>
         <ul>
           <li>Upload, post, email, transmit, or otherwise make available any content that is unlawful, harmful, threatening, abusive, harassing, tortious, defamatory, vulgar, obscene, libelous, invasive of another's privacy, hateful, or racially, ethnically, or otherwise objectionable;</li>
           <li>Harm minors in any way;</li>
           <li>Impersonate any person or entity or falsely state or otherwise misrepresent your affiliation with a person or entity;</li>
           <li>Interfere with or disrupt the Service or servers or networks connected to the Service.</li>
           {/* Add other conduct rules */}
         </ul>

          <h2 className="text-2xl font-semibold">4. Intellectual Property</h2>
         <p>
            The Service and its original content, features, and functionality are and will remain the exclusive property of Aidoraa and its licensors. The Service is protected by copyright, trademark, and other laws of both the [Your Country] and foreign countries. Our trademarks and trade dress may not be used in connection with any product or service without the prior written consent of Aidoraa.
         </p>


         <h2 className="text-2xl font-semibold">5. Disclaimers</h2>
         <p>
           Your use of the Service is at your sole risk. The Service is provided on an "AS IS" and "AS AVAILABLE" basis. The Service is provided without warranties of any kind, whether express or implied, including, but not limited to, implied warranties of merchantability, fitness for a particular purpose, non-infringement, or course of performance.
         </p>
         <p>
           Aidoraa does not warrant that a) the Service will function uninterrupted, secure, or available at any particular time or location; b) any errors or defects will be corrected; c) the Service is free of viruses or other harmful components; or d) the results of using the Service will meet your requirements. AI-generated content may contain inaccuracies or errors.
         </p>

          <h2 className="text-2xl font-semibold">6. Limitation of Liability</h2>
          <p>
             In no event shall Aidoraa, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from (i) your access to or use of or inability to access or use the Service; (ii) any conduct or content of any third party on the Service; (iii) any content obtained from the Service; and (iv) unauthorized access, use, or alteration of your transmissions or content, whether based on warranty, contract, tort (including negligence), or any other legal theory, whether or not we have been informed of the possibility of such damage, and even if a remedy set forth herein is found to have failed of its essential purpose.
          </p>

        <h2 className="text-2xl font-semibold">7. Changes to Terms</h2>
        <p>
          We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If a revision is material we will provide at least 30 days' notice prior to any new terms taking effect. What constitutes a material change will be determined at our sole discretion. By continuing to access or use our Service after any revisions become effective, you agree to be bound by the revised terms.
        </p>

        <h2 className="text-2xl font-semibold">8. Contact Us</h2>
        <p>
          If you have any questions about these Terms, please contact us at: [Your Contact Email/Link]
        </p>

         <p className="mt-8 text-sm text-muted-foreground">
              [Note: This is a template and should be reviewed and customized by a legal professional.]
         </p>
      </div>
    </div>
  );
}
