/** Durable outbox dispatcher for accepted person sources. */
import { start } from 'workflow/api';
import { PersonConsolidationStore } from './consolidation-store';
import { personConsolidationWorkflow } from '@/workflows/person-consolidation';

export interface PersonDispatchSweepResult {
  claimed: number;
  started: number;
  ignored: number;
  released: number;
}

/**
 * Start the ordinary-chat consolidation workflow independently of answer
 * generation. Duplicate starts are safe: the first durable workflow step
 * claims the fenced job, so only one worker can produce durable effects.
 */
export async function sweepPersonConsolidationOutbox(options: { max?: number } = {}): Promise<PersonDispatchSweepResult> {
  const store = new PersonConsolidationStore();
  const result: PersonDispatchSweepResult = { claimed: 0, started: 0, ignored: 0, released: 0 };
  const startedJobIds = new Set<string>();
  const max = Math.min(Math.max(options.max ?? 10, 1), 25);
  for (let i = 0; i < max; i++) {
    const item = await store.claimOutbox();
    if (!item) break;
    result.claimed++;
    try {
      if (item.eventType === 'person.input.accepted' && typeof item.jobId === 'string') {
        await start(personConsolidationWorkflow, [item.jobId]);
        startedJobIds.add(item.jobId);
        result.started++;
      } else {
        // person.updated/person.job.failed are consumed by read-model polling
        // and operational receipts; this worker only dispatches new input jobs.
        result.ignored++;
      }
      await store.finishOutbox(item, true);
    } catch {
      // The accepted source/job already committed. Leave the outbox retryable;
      // never fail or roll back the user's ordinary message.
      await store.finishOutbox(item, false);
      result.released++;
    }
  }
  // Failed jobs are requeued by person_fail_or_retry_job without creating a
  // second input event. Sweep them directly so retry does not depend on a new
  // chat message or on replaying an already-delivered outbox row.
  const pending = await store.listPendingJobIds(max);
  for (const jobId of pending) {
    if (startedJobIds.has(jobId)) continue;
    try {
      await start(personConsolidationWorkflow, [jobId]);
      result.started++;
    } catch {
      result.released++;
    }
  }
  return result;
}

export async function dispatchPersonJobBestEffort(): Promise<PersonDispatchSweepResult | null> {
  try {
    return await sweepPersonConsolidationOutbox({ max: 10 });
  } catch {
    return null;
  }
}
