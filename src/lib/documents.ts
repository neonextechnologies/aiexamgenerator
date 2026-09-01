import { knowledgeProvider } from '../services/knowledge';
import { supabase, isDemoMode } from './supabase';
import { demoStore } from './demo-data';
import { invokeEdgeFunction } from './edge';
import type { Document } from '../types';

export interface UploadResult {
  document: Document;
  extractedText: string | null;
  extractionError?: string;
}

export async function fetchCourseDocuments(courseId: string): Promise<Document[]> {
  if (isDemoMode || !supabase) return demoStore.documents.filter(d => d.course_id === courseId);
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('course_id', courseId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as Document[];
}

export async function uploadCourseDocument(
  courseId: string,
  file: File,
  uploadedBy: string,
  description?: string,
): Promise<UploadResult> {
  if (isDemoMode || !supabase) {
    const doc: Document = {
      id: `doc-${Date.now()}`,
      course_id: courseId,
      file_name: file.name,
      file_type: file.type || 'application/octet-stream',
      file_size: file.size,
      status: 'indexed',
      uploaded_by: uploadedBy,
      created_at: new Date().toISOString(),
      description: description || null,
      extracted_text: description || `เนื้อหาตัวอย่างจาก ${file.name}`,
    };
    demoStore.documents.push(doc);
    try {
      await knowledgeProvider.ingestDocument(doc.id, doc.extracted_text || '', { courseId });
    } catch { /* ignore */ }
    return { document: doc, extractedText: doc.extracted_text || null };
  }

  const filePath = `${courseId}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from('course-documents')
    .upload(filePath, file, { contentType: file.type, upsert: false });
  if (uploadError) throw uploadError;

  const { data: docRow, error: dbError } = await supabase
    .from('documents')
    .insert({
      course_id: courseId,
      file_name: file.name,
      file_type: file.type || 'application/octet-stream',
      file_size: file.size,
      file_path: filePath,
      status: 'processing',
      uploaded_by: uploadedBy,
      description: description || null,
    })
    .select()
    .single();
  if (dbError) throw dbError;

  const document = docRow as Document;
  let extractedText: string | null = null;
  let extractionError: string | undefined;

  try {
    const { ok, data: result } = await invokeEdgeFunction<{
      error?: string;
      extractedTextPreview?: string;
      extractedTextLength?: number;
    }>('extract-document', {
      documentId: document.id,
      filePath,
      fileName: file.name,
      fileType: file.type || 'application/octet-stream',
    });
    if (!ok) {
      extractionError = result.error || 'Extraction failed';
    } else {
      extractedText = result.extractedTextPreview || null;
    }
  } catch (err: unknown) {
    extractionError = err instanceof Error ? err.message : 'Network error during extraction';
  }

  const { data: refreshed } = await supabase
    .from('documents')
    .select('*')
    .eq('id', document.id)
    .maybeSingle();

  const finalDoc = (refreshed as Document) || document;
  const fullText = finalDoc.extracted_text || extractedText;
  if (fullText) {
    try {
      await knowledgeProvider.ingestDocument(finalDoc.id, fullText, { courseId });
    } catch {
      // indexing is best-effort; document remains usable
    }
  }

  return {
    document: finalDoc,
    extractedText: fullText,
    extractionError,
  };
}

export async function deleteCourseDocument(documentId: string, filePath?: string | null): Promise<void> {
  if (isDemoMode || !supabase) {
    demoStore.documents = demoStore.documents.filter(d => d.id !== documentId);
    return;
  }
  if (filePath) {
    await supabase.storage.from('course-documents').remove([filePath]);
  }
  const { error } = await supabase.from('documents').delete().eq('id', documentId);
  if (error) throw error;
}
