'use client';

/**
 * New Reading profile chooser: an owned ready profile or "Add a new person".
 * Selecting an existing person creates a fresh session on the same
 * profile/person map; a new person renders the birth intake form.
 */

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { UserPlus, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProfileSummary } from '@/lib/astro/contracts';
import BirthIntakeForm from './BirthIntakeForm';

interface ProfileChooserProps {
  onSessionOpened: (sessionId: string) => void;
  className?: string;
}

export default function ProfileChooser({ onSessionOpened, className }: ProfileChooserProps) {
  const [profiles, setProfiles] = useState<ProfileSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addingPerson, setAddingPerson] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/astrologer/profiles')
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load profiles.');
        const data = (await response.json()) as { profiles: ProfileSummary[] };
        setProfiles(data.profiles);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const openExisting = async (profile: ProfileSummary) => {
    setCreating(profile.id);
    setError(null);
    const response = await fetch('/api/astrologer/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'existing_profile', profileId: profile.id }),
    });
    setCreating(null);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setError(payload?.message ?? 'Could not open a session.');
      return;
    }
    const created = (await response.json()) as { sessionId: string };
    onSessionOpened(created.sessionId);
  };

  if (profiles === null && !error) {
    return (
      <div className={cn('mx-auto w-full max-w-xl space-y-3', className)}>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (addingPerson) {
    return <BirthIntakeForm onSessionOpened={onSessionOpened} />;
  }

  const readyProfiles = (profiles ?? []).filter((p) => p.initializationStatus === 'ready');

  return (
    <div className={cn('mx-auto w-full max-w-xl space-y-3', className)}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <Users className="h-4 w-4" /> Who is this reading for?
      </div>
      {error ? <div className="text-sm text-destructive">{error}</div> : null}
      {readyProfiles.map((profile) => (
        <Button
          key={profile.id}
          variant="outline"
          className="h-auto w-full justify-start py-3"
          disabled={creating === profile.id}
          onClick={() => void openExisting(profile)}
        >
          <span className="flex flex-col items-start">
            <span>{profile.name}</span>
            <span className="text-xs text-muted-foreground">
              Continue with this person&apos;s map
            </span>
          </span>
        </Button>
      ))}
      <Button
        variant="secondary"
        className="h-auto w-full justify-start py-3"
        onClick={() => setAddingPerson(true)}
      >
        <UserPlus className="mr-2 h-4 w-4" />
        Add a new person
      </Button>
    </div>
  );
}
