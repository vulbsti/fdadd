'use client';

/**
 * Persisted astrologer chat surface. Consumes the astrologer contracts only —
 * no FashionDaddy mock types. Messages render by canonical UUID; focused
 * questions render above the composer; operational errors get a separate
 * surface and never become AI bubbles.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, SendHorizonal } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  ApiErrorDto,
  AstrologerMessage,
  AstrologerSessionDetail,
  FocusedQuestion,
  StartRunResponse,
} from '@/lib/astro/contracts';

interface AstrologerChatProps {
  sessionId: string;
  className?: string;
  onSessionUpdated?: (detail: AstrologerSessionDetail) => void;
  onStartNewReading?: () => void;
}

type SendState = 'idle' | 'sending' | 'streaming';

export default function AstrologerChat({
  sessionId,
  className,
  onSessionUpdated,
  onStartNewReading,
}: AstrologerChatProps) {
  const [messages, setMessages] = useState<AstrologerMessage[]>([]);
  const [detail, setDetail] = useState<AstrologerSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendState, setSendState] = useState<SendState>('idle');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<ApiErrorDto | null>(null);
  const [focusedQuestion, setFocusedQuestion] = useState<FocusedQuestion | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const eventRunIdRef = useRef<string | null>(null);

  const loadDetail = useCallback(async (): Promise<AstrologerSessionDetail | null> => {
    const response = await fetch(`/api/astrologer/sessions/${sessionId}`);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as ApiErrorDto | null;
      setError(payload ?? { code: 'internal', message: 'Could not load session.' });
      setLoading(false);
      return null;
    }
    const data = (await response.json()) as AstrologerSessionDetail;
    setDetail(data);
    setMessages(data.messages);
    setFocusedQuestion(data.session.currentQuestion ?? null);
    onSessionUpdated?.(data);
    setError(null);
    setLoading(false);
    return data;
  }, [onSessionUpdated, sessionId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refresh = async () => {
      const data = await loadDetail();
      if (cancelled) return;
      if (data === null || data.profile?.initializationStatus === 'pending') {
        timer = setTimeout(() => void refresh(), 2500);
      }
    };

    void refresh();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      eventRunIdRef.current = null;
    };
  }, [loadDetail]);

  const connectEvents = useCallback(
    (runId: string, after?: number) => {
      if (eventRunIdRef.current === runId && eventSourceRef.current) return;
      eventSourceRef.current?.close();
      eventRunIdRef.current = runId;
      const url = `/api/astrologer/runs/${runId}/events${after ? `?after=${after}` : ''}`;
      const source = new EventSource(url);
      eventSourceRef.current = source;
      source.addEventListener('answer.ready', () => void loadDetail());
      source.addEventListener('run.completed', () => {
        source.close();
        eventRunIdRef.current = null;
        setSendState('idle');
        void loadDetail();
      });
      source.addEventListener('run.failed', () => {
        source.close();
        eventRunIdRef.current = null;
        setSendState('idle');
        void loadDetail();
      });
      source.onerror = () => {
        // EventSource reconnects automatically with Last-Event-ID.
      };
    },
    [loadDetail],
  );

  useEffect(() => {
    if (detail?.profile?.initializationStatus === 'pending' && detail.latestRun?.kind === 'intake') {
      connectEvents(detail.latestRun.id);
    }
  }, [connectEvents, detail]);

  const send = useCallback(
    async (text: string, answerToQuestionId?: string) => {
      if (sendState !== 'idle') return;
      setSendState('sending');
      setError(null);
      const clientMessageId = crypto.randomUUID();
      try {
        const response = await fetch('/api/astrologer/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            message: text,
            clientMessageId,
            ...(answerToQuestionId ? { answerToQuestionId } : {}),
          }),
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as ApiErrorDto | null;
          setError(payload ?? { code: 'internal', message: 'Could not send message.' });
          setSendState('idle');
          return;
        }
        const started = (await response.json()) as StartRunResponse;
        setSendState('streaming');
        setFocusedQuestion(null);
        connectEvents(started.runId);
      } catch {
        setError({ code: 'internal', message: 'Network error.' });
        setSendState('idle');
      }
    },
    [connectEvents, sendState, sessionId],
  );

  const submitDraft = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    void send(text);
  }, [draft, send]);

  if (loading) {
    return (
      <div className={cn('flex flex-col gap-3 p-4', className)}>
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-12 w-3/4" />
      </div>
    );
  }

  const busy = sendState !== 'idle';
  const latestRun = detail?.latestRun ?? null;
  const intakeFailed = detail?.profile?.initializationStatus === 'failed' && latestRun?.kind === 'intake';
  const resumableFailed = latestRun?.kind === 'question' && latestRun.status === 'failed' && latestRun.resumable;
  const canChat = detail?.profile?.initializationStatus === 'ready';

  const resume = async () => {
    const response = await fetch(`/api/astrologer/runs/${latestRun?.id}/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientRequestId: crypto.randomUUID() }),
    });
    if (response.ok) {
      const started = (await response.json()) as StartRunResponse;
      connectEvents(started.runId);
    }
  };

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {detail?.profile?.initializationStatus === 'pending' && !resumableFailed ? (
        <div className="border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
          <Loader2 className="mr-2 inline h-3 w-3 animate-spin" />
          Calculating your chart — this takes about a minute. You&apos;ll be able to chat as soon as it&apos;s ready.
        </div>
      ) : intakeFailed ? (
        <div className="border-b bg-destructive/10 px-4 py-3 text-xs text-destructive" role="alert">
          <p>{detail?.profile?.initializationError ?? 'Chart calculation failed before the reading was ready.'}</p>
          {onStartNewReading ? (
            <Button variant="outline" size="sm" className="mt-2" onClick={onStartNewReading}>
              Start a new reading
            </Button>
          ) : null}
        </div>
      ) : (detail?.session.nextAction || latestRun?.phase) && !resumableFailed ? (
        <div className="border-b px-4 py-2 text-xs text-muted-foreground">
          {latestRun?.phase ? <span className="mr-2 uppercase">{latestRun.phase}</span> : null}
          {detail?.session.nextAction}
        </div>
      ) : null}

      <ScrollArea className="flex-1 p-4">
        <div className="flex flex-col gap-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'flex gap-2',
                message.role === 'user' ? 'justify-end' : 'justify-start',
              )}
            >
              {message.role === 'assistant' ? (
                <Avatar className="h-7 w-7">
                  <AvatarFallback>☉</AvatarFallback>
                </Avatar>
              ) : null}
              <div
                className={cn(
                  'max-w-[75%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap',
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted',
                )}
              >
                {message.content}
              </div>
            </div>
          ))}
          {busy ? (
            <div className="text-xs text-muted-foreground">Consulting the chart…</div>
          ) : null}
        </div>
      </ScrollArea>

      {error && !intakeFailed ? (
        <div className="border-t bg-destructive/10 px-4 py-2 text-xs text-destructive" role="alert">
          {error.message}
          {error.resumable && latestRun ? (
            <Button variant="outline" size="sm" className="ml-2" onClick={() => void resume()}>
              Resume
            </Button>
          ) : null}
        </div>
      ) : null}

      {resumableFailed ? (
        <div className="border-t px-4 py-2 text-xs">
          The last run failed.{' '}
          <Button variant="outline" size="sm" onClick={() => void resume()}>
            Resume
          </Button>
        </div>
      ) : null}

      {focusedQuestion ? (
        <div className="border-t px-4 py-3">
          <p className="mb-2 text-sm">{focusedQuestion.prompt}</p>
          {focusedQuestion.responseKind === 'single_choice' ? (
            <div className="flex flex-wrap gap-2">
              {focusedQuestion.options.map((option) => (
                <Button
                  key={option.id}
                  variant={option.kind === 'control' ? 'outline' : 'secondary'}
                  size="sm"
                  onClick={() => void send(option.label, focusedQuestion.id)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          ) : null}
          {focusedQuestion.allowFreeText ? (
            <p className="mt-2 text-xs text-muted-foreground">
              …or type a free answer below.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-2 border-t p-3">
        <Input
          placeholder="Ask your astrologer…"
          value={draft}
          disabled={busy || !canChat}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submitDraft();
            }
          }}
        />
        <Button size="icon" disabled={busy || !canChat || draft.trim().length === 0} onClick={submitDraft}>
          <SendHorizonal className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
