/** Rehydrate selected source records; ledger reasons are never model context. */

export interface SelectedContextRow {
  item_key: string;
  fact?: { id: string; profile_id: string; fact_key: string; summary: string; status: string; origin: string; revision: number } | null;
  evidence?: { id: string; profile_id: string; source_kind: string; assertion_mode: string; summary: string; exact_quote: string; occurred_on: string | null } | null;
  hypothesis?: { id: string; profile_id: string; hid: string; claim: string; status: string; revision: number } | null;
  event?: { id: string; profile_id: string; on_date: string; title: string; detail: string; fit: string } | null;
  message?: { id: string; role: string; content: string; session: { profile_id: string } | null } | null;
}

export interface SelectedSource {
  kind: 'fact' | 'evidence' | 'hypothesis' | 'event' | 'message';
  id: string;
  title: string;
  excerpt: string;
  status?: string;
}

export function projectSelectedSources(rows: SelectedContextRow[], profileId: string): SelectedSource[] {
  const sources: SelectedSource[] = [];
  for (const row of rows) {
    if (row.fact?.profile_id === profileId && row.fact.status !== 'retired') {
      sources.push({ kind: 'fact', id: row.fact.id, title: row.fact.fact_key,
        excerpt: row.fact.summary, status: `${row.fact.status}; ${row.fact.origin}; revision ${row.fact.revision}` });
    } else if (row.evidence?.profile_id === profileId) {
      sources.push({ kind: 'evidence', id: row.evidence.id, title: row.evidence.source_kind,
        excerpt: `${row.evidence.summary}\nSource quotation: ${row.evidence.exact_quote}`,
        status: `${row.evidence.assertion_mode}${row.evidence.occurred_on ? `; occurred ${row.evidence.occurred_on}` : ''}` });
    } else if (row.hypothesis?.profile_id === profileId) {
      sources.push({ kind: 'hypothesis', id: row.hypothesis.id, title: row.hypothesis.hid,
        excerpt: row.hypothesis.claim, status: `${row.hypothesis.status}; revision ${row.hypothesis.revision}` });
    } else if (row.event?.profile_id === profileId) {
      sources.push({ kind: 'event', id: row.event.id, title: row.event.title,
        excerpt: row.event.detail, status: `${row.event.on_date}; fit ${row.event.fit}` });
    } else if (row.message?.session?.profile_id === profileId) {
      sources.push({ kind: 'message', id: row.message.id, title: `${row.message.role} message`,
        excerpt: row.message.content });
    }
  }
  return sources;
}

/** Keep one model request bounded without replacing source text with a ledger key. */
export function selectedContextBlock(items: SelectedSource[], maxChars = 18000): string {
  if (items.length === 0) return 'No selected sources.';
  const lines: string[] = [];
  let used = 0;
  for (const item of items) {
    const line = `- [${item.kind}:${item.id}] ${item.title}${item.status ? ` (${item.status})` : ''}: ${item.excerpt}`;
    if (used + line.length > maxChars) break;
    lines.push(line);
    used += line.length + 1;
  }
  if (lines.length < items.length) lines.push(`[${items.length - lines.length} additional selected sources omitted by context budget]`);
  return lines.join('\n');
}
