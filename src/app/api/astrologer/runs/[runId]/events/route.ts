/**
 * Run event stream: typed Workflow chunks bridged to SSE with reconnect
 * support via `Last-Event-ID` / `?after=`. When the Workflow stream has
 * expired, the terminal state is synthesized from Supabase so the result is
 * never lost.
 */

import { NextResponse } from 'next/server';
import { getRun } from 'workflow/api';
import { errorResponse, requireAuth, unconfigured } from '@/lib/astro/api-helpers';
import { AgentStoreError } from '@/lib/astro/agent-store';
import { dispatchAstrologerRunBestEffort } from '@/lib/astro/run-dispatch';
import {
  AstrologerRunEventSchema,
  type AstrologerRunEvent,
} from '@/lib/astro/contracts';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface WorkflowChunk {
  type?: string;
  payload?: unknown;
  index?: number;
}

/** Map a raw Workflow stream chunk to a typed run event, or null to skip. */
function chunkToEvent(chunk: WorkflowChunk, runId: string): AstrologerRunEvent | null {
  const payload = (chunk.payload ?? {}) as Record<string, unknown>;
  const type = typeof payload.type === 'string' ? payload.type : chunk.type;
  switch (type) {
    case 'run.started':
    case 'phase.changed':
    case 'tool.started':
    case 'tool.completed':
    case 'question.ready':
    case 'answer.ready':
    case 'run.completed':
    case 'run.failed':
      return AstrologerRunEventSchema.parse({
        event: type,
        runId,
        phase: payload.phase,
        tool: payload.tool,
        summary: payload.summary,
        cacheHit: payload.cacheHit,
        question: payload.question ?? undefined,
        status: payload.status,
        error: payload.error,
      });
    default:
      return null;
  }
}

function sseFrame(id: number, event: AstrologerRunEvent): Uint8Array {
  return new TextEncoder().encode(
    `id: ${id}\nevent: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`,
  );
}

/** Synthesize a terminal event from durable Supabase state. */
async function synthesizeTerminal(
  store: import('@/lib/astro/agent-store').AgentStore,
  runId: string,
): Promise<AstrologerRunEvent> {
  const run = await store.getRun(runId);
  if (run.status === 'failed') {
    return AstrologerRunEventSchema.parse({
      event: 'run.failed',
      runId,
      status: 'failed',
      error: {
        code: run.error_code ?? 'internal',
        message: run.error_message ?? 'run failed',
        resumable: run.resumable,
      },
    });
  }
  return AstrologerRunEventSchema.parse({
    event: 'run.completed',
    runId,
    status: run.status,
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return unconfigured();
  const auth = await requireAuth();
  if (!auth) {
    return NextResponse.json({ code: 'forbidden', message: 'unauthenticated' }, { status: 401 });
  }
  const { runId } = await params;

  try {
    let run = await auth.store.getRun(runId);
    if (run.user_id !== auth.userId) {
      throw new AgentStoreError('forbidden', 'not your run');
    }

    const url = new URL(request.url);
    const lastEventId = request.headers.get('last-event-id') ?? url.searchParams.get('after') ?? '0';
    const after = Number.parseInt(lastEventId, 10) || 0;

    // Terminal runs answer immediately from Supabase (stream may be expired).
    if (run.status !== 'active' && run.status !== 'waiting_for_user') {
      const terminal = await synthesizeTerminal(auth.store, runId);
      return new Response(sseFrame(after + 1, terminal), {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform' },
      });
    }

    if (!run.workflow_run_id) {
      // Event reconnect is another safe recovery edge. If the request that
      // accepted the message died before start, this claims the durable outbox.
      await dispatchAstrologerRunBestEffort(runId);
      run = await auth.store.getRun(runId);
      if (!run.workflow_run_id) {
        const pending = AstrologerRunEventSchema.parse({
          event: 'phase.changed',
          runId,
          phase: 'planning',
          status: 'active',
          summary: 'waiting for a workflow dispatcher',
        });
        return new Response(sseFrame(after + 1, pending), {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Retry-After': '2',
          },
        });
      }
    }

    const workflowRun = getRun(run.workflow_run_id);
    if (!(await workflowRun.exists)) {
      const terminal = await synthesizeTerminal(auth.store, runId);
      return new Response(sseFrame(after + 1, terminal), {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform' },
      });
    }

    const readable = workflowRun.getReadable<WorkflowChunk>({ startIndex: after + 1 });
    const reader = readable.getReader();
    let cancellation: Promise<void> | undefined;
    const cancelReader = () => cancellation ??= reader.cancel().catch(() => {});
    let disconnected = false;
    let notifyDisconnect: () => void = () => {};
    const disconnectNotice = new Promise<void>((resolve) => { notifyDisconnect = resolve; });
    const disconnect = () => {
      disconnected = true;
      notifyDisconnect();
      void cancelReader();
    };
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let index = after;
        let terminalSent = false;
        request.signal.addEventListener('abort', disconnect, { once: true });
        // End this connection before the hosting deadline. EventSource resumes
        // by cursor; neither disconnect nor renewal cancels the durable run.
        const renewal = setTimeout(disconnect, 240_000);
        try {
          if (request.signal.aborted) disconnect();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            index += 1;
            const event = chunkToEvent(value ?? {}, runId);
            if (event) controller.enqueue(sseFrame(index, event));
            if (event?.event === 'run.completed' || event?.event === 'run.failed') {
              terminalSent = true;
              break;
            }
          }
          // Stream closed: synthesize terminal from Supabase if the workflow
          // finished while we were reading.
          if (!terminalSent && !disconnected) {
            const status = await Promise.race([workflowRun.status, disconnectNotice.then(() => null)]);
            if (!disconnected && (status === 'completed' || status === 'failed')) {
              const terminal = await Promise.race([synthesizeTerminal(auth.store, runId), disconnectNotice.then(() => null)]);
              if (terminal && !disconnected) controller.enqueue(sseFrame(index + 1, terminal));
            }
          }
        } catch {
          // Stream interrupted; client reconnects with Last-Event-ID.
        } finally {
          clearTimeout(renewal);
          request.signal.removeEventListener('abort', disconnect);
          // Cancel once, but do not hold the SSE response open for a stalled
          // upstream cancel acknowledgment. The read has already settled here.
          void cancelReader();
          try { controller.close(); } catch { /* Consumer already disconnected. */ }
          reader.releaseLock();
        }
      },
      cancel: disconnect,
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
