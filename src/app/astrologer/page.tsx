import { redirect } from 'next/navigation';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import AstrologerApp from '@/components/astrologer/AstrologerApp';

export const dynamic = 'force-dynamic';

export default async function AstrologerPage() {
  if (!isSupabaseConfigured()) redirect('/');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/');

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-bold">Astrologer</h1>
        <p className="text-muted-foreground">
          A Vedic reading grounded in your calculated chart — timing, transits, and tested patterns.
        </p>
      </div>
      <AstrologerApp />
    </div>
  );
}
