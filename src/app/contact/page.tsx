import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import ContactForm from './contact-form';

export default function ContactPage() {
  return (
    <div className="container mx-auto max-w-2xl px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl">Contact Us</CardTitle>
          <CardDescription>
            Have questions or feedback? Fill out the form below and we'll get back to you as soon as possible.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ContactForm />
        </CardContent>
      </Card>
    </div>
  );
}
