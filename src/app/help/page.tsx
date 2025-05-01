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
          <AccordionTrigger className="text-lg">What is FashionDaddy?</AccordionTrigger>
          <AccordionContent className="text-base text-muted-foreground">
            FashionDaddy is your personal AI stylist. You can chat with it to get outfit suggestions, ask fashion-related questions, get advice on what to wear for specific occasions, and even get help organizing your virtual wardrobe (feature coming soon!).
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="item-2">
          <AccordionTrigger className="text-lg">How does DatePlanner work?</AccordionTrigger>
          <AccordionContent className="text-base text-muted-foreground">
            Simply describe the type of date you're planning (e.g., occasion, desired vibe, preferences for food or activity). Our AI will analyze your input and generate suggestions for outfits, locations, and activities tailored to your description.
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
             If you experience any issues or have further questions, please don't hesitate to <a href="/contact" className="text-primary underline hover:no-underline">contact our support team</a>. We're here to help!
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
