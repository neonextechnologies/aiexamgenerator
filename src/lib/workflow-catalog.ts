import type { WorkflowStepCode } from '../types/v2';

export interface WorkflowStepTemplate {
  code: WorkflowStepCode | string;
  name: string;
  description: string;
  sort_order: number;
  ai_enabled: boolean;
  manual_approval_required: boolean;
  rule_set_id?: string | null;
}

export const WORKFLOW_STEP_TEMPLATES: WorkflowStepTemplate[] = [
  { code: 'DEFINE', name: 'Define Request', description: 'กำหนดคำขอและขอบเขตการสร้างข้อสอบ', sort_order: 10, ai_enabled: false, manual_approval_required: false },
  { code: 'KNOWLEDGE_PREPARE', name: 'Prepare Knowledge', description: 'เตรียมและจัดทำดัชนีเอกสารอ้างอิง', sort_order: 20, ai_enabled: false, manual_approval_required: false },
  { code: 'PLAN', name: 'Plan', description: 'วางแผนโครงสร้างข้อสอบ', sort_order: 30, ai_enabled: true, manual_approval_required: false, rule_set_id: 'rs-system-default' },
  { code: 'RETRIEVE', name: 'Retrieve Evidence', description: 'ดึงหลักฐานจาก Knowledge Base', sort_order: 40, ai_enabled: false, manual_approval_required: false },
  { code: 'ANALYZE', name: 'Analyze & Decide', description: 'วิเคราะห์และตัดสินใจก่อนสร้าง', sort_order: 50, ai_enabled: true, manual_approval_required: false, rule_set_id: 'rs-system-default' },
  { code: 'GENERATE', name: 'Generate Questions', description: 'สร้างข้อสอบด้วย AI', sort_order: 60, ai_enabled: true, manual_approval_required: false, rule_set_id: 'rs-system-default' },
  { code: 'VERIFY', name: 'Verify', description: 'ตรวจสอบคุณภาพและความถูกต้อง', sort_order: 70, ai_enabled: true, manual_approval_required: false, rule_set_id: 'rs-system-default' },
  { code: 'HUMAN_REVIEW', name: 'Human Review', description: 'ผู้เชี่ยวชาญตรวจทานข้อสอบ', sort_order: 80, ai_enabled: false, manual_approval_required: true },
  { code: 'APPROVE', name: 'Approve', description: 'อนุมัติชุดข้อสอบ', sort_order: 90, ai_enabled: false, manual_approval_required: true },
  { code: 'DELIVER', name: 'Deliver', description: 'ส่งมอบชุดข้อสอบ', sort_order: 100, ai_enabled: false, manual_approval_required: false },
];

export const WORKFLOW_STEP_CODES = WORKFLOW_STEP_TEMPLATES.map(template => template.code);

export function normalizeStepCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
}

export const DEFAULT_WORKFLOW_VERSIONS: Record<string, string> = {
  'wf-exam-default': 'wfv-exam-1',
};
