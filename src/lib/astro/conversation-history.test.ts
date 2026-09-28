import { describe, expect, it } from 'vitest';
import { buildHistory, historyFileName, type HistoryMessage, type HistorySession } from './conversation-history';

const first: HistorySession = { id: 'aaaaaaaa-0000-4000-8000-000000000001', title: 'Career in 2026?', createdAt: '2026-09-20T10:00:00.000Z' };
const second: HistorySession = { id: 'bbbbbbbb-0000-4000-8000-000000000002', title: 'Notebook', createdAt: '2026-09-28T09:00:00.000Z' };
const message = (id: string, sessionId: string, role: 'user' | 'assistant', content: string, minute: number): HistoryMessage =>
  ({ id, sessionId, role, content, createdAt: `2026-09-28T09:${String(minute).padStart(2, '0')}:00.000Z` });

describe('conversation history', () => {
  const messages = [
    { ...message('m1', first.id, 'user', 'I delay asking Priya for help.', 0), createdAt: '2026-09-20T10:01:00.000Z' },
    { ...message('m2', first.id, 'assistant', 'That sounds like a pattern.', 0), createdAt: '2026-09-20T10:02:00.000Z' },
    message('m3', second.id, 'user', 'Private thing I excluded.', 1),
    message('m4', second.id, 'assistant', 'Noted.', 2),
    message('m5', second.id, 'user', 'What is my dasha in 2026?', 3),
  ];
  const history = buildHistory([first, second], messages, new Set(['m3']));

  it('names files by date, title and session', () => {
    expect(historyFileName(first)).toBe('2026-09-20-career-in-2026-aaaaaaaa.md');
    expect(history.fileFor(second.id)).toBe('2026-09-28-notebook-bbbbbbbb.md');
  });

  it('writes one searchable file per conversation plus an index', () => {
    const paths = history.files.map((file) => file.path);
    expect(paths).toEqual(['history/2026-09-20-career-in-2026-aaaaaaaa.md', 'history/2026-09-28-notebook-bbbbbbbb.md', 'history/index.md']);
    expect(history.files[0].content).toContain('## Person · 2026-09-20 10:01');
    expect(history.files[0].content).toContain('I delay asking Priya for help.');
    expect(history.files[2].content).toContain('| 2026-09-28-notebook-bbbbbbbb.md | 2026-09-28 09:00 | 2026-09-28 09:03 | 3 |');
  });

  it('never shows an excluded message', () => {
    const all = history.files.map((file) => file.content).join('\n');
    expect(all).not.toContain('Private thing');
    expect(all).toContain('excluded this message');
  });

  it('gives the turns before the latest person message', () => {
    expect(history.earlierTurns(second.id).map((turn) => turn.content)).toEqual([expect.stringContaining('excluded'), 'Noted.']);
    expect(history.earlierTurns(first.id)).toEqual([]);
  });
});
