/**
 * Imported material: conversations a person had with other assistants, and
 * documents from connected services. Parsers turn provider exports into these
 * records; the workspace renders them as searchable Markdown under `imports/`.
 */
import { z } from 'zod';

export const IMPORT_PROVIDERS = ['chatgpt', 'claude', 'grok', 'gemini', 'deepseek', 'meta_ai', 'other', 'notion', 'google_drive', 'google_keep'] as const;
export type ImportProvider = typeof IMPORT_PROVIDERS[number];
export const ImportProviderSchema = z.enum(IMPORT_PROVIDERS);

export const PROVIDER_LABELS: Record<ImportProvider, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  grok: 'Grok',
  gemini: 'Gemini',
  deepseek: 'DeepSeek',
  meta_ai: 'Meta AI',
  other: 'Another assistant',
  notion: 'Notion',
  google_drive: 'Google Drive',
  google_keep: 'Google Keep',
};

/**
 * `user` and `assistant` come from a structured export's own role fields.
 * `speaker` means the source only names who spoke (a WhatsApp chat, a pasted
 * transcript); the person says which name is them before anything is imported.
 */
export type MessageRole = 'user' | 'assistant' | 'speaker';

export interface ImportedMessage {
  role: MessageRole;
  /** Display name for `speaker` messages, or the assistant's name. */
  speaker: string | null;
  text: string;
  at: string | null;
}

export interface ImportedItem {
  externalId: string;
  kind: 'conversation' | 'document';
  title: string;
  startedAt: string | null;
  endedAt: string | null;
  messages: ImportedMessage[];
  /** Markdown body for documents. */
  body: string | null;
  sourceUrl: string | null;
}

export interface ParsedImport {
  /** The provider the files actually came from, when recognisable. */
  provider: ImportProvider;
  format: string;
  items: ImportedItem[];
  warnings: string[];
}

export function speakersOf(item: ImportedItem) {
  return [...new Set(item.messages.filter((message) => message.role === 'speaker').map((message) => message.speaker ?? 'Unknown'))];
}
