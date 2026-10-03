import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildExamDocxBlob, buildExamPdfBlob, buildExamPreviewHtml } from '/workspace/src/services/export/exam-export.ts';
import { DEMO_COURSE, DEMO_EXAM, DEMO_QUESTIONS } from '/workspace/src/lib/demo-data.ts';

const outDir = '/opt/cursor/artifacts/exports';
fs.mkdirSync(outDir, { recursive: true });

const questions = DEMO_EXAM.questions
  .map(eq => DEMO_QUESTIONS.find(q => q.id === eq.question_id))
  .filter(Boolean);

globalThis.fetch = async (url) => {
  const rel = String(url).replace(/^\//, '');
  const target = path.join('/workspace/public', rel);
  const buf = fs.readFileSync(target);
  return {
    ok: true,
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
};

const examInput = { exam: DEMO_EXAM, course: DEMO_COURSE, questions, kind: 'exam' };
const keyInput = { exam: DEMO_EXAM, course: DEMO_COURSE, questions, kind: 'answer_key' };

async function writeBlob(blob, name) {
  const ab = await blob.arrayBuffer();
  const file = path.join(outDir, name);
  fs.writeFileSync(file, Buffer.from(ab));
  console.log(name, fs.statSync(file).size);
}

await writeBlob(await buildExamDocxBlob(examInput), 'exam.docx');
await writeBlob(await buildExamDocxBlob(keyInput), 'answer_key.docx');
await writeBlob(await buildExamPdfBlob(examInput), 'exam.pdf');
await writeBlob(await buildExamPdfBlob(keyInput), 'answer_key.pdf');
fs.writeFileSync(path.join(outDir, 'answer_key_preview.html'), buildExamPreviewHtml(keyInput));
console.log('exports ready', fileURLToPath(import.meta.url));
