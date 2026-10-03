import { describe, expect, it } from 'vitest';
import { contentHashForQuestion, findDuplicateMatches, normalizeQuestionText, trigramSimilarity } from '../duplicates';
import { buildDefaultEssayRubric, ensureRubricForQuestion, normalizeRubric } from '../rubric';
import { detectDocumentKind, extractDocxXmlText, normalizeExtractedText } from '../documents/extract-text';
import { suggestExportFilename, buildExamPreviewHtml } from '../export/exam-export';
import type { Course, Exam, Question } from '../../types';

describe('duplicate detection', () => {
  it('normalizes and hashes consistently', () => {
    const a = contentHashForQuestion('  ข้อสอบ AI  ');
    const b = contentHashForQuestion('ข้อสอบ ai');
    expect(a).toBe(b);
    expect(normalizeQuestionText('Hello, World!')).toBe('hello world');
  });

  it('detects exact and near duplicates against the bank', () => {
    const bank = [
      { id: 'q1', question_text: 'เทคโนโลยีดิจิทัลเพื่อการศึกษาคืออะไร', content_hash: contentHashForQuestion('เทคโนโลยีดิจิทัลเพื่อการศึกษาคืออะไร'), course_id: 'c1' },
      { id: 'q2', question_text: 'เทคโนโลยีดิจิทัลเพื่อการศึกษาหมายถึงอะไร', course_id: 'c1' },
    ];
    const exact = findDuplicateMatches('เทคโนโลยีดิจิทัลเพื่อการศึกษาคืออะไร', bank);
    expect(exact[0]?.kind).toBe('exact');
    const near = findDuplicateMatches('เทคโนโลยีดิจิทัลเพื่อการศึกษาหมายถึงสิ่งใด', bank, { nearThreshold: 0.5 });
    expect(near.some(m => m.kind === 'near' || m.kind === 'exact')).toBe(true);
    expect(trigramSimilarity('abcdef', 'abcdef')).toBe(1);
  });
});

describe('rubric helpers', () => {
  it('builds default essay rubric and normalizes camelCase', () => {
    const rubric = buildDefaultEssayRubric(5);
    expect(rubric.criteria.length).toBe(3);
    expect(rubric.total_marks).toBe(5);
    const ensured = ensureRubricForQuestion({ questionType: 'essay', marks: 5, includeRubric: true, rubric: null });
    expect(ensured?.criteria.length).toBeGreaterThan(0);
    const normalized = normalizeRubric({
      totalMarks: 5,
      criteria: [{ criterion: 'เนื้อหา', description: 'x', maxMarks: 5, performanceLevels: [{ level: 'ดี', description: 'ok', marksRange: '0-5' }] }],
    }, 5);
    expect(normalized?.criteria[0].max_marks).toBe(5);
  });
});

describe('document extraction', () => {
  it('detects kinds and extracts docx xml text', () => {
    expect(detectDocumentKind('a.pdf')).toBe('pdf');
    expect(detectDocumentKind('a.docx')).toBe('docx');
    const xml = `<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>สวัสดี</w:t></w:r></w:p><w:p><w:r><w:t>โลก</w:t></w:r></w:p></w:body></w:document>`;
    expect(extractDocxXmlText(xml)).toContain('สวัสดี');
    expect(normalizeExtractedText('hi\u0000')).toBe('hi');
  });
});

describe('exam export helpers', () => {
  const exam: Exam = {
    id: 'ex-1', course_id: 'c1', name: 'สอบกลางภาค', exam_type: 'midterm', academic_year: '2569', semester: '1',
    duration_minutes: 60, total_marks: 2, instructions: 'ตอบทุกข้อ', questions: [], versions: [], status: 'draft', created_at: '2025-01-01',
  };
  const course: Course = {
    id: 'c1', course_code: 'DT99705', course_name_th: 'เทคโนโลยีดิจิทัล', credits: 3, semester: '1', academic_year: '2569',
    instructor_id: 'u1', language: 'th', status: 'active', visibility: 'private', created_at: '2025-01-01',
  };
  const questions: Question[] = [{
    id: 'q1', course_id: 'c1', question_type: 'essay', question_text: 'อธิบาย AI เพื่อการศึกษา', language: 'th',
    correct_answer: '', explanation: 'ควรครอบคลุมประโยชน์และข้อจำกัด', intended_bloom_level: 'evaluate',
    intended_difficulty: 'hard', marks: 5, estimated_answer_time_minutes: 10, learning_outcome_codes: ['CLO3'],
    quality_flags: [], status: 'approved', source_type: 'ai_generated', created_by: 'u1', generated_by_ai: true,
    created_at: '2025-01-01', updated_at: '2025-01-01', used_count: 0, exposure_level: 'new',
    rubric: buildDefaultEssayRubric(5),
  }];

  it('names files and builds Thai preview HTML', () => {
    const name = suggestExportFilename({ exam, course, questions, kind: 'answer_key' }, 'pdf');
    expect(name).toContain('answer_key.pdf');
    const html = buildExamPreviewHtml({ exam, course, questions, kind: 'answer_key' });
    expect(html).toContain('เฉลย');
    expect(html).toContain('Rubric');
    expect(html).toContain('อธิบาย AI เพื่อการศึกษา');
  });
});
