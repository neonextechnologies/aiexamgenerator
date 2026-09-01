import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { handleOptions, jsonResponse, requireSeedSecret } from "../_shared/auth.ts";

const DEMO_USERS = [
  { email: "instructor@example.com", password: "demo1234", fullName: "ดร. สมชาย ใจดี", role: "instructor", department: "เทคโนโลยีการศึกษา" },
  { email: "reviewer@example.com", password: "demo1234", fullName: "ดร. สมหญิง รักงาน", role: "reviewer", department: "หลักสูตรและการสอน" },
  { email: "academic@example.com", password: "demo1234", fullName: "รศ. ดร. วิชัย วิชาการ", role: "academic_admin", department: "สำนักงานวิชาการ" },
  { email: "admin@example.com", password: "demo1234", fullName: "ผศ. ดร. อนุชา บริหาร", role: "system_admin", department: "สำนักงานวิชาการ" },
];

Deno.serve(async (req: Request) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  const forbidden = requireSeedSecret(req);
  if (forbidden) return forbidden;

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const results: Array<{ email: string; status: string }> = [];
  const userIds: Record<string, string> = {};

  for (const u of DEMO_USERS) {
    try {
      const { data: existing } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const found = existing?.users?.find((x: { email?: string }) => x.email === u.email);

      if (found) {
        const { error: updErr } = await supabase.auth.admin.updateUserById(found.id, {
          password: u.password,
          email_confirm: true,
          user_metadata: { full_name: u.fullName, role: u.role, department: u.department },
        });
        userIds[u.email] = found.id;
        results.push({ email: u.email, status: updErr ? `update_failed: ${updErr.message}` : "updated" });
      } else {
        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email: u.email,
          password: u.password,
          email_confirm: true,
          user_metadata: { full_name: u.fullName, role: u.role, department: u.department },
        });
        if (created?.user?.id) userIds[u.email] = created.user.id;
        results.push({ email: u.email, status: createErr ? `create_failed: ${createErr.message}` : "created" });
      }
    } catch (e) {
      results.push({ email: u.email, status: `exception: ${String(e)}` });
    }
  }

  for (const u of DEMO_USERS) {
    try {
      const id = userIds[u.email];
      if (!id) continue;
      await supabase.from("profiles").upsert({
        id,
        email: u.email,
        full_name: u.fullName,
        role: u.role,
        department: u.department,
        avatar_url: null,
      }, { onConflict: "id" });
    } catch (e) {
      results.push({ email: u.email, status: `profile_upsert_exception: ${String(e)}` });
    }
  }

  // Seed sample course owned by instructor (idempotent)
  const instructorId = userIds["instructor@example.com"];
  if (instructorId) {
    await supabase.from("courses").upsert({
      id: "c-dt99705",
      course_code: "DT99705",
      course_name_th: "เทคโนโลยีดิจิทัลเพื่อการศึกษา",
      course_name_en: "Digital Technology for Education",
      description: "ศึกษาแนวคิด หลักการ และการประยุกต์ใช้เทคโนโลยีดิจิทัลในการจัดการเรียนการสอน",
      credits: 3,
      level: "ปริญญาโท",
      faculty: "ครุศาสตร์",
      department: "เทคโนโลยีการศึกษา",
      semester: "1",
      academic_year: "2569",
      instructor_id: instructorId,
      language: "th",
      status: "active",
      visibility: "private",
    }, { onConflict: "id" });

    const clos = [
      { id: "lo-clo1", code: "CLO1", title: "อธิบายหลักการของเทคโนโลยีดิจิทัลเพื่อการศึกษา", bloom_level: "understand", weight: 30 },
      { id: "lo-clo2", code: "CLO2", title: "วิเคราะห์การประยุกต์ใช้เทคโนโลยีดิจิทัลในการเรียนการสอน", bloom_level: "analyze", weight: 40 },
      { id: "lo-clo3", code: "CLO3", title: "ออกแบบแนวทางใช้เทคโนโลยีดิจิทัลเพื่อแก้ปัญหาการศึกษา", bloom_level: "create", weight: 30 },
    ];
    for (const clo of clos) {
      await supabase.from("learning_outcomes").upsert({
        ...clo,
        description: clo.title,
        outcome_type: "CLO",
        course_id: "c-dt99705",
        status: "active",
      }, { onConflict: "id" });
    }

    await supabase.from("test_blueprints").upsert({
      id: "bp-1",
      course_id: "c-dt99705",
      name: "แบบเขียวสอบกลางภาค",
      exam_type: "midterm",
      total_questions: 20,
      total_marks: 30,
      duration_minutes: 60,
      language: "th",
      instructions: "ตอบคำถามทุกข้อ",
      status: "active",
      rows: [
        { id: "br-1", topic: "แนวคิดเทคโนโลยีดิจิทัล", clo_code: "CLO1", bloom: "remember", difficulty: "easy", question_type: "multiple_choice_single", num_questions: 3, marks_per_question: 1 },
        { id: "br-2", topic: "สื่อดิจิทัล", clo_code: "CLO2", bloom: "apply", difficulty: "medium", question_type: "multiple_choice_single", num_questions: 4, marks_per_question: 1 },
      ],
    }, { onConflict: "id" });
  }

  return jsonResponse({ success: true, results, instructorId: instructorId || null });
});
