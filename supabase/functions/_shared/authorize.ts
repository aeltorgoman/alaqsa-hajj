// ============================================================
// _shared/authorize — طبقة التفويض الوحيدة لكل Edge Function
// ============================================================
// قاعدة هندسية مُلزِمة: لا دالة Edge تكتب منطق تفويض بنفسها.
// كل دالة محميّة تستدعي authorize() من هنا. أي دالة جديدة تعيد
// استعمال هذه الطبقة ولا تكرّر فحص الصلاحيات.
//
// ⚠️ النمط الثلاثي — Security Architecture v1.3 §٧.٢:
//   (١) verify_jwt = true        إعداد النشر — يمنع الطلبات بلا ترويسة
//   (٢) getUser(jwt)             هنا — يمنع مفتاح anon (وهو JWT صالح!)
//   (٣) has_permission(p_key)    هنا — يمنع المستخدم غير المخوّل
// الثلاثة معاً. أيّ اثنين منها لا يكفيان.
//
// لماذا has_permission بعميل يحمل هوية المستدعي لا بمفتاح الخدمة:
// §٥.٢ تجعل الدالة نقطة التفويض الوحيدة في النظام، وهي تقرأ
// auth.uid(). ومفتاح الخدمة يجعلها فارغة فتُرجع false دائماً.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { fail } from "./http.ts";

export type AuthorizeResult =
  /* admin: عميل بمفتاح الخدمة لتنفيذ ما بعد التفويض — لا لفحصه */
  | { ok: true; admin: SupabaseClient; userId: string }
  | { ok: false; response: Response };

export async function authorize(req: Request, permission: string): Promise<AuthorizeResult> {
  const url = Deno.env.get("SUPABASE_URL")!;

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, response: fail(req, 401, "غير مصرّح.") };

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  /* (٢) الهوية — من الرمز لا من جسم الطلب */
  const { data: caller, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !caller?.user) return { ok: false, response: fail(req, 401, "غير مصرّح.") };

  /* (٣) الصلاحية — بهوية المستدعي نفسه، ومن مصدر واحد */
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: allowed, error: permErr } = await asUser.rpc("has_permission", { p_key: permission });
  if (permErr) {
    console.error("تعذّر فحص الصلاحية", permErr);
    return { ok: false, response: fail(req, 500, "تعذّر التحقق من الصلاحية.") };
  }
  /* الرفض هو الافتراض: أي قيمة غير true رفض */
  if (allowed !== true) return { ok: false, response: fail(req, 403, "لا تملك الصلاحية المطلوبة.") };

  return { ok: true, admin, userId: caller.user.id };
}
