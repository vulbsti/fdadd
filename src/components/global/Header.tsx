'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Menu, User, LogOut, LogIn, UserPlus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useState } from 'react';
import AuthModal from '@/components/auth/AuthModal';

const NAV_LINKS = [
  { href: '/fashiondaddy', label: 'FashionDaddy' },
  { href: '/dateplanner', label: 'DatePlanner' },
  { href: '/blog', label: 'Blog' },
  { href: '/about', label: 'About' },
  { href: '/help', label: 'Help' },
];

export default function Header() {
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
      await signOut();
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
        <nav className="hidden items-center space-x-6 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
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
              <Button variant="ghost" size="sm">
                <User className="mr-2 h-4 w-4" />
                Profile
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
                    className="block px-2 py-1 text-lg font-medium text-foreground hover:bg-accent rounded-md"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {link.label}
                  </Link>
                ))}
                 <hr className="my-4" />
                 {loading ? (
                    <div className="h-10 w-full animate-pulse rounded-md bg-muted"></div>
                 ) : user ? (
                   <>
                      <Button variant="ghost" className="justify-start text-lg">
                        <User className="mr-2 h-5 w-5" />
                        Profile
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
