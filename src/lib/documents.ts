import { supabase, isDemoMode } from './supabase';
import { demoStore } from './demo-data';
import type { Document } from '../types';

const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const EDGE_HEADERS = {
  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

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

export async function uploadCourseDocument(courseId: string, file: File, uploadedBy: string, description?: string): Promise<UploadResult> {
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
    const resp = await fetch(`${EDGE_BASE}/extract-document`, {
      method: 'POST',
      headers: EDGE_HEADERS,
      body: JSON.stringify({ documentId: document.id }),
    });
    const result = await resp.json();
    if (!resp.ok) {
      extractionError = result.error || `Extraction failed (${resp.status})`;
    } else {
      extractedText = result.extractedText || null;
    }
  } catch (err: any) {
    extractionError = err.message || 'Network error during extraction';
  }

  const { data: refreshed } = await supabase
    .from('documents')
    .select('*')
    .eq('id', document.id)
    .maybeSingle();

  return { document: (refreshed as Document) || document, extractedText, extractionError };
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
