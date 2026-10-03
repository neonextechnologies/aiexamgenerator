import { useEffect, useState } from 'react';
import type { Question, QuestionChoice, Rubric, CourseTopic, CourseTag } from '../../types';
import { buildDefaultEssayRubric } from '../../services/rubric';
import { listCourseTags, listCourseTopics, createCourseTag } from '../../lib/api';

interface Props {
  question: Question;
  onChange: (patch: Partial<Question>) => void;
  disabled?: boolean;
}

export function QuestionEditorForm({ question, onChange, disabled }: Props) {
  const [topics, setTopics] = useState<CourseTopic[]>([]);
  const [tags, setTags] = useState<CourseTag[]>([]);
  const [newTag, setNewTag] = useState('');

  useEffect(() => {
    Promise.all([listCourseTopics(question.course_id), listCourseTags(question.course_id)])
      .then(([topicRows, tagRows]) => { setTopics(topicRows); setTags(tagRows); });
  }, [question.course_id]);

  const choices = question.choices || [];
  const updateChoice = (index: number, patch: Partial<QuestionChoice>) => {
    const next = choices.map((c, i) => (i === index ? { ...c, ...patch } : c));
    onChange({ choices: next });
  };

  const addChoice = () => {
    const id = String.fromCharCode(97 + choices.length);
    onChange({ choices: [...choices, { id, text: '', is_correct: false, rationale: '' }] });
  };

  const ensureRubric = () => {
    if (!question.rubric) onChange({ rubric: buildDefaultEssayRubric(question.marks || 5) });
  };

  const updateRubricCriterion = (index: number, patch: Partial<Rubric['criteria'][number]>) => {
    if (!question.rubric) return;
    const criteria = question.rubric.criteria.map((c, i) => (i === index ? { ...c, ...patch } : c));
    onChange({ rubric: { ...question.rubric, criteria } });
  };

  const selectedTags = question.tags || [];

  return (
    <div className="space-y-4">
      <div>
        <label className="label">โจทย์</label>
        <textarea
          className="input min-h-28"
          disabled={disabled}
          value={question.question_text}
          onChange={e => onChange({ question_text: e.target.value })}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="label">หัวข้อ (Topic)</label>
          <input
            className="input"
            list={`topics-${question.id}`}
            disabled={disabled}
            value={question.topic || ''}
            onChange={e => onChange({ topic: e.target.value })}
          />
          <datalist id={`topics-${question.id}`}>
            {topics.map(t => <option key={t.id} value={t.title} />)}
          </datalist>
        </div>
        <div>
          <label className="label">แท็ก</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {tags.map(tag => {
              const active = selectedTags.includes(tag.name);
              return (
                <button
                  key={tag.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    const next = active
                      ? selectedTags.filter(name => name !== tag.name)
                      : [...selectedTags, tag.name];
                    onChange({ tags: next });
                  }}
                  className={`px-2 py-1 rounded text-xs border ${active ? 'bg-primary-50 border-primary-400 text-primary-700' : 'border-neutral-200 text-neutral-600'}`}
                >
                  {tag.name}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <input className="input" disabled={disabled} value={newTag} onChange={e => setNewTag(e.target.value)} placeholder="เพิ่มแท็กใหม่" />
            <button
              type="button"
              className="btn-secondary"
              disabled={disabled || !newTag.trim()}
              onClick={async () => {
                const created = await createCourseTag({ course_id: question.course_id, name: newTag.trim() });
                setTags(prev => prev.some(t => t.id === created.id) ? prev : [...prev, created]);
                onChange({ tags: [...new Set([...selectedTags, created.name])] });
                setNewTag('');
              }}
            >
              เพิ่ม
            </button>
          </div>
        </div>
      </div>

      {choices.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">ตัวเลือก</label>
            <button type="button" className="btn-secondary" disabled={disabled} onClick={addChoice}>เพิ่มตัวเลือก</button>
          </div>
          <div className="space-y-2">
            {choices.map((c, index) => (
              <div key={`${c.id}-${index}`} className="grid md:grid-cols-[3rem_1fr_auto] gap-2 items-start">
                <input className="input" disabled={disabled} value={c.id} onChange={e => updateChoice(index, { id: e.target.value })} />
                <div className="space-y-1">
                  <input className="input" disabled={disabled} value={c.text} onChange={e => updateChoice(index, { text: e.target.value })} placeholder="ข้อความตัวเลือก" />
                  <input className="input" disabled={disabled} value={c.rationale || ''} onChange={e => updateChoice(index, { rationale: e.target.value })} placeholder="เหตุผล" />
                </div>
                <label className="flex items-center gap-2 text-sm mt-2">
                  <input type="checkbox" disabled={disabled} checked={c.is_correct} onChange={e => updateChoice(index, { is_correct: e.target.checked })} />
                  ถูก
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="label">เฉลย / คำตอบที่ถูกต้อง</label>
        <input
          className="input"
          disabled={disabled}
          value={Array.isArray(question.correct_answer) ? question.correct_answer.join(', ') : String(question.correct_answer || '')}
          onChange={e => onChange({ correct_answer: e.target.value })}
        />
      </div>

      <div>
        <label className="label">คำอธิบาย</label>
        <textarea
          className="input min-h-24"
          disabled={disabled}
          value={question.explanation || ''}
          onChange={e => onChange({ explanation: e.target.value })}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="label mb-0">Rubric / เกณฑ์ให้คะแนน</label>
          {!question.rubric && (
            <button type="button" className="btn-secondary" disabled={disabled} onClick={ensureRubric}>สร้าง Rubric เริ่มต้น</button>
          )}
        </div>
        {question.rubric && (
          <div className="space-y-3">
            <input
              className="input"
              disabled={disabled}
              type="number"
              value={question.rubric.total_marks}
              onChange={e => onChange({ rubric: { ...question.rubric!, total_marks: Number(e.target.value) || 0 } })}
            />
            {question.rubric.criteria.map((c, index) => (
              <div key={index} className="p-3 border border-neutral-200 rounded-lg space-y-2">
                <input className="input" disabled={disabled} value={c.criterion} onChange={e => updateRubricCriterion(index, { criterion: e.target.value })} />
                <textarea className="input min-h-16" disabled={disabled} value={c.description} onChange={e => updateRubricCriterion(index, { description: e.target.value })} />
                <input className="input" disabled={disabled} type="number" value={c.max_marks} onChange={e => updateRubricCriterion(index, { max_marks: Number(e.target.value) || 0 })} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
