import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { AgentStore } from './agent-store';

describe.skipIf(process.env.P1_LOCAL_INTEGRATION !== '1')('selected context through local Supabase', () => {
  it('rehydrates an owned quote and the durable focused question', async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
      throw new Error('P1 integration refuses non-local Supabase');
    }
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const email = `p1-selected-${crypto.randomUUID()}@example.invalid`;
    const created = await admin.auth.admin.createUser({ email, password: `P1-${crypto.randomUUID()}-Aa1!`, email_confirm: true });
    if (created.error || !created.data.user) throw created.error ?? new Error('local user creation failed');
    const userId = created.data.user.id;
    try {
      const profile = await admin.from('astro_profiles').insert({
        user_id: userId, name: 'P1 synthetic person', birth_date: '1990-01-01', birth_time: '06:30',
        lat: 12.9716, lng: 77.5946, tz: 'Asia/Kolkata', place_name: 'Bengaluru', chart_json: {}, sensitivity_json: {},
      }).select('id').single();
      if (profile.error || !profile.data) throw profile.error ?? new Error('profile missing');
      const profileId = profile.data.id as string;
      const questionId = crypto.randomUUID();
      const session = await admin.from('astro_sessions').insert({
        user_id: userId, profile_id: profileId, title: 'Synthetic session', status: 'waiting_for_user',
        current_question: { id: questionId, prompt: 'What changes on caregiving evenings?', responseKind: 'free_text', options: [], allowFreeText: true },
        checkpoint_json: { focusedQuestion: null },
      }).select('id').single();
      if (session.error || !session.data) throw session.error ?? new Error('session missing');
      const sessionId = session.data.id as string;
      const message = await admin.from('astro_messages').insert({
        user_id: userId, session_id: sessionId, role: 'user', content: 'I can work late only when my sister covers the evening.',
      }).select('id').single();
      if (message.error || !message.data) throw message.error ?? new Error('message missing');
      const run = await admin.from('astro_agent_runs').insert({
        user_id: userId, profile_id: profileId, session_id: sessionId, kind: 'question', status: 'complete',
        client_request_id: crypto.randomUUID(), triggering_message_id: message.data.id,
      }).select('id').single();
      if (run.error || !run.data) throw run.error ?? new Error('run missing');
      const runId = run.data.id as string;
      const evidence = await admin.from('astro_evidence').insert({
        user_id: userId, profile_id: profileId, session_id: sessionId, source_message_id: message.data.id,
        source_kind: 'user_statement', assertion_mode: 'direct', evidence_type: 'work_rhythm',
        exact_quote: 'I can work late only when my sister covers the evening.',
        summary: 'Work rhythm depends on caregiving cover.', quality: 1,
        idempotency_key: `p1-${runId}`, created_by_run_id: runId,
      }).select('id').single();
      if (evidence.error || !evidence.data) throw evidence.error ?? new Error('evidence missing');
      const selection = await admin.from('astro_run_context_items').insert({
        user_id: userId, profile_id: profileId, run_id: runId, evidence_id: evidence.data.id,
        purpose: 'selected', rank: 1, reason: 'bookkeeping only', step_key: '0:0:0:context_search',
      });
      if (selection.error) throw selection.error;

      const store = new AgentStore(admin, admin);
      const sources = await store.listSelectedSources(runId);
      expect(sources).toHaveLength(1);
      expect(sources[0].excerpt).toContain('I can work late only when my sister covers the evening.');
      expect(sources[0].excerpt).not.toContain('bookkeeping only');
      const manifest = await store.loadContextManifest(runId);
      expect(manifest.sessionCheckpoint.focusedQuestion?.id).toBe(questionId);

      // All 52 share a timestamp: timestamp-only pagination would lose the
      // rows tied to the first page's final message.
      const tiedIds = Array.from({ length: 52 }, () => crypto.randomUUID());
      const tiedMessages = await admin.from('astro_messages').insert(tiedIds.map((id) => ({
        id, user_id: userId, session_id: sessionId, role: 'user', content: `Synthetic ${id}`,
        created_at: '2026-09-01T00:00:00Z',
      })));
      if (tiedMessages.error) throw tiedMessages.error;
      const first = await store.listMessages(sessionId);
      expect(first.messages).toHaveLength(50);
      expect(first.nextCursor).not.toBeNull();
      const second = await store.listMessages(sessionId, first.nextCursor);
      expect(second.messages).toHaveLength(3);
      expect(new Set([...first.messages, ...second.messages].map((item) => item.id)).size).toBe(53);
    } finally {
      const deleted = await admin.auth.admin.deleteUser(userId);
      if (deleted.error) throw deleted.error;
    }
  });
});
