import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const DEMO_USERS = [
  { email: "instructor@example.com", password: "demo1234", fullName: "ดร. สมชาย ใจดี", role: "instructor", department: "เทคโนโลยีการศึกษา" },
  { email: "reviewer@example.com", password: "demo1234", fullName: "ดร. สมหญิง รักงาน", role: "reviewer", department: "หลักสูตรและการสอน" },
  { email: "academic@example.com", password: "demo1234", fullName: "รศ. ดร. วิชัย วิชาการ", role: "academic_admin", department: "สำนักงานวิชาการ" },
  { email: "admin@example.com", password: "demo1234", fullName: "ผศ. ดร. อนุชา บริหาร", role: "system_admin", department: "สำนักงานวิชาการ" },
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const results: Array<{ email: string; status: string; error?: string }> = [];

  for (const u of DEMO_USERS) {
    try {
      const { data: existing } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const found = existing?.users?.find((x: any) => x.email === u.email);

      if (found) {
        const { error: updErr } = await supabase.auth.admin.updateUserById(found.id, {
          password: u.password, email_confirm: true,
          user_metadata: { full_name: u.fullName, role: u.role, department: u.department },
        });
        results.push({ email: u.email, status: updErr ? `update_failed: ${updErr.message}` : "updated" });
      } else {
        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email: u.email, password: u.password, email_confirm: true,
          user_metadata: { full_name: u.fullName, role: u.role, department: u.department },
        });
        results.push({ email: u.email, status: createErr ? `create_failed: ${createErr.message}` : "created" });
      }
    } catch (e) {
      results.push({ email: u.email, status: `exception: ${String(e)}` });
    }
  }

  for (const u of DEMO_USERS) {
    try {
      const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const user = list?.users?.find((x: any) => x.email === u.email);
      if (!user) continue;
      await supabase.from("profiles").upsert({ id: user.id, email: u.email, full_name: u.fullName, role: u.role, department: u.department, avatar_url: null }, { onConflict: "id" });
    } catch (e) {
      results.push({ email: u.email, status: `profile_upsert_exception: ${String(e)}` });
    }
  }

  return new Response(JSON.stringify({ success: true, results }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
