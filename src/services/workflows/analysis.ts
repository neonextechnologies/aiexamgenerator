import type { AnalysisDecision, EvidencePack, GenerationV2Request } from '../../types/v2';
import type { AnalysisEngine } from '../types';

export function analyzeGenerationRequest(request: GenerationV2Request, evidence: EvidencePack): AnalysisDecision {
  const reasons: string[] = [];
  const coverage: Record<string, number> = {
    documents: request.documentIds.length ? 1 : 0,
    chunks: Math.min(1, evidence.retrievedChunks.length / 5),
    retrieval: evidence.retrievalConfidence,
    overall: evidence.coverageScore,
  };

  const insufficient =
    !!request.knowledgeBounded &&
    request.mode !== 'manual' &&
    (evidence.retrievedChunks.length === 0 || evidence.retrievalConfidence < 0.05);

  if (insufficient) {
    reasons.push('INSUFFICIENT_EVIDENCE: ไม่พบเนื้อหาเพียงพอจากเอกสารที่เลือก');
    return {
      decision: 'reject',
      reason: reasons,
      coverage,
      recommendedQuestionTypes: [request.questionType],
      recommendedBloomLevels: [request.bloomLevel],
      recommendedDifficulty: [request.difficulty],
      generationPlan: [],
      insufficientEvidence: true,
    };
  }

  if (evidence.coverageScore < 0.4) {
    reasons.push('ความครอบคลุมหลักฐานต่ำ — แนะนำลดจำนวนข้อหรือเพิ่มเอกสาร');
  } else {
    reasons.push('หลักฐานเพียงพอสำหรับการสร้างข้อสอบแบบควบคุม');
  }

  const plan = Array.from({ length: request.numberOfQuestions }).map((_, i) => ({
    index: i + 1,
    questionType: request.questionType,
    bloom: request.bloomLevel,
    difficulty: request.difficulty,
    marks: request.marksPerQuestion,
    evidenceChunkIds: evidence.retrievedChunks.slice(0, 3).map(c => c.id),
  }));

  return {
    decision: coverage.overall < 0.3 ? 'revise' : 'approve',
    reason: reasons,
    coverage,
    recommendedQuestionTypes: [request.questionType],
    recommendedBloomLevels: [request.bloomLevel],
    recommendedDifficulty: [request.difficulty],
    generationPlan: plan,
    insufficientEvidence: false,
  };
}

export const analysisEngine: AnalysisEngine = {
  async analyze(request, evidence) {
    return analyzeGenerationRequest(request, evidence);
  },
};
