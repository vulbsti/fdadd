/**
 * Parsers for chatbot data exports. Each recognises its provider's structure
 * and keeps only what the person and the assistant visibly said, in order,
 * with timestamps. Unknown JSON falls back to a structural search for message
 * lists; text falls back to transcript markers, then to a plain document.
 * Nothing here trusts the content: it is data to be rendered, never run.
 */
import { createHash } from 'node:crypto';
import type { ImportedItem, ImportedMessage, ImportProvider, ParsedImport } from './types';

export const PARSER_VERSION = 'imports-1';

export interface SourceFile { name: string; text: string }

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown) => typeof value === 'string' ? value : null;

export function digest(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

/** Epoch seconds or milliseconds, ISO strings, and Mongo-style `{$date}` values. */
export function toIso(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (isObject(value)) {
    if ('$date' in value) return toIso(value.$date);
    if ('$numberLong' in value) return toIso(Number(value.$numberLong));
    return null;
  }
  let date: Date;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    date = new Date(value < 1e12 ? value * 1000 : value);
  } else if (typeof value === 'string') {
    if (/^\d+(\.\d+)?$/.test(value.trim())) return toIso(Number(value));
    date = new Date(value);
  } else {
    return null;
  }
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function finishItem(item: Omit<ImportedItem, 'startedAt' | 'endedAt'> & Partial<Pick<ImportedItem, 'startedAt' | 'endedAt'>>): ImportedItem | null {
  const messages = item.messages.map((message) => ({ ...message, text: message.text.replace(/\r\n/g, '\n').trim() })).filter((message) => message.text);
  if (item.kind === 'conversation' && !messages.length) return null;
  if (item.kind === 'document' && !item.body?.trim()) return null;
  const times = messages.map((message) => message.at).filter((at): at is string => Boolean(at)).sort();
  return {
    ...item,
    title: item.title.replace(/\s+/g, ' ').trim().slice(0, 300) || 'Untitled',
    messages,
    startedAt: item.startedAt ?? times[0] ?? null,
    endedAt: item.endedAt ?? times.at(-1) ?? item.startedAt ?? null,
  };
}

// --- ChatGPT ---------------------------------------------------------------

function isChatGpt(data: unknown): data is JsonObject[] {
  return Array.isArray(data) && data.length > 0 && data.every(isObject)
    && data.some((conv) => isObject(conv.mapping) && !mappingHasFragments(conv.mapping));
}

function mappingHasFragments(mapping: JsonObject) {
  return Object.values(mapping).some((node) => isObject(node) && isObject(node.message) && Array.isArray(node.message.fragments));
}

function chatGptText(message: JsonObject): string {
  const content = isObject(message.content) ? message.content : null;
  if (!content) return '';
  const type = str(content.content_type);
  if (type === 'text' || type === 'multimodal_text') {
    const parts = Array.isArray(content.parts) ? content.parts : [];
    return parts.map((part) => {
      if (typeof part === 'string') return part;
      if (isObject(part)) {
        if (typeof part.text === 'string') return part.text;
        const partType = str(part.content_type) ?? '';
        if (partType.includes('image')) return '[image]';
        if (partType.includes('audio')) return '[audio]';
      }
      return '';
    }).filter(Boolean).join('\n\n');
  }
  // Code, tool output, hidden context, reasoning summaries: not the visible conversation.
  return '';
}

function parseChatGptConversation(conv: JsonObject): ImportedItem | null {
  const mapping = conv.mapping as JsonObject;
  const nodes = Object.entries(mapping).filter(([, node]) => isObject(node)) as Array<[string, JsonObject]>;
  let current = str(conv.current_node);
  if (!current || !isObject(mapping[current])) {
    // No recorded branch: follow the most recent leaf.
    const leaves = nodes.filter(([, node]) => !Array.isArray(node.children) || node.children.length === 0);
    leaves.sort(([, a], [, b]) => Number(isObject(a.message) ? a.message.create_time ?? 0 : 0) - Number(isObject(b.message) ? b.message.create_time ?? 0 : 0));
    current = leaves.at(-1)?.[0] ?? null;
  }
  const path: JsonObject[] = [];
  const seen = new Set<string>();
  while (current && isObject(mapping[current]) && !seen.has(current)) {
    seen.add(current);
    const node = mapping[current] as JsonObject;
    path.unshift(node);
    current = str(node.parent);
  }
  const messages: ImportedMessage[] = [];
  for (const node of path) {
    const message = isObject(node.message) ? node.message : null;
    if (!message) continue;
    const role = isObject(message.author) ? str(message.author.role) : null;
    if (role !== 'user' && role !== 'assistant') continue;
    const metadata = isObject(message.metadata) ? message.metadata : {};
    if (metadata.is_visually_hidden_from_conversation === true) continue;
    const recipient = str(message.recipient);
    if (recipient && recipient !== 'all') continue;
    messages.push({ role, speaker: role === 'assistant' ? 'ChatGPT' : null, text: chatGptText(message), at: toIso(message.create_time) });
  }
  const id = str(conv.conversation_id) ?? str(conv.id) ?? digest(JSON.stringify(messages));
  return finishItem({ externalId: id, kind: 'conversation', title: str(conv.title) ?? 'ChatGPT conversation', messages, body: null,
    sourceUrl: null, startedAt: toIso(conv.create_time), endedAt: toIso(conv.update_time) });
}

// --- DeepSeek (ChatGPT-like mapping with request/response fragments) --------

function isDeepSeek(data: unknown): data is JsonObject[] {
  return Array.isArray(data) && data.length > 0 && data.every(isObject)
    && data.some((conv) => isObject(conv.mapping) && mappingHasFragments(conv.mapping));
}

function parseDeepSeekConversation(conv: JsonObject): ImportedItem | null {
  const mapping = conv.mapping as JsonObject;
  const messages: ImportedMessage[] = [];
  // Follow the last child at each fork: the branch the person kept going with.
  let current: string | null = isObject(mapping.root) ? 'root' : Object.keys(mapping).find((key) => isObject(mapping[key]) && !(mapping[key] as JsonObject).parent) ?? null;
  const seen = new Set<string>();
  while (current && isObject(mapping[current]) && !seen.has(current)) {
    seen.add(current);
    const node = mapping[current] as JsonObject;
    const message = isObject(node.message) ? node.message : null;
    for (const fragment of message && Array.isArray(message.fragments) ? message.fragments : []) {
      if (!isObject(fragment)) continue;
      const type = String(fragment.type ?? '').toUpperCase();
      const text = str(fragment.content) ?? '';
      if (type === 'REQUEST') messages.push({ role: 'user', speaker: null, text, at: toIso(message!.inserted_at) });
      if (type === 'RESPONSE') messages.push({ role: 'assistant', speaker: 'DeepSeek', text, at: toIso(message!.inserted_at) });
    }
    const children = Array.isArray(node.children) ? node.children.map(String) : [];
    current = children.at(-1) ?? null;
  }
  const id = str(conv.id) ?? digest(JSON.stringify(messages));
  return finishItem({ externalId: id, kind: 'conversation', title: str(conv.title) ?? 'DeepSeek conversation', messages, body: null,
    sourceUrl: null, startedAt: toIso(conv.inserted_at), endedAt: toIso(conv.updated_at) });
}

// --- Claude ------------------------------------------------------------------

function isClaude(data: unknown): data is JsonObject[] {
  return Array.isArray(data) && data.length > 0 && data.every(isObject) && data.some((conv) => Array.isArray(conv.chat_messages));
}

function claudeText(message: JsonObject) {
  const parts: string[] = [];
  if (Array.isArray(message.content) && message.content.length) {
    for (const part of message.content) {
      if (isObject(part) && part.type === 'text' && typeof part.text === 'string') parts.push(part.text);
    }
  } else if (typeof message.text === 'string') {
    parts.push(message.text);
  }
  for (const attachment of Array.isArray(message.attachments) ? message.attachments : []) {
    if (!isObject(attachment)) continue;
    const content = str(attachment.extracted_content);
    const name = str(attachment.file_name) ?? 'attachment';
    parts.push(content ? `[Attached ${name}]\n\n${content}` : `[Attached ${name}]`);
  }
  return parts.join('\n\n');
}

function parseClaudeConversation(conv: JsonObject): ImportedItem | null {
  const messages: ImportedMessage[] = [];
  for (const message of conv.chat_messages as Json[]) {
    if (!isObject(message)) continue;
    const sender = str(message.sender);
    if (sender !== 'human' && sender !== 'assistant') continue;
    messages.push({ role: sender === 'human' ? 'user' : 'assistant', speaker: sender === 'assistant' ? 'Claude' : null,
      text: claudeText(message), at: toIso(message.created_at) });
  }
  const id = str(conv.uuid) ?? digest(JSON.stringify(messages));
  return finishItem({ externalId: id, kind: 'conversation', title: str(conv.name) || 'Claude conversation', messages, body: null,
    sourceUrl: null, startedAt: toIso(conv.created_at), endedAt: toIso(conv.updated_at) });
}

// --- Grok (accounts.x.ai export, prod-grok-backend.json) ---------------------

function isGrok(data: unknown): data is JsonObject {
  return isObject(data) && Array.isArray(data.conversations)
    && data.conversations.some((item) => isObject(item) && Array.isArray(item.responses));
}

function parseGrokConversation(entry: JsonObject): ImportedItem | null {
  const conv = isObject(entry.conversation) ? entry.conversation : {};
  const messages: ImportedMessage[] = [];
  for (const wrapper of entry.responses as Json[]) {
    const response = isObject(wrapper) && isObject(wrapper.response) ? wrapper.response : isObject(wrapper) ? wrapper : null;
    if (!response) continue;
    const sender = String(response.sender ?? '').toLowerCase();
    const role = sender === 'human' || sender === 'user' ? 'user' : sender === 'assistant' || sender === 'grok' ? 'assistant' : null;
    if (!role) continue;
    messages.push({ role, speaker: role === 'assistant' ? 'Grok' : null, text: str(response.message) ?? '', at: toIso(response.create_time) });
  }
  messages.sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''));
  const id = str(conv.id) ?? digest(JSON.stringify(messages));
  return finishItem({ externalId: id, kind: 'conversation', title: str(conv.title) ?? 'Grok conversation', messages, body: null,
    sourceUrl: null, startedAt: toIso(conv.create_time), endedAt: toIso(conv.modify_time) });
}

// --- Gemini (Google Takeout, My Activity > Gemini Apps) ----------------------

function isGemini(data: unknown): data is JsonObject[] {
  return Array.isArray(data) && data.length > 0 && data.every(isObject)
    && data.some((entry) => /gemini|bard/i.test(String(entry.header ?? '')) && typeof entry.title === 'string' && typeof entry.time === 'string');
}

export function htmlToText(html: string) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|pre|blockquote)>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Takeout has no conversation IDs: each prompt is one activity, grouped here by day. */
function parseGemini(entries: JsonObject[]): ImportedItem[] {
  const byDay = new Map<string, ImportedMessage[]>();
  for (const entry of entries) {
    if (!/gemini|bard/i.test(String(entry.header ?? ''))) continue;
    const title = str(entry.title) ?? '';
    const prompt = title.replace(/^(Prompted|Asked)\s+/i, '');
    if (!/^(Prompted|Asked)\s/i.test(title)) continue;
    const at = toIso(entry.time);
    const day = at?.slice(0, 10) ?? 'undated';
    const response = (Array.isArray(entry.safeHtmlItem) ? entry.safeHtmlItem : [])
      .map((item) => isObject(item) && typeof item.html === 'string' ? htmlToText(item.html) : '').filter(Boolean).join('\n\n');
    const turns = byDay.get(day) ?? [];
    turns.push({ role: 'user', speaker: null, text: prompt, at });
    if (response) turns.push({ role: 'assistant', speaker: 'Gemini', text: response, at });
    byDay.set(day, turns);
  }
  const items: ImportedItem[] = [];
  for (const [day, turns] of byDay) {
    // Takeout lists newest first; keep pairs together while ordering by time.
    const pairs: ImportedMessage[][] = [];
    for (const turn of turns) {
      if (turn.role === 'user') pairs.push([turn]); else pairs.at(-1)?.push(turn);
    }
    pairs.sort((a, b) => (a[0].at ?? '').localeCompare(b[0].at ?? ''));
    const item = finishItem({ externalId: `gemini-${day}`, kind: 'conversation', title: `Gemini, ${day}`, messages: pairs.flat(), body: null, sourceUrl: null });
    if (item) items.push(item);
  }
  return items.sort((a, b) => (a.startedAt ?? '').localeCompare(b.startedAt ?? ''));
}

// --- Any other JSON: find lists of messages by shape ------------------------

const USER_ROLES = /^(user|human|you|me|person|prompt|request|question|client|customer)$/i;
const ASSISTANT_ROLES = /^(assistant|ai|bot|model|chatbot|system_response|response|answer|gpt|chatgpt|claude|grok|gemini|bard|copilot|perplexity|deepseek|meta ?ai|llama|pi|character)$/i;
const SKIP_ROLES = /^(system|tool|function|developer|context)$/i;
const ROLE_KEYS = ['role', 'sender', 'author', 'speaker', 'from', 'participant', 'sender_name', 'user_type', 'type'];
const TEXT_KEYS = ['content', 'text', 'message', 'body', 'value', 'parts', 'msg'];
const TIME_KEYS = ['created_at', 'create_time', 'timestamp', 'timestamp_ms', 'time', 'date', 'inserted_at', 'sent_at', 'createdAt'];
const TITLE_KEYS = ['title', 'name', 'subject', 'topic'];
const PAIR_KEYS: Array<[string, string]> = [['prompt', 'response'], ['question', 'answer'], ['request', 'response'], ['input', 'output'], ['user', 'assistant']];

function flatText(value: Json | undefined): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(flatText).filter(Boolean).join('\n\n');
  if (isObject(value)) return flatText(value.text ?? value.content ?? value.value ?? value.parts);
  return '';
}

function roleName(value: Json | undefined): string | null {
  if (typeof value === 'string') return value;
  if (isObject(value)) return str(value.role) ?? str(value.name) ?? str(value.type);
  return null;
}

function classify(name: string, assistantName: string): Pick<ImportedMessage, 'role' | 'speaker'> | null {
  const trimmed = name.trim();
  if (SKIP_ROLES.test(trimmed)) return null;
  if (USER_ROLES.test(trimmed)) return { role: 'user', speaker: null };
  if (ASSISTANT_ROLES.test(trimmed)) return { role: 'assistant', speaker: /^(assistant|ai|bot|model|chatbot|response|answer|system_response)$/i.test(trimmed) ? assistantName : trimmed };
  return { role: 'speaker', speaker: trimmed.slice(0, 100) };
}

function messagesFromObject(object: JsonObject, assistantName: string): ImportedMessage[] | null {
  const at = toIso(TIME_KEYS.map((key) => object[key]).find((value) => value !== undefined && value !== null));
  for (const [ask, reply] of PAIR_KEYS) {
    const question = flatText(object[ask]);
    const answer = flatText(object[reply]);
    if (question && answer && typeof object[ask] !== 'object') {
      return [{ role: 'user', speaker: null, text: question, at }, { role: 'assistant', speaker: assistantName, text: answer, at }];
    }
  }
  const roleKey = ROLE_KEYS.find((key) => roleName(object[key]));
  const textKey = TEXT_KEYS.find((key) => flatText(object[key]).trim());
  if (!roleKey || !textKey) return null;
  const who = classify(roleName(object[roleKey])!, assistantName);
  if (!who) return [];
  return [{ ...who, text: flatText(object[textKey]), at }];
}

function findConversations(root: Json, assistantName: string) {
  const found: Array<{ title: string | null; id: string | null; messages: ImportedMessage[] }> = [];
  const visit = (value: Json, owner: JsonObject | null, depth: number) => {
    if (depth > 12) return;
    if (Array.isArray(value)) {
      const objects = value.filter(isObject);
      const parsed = objects.map((object) => messagesFromObject(object, assistantName));
      const hits = parsed.filter((messages) => messages !== null).length;
      if (objects.length && hits / objects.length >= 0.6) {
        const messages = parsed.flatMap((messages) => messages ?? []);
        if (messages.length) {
          const title = owner ? TITLE_KEYS.map((key) => str(owner[key])).find(Boolean) ?? null : null;
          const id = owner ? str(owner.id) ?? str(owner.uuid) ?? str(owner.conversation_id) ?? str(owner.thread_id) : null;
          found.push({ title, id, messages });
          return;
        }
      }
      for (const item of value) visit(item, isObject(item) ? item : owner, depth + 1);
      return;
    }
    if (isObject(value)) for (const child of Object.values(value)) visit(child, value, depth + 1);
  };
  visit(root, isObject(root) ? root : null, 0);
  return found;
}

// --- Text: WhatsApp exports, pasted transcripts, notes ------------------------

const WHATSAPP_LINE = /^‎?\[?(\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}),?\s+(\d{1,2}[:.]\d{2}(?:[:.]\d{2})?(?:\s?[APap]\.?\s?[Mm]\.?)?)\]?\s*(?:[-–]\s*)?([^:\n]{1,80}?):\s(.*)$/;

function whatsappDate(date: string, time: string, dayFirst: boolean) {
  const [a, b, c] = date.split(/[/.-]/).map(Number);
  let year: number, month: number, day: number;
  if (a > 31) [year, month, day] = [a, b, c];
  else [day, month, year] = dayFirst ? [a, b, c] : [b, a, c];
  if (year < 100) year += 2000;
  const match = time.replace('.', ':').match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([APap])?/);
  if (!match) return null;
  let hour = Number(match[1]);
  if (match[4]?.toLowerCase() === 'p' && hour < 12) hour += 12;
  if (match[4]?.toLowerCase() === 'a' && hour === 12) hour = 0;
  // Exports carry the phone's local time with no zone; keep the wall-clock time.
  const iso = new Date(Date.UTC(year, month - 1, day, hour, Number(match[2]), Number(match[3] ?? 0)));
  return Number.isNaN(iso.getTime()) ? null : iso.toISOString();
}

export function parseWhatsApp(text: string, title: string): ImportedItem | null {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const starts = lines.map((line) => line.match(WHATSAPP_LINE));
  if (starts.filter(Boolean).length < 2) return null;
  const firstParts = starts.filter((match): match is RegExpMatchArray => Boolean(match)).map((match) => match[1].split(/[/.-]/).map(Number));
  const dayFirst = !firstParts.some(([a, b]) => a <= 12 && b > 12) || firstParts.some(([a]) => a > 12 && a <= 31);
  const messages: ImportedMessage[] = [];
  lines.forEach((line, index) => {
    const match = starts[index];
    if (match) {
      const name = match[3].replace(/^‎/, '').trim();
      const assistant = /^meta ai$/i.test(name);
      messages.push({ role: assistant ? 'assistant' : 'speaker', speaker: name, text: match[4], at: whatsappDate(match[1], match[2], dayFirst) });
    } else if (messages.length) {
      messages.at(-1)!.text += `\n${line}`;
    }
  });
  const kept = messages.filter((message) => !/^<Media omitted>$|^‎?(image|audio|video|sticker) omitted$/i.test(message.text.trim()));
  return finishItem({ externalId: digest(text), kind: 'conversation', title, messages: kept, body: null, sourceUrl: null });
}

const TRANSCRIPT_MARKER = /^\s*(?:#{1,6}\s+|\*\*)?(you|user|me|human|person|assistant|chatgpt|claude|grok|gemini|meta ai|copilot|perplexity|deepseek|ai|bot|model)(?:\s+said)?(?:\*\*)?\s*:(?:\*\*)?\s*(.*)$/i;
const TRANSCRIPT_HEADING = /^\s*#{1,6}\s+(you|user|me|human|person|assistant|chatgpt|claude|grok|gemini|meta ai|copilot|perplexity|deepseek|ai|bot|model)\s*$/i;

export function parseTranscript(text: string, title: string, assistantName: string): ImportedItem | null {
  const messages: ImportedMessage[] = [];
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const match = line.match(TRANSCRIPT_MARKER) ?? line.match(TRANSCRIPT_HEADING);
    if (match) {
      const name = match[1];
      const user = USER_ROLES.test(name);
      messages.push({ role: user ? 'user' : 'assistant', speaker: user ? null : (/^(assistant|ai|bot|model)$/i.test(name) ? assistantName : name), text: match[2] ?? '', at: null });
    } else if (messages.length) {
      messages.at(-1)!.text += `\n${line}`;
    }
  }
  const roles = new Set(messages.map((message) => message.role));
  if (messages.length < 2 || !roles.has('user') || !roles.has('assistant')) return null;
  return finishItem({ externalId: digest(text), kind: 'conversation', title, messages, body: null, sourceUrl: null });
}

// --- Entry point ---------------------------------------------------------------

const ASSISTANT_NAMES: Record<ImportProvider, string> = {
  chatgpt: 'ChatGPT', claude: 'Claude', grok: 'Grok', gemini: 'Gemini', deepseek: 'DeepSeek', meta_ai: 'Meta AI', other: 'Assistant', notion: 'Notion',
};

function baseName(name: string) {
  return name.split('/').at(-1)!.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim() || 'Imported text';
}

function jsonOf(file: SourceFile): Json | undefined {
  try {
    return JSON.parse(file.text.replace(/^﻿/, '')) as Json;
  } catch {
    return undefined;
  }
}

/**
 * Parse every file in an upload. Recognised provider structures win; generic
 * structural matching runs only when nothing in the upload was recognised, so
 * side files in a known export (projects, settings) never become conversations.
 */
export function parseExport(files: SourceFile[], chosen: ImportProvider): ParsedImport {
  const warnings: string[] = [];
  const items: ImportedItem[] = [];
  const formats = new Set<string>();
  let detected: ImportProvider | null = null;
  const unrecognisedJson: Array<{ file: SourceFile; data: Json }> = [];
  const textFiles: SourceFile[] = [];
  const keep = (item: ImportedItem | null) => { if (item) items.push(item); };

  for (const file of files) {
    if (/\.json$/i.test(file.name)) {
      const data = jsonOf(file);
      if (data === undefined) { warnings.push(`${file.name} is not valid JSON and was skipped.`); continue; }
      if (isDeepSeek(data)) { detected ??= 'deepseek'; formats.add('deepseek-conversations'); data.forEach((conv) => keep(parseDeepSeekConversation(conv))); }
      else if (isChatGpt(data)) { detected ??= 'chatgpt'; formats.add('chatgpt-conversations'); data.forEach((conv) => keep(parseChatGptConversation(conv))); }
      else if (isClaude(data)) { detected ??= 'claude'; formats.add('claude-conversations'); data.forEach((conv) => keep(parseClaudeConversation(conv))); }
      else if (isGrok(data)) {
        detected ??= 'grok'; formats.add('grok-backend');
        (data.conversations as Json[]).forEach((entry) => { if (isObject(entry)) keep(parseGrokConversation(entry)); });
      } else if (isGemini(data)) { detected ??= 'gemini'; formats.add('google-takeout-gemini'); items.push(...parseGemini(data)); }
      else unrecognisedJson.push({ file, data });
    } else if (/\.(txt|md|markdown)$/i.test(file.name)) {
      textFiles.push(file);
    } else if (/\.html?$/i.test(file.name)) {
      warnings.push(`${file.name} is HTML. Choose the JSON format when you export, or paste the conversation as text.`);
    }
  }

  const assistantName = ASSISTANT_NAMES[detected ?? chosen];
  if (!detected) {
    for (const { file, data } of unrecognisedJson) {
      const conversations = findConversations(data, assistantName);
      if (!conversations.length) { warnings.push(`${file.name} did not contain any recognisable messages.`); continue; }
      formats.add('generic-json');
      conversations.forEach((conversation, index) => keep(finishItem({
        externalId: conversation.id ?? digest(`${file.name}:${index}:${JSON.stringify(conversation.messages)}`),
        kind: 'conversation', title: conversation.title ?? `${baseName(file.name)}${conversations.length > 1 ? ` ${index + 1}` : ''}`,
        messages: conversation.messages, body: null, sourceUrl: null,
      })));
    }
  }
  for (const file of textFiles) {
    const title = baseName(file.name);
    const whatsapp = parseWhatsApp(file.text, title);
    if (whatsapp) { formats.add('whatsapp-chat'); items.push(whatsapp); continue; }
    const transcript = parseTranscript(file.text, title, assistantName);
    if (transcript) { formats.add('transcript-text'); items.push(transcript); continue; }
    formats.add('text-document');
    keep(finishItem({ externalId: digest(file.text), kind: 'document', title, messages: [], body: file.text.replace(/\r\n/g, '\n').trim(), sourceUrl: null }));
  }

  // One export can list a conversation twice (for example across split files).
  const unique = new Map<string, ImportedItem>();
  for (const item of items) {
    const existing = unique.get(item.externalId);
    if (!existing || item.messages.length > existing.messages.length) unique.set(item.externalId, item);
  }
  const provider = detected ?? chosen;
  return { provider, format: [...formats].sort().join('+') || 'none', items: [...unique.values()], warnings };
}
