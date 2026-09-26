'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, UserRound } from 'lucide-react';

export default function FirstPerson() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const command = useRef<{ name: string; id: string } | null>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true); setError(null);
    const trimmedName = name.trim();
    if (command.current?.name !== trimmedName) command.current = { name: trimmedName, id: crypto.randomUUID() };
    try {
      const response = await fetch('/api/astrologer/profiles', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: trimmedName, idempotencyKey: command.current.id }),
      });
      const body = (await response.json().catch(() => null)) as { profileId?: string; message?: string } | null;
      if (!response.ok || !body?.profileId) {
        setError(body?.message ?? 'Could not create this person.');
        return;
      }
      router.push(`/astrologer/p/${body.profileId}/profile/life-map`);
    } catch {
      setError('We could not reach the service. Please try again.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <main className="grid min-h-dvh place-items-center bg-[#fbfaf6] p-5 text-[#112d52]">
      <form onSubmit={submit} className="min-w-0 w-full max-w-xl rounded-lg border border-[#ded9d0] bg-white/45 p-6 shadow-sm sm:p-8 md:p-12">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-[#e7eadf]"><UserRound /></span>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[.2em] text-[#687387]">Begin with a person, not a chart</p>
        <h1 className="mt-3 font-serif text-4xl leading-[1.08] sm:text-5xl">Whose life are we understanding?</h1>
        <p className="mt-4 leading-7 text-[#52627a]">A name is enough. Birth details are optional and can be added later if you choose the astrology layer.</p>
        <label className="mt-8 block text-sm font-medium">Name<input autoFocus required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="Name this person" className="mt-2 h-12 w-full rounded-md border border-[#cfc8bc] bg-white px-4 text-base outline-none focus:ring-2 focus:ring-[#b07a32]" /></label>
        {error ? <p className="mt-3 text-sm text-red-700" role="alert">{error}</p> : null}
        <button disabled={saving || !name.trim()} className="mt-6 inline-flex items-center gap-3 rounded-md bg-[#12375e] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Creating…' : 'Create personal map'} <ArrowRight className="h-4 w-4" /></button>
      </form>
    </main>
  );
}
