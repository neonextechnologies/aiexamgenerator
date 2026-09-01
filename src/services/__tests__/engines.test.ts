import { describe, it, expect } from 'vitest';
import { evaluateRules, sortRulesByPriority, simpleHash } from '../rules';
import { verifyQuestionDeterministic } from '../verification';
import { analyzeGenerationRequest } from '../workflows/analysis';
import type { Rule, EvidencePack, GenerationV2Request } from '../../types/v2';

const baseRules: Rule[] = [
  { id: 'rule-kb-1', code: 'KNOWLEDGE_BOUNDED', name: 'KB', scope: 'MANDATORY', priority: 10, rule_type: 'knowledge', condition_json: { knowledge_bounded: true }, action_json: {}, severity: 'error', is_blocking: true, is_active: true, is_locked: true, version: 1 },
  { id: 'rule-clo-1', code: 'REQUIRE_CLO', name: 'CLO', scope: 'MANDATORY', priority: 20, rule_type: 'learning_outcome', condition_json: {}, action_json: {}, severity: 'error', is_blocking: true, is_active: true, is_locked: true, version: 1 },
  { id: 'rule-mcq-1', code: 'MCQ_SINGLE_ANSWER', name: 'MCQ', scope: 'SYSTEM', priority: 40, rule_type: 'question_quality', condition_json: { question_type: 'multiple_choice_single' }, action_json: {}, severity: 'error', is_blocking: true, is_active: true, is_locked: true, version: 1 },
  { id: 'rule-user', code: 'USER_RULE', name: 'User', scope: 'USER', priority: 1, rule_type: 'other', condition_json: {}, action_json: {}, severity: 'info', is_blocking: false, is_active: true, is_locked: false, version: 1 },
];

describe('Rule Engine', () => {
  it('sorts by scope priority then priority number', () => {
    const sorted = sortRulesByPriority(baseRules);
    expect(sorted[0].scope).toBe('SYSTEM');
    expect(sorted[sorted.length - 1].scope).toBe('USER');
  });

  it('blocks when knowledge-bounded and no evidence', () => {
    const result = evaluateRules({
      rules: baseRules,
      mode: 'ai',
      knowledgeBounded: true,
      evidencePack: { courseId: 'c', learningOutcomes: [], documents: [], retrievedChunks: [], citations: [], coverageScore: 0, retrievalConfidence: 0 },
      questions: [],
    });
    expect(result.passed).toBe(false);
    expect(result.violations.some(v => v.code === 'KNOWLEDGE_BOUNDED')).toBe(true);
  });

  it('flags missing CLO', () => {
    const result = evaluateRules({
      rules: baseRules,
      mode: 'manual',
      knowledgeBounded: false,
      questions: [{ question_text: 'Q?', learning_outcome_codes: [], question_type: 'essay' } as never],
    });
    expect(result.violations.some(v => v.code === 'REQUIRE_CLO')).toBe(true);
  });

  it('validates MCQ single correct answer', () => {
    const result = evaluateRules({
      rules: baseRules,
      mode: 'hybrid',
      knowledgeBounded: false,
      questions: [{
        question_text: 'Q',
        question_type: 'multiple_choice_single',
        learning_outcome_codes: ['CLO1'],
        choices: [
          { id: 'a', text: '1', is_correct: true, rationale: '' },
          { id: 'b', text: '2', is_correct: true, rationale: '' },
        ],
      } as never],
    });
    expect(result.violations.some(v => v.code === 'MCQ_SINGLE_ANSWER')).toBe(true);
  });
});

describe('Verification Engine', () => {
  it('fails missing text and CLO', () => {
    const r = verifyQuestionDeterministic({}, { knowledgeBounded: false });
    expect(r.status).toBe('fail');
    expect(r.violations).toContain('missing_question_text');
    expect(r.violations).toContain('missing_clo');
  });

  it('passes grounded MCQ', () => {
    const r = verifyQuestionDeterministic({
      question_text: 'ข้อใดถูกต้องเกี่ยวกับเทคโนโลยีดิจิทัล?',
      question_type: 'multiple_choice_single',
      learning_outcome_codes: ['CLO1'],
      intended_bloom_level: 'understand',
      ai_predicted_bloom_level: 'understand',
      choices: [
        { id: 'a', text: 'A', is_correct: true, rationale: '' },
        { id: 'b', text: 'B', is_correct: false, rationale: '' },
        { id: 'c', text: 'C', is_correct: false, rationale: '' },
        { id: 'd', text: 'D', is_correct: false, rationale: '' },
      ],
      source_references: [{ document_id: 'd1', file_name: 'x.pdf', page: 1, section: 's', quote: 'q' }],
    }, {
      knowledgeBounded: true,
      evidencePack: { courseId: 'c', learningOutcomes: ['CLO1'], documents: ['d1'], retrievedChunks: [{ id: '1', document_id: 'd1', chunk_index: 0, content: 'เทคโนโลยีดิจิทัล', token_count: 10 }], citations: [], coverageScore: 1, retrievalConfidence: 1 },
    });
    expect(r.status).toBe('pass');
    expect(r.score).toBeGreaterThan(80);
  });

  it('detects duplicates via hash list', () => {
    const text = 'คำถามซ้ำ';
    const h = simpleHash(text.toLowerCase());
    const r = verifyQuestionDeterministic({
      question_text: text,
      learning_outcome_codes: ['CLO1'],
      question_type: 'short_answer',
    }, { knowledgeBounded: false, existingHashes: [h] });
    expect(r.violations).toContain('duplicate');
  });
});

describe('Analysis Engine', () => {
  const req: GenerationV2Request = {
    mode: 'ai',
    courseId: 'c1',
    documentIds: ['d1'],
    learningOutcomeIds: ['lo1'],
    learningOutcomeCodes: ['CLO1'],
    questionType: 'multiple_choice_single',
    bloomLevel: 'apply',
    difficulty: 'medium',
    numberOfQuestions: 3,
    language: 'th',
    marksPerQuestion: 1,
    includeExplanation: true,
    includeRubric: false,
    knowledgeBounded: true,
    createdBy: 'u1',
  };

  it('rejects insufficient evidence when knowledge-bounded', () => {
    const evidence: EvidencePack = { courseId: 'c1', learningOutcomes: [], documents: ['d1'], retrievedChunks: [], citations: [], coverageScore: 0, retrievalConfidence: 0 };
    const d = analyzeGenerationRequest(req, evidence);
    expect(d.decision).toBe('reject');
    expect(d.insufficientEvidence).toBe(true);
  });

  it('approves when evidence present', () => {
    const evidence: EvidencePack = {
      courseId: 'c1', learningOutcomes: ['CLO1'], documents: ['d1'],
      retrievedChunks: [{ id: 'c', document_id: 'd1', chunk_index: 0, content: 'เนื้อหาเทคโนโลยีดิจิทัลเพื่อการศึกษา', token_count: 20 }],
      citations: [{ chunk_id: 'c', document_id: 'd1', quote: 'เทคโนโลยี', score: 0.8 }],
      coverageScore: 0.8, retrievalConfidence: 0.8,
    };
    const d = analyzeGenerationRequest(req, evidence);
    expect(d.decision).toBe('approve');
    expect(d.generationPlan).toHaveLength(3);
  });
});
