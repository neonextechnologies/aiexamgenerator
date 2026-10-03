import { simpleHash } from '../rules';

export interface DuplicateCandidate {
  id: string;
  question_text: string;
  content_hash?: string | null;
  course_id?: string;
}

export interface DuplicateMatch {
  questionId: string;
  questionText: string;
  kind: 'exact' | 'near';
  score: number;
  contentHash: string;
}

/** Normalize Thai/English question text for hashing and similarity. */
export function normalizeQuestionText(text: string): string {
  const nfc = (text || '').normalize('NFC').toLowerCase();
  let out = '';
  for (const ch of nfc) {
    const code = ch.codePointAt(0) || 0;
    if (code === 0x200b || code === 0x200c || code === 0x200d || code === 0xfeff) continue;
    if (ch === '"' || ch === "'" || ch === '`') continue;
    if (/[\p{L}\p{N}]/u.test(ch)) out += ch;
    else out += ' ';
  }
  return out.replace(/\s+/g, ' ').trim();
}

export function contentHashForQuestion(text: string): string {
  return simpleHash(normalizeQuestionText(text));
}

export function trigrams(text: string): Set<string> {
  const normalized = normalizeQuestionText(text);
  const padded = `  ${normalized} `;
  const grams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

/** Dice coefficient over character trigrams (0–1). */
export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (!ta.size || !tb.size) return 0;
  let overlap = 0;
  for (const g of ta) {
    if (tb.has(g)) overlap += 1;
  }
  return (2 * overlap) / (ta.size + tb.size);
}

export function findDuplicateMatches(
  text: string,
  bank: DuplicateCandidate[],
  options?: { nearThreshold?: number; excludeId?: string; courseId?: string },
): DuplicateMatch[] {
  const nearThreshold = options?.nearThreshold ?? 0.82;
  const hash = contentHashForQuestion(text);
  const matches: DuplicateMatch[] = [];

  for (const item of bank) {
    if (options?.excludeId && item.id === options.excludeId) continue;
    if (options?.courseId && item.course_id && item.course_id !== options.courseId) continue;
    const itemHash = item.content_hash || contentHashForQuestion(item.question_text);
    if (itemHash === hash) {
      matches.push({
        questionId: item.id,
        questionText: item.question_text,
        kind: 'exact',
        score: 1,
        contentHash: itemHash,
      });
      continue;
    }
    const score = trigramSimilarity(text, item.question_text);
    if (score >= nearThreshold) {
      matches.push({
        questionId: item.id,
        questionText: item.question_text,
        kind: 'near',
        score,
        contentHash: itemHash,
      });
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}

export function bestDuplicateMatch(
  text: string,
  bank: DuplicateCandidate[],
  options?: { nearThreshold?: number; excludeId?: string; courseId?: string },
): DuplicateMatch | null {
  return findDuplicateMatches(text, bank, options)[0] || null;
}
