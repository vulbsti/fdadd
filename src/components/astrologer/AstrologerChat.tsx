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
import { Loader2, SendHorizonal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  ApiErrorDto,
  AstrologerSessionDetail,
  FocusedQuestion,
  StartRunResponse,
} from '@/lib/astro/contracts';
import { acknowledgeMessage, mergePersistedMessages, personalOnlyFromModel, takeQueuedMessages, type ChatMessage } from './chat-message-state';
import { subscribePersonState } from './person-state-sync';
import { AssistantMarkdown } from './AssistantMarkdown';
import { applyRunEvent, parseRunEventData, startRunStream, type RunStreamState } from './run-stream-state';
import { watchLiveText } from './live-text';

interface AstrologerChatProps {
  sessionId: string;
  className?: string;
  onSessionUpdated?: (detail: AstrologerSessionDetail) => void;
  onStartNewReading?: () => void;
  personalOnly?: boolean;
  anchorMessageId?: string;
  emptyPrompts?: string[];
}

type SendState = 'idle' | 'sending' | 'streaming';

export default function AstrologerChat(props: AstrologerChatProps) {
  return <AstrologerChatSession key={props.sessionId} {...props} />;
}

function AstrologerChatSession({
  sessionId,
  className,
  onSessionUpdated,
  onStartNewReading,
  personalOnly = false,
  anchorMessageId,
  emptyPrompts = [],
}: AstrologerChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [detail, setDetail] = useState<AstrologerSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendState, setSendState] = useState<SendState>('idle');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<ApiErrorDto | null>(null);
  const [focusedQuestion, setFocusedQuestion] = useState<FocusedQuestion | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const eventRunIdRef = useRef<string | null>(null);
  // The question run whose stored answer this view still has to show. It is
  // cleared only by a session read that sees the run finished, never by the
  // stream alone, so one lost event or failed read cannot hide the answer.
  const pendingRunIdRef = useRef<string | null>(null);
  const detailInFlightRef = useRef<number | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const [stream, setStream] = useState<RunStreamState | null>(null);
  const requestInFlightRef = useRef(false);
  const sessionIdRef = useRef<string | null>(sessionId);
  const [confirmedPersonalOnly, setConfirmedPersonalOnly] = useState<boolean | null>(null);
  const currentPersonalOnly = confirmedPersonalOnly ?? personalOnly;
  const modeRequestRef = useRef(0);
  const detailRequestRef = useRef(0);

  useEffect(() => {
    sessionIdRef.current = sessionId;
    return () => { sessionIdRef.current = null; };
  }, [sessionId]);

  const refreshMode = useCallback(async (profileId: string | null) => {
    if (!profileId) return;
    const requestId = ++modeRequestRef.current;
    try {
      const response = await fetch(`/api/astrologer/profiles/${profileId}/model`, { cache: 'no-store' });
      if (!response.ok) return;
      const model = await response.json() as { mode?: string };
      if (sessionIdRef.current !== sessionId || requestId !== modeRequestRef.current) return;
      const personalOnly = personalOnlyFromModel(model);
      if (personalOnly !== null) setConfirmedPersonalOnly(personalOnly);
    } catch {
      // Keep the last confirmed presentation; execution checks its own mode.
    }
  }, [sessionId]);

  const loadDetail = useCallback(async (): Promise<AstrologerSessionDetail | null> => {
    const requestId = ++detailRequestRef.current;
    detailInFlightRef.current = Date.now();
    try {
      const response = await fetch(`/api/astrologer/sessions/${sessionId}`, { cache: 'no-store' });
      if (sessionIdRef.current !== sessionId || requestId !== detailRequestRef.current) return null;
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as ApiErrorDto | null;
        if (sessionIdRef.current !== sessionId || requestId !== detailRequestRef.current) return null;
        setError(payload ?? { code: 'internal', message: 'Could not load session.' });
        setLoading(false);
        return null;
      }
      const data = (await response.json()) as AstrologerSessionDetail;
      if (sessionIdRef.current !== sessionId || requestId !== detailRequestRef.current) return null;
      setDetail(data);
      setMessages((current) => mergePersistedMessages(current, data.messages));
      setFocusedQuestion(data.session.currentQuestion ?? null);
      onSessionUpdated?.(data);
      setError(null);
      setLoading(false);
      void refreshMode(data.session.profileId);
      if (data.latestRun?.kind === 'question' && data.latestRun.status === 'active') {
        pendingRunIdRef.current = data.latestRun.id;
        setSendState('streaming');
      }
      if (data.latestRun?.status !== 'active') setStream(null);
      if (data.latestRun && data.latestRun.status !== 'active'
        && (pendingRunIdRef.current === null || pendingRunIdRef.current === data.latestRun.id)) {
        if (eventRunIdRef.current === data.latestRun.id) {
          eventSourceRef.current?.close();
          eventSourceRef.current = null;
          eventRunIdRef.current = null;
        }
        if (pendingRunIdRef.current !== null) {
          pendingRunIdRef.current = null;
          setSendState('idle');
        }
      }
      return data;
    } catch {
      if (sessionIdRef.current === sessionId && requestId === detailRequestRef.current) {
        setError({ code: 'internal', message: 'Network error while refreshing the conversation.' });
        setLoading(false);
      }
      return null;
    } finally {
      if (requestId === detailRequestRef.current) detailInFlightRef.current = null;
    }
  }, [onSessionUpdated, refreshMode, sessionId]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void loadDetail();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [loadDetail]);

  const personId = detail?.session.profileId;
  useEffect(() => {
    if (!personId) return;
    return subscribePersonState(personId, () => { void loadDetail(); });
  }, [personId, loadDetail]);

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
      pendingRunIdRef.current = null;
    };
  }, [loadDetail]);

  useEffect(() => {
    if (loading || !anchorMessageId) return;
    const node = document.getElementById(`message-${anchorMessageId}`);
    node?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [anchorMessageId, loading, messages]);

  useEffect(() => {
    const delivery = messages.at(-1)?.delivery;
    if (delivery === 'sending' || delivery === 'queued') {
      messageEndRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    }
  }, [messages]);

  const connectEvents = useCallback(
    (runId: string, after?: number) => {
      if (eventRunIdRef.current === runId && eventSourceRef.current) return;
      eventSourceRef.current?.close();
      eventRunIdRef.current = runId;
      pendingRunIdRef.current = runId;
      const url = `/api/astrologer/runs/${runId}/events${after ? `?after=${after}` : ''}`;
      const source = new EventSource(url);
      eventSourceRef.current = source;
      // Streamed text also comes straight from the edge, when one is
      // configured; it is the same events deduplicated by sequence number.
      // Tying it to close() ends it wherever this source is closed.
      const live = new AbortController();
      const closeSource = source.close.bind(source);
      source.close = () => { live.abort(); closeSource(); };
      void watchLiveText(runId, (event) => setStream((current) => applyRunEvent(current, event)), live.signal);
      setStream((current) => current?.runId === runId ? current : startRunStream(runId));
      // Progress and streamed text apply directly; only a finished answer
      // needs the persisted conversation.
      const applyLive = (message: MessageEvent) => {
        const event = parseRunEventData(message.data);
        if (event) setStream((current) => applyRunEvent(current, event));
      };
      for (const name of ['answer.delta', 'phase.changed', 'tool.started', 'tool.completed']) source.addEventListener(name, applyLive);
      source.addEventListener('answer.ready', () => void loadDetail());
      // The composer unlocks once a session read shows the finished run and
      // its stored answer; until then the poll below keeps reading.
      const finished = () => {
        source.close();
        if (eventSourceRef.current === source) eventSourceRef.current = null;
        if (eventRunIdRef.current === runId) eventRunIdRef.current = null;
        void loadDetail();
      };
      source.addEventListener('run.completed', finished);
      source.addEventListener('run.failed', finished);
      source.onerror = () => {
        // EventSource reconnects automatically with Last-Event-ID. Refresh
        // the durable row too, so a short-lived stream failure cannot leave
        // the UI showing an eternal spinner after the worker has failed.
        void loadDetail();
      };
    },
    [loadDetail],
  );

  useEffect(() => {
    // The stream is best-effort. While a run is active, also re-read the
    // durable conversation, so a missed or expired event can never leave a
    // stored answer unseen.
    if (sendState !== 'streaming') return;
    const timer = setInterval(() => {
      // A slow read must be allowed to land: starting a newer one would
      // discard it, and a read slower than the interval would never apply.
      const started = detailInFlightRef.current;
      if (started !== null && Date.now() - started < 20_000) return;
      void loadDetail();
    }, 5000);
    return () => clearInterval(timer);
  }, [loadDetail, sendState]);

  useEffect(() => {
    if ((detail?.profile?.initializationStatus === 'pending' && detail.latestRun?.kind === 'intake')
      || (detail?.latestRun?.kind === 'question' && detail.latestRun.status === 'active')) {
      connectEvents(detail.latestRun.id);
    }
  }, [connectEvents, detail]);

  const send = useCallback(
    async (text: string, answerToQuestionId?: string, retryClientMessageId?: string, foldQueued = false) => {
      if (sendState !== 'idle' || requestInFlightRef.current) return;
      requestInFlightRef.current = true;
      setSendState('sending');
      setError(null);
      const clientMessageId = retryClientMessageId ?? crypto.randomUUID();
      setMessages((current) => retryClientMessageId
        ? (foldQueued ? takeQueuedMessages(current).messages : current)
          .map((message) => message.clientMessageId === clientMessageId ? { ...message, delivery: 'sending' } : message)
        : [...current, {
          id: clientMessageId, clientMessageId, role: 'user', content: text,
          createdAt: new Date().toISOString(), runId: null, delivery: 'sending', answerToQuestionId,
        }]);
      const failed = () => {
        setMessages((current) => current.map((message) => message.clientMessageId === clientMessageId
          ? { ...message, delivery: 'failed' } : message));
        setSendState('idle');
      };
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
        if (sessionIdRef.current !== sessionId) return;
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as ApiErrorDto | null;
          setError(payload ?? { code: 'internal', message: 'Could not send message.' });
          failed();
          return;
        }
        const started = (await response.json()) as StartRunResponse;
        if (sessionIdRef.current !== sessionId) return;
        setMessages((current) => acknowledgeMessage(current, clientMessageId, started));
        setSendState(started.status === 'active' ? 'streaming' : 'idle');
        setFocusedQuestion(null);
        if (started.status === 'active') connectEvents(started.runId);
        void loadDetail();
      } catch {
        if (sessionIdRef.current !== sessionId) return;
        setError({ code: 'internal', message: 'Network error.' });
        failed();
      } finally {
        if (sessionIdRef.current === sessionId) requestInFlightRef.current = false;
      }
    },
    [connectEvents, loadDetail, sendState, sessionId],
  );

  const canChat = detail?.profile?.initializationStatus === 'ready';
  const resumableFailed = detail?.latestRun?.kind === 'question' && detail.latestRun.status === 'failed' && detail.latestRun.resumable;
  const hasQueued = messages.some((message) => message.delivery === 'queued');

  // The composer stays open during an answer. What is written meanwhile shows
  // at once and goes out, as one message, when the current answer finishes.
  const submitDraft = useCallback(() => {
    const text = draft.trim();
    if (!text || !canChat || resumableFailed) return;
    setDraft('');
    if (sendState === 'idle' && !requestInFlightRef.current && !hasQueued) {
      void send(text, focusedQuestion?.id);
      return;
    }
    const clientMessageId = crypto.randomUUID();
    setMessages((current) => [...current, {
      id: clientMessageId, clientMessageId, role: 'user', content: text,
      createdAt: new Date().toISOString(), runId: null, delivery: 'queued',
    }]);
  }, [canChat, draft, focusedQuestion?.id, hasQueued, resumableFailed, send, sendState]);

  useEffect(() => {
    if (!hasQueued || sendState !== 'idle' || requestInFlightRef.current || !canChat || resumableFailed) return;
    const { send: next } = takeQueuedMessages(messages);
    if (!next) return;
    // Sent from a task, so a render in between cancels it rather than sending twice.
    // A queued message is not an answer to a focused question asked later.
    const timer = setTimeout(() => void send(next.content, undefined, next.clientMessageId, true), 0);
    return () => clearTimeout(timer);
  }, [canChat, hasQueued, messages, resumableFailed, send, sendState]);

  const removeQueued = useCallback((id: string) => {
    setMessages((current) => current.filter((message) => message.id !== id || message.delivery !== 'queued'));
  }, []);

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
  const queued = messages.filter((message) => message.delivery === 'queued');

  const resume = async () => {
    if (!latestRun || busy) return;
    setSendState('sending');
    setError(null);
    try {
      const response = await fetch(`/api/astrologer/runs/${latestRun.id}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientRequestId: crypto.randomUUID() }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as ApiErrorDto | null;
        setError(payload ?? { code: 'internal', message: 'Could not resume the run.' });
        setSendState('idle');
        return;
      }
      const started = (await response.json()) as StartRunResponse;
      setSendState('streaming');
      connectEvents(started.runId);
      void loadDetail();
    } catch {
      setError({ code: 'internal', message: 'Network error while resuming the run.' });
      setSendState('idle');
    }
  };

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
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

      {detail?.trace?.length ? (
        <details className="border-b px-4 py-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            Run trace ({detail.trace.length} receipts)
          </summary>
          <div className="mt-2 max-h-56 space-y-2 overflow-auto font-mono">
            {detail.trace.map((step) => (
              <div key={step.id} className="rounded border bg-muted/30 p-2">
                <div className="flex flex-wrap gap-2">
                  <span>{step.kind}</span>
                  {step.toolName ? <span>{step.toolName}</span> : null}
                  <span className="text-muted-foreground">{step.status}</span>
                  {step.cacheHit ? <span className="text-muted-foreground">cache hit</span> : null}
                </div>
                {step.inputSummary ? <div className="mt-1 break-all">in: {step.inputSummary}</div> : null}
                {step.outputSummary ? (
                  <div className="mt-1 break-words text-muted-foreground">out: {step.outputSummary}</div>
                ) : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <ScrollArea className="min-h-0 flex-1 p-4">
        <div className="flex flex-col gap-3">
          {messages.filter((message) => message.delivery !== 'queued').map((message) => (
            <div
              key={message.id}
              id={`message-${message.id}`}
              className={cn(
                'flex gap-2 rounded-md',
                message.role === 'user' ? 'justify-end' : 'justify-start',
                message.id === anchorMessageId ? 'ring-2 ring-[#b07a32] ring-offset-2' : '',
              )}
            >
              {message.role === 'assistant' ? (
                <Avatar className="h-7 w-7">
                  <AvatarFallback>☉</AvatarFallback>
                </Avatar>
              ) : null}
              <div
                className={cn(
                  'min-w-0 max-w-[75%] rounded-lg px-3 py-2 text-sm [overflow-wrap:anywhere]',
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground whitespace-pre-wrap'
                    : 'bg-muted',
                )}
              >
                {message.role === 'assistant' ? <AssistantMarkdown content={message.content} /> : message.content}
                {message.delivery === 'sending' ? <p className="mt-1 text-xs opacity-75">Sending…</p> : null}
                {message.delivery === 'failed' ? (
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span>Could not confirm delivery.</span>
                    <Button variant="secondary" size="sm" disabled={busy} onClick={() => void send(message.content, message.answerToQuestionId, message.clientMessageId)}>
                      Retry
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {messages.length === 0 && emptyPrompts.length ? (
            <section aria-label="Conversation starters" className="mx-auto my-6 w-full max-w-2xl rounded-md border border-dashed border-[#9aa8b5] bg-[#f7f7f2] p-5">
              <p className="font-serif text-xl text-[#112d52]">Start with a focused question</p>
              <p className="mt-1 text-sm leading-6 text-[#687387]">No message has been created for you. Choose a prompt or write your own response below.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {emptyPrompts.map((prompt) => <button key={prompt} type="button" onClick={() => void send(prompt)} className="rounded-full border border-[#9aa8b5] bg-white px-4 py-2 text-left text-xs text-[#173e67] hover:border-[#b07a32]">{prompt}</button>)}
              </div>
            </section>
          ) : null}
          {busy && stream?.draft ? (
            <div className="flex justify-start gap-2" aria-live="polite" data-testid="streaming-answer">
              <Avatar className="h-7 w-7">
                <AvatarFallback>☉</AvatarFallback>
              </Avatar>
              <div className="min-w-0 max-w-[75%] rounded-lg bg-muted px-3 py-2 text-sm opacity-90 [overflow-wrap:anywhere]">
                <AssistantMarkdown content={stream.draft} />
              </div>
            </div>
          ) : null}
          {busy ? (
            <div className="text-xs text-muted-foreground">{stream?.activity ?? (currentPersonalOnly ? 'Thinking with your current personal context…' : 'Consulting your context and chart…')}</div>
          ) : null}
          {queued.map((message) => (
            <div key={message.id} id={`message-${message.id}`} className="flex justify-end gap-2" data-testid="queued-message">
              <div className="min-w-0 max-w-[75%] rounded-lg border border-dashed border-primary/60 bg-primary/10 px-3 py-2 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
                {message.content}
                <div className="mt-1 flex items-center justify-end gap-2 text-xs text-muted-foreground">
                  <span>Sends when this answer finishes</span>
                  <button type="button" aria-label="Remove queued message" className="rounded p-0.5 hover:bg-muted" onClick={() => removeQueued(message.id)}>
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          <div ref={messageEndRef} />
        </div>
      </ScrollArea>

      {error && !intakeFailed ? (
        <div className="border-t bg-destructive/10 px-4 py-2 text-xs text-destructive" role="alert">
          {error.message}
          {error.resumable && latestRun ? (
            <Button
              variant="outline"
              size="sm"
              className="ml-2"
              disabled={busy}
              onClick={() => void resume()}
            >
              Resume
            </Button>
          ) : null}
        </div>
      ) : null}

      {resumableFailed ? (
        <div
          className="flex flex-wrap items-center gap-2 border-t bg-destructive/10 px-4 py-3 text-xs text-destructive"
          role="alert"
        >
          <span>
            The last run failed.
            {detail?.session.nextAction ? ` ${detail.session.nextAction}` : ''}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void resume()}
          >
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
          placeholder={currentPersonalOnly ? 'Tell me what you are exploring…' : 'Ask your companion…'}
          value={draft}
          disabled={!canChat || resumableFailed}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submitDraft();
            }
          }}
        />
        <Button
          size="icon"
          aria-label={busy ? 'Add to the conversation' : 'Send message'}
          disabled={!canChat || resumableFailed || draft.trim().length === 0}
          onClick={submitDraft}
        >
          <SendHorizonal className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
