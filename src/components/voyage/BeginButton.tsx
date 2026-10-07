'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AuthModal from '@/components/auth/AuthModal';
import { useAuth } from '@/contexts/AuthContext';

/**
 * BeginButton — the one call to action on the marketing pages. Signed-in
 * people go straight to the Astrologer; everyone else gets the sign-up modal
 * (the Astrologer route redirects anonymous visitors back home).
 */
export default function BeginButton({ label = 'Begin with your birth chart' }: { label?: string }) {
  const { user } = useAuth();
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [mode, setMode] = useState<'login' | 'signup'>('signup');

  const className = 'bg-gold text-voyage hover:bg-gold-bright';

  if (user) {
    return (
      <Button asChild size="lg" className={className}>
        <Link href="/astrologer">
          {label} <ArrowRight className="ml-2" size={16} />
        </Link>
      </Button>
    );
  }

  return (
    <>
      <Button size="lg" className={className} onClick={() => setIsAuthOpen(true)}>
        {label} <ArrowRight className="ml-2" size={16} />
      </Button>
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        mode={mode}
        setMode={setMode}
      />
    </>
  );
}
