import Link from 'next/link';
import { Github, Twitter, Instagram } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-secondary/50">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          <div>
            <Link href="/" className="text-2xl font-serif font-bold text-primary mb-2 inline-block">
              aidoraa
            </Link>
            <p className="text-sm leading-relaxed text-muted-foreground">
              AI for the oldest journey there is — the one inward.
            </p>
          </div>
          <div className="flex flex-col space-y-2 text-sm">
            <h4 className="font-semibold mb-2 text-foreground">Quick Links</h4>
            <Link href="/about" className="text-muted-foreground hover:text-foreground transition-colors">About Us</Link>
            <Link href="/blog" className="text-muted-foreground hover:text-foreground transition-colors">Blog</Link>
            <Link href="/help" className="text-muted-foreground hover:text-foreground transition-colors">Help Center</Link>
            <Link href="/contact" className="text-muted-foreground hover:text-foreground transition-colors">Contact</Link>
          </div>
          <div className="flex flex-col space-y-2 text-sm">
             <h4 className="font-semibold mb-2 text-foreground">Legal</h4>
            <Link href="/privacy" className="text-muted-foreground hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="text-muted-foreground hover:text-foreground transition-colors">Terms of Service</Link>
          </div>
        </div>
        <div className="mt-8 border-t border-border pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-sm text-muted-foreground mb-4 md:mb-0">
            &copy; {new Date().getFullYear()} Aidoraa. All rights reserved.
          </p>
          <div className="flex space-x-4">
            <Link href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors">
              <Twitter size={20} />
              <span className="sr-only">Twitter</span>
            </Link>
            <Link href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors">
              <Instagram size={20} />
               <span className="sr-only">Instagram</span>
            </Link>
             <Link href="https://github.com" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors">
              <Github size={20} />
               <span className="sr-only">GitHub</span>
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
