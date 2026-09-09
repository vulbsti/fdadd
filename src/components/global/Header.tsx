
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Menu, User, LogOut, LogIn, UserPlus, Palette } from 'lucide-react'; // Added Palette icon
import { useAuth } from '@/contexts/AuthContext';
import { useState } from 'react';
import AuthModal from '@/components/auth/AuthModal';
import { cn } from '@/lib/utils'; // Import cn utility

const NAV_LINKS = [
  { href: '/fashiondaddy', label: 'FashionDaddy' },
  { href: '/dateplanner', label: 'DatePlanner' },
  { href: '/aesthetic-quiz', label: 'Aesthetic Quiz' }, // Added Quiz link
  { href: '/blog', label: 'Blog' },
  { href: '/about', label: 'About' },
  { href: '/help', label: 'Help' },
];

export default function Header() {
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');


  const openAuthModal = (mode: 'login' | 'signup') => {
    setAuthMode(mode);
    setIsAuthModalOpen(true);
     if (isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
     }
  };

  const handleSignOut = async () => {
      const result = await signOut();
      if (result.ok) {
        router.push('/');
        router.refresh();
      }
       if (isMobileMenuOpen) {
          setIsMobileMenuOpen(false);
       }
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="text-2xl font-serif font-bold text-primary">
          aidoraa
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden items-center space-x-8 md:flex"> {/* Increased space */}
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "relative text-sm font-medium text-muted-foreground transition-colors duration-300 ease-in-out hover:text-foreground",
                "after:absolute after:bottom-[-2px] after:left-0 after:h-[1px] after:w-0 after:bg-primary after:transition-all after:duration-300 after:ease-in-out hover:after:w-full" // Underline animation
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Auth Buttons & Mobile Menu Trigger */}
        <div className="flex items-center gap-2">
          {loading ? (
             <div className="h-8 w-20 animate-pulse rounded-md bg-muted"></div>
          ) : user ? (
            <div className="hidden items-center gap-2 md:flex">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/profile">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </Link>
              </Button>
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </Button>
            </div>
          ) : (
            <div className="hidden items-center gap-2 md:flex">
              <Button variant="ghost" size="sm" onClick={() => openAuthModal('login')}>
                 <LogIn className="mr-2 h-4 w-4" /> Login
              </Button>
              <Button size="sm" onClick={() => openAuthModal('signup')}>
                <UserPlus className="mr-2 h-4 w-4" /> Sign Up
              </Button>
            </div>
          )}

          {/* Mobile Menu Button */}
          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle Menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] sm:w-[400px]">
              <nav className="flex flex-col gap-4 pt-8">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="block rounded-md px-2 py-1 text-lg font-medium text-foreground hover:bg-accent" // Kept mobile simple
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {link.label === 'Aesthetic Quiz' && <Palette className="mr-2 inline h-5 w-5" />} {/* Icon for Quiz */}
                    {link.label}
                  </Link>
                ))}
                 <hr className="my-4" />
                 {loading ? (
                    <div className="h-10 w-full animate-pulse rounded-md bg-muted"></div>
                 ) : user ? (
                   <>
                      <Button variant="ghost" className="justify-start text-lg" asChild>
                        <Link href="/profile" onClick={() => setIsMobileMenuOpen(false)}>
                          <User className="mr-2 h-5 w-5" />
                          Profile
                        </Link>
                      </Button>
                      <Button variant="outline" className="justify-start text-lg" onClick={handleSignOut}>
                        <LogOut className="mr-2 h-5 w-5" />
                        Logout
                      </Button>
                   </>
                 ) : (
                    <>
                      <Button variant="ghost" className="justify-start text-lg" onClick={() => openAuthModal('login')}>
                        <LogIn className="mr-2 h-5 w-5" /> Login
                      </Button>
                      <Button className="justify-start text-lg" onClick={() => openAuthModal('signup')}>
                        <UserPlus className="mr-2 h-5 w-5" /> Sign Up
                      </Button>
                   </>
                 )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
       <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          mode={authMode}
          setMode={setAuthMode}
        />
    </header>
  );
}
