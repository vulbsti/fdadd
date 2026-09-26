'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ChevronDown,
  Download,
  LockKeyhole,
  MessageCircle,
  Plus,
  Search,
  Settings,
  X,
} from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { WorkspaceConversation, WorkspacePerson } from './types';
import { subscribePersonState } from '@/components/astrologer/person-state-sync';

interface WorkspaceShellProps {
  person: WorkspacePerson;
  people: WorkspacePerson[];
  conversations: WorkspaceConversation[];
  children: React.ReactNode;
}

export default function WorkspaceShell({ person, people, conversations, children }: WorkspaceShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<{ sessionId: string; sessionTitle: string; messageId: string; role: string; excerpt: string }>>([]);
  const [searching, setSearching] = useState(false);
  const filtered = useMemo(
    () => conversations.filter((item) => item.title.toLowerCase().includes(search.toLowerCase())),
    [conversations, search],
  );
  const isChat = pathname.includes('/chat/');

  useEffect(() => subscribePersonState(person.id, () => router.refresh()), [person.id, router]);

  useEffect(() => {
    // Settings may have changed in another tab. Revalidate the server-owned
    // shell as well as chat state without replacing the mounted conversation.
    const refresh = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [router]);

  useEffect(() => {
    const query = search.trim();
    if (query.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`/api/astrologer/profiles/${person.id}/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (response.ok) {
          const payload = await response.json() as { results?: Array<{ sessionId: string; sessionTitle: string; messageId: string; role: string; excerpt: string }> };
          setSearchResults(payload.results ?? []);
        } else {
          setSearchResults([]);
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setSearchResults([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [person.id, search]);

  async function createConversation() {
    if (creating) return;
    setCreating(true);
    try {
      const response = await fetch('/api/astrologer/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'existing_profile', profileId: person.id }),
      });
      const payload = (await response.json().catch(() => null)) as { sessionId?: string; message?: string } | null;
      if (!response.ok || !payload?.sessionId) throw new Error(payload?.message ?? 'Could not create a conversation.');
      router.push(`/astrologer/p/${person.id}/chat/${payload.sessionId}`);
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not create a conversation.');
    } finally {
      setCreating(false);
    }
  }

  const sidebar = (
    <aside className="flex h-full min-h-0 flex-col bg-[#f6f2ea] text-[#102d53]">
      <div className="px-5 pb-5 pt-6">
        <Link href={`/astrologer/p/${person.id}/profile/life-map`} className="font-serif text-[36px] leading-none tracking-[-0.04em]">
          aidoraa
        </Link>
      </div>
      <div className="border-y border-[#ded9d0] px-3 py-4">
        <label className="sr-only" htmlFor="person-switcher">Person</label>
        <div className="relative">
          <select
            id="person-switcher"
            value={person.id}
            onChange={(event) => router.push(`/astrologer/p/${event.target.value}/profile/life-map`)}
            className="h-14 w-full appearance-none rounded-md border border-[#d8d1c5] bg-white/40 px-14 pr-10 text-[15px] font-medium outline-none focus:ring-2 focus:ring-[#b07a32]"
          >
            {people.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <span aria-hidden className="absolute left-3 top-2 grid h-10 w-10 place-items-center rounded-full bg-[#dfd8cc] font-serif text-lg">
            {person.name.slice(0, 1).toUpperCase()}
          </span>
          <ChevronDown aria-hidden className="absolute right-3 top-5 h-4 w-4" />
        </div>
        <p className="mt-2 pl-1 text-xs text-[#687387]">Private · {person.mode === 'astrology' ? 'Astrology on' : 'Personal only'}</p>
      </div>
      <div className="space-y-3 px-3 py-4">
        <button
          type="button"
          onClick={createConversation}
          disabled={creating}
          className="flex h-12 w-full items-center justify-center gap-3 rounded-md bg-[#12375e] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0c2c4e] disabled:opacity-60"
        >
          <Plus className="h-5 w-5" /> {creating ? 'Creating…' : 'New conversation'}
        </button>
        <label className="relative block">
          <span className="sr-only">Search recent conversations</span>
          <Search aria-hidden className="absolute left-3 top-3.5 h-4 w-4 text-[#637087]" />
          <input
            value={search}
            onChange={(event) => {
              const value = event.target.value;
              setSearch(value);
              if (value.trim().length < 2) {
                setSearchResults([]);
                setSearching(false);
              }
            }}
            placeholder="Search conversations"
            className="h-11 w-full rounded-md border border-[#d8d1c5] bg-white/40 pl-10 pr-3 text-sm outline-none placeholder:text-[#687387] focus:ring-2 focus:ring-[#b07a32]"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
        {search.trim().length >= 2 ? <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#687387]">Message matches</p> : <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#687387]">Recent</p>}
        <ul className="space-y-1">
          {search.trim().length >= 2 ? searchResults.map((result) => (
            <li key={result.messageId}>
              <Link
                href={`/astrologer/p/${person.id}/chat/${result.sessionId}?messageId=${result.messageId}`}
                className="block rounded-md border-l-2 border-transparent px-2 py-2.5 text-[13px] leading-snug transition hover:border-[#b07a32] hover:bg-white/50"
              >
                <strong className="block truncate text-[#173e67]">{result.sessionTitle}</strong>
                <span className="mt-1 line-clamp-2 block text-[#687387]">{result.excerpt}</span>
              </Link>
            </li>
          )) : filtered.map((conversation) => {
            const active = pathname.includes(`/chat/${conversation.id}`);
            return (
              <li key={conversation.id}>
                <Link
                  href={`/astrologer/p/${person.id}/chat/${conversation.id}`}
                  className={cn(
                    'flex gap-3 rounded-md border-l-2 px-2 py-2.5 text-[14px] leading-snug transition hover:bg-white/50',
                    active ? 'border-[#b07a32] bg-[#eee7dd]' : 'border-transparent',
                  )}
                >
                  <MessageCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{conversation.title}</span>
                </Link>
              </li>
            );
          })}
          {search.trim().length >= 2 && searching ? <li className="px-2 py-4 text-sm text-[#687387]">Searching messages…</li> : null}
          {search.trim().length >= 2 && !searching && searchResults.length === 0 ? <li className="px-2 py-4 text-sm text-[#687387]">No matching messages.</li> : null}
          {search.trim().length < 2 && filtered.length === 0 ? <li className="px-2 py-4 text-sm text-[#687387]">No matching conversations.</li> : null}
        </ul>
      </div>
      <div className="border-t border-[#ded9d0] p-4 text-sm">
        <Link className="flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-white/50" href={`/astrologer/p/${person.id}/imports`}>
          <Download className="h-4 w-4" /> Import conversations
        </Link>
        <Link className="flex items-center gap-3 rounded-md px-2 py-2.5 hover:bg-white/50" href={`/astrologer/p/${person.id}/settings`}>
          <Settings className="h-4 w-4" /> Settings
        </Link>
      </div>
    </aside>
  );

  return (
    <div className="h-dvh overflow-hidden bg-[#fbfaf6] text-[#112d52]">
      <button
        type="button"
        aria-label="Open navigation"
        onClick={() => setMobileSidebar(true)}
        className="fixed left-3 top-3 z-30 grid h-10 w-10 place-items-center rounded-full border bg-[#fbfaf6] shadow md:hidden"
      >
        <span className="text-xl">a</span>
      </button>
      <div className="hidden h-full w-[270px] border-r border-[#ded9d0] md:fixed md:inset-y-0 md:left-0 md:block">{sidebar}</div>
      {mobileSidebar ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-black/25" onClick={() => setMobileSidebar(false)} />
          <div className="relative h-full w-[min(88vw,320px)] border-r border-[#ded9d0] shadow-xl">
            <button type="button" aria-label="Close navigation" onClick={() => setMobileSidebar(false)} className="absolute right-3 top-3 z-10 p-2"><X /></button>
            {sidebar}
          </div>
        </div>
      ) : null}
      <div className="flex h-full min-w-0 flex-col md:ml-[270px]">
        <header className="flex h-[60px] shrink-0 items-end justify-between border-b border-[#ded9d0] px-14 md:px-10">
          <nav aria-label="Workspace" className="flex h-full items-end gap-8">
            <Link href={conversations[0] ? `/astrologer/p/${person.id}/chat/${conversations[0].id}` : `/astrologer/p/${person.id}/profile/life-map`} className={cn('border-b-2 px-1 pb-4 text-[15px]', isChat ? 'border-[#b07a32] font-semibold' : 'border-transparent')}>Chat</Link>
            <Link href={`/astrologer/p/${person.id}/profile/life-map`} className={cn('border-b-2 px-1 pb-4 text-[15px]', !isChat ? 'border-[#0e3158] font-semibold' : 'border-transparent')}>Profile</Link>
          </nav>
          <Sheet>
            <SheetTrigger asChild>
              <button type="button" className="mb-4 flex items-center gap-2 text-sm"><LockKeyhole className="h-4 w-4" /> Private</button>
            </SheetTrigger>
            <SheetContent className="bg-[#fbfaf6]">
              <SheetHeader>
                <SheetTitle>Privacy & access</SheetTitle>
                <SheetDescription>Current access and processing details for {person.name}.</SheetDescription>
              </SheetHeader>
              <div className="mt-8 space-y-6 text-sm leading-6 text-[#40516d]">
                <section><h3 className="font-serif text-lg text-[#112d52]">Access</h3><p>This person is available only to the signed-in account. Public sharing is not enabled.</p></section>
                <section><h3 className="font-serif text-lg text-[#112d52]">Processing</h3><p>Aidoraa uses application storage and the configured AI provider to answer and update this profile.</p></section>
                <section><h3 className="font-serif text-lg text-[#112d52]">Included context</h3><p>Included conversations and accepted source accounts may contribute to the person model.</p></section>
                <Link className="inline-flex underline underline-offset-4" href={`/astrologer/p/${person.id}/settings`}>Open data controls</Link>
              </div>
            </SheetContent>
          </Sheet>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
