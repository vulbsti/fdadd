/**
 * Astrologer agent turn: manual OpenRouter tool loop (max 8 turns).
 *
 * System prompt compresses Atros `docs/agentic-workflow/SKILL.md` §§0–4
 * (JSON-only parsing, intake order chart→sensitivity→evidence, elimination
 * loop, dasha-backbone/transit-overlay) plus the rectify questioning summary.
 * Chart+sensitivity fire in parallel on intake (inside `astroProfileInit`)
 * and freeze into `chart_json`/`sensitivity_json` — never recomputed.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { chatCompletion, type ChatMessage } from '../ai/openrouter';
import {
  astroProfileInit,
  astroProfileGet,
  astroEventAdd,
  astroHypothesisUpsert,
  astroHypothesisStatus,
  astroEliminationTable,
  atrosChart,
  atrosSensitivity,
  atrosTimeline,
  atrosTransit,
  atrosCurrentDasha,
  atrosDasha,
} from './tools';

const SYSTEM_PROMPT = `You are Aidoraa's Vedic astrologer. You reason with deterministic Atros calculations (tools) plus per-user persisted profiles, events, and hypotheses. Rules:
- Parse Atros tool JSON only; never invent chart facts or scrape text. Time precision never exceeds evidence: boundary-planet tests constrain minutes; dasha characterization only confirms chart type; dasha timing is exact to ±a few days, never hour precision.
- Intake order: collect date, time + source (hospital/record/memory/unknown), place + lat/lng/tz via astro_profile_init, then chart + sensitivity freeze automatically. Re-read frozen facts later; never recompute the chart.
- Evidence toolkit (pick by sensitivity): dasha transition timestamps (event dates vs MD/AD/PD boundaries, tag every event with astro_event_add); boundary-planet tests (two lived descriptions from planet+dignity+bhava+lordship); D-chart lagna (rules out ranges only); ascendant characterization (confidence only).
- Elimination loop: write 2-3 mutually exclusive hypotheses with predictions (what this placement must produce) and tests (which lived facts discriminate). Every question MUST include a control option matching only the chart-is-wrong branch. One boundary answer outweighs ten characterizations. Ambiguous answer ("both fit") → abandon that line, switch evidence type. Silence is data. Update statuses open/confirmed/eliminated/ambiguous; checkpoint before claiming precision.
- Timing reads: resolve the chain with atros_timeline (sookshma for day-level), overlay atros_transit (houses-from-Moon, favorable/vedha, Sade Sati/Dhaiya, double-transit). Transit is the stack, dasha the backbone. Synthesize: seam statement, 3-clock layering, transit stack, dated split, one-line play plus firewall dates for troughs.
- Ask for one thing at a time; keep replies concise and plain-spoken.`;

const MAX_TURNS = 8;
const HISTORY_LIMIT = 30;

interface ToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

const birthProps = {
  name: { type: 'string', description: 'Full name for the profile' },
  date: { type: 'string', description: 'Birth date YYYY-MM-DD' },
  time: { type: 'string', description: 'Birth time HH:MM (24h)' },
  latitude: { type: 'number', description: 'Birth place latitude' },
  longitude: { type: 'number', description: 'Birth place longitude' },
  timezone: { type: 'string', description: 'IANA timezone, e.g. Asia/Kolkata' },
  place_name: { type: 'string', description: 'Free-text birth place' },
  time_source: { type: 'string', description: 'hospital | record | memory | unknown' },
  time_confidence: { type: 'string', description: 'exact | approximate | unknown' },
};

const TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'astro_profile_init',
      description: 'Create the birth profile; fires chart+sensitivity in parallel and freezes the facts. Call once per intake.',
      parameters: { type: 'object', properties: birthProps, required: ['name', 'date', 'time', 'latitude', 'longitude', 'timezone'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'atros_chart',
      description: 'Re-read the frozen birth chart facts.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'atros_sensitivity',
      description: 'Re-read the frozen birth-time sensitivity report.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'atros_timeline',
      description: 'Nested dasha chain over a date window.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Window start YYYY-MM-DD' },
          to: { type: 'string', description: 'Window end YYYY-MM-DD' },
          level: { type: 'string', description: 'maha | antar | pratyantar | sookshma' },
        },
        required: ['from', 'to'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'atros_transit',
      description: 'Gochara transit overlay for a date.',
      parameters: {
        type: 'object',
        properties: { as_of: { type: 'string', description: 'Transit date YYYY-MM-DD' } },
        required: ['as_of'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'atros_current_dasha',
      description: 'Currently running dasha period.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'atros_dasha',
      description: 'Vimshottari dasha timeline for N years forward.',
      parameters: {
        type: 'object',
        properties: { years: { type: 'number', description: 'Years forward, 1-120' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'astro_event_add',
      description: 'Record a life event, auto-tagged with the active MD/AD/PD chain.',
      parameters: {
        type: 'object',
        properties: {
          on_date: { type: 'string', description: 'Event date YYYY-MM-DD' },
          title: { type: 'string' },
          detail: { type: 'string' },
          fit: { type: 'string', description: 'How the event fits the current hypothesis' },
        },
        required: ['on_date', 'title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'astro_hypothesis_upsert',
      description: 'Create or update a rectification hypothesis.',
      parameters: {
        type: 'object',
        properties: {
          hid: { type: 'string', description: 'Short hypothesis id, e.g. h1' },
          claim: { type: 'string' },
          predictions: { type: 'array', items: { type: 'string' } },
          tests: { type: 'array', items: { type: 'string' } },
          status: { type: 'string', description: 'open | confirmed | eliminated | ambiguous' },
        },
        required: ['hid', 'claim'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'astro_hypothesis_status',
      description: 'Transition a hypothesis status.',
      parameters: {
        type: 'object',
        properties: {
          hid: { type: 'string' },
          status: { type: 'string', description: 'open | confirmed | eliminated | ambiguous' },
        },
        required: ['hid', 'status'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'astro_elimination_table',
      description: 'Review all hypotheses: id | claim | status | tests.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

export interface TurnOptions {
  client: SupabaseClient;
  userId: string;
  sessionId: string;
  message: string;
}

export interface TurnResult {
  answer: string;
  toolCalls: number;
  profileId: string | null;
}

interface StoredMessage {
  role: string;
  content: string;
  tool_name: string | null;
  tool_payload: {
    tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
    tool_call_id?: string;
    result?: unknown;
  } | null;
}

async function persist(
  client: SupabaseClient,
  userId: string,
  sessionId: string,
  row: { role: string; content: string; tool_name?: string | null; tool_payload?: unknown },
): Promise<void> {
  await client.from('astro_messages').insert({
    user_id: userId,
    session_id: sessionId,
    role: row.role,
    content: row.content,
    tool_name: row.tool_name ?? null,
    tool_payload: (row.tool_payload ?? null) as never,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolArgs = Record<string, any>;

async function dispatch(
  client: SupabaseClient,
  userId: string,
  sessionId: string,
  profileId: string | null,
  name: string,
  args: ToolArgs,
): Promise<{ result: unknown; profileId: string | null }> {
  switch (name) {
    case 'astro_profile_init': {
      const profile = await astroProfileInit(client, userId, sessionId, {
        name: args.name,
        date: args.date,
        time: args.time,
        latitude: args.latitude,
        longitude: args.longitude,
        timezone: args.timezone,
        place_name: args.place_name,
        time_source: args.time_source,
        time_confidence: args.time_confidence,
      });
      await client
        .from('astro_sessions')
        .update({ profile_id: profile.id })
        .eq('id', sessionId)
        .eq('user_id', userId);
      return {
        result: {
          profile_id: profile.id,
          chart_frozen: Boolean(profile.chart_json),
          sensitivity_frozen: Boolean(profile.sensitivity_json),
        },
        profileId: profile.id,
      };
    }
    case 'atros_chart':
    case 'atros_sensitivity':
    case 'atros_timeline':
    case 'atros_transit':
    case 'atros_current_dasha':
    case 'atros_dasha':
    case 'astro_event_add':
    case 'astro_hypothesis_upsert':
    case 'astro_hypothesis_status':
    case 'astro_elimination_table': {
      if (!profileId) return { result: { error: 'no profile yet — call astro_profile_init first' }, profileId };
      break;
    }
    default:
      return { result: { error: `unknown tool ${name}` }, profileId };
  }

  switch (name) {
    case 'atros_chart':
      return { result: await atrosChart(client, userId, sessionId, profileId as string), profileId };
    case 'atros_sensitivity':
      return { result: await atrosSensitivity(client, userId, sessionId, profileId as string), profileId };
    case 'atros_timeline':
      return {
        result: await atrosTimeline(client, userId, sessionId, profileId as string, args.from, args.to, args.level),
        profileId,
      };
    case 'atros_transit':
      return {
        result: await atrosTransit(client, userId, sessionId, profileId as string, args.as_of),
        profileId,
      };
    case 'atros_current_dasha':
      return { result: await atrosCurrentDasha(client, userId, sessionId, profileId as string), profileId };
    case 'atros_dasha':
      return {
        result: await atrosDasha(client, userId, sessionId, profileId as string, args.years),
        profileId,
      };
    case 'astro_event_add':
      return {
        result: await astroEventAdd(client, userId, sessionId, profileId as string, {
          on_date: args.on_date,
          title: args.title,
          detail: args.detail,
          fit: args.fit,
        }),
        profileId,
      };
    case 'astro_hypothesis_upsert':
      return {
        result: await astroHypothesisUpsert(client, userId, profileId as string, {
          hid: args.hid,
          claim: args.claim,
          predictions: args.predictions ?? [],
          tests: args.tests ?? [],
          status: args.status,
        }),
        profileId,
      };
    case 'astro_hypothesis_status':
      return {
        result: await astroHypothesisStatus(client, userId, profileId as string, args.hid, args.status),
        profileId,
      };
    case 'astro_elimination_table':
      return { result: await astroEliminationTable(client, userId, profileId as string), profileId };
    default:
      return { result: { error: `unknown tool ${name}` }, profileId };
  }
}

function summarize(result: unknown): string {
  const text = typeof result === 'string' ? result : JSON.stringify(result);
  return text.length > 4000 ? `${text.slice(0, 4000)}…[truncated]` : text;
}

export async function runAstrologerTurn({
  client,
  userId,
  sessionId,
  message,
}: TurnOptions): Promise<TurnResult> {
  const { data: session } = await client
    .from('astro_sessions')
    .select('id, profile_id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .single();
  let profileId = (session?.profile_id as string | null) ?? null;

  const { data: history } = await client
    .from('astro_messages')
    .select('role, content, tool_name, tool_payload')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(HISTORY_LIMIT);

  const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }];
  for (const row of (history ?? []) as StoredMessage[]) {
    if (row.role === 'assistant' && row.tool_payload?.tool_calls) {
      messages.push({
        role: 'assistant',
        content: row.content || null,
        tool_calls: row.tool_payload.tool_calls,
      });
    } else if (row.role === 'tool') {
      messages.push({
        role: 'tool',
        content: row.content,
        tool_call_id: row.tool_payload?.tool_call_id ?? '',
      });
    } else if (row.role === 'user' || row.role === 'assistant') {
      messages.push({ role: row.role, content: row.content });
    }
  }
  messages.push({ role: 'user', content: message });
  await persist(client, userId, sessionId, { role: 'user', content: message });

  // Seed the model context with the frozen profile facts when present.
  if (profileId) {
    try {
      const profile = await astroProfileGet(client, userId, profileId);
      messages.push({
        role: 'system',
        content: `Active profile ${profile.name} (${profile.birth_date} ${profile.birth_time} ${profile.tz}). Frozen chart and sensitivity facts are available via atros_chart / atros_sensitivity — use them, never recompute.`,
      });
    } catch {
      profileId = null;
    }
  }

  let toolCalls = 0;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const completion = await chatCompletion({ messages, tools: TOOLS });
    const choice = completion.choices?.[0]?.message as
      | { content?: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> }
      | undefined;
    const toolCallsRequested = choice?.tool_calls ?? [];

    if (toolCallsRequested.length === 0) {
      const answer = choice?.content?.trim() || 'I could not produce a reading from that. Could you rephrase?';
      await persist(client, userId, sessionId, { role: 'assistant', content: answer });
      return { answer, toolCalls, profileId };
    }

    messages.push({
      role: 'assistant',
      content: choice?.content ?? null,
      tool_calls: toolCallsRequested,
    });
    await persist(client, userId, sessionId, {
      role: 'assistant',
      content: choice?.content ?? '',
      tool_payload: { tool_calls: toolCallsRequested },
    });

    for (const call of toolCallsRequested) {
      toolCalls += 1;
      let parsed: ToolArgs = {};
      try {
        parsed = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        parsed = {};
      }
      let outcome: unknown;
      try {
        const dispatched = await dispatch(client, userId, sessionId, profileId, call.function.name, parsed);
        profileId = dispatched.profileId;
        outcome = dispatched.result;
      } catch (error) {
        outcome = { error: error instanceof Error ? error.message : 'tool failed' };
      }
      const text = summarize(outcome);
      messages.push({ role: 'tool', content: text, tool_call_id: call.id });
      await persist(client, userId, sessionId, {
        role: 'tool',
        content: text,
        tool_name: call.function.name,
        tool_payload: { tool_call_id: call.id, result: outcome },
      });
    }
  }

  const answer = 'That needs more calculation than fits in one turn — I saved our progress; ask me to continue.';
  await persist(client, userId, sessionId, { role: 'assistant', content: answer });
  return { answer, toolCalls, profileId };
}
