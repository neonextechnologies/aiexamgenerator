import type { QuestionGenerationRequest, QuestionGenerationResult, GeneratedQuestion, QuestionChoice, Rubric, BloomLevel, DifficultyLevel, Language } from '../types';

export interface AIProvider {
  name: string;
  isDemo: boolean;
  generateQuestions(req: QuestionGenerationRequest): Promise<QuestionGenerationResult>;
}

const TOPICS = ['แนวคิดเทคโนโลยีดิจิทัล', 'สื่อดิจิทัลและการออกแบบการเรียนรู้', 'แพลตฟอร์มการจัดการเรียนรู้ (LMS)', 'ปัญญาประดิษฐ์เพื่อการศึกษา', 'การประเมินผลดิจิทัล', 'นวัตกรรมการศึกษาดิจิทัล'];
function pick<T>(arr: T[], seed: number): T { return arr[seed % arr.length]; }

function generateMCQ(idx: number, bloom: BloomLevel, diff: DifficultyLevel, lang: Language, marks: number, cloCodes: string[]): GeneratedQuestion {
  const topic = pick(TOPICS, idx);
  const seed = idx * 1000 + bloom.length + diff.length;
  const templates: Record<BloomLevel, string[]> = {
    remember: [`ข้อใดเป็นนิยามที่ถูกต้องของ "${topic}" ในบริบทของเทคโนโลยีดิจิทัลเพื่อการศึกษา?`, `องค์ประกอบหลักของ "${topic}" ประกอบด้วยข้อใดบ้าง?`],
    understand: [`ข้อใดอธิบายความสัมพันธ์ระหว่าง "${topic}" กับการเรียนรู้ของผู้เรียนได้ถูกต้อง?`, `จากแนวคิด "${topic}" ผู้เรียนควรเข้าใจหลักการใดเป็นสำคัญ?`],
    apply: [`หากต้องออกแบบกิจกรรมการเรียนรู้โดยใช้ "${topic}" สำหรับนักเรียนชั้นมัธยม ขั้นตอนใดจะเหมาะสมที่สุด?`, `ในสถานการณ์ที่โรงเรียนมีงบประมาณจำกัด วิธีใดจะประยุกต์ใช้ "${topic}" ได้คุ้มค่าที่สุด?`],
    analyze: [`จากกรณีศึกษาการใช้ "${topic}" ข้อใดเป็นปัจจัยสำคัญที่สุดที่ทำให้ความสำเร็จแตกต่างกัน?`, `เปรียบเทียบแนวทางการใช้ "${topic}" ในรูปแบบ A และ B ข้อใดเป็นจุดแตกต่างที่สำคัญที่สุด?`],
    evaluate: [`ประเมินประสิทธิภาพของ "${topic}" เทียบกับแนวทางอื่น ข้อใดเป็นเกณฑ์ที่สำคัญที่สุด?`, `จากผลการวิจัยเรื่อง "${topic}" ข้อใดเป็นข้อสรุปที่น่าเชื่อถือที่สุด?`],
    create: [`หากให้คุณออกแบบแนวทางใหม่โดยใช้ "${topic}" เพื่อแก้ปัญหาการศึกษา แนวทางใดจะสร้างสรรค์และเป็นไปได้มากที่สุด?`, `เสนอรูปแบบการใช้ "${topic}" ที่แตกต่างจากเดิม ข้อใดจะเป็นรูปแบบที่เหมาะสมที่สุด?`],
  };
  const qText = pick(templates[bloom], seed);
  const correct = `การประยุกต์ใช้ ${topic} อย่างเป็นระบบ โดยคำนึงถึงบริบทผู้เรียนเป็นศูนย์กลาง พร้อมการประเมินผลที่วัดได้`;
  const distractors = [`การใช้ ${topic} ตามกระแสนิยมโดยไม่คำนึงถึงความเหมาะสม`, `การนำ ${topic} มาใช้เฉพาะเพื่อการประชาสัมพันธ์`, `การใช้ ${topic} เป็นเครื่องมือแทนการสอนของครูทั้งหมด`];
  const choices: QuestionChoice[] = [
    { id: 'a', text: correct, is_correct: true, rationale: 'คำตอบที่ถูกต้อง เพราะครอบคลุมทั้งหลักการและการประเมินผล' },
    ...distractors.map((d, i) => ({ id: String.fromCharCode(98 + i), text: d, is_correct: false, rationale: 'ไม่ถูกต้อง เพราะไม่ครอบคลุมหลักการทางการศึกษา' })),
  ];
  const explanations: Record<DifficultyLevel, string> = {
    easy: `คำตอบที่ถูกต้องคือข้อ A เพราะ ${topic} ต้องคำนึงถึงผู้เรียนเป็นศูนย์กลาง และต้องมีการประเมินผลที่วัดได้`,
    medium: `คำตอบที่ถูกต้องคือข้อ A เนื่องจาก ${topic} ต้องอาศัยการวางแผนอย่างเป็นระบบ การพิจารณาบริบทผู้เรียน และการมีระบบประเมินผลที่ชัดเจน`,
    hard: `คำตอบที่ถูกต้องคือข้อ A เพราะ ${topic} ที่มีประสิทธิภาพต้องอาศัยการบูรณาการของหลายปัจจัย ได้แก่ การออกแบบที่เป็นระบบ การคำนึงถึงความแตกต่างรายบุคคล และการประเมินผลที่วัดได้`,
    advanced: `คำตอบที่ถูกต้องคือข้อ A การวิเคราะห์เชิงลึกแสดงให้เห็นว่า ${topic} ที่มีประสิทธิภาพสูงต้องอาศัยกรอบความคิดเชิงระบบ (Systems Thinking) ที่เชื่อมโยงการออกแบบ การใช้งาน และการประเมินผลเข้าด้วยกัน`,
  };
  return {
    questionText: qText, questionType: 'multiple_choice_single', language: lang, choices,
    correctAnswer: 'a', explanation: explanations[diff], bloomLevel: bloom, difficulty: diff,
    learningOutcomeCodes: cloCodes, topic, marks, estimatedAnswerTimeMinutes: diff === 'easy' ? 1 : diff === 'medium' ? 2 : diff === 'hard' ? 3 : 4,
    sourceReferences: [{ document_id: 'doc-1', file_name: 'DT99705_Course_Outline.pdf', page: pick([5, 12, 20, 28], seed), section: topic, quote: null }],
    qualityFlags: [],
  };
}

function generateEssay(idx: number, bloom: BloomLevel, diff: DifficultyLevel, lang: Language, marks: number, cloCodes: string[]): GeneratedQuestion {
  const topic = pick(TOPICS, idx);
  const qText = bloom === 'create'
    ? `ออกแบบแนวทางการใช้ "${topic}" เพื่อแก้ปัญหาการเรียนรู้ของผู้เรียนที่มีความแตกต่างรายบุคคล โดยอธิบายหลักการ วิธีการ และประเมินผลลัพธ์ที่คาดว่าจะเกิดขึ้น`
    : bloom === 'evaluate'
    ? `วิเคราะห์และประเมินประสิทธิภาพของ "${topic}" ในบริบทของเทคโนโลยีดิจิทัลเพื่อการศึกษา พร้อมยกตัวอย่างประกอบ`
    : `อธิบายแนวคิดของ "${topic}" และวิเคราะห์ผลกระทบต่อการจัดการเรียนการสอน`;
  const rubric: Rubric = {
    total_marks: marks,
    criteria: [
      { criterion: 'เนื้อหาและความถูกต้อง', description: 'ความถูกต้องและความครอบคลุม', max_marks: marks * 0.4, performance_levels: [
        { level: 'ดีเยี่ยม', description: 'ครอบคลุม ถูกต้อง', marks_range: `${(marks*0.4*0.85).toFixed(2)}-${(marks*0.4).toFixed(2)}` },
        { level: 'ดี', description: 'ถูกต้องพอสมควร', marks_range: `${(marks*0.4*0.65).toFixed(2)}-${(marks*0.4*0.84).toFixed(2)}` },
        { level: 'พอใช้', description: 'ถูกต้องบางส่วน', marks_range: `${(marks*0.4*0.3).toFixed(2)}-${(marks*0.4*0.64).toFixed(2)}` },
        { level: 'ต้องปรับปรุง', description: 'ไม่ถูกต้อง', marks_range: `0-${(marks*0.4*0.29).toFixed(2)}` },
      ]},
      { criterion: 'การวิเคราะห์', description: 'ความลึกซึ้งของการวิเคราะห์', max_marks: marks * 0.4, performance_levels: [
        { level: 'ดีเยี่ยม', description: 'วิเคราะห์ลึกซึ้ง', marks_range: `${(marks*0.4*0.85).toFixed(2)}-${(marks*0.4).toFixed(2)}` },
        { level: 'ดี', description: 'วิเคราะห์ได้ดี', marks_range: `${(marks*0.4*0.65).toFixed(2)}-${(marks*0.4*0.84).toFixed(2)}` },
        { level: 'พอใช้', description: 'วิเคราะห์ได้บางส่วน', marks_range: `${(marks*0.4*0.3).toFixed(2)}-${(marks*0.4*0.64).toFixed(2)}` },
        { level: 'ต้องปรับปรุง', description: 'วิเคราะห์ไม่ชัดเจน', marks_range: `0-${(marks*0.4*0.29).toFixed(2)}` },
      ]},
      { criterion: 'การนำเสนอ', description: 'รูปแบบและภาษา', max_marks: marks * 0.2, performance_levels: [
        { level: 'ดีเยี่ยม', description: 'นำเสนอยอดเยี่ยม', marks_range: `${(marks*0.2*0.85).toFixed(2)}-${(marks*0.2).toFixed(2)}` },
        { level: 'ดี', description: 'นำเสนอดี', marks_range: `${(marks*0.2*0.65).toFixed(2)}-${(marks*0.2*0.84).toFixed(2)}` },
        { level: 'พอใช้', description: 'นำเสนอพอใช้', marks_range: `${(marks*0.2*0.3).toFixed(2)}-${(marks*0.2*0.64).toFixed(2)}` },
        { level: 'ต้องปรับปรุง', description: 'นำเสนอยากเข้าใจ', marks_range: `0-${(marks*0.2*0.29).toFixed(2)}` },
      ]},
    ],
  };
  return {
    questionText: qText, questionType: 'essay', language: lang, correctAnswer: '',
    explanation: 'คำตอบควรครอบคลุมหลักการ การประยุกต์ใช้ และการประเมินผล พร้อมยกตัวอย่าง',
    bloomLevel: bloom, difficulty: diff, learningOutcomeCodes: cloCodes, topic, marks,
    estimatedAnswerTimeMinutes: diff === 'advanced' ? 15 : 10,
    sourceReferences: [{ document_id: 'doc-2', file_name: 'Lecture_Notes_Ch1-3.pdf', page: pick([12, 20, 28], idx), section: topic, quote: null }],
    rubric, qualityFlags: [],
  };
}

export class DemoAIProvider implements AIProvider {
  name = 'Demo AI';
  isDemo = true;
  async generateQuestions(req: QuestionGenerationRequest): Promise<QuestionGenerationResult> {
    await new Promise(r => setTimeout(r, 800 + Math.random() * 500));
    const cloCodes = req.learningOutcomeIds.length > 0 ? req.learningOutcomeIds : ['CLO1'];
    const questions: GeneratedQuestion[] = [];
    for (let i = 0; i < req.numberOfQuestions; i++) {
      if (req.questionType === 'essay' || req.questionType === 'case_study') {
        questions.push(generateEssay(i, req.bloomLevel, req.difficulty, req.language, req.marksPerQuestion, cloCodes));
      } else if (req.questionType === 'true_false') {
        const topic = pick(TOPICS, i);
        questions.push({
          questionText: `ข้อความต่อไปนี้ถูกหรือผิด: "${topic} สามารถช่วยยกระดับคุณภาพการศึกษาได้หากใช้อย่างเหมาะสม"`,
          questionType: 'true_false', language: req.language, correctAnswer: 'true',
          explanation: `ข้อความนี้ถูกต้อง เพราะ ${topic} เป็นเครื่องมือที่มีศักยภาพในการยกระดับการศึกษา`,
          bloomLevel: req.bloomLevel, difficulty: req.difficulty, learningOutcomeCodes: cloCodes,
          topic, marks: req.marksPerQuestion, estimatedAnswerTimeMinutes: 1, sourceReferences: [], qualityFlags: [],
        });
      } else {
        questions.push(generateMCQ(i, req.bloomLevel, req.difficulty, req.language, req.marksPerQuestion, cloCodes));
      }
    }
    return { questions, inputTokens: 2000 + req.numberOfQuestions * 300, outputTokens: 2500 + req.numberOfQuestions * 400, model: 'demo-model', provider: 'demo' };
  }
}
