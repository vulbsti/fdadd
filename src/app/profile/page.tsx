import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle>Profile setup pending</CardTitle>
            <CardDescription>
              Supabase credentials have not been added to this environment yet.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/');

  const displayName =
    user.user_metadata.full_name || user.user_metadata.name || user.email || 'Aidoraa member';

  return (
    <div className="container mx-auto max-w-2xl px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle>{displayName}</CardTitle>
          <CardDescription>{user.email}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/billing">Manage access</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/fashiondaddy">Open FashionDaddy</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
