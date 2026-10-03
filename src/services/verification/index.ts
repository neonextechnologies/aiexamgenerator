import type { EvidencePack, VerificationResult, VerificationCheck } from '../../types/v2';
import type { Question } from '../../types';
import type { VerificationEngine } from '../types';
import { contentHashForQuestion, findDuplicateMatches, type DuplicateCandidate } from '../duplicates';
import { isDemoMode } from '../../lib/supabase';
import { invokeEdgeFunction } from '../../lib/edge';

function scoreFromChecks(checks: VerificationCheck[]): { status: VerificationResult['status']; score: number } {
  if (checks.some(c => c.status === 'fail')) return { status: 'fail', score: Math.max(0, 40 - checks.filter(c => c.status === 'fail').length * 10) };
  if (checks.some(c => c.status === 'warning')) return { status: 'warning', score: 75 };
  return { status: 'pass', score: 95 };
}

export function verifyQuestionDeterministic(
  question: Partial<Question>,
  ctx: {
    evidencePack?: EvidencePack | null;
    knowledgeBounded: boolean;
    existingHashes?: string[];
    bankQuestions?: DuplicateCandidate[];
    excludeId?: string;
    nearThreshold?: number;
  },
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

  const hash = contentHashForQuestion(question.question_text || '');
  const bank = ctx.bankQuestions || [];
  const matches = question.question_text
    ? findDuplicateMatches(question.question_text, bank, {
      excludeId: ctx.excludeId || question.id,
      nearThreshold: ctx.nearThreshold ?? 0.82,
      courseId: question.course_id,
    })
    : [];

  const exactFromHashList = Boolean(ctx.existingHashes?.includes(hash));
  const exact = exactFromHashList || matches.some(m => m.kind === 'exact');
  const near = matches.find(m => m.kind === 'near');

  if (exact) {
    checks.push({
      code: 'DUPLICATE',
      name: 'ตรวจซ้ำ',
      status: 'fail',
      deterministic: true,
      message: matches.find(m => m.kind === 'exact')
        ? `ซ้ำกับคลังข้อสอบ (${matches.find(m => m.kind === 'exact')!.questionId})`
        : 'ซ้ำกับคำถามที่มีอยู่',
    });
    violations.push('duplicate');
  } else if (near) {
    checks.push({
      code: 'NEAR_DUPLICATE',
      name: 'ใกล้เคียงซ้ำ',
      status: 'warning',
      deterministic: true,
      message: `คล้ายกับ ${near.questionId} (ความคล้าย ${(near.score * 100).toFixed(0)}%)`,
    });
    violations.push('near_duplicate');
    recommendations.push('ตรวจสอบว่าคำถามไม่ซ้ำกับข้อที่มีในคลัง');
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

  recommendations.push('[Heuristic] คะแนนจากกฎเชิงกำหนด — ใช้เมื่อโมเดล verify ไม่พร้อม');

  return {
    status,
    score,
    checks,
    violations,
    recommendations,
    dimensions,
    duplicateMatches: matches.slice(0, 5).map(m => ({
      questionId: m.questionId,
      kind: m.kind,
      score: m.score,
      questionText: m.questionText.slice(0, 160),
    })),
  } as VerificationResult;
}

async function verifyWithModel(
  question: Partial<Question>,
  ctx: {
    evidencePack?: EvidencePack | null;
    knowledgeBounded: boolean;
    existingHashes?: string[];
    bankQuestions?: DuplicateCandidate[];
    excludeId?: string;
    nearThreshold?: number;
  },
): Promise<VerificationResult> {
  const deterministic = verifyQuestionDeterministic(question, ctx);
  if (isDemoMode) return deterministic;
  try {
    const { ok, data } = await invokeEdgeFunction<VerificationResult & { modelBased?: boolean; heuristicFallback?: boolean }>(
      'exam-engine',
      {
        action: 'verify',
        question,
        evidencePack: ctx.evidencePack,
        knowledgeBounded: ctx.knowledgeBounded,
        courseId: question.course_id,
      },
    );
    if (ok && data.status && data.modelBased) {
      // Keep deterministic duplicate checks authoritative.
      const mergedChecks = [
        ...(data.checks || []),
        ...deterministic.checks.filter(c => c.code === 'DUPLICATE' || c.code === 'NEAR_DUPLICATE' || c.code === 'HAS_CLO'),
      ];
      return {
        ...deterministic,
        ...data,
        checks: mergedChecks,
        duplicateMatches: deterministic.duplicateMatches,
        violations: [...new Set([...(data.violations || []), ...deterministic.violations])],
      } as VerificationResult;
    }
  } catch {
    // keep heuristic
  }
  return deterministic;
}

export const verificationEngine: VerificationEngine = {
  async verifyQuestion(question, ctx) {
    return verifyWithModel(question, ctx);
  },
  async verifyBatch(questions, ctx) {
    const hashes: string[] = [];
    const batchAsBank: DuplicateCandidate[] = [];
    const bank = [...(ctx.bankQuestions || [])];
    const results: VerificationResult[] = [];
    for (const q of questions) {
      const result = await verifyWithModel(q, {
        ...ctx,
        existingHashes: [...hashes, ...(ctx.existingHashes || [])],
        bankQuestions: [...bank, ...batchAsBank],
      });
      results.push(result);
      const h = contentHashForQuestion(q.question_text || '');
      hashes.push(h);
      if (q.question_text) {
        batchAsBank.push({
          id: q.id || `batch-${batchAsBank.length}`,
          question_text: q.question_text,
          content_hash: h,
          course_id: q.course_id,
        });
      }
    }
    return results;
  },
};
