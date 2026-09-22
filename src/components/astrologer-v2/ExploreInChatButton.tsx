'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ExploreInChatButton({ personId, objectId, personRevision, className }: { personId: string; objectId: string; personRevision: number; className?: string }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'creating' | 'failed'>('idle');
  async function open() {
    setState('creating');
    const response = await fetch(`/api/astrologer/profiles/${personId}/explorations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ objectId, expectedRevision: personRevision, clientCommandId: crypto.randomUUID() }),
    });
    const body = (await response.json().catch(() => null)) as { sessionId?: string } | null;
    if (!response.ok || !body?.sessionId) { setState('failed'); return; }
    router.push(`/astrologer/p/${personId}/chat/${body.sessionId}`);
  }
  return <button type="button" onClick={() => void open()} disabled={state === 'creating'} className={cn('inline-flex items-center gap-2 rounded-md bg-[#c5954f] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60', className)}>{state === 'creating' ? 'Opening…' : state === 'failed' ? 'Try again' : 'Explore in chat'} <ArrowRight className="h-4 w-4" /></button>;
}
