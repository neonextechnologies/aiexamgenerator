import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
  convertInchesToTwip,
} from 'docx';
import { jsPDF } from 'jspdf';
import type { Course, Exam, Question, Rubric } from '../../types';
import { QUESTION_TYPE_LABELS } from '../../types';

async function triggerDownload(blob: Blob, filename: string): Promise<void> {
  const mod = await import('file-saver');
  const saveAs = (mod as { saveAs?: (b: Blob, n: string) => void; default?: { saveAs?: (b: Blob, n: string) => void } }).saveAs
    || (mod as { default?: (b: Blob, n: string) => void }).default
    || (mod as { default?: { saveAs?: (b: Blob, n: string) => void } }).default?.saveAs;
  if (typeof saveAs === 'function') {
    saveAs(blob, filename);
    return;
  }
  // Node / test fallback
  if (typeof window === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type ExportKind = 'exam' | 'answer_key';
export type ExportFormat = 'docx' | 'pdf';

export interface ExamExportInput {
  exam: Exam;
  course: Course | null;
  questions: Question[];
  kind: ExportKind;
}

function choiceLine(q: Question): string[] {
  if (!q.choices?.length) return [];
  return q.choices.map(c => `${c.id}. ${c.text}`);
}

function formatAnswer(q: Question): string {
  if (q.choices?.length) {
    const correct = q.choices.filter(c => c.is_correct).map(c => c.id).join(', ');
    if (correct) return correct;
  }
  if (Array.isArray(q.correct_answer)) return q.correct_answer.join(', ');
  return String(q.correct_answer || '-');
}

function rubricLines(rubric: Rubric | null | undefined): string[] {
  if (!rubric?.criteria?.length) return [];
  const lines = [`Rubric (รวม ${rubric.total_marks} คะแนน)`];
  for (const c of rubric.criteria) {
    lines.push(`• ${c.criterion} (${c.max_marks} คะแนน): ${c.description || ''}`);
    for (const pl of c.performance_levels || []) {
      lines.push(`  - ${pl.level} [${pl.marks_range}]: ${pl.description || ''}`);
    }
  }
  return lines;
}

function titleFor(input: ExamExportInput): string {
  return input.kind === 'answer_key'
    ? `เฉลย: ${input.exam.name}`
    : input.exam.name;
}

function buildParagraphs(input: ExamExportInput): Paragraph[] {
  const { exam, course, questions, kind } = input;
  const paras: Paragraph[] = [
    new Paragraph({
      text: titleFor(input),
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `${course?.course_code || ''} ${course?.course_name_th || ''}`.trim(),
          size: 22,
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `เวลา ${exam.duration_minutes} นาที • คะแนนเต็ม ${exam.total_marks} • ${questions.length} ข้อ`,
          size: 20,
          italics: true,
        }),
      ],
    }),
  ];

  if (exam.instructions) {
    paras.push(new Paragraph({
      children: [new TextRun({ text: `คำชี้แจง: ${exam.instructions}`, size: 20 })],
    }));
  }

  paras.push(new Paragraph({ text: '' }));

  questions.forEach((q, index) => {
    paras.push(new Paragraph({
      children: [
        new TextRun({
          text: `${index + 1}. ${q.question_text}`,
          bold: true,
          size: 22,
        }),
      ],
    }));
    paras.push(new Paragraph({
      children: [
        new TextRun({
          text: `[${QUESTION_TYPE_LABELS[q.question_type] || q.question_type}] ${q.marks} คะแนน${q.topic ? ` • ${q.topic}` : ''}`,
          size: 18,
          color: '666666',
        }),
      ],
    }));

    for (const line of choiceLine(q)) {
      paras.push(new Paragraph({
        children: [new TextRun({ text: line, size: 20 })],
        indent: { left: convertInchesToTwip(0.25) },
      }));
    }

    if (kind === 'answer_key') {
      paras.push(new Paragraph({
        children: [new TextRun({ text: `เฉลย: ${formatAnswer(q)}`, bold: true, size: 20 })],
      }));
      if (q.explanation) {
        paras.push(new Paragraph({
          children: [new TextRun({ text: `คำอธิบาย: ${q.explanation}`, size: 20 })],
        }));
      }
      for (const line of rubricLines(q.rubric)) {
        paras.push(new Paragraph({
          children: [new TextRun({ text: line, size: 18 })],
          indent: { left: convertInchesToTwip(0.15) },
        }));
      }
    }

    paras.push(new Paragraph({ text: '' }));
  });

  return paras;
}

export async function buildExamDocxBlob(input: ExamExportInput): Promise<Blob> {
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Sarabun', size: 22 },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(0.8),
            bottom: convertInchesToTwip(0.8),
            left: convertInchesToTwip(0.9),
            right: convertInchesToTwip(0.9),
          },
        },
      },
      children: buildParagraphs(input),
    }],
  });
  return Packer.toBlob(doc);
}

let fontCache: { regular: string; bold: string } | null = null;

async function loadThaiFonts(): Promise<{ regular: string; bold: string }> {
  if (fontCache) return fontCache;
  const toBase64 = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`โหลดฟอนต์ไม่สำเร็จ: ${url}`);
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  };
  fontCache = {
    regular: await toBase64('/fonts/Sarabun-Regular.ttf'),
    bold: await toBase64('/fonts/Sarabun-Bold.ttf'),
  };
  return fontCache;
}

export async function buildExamPdfBlob(input: ExamExportInput): Promise<Blob> {
  const fonts = await loadThaiFonts();
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.addFileToVFS('Sarabun-Regular.ttf', fonts.regular);
  doc.addFileToVFS('Sarabun-Bold.ttf', fonts.bold);
  doc.addFont('Sarabun-Regular.ttf', 'Sarabun', 'normal');
  doc.addFont('Sarabun-Bold.ttf', 'Sarabun', 'bold');

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const write = (text: string, opts?: { bold?: boolean; size?: number; gap?: number }) => {
    const size = opts?.size ?? 11;
    doc.setFont('Sarabun', opts?.bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, maxWidth) as string[];
    const lineHeight = size + 4;
    ensureSpace(lines.length * lineHeight + (opts?.gap ?? 4));
    for (const line of lines) {
      doc.text(line, margin, y);
      y += lineHeight;
    }
    y += opts?.gap ?? 4;
  };

  write(titleFor(input), { bold: true, size: 16, gap: 6 });
  write(`${input.course?.course_code || ''} ${input.course?.course_name_th || ''}`.trim(), { size: 11, gap: 2 });
  write(`เวลา ${input.exam.duration_minutes} นาที • คะแนนเต็ม ${input.exam.total_marks} • ${input.questions.length} ข้อ`, { size: 10, gap: 8 });
  if (input.exam.instructions) write(`คำชี้แจง: ${input.exam.instructions}`, { size: 10, gap: 10 });

  input.questions.forEach((q, index) => {
    write(`${index + 1}. ${q.question_text}`, { bold: true, size: 11, gap: 2 });
    write(`[${QUESTION_TYPE_LABELS[q.question_type] || q.question_type}] ${q.marks} คะแนน${q.topic ? ` • ${q.topic}` : ''}`, { size: 9, gap: 2 });
    for (const line of choiceLine(q)) write(line, { size: 10, gap: 1 });
    if (input.kind === 'answer_key') {
      write(`เฉลย: ${formatAnswer(q)}`, { bold: true, size: 10, gap: 2 });
      if (q.explanation) write(`คำอธิบาย: ${q.explanation}`, { size: 10, gap: 2 });
      for (const line of rubricLines(q.rubric)) write(line, { size: 9, gap: 1 });
    }
    y += 8;
  });

  return doc.output('blob');
}

export function suggestExportFilename(input: ExamExportInput, format: ExportFormat): string {
  const safe = (input.exam.name || 'exam').replace(/[^\w\u0E00-\u0E7F-]+/g, '_');
  const suffix = input.kind === 'answer_key' ? 'answer_key' : 'exam';
  return `${safe}_${suffix}.${format}`;
}

export async function downloadExamExport(
  input: ExamExportInput,
  format: ExportFormat,
): Promise<{ filename: string; blob: Blob }> {
  const blob = format === 'docx'
    ? await buildExamDocxBlob(input)
    : await buildExamPdfBlob(input);
  const filename = suggestExportFilename(input, format);
  await triggerDownload(blob, filename);
  return { filename, blob };
}

/** Build printable HTML for in-app preview (exam or answer key). */
export function buildExamPreviewHtml(input: ExamExportInput): string {
  const blocks = input.questions.map((q, i) => {
    const choices = choiceLine(q).map(line => `<div class="choice">${escapeHtml(line)}</div>`).join('');
    const key = input.kind === 'answer_key'
      ? `<div class="answer"><strong>เฉลย:</strong> ${escapeHtml(formatAnswer(q))}</div>
         ${q.explanation ? `<div class="explain"><strong>คำอธิบาย:</strong> ${escapeHtml(q.explanation)}</div>` : ''}
         ${rubricLines(q.rubric).map(l => `<div class="rubric">${escapeHtml(l)}</div>`).join('')}`
      : '';
    return `<section class="q">
      <h3>${i + 1}. ${escapeHtml(q.question_text)}</h3>
      <p class="meta">${escapeHtml(QUESTION_TYPE_LABELS[q.question_type] || '')} • ${q.marks} คะแนน</p>
      ${choices}${key}
    </section>`;
  }).join('');

  return `<!doctype html><html lang="th"><head><meta charset="utf-8" />
    <title>${escapeHtml(titleFor(input))}</title>
    <style>
      body{font-family:'Sarabun',Tahoma,sans-serif;padding:24px;color:#111;line-height:1.5}
      h1{font-size:1.4rem;margin:0 0 8px} .sub{color:#555;margin-bottom:20px}
      .q{margin:18px 0;padding-bottom:12px;border-bottom:1px solid #eee}
      .choice{margin-left:12px}.answer{margin-top:8px;color:#065f46}.rubric{font-size:.9rem;color:#444}
    </style></head><body>
    <h1>${escapeHtml(titleFor(input))}</h1>
    <div class="sub">${escapeHtml(`${input.course?.course_code || ''} ${input.course?.course_name_th || ''}`.trim())}<br/>
    เวลา ${input.exam.duration_minutes} นาที • คะแนนเต็ม ${input.exam.total_marks}</div>
    ${blocks}
    </body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
