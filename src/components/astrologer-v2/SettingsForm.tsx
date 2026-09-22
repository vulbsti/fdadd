'use client';

import { useState } from 'react';
import { Switch } from '@/components/ui/switch';

export default function SettingsForm({ personId, name, astrologyEnabled, modeEpoch, hasBirth }: { personId: string; name: string; astrologyEnabled: boolean; modeEpoch: number; hasBirth: boolean }) {
  const [enabled, setEnabled] = useState(astrologyEnabled);
  const [status, setStatus] = useState<string | null>(null);
  async function change(next: boolean) {
    if (next && !hasBirth) { setStatus('Add complete birth information before enabling the astrology layer. Your personal map remains available.'); return; }
    setStatus('Saving…');
    const response = await fetch(`/api/astrologer/profiles/${personId}/preferences`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ astrologyEnabled: next, expectedModeEpoch: modeEpoch, clientCommandId: crypto.randomUUID() }),
    });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) { setStatus(body?.message ?? 'Could not save this setting.'); return; }
    setEnabled(next); setStatus(next ? 'Astrology layer enabled.' : 'Personal-only mode enabled. In-flight old-mode answers cannot publish.');
    window.location.reload();
  }
  return (
    <div className="max-w-3xl px-5 py-10 md:px-10">
      <h1 className="font-serif text-5xl">Settings</h1>
      <p className="mt-2 text-[#52627a]">Preferences for {name}.</p>
      <section className="mt-8 rounded-md border border-[#ded9d0] p-6">
        <div className="flex items-start justify-between gap-6"><div><h2 className="font-serif text-2xl">Astrology layer</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[#52627a]">When off, calculations, interpretations, astrological suggestions, and Atros tools are excluded from new runs and profile views. Personal history remains.</p></div><Switch checked={enabled} onCheckedChange={(next) => void change(next)} aria-label="Astrology layer" /></div>
        {!hasBirth ? <p className="mt-4 rounded-md bg-[#f5f0e8] p-3 text-sm">No birth profile is configured. Personal-only mode is fully available.</p> : null}
        {status ? <p role="status" className="mt-4 text-sm text-[#40516d]">{status}</p> : null}
      </section>
      <section className="mt-5 rounded-md border border-[#ded9d0] p-6"><h2 className="font-serif text-2xl">Privacy & data</h2><p className="mt-2 text-sm leading-6 text-[#52627a]">This person is owner-only. Source exclusion, export, and deletion require explicit confirmed operations; no public-sharing mode is enabled.</p></section>
    </div>
  );
}
