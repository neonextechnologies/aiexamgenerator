import type { EvidencePack, VerificationResult, VerificationCheck } from '../../types/v2';
import type { Question } from '../../types';
import type { VerificationEngine } from '../types';
import { simpleHash } from '../rules';

function scoreFromChecks(checks: VerificationCheck[]): { status: VerificationResult['status']; score: number } {
  if (checks.some(c => c.status === 'fail')) return { status: 'fail', score: Math.max(0, 40 - checks.filter(c => c.status === 'fail').length * 10) };
  if (checks.some(c => c.status === 'warning')) return { status: 'warning', score: 75 };
  return { status: 'pass', score: 95 };
}

export function verifyQuestionDeterministic(
  question: Partial<Question>,
  ctx: { evidencePack?: EvidencePack | null; knowledgeBounded: boolean; existingHashes?: string[] },
): VerificationResult {
  const checks: VerificationCheck[] = [];
  const violations: string[] = [];
  const recommendations: string[] = [];

  if (!question.question_text?.trim()) {
    checks.push({ code: 'HAS_TEXT', name: 'มีข้อความคำถาม', status: 'fail', deterministic: true, message: 'ไม่มีข้อความคำถาม' });
    violations.push('missing_question_text');
  } else {
    checks.push({ code: 'HAS_TEXT', name: 'มีข้อความคำถาม', status: 'pass', deterministic: true, message: 'OK' });
  }

  const clo = question.learning_outcome_codes || [];
  if (!clo.length) {
    checks.push({ code: 'HAS_CLO', name: 'มี CLO', status: 'fail', deterministic: true, message: 'ไม่มี CLO' });
    violations.push('missing_clo');
  } else {
    checks.push({ code: 'HAS_CLO', name: 'มี CLO', status: 'pass', deterministic: true, message: 'OK' });
  }

  if (question.question_type === 'multiple_choice_single') {
    const choices = question.choices || [];
    const correct = choices.filter(c => c.is_correct).length;
    checks.push({
      code: 'MCQ_CORRECT_COUNT',
      name: 'จำนวนคำตอบถูก',
      status: correct === 1 ? 'pass' : 'fail',
      deterministic: true,
      message: correct === 1 ? 'OK' : `ต้องมี 1 คำตอบถูก (พบ ${correct})`,
    });
    if (correct !== 1) violations.push('mcq_correct_count');
    checks.push({
      code: 'MCQ_CHOICE_COUNT',
      name: 'จำนวนตัวเลือก',
      status: choices.length === 4 ? 'pass' : choices.length >= 2 ? 'warning' : 'fail',
      deterministic: true,
      message: `${choices.length} ตัวเลือก`,
    });
    if (choices.length !== 4) recommendations.push('แนะนำให้ใช้ตัวเลือก 4 ข้อ');
  }

  if (ctx.knowledgeBounded) {
    const refs = question.source_references || [];
    const hasEvidence = (ctx.evidencePack?.retrievedChunks?.length || 0) > 0 || refs.length > 0;
    checks.push({
      code: 'GROUNDED',
      name: 'อิงหลักฐาน',
      status: hasEvidence ? 'pass' : 'fail',
      deterministic: true,
      message: hasEvidence ? 'มีหลักฐาน/อ้างอิง' : 'INSUFFICIENT_EVIDENCE',
    });
    if (!hasEvidence) violations.push('insufficient_evidence');
  }

  const hash = simpleHash((question.question_text || '').trim().toLowerCase());
  if (ctx.existingHashes?.includes(hash)) {
    checks.push({ code: 'DUPLICATE', name: 'ตรวจซ้ำ', status: 'fail', deterministic: true, message: 'ซ้ำกับคำถามที่มีอยู่' });
    violations.push('duplicate');
  } else {
    checks.push({ code: 'DUPLICATE', name: 'ตรวจซ้ำ', status: 'pass', deterministic: true, message: 'OK' });
  }

  if (question.intended_bloom_level && question.ai_predicted_bloom_level && question.intended_bloom_level !== question.ai_predicted_bloom_level) {
    checks.push({ code: 'BLOOM_ALIGN', name: 'Bloom alignment', status: 'warning', deterministic: true, message: 'intended ≠ predicted' });
    recommendations.push('ให้ผู้ตรวจยืนยัน Bloom level');
  } else {
    checks.push({ code: 'BLOOM_ALIGN', name: 'Bloom alignment', status: 'pass', deterministic: true, message: 'OK' });
  }

  const { status, score } = scoreFromChecks(checks);
  const dimensions = {
    grounding: checks.find(c => c.code === 'GROUNDED')?.status === 'pass' ? 90 : ctx.knowledgeBounded ? 20 : 70,
    correctness: checks.find(c => c.code === 'MCQ_CORRECT_COUNT')?.status === 'fail' ? 20 : 85,
    clarity: question.question_text && question.question_text.length > 20 ? 80 : 50,
    clo_alignment: clo.length ? 90 : 10,
    bloom_alignment: checks.find(c => c.code === 'BLOOM_ALIGN')?.status === 'warning' ? 60 : 85,
    difficulty_alignment: 80,
    distractor_quality: (question.choices?.length || 0) >= 4 ? 80 : 50,
    language_quality: 80,
    traceability: (question.source_references?.length || 0) > 0 ? 90 : 40,
  };

  return { status, score, checks, violations, recommendations, dimensions };
}

export const verificationEngine: VerificationEngine = {
  async verifyQuestion(question, ctx) {
    return verifyQuestionDeterministic(question, ctx);
  },
  async verifyBatch(questions, ctx) {
    const hashes: string[] = [];
    return questions.map(q => {
      const result = verifyQuestionDeterministic(q, { ...ctx, existingHashes: [...hashes] });
      hashes.push(simpleHash((q.question_text || '').trim().toLowerCase()));
      return result;
    });
  },
};
