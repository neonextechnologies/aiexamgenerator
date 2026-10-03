import type { DocumentChunk, EvidencePack } from '../../types/v2';
import type { KnowledgeProvider } from '../types';
import { isDemoMode, supabase } from '../../lib/supabase';
import { demoStore } from '../../lib/demo-data';
import { invokeEdgeFunction } from '../../lib/edge';

const demoChunks: DocumentChunk[] = [];

function chunkText(text: string, size = 800): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const parts: string[] = [];
  for (let i = 0; i < clean.length; i += size) parts.push(clean.slice(i, i + size));
  return parts;
}

function lexicalScore(query: string, content: string): number {
  const q = query.toLowerCase().split(/\s+/).filter(Boolean);
  const c = content.toLowerCase();
  if (!q.length) return 0;
  let hit = 0;
  for (const w of q) if (c.includes(w)) hit++;
  return hit / q.length;
}

export type KnowledgeHealth = {
  ok: boolean;
  mode: 'demo' | 'pgvector' | 'lexical' | 'unavailable';
  message: string;
  embeddedChunks?: number;
  totalChunks?: number;
};

let lastHealth: KnowledgeHealth | null = null;

export const knowledgeProvider: KnowledgeProvider & {
  getLastHealth(): KnowledgeHealth | null;
  healthDetails(): Promise<KnowledgeHealth>;
  backfillEmbeddings(opts?: { documentIds?: string[]; limit?: number }): Promise<{ updated: number; errors: string[] }>;
} = {
  getLastHealth() {
    return lastHealth;
  },

  async ingestDocument(documentId, text, meta = {}) {
    const parts = chunkText(text);
    if (isDemoMode || !supabase) {
      for (let i = demoChunks.length - 1; i >= 0; i--) if (demoChunks[i].document_id === documentId) demoChunks.splice(i, 1);
      parts.forEach((content, idx) => {
        demoChunks.push({
          id: `chunk-${documentId}-${idx}`,
          document_id: documentId,
          course_id: (meta.courseId as string) || null,
          chunk_index: idx,
          content,
          page_number: idx + 1,
          section: (meta.section as string) || null,
          heading: null,
          token_count: Math.ceil(content.length / 4),
          metadata_json: meta,
          created_at: new Date().toISOString(),
        });
      });
      return { chunkCount: parts.length };
    }

    // Prefer edge ingest so embeddings are written server-side with provider keys.
    try {
      const { ok, data } = await invokeEdgeFunction<{ success?: boolean; chunkCount?: number; error?: string }>(
        'exam-engine',
        { action: 'ingest', documentId, text, courseId: meta.courseId || null, section: meta.section || null },
      );
      if (ok && data.success) return { chunkCount: data.chunkCount || parts.length };
    } catch {
      // fall through to client insert without embeddings
    }

    await supabase.from('document_chunks').delete().eq('document_id', documentId);
    if (parts.length) {
      const rows = parts.map((content, idx) => ({
        document_id: documentId,
        course_id: meta.courseId || null,
        chunk_index: idx,
        content,
        page_number: idx + 1,
        section: meta.section || null,
        token_count: Math.ceil(content.length / 4),
        metadata_json: meta,
      }));
      const { error } = await supabase.from('document_chunks').insert(rows);
      if (error) throw error;
    }
    await supabase.from('documents').update({
      processing_stage: 'indexed',
      status: 'indexed',
      updated_at: new Date().toISOString(),
    }).eq('id', documentId);
    return { chunkCount: parts.length };
  },

  async deleteDocument(documentId) {
    if (isDemoMode || !supabase) {
      for (let i = demoChunks.length - 1; i >= 0; i--) if (demoChunks[i].document_id === documentId) demoChunks.splice(i, 1);
      return;
    }
    await supabase.from('document_chunks').delete().eq('document_id', documentId);
  },

  async reindexDocument(documentId) {
    if (isDemoMode || !supabase) {
      const doc = demoStore.documents.find(d => d.id === documentId);
      return this.ingestDocument(documentId, doc?.extracted_text || doc?.description || '', { courseId: doc?.course_id });
    }
    const { data } = await supabase.from('documents').select('*').eq('id', documentId).maybeSingle();
    return this.ingestDocument(documentId, data?.extracted_text || '', { courseId: data?.course_id });
  },

  async retrieve(query, opts) {
    const topK = opts.topK ?? 8;
    if (isDemoMode || !supabase) {
      let chunks = demoChunks.filter(c => opts.documentIds.includes(c.document_id));
      if (!chunks.length) {
        for (const id of opts.documentIds) {
          const doc = demoStore.documents.find(d => d.id === id);
          if (doc) await this.ingestDocument(id, doc.extracted_text || `${doc.file_name} ${doc.description || ''}`, { courseId: doc.course_id });
        }
        chunks = demoChunks.filter(c => opts.documentIds.includes(c.document_id));
      }
      return chunks
        .map(c => ({ c, score: lexicalScore(query, c.content) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(x => x.c);
    }

    // Semantic path via edge (embeds query + match_document_chunks)
    try {
      const { ok, data } = await invokeEdgeFunction<{
        success?: boolean;
        chunks?: DocumentChunk[];
        mode?: string;
      }>('exam-engine', {
        action: 'retrieve',
        query,
        documentIds: opts.documentIds,
        courseId: opts.courseId || null,
        topK,
      });
      if (ok && data.success && Array.isArray(data.chunks) && data.chunks.length) {
        return data.chunks;
      }
    } catch {
      // lexical fallback below
    }

    const { data, error } = await supabase
      .from('document_chunks')
      .select('*')
      .in('document_id', opts.documentIds)
      .limit(200);
    if (error) throw error;
    let chunks = (data || []) as DocumentChunk[];
    if (!chunks.length) {
      const { data: docs } = await supabase.from('documents').select('id, course_id, extracted_text, file_name').in('id', opts.documentIds);
      for (const d of docs || []) {
        if (d.extracted_text) await this.ingestDocument(d.id, d.extracted_text, { courseId: d.course_id });
      }
      const { data: again } = await supabase.from('document_chunks').select('*').in('document_id', opts.documentIds).limit(200);
      chunks = (again || []) as DocumentChunk[];
    }
    return chunks
      .map(c => ({ c, score: lexicalScore(query, c.content) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(x => x.c);
  },

  async retrieveWithCitations(query, opts) {
    const retrieved = await this.retrieve(query, opts);
    const citations = retrieved.map(c => ({
      chunk_id: c.id,
      document_id: c.document_id,
      page: c.page_number,
      section: c.section,
      quote: c.content.slice(0, 180),
      score: lexicalScore(query, c.content),
    }));
    const coverageScore = Math.min(1, retrieved.length / Math.max(1, opts.topK ?? 8));
    const retrievalConfidence = citations.length ? citations.reduce((s, c) => s + c.score, 0) / citations.length : 0;
    return {
      courseId: opts.courseId || '',
      learningOutcomes: [],
      documents: opts.documentIds,
      retrievedChunks: retrieved,
      citations,
      coverageScore,
      retrievalConfidence,
    } satisfies EvidencePack;
  },

  async healthCheck() {
    const details = await this.healthDetails();
    return details.ok;
  },

  async healthDetails(): Promise<KnowledgeHealth> {
    if (isDemoMode || !supabase) {
      lastHealth = { ok: true, mode: 'demo', message: 'Lexical Demo Store (โหมดสาธิต)', totalChunks: demoChunks.length, embeddedChunks: 0 };
      return lastHealth;
    }
    try {
      const { ok, data } = await invokeEdgeFunction<{
        ok?: boolean;
        mode?: KnowledgeHealth['mode'];
        message?: string;
        embeddedChunks?: number;
        totalChunks?: number;
      }>('exam-engine', { action: 'knowledge_health' });
      lastHealth = {
        ok: Boolean(ok && data.ok),
        mode: data.mode || 'unavailable',
        message: data.message || 'ไม่ทราบสถานะ',
        embeddedChunks: data.embeddedChunks,
        totalChunks: data.totalChunks,
      };
      return lastHealth;
    } catch (err) {
      lastHealth = {
        ok: false,
        mode: 'unavailable',
        message: err instanceof Error ? err.message : 'ตรวจสอบ Knowledge ไม่สำเร็จ',
      };
      return lastHealth;
    }
  },

  async backfillEmbeddings(opts = {}) {
    if (isDemoMode || !supabase) return { updated: 0, errors: ['โหมดสาธิตไม่รองรับ embeddings'] };
    const { ok, data } = await invokeEdgeFunction<{ updated?: number; errors?: string[]; error?: string }>(
      'exam-engine',
      { action: 'backfill_embeddings', documentIds: opts.documentIds, limit: opts.limit ?? 100 },
    );
    if (!ok) return { updated: 0, errors: [data.error || 'backfill failed'] };
    return { updated: data.updated || 0, errors: data.errors || [] };
  },
};
