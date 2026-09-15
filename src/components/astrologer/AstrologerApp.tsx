'use client';

/**
 * Astrologer shell: explicit summary/detail/run states over persisted data.
 * Mount fetches profiles + session summaries, selects the newest session,
 * and hydrates its detail. Session switches abort stale requests; list
 * failures render errors rather than a false fresh-intake screen.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PanelLeftClose, PanelLeftOpen, MessageSquare, PlusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  AstrologerSessionDetail,
  AstrologerSessionSummary,
  ProfileSummary,
} from '@/lib/astro/contracts';
import AstrologerChat from './AstrologerChat';
import ProfileChooser from './ProfileChooser';

const AstrologerApp: React.FC = () => {
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [sessions, setSessions] = useState<AstrologerSessionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AstrologerSessionDetail | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [choosing, setChoosing] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const detailAbortRef = useRef<AbortController | null>(null);

  const loadSummaries = useCallback(async (): Promise<AstrologerSessionSummary[]> => {
    const response = await fetch('/api/astrologer/sessions');
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setListError(payload?.message ?? 'Could not load sessions.');
      return [];
    }
    const data = (await response.json()) as { sessions: AstrologerSessionSummary[] };
    setListError(null);
    setSessions(data.sessions);
    return data.sessions;
  }, []);

  useEffect(() => {
    Promise.all([
      fetch('/api/astrologer/profiles')
        .then((r) => (r.ok ? r.json() : { profiles: [] }))
        .then((d: { profiles: ProfileSummary[] }) => setProfiles(d.profiles))
        .catch(() => setProfiles([])),
      loadSummaries(),
    ])
      .then(([, sessionList]) => {
        if (sessionList.length > 0) setSelectedId(sessionList[0].id);
        else setChoosing(true);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [loadSummaries]);

  const loadDetail = useCallback(async (sessionId: string) => {
    detailAbortRef.current?.abort();
    const controller = new AbortController();
    detailAbortRef.current = controller;
    setDetailError(null);
    try {
      const response = await fetch(`/api/astrologer/sessions/${sessionId}`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        setDetailError(payload?.message ?? 'Could not load the session.');
        return;
      }
      const data = (await response.json()) as AstrologerSessionDetail;
      setDetail(data);
    } catch {
      // Aborted or network error: keep the previous detail.
    }
  }, []);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const handleSessionOpened = useCallback(
    (sessionId: string) => {
      setChoosing(false);
      setSelectedId(sessionId);
      void loadSummaries();
    },
    [loadSummaries],
  );

  const handleSelect = (sessionId: string) => {
    setSelectedId(sessionId);
  };

  const handleNewReading = () => {
    setChoosing(true);
  };

  const handleChatDetail = useCallback((next: AstrologerSessionDetail) => {
    setDetail(next);
    setSessions((current) =>
      current.map((session) => (session.id === next.session.id ? next.session : session)),
    );
  }, []);

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-12rem)] max-h-[800px] items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground">
        Loading your readings…
      </div>
    );
  }

  return (
    <div className="relative flex h-[calc(100vh-12rem)] max-h-[800px] w-full overflow-hidden rounded-lg border bg-card shadow-lg">
      {/* Sidebar */}
      <div
        className={cn(
          'flex w-64 shrink-0 flex-col border-r transition-all',
          isSidebarOpen ? 'block' : 'hidden',
        )}
      >
        <div className="flex items-center justify-between border-b p-3">
          <span className="text-sm font-medium">Readings</span>
          <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(false)}>
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        </div>
        {listError ? (
          <div className="p-3 text-xs text-destructive">{listError}</div>
        ) : null}
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-1 p-2">
            {sessions.map((session) => (
              <button
                key={session.id}
                className={cn(
                  'flex flex-col items-start rounded-md px-3 py-2 text-left text-sm hover:bg-accent',
                  session.id === selectedId && 'bg-accent',
                )}
                onClick={() => handleSelect(session.id)}
              >
                <span className="line-clamp-1 font-medium">{session.title}</span>
                <span className="text-xs text-muted-foreground">
                  {session.profileName ?? '—'} · {session.status}
                  {session.lastMessagePreview ? ` · ${session.lastMessagePreview}` : ''}
                </span>
              </button>
            ))}
          </div>
        </ScrollArea>
        <div className="border-t p-2">
          <Button variant="ghost" className="w-full justify-start" onClick={handleNewReading}>
            <PlusCircle className="mr-2 h-4 w-4" /> New Reading
          </Button>
        </div>
      </div>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {!isSidebarOpen ? (
          <div className="border-b p-2">
            <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(true)}>
              <PanelLeftOpen className="h-4 w-4" />
            </Button>
          </div>
        ) : null}

        {choosing ? (
          <div className="flex flex-1 items-center justify-center p-4">
            <ProfileChooser onSessionOpened={handleSessionOpened} />
          </div>
        ) : selectedId && detailError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4">
            <p className="text-sm text-destructive">{detailError}</p>
            <Button variant="outline" onClick={() => selectedId && void loadDetail(selectedId)}>
              Retry
            </Button>
          </div>
        ) : selectedId && detail ? (
          <AstrologerChat
            sessionId={selectedId}
            className="flex-1"
            onSessionUpdated={handleChatDetail}
            onStartNewReading={handleNewReading}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
            <MessageSquare className="h-4 w-4" /> Select a reading or start a new one.
          </div>
        )}
      </div>
    </div>
  );
};

export default AstrologerApp;
