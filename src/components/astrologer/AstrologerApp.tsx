'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PanelLeftClose, PanelLeftOpen, PlusCircle, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import ChatInterface from '@/components/fashiondaddy/ChatInterface';
import type { ChatMessage, ChatSession } from '@/components/fashiondaddy/FashionDaddyApp';
import BirthIntakeForm from './BirthIntakeForm';

interface SessionRow {
  id: string;
  profile_id: string | null;
  created_at: string;
  updated_at: string;
}

async function readSseText(response: Response, onChunk: (text: string) => void): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice('data:'.length).trim();
      if (payload === '[DONE]') return;
      try {
        onChunk(JSON.parse(payload) as string);
      } catch {
        // Ignore malformed chunks; the stream is append-only text.
      }
    }
  }
}

const AstrologerApp: React.FC = () => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentChat, setCurrentChat] = useState<ChatSession | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [needsIntake, setNeedsIntake] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/astrologer/sessions');
        const payload = await response.json().catch(() => null);
        if (cancelled || !response.ok) return;
        const rows = (payload?.sessions ?? []) as SessionRow[];
        const mapped: ChatSession[] = rows.map((row, index) => ({
          id: row.id,
          title: row.profile_id ? `Reading ${rows.length - index}` : 'New reading',
          lastUpdated: new Date(row.updated_at).getTime(),
          messages: [],
        }));
        setSessions(mapped);
        if (mapped.length === 0) setNeedsIntake(true);
        else setCurrentChat(mapped[0]);
      } finally {
        if (!cancelled) setIsLoadingHistory(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelectChat = (sessionId: string) => {
    const found = sessions.find((session) => session.id === sessionId) ?? null;
    setCurrentChat(found);
    setNeedsIntake(false);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const handleNewChat = () => {
    setCurrentChat(null);
    setNeedsIntake(true);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const patchChat = useCallback(
    (chatId: string, updater: (chat: ChatSession) => ChatSession) => {
      setSessions((prev) =>
        prev.map((session) => (session.id === chatId ? updater(session) : session)),
      );
      setCurrentChat((prev) => (prev && prev.id === chatId ? updater(prev) : prev));
    },
    [],
  );

  const handleSessionOpened = useCallback(
    (sessionId: string) => {
      const fresh: ChatSession = {
        id: sessionId,
        title: 'New reading',
        lastUpdated: Date.now(),
        messages: [
          {
            id: `msg${Date.now()}`,
            sender: 'ai',
            text: 'Your chart is calculated and frozen. Ask me about timing, transits, or the patterns shaping this period — or tell me a life event with its date so I can test it against your dasha chain.',
            timestamp: Date.now(),
          },
        ],
      };
      setSessions((prev) => [fresh, ...prev]);
      setCurrentChat(fresh);
      setNeedsIntake(false);
    },
    [],
  );

  const handleSendMessage = async (messageText: string): Promise<void> => {
    if (!currentChat || isSending) return;

    const userMessage: ChatMessage = {
      id: `msg${Date.now()}`,
      sender: 'user',
      text: messageText,
      timestamp: Date.now(),
    };
    patchChat(currentChat.id, (chat) => ({
      ...chat,
      messages: [...chat.messages, userMessage],
      lastUpdated: Date.now(),
    }));

    setIsSending(true);
    try {
      const response = await fetch('/api/astrologer/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentChat.id, message: messageText }),
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error === 'quota_exceeded'
            ? 'You have used today’s 100 tool calls. Come back tomorrow.'
            : (payload?.error ?? 'The reading could not be completed.'),
        );
      }
      const aiId = `msg${Date.now() + 1}`;
      patchChat(currentChat.id, (chat) => ({
        ...chat,
        messages: [...chat.messages, { id: aiId, sender: 'ai', text: '', timestamp: Date.now() }],
      }));
      await readSseText(response, (chunk) => {
        patchChat(currentChat.id, (chat) => ({
          ...chat,
          messages: chat.messages.map((message) =>
            message.id === aiId ? { ...message, text: message.text + chunk } : message,
          ),
          lastUpdated: Date.now(),
        }));
      });
    } catch (error) {
      const text = error instanceof Error ? error.message : 'The reading could not be completed.';
      patchChat(currentChat.id, (chat) => ({
        ...chat,
        messages: [...chat.messages, { id: `msg${Date.now() + 1}`, sender: 'ai', text, timestamp: Date.now() }],
        lastUpdated: Date.now(),
      }));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="relative flex h-[calc(100vh-12rem)] max-h-[800px] w-full overflow-hidden rounded-lg border bg-card shadow-lg">
      <div
        className={cn(
          'absolute left-0 top-0 z-30 flex h-full flex-col border-r bg-secondary/50 transition-transform duration-300 ease-in-out md:relative md:flex-shrink-0',
          isSidebarOpen ? 'translate-x-0 w-full md:w-80' : '-translate-x-full w-full md:w-0 md:-translate-x-0 md:border-none',
        )}
      >
        <div className={cn('flex h-full flex-col overflow-hidden', !isSidebarOpen && 'hidden md:hidden')}>
          <div className="flex items-center justify-between border-b p-2">
            <Button variant="ghost" size="sm" onClick={handleNewChat} className="flex shrink-0 items-center gap-1">
              <PlusCircle size={16} /> New Reading
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(false)} className="h-7 w-7 shrink-0">
              <PanelLeftClose size={18} />
              <span className="sr-only">Close Sidebar</span>
            </Button>
          </div>
          <ScrollArea className="flex-1">
            {isLoadingHistory ? (
              <p className="p-4 text-sm text-muted-foreground">Loading readings…</p>
            ) : sessions.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No readings yet — start one below.</p>
            ) : (
              sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => handleSelectChat(session.id)}
                  className={cn(
                    'flex w-full items-center gap-2 px-4 py-3 text-left text-sm hover:bg-accent',
                    currentChat?.id === session.id && 'bg-accent',
                  )}
                >
                  <MessageSquare size={16} className="shrink-0" />
                  <span className="truncate">{session.title}</span>
                </button>
              ))
            )}
          </ScrollArea>
        </div>
      </div>

      <div className="flex h-full min-w-0 flex-1 flex-col">
        {!isSidebarOpen && (
          <div className="border-b p-2">
            <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(true)} className="h-7 w-7">
              <PanelLeftOpen size={18} />
              <span className="sr-only">Open Sidebar</span>
            </Button>
          </div>
        )}
        {needsIntake || !currentChat ? (
          <div className="flex-1 overflow-y-auto p-4">
            <BirthIntakeForm onSessionOpened={handleSessionOpened} />
          </div>
        ) : (
          <ChatInterface messages={currentChat.messages} onSendMessage={handleSendMessage} isLoading={isSending} />
        )}
      </div>
    </div>
  );
};

export default AstrologerApp;
