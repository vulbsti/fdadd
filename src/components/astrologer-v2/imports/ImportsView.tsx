'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, FileUp, Link2, Loader2, Trash2, Unplug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import { notifyPersonStateChanged } from '@/components/astrologer/person-state-sync';
import { PROVIDER_LABELS, type ImportProvider } from '@/lib/imports/types';
import { buildUpload } from './client-archive';

type FileProvider = Exclude<ImportProvider, 'notion' | 'google_drive'>;

interface ImportSummary {
  id: string; provider: ImportProvider; status: string; fileName: string | null; warnings: string[];
  error: string | null; createdAt: string; importedAt: string | null; itemCount: number;
}
interface PreviewItem {
  id: string; kind: 'conversation' | 'document'; title: string; startedAt: string | null; endedAt: string | null;
  messageCount: number; personMessageCount: number; speakers: string[]; duplicateState: 'new' | 'updated' | 'unchanged';
}
interface ImportDetail { import: ImportSummary; speakers: string[]; items: PreviewItem[] }
interface NotionState { configured: boolean; connected: boolean; workspaceName: string | null }
interface GoogleState { configured: boolean; connected: boolean; email: string | null }
interface NotionPage { id: string; title: string; url: string | null; lastEditedAt: string | null }

const FILE_CONNECTORS: Array<{ provider: FileProvider; blurb: string; steps: string[] }> = [
  { provider: 'chatgpt', blurb: 'All your ChatGPT conversations.', steps: [
    'In ChatGPT, open Settings, then Data controls, and choose Export data.',
    'OpenAI emails you a download link. Download the .zip.',
    'Upload the .zip here as it is. Only the conversation text is read; images stay on your device.'] },
  { provider: 'claude', blurb: 'All your Claude conversations.', steps: [
    'In Claude, open Settings, then Privacy, and choose Export data.',
    'Anthropic emails you a download link. Download the .zip.',
    'Upload the .zip here as it is.'] },
  { provider: 'grok', blurb: 'All your Grok conversations.', steps: [
    'Go to accounts.x.ai, open Data, and download your account data.',
    'Upload the .zip here as it is (it contains prod-grok-backend.json).'] },
  { provider: 'gemini', blurb: 'Your Gemini prompts and replies, grouped by day.', steps: [
    'Go to takeout.google.com and deselect everything.',
    'Select My Activity, open "All activity data included", and keep only Gemini Apps. Choose JSON as the format.',
    'Download the export and upload the .zip here.'] },
  { provider: 'deepseek', blurb: 'All your DeepSeek conversations.', steps: [
    'In DeepSeek, open Settings, then Data, and export your data.',
    'Upload the .zip or conversations.json here.'] },
  { provider: 'meta_ai', blurb: 'Meta AI chats from WhatsApp, or your Meta data download.', steps: [
    'Meta AI has no single chat-history export, so pick what you have.',
    'WhatsApp: open the Meta AI chat, tap the name, choose Export chat, Without media, and upload the .txt or .zip.',
    'Or in Meta Accounts Center, choose Download your information in JSON format and upload the .zip.',
    'Or paste a conversation below.'] },
  { provider: 'google_keep', blurb: 'Your Google Keep notes and lists.', steps: [
    'Google does not let apps read Keep for personal accounts, so Keep comes through Google Takeout.',
    'Go to takeout.google.com, deselect everything, select Keep, and create the export.',
    'Download the .zip and upload it here as it is.'] },
  { provider: 'other', blurb: 'Copilot, Perplexity, Character.ai or anything else.', steps: [
    'Upload a JSON export, a .txt or .md transcript, or paste the conversation below.',
    'Lines like "You said:" and "ChatGPT said:" or "User:" and "Assistant:" are read as speakers. Anything else is kept as a note in your own words.'] },
];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const payload = await response.json().catch(() => null) as (T & { message?: string }) | null;
  if (!response.ok) throw new Error(payload?.message ?? 'Something went wrong. Try again.');
  return payload as T;
}

function day(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Undated';
}

export default function ImportsView({ personId, personName, notionOutcome, googleOutcome }: {
  personId: string; personName: string; notionOutcome: string | null; googleOutcome: string | null;
}) {
  const base = `/api/astrologer/profiles/${personId}/imports`;
  const [imports, setImports] = useState<ImportSummary[] | null>(null);
  const [notion, setNotion] = useState<NotionState>({ configured: false, connected: false, workspaceName: null });
  const [error, setError] = useState<string | null>(null);
  const [fileProvider, setFileProvider] = useState<FileProvider | null>(null);
  const [review, setReview] = useState<ImportDetail | null>(null);
  const [notionPicker, setNotionPicker] = useState(false);
  const [google, setGoogle] = useState<GoogleState>({ configured: false, connected: false, email: null });
  const [driveProgress, setDriveProgress] = useState<string | null>(null);

  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    let current = true;
    api<{ imports: ImportSummary[]; notion: NotionState; google: GoogleState }>(base).then((payload) => {
      if (!current) return;
      setImports(payload.imports);
      setNotion(payload.notion);
      setGoogle(payload.google);
    }).catch((reason) => { if (current) setError(reason instanceof Error ? reason.message : 'Could not load imports.'); });
    return () => { current = false; };
  }, [base, version]);

  const openReview = useCallback(async (importId: string) => {
    setReview(await api<ImportDetail>(`${base}/${importId}`));
  }, [base]);

  async function remove(item: ImportSummary) {
    const what = item.status === 'imported' ? `Remove ${item.itemCount} imported item${item.itemCount === 1 ? '' : 's'} from ${PROVIDER_LABELS[item.provider]}?` : 'Discard this import?';
    if (!window.confirm(`${what} Aidoraa will no longer see them.`)) return;
    try {
      await api(`${base}/${item.id}`, { method: 'DELETE' });
      notifyPersonStateChanged(personId);
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not remove the import.');
    }
  }

  async function disconnectNotion() {
    if (!window.confirm('Disconnect Notion? Pages you already imported stay until you remove them.')) return;
    await api('/api/connectors/notion', { method: 'DELETE' }).catch((reason) => setError(reason.message));
    refresh();
  }

  async function disconnectGoogle() {
    if (!window.confirm('Disconnect Google? Files you already imported stay until you remove them.')) return;
    await api('/api/connectors/google', { method: 'DELETE' }).catch((reason) => setError(reason.message));
    refresh();
  }

  async function chooseDriveFiles() {
    setError(null);
    try {
      const config = await api<{ accessToken: string; apiKey: string; appId: string }>(`${base}/google/picker`);
      const fileIds = await pickDriveFiles(config);
      if (!fileIds.length) return;
      let importId: string | null = null;
      const skipped: string[] = [];
      for (let index = 0; index < fileIds.length; index += 10) {
        setDriveProgress(`Fetching files ${index + 1} to ${Math.min(fileIds.length, index + 10)} of ${fileIds.length}`);
        const result: { importId: string; skipped: string[] } = await api(`${base}/google`, { method: 'POST', body: JSON.stringify({ importId, fileIds: fileIds.slice(index, index + 10) }) });
        importId = result.importId;
        skipped.push(...result.skipped);
      }
      if (skipped.length) setError(`Skipped: ${skipped.join(' ')}`);
      if (importId) await openReview(importId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not import from Google Drive.');
    } finally {
      setDriveProgress(null);
      refresh();
    }
  }

  const googleMessage = {
    connected: 'Google is connected. Choose the Drive files to import.',
    cancelled: 'Google was not connected.',
    failed: 'Google could not be connected. Make sure you allow Drive access, then try again.',
    unavailable: 'The Google connector is not set up on this server yet.',
  }[googleOutcome ?? ''] ?? null;

  const notionMessage = {
    connected: 'Notion is connected. Choose the pages to import.',
    cancelled: 'Notion was not connected.',
    failed: 'Notion could not be connected. Try again.',
    unavailable: 'The Notion connector is not set up on this server yet.',
  }[notionOutcome ?? ''] ?? null;

  return (
    <div className="mx-auto max-w-5xl px-5 py-12 text-[#102d53] md:px-10">
      <h1 className="font-serif text-5xl tracking-[-0.03em]">Bring in your history</h1>
      <p className="mt-4 max-w-2xl leading-7 text-[#52627a]">
        Import conversations you have had with other assistants, and your notes from Notion, Google Drive and Keep, so Aidoraa can understand {personName} from everything you have already said.
        Your own words become evidence Aidoraa can search. Other assistants&apos; replies are kept as what you were told, not as facts about you.
      </p>
      {googleMessage ? <p className="mt-6 rounded-md border border-[#ded9d0] bg-white/60 px-4 py-3 text-sm">{googleMessage}</p> : null}
      {notionMessage ? <p className="mt-6 rounded-md border border-[#ded9d0] bg-white/60 px-4 py-3 text-sm">{notionMessage}</p> : null}
      {error ? <p role="alert" className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}

      <h2 className="mt-12 text-sm font-semibold uppercase tracking-[0.14em] text-[#52627a]">Connect</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ConnectorCard title="Notion" badge="Live connection" blurb={notion.connected ? `Connected${notion.workspaceName ? ` to ${notion.workspaceName}` : ''}.` : 'Import pages you choose from your Notion workspace.'}>
          {!notion.configured ? <p className="text-sm text-[#52627a]">Not set up on this server yet.</p>
            : notion.connected ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setNotionPicker(true)}>Choose pages</Button>
                <Button size="sm" variant="ghost" onClick={disconnectNotion}><Unplug className="mr-1 h-4 w-4" />Disconnect</Button>
              </div>
            ) : <Button size="sm" asChild><a href={`/api/connectors/notion/start?personId=${personId}`}><Link2 className="mr-1 h-4 w-4" />Connect Notion</a></Button>}
        </ConnectorCard>
        <ConnectorCard title="Google Drive" badge="Live connection" blurb={google.connected ? `Connected${google.email ? ` as ${google.email}` : ''}. You pick each file; Aidoraa sees nothing else.` : 'Import Docs, Sheets, Slides and text files you pick.'}>
          {!google.configured ? <p className="text-sm text-[#52627a]">Not set up on this server yet.</p>
            : google.connected ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={chooseDriveFiles} disabled={Boolean(driveProgress)}>
                  {driveProgress ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}{driveProgress ?? 'Choose files'}
                </Button>
                <Button size="sm" variant="ghost" onClick={disconnectGoogle}><Unplug className="mr-1 h-4 w-4" />Disconnect</Button>
              </div>
            ) : <Button size="sm" asChild><a href={`/api/connectors/google/start?personId=${personId}`}><Link2 className="mr-1 h-4 w-4" />Connect Google</a></Button>}
        </ConnectorCard>
        {FILE_CONNECTORS.map((connector) => (
          <ConnectorCard key={connector.provider} title={PROVIDER_LABELS[connector.provider] === 'Another assistant' ? 'Other chatbots' : PROVIDER_LABELS[connector.provider]} badge="Export file" blurb={connector.blurb}>
            <Button size="sm" variant="outline" onClick={() => setFileProvider(connector.provider)}><FileUp className="mr-1 h-4 w-4" />Import</Button>
          </ConnectorCard>
        ))}
      </div>

      <h2 className="mt-12 text-sm font-semibold uppercase tracking-[0.14em] text-[#52627a]">Your imports</h2>
      {imports === null ? <p className="mt-4 text-sm text-[#52627a]"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading</p>
        : !imports.length ? <p className="mt-4 text-sm text-[#52627a]">Nothing imported yet.</p>
          : (
            <ul className="mt-4 divide-y divide-[#ded9d0] rounded-md border border-[#ded9d0] bg-white/50">
              {imports.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="font-medium">{PROVIDER_LABELS[item.provider]}{item.fileName ? <span className="font-normal text-[#52627a]"> · {item.fileName}</span> : null}</p>
                    <p className="text-sm text-[#52627a]">
                      {item.status === 'imported' ? `${item.itemCount} item${item.itemCount === 1 ? '' : 's'} imported ${day(item.importedAt)}`
                        : item.status === 'awaiting_review' ? `Waiting for your review · ${item.itemCount} found`
                          : item.status === 'failed' ? item.error ?? 'Could not be read' : 'Upload did not finish'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {item.status === 'awaiting_review' ? <Button size="sm" variant="outline" onClick={() => openReview(item.id).catch((reason) => setError(reason.message))}>Review</Button> : null}
                    <Button size="sm" variant="ghost" aria-label="Remove import" onClick={() => remove(item)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

      {fileProvider ? (
        <FileImportDialog provider={fileProvider} base={base} onClose={() => setFileProvider(null)}
          onParsed={(detail) => { setFileProvider(null); setReview(detail); refresh(); }} />
      ) : null}
      {notionPicker ? (
        <NotionPickerDialog base={base} onClose={() => setNotionPicker(false)}
          onFetched={async (importId) => { setNotionPicker(false); await openReview(importId); refresh(); }}
          onDisconnected={() => { setNotionPicker(false); refresh(); }} />
      ) : null}
      {review ? (
        <ReviewDialog detail={review} base={base} onClose={() => { setReview(null); refresh(); }}
          onDone={() => { setReview(null); notifyPersonStateChanged(personId); refresh(); }} />
      ) : null}
    </div>
  );
}

function ConnectorCard({ title, badge, blurb, children }: { title: string; badge: string; blurb: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col justify-between gap-4 rounded-lg border border-[#ded9d0] bg-white/60 p-5">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-medium">{title}</h3>
          <span className="rounded-full bg-[#e7eadf] px-2 py-0.5 text-xs text-[#52627a]">{badge}</span>
        </div>
        <p className="mt-2 text-sm leading-6 text-[#52627a]">{blurb}</p>
      </div>
      {children}
    </div>
  );
}

function FileImportDialog({ provider, base, onClose, onParsed }: { provider: FileProvider; base: string; onClose: () => void; onParsed: (detail: ImportDetail) => void }) {
  const connector = FILE_CONNECTORS.find((item) => item.provider === provider)!;
  const [files, setFiles] = useState<File[]>([]);
  const [pasted, setPasted] = useState('');
  const [phase, setPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const canPaste = provider === 'meta_ai' || provider === 'other';

  async function start() {
    setError(null);
    try {
      setPhase('Preparing the file on your device');
      const blob = await buildUpload(files, canPaste ? pasted : null);
      setPhase('Uploading');
      const target = await api<{ importId: string; bucket: string; path: string; token: string }>(base, {
        method: 'POST', body: JSON.stringify({ provider, fileName: files[0]?.name ?? 'Pasted conversation' }),
      });
      const uploaded = await createClient().storage.from(target.bucket).uploadToSignedUrl(target.path, target.token, blob, { contentType: 'application/zip' });
      if (uploaded.error) throw new Error(`The upload failed: ${uploaded.error.message}`);
      setPhase('Reading your conversations');
      onParsed(await api<ImportDetail>(`${base}/${target.importId}/parse`, { method: 'POST' }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The import failed.');
      setPhase(null);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !phase) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import from {PROVIDER_LABELS[provider] === 'Another assistant' ? 'another chatbot' : PROVIDER_LABELS[provider]}</DialogTitle>
          <DialogDescription>You will choose what to keep before anything is imported.</DialogDescription>
        </DialogHeader>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-[#52627a]">
          {connector.steps.map((step) => <li key={step}>{step}</li>)}
        </ol>
        <input ref={input} type="file" multiple accept=".zip,.json,.txt,.md,.markdown" className="hidden"
          onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />
        <Button variant="outline" onClick={() => input.current?.click()} disabled={Boolean(phase)}>
          <FileUp className="mr-2 h-4 w-4" />{files.length ? files.map((file) => file.name).join(', ') : 'Choose file'}
        </Button>
        {canPaste ? <Textarea value={pasted} onChange={(event) => setPasted(event.target.value)} placeholder="Or paste a conversation here" rows={5} disabled={Boolean(phase)} /> : null}
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
        <DialogFooter>
          {phase ? <p className="mr-auto text-sm text-[#52627a]"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />{phase}</p> : null}
          <Button onClick={start} disabled={Boolean(phase) || (!files.length && !pasted.trim())}>Continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewDialog({ detail, base, onClose, onDone }: { detail: ImportDetail; base: string; onClose: () => void; onDone: () => void }) {
  const [selected, setSelected] = useState(() => new Set(detail.items.filter((item) => item.duplicateState !== 'unchanged').map((item) => item.id)));
  const [speaker, setSpeaker] = useState<string>(() => detail.speakers.length === 1 ? detail.speakers[0] : '');
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsSpeaker = detail.speakers.length > 0;
  const visible = useMemo(() => detail.items.filter((item) => item.title.toLowerCase().includes(filter.toLowerCase())), [detail.items, filter]);
  const toggle = (id: string, on: boolean) => setSelected((current) => { const next = new Set(current); if (on) next.add(id); else next.delete(id); return next; });
  const allVisible = visible.length > 0 && visible.every((item) => selected.has(item.id));

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      await api(`${base}/${detail.import.id}/confirm`, { method: 'POST', body: JSON.stringify({ itemIds: [...selected], personSpeaker: needsSpeaker ? speaker : null }) });
      onDone();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not import.');
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>Choose what to import from {PROVIDER_LABELS[detail.import.provider]}</DialogTitle>
          <DialogDescription>
            {detail.items.length} found. Aidoraa will only see what you keep. {detail.import.warnings.length ? detail.import.warnings.join(' ') : ''}
          </DialogDescription>
        </DialogHeader>
        {needsSpeaker ? (
          <label className="text-sm">
            <span className="font-medium">Which name is you?</span>
            <select value={speaker} onChange={(event) => setSpeaker(event.target.value)} className="ml-2 rounded-md border border-[#d8d1c5] bg-white px-2 py-1">
              <option value="">Choose</option>
              {detail.speakers.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            <span className="mt-1 block text-[#52627a]">Only your messages count as your own words. Everyone else stays labelled by name.</span>
          </label>
        ) : null}
        <div className="flex items-center gap-3">
          <Input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter by title" className="h-9" />
          <label className="flex shrink-0 items-center gap-2 text-sm">
            <Checkbox checked={allVisible} onCheckedChange={(on) => setSelected((current) => {
              const next = new Set(current);
              for (const item of visible) { if (on) next.add(item.id); else next.delete(item.id); }
              return next;
            })} />
            All shown
          </label>
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-[#ded9d0] overflow-y-auto rounded-md border border-[#ded9d0]">
          {visible.map((item) => (
            <li key={item.id}>
              <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 text-sm">
                <Checkbox className="mt-0.5" checked={selected.has(item.id)} onCheckedChange={(on) => toggle(item.id, on === true)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{item.title}</span>
                  <span className="text-[#52627a]">
                    {day(item.startedAt ?? item.endedAt)}{item.kind === 'conversation' ? ` · ${item.messageCount} messages` : ' · page'}
                    {item.duplicateState === 'unchanged' ? ' · already imported' : item.duplicateState === 'updated' ? ' · newer than your earlier import' : ''}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Later</Button>
          <Button onClick={confirm} disabled={saving || !selected.size || (needsSpeaker && !speaker)}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}Import {selected.size}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NotionPickerDialog({ base, onClose, onFetched, onDisconnected }: { base: string; onClose: () => void; onFetched: (importId: string) => Promise<void>; onDisconnected: () => void }) {
  const [pages, setPages] = useState<NotionPage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (next: string | null, search: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (next) params.set('cursor', next);
      if (search) params.set('q', search);
      const response = await fetch(`${base}/notion/pages?${params}`);
      const payload = await response.json().catch(() => null) as { pages?: NotionPage[]; nextCursor?: string | null; code?: string; message?: string } | null;
      if (payload?.code === 'notion_disconnected') { onDisconnected(); return; }
      if (!response.ok || !payload?.pages) throw new Error(payload?.message ?? 'Could not list Notion pages.');
      setPages((current) => next ? [...current, ...payload.pages!] : payload.pages!);
      setCursor(payload.nextCursor ?? null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not list Notion pages.');
    } finally {
      setLoading(false);
    }
  }, [base, onDisconnected]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(null, query.trim()); }, query ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [load, query]);

  async function importSelected() {
    setError(null);
    const ids = [...selected];
    let importId: string | null = null;
    try {
      for (let index = 0; index < ids.length; index += 10) {
        setProgress(`Fetching pages ${index + 1} to ${Math.min(ids.length, index + 10)} of ${ids.length}`);
        const result: { importId: string } = await api(`${base}/notion`, { method: 'POST', body: JSON.stringify({ importId, pageIds: ids.slice(index, index + 10) }) });
        importId = result.importId;
      }
      if (importId) await onFetched(importId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not fetch the pages.');
      setProgress(null);
    }
  }

  const allShown = pages.length > 0 && pages.every((page) => selected.has(page.id));
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !progress) onClose(); }}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>Choose Notion pages</DialogTitle>
          <DialogDescription>These are the pages you shared with Aidoraa when you connected. To add more, disconnect and connect again.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pages" className="h-9" />
          <label className="flex shrink-0 items-center gap-2 text-sm">
            <Checkbox checked={allShown} onCheckedChange={(on) => setSelected((current) => {
              const next = new Set(current);
              for (const page of pages) { if (on) next.add(page.id); else next.delete(page.id); }
              return next;
            })} />
            All shown
          </label>
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-[#ded9d0] overflow-y-auto rounded-md border border-[#ded9d0]">
          {pages.map((page) => (
            <li key={page.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm">
                <Checkbox checked={selected.has(page.id)} onCheckedChange={(on) => setSelected((current) => {
                  const next = new Set(current); if (on) next.add(page.id); else next.delete(page.id); return next;
                })} />
                <span className="min-w-0 flex-1 truncate">{page.title}</span>
                <span className="shrink-0 text-[#52627a]">{day(page.lastEditedAt)}</span>
              </label>
            </li>
          ))}
          {!loading && !pages.length ? <li className="px-3 py-6 text-center text-sm text-[#52627a]">No pages are shared with Aidoraa.</li> : null}
          {loading ? <li className="px-3 py-3 text-sm text-[#52627a]"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading</li> : null}
        </ul>
        {cursor && !loading ? <Button variant="ghost" size="sm" onClick={() => load(cursor, query.trim())}>Load more</Button> : null}
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
        <DialogFooter>
          {progress ? <p className="mr-auto text-sm text-[#52627a]"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />{progress}</p> : null}
          <Button onClick={importSelected} disabled={Boolean(progress) || !selected.size}>Continue with {selected.size}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

declare global {
  interface Window {
    gapi?: { load: (name: string, callback: () => void) => void };
    google?: { picker: any };
  }
}

function loadPickerScript() {
  return new Promise<void>((resolve, reject) => {
    if (window.google?.picker) { resolve(); return; }
    const done = () => window.gapi!.load('picker', () => resolve());
    if (window.gapi) { done(); return; }
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = done;
    script.onerror = () => reject(new Error('Could not load the Google file picker.'));
    document.head.appendChild(script);
  });
}

/** Google's own picker: whatever the person picks is shared with Aidoraa, and nothing else. */
async function pickDriveFiles(config: { accessToken: string; apiKey: string; appId: string }) {
  await loadPickerScript();
  const picker = window.google!.picker;
  return new Promise<string[]>((resolve) => {
    const view = new picker.DocsView(picker.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(false)
      .setMimeTypes(['application/vnd.google-apps.document', 'application/vnd.google-apps.spreadsheet', 'application/vnd.google-apps.presentation',
        'text/plain', 'text/markdown', 'text/csv', 'application/json'].join(','));
    new picker.PickerBuilder()
      .addView(view)
      .enableFeature(picker.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(config.accessToken)
      .setDeveloperKey(config.apiKey)
      .setAppId(config.appId)
      .setTitle('Choose files for Aidoraa')
      .setCallback((data: { action: string; docs?: Array<{ id: string }> }) => {
        if (data.action === picker.Action.PICKED) resolve((data.docs ?? []).map((doc) => doc.id));
        else if (data.action === picker.Action.CANCEL) resolve([]);
      })
      .build()
      .setVisible(true);
  });
}
