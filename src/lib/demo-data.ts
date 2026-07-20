import type { Profile, Course, LearningOutcome, CourseTopic, Document, TestBlueprint, Question, Exam, GenerationJob, QuestionReview, Notification, AIUsageLog, AuditLog } from '../types';

export const DEMO_PROFILES: Profile[] = [
  { id:'u-inst', email:'instructor@example.com', full_name:'ดร. สมชาย ใจดี', role:'instructor', department:'เทคโนโลยีการศึกษา', created_at:'2025-01-10T08:00:00Z' },
  { id:'u-rev', email:'reviewer@example.com', full_name:'ดร. สมหญิง รักงาน', role:'reviewer', department:'หลักสูตรและการสอน', created_at:'2025-01-10T08:00:00Z' },
  { id:'u-admin', email:'admin@example.com', full_name:'ผศ. ดร. อนุชา บริหาร', role:'system_admin', department:'สำนักงานวิชาการ', created_at:'2025-01-10T08:00:00Z' },
];

export const DEMO_COURSE: Course = {
  id:'c-dt99705', course_code:'DT99705', course_name_th:'เทคโนโลยีดิจิทัลเพื่อการศึกษา', course_name_en:'Digital Technology for Education',
  description:'ศึกษาแนวคิด หลักการ และการประยุกต์ใช้เทคโนโลยีดิจิทัลในการจัดการเรียนการสอน การออกแบบสื่อ การประเมินผล และนวัตกรรมการศึกษา',
  credits:3, level:'ปริญญาโท', faculty:'ครุศาสตร์', department:'เทคโนโลยีการศึกษา', semester:'1', academic_year:'2569', instructor_id:'u-inst', language:'th', status:'active', visibility:'private', created_at:'2025-01-15T08:00:00Z',
};

export const DEMO_CLOS: LearningOutcome[] = [
  { id:'lo-clo1', code:'CLO1', title:'อธิบายหลักการของเทคโนโลยีดิจิทัลเพื่อการศึกษา', description:'ผู้เรียนสามารถอธิบายแนวคิด หลักการ และองค์ประกอบของเทคโนโลยีดิจิทัลที่เกี่ยวข้องกับการศึกษาได้', outcome_type:'CLO', course_id:'c-dt99705', bloom_level:'understand', assessment_method:'แบบทดสอบ', weight:30, status:'active', created_at:'2025-01-15T09:00:00Z' },
  { id:'lo-clo2', code:'CLO2', title:'วิเคราะห์การประยุกต์ใช้เทคโนโลยีดิจิทัลในการเรียนการสอน', description:'ผู้เรียนสามารถวิเคราะห์การประยุกต์ใช้เทคโนโลยีดิจิทัลในสถานการณ์ต่างๆ ได้', outcome_type:'CLO', course_id:'c-dt99705', bloom_level:'analyze', assessment_method:'แบบทดสอบและอัตนัย', weight:40, status:'active', created_at:'2025-01-15T09:00:00Z' },
  { id:'lo-clo3', code:'CLO3', title:'ออกแบบแนวทางใช้เทคโนโลยีดิจิทัลเพื่อแก้ปัญหาการศึกษา', description:'ผู้เรียนสามารถออกแบบแนวทางการใช้เทคโนโลยีดิจิทัลเพื่อแก้ปัญหาทางการศึกษาได้', outcome_type:'CLO', course_id:'c-dt99705', bloom_level:'create', assessment_method:'โครงงาน', weight:30, status:'active', created_at:'2025-01-15T09:00:00Z' },
];

export const DEMO_TOPICS: CourseTopic[] = [
  { id:'t-1', course_id:'c-dt99705', title:'แนวคิดเทคโนโลยีดิจิทัล', week_number:1, sort_order:1 },
  { id:'t-2', course_id:'c-dt99705', title:'สื่อดิจิทัลและการออกแบบการเรียนรู้', week_number:3, sort_order:2 },
  { id:'t-3', course_id:'c-dt99705', title:'แพลตฟอร์มการจัดการเรียนรู้ (LMS)', week_number:5, sort_order:3 },
  { id:'t-4', course_id:'c-dt99705', title:'ปัญญาประดิษฐ์เพื่อการศึกษา', week_number:7, sort_order:4 },
  { id:'t-5', course_id:'c-dt99705', title:'การประเมินผลดิจิทัล', week_number:10, sort_order:5 },
];

export const DEMO_DOCUMENTS: Document[] = [
  { id:'doc-1', course_id:'c-dt99705', file_name:'DT99705_Course_Outline.pdf', file_type:'application/pdf', file_size:2400000, status:'indexed', uploaded_by:'u-inst', created_at:'2025-01-16T10:00:00Z', description:'หลักสูตรรายวิชา' },
  { id:'doc-2', course_id:'c-dt99705', file_name:'Lecture_Notes_Ch1-3.pdf', file_type:'application/pdf', file_size:5800000, status:'indexed', uploaded_by:'u-inst', created_at:'2025-01-18T10:00:00Z', description:'โน้ตบรรยายบทที่ 1-3' },
  { id:'doc-3', course_id:'c-dt99705', file_name:'AI_in_Education_Research.pdf', file_type:'application/pdf', file_size:3200000, status:'indexed', uploaded_by:'u-inst', created_at:'2025-01-20T10:00:00Z', description:'บทความวิจัย AI ในการศึกษา' },
  { id:'doc-4', course_id:'c-dt99705', file_name:'Digital_Assignment_Brief.docx', file_type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', file_size:450000, status:'processing', uploaded_by:'u-inst', created_at:'2025-07-15T10:00:00Z', description:'โจทย์งานที่มอบหมาย' },
];

export const DEMO_BLUEPRINT: TestBlueprint = {
  id:'bp-1', course_id:'c-dt99705', name:'แบบเขียวสอบกลางภาค', exam_type:'midterm', total_questions:20, total_marks:30, duration_minutes:60, language:'th',
  instructions:'ตอบคำถามทุกข้อ ข้อสอบปรนัยเลือกคำตอบที่ถูกต้องที่สุดเพียงข้อเดียว', status:'active', created_at:'2025-02-01T08:00:00Z',
  rows: [
    { id:'br-1', topic:'แนวคิดเทคโนโลยีดิจิทัล', clo_code:'CLO1', bloom:'remember', difficulty:'easy', question_type:'multiple_choice_single', num_questions:3, marks_per_question:1 },
    { id:'br-2', topic:'แนวคิดเทคโนโลยีดิจิทัล', clo_code:'CLO1', bloom:'understand', difficulty:'medium', question_type:'multiple_choice_single', num_questions:2, marks_per_question:1 },
    { id:'br-3', topic:'สื่อดิจิทัลและการออกแบบการเรียนรู้', clo_code:'CLO2', bloom:'understand', difficulty:'easy', question_type:'multiple_choice_single', num_questions:3, marks_per_question:1 },
    { id:'br-4', topic:'สื่อดิจิทัลและการออกแบบการเรียนรู้', clo_code:'CLO2', bloom:'apply', difficulty:'medium', question_type:'multiple_choice_single', num_questions:4, marks_per_question:1 },
    { id:'br-5', topic:'แพลตฟอร์มการจัดการเรียนรู้ (LMS)', clo_code:'CLO2', bloom:'analyze', difficulty:'hard', question_type:'multiple_choice_single', num_questions:3, marks_per_question:1 },
    { id:'br-6', topic:'ปัญญาประดิษฐ์เพื่อการศึกษา', clo_code:'CLO3', bloom:'analyze', difficulty:'medium', question_type:'essay', num_questions:3, marks_per_question:5 },
    { id:'br-7', topic:'การประเมินผลดิจิทัล', clo_code:'CLO3', bloom:'create', difficulty:'advanced', question_type:'essay', num_questions:2, marks_per_question:5 },
  ],
};

export const DEMO_QUESTIONS: Question[] = [
  {
    id:'q-1', course_id:'c-dt99705', question_type:'multiple_choice_single',
    question_text:'ข้อใดเป็นนิยามที่ถูกต้องของ "เทคโนโลยีดิจิทัลเพื่อการศึกษา" ในบริบทของการจัดการเรียนการสอนสมัยใหม่?',
    language:'th', topic:'แนวคิดเทคโนโลยีดิจิทัล',
    choices: [
      { id:'a', text:'การประยุกต์ใช้เทคโนโลยีดิจิทัลอย่างเป็นระบบ โดยคำนึงถึงบริบทผู้เรียนเป็นศูนย์กลาง พร้อมการประเมินผลที่วัดได้', is_correct:true, rationale:'ถูกต้อง ครอบคลุมทั้งหลักการและการประเมินผล' },
      { id:'b', text:'การใช้เทคโนโลยีดิจิทัลตามกระแสนิยมโดยไม่คำนึงถึงความเหมาะสม', is_correct:false, rationale:'ไม่ถูกต้อง เพราะไม่คำนึงถึงความเหมาะสม' },
      { id:'c', text:'การนำเทคโนโลยีดิจิทัลมาใช้เฉพาะเพื่อการประชาสัมพันธ์', is_correct:false, rationale:'ไม่ถูกต้อง เพราะขอบเขตแคบเกินไป' },
      { id:'d', text:'การใช้เทคโนโลยีดิจิทัลเป็นเครื่องมือแทนการสอนของครูทั้งหมด', is_correct:false, rationale:'ไม่ถูกต้อง เพราะครูยังมีบทบาทสำคัญ' },
    ],
    correct_answer:'a', explanation:'คำตอบที่ถูกต้องคือข้อ A เพราะเทคโนโลยีดิจิทัลเพื่อการศึกษาต้องคำนึงถึงผู้เรียนเป็นศูนย์กลาง และต้องมีการประเมินผลที่วัดได้',
    intended_bloom_level:'remember', ai_predicted_bloom_level:'remember', reviewer_confirmed_bloom_level:'remember',
    intended_difficulty:'easy', ai_predicted_difficulty:'easy', reviewer_confirmed_difficulty:'easy',
    marks:1, estimated_answer_time_minutes:1,
    source_references:[{document_id:'doc-1',file_name:'DT99705_Course_Outline.pdf',page:5,section:'แนวคิดเทคโนโลยีดิจิทัล',quote:null}],
    learning_outcome_codes:['CLO1'], quality_flags:[], quality_score:92,
    status:'approved', source_type:'ai_generated', created_by:'u-inst', generated_by_ai:true, ai_model:'gpt-4o',
    approved_by:'u-rev', approved_at:'2025-06-01T10:00:00Z', created_at:'2025-05-28T10:00:00Z', updated_at:'2025-06-01T10:00:00Z',
    used_count:1, first_used_at:'2025-06-10T09:00:00Z', last_used_at:'2025-06-10T09:00:00Z', exposure_level:'low',
  },
  {
    id:'q-2', course_id:'c-dt99705', question_type:'multiple_choice_single',
    question_text:'ข้อใดอธิบายความสัมพันธ์ระหว่าง "สื่อดิจิทัล" กับการเรียนรู้ของผู้เรียนได้ถูกต้องที่สุด?',
    language:'th', topic:'สื่อดิจิทัลและการออกแบบการเรียนรู้',
    choices: [
      { id:'a', text:'สื่อดิจิทัลช่วยส่งเสริมการเรียนรู้ผ่านการโต้ตอบและการแสดงผลหลายรูปแบบ', is_correct:true, rationale:'ถูกต้อง สื่อดิจิทัลเน้นการโต้ตอบ' },
      { id:'b', text:'สื่อดิจิทัลทำให้ผู้เรียนไม่ต้องคิดเอง', is_correct:false, rationale:'ไม่ถูกต้อง' },
      { id:'c', text:'สื่อดิจิทัลใช้แทนครูได้ทั้งหมด', is_correct:false, rationale:'ไม่ถูกต้อง' },
      { id:'d', text:'สื่อดิจิทัลมีประสิทธิภาพเท่ากันทุกชนิด', is_correct:false, rationale:'ไม่ถูกต้อง ขึ้นกับบริบท' },
    ],
    correct_answer:'a', explanation:'สื่อดิจิทัลช่วยส่งเสริมการเรียนรู้ผ่านการโต้ตอบ (interactivity) และการแสดงผลหลายรูปแบบ (multimodal)',
    intended_bloom_level:'understand', ai_predicted_bloom_level:'understand', reviewer_confirmed_bloom_level:null,
    intended_difficulty:'easy', ai_predicted_difficulty:'easy', reviewer_confirmed_difficulty:null,
    marks:1, estimated_answer_time_minutes:1,
    source_references:[{document_id:'doc-2',file_name:'Lecture_Notes_Ch1-3.pdf',page:12,section:'สื่อดิจิทัล',quote:null}],
    learning_outcome_codes:['CLO2'], quality_flags:[], quality_score:88,
    status:'ready_for_review', source_type:'ai_generated', created_by:'u-inst', generated_by_ai:true, ai_model:'gpt-4o',
    created_at:'2025-07-10T10:00:00Z', updated_at:'2025-07-10T10:00:00Z', used_count:0, exposure_level:'new',
  },
  {
    id:'q-3', course_id:'c-dt99705', question_type:'multiple_choice_single',
    question_text:'หากต้องออกแบบกิจกรรมการเรียนรู้โดยใช้ LMS สำหรับนักศึกษาปริญญาโท ขั้นตอนใดจะเหมาะสมที่สุด?',
    language:'th', topic:'แพลตฟอร์มการจัดการเรียนรู้ (LMS)',
    choices: [
      { id:'a', text:'วิเคราะห์ความต้องการ เลือก LMS ออกแบบกิจกรรม ทดสอบ ประเมินผล และปรับปรุง', is_correct:true, rationale:'ถูกต้อง เป็นกระบวนการออกแบบที่เป็นระบบ' },
      { id:'b', text:'เลือก LMS แล้วให้นักศึกษาใช้เอง', is_correct:false, rationale:'ไม่ถูกต้อง ขาดการออกแบบ' },
      { id:'c', text:'ใช้ LMS เฉพาะส่งงาน', is_correct:false, rationale:'ไม่ถูกต้อง ใช้ไม่เต็มศักยภาพ' },
      { id:'d', text:'ซื้อ LMS ราคาแพงที่สุด', is_correct:false, rationale:'ไม่ถูกต้อง ราคาไม่ได้บอกคุณภาพ' },
    ],
    correct_answer:'a', explanation:'การออกแบบกิจกรรมการเรียนรู้ผ่าน LMS ต้องเริ่มจากการวิเคราะห์ความต้องการ ออกแบบ ทดสอบ ประเมิน และปรับปรุง',
    intended_bloom_level:'apply', ai_predicted_bloom_level:'analyze', reviewer_confirmed_bloom_level:null,
    intended_difficulty:'medium', ai_predicted_difficulty:'hard', reviewer_confirmed_difficulty:null,
    marks:1, estimated_answer_time_minutes:2,
    source_references:[{document_id:'doc-2',file_name:'Lecture_Notes_Ch1-3.pdf',page:20,section:'LMS',quote:null}],
    learning_outcome_codes:['CLO2'], quality_flags:['bloom_mismatch'], quality_score:75,
    status:'under_review', source_type:'ai_generated', created_by:'u-inst', generated_by_ai:true, ai_model:'gpt-4o',
    created_at:'2025-07-12T10:00:00Z', updated_at:'2025-07-14T10:00:00Z', used_count:0, exposure_level:'new',
  },
  {
    id:'q-4', course_id:'c-dt99705', question_type:'essay',
    question_text:'วิเคราะห์และประเมินประสิทธิภาพของการใช้ปัญญาประดิษฐ์ในการจัดการเรียนการสอน พร้อมยกตัวอย่างประกอบ',
    language:'th', topic:'ปัญญาประดิษฐ์เพื่อการศึกษา', correct_answer:'',
    explanation:'คำตอบควรครอบคลุมการวิเคราะห์ประโยชน์ ข้อจำกัด จริยธรรม และตัวอย่างการประยุกต์ใช้',
    intended_bloom_level:'evaluate', ai_predicted_bloom_level:'evaluate', reviewer_confirmed_bloom_level:null,
    intended_difficulty:'hard', ai_predicted_difficulty:'hard', reviewer_confirmed_difficulty:null,
    marks:5, estimated_answer_time_minutes:10,
    rubric:{ total_marks:5, criteria:[
      { criterion:'เนื้อหาและความถูกต้อง', description:'ความถูกต้องและความครอบคลุม', max_marks:2, performance_levels:[{level:'ดีเยี่ยม',description:'ครอบคลุม ถูกต้อง',marks_range:'1.7-2'},{level:'ดี',description:'ถูกต้องพอสมควร',marks_range:'1.3-1.69'},{level:'พอใช้',description:'ถูกต้องบางส่วน',marks_range:'0.6-1.29'},{level:'ต้องปรับปรุง',description:'ไม่ถูกต้อง',marks_range:'0-0.59'}] },
      { criterion:'การวิเคราะห์', description:'ความลึกซึ้งของการวิเคราะห์', max_marks:2, performance_levels:[{level:'ดีเยี่ยม',description:'วิเคราะห์ลึกซึ้ง',marks_range:'1.7-2'},{level:'ดี',description:'วิเคราะห์ได้ดี',marks_range:'1.3-1.69'},{level:'พอใช้',description:'วิเคราะห์ได้บางส่วน',marks_range:'0.6-1.29'},{level:'ต้องปรับปรุง',description:'วิเคราะห์ไม่ชัดเจน',marks_range:'0-0.59'}] },
      { criterion:'การนำเสนอ', description:'รูปแบบและภาษา', max_marks:1, performance_levels:[{level:'ดีเยี่ยม',description:'นำเสนอยอดเยี่ยม',marks_range:'0.85-1'},{level:'ดี',description:'นำเสนอดี',marks_range:'0.65-0.84'},{level:'พอใช้',description:'นำเสนอพอใช้',marks_range:'0.3-0.64'},{level:'ต้องปรับปรุง',description:'นำเสนอยากเข้าใจ',marks_range:'0-0.29'}] },
    ]},
    source_references:[{document_id:'doc-3',file_name:'AI_in_Education_Research.pdf',page:8,section:'AI in Education',quote:null}],
    learning_outcome_codes:['CLO3'], quality_flags:[], quality_score:85,
    status:'revision_requested', source_type:'ai_generated', created_by:'u-inst', generated_by_ai:true, ai_model:'gpt-4o',
    created_at:'2025-07-08T10:00:00Z', updated_at:'2025-07-13T10:00:00Z', used_count:0, exposure_level:'new',
  },
  {
    id:'q-5', course_id:'c-dt99705', question_type:'multiple_choice_single',
    question_text:'ข้อใดเป็นปัจจัยสำคัญที่สุดที่ทำให้การใช้เทคโนโลยีดิจิทัลในโรงเรียนประสบความสำเร็จแตกต่างกัน?',
    language:'th', topic:'แนวคิดเทคโนโลยีดิจิทัล',
    choices: [
      { id:'a', text:'การวางแผนและการพัฒนาศักยภาพครูผู้สอนอย่างเป็นระบบ', is_correct:true, rationale:'ถูกต้อง ครูเป็นปัจจัยสำคัญ' },
      { id:'b', text:'งบประมาณที่สูง', is_correct:false, rationale:'ไม่ใช่ปัจจัยหลัก' },
      { id:'c', text:'จำนวนคอมพิวเตอร์', is_correct:false, rationale:'ไม่ใช่ปัจจัยหลัก' },
      { id:'d', text:'ชื่อเสียงของโรงเรียน', is_correct:false, rationale:'ไม่เกี่ยวข้อง' },
    ],
    correct_answer:'a', explanation:'การวางแผนและการพัฒนาศักยภาพครูเป็นปัจจัยสำคัญที่สุด เพราะครูเป็นผู้ขับเคลื่อนการใช้เทคโนโลยี',
    intended_bloom_level:'analyze', ai_predicted_bloom_level:'analyze', reviewer_confirmed_bloom_level:null,
    intended_difficulty:'medium', ai_predicted_difficulty:'medium', reviewer_confirmed_difficulty:null,
    marks:1, estimated_answer_time_minutes:2,
    source_references:[{document_id:'doc-1',file_name:'DT99705_Course_Outline.pdf',page:12,section:'ปัจจัยความสำเร็จ',quote:null}],
    learning_outcome_codes:['CLO1'], quality_flags:[], quality_score:80,
    status:'rejected', source_type:'ai_generated', created_by:'u-inst', generated_by_ai:true, ai_model:'gpt-4o',
    created_at:'2025-07-05T10:00:00Z', updated_at:'2025-07-06T10:00:00Z', used_count:0, exposure_level:'new',
  },
  {
    id:'q-6', course_id:'c-dt99705', question_type:'multiple_choice_single',
    question_text:'การประเมินผลดิจิทัลควรคำนึงถึงข้อใดเป็นสำคัญที่สุด?',
    language:'th', topic:'การประเมินผลดิจิทัล',
    choices: [
      { id:'a', text:'ความตรงตามจุดประสงค์การเรียนรู้และความน่าเชื่อถือของเครื่องมือ', is_correct:true, rationale:'ถูกต้อง ตรงตามหลักการประเมิน' },
      { id:'b', text:'ความสวยงามของแบบทดสอบ', is_correct:false, rationale:'ไม่ใช่ปัจจัยหลัก' },
      { id:'c', text:'ความยาวของข้อสอบ', is_correct:false, rationale:'ไม่ใช่ปัจจัยหลัก' },
      { id:'d', text:'จำนวนผู้เข้าสอบ', is_correct:false, rationale:'ไม่เกี่ยวข้องโดยตรง' },
    ],
    correct_answer:'a', explanation:'การประเมินผลต้องคำนึงถึงความตรง (validity) และความน่าเชื่อถือ (reliability) เป็นสำคัญ',
    intended_bloom_level:'evaluate', ai_predicted_bloom_level:'evaluate', reviewer_confirmed_bloom_level:'evaluate',
    intended_difficulty:'medium', ai_predicted_difficulty:'medium', reviewer_confirmed_difficulty:'medium',
    marks:1, estimated_answer_time_minutes:2,
    source_references:[{document_id:'doc-2',file_name:'Lecture_Notes_Ch1-3.pdf',page:28,section:'การประเมินผล',quote:null}],
    learning_outcome_codes:['CLO3'], quality_flags:[], quality_score:90,
    status:'approved', source_type:'ai_generated', created_by:'u-inst', generated_by_ai:true, ai_model:'gpt-4o',
    approved_by:'u-rev', approved_at:'2025-06-15T10:00:00Z', created_at:'2025-06-01T10:00:00Z', updated_at:'2025-06-15T10:00:00Z',
    used_count:0, exposure_level:'new',
  },
  {
    id:'q-7', course_id:'c-dt99705', question_type:'multiple_choice_single',
    question_text:'ข้อใดเป็นหลักการสำคัญในการออกแบบสื่อการสอนดิจิทัลที่ส่งเสริมการเรียนรู้?',
    language:'th', topic:'สื่อดิจิทัลและการออกแบบการเรียนรู้',
    choices: [
      { id:'a', text:'การออกแบบโดยคำนึงถึงผู้เรียนเป็นศูนย์กลางและส่งเสริมการโต้ตอบ', is_correct:true, rationale:'ถูกต้อง เป็นหลักการสำคัญ' },
      { id:'b', text:'การใช้สีสันสดใสเป็นหลัก', is_correct:false, rationale:'ไม่ใช่หลักการ' },
      { id:'c', text:'การใส่ข้อมูลให้มากที่สุด', is_correct:false, rationale:'ทำให้ผู้เรียนเครียด' },
      { id:'d', text:'การคัดลอกสื่อที่มีอยู่', is_correct:false, rationale:'ไม่สร้างสรรค์' },
    ],
    correct_answer:'a', explanation:'การออกแบบสื่อการสอนดิจิทัลต้องคำนึงถึงผู้เรียนเป็นศูนย์กลาง (learner-centered) และส่งเสริมการโต้ตอบ (interactivity)',
    intended_bloom_level:'apply', ai_predicted_bloom_level:'apply', reviewer_confirmed_bloom_level:null,
    intended_difficulty:'medium', ai_predicted_difficulty:'medium', reviewer_confirmed_difficulty:null,
    marks:1, estimated_answer_time_minutes:2,
    source_references:[{document_id:'doc-2',file_name:'Lecture_Notes_Ch1-3.pdf',page:15,section:'การออกแบบสื่อ',quote:null}],
    learning_outcome_codes:['CLO2'], quality_flags:[], quality_score:87,
    status:'draft', source_type:'ai_generated', created_by:'u-inst', generated_by_ai:true, ai_model:'gpt-4o',
    created_at:'2025-07-16T10:00:00Z', updated_at:'2025-07-16T10:00:00Z', used_count:0, exposure_level:'new',
  },
  {
    id:'q-8', course_id:'c-dt99705', question_type:'essay',
    question_text:'ออกแบบแนวทางการใช้เทคโนโลยีดิจิทัลเพื่อแก้ปัญหาการเรียนรู้ของผู้เรียนที่มีความแตกต่างรายบุคคล โดยอธิบายหลักการ วิธีการ และประเมินผลลัพธ์ที่คาดว่าจะเกิดขึ้น',
    language:'th', topic:'การประเมินผลดิจิทัล', correct_answer:'',
    explanation:'คำตอบควรครอบคลุมหลักการ การประยุกต์ใช้ และการประเมินผล พร้อมยกตัวอย่าง',
    intended_bloom_level:'create', ai_predicted_bloom_level:'create', reviewer_confirmed_bloom_level:null,
    intended_difficulty:'advanced', ai_predicted_difficulty:'advanced', reviewer_confirmed_difficulty:null,
    marks:5, estimated_answer_time_minutes:15,
    rubric:{ total_marks:5, criteria:[
      { criterion:'เนื้อหา', description:'ความครอบคลุม', max_marks:2, performance_levels:[{level:'ดีเยี่ยม',description:'ครอบคลุม',marks_range:'1.7-2'},{level:'ดี',description:'ครอบคลุมพอสมควร',marks_range:'1.3-1.69'},{level:'พอใช้',description:'ครอบคลุมบางส่วน',marks_range:'0.6-1.29'},{level:'ต้องปรับปรุง',description:'ไม่ครอบคลุม',marks_range:'0-0.59'}] },
      { criterion:'ความคิดสร้างสรรค์', description:'ความใหม่ของแนวทาง', max_marks:2, performance_levels:[{level:'ดีเยี่ยม',description:'สร้างสรรค์มาก',marks_range:'1.7-2'},{level:'ดี',description:'สร้างสรรค์พอสมควร',marks_range:'1.3-1.69'},{level:'พอใช้',description:'สร้างสรรค์น้อย',marks_range:'0.6-1.29'},{level:'ต้องปรับปรุง',description:'ขาดความสร้างสรรค์',marks_range:'0-0.59'}] },
      { criterion:'การประเมินผล', description:'การวางแผนประเมินผล', max_marks:1, performance_levels:[{level:'ดีเยี่ยม',description:'ประเมินครบถ้วน',marks_range:'0.85-1'},{level:'ดี',description:'ประเมินพอสมควร',marks_range:'0.65-0.84'},{level:'พอใช้',description:'ประเมินบางส่วน',marks_range:'0.3-0.64'},{level:'ต้องปรับปรุง',description:'ขาดการประเมิน',marks_range:'0-0.29'}] },
    ]},
    source_references:[{document_id:'doc-3',file_name:'AI_in_Education_Research.pdf',page:20,section:'Personalized Learning',quote:null}],
    learning_outcome_codes:['CLO3'], quality_flags:[], quality_score:83,
    status:'ready_for_review', source_type:'ai_generated', created_by:'u-inst', generated_by_ai:true, ai_model:'gpt-4o',
    created_at:'2025-07-14T10:00:00Z', updated_at:'2025-07-14T10:00:00Z', used_count:0, exposure_level:'new',
  },
];

export const DEMO_EXAM: Exam = {
  id:'ex-1', course_id:'c-dt99705', name:'ข้อสอบสอบกลางภาค ภาคเรียนที่ 1/2569', exam_type:'midterm', academic_year:'2569', semester:'1', exam_date:'2025-07-20',
  duration_minutes:60, total_marks:7, instructions:'ตอบคำถามทุกข้อ ข้อสอบปรนัยเลือกคำตอบที่ถูกต้องที่สุดเพียงข้อเดียว',
  questions:[
    {question_id:'q-1',order:1,marks:1},{question_id:'q-6',order:2,marks:1},{question_id:'q-7',order:3,marks:1},
    {question_id:'q-2',order:4,marks:1},{question_id:'q-3',order:5,marks:1},{question_id:'q-4',order:6,marks:1},{question_id:'q-8',order:7,marks:1},
  ],
  versions:[{version_label:'A',questions:[{question_id:'q-1',order:1,marks:1},{question_id:'q-6',order:2,marks:1},{question_id:'q-7',order:3,marks:1},{question_id:'q-2',order:4,marks:1},{question_id:'q-3',order:5,marks:1},{question_id:'q-4',order:6,marks:1},{question_id:'q-8',order:7,marks:1}],shuffle_questions:false,shuffle_choices:false}],
  status:'draft', created_at:'2025-07-15T10:00:00Z',
};

export const DEMO_REVIEWS: QuestionReview[] = [
  { id:'r-1', question_id:'q-1', reviewer_id:'u-rev', reviewer_name:'ดร. สมหญิง รักงาน', decision:'approved', comment:'ข้อสอบชัดเจน คำตอบถูกต้อง สอดคล้องกับ CLO1', confirmed_bloom:'remember', confirmed_difficulty:'easy', created_at:'2025-06-01T10:00:00Z' },
  { id:'r-2', question_id:'q-4', reviewer_id:'u-rev', reviewer_name:'ดร. สมหญิง รักงาน', decision:'revision_requested', comment:'ควรเพิ่มข้อกำหนดความยาวของคำตอบและระบุตัวอย่างประกอบให้ชัดเจนขึ้น', confirmed_bloom:'evaluate', confirmed_difficulty:'hard', created_at:'2025-07-13T10:00:00Z' },
  { id:'r-3', question_id:'q-5', reviewer_id:'u-rev', reviewer_name:'ดร. สมหญิง รักงาน', decision:'rejected', comment:'ตัวเลือกไม่มีความท้าทาย และไม่สะท้อนการวิเคราะห์ระดับสูง', confirmed_bloom:null, confirmed_difficulty:null, created_at:'2025-07-06T10:00:00Z' },
];

export const DEMO_NOTIFICATIONS: Notification[] = [
  { id:'n-1', user_id:'u-inst', type:'generation_completed', title:'สร้างข้อสอบเสร็จสิ้น', message:'AI สร้างข้อสอบเสร็จสิ้น 5 ข้อ พร้อมตรวจสอบ', link:'/generation-jobs', read:false, created_at:'2025-07-16T10:05:00Z' },
  { id:'n-2', user_id:'u-inst', type:'review_requested', title:'ต้องการการตรวจสอบ', message:'มีข้อสอบ 3 ข้อรอตรวจ', link:'/review', read:false, created_at:'2025-07-14T10:00:00Z' },
  { id:'n-3', user_id:'u-inst', type:'revision_requested', title:'ต้องแก้ไขข้อสอบ', message:'ดร. สมหญิง ขอแก้ไขข้อสอบ Q4', link:'/questions/q-4', read:true, created_at:'2025-07-13T10:00:00Z' },
];

export const DEMO_USAGE_LOGS: AIUsageLog[] = [
  { id:'u-1', user_id:'u-inst', course_id:'c-dt99705', provider:'openai', model:'gpt-4o', request_type:'question_generation', input_tokens:3500, output_tokens:4200, estimated_cost_usd:0.12, latency_ms:4500, status:'success', created_at:'2025-07-16T10:00:00Z' },
  { id:'u-2', user_id:'u-inst', course_id:'c-dt99705', provider:'openai', model:'gpt-4o', request_type:'question_generation', input_tokens:3200, output_tokens:3800, estimated_cost_usd:0.10, latency_ms:3800, status:'success', created_at:'2025-07-14T10:00:00Z' },
  { id:'u-3', user_id:'u-inst', course_id:'c-dt99705', provider:'openai', model:'gpt-4o-mini', request_type:'quality_analysis', input_tokens:1200, output_tokens:800, estimated_cost_usd:0.01, latency_ms:1200, status:'success', created_at:'2025-07-14T10:05:00Z' },
];

export const DEMO_AUDIT_LOGS: AuditLog[] = [
  { id:'a-1', user_id:'u-inst', user_name:'ดร. สมชาย ใจดี', action:'course_created', entity_type:'course', entity_id:'c-dt99705', details:'สร้างรายวิชา DT99705', created_at:'2025-01-15T08:00:00Z' },
  { id:'a-2', user_id:'u-inst', user_name:'ดร. สมชาย ใจดี', action:'document_uploaded', entity_type:'document', entity_id:'doc-1', details:'อัปโหลด DT99705_Course_Outline.pdf', created_at:'2025-01-16T10:00:00Z' },
  { id:'a-3', user_id:'u-inst', user_name:'ดร. สมชาย ใจดี', action:'blueprint_published', entity_type:'blueprint', entity_id:'bp-1', details:'เผยแพร่แบบเขียวสอบกลางภาค', created_at:'2025-02-01T08:00:00Z' },
  { id:'a-4', user_id:'u-inst', user_name:'ดร. สมชาย ใจดี', action:'ai_generation_started', entity_type:'generation_job', entity_id:'job-1', details:'เริ่มสร้างข้อสอบ 5 ข้อ', created_at:'2025-07-16T10:00:00Z' },
];

export const DEMO_GEN_JOB: GenerationJob = {
  id:'job-1', course_id:'c-dt99705', blueprint_id:'bp-1', document_ids:['doc-1','doc-2'], learning_outcome_ids:['lo-clo1','lo-clo2'],
  question_type:'multiple_choice_single', bloom_level:'apply', difficulty:'medium', number_of_questions:5, language:'th', marks_per_question:1,
  include_explanation:true, include_rubric:false, status:'completed', generated_count:5, failed_count:0, total_questions:5,
  input_tokens:3500, output_tokens:4200, estimated_cost_usd:0.12, model:'gpt-4o', created_by:'u-inst', created_at:'2025-07-16T10:00:00Z', completed_at:'2025-07-16T10:05:00Z',
};

class DemoStore {
  profiles: Profile[] = [...DEMO_PROFILES];
  courses: Course[] = [DEMO_COURSE];
  learningOutcomes: LearningOutcome[] = [...DEMO_CLOS];
  topics: CourseTopic[] = [...DEMO_TOPICS];
  documents: Document[] = [...DEMO_DOCUMENTS];
  blueprints: TestBlueprint[] = [DEMO_BLUEPRINT];
  questions: Question[] = [...DEMO_QUESTIONS];
  exams: Exam[] = [DEMO_EXAM];
  reviews: QuestionReview[] = [...DEMO_REVIEWS];
  notifications: Notification[] = [...DEMO_NOTIFICATIONS];
  usageLogs: AIUsageLog[] = [...DEMO_USAGE_LOGS];
  auditLogs: AuditLog[] = [...DEMO_AUDIT_LOGS];
  generationJobs: GenerationJob[] = [DEMO_GEN_JOB];
  reset() {
    this.profiles=[...DEMO_PROFILES]; this.courses=[DEMO_COURSE]; this.learningOutcomes=[...DEMO_CLOS]; this.topics=[...DEMO_TOPICS];
    this.documents=[...DEMO_DOCUMENTS]; this.blueprints=[DEMO_BLUEPRINT]; this.questions=[...DEMO_QUESTIONS]; this.exams=[DEMO_EXAM];
    this.reviews=[...DEMO_REVIEWS]; this.notifications=[...DEMO_NOTIFICATIONS]; this.usageLogs=[...DEMO_USAGE_LOGS]; this.auditLogs=[...DEMO_AUDIT_LOGS];
    this.generationJobs=[DEMO_GEN_JOB];
  }
}

export const demoStore = new DemoStore();
