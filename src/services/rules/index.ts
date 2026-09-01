import type { Rule, RuleEvaluationResult, RuleSet, EvidencePack, RuleScope, RuleSeverity } from '../../types/v2';
import type { Question } from '../../types';
import type { RuleEngine } from '../types';
import { isDemoMode, supabase } from '../../lib/supabase';

const DEMO_RULE_SETS: RuleSet[] = [
  { id: 'rs-system-default', name: 'System Default Rules', description: 'Mandatory academic quality rules', scope: 'SYSTEM', is_active: true },
];

const RULES_STORAGE_KEY = 'aiexam.custom_rules';
const RULE_LINKS_STORAGE_KEY = 'aiexam.rule_set_links';

export interface CreateRuleInput {
  ruleSetId: string;
  code: string;
  name: string;
  description?: string;
  scope: RuleScope;
  priority: number;
  rule_type: string;
  severity: RuleSeverity;
  is_blocking: boolean;
  is_active: boolean;
  condition_json?: Record<string, unknown>;
  action_json?: Record<string, unknown>;
  createdBy?: string;
}

function readCustomRules(): Rule[] {
  try {
    const raw = localStorage.getItem(RULES_STORAGE_KEY);
    return raw ? JSON.parse(raw) as Rule[] : [];
  } catch {
    return [];
  }
}

function writeCustomRules(rules: Rule[]) {
  localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
}

function readRuleLinks(): Array<{ rule_set_id: string; rule_id: string }> {
  try {
    const raw = localStorage.getItem(RULE_LINKS_STORAGE_KEY);
    return raw ? JSON.parse(raw) as Array<{ rule_set_id: string; rule_id: string }> : [];
  } catch {
    return [];
  }
}

function writeRuleLinks(links: Array<{ rule_set_id: string; rule_id: string }>) {
  localStorage.setItem(RULE_LINKS_STORAGE_KEY, JSON.stringify(links));
}

function allDemoRules(): Rule[] {
  const custom = readCustomRules();
  const byId = new Map<string, Rule>();
  [...DEMO_RULES, ...custom].forEach(rule => byId.set(rule.id, rule));
  return [...byId.values()];
}

function demoRulesForSet(ruleSetId: string): Rule[] {
  if (ruleSetId === 'rs-system-default') {
    const links = readRuleLinks().filter(link => link.rule_set_id === ruleSetId);
    const linkedIds = new Set(links.map(link => link.rule_id));
    const customLinked = readCustomRules().filter(rule => linkedIds.has(rule.id));
    return sortRulesByPriority([...DEMO_RULES, ...customLinked]);
  }
  const links = readRuleLinks().filter(link => link.rule_set_id === ruleSetId);
  const ids = new Set(links.map(link => link.rule_id));
  return sortRulesByPriority(allDemoRules().filter(rule => ids.has(rule.id)));
}

const DEMO_RULES: Rule[] = [
  { id: 'rule-kb-1', code: 'KNOWLEDGE_BOUNDED', name: 'Knowledge Bounded', scope: 'MANDATORY', priority: 10, rule_type: 'knowledge', condition_json: { knowledge_bounded: true }, action_json: { require_evidence: true }, severity: 'error', is_blocking: true, is_active: true, is_locked: true, version: 1 },
  { id: 'rule-clo-1', code: 'REQUIRE_CLO', name: 'Require CLO Mapping', scope: 'MANDATORY', priority: 20, rule_type: 'learning_outcome', condition_json: {}, action_json: { require_clo: true }, severity: 'error', is_blocking: true, is_active: true, is_locked: true, version: 1 },
  { id: 'rule-src-1', code: 'REQUIRE_SOURCE', name: 'Require Source Reference', scope: 'MANDATORY', priority: 30, rule_type: 'knowledge', condition_json: { knowledge_bounded: true }, action_json: { require_source: true }, severity: 'error', is_blocking: true, is_active: true, is_locked: false, version: 1 },
  { id: 'rule-mcq-1', code: 'MCQ_SINGLE_ANSWER', name: 'MCQ Single Correct', scope: 'SYSTEM', priority: 40, rule_type: 'question_quality', condition_json: { question_type: 'multiple_choice_single' }, action_json: { exact_correct_count: 1 }, severity: 'error', is_blocking: true, is_active: true, is_locked: true, version: 1 },
  { id: 'rule-mcq-4', code: 'MCQ_FOUR_CHOICES', name: 'MCQ Four Choices', scope: 'SYSTEM', priority: 50, rule_type: 'question_quality', condition_json: { question_type: 'multiple_choice_single' }, action_json: { choice_count: 4 }, severity: 'warning', is_blocking: false, is_active: true, is_locked: false, version: 1 },
  { id: 'rule-bloom-1', code: 'BLOOM_ALIGN', name: 'Bloom Alignment', scope: 'SYSTEM', priority: 60, rule_type: 'bloom', condition_json: {}, action_json: { flag_mismatch: true }, severity: 'warning', is_blocking: false, is_active: true, is_locked: false, version: 1 },
  { id: 'rule-dup-1', code: 'NO_DUPLICATE', name: 'No Duplicate Questions', scope: 'SYSTEM', priority: 70, rule_type: 'question_quality', condition_json: {}, action_json: { check_hash: true }, severity: 'error', is_blocking: true, is_active: true, is_locked: false, version: 1 },
];

const SCOPE_RANK: Record<string, number> = {
  SYSTEM: 700, MANDATORY: 600, ORGANIZATION: 500, COURSE: 400, WORKFLOW: 300, GENERATION: 200, USER: 100,
};

export function sortRulesByPriority(rules: Rule[]): Rule[] {
  return [...rules].sort((a, b) => {
    const scopeDiff = (SCOPE_RANK[b.scope] || 0) - (SCOPE_RANK[a.scope] || 0);
    if (scopeDiff !== 0) return scopeDiff;
    return a.priority - b.priority;
  });
}

export function evaluateRules(input: {
  rules: Rule[];
  mode: string;
  knowledgeBounded: boolean;
  questions?: Partial<Question>[];
  evidencePack?: EvidencePack | null;
}): RuleEvaluationResult {
  const ordered = sortRulesByPriority(input.rules.filter(r => r.is_active));
  const violations: RuleEvaluationResult['violations'] = [];
  const applied: string[] = [];

  for (const rule of ordered) {
    applied.push(rule.id);
    const cond = rule.condition_json || {};
    if (cond.knowledge_bounded === true && !input.knowledgeBounded) continue;
    if (cond.question_type && input.questions?.length) {
      // apply only to matching types later per question
    }

    if (rule.code === 'KNOWLEDGE_BOUNDED' && input.knowledgeBounded) {
      const chunks = input.evidencePack?.retrievedChunks?.length || 0;
      if (chunks === 0 && input.mode !== 'manual') {
        violations.push({ ruleId: rule.id, code: rule.code, severity: rule.severity, message: 'ไม่พบหลักฐานจากเอกสารที่เลือก (INSUFFICIENT_EVIDENCE)', blocking: rule.is_blocking });
      }
    }

    if (rule.code === 'REQUIRE_CLO') {
      for (const q of input.questions || []) {
        const codes = q.learning_outcome_codes || [];
        if (!codes.length) {
          violations.push({ ruleId: rule.id, code: rule.code, severity: rule.severity, message: `คำถามขาด CLO mapping: ${(q.question_text || '').slice(0, 40)}`, blocking: rule.is_blocking });
        }
      }
    }

    if (rule.code === 'REQUIRE_SOURCE' && input.knowledgeBounded) {
      for (const q of input.questions || []) {
        const refs = q.source_references || [];
        if (!refs.length) {
          violations.push({ ruleId: rule.id, code: rule.code, severity: rule.severity, message: 'คำถามไม่มี source reference', blocking: rule.is_blocking });
        }
      }
    }

    if (rule.code === 'MCQ_SINGLE_ANSWER') {
      for (const q of input.questions || []) {
        if (q.question_type !== 'multiple_choice_single') continue;
        const correct = (q.choices || []).filter(c => c.is_correct).length;
        if (correct !== 1) {
          violations.push({ ruleId: rule.id, code: rule.code, severity: rule.severity, message: `MCQ ต้องมีคำตอบถูก 1 ข้อ (พบ ${correct})`, blocking: rule.is_blocking });
        }
      }
    }

    if (rule.code === 'MCQ_FOUR_CHOICES') {
      for (const q of input.questions || []) {
        if (q.question_type !== 'multiple_choice_single') continue;
        const n = (q.choices || []).length;
        if (n !== 4) {
          violations.push({ ruleId: rule.id, code: rule.code, severity: rule.severity, message: `MCQ ควรมี 4 ตัวเลือก (พบ ${n})`, blocking: rule.is_blocking });
        }
      }
    }

    if (rule.code === 'BLOOM_ALIGN') {
      for (const q of input.questions || []) {
        if (q.intended_bloom_level && q.ai_predicted_bloom_level && q.intended_bloom_level !== q.ai_predicted_bloom_level) {
          violations.push({ ruleId: rule.id, code: rule.code, severity: rule.severity, message: `Bloom ไม่สอดคล้อง intended=${q.intended_bloom_level} predicted=${q.ai_predicted_bloom_level}`, blocking: rule.is_blocking });
        }
      }
    }

    if (rule.code === 'NO_DUPLICATE') {
      const hashes = new Set<string>();
      for (const q of input.questions || []) {
        const h = simpleHash((q.question_text || '').trim().toLowerCase());
        if (hashes.has(h)) {
          violations.push({ ruleId: rule.id, code: rule.code, severity: rule.severity, message: 'พบคำถามซ้ำในชุดเดียวกัน', blocking: rule.is_blocking });
        }
        hashes.add(h);
      }
    }
  }

  const blockingFail = violations.some(v => v.blocking && (v.severity === 'error' || v.severity === 'critical'));
  return { passed: !blockingFail, violations, appliedRuleIds: applied };
}

export function simpleHash(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  return `h${Math.abs(h)}`;
}

export const ruleEngine: RuleEngine = {
  async listRules() {
    if (isDemoMode || !supabase) return allDemoRules().filter(rule => rule.is_active);
    const { data, error } = await supabase.from('rules').select('*').eq('is_active', true).order('priority');
    if (error) throw error;
    return (data || []) as Rule[];
  },
  async listRuleSets() {
    if (isDemoMode || !supabase) return DEMO_RULE_SETS;
    const { data, error } = await supabase.from('rule_sets').select('*').eq('is_active', true);
    if (error) throw error;
    return (data || []) as RuleSet[];
  },
  async getRulesForSet(ruleSetId: string) {
    if (isDemoMode || !supabase) return demoRulesForSet(ruleSetId);
    const { data: links, error } = await supabase.from('rule_set_rules').select('rule_id').eq('rule_set_id', ruleSetId);
    if (error) throw error;
    const ids = (links || []).map((l: { rule_id: string }) => l.rule_id);
    if (!ids.length) return [];
    const { data, error: e2 } = await supabase.from('rules').select('*').in('id', ids).order('priority');
    if (e2) throw e2;
    return sortRulesByPriority((data || []) as Rule[]);
  },
  async createRule(input) {
    const code = input.code.trim().toUpperCase().replace(/\s+/g, '_');
    if (!code) throw new Error('กรุณาระบุรหัสกฎ');
    if (!input.name.trim()) throw new Error('กรุณาระบุชื่อกฎ');
    if (!input.ruleSetId) throw new Error('กรุณาเลือก Rule Set');

    const rule: Rule = {
      id: `rule-${Date.now()}`,
      code,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      scope: input.scope,
      priority: input.priority,
      rule_type: input.rule_type,
      condition_json: input.condition_json || {},
      action_json: input.action_json || {},
      severity: input.severity,
      is_blocking: input.is_blocking,
      is_active: input.is_active,
      is_locked: false,
      version: 1,
    };

    if (isDemoMode || !supabase) {
      const existing = allDemoRules();
      if (existing.some(item => item.code === code)) throw new Error(`รหัสกฎ ${code} มีอยู่แล้ว`);
      const custom = readCustomRules();
      custom.push(rule);
      writeCustomRules(custom);
      const links = readRuleLinks();
      links.push({ rule_set_id: input.ruleSetId, rule_id: rule.id });
      writeRuleLinks(links);
      return rule;
    }

    const { data: existingCode } = await supabase.from('rules').select('id').eq('code', code).maybeSingle();
    if (existingCode) throw new Error(`รหัสกฎ ${code} มีอยู่แล้ว`);

    const { data, error } = await supabase.from('rules').insert({
      id: rule.id,
      code: rule.code,
      name: rule.name,
      description: rule.description,
      scope: rule.scope,
      priority: rule.priority,
      rule_type: rule.rule_type,
      condition_json: rule.condition_json,
      action_json: rule.action_json,
      severity: rule.severity,
      is_blocking: rule.is_blocking,
      is_active: rule.is_active,
      is_locked: false,
      version: 1,
      created_by: input.createdBy || null,
    }).select('*').single();
    if (error) throw error;

    const { error: linkError } = await supabase.from('rule_set_rules').insert({
      rule_set_id: input.ruleSetId,
      rule_id: rule.id,
    });
    if (linkError) throw linkError;

    return data as Rule;
  },
  async evaluate(input) {
    return evaluateRules(input);
  },
};
