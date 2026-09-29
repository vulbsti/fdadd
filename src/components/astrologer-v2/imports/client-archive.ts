/**
 * Browser side of a file import. Chatbot exports are often large ZIPs full of
 * images; only the text entries the parsers read are kept, re-zipped, and
 * uploaded straight to private storage.
 */
import { strToU8, Unzip, UnzipInflate, zip } from 'fflate';
import { isRelevantEntry } from '@/lib/imports/archive';

async function extractTextEntries(file: File) {
  const entries: Record<string, Uint8Array> = {};
  const pending: Promise<void>[] = [];
  const unzip = new Unzip((entry) => {
    if (!isRelevantEntry(entry.name)) return;
    const chunks: Uint8Array[] = [];
    pending.push(new Promise((resolve, reject) => {
      entry.ondata = (error, data, final) => {
        if (error) { reject(error); return; }
        chunks.push(data);
        if (!final) return;
        const joined = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
        let offset = 0;
        for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
        entries[entry.name] = joined;
        resolve();
      };
    }));
    entry.start();
  });
  unzip.register(UnzipInflate);
  const reader = file.stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) { unzip.push(new Uint8Array(0), true); break; }
    unzip.push(value);
  }
  await Promise.all(pending);
  // HTML renderings duplicate the JSON in the same export.
  if (Object.keys(entries).some((name) => /\.json$/i.test(name))) {
    for (const name of Object.keys(entries)) if (/\.html?$/i.test(name)) delete entries[name];
  }
  return entries;
}

/** Build the upload: the text entries of any ZIPs plus loose JSON, text and Markdown files. */
export async function buildUpload(files: File[], pasted: string | null) {
  const entries: Record<string, Uint8Array> = {};
  for (const [index, file] of files.entries()) {
    if (/\.zip$/i.test(file.name) || file.type === 'application/zip') {
      for (const [name, data] of Object.entries(await extractTextEntries(file))) entries[`${index}/${name}`] = data;
    } else if (/\.(json|txt|md|markdown)$/i.test(file.name)) {
      entries[`${index}/${file.name}`] = new Uint8Array(await file.arrayBuffer());
    } else {
      throw new Error(`${file.name} is not a supported file. Upload the export's .zip, .json, .txt or .md file.`);
    }
  }
  if (pasted?.trim()) entries['pasted/Pasted conversation.txt'] = strToU8(pasted);
  if (!Object.keys(entries).length) throw new Error('Nothing readable was found. Check that this is the export described on the card.');
  return new Promise<Blob>((resolve, reject) => {
    zip(entries, { level: 6 }, (error, data) => (error ? reject(error) : resolve(new Blob([data], { type: 'application/zip' }))));
  });
}
