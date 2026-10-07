import type { Metadata } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import './globals.css';
import { cn } from '@/lib/utils';
import { AuthProvider } from '@/contexts/AuthContext';
import { Toaster } from '@/components/ui/toaster';
import SiteChrome from '@/components/global/SiteChrome';

const fontSans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const fontSerif = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-serif',
});

export const metadata: Metadata = {
  title: 'Aidoraa — Know yourself, and how it all connects',
  description:
    'Aidoraa helps you understand yourself, your life, and how it all connects, by reading your Vedic birth chart alongside your own story.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        suppressHydrationWarning // Moved here from <html> to fix hydration error
        className={cn(
          'min-h-screen bg-background font-sans antialiased',
          fontSans.variable,
          fontSerif.variable
        )}
      >
        <AuthProvider>
          <SiteChrome>{children}</SiteChrome>
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
