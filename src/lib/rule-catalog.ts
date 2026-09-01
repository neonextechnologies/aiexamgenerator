import type { RuleScope, RuleSeverity } from '../types/v2';

export interface RuleTemplate {
  code: string;
  name: string;
  description: string;
  scope: RuleScope;
  priority: number;
  rule_type: string;
  severity: RuleSeverity;
  is_blocking: boolean;
  condition_json: Record<string, unknown>;
  action_json: Record<string, unknown>;
}

export const RULE_TEMPLATES: RuleTemplate[] = [
  {
    code: 'KNOWLEDGE_BOUNDED',
    name: 'Knowledge Bounded',
    description: 'คำถามต้องอ้างอิงจากเอกสารที่เลือก',
    scope: 'MANDATORY',
    priority: 10,
    rule_type: 'knowledge',
    severity: 'error',
    is_blocking: true,
    condition_json: { knowledge_bounded: true },
    action_json: { require_evidence: true },
  },
  {
    code: 'REQUIRE_CLO',
    name: 'Require CLO Mapping',
    description: 'ทุกข้อต้อง map กับ CLO อย่างน้อย 1 รายการ',
    scope: 'MANDATORY',
    priority: 20,
    rule_type: 'learning_outcome',
    severity: 'error',
    is_blocking: true,
    condition_json: {},
    action_json: { require_clo: true },
  },
  {
    code: 'REQUIRE_SOURCE',
    name: 'Require Source Reference',
    description: 'ต้องมี source reference เมื่อเปิด knowledge bounded',
    scope: 'MANDATORY',
    priority: 30,
    rule_type: 'knowledge',
    severity: 'error',
    is_blocking: true,
    condition_json: { knowledge_bounded: true },
    action_json: { require_source: true },
  },
  {
    code: 'MCQ_SINGLE_ANSWER',
    name: 'MCQ Single Correct',
    description: 'ปรนัยคำตอบเดียวต้องมีคำตอบถูก 1 ข้อ',
    scope: 'SYSTEM',
    priority: 40,
    rule_type: 'question_quality',
    severity: 'error',
    is_blocking: true,
    condition_json: { question_type: 'multiple_choice_single' },
    action_json: { exact_correct_count: 1 },
  },
  {
    code: 'MCQ_FOUR_CHOICES',
    name: 'MCQ Four Choices',
    description: 'ปรนัยควรมี 4 ตัวเลือก',
    scope: 'SYSTEM',
    priority: 50,
    rule_type: 'question_quality',
    severity: 'warning',
    is_blocking: false,
    condition_json: { question_type: 'multiple_choice_single' },
    action_json: { choice_count: 4 },
  },
  {
    code: 'BLOOM_ALIGN',
    name: 'Bloom Alignment',
    description: 'แจ้งเตือนเมื่อ Bloom ที่ตั้งกับที่ AI ทำนายไม่ตรงกัน',
    scope: 'SYSTEM',
    priority: 60,
    rule_type: 'bloom',
    severity: 'warning',
    is_blocking: false,
    condition_json: {},
    action_json: { flag_mismatch: true },
  },
  {
    code: 'NO_DUPLICATE',
    name: 'No Duplicate Questions',
    description: 'ห้ามมีคำถามซ้ำในชุดเดียวกัน',
    scope: 'SYSTEM',
    priority: 70,
    rule_type: 'question_quality',
    severity: 'error',
    is_blocking: true,
    condition_json: {},
    action_json: { check_hash: true },
  },
];

export const RULE_SCOPES: RuleScope[] = ['SYSTEM', 'MANDATORY', 'ORGANIZATION', 'COURSE', 'WORKFLOW', 'GENERATION', 'USER'];
export const RULE_SEVERITIES: RuleSeverity[] = ['info', 'warning', 'error', 'critical'];
export const RULE_TYPES = ['knowledge', 'learning_outcome', 'question_quality', 'bloom', 'custom'] as const;

export function normalizeRuleCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
}
