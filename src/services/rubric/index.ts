import type { Rubric } from '../../types';

const LEVELS = [
  { level: 'ดีเยี่ยม', portion: [0.85, 1] as const, description: 'ครบถ้วน ถูกต้อง ชัดเจน' },
  { level: 'ดี', portion: [0.65, 0.84] as const, description: 'ถูกต้องเป็นส่วนใหญ่' },
  { level: 'พอใช้', portion: [0.30, 0.64] as const, description: 'ถูกต้องบางส่วน' },
  { level: 'ต้องปรับปรุง', portion: [0, 0.29] as const, description: 'ยังไม่เพียงพอ' },
];

function range(max: number, portion: readonly [number, number]): string {
  const lo = (max * portion[0]).toFixed(2);
  const hi = (max * portion[1]).toFixed(2);
  return `${lo}-${hi}`;
}

/** Default Thai scoring rubric for essay / case-study items. */
export function buildDefaultEssayRubric(totalMarks: number): Rubric {
  const marks = Math.max(1, Number(totalMarks) || 5);
  const weights = [
    { criterion: 'เนื้อหาและความถูกต้อง', description: 'ความถูกต้องและความครอบคลุมของเนื้อหา', weight: 0.4 },
    { criterion: 'การวิเคราะห์', description: 'ความลึกซึ้งของการวิเคราะห์และเหตุผล', weight: 0.4 },
    { criterion: 'การนำเสนอ', description: 'โครงสร้าง ภาษา และการสื่อสาร', weight: 0.2 },
  ];
  return {
    total_marks: marks,
    criteria: weights.map(w => {
      const max = Number((marks * w.weight).toFixed(2));
      return {
        criterion: w.criterion,
        description: w.description,
        max_marks: max,
        performance_levels: LEVELS.map(l => ({
          level: l.level,
          description: l.description,
          marks_range: range(max, l.portion),
        })),
      };
    }),
  };
}

export function isSubjectiveType(questionType: string | undefined | null): boolean {
  return questionType === 'essay' || questionType === 'case_study' || questionType === 'short_answer';
}

export function ensureRubricForQuestion(input: {
  questionType: string;
  marks: number;
  includeRubric?: boolean;
  rubric?: Rubric | null;
}): Rubric | null {
  if (input.rubric?.criteria?.length) return input.rubric;
  if (!input.includeRubric) return input.rubric || null;
  if (input.questionType === 'essay' || input.questionType === 'case_study') {
    return buildDefaultEssayRubric(input.marks);
  }
  return input.rubric || null;
}

export function rubricPromptBlock(includeRubric: boolean, marksPerQuestion: number): string {
  if (!includeRubric) {
    return 'For essay/case_study you MAY include a rubric, but it is optional.';
  }
  return `For every essay or case_study question you MUST include a "rubric" object:
{"totalMarks":${marksPerQuestion},"criteria":[{"criterion":"name","description":"desc","maxMarks":number,"performanceLevels":[{"level":"ดีเยี่ยม","description":"desc","marksRange":"range"}]}]}
Use Thai level labels: ดีเยี่ยม, ดี, พอใช้, ต้องปรับปรุง. Sum of criterion maxMarks must equal ${marksPerQuestion}.`;
}

/** Normalize model rubric JSON (camelCase or snake_case) into app Rubric shape. */
export function normalizeRubric(raw: unknown, fallbackMarks: number): Rubric | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const criteriaRaw = (obj.criteria || obj.Criteria) as unknown;
  if (!Array.isArray(criteriaRaw) || !criteriaRaw.length) return null;
  const criteria = criteriaRaw.map((c) => {
    const row = (c || {}) as Record<string, unknown>;
    const levelsRaw = (row.performanceLevels || row.performance_levels || []) as unknown[];
    const max = Number(row.maxMarks ?? row.max_marks ?? 0) || 0;
    return {
      criterion: String(row.criterion || row.name || 'เกณฑ์'),
      description: String(row.description || ''),
      max_marks: max,
      performance_levels: (Array.isArray(levelsRaw) ? levelsRaw : []).map((pl) => {
        const level = (pl || {}) as Record<string, unknown>;
        return {
          level: String(level.level || ''),
          description: String(level.description || ''),
          marks_range: String(level.marksRange || level.marks_range || ''),
        };
      }),
    };
  });
  const total = Number(obj.totalMarks ?? obj.total_marks ?? fallbackMarks) || fallbackMarks;
  return { total_marks: total, criteria };
}
