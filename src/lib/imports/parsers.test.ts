import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { readArchive } from './archive';
import { parseExport, parseTranscript, parseWhatsApp, toIso } from './parsers';
import { importFilePath, renderImportFiles, renderImportedItem } from './render';

const json = (name: string, value: unknown) => ({ name, text: JSON.stringify(value) });

describe('ChatGPT export', () => {
  const conversation = {
    title: 'Career change', create_time: 1727000000.5, update_time: 1727003600, conversation_id: 'c-1', current_node: 'a2',
    mapping: {
      root: { id: 'root', message: null, parent: null, children: ['sys'] },
      sys: { id: 'sys', parent: 'root', children: ['u1'], message: { author: { role: 'system' }, content: { content_type: 'text', parts: [''] } } },
      u1: { id: 'u1', parent: 'sys', children: ['a1', 'a2'], message: { author: { role: 'user' }, create_time: 1727000100, content: { content_type: 'text', parts: ['Should I quit my job?'] } } },
      a1: { id: 'a1', parent: 'u1', children: [], message: { author: { role: 'assistant' }, create_time: 1727000200, content: { content_type: 'text', parts: ['Abandoned branch'] } } },
      tool: { id: 'tool', parent: 'u1', children: [], message: { author: { role: 'assistant' }, recipient: 'browser', content: { content_type: 'code', text: 'search()' } } },
      a2: { id: 'a2', parent: 'u1', children: [], message: { author: { role: 'assistant' }, create_time: 1727000300, content: { content_type: 'multimodal_text', parts: ['Kept answer', { content_type: 'image_asset_pointer' }] } } },
    },
  };

  it('follows the kept branch and drops system and hidden turns', () => {
    const parsed = parseExport([json('conversations.json', [conversation])], 'other');
    expect(parsed.provider).toBe('chatgpt');
    expect(parsed.items).toHaveLength(1);
    const [item] = parsed.items;
    expect(item.externalId).toBe('c-1');
    expect(item.messages.map((message) => [message.role, message.text])).toEqual([
      ['user', 'Should I quit my job?'],
      ['assistant', 'Kept answer\n\n[image]'],
    ]);
    expect(item.startedAt).toBe('2024-09-22T10:13:20.500Z');
  });
});

describe('Claude export', () => {
  it('reads text parts and attachment contents, skipping thinking', () => {
    const parsed = parseExport([json('conversations.json', [{
      uuid: 'cl-1', name: 'Sleep', created_at: '2025-01-02T03:04:05Z', updated_at: '2025-01-02T04:00:00Z',
      chat_messages: [
        { sender: 'human', text: 'I sleep badly', content: [{ type: 'text', text: 'I sleep badly' }], created_at: '2025-01-02T03:04:05Z',
          attachments: [{ file_name: 'diary.txt', extracted_content: 'Monday: 4 hours' }] },
        { sender: 'assistant', content: [{ type: 'thinking', thinking: 'hmm' }, { type: 'text', text: 'Tell me more' }], created_at: '2025-01-02T03:05:00Z' },
      ],
    }]), json('users.json', [{ uuid: 'u', full_name: 'Someone' }]), json('projects.json', [{ name: 'p', docs: [{ role: 'user', content: 'not a chat' }] }])], 'claude');
    expect(parsed.provider).toBe('claude');
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].messages[0].text).toBe('I sleep badly\n\n[Attached diary.txt]\n\nMonday: 4 hours');
    expect(parsed.items[0].messages[1]).toMatchObject({ role: 'assistant', speaker: 'Claude', text: 'Tell me more' });
  });
});

describe('Grok export', () => {
  it('reads prod-grok-backend.json with Mongo-style dates', () => {
    const parsed = parseExport([json('ttl/30d/export_data/abc/prod-grok-backend.json', { conversations: [{
      conversation: { id: 'g-1', title: 'Moving cities', create_time: '2025-03-01T10:00:00Z' },
      responses: [
        { response: { sender: 'ASSISTANT', message: 'Where to?', create_time: { $date: { $numberLong: '1740823260000' } } } },
        { response: { sender: 'human', message: 'Thinking about Pune', create_time: { $date: { $numberLong: '1740823200000' } } } },
      ],
    }] })], 'grok');
    expect(parsed.provider).toBe('grok');
    expect(parsed.items[0].messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(parsed.items[0].messages[0].at).toBe('2025-03-01T10:00:00.000Z');
  });
});

describe('Gemini takeout', () => {
  it('groups prompts by day with their responses', () => {
    const parsed = parseExport([json('Takeout/My Activity/Gemini Apps/MyActivity.json', [
      { header: 'Gemini Apps', title: 'Prompted what is my purpose', time: '2025-05-01T12:00:00Z', safeHtmlItem: [{ html: '<p>Big <b>question</b>.</p>' }] },
      { header: 'Gemini Apps', title: 'Prompted hello', time: '2025-05-01T09:00:00Z' },
      { header: 'Gemini Apps', title: 'Used an extension', time: '2025-05-01T10:00:00Z' },
    ])], 'gemini');
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].messages.map((message) => message.text)).toEqual(['hello', 'what is my purpose', 'Big question.']);
  });
});

describe('DeepSeek export', () => {
  it('reads request and response fragments along the last branch', () => {
    const parsed = parseExport([json('conversations.json', [{
      id: 'd-1', title: 'Exams', inserted_at: '2025-02-01T00:00:00Z',
      mapping: {
        root: { id: 'root', parent: null, children: ['1'], message: null },
        1: { id: '1', parent: 'root', children: ['2'], message: { inserted_at: '2025-02-01T00:01:00Z', fragments: [{ type: 'REQUEST', content: 'I failed an exam' }] } },
        2: { id: '2', parent: '1', children: [], message: { inserted_at: '2025-02-01T00:02:00Z', fragments: [{ type: 'THINK', content: 'x' }, { type: 'RESPONSE', content: 'That is hard' }] } },
      },
    }])], 'deepseek');
    expect(parsed.provider).toBe('deepseek');
    expect(parsed.items[0].messages.map((message) => message.text)).toEqual(['I failed an exam', 'That is hard']);
  });
});

describe('Google Keep takeout', () => {
  it('reads one note per file, with checklists and labels, skipping trashed notes', () => {
    const parsed = parseExport([
      json('Takeout/Keep/Dreams.json', { title: 'Dreams', textContent: 'Flying again', createdTimestampUsec: 1700000000000000, userEditedTimestampUsec: 1700000100000000,
        isTrashed: false, isArchived: false, labels: [{ name: 'journal' }] }),
      json('Takeout/Keep/Groceries.json', { title: '', listContent: [{ text: 'milk', isChecked: true }, { text: 'eggs', isChecked: false }], createdTimestampUsec: 1700000200000000, isTrashed: false }),
      json('Takeout/Keep/Old.json', { title: 'Old', textContent: 'gone', createdTimestampUsec: 1, isTrashed: true }),
      { name: 'Takeout/Keep/Labels.txt', text: 'journal' },
    ], 'google_keep');
    expect(parsed.provider).toBe('google_keep');
    expect(parsed.items.map((item) => [item.kind, item.title, item.body])).toEqual([
      ['document', 'Dreams', 'Flying again\n\nLabels: journal'],
      ['document', 'Untitled note', '- [x] milk\n- [ ] eggs'],
    ]);
    expect(parsed.items[0]).toMatchObject({ externalId: 'keep-1700000000000000', startedAt: '2023-11-14T22:13:20.000Z', endedAt: '2023-11-14T22:15:00.000Z' });
  });
});

describe('unknown JSON', () => {
  it('finds message lists by shape and flags unknown speakers', () => {
    const parsed = parseExport([json('meta/your_ai_conversations.json', { threads: [
      { title: 'Recipes', messages: [{ sender_name: 'Asha', text: 'What should I cook?', timestamp_ms: 1735689600000 }, { sender_name: 'Meta AI', text: 'Dal' }] },
    ] })], 'meta_ai');
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].title).toBe('Recipes');
    expect(parsed.items[0].messages.map((message) => [message.role, message.speaker])).toEqual([['speaker', 'Asha'], ['assistant', 'Meta AI']]);
  });

  it('reads prompt and response pairs', () => {
    const parsed = parseExport([json('history.json', [{ prompt: 'hi', response: 'hello', created_at: '2025-01-01T00:00:00Z' }])], 'other');
    expect(parsed.items[0].messages.map((message) => message.role)).toEqual(['user', 'assistant']);
  });

  it('never applies generic matching beside a recognised export', () => {
    const parsed = parseExport([json('conversations.json', [{ uuid: 'x', name: 'n', chat_messages: [{ sender: 'human', text: 'a' }] }]),
      json('projects.json', [{ docs: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'y' }] }])], 'claude');
    expect(parsed.items).toHaveLength(1);
  });
});

describe('text', () => {
  it('reads a WhatsApp export with Meta AI', () => {
    const item = parseWhatsApp('13/02/2025, 21:04 - Asha: am I stuck?\nstill thinking\n13/02/2025, 21:05 - Meta AI: Tell me more\n13/02/2025, 21:06 - Asha: <Media omitted>', 'Meta AI chat');
    expect(item?.messages.map((message) => [message.role, message.speaker, message.text])).toEqual([
      ['speaker', 'Asha', 'am I stuck?\nstill thinking'], ['assistant', 'Meta AI', 'Tell me more'],
    ]);
    expect(item?.messages[0].at).toBe('2025-02-13T21:04:00.000Z');
  });

  it('reads the bracketed iOS form', () => {
    const item = parseWhatsApp('[2/13/25, 9:04:10 PM] Asha: hi\n[2/13/25, 9:05:00 PM] Meta AI: hello', 'chat');
    expect(item?.messages[0].at).toBe('2025-02-13T21:04:10.000Z');
  });

  it('reads a pasted "You said / ChatGPT said" transcript', () => {
    const item = parseTranscript('You said:\nI keep procrastinating\nChatGPT said:\nWhat happens right before?', 'Pasted', 'Assistant');
    expect(item?.messages.map((message) => [message.role, message.speaker])).toEqual([['user', null], ['assistant', 'ChatGPT']]);
  });

  it('keeps plain notes as documents', () => {
    const parsed = parseExport([{ name: 'journal.md', text: '# 2024\nA hard year.' }], 'other');
    expect(parsed.items[0]).toMatchObject({ kind: 'document', title: 'journal' });
  });
});

describe('archive', () => {
  it('reads text entries only', () => {
    const zip = zipSync({ 'conversations.json': strToU8('[]'), 'image.png': new Uint8Array([1, 2, 3]), '__MACOSX/._x.json': strToU8('x') });
    expect(readArchive(zip).map((file) => file.name)).toEqual(['conversations.json']);
  });

  it('rejects a non-zip', () => {
    expect(() => readArchive(strToU8('not a zip'))).toThrow('not a readable ZIP');
  });
});

describe('rendering', () => {
  const base = { id: 'aaaaaaaa-1111-4000-8000-000000000000', provider: 'meta_ai' as const, kind: 'conversation' as const, title: 'Am I stuck?',
    startedAt: '2025-02-13T21:04:00.000Z', endedAt: null, body: null, sourceUrl: null,
    messages: [{ role: 'speaker' as const, speaker: 'Asha', text: 'am I stuck?', at: '2025-02-13T21:04:00.000Z' }, { role: 'assistant' as const, speaker: 'Meta AI', text: 'Tell me more', at: null }] };

  it('labels the mapped speaker as the person', () => {
    const text = renderImportedItem({ ...base, personSpeaker: 'Asha' });
    expect(text).toContain('## Person · 2025-02-13 21:04');
    expect(text).toContain('## Meta AI');
    expect(text).toContain("Meta AI's replies are another assistant's interpretations");
  });

  it('names files by source, date and title, with an index', () => {
    expect(importFilePath(base)).toBe('imports/meta_ai/2025-02-13-am-i-stuck-aaaaaaaa.md');
    const files = renderImportFiles([{ ...base, personSpeaker: 'Asha' }]);
    expect(files.map((file) => file.path)).toEqual(['imports/meta_ai/2025-02-13-am-i-stuck-aaaaaaaa.md', 'imports/index.md']);
    expect(files[1].content).toContain('| meta_ai/2025-02-13-am-i-stuck-aaaaaaaa.md | Meta AI | conversation | 2025-02-13 | 1 |');
  });
});

describe('dates', () => {
  it('normalises the formats exports use', () => {
    expect(toIso(1700000000)).toBe('2023-11-14T22:13:20.000Z');
    expect(toIso(1700000000000)).toBe('2023-11-14T22:13:20.000Z');
    expect(toIso({ $date: '2023-11-14T22:13:20Z' })).toBe('2023-11-14T22:13:20.000Z');
    expect(toIso('garbage')).toBeNull();
  });
});
