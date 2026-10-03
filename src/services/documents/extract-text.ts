/**
 * Pure document text extraction for TXT/MD/PDF/DOCX.
 * Shared by Vitest and the Supabase extract-document edge function.
 */

export type ExtractableKind = 'txt' | 'md' | 'pdf' | 'docx' | 'unknown';

export function detectDocumentKind(fileName: string, mimeType = ''): ExtractableKind {
  const name = fileName.toLowerCase();
  const type = mimeType.toLowerCase();
  if (type.includes('text/plain') || name.endsWith('.txt')) return 'txt';
  if (type.includes('text/markdown') || name.endsWith('.md') || name.endsWith('.markdown')) return 'md';
  if (type.includes('application/pdf') || name.endsWith('.pdf')) return 'pdf';
  if (
    type.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    || type.includes('application/vnd.openxmlformats')
    || name.endsWith('.docx')
  ) {
    return 'docx';
  }
  return 'unknown';
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

/** Extract text from OOXML document.xml (and optional footnotes). */
export function extractDocxXmlText(xml: string): string {
  const paragraphs: string[] = [];
  const paragraphRegex = /<w:p[\s>][\s\S]*?<\/w:p>/g;
  const runs = xml.match(paragraphRegex) || [];
  for (const paragraph of runs) {
    const texts: string[] = [];
    const textRegex = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
    let match: RegExpExecArray | null;
    while ((match = textRegex.exec(paragraph)) !== null) {
      texts.push(decodeXmlEntities(match[1]));
    }
    if (/<w:br\b|<w:cr\b/.test(paragraph) && texts.length === 0) {
      paragraphs.push('');
      continue;
    }
    const line = texts.join('');
    if (line.trim()) paragraphs.push(line);
  }
  if (paragraphs.length) return paragraphs.join('\n').trim();

  // Fallback: any w:t nodes
  const chunks: string[] = [];
  const fallback = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = fallback.exec(xml)) !== null) {
    if (m[1]) chunks.push(decodeXmlEntities(m[1]));
  }
  return chunks.join(' ').replace(/\s+/g, ' ').trim();
}

async function unzipEntries(bytes: Uint8Array): Promise<Record<string, Uint8Array>> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(bytes);
  const out: Record<string, Uint8Array> = {};
  const names = Object.keys(zip.files);
  for (const name of names) {
    const entry = zip.files[name];
    if (!entry || entry.dir) continue;
    out[name] = await entry.async('uint8array');
  }
  return out;
}

export async function extractDocxText(bytes: Uint8Array): Promise<string> {
  const entries = await unzipEntries(bytes);
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const parts: string[] = [];
  const main = entries['word/document.xml'];
  if (main) parts.push(extractDocxXmlText(decoder.decode(main)));
  for (const key of Object.keys(entries).sort()) {
    if (/^word\/(header|footer|footnotes|endnotes)\d*\.xml$/i.test(key)) {
      const text = extractDocxXmlText(decoder.decode(entries[key]));
      if (text) parts.push(text);
    }
  }
  return parts.filter(Boolean).join('\n\n').trim();
}

function extractPdfLiteralStrings(raw: string): string {
  const textChunks: string[] = [];
  const regex = /BT\s*([\s\S]*?)\s*ET/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    const block = match[1];
    const textRegex = /\(([^\\()]*(?:\\.[^\\()]*)*)\)\s*Tj|\[([\s\S]*?)\]\s*TJ/g;
    let textMatch: RegExpExecArray | null;
    while ((textMatch = textRegex.exec(block)) !== null) {
      let text = textMatch[1] || '';
      if (!text && textMatch[2]) {
        const inner = textMatch[2].match(/\(([^\\()]*(?:\\.[^\\()]*)*)\)/g) || [];
        text = inner.map(s => s.slice(1, -1)).join('');
      }
      if (text) {
        textChunks.push(
          text
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\\\(/g, '(')
            .replace(/\\\)/g, ')')
            .replace(/\\\\/g, '\\'),
        );
      }
    }
  }
  let extracted = textChunks.join(' ').replace(/\s+/g, ' ').trim();
  if (!extracted) {
    const readable = raw.match(/[\x20-\x7E\u0E00-\u0E7F]{4,}/g);
    if (readable) extracted = readable.join(' ').trim();
  }
  return extracted;
}

async function extractPdfWithPdfJs(bytes: Uint8Array): Promise<string> {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = pdfjs.getDocument({
      data: bytes.slice(),
      useSystemFonts: true,
      isEvalSupported: false,
      // Deno / Node test environments have no worker.
      useWorkerFetch: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const pdf = await loadingTask.promise;
    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const line = (content.items as Array<{ str?: string }>)
        .map(item => item.str || '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (line) pages.push(line);
    }
    return pages.join('\n\n').trim();
  } catch {
    return '';
  }
}

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const fromPdfJs = await extractPdfWithPdfJs(bytes);
  if (fromPdfJs.length >= 20) return fromPdfJs;
  const raw = new TextDecoder('latin1').decode(bytes);
  const fallback = extractPdfLiteralStrings(raw);
  return fromPdfJs.length >= fallback.length ? fromPdfJs : fallback;
}

export function normalizeExtractedText(text: string, maxLength = 50000): string {
  let cleaned = '';
  for (const ch of text.replace(/\r\n/g, '\n')) {
    if (ch.charCodeAt(0) !== 0) cleaned += ch;
  }
  cleaned = cleaned.trim();
  if (cleaned.length > maxLength) {
    cleaned = `${cleaned.slice(0, maxLength)}\n...[truncated]`;
  }
  return cleaned;
}

export async function extractDocumentText(input: {
  fileName: string;
  mimeType?: string;
  bytes?: Uint8Array;
  text?: string;
}): Promise<{ kind: ExtractableKind; text: string }> {
  const kind = detectDocumentKind(input.fileName, input.mimeType || '');
  if (kind === 'txt' || kind === 'md') {
    const text = input.text ?? (input.bytes ? new TextDecoder('utf-8', { fatal: false }).decode(input.bytes) : '');
    return { kind, text: normalizeExtractedText(text) };
  }
  if (!input.bytes) return { kind, text: '' };
  if (kind === 'docx') {
    return { kind, text: normalizeExtractedText(await extractDocxText(input.bytes)) };
  }
  if (kind === 'pdf') {
    return { kind, text: normalizeExtractedText(await extractPdfText(input.bytes)) };
  }
  const text = input.text ?? new TextDecoder('utf-8', { fatal: false }).decode(input.bytes);
  return { kind: 'unknown', text: normalizeExtractedText(text) };
}
