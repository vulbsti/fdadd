import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

export default function HelpPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-bold mb-12 text-center">Help & FAQ</h1>

      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="item-1">
          <AccordionTrigger className="text-lg">What is Aidoraa?</AccordionTrigger>
          <AccordionContent className="text-base text-muted-foreground">
            Aidoraa helps you understand yourself and everything that shapes you. It brings together your Vedic birth chart, what neuroscience knows about how we decide and what drives us, how the economy and the people around you affect your life, and your own story, into one picture that gets clearer the more you talk. Read <a href="/mission" className="text-primary underline hover:no-underline">our mission</a> for why we are building it.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="item-2">
          <AccordionTrigger className="text-lg">What do I need to start?</AccordionTrigger>
          <AccordionContent className="text-base text-muted-foreground">
            Your date, time and place of birth. Your chart is calculated once from them and kept, so every conversation starts from the same ground. If you are unsure of your birth time, say so: when the chart and your life disagree, Aidoraa will suggest checking it with you before changing anything.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="item-3">
          <AccordionTrigger className="text-lg">Is my data private?</AccordionTrigger>
          <AccordionContent className="text-base text-muted-foreground">
            We take your privacy seriously. Please refer to our <a href="/privacy" className="text-primary underline hover:no-underline">Privacy Policy</a> for detailed information on how we collect, use, and protect your data. User authentication is handled securely via Supabase.
          </AccordionContent>
        </AccordionItem>
         <AccordionItem value="item-4">
          <AccordionTrigger className="text-lg">How do I manage my account?</AccordionTrigger>
          <AccordionContent className="text-base text-muted-foreground">
            Once logged in, you can typically manage your account settings, including email and password changes, through your profile page. Click the user icon or your name in the header to access your profile (functionality may vary based on implementation stage).
          </AccordionContent>
        </AccordionItem>
         <AccordionItem value="item-5">
          <AccordionTrigger className="text-lg">What if I encounter a problem?</AccordionTrigger>
          <AccordionContent className="text-base text-muted-foreground">
             If you experience any issues or have further questions, please don&apos;t hesitate to <a href="/contact" className="text-primary underline hover:no-underline">contact our support team</a>. We&apos;re here to help!
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
