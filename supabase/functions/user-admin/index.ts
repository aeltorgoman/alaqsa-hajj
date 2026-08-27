// ============================================================
// user-admin — المنفذ الوحيد لإدارة المستخدمين
// ============================================================
// س٢ / §١٠ من S2 Implementation Design v1.1 (الخيار أ معتمد).
//
// كل مستخدم جديد يُنشأ في auth.users وله صفّ مقابل في
// user_profiles. لا نظامَي هوية متوازيين، ولا طبقة توافق، ولا
// مصادقة قديمة. create_user و update_user لا تُستدعيان من
// الواجهة بعد اليوم (حذفهما من القاعدة في س٥).
//
// ⚠️ النمط الثلاثي المُلزِم — Security Architecture v1.2 §٧.٢:
//   verify_jwt = true          يمنع الطلبات بلا ترويسة
//   getUser(jwt) هنا           يمنع مفتاح anon (وهو JWT صالح!)
//   has_permission بالخادم     يمنع غير المخوّل
// الثلاثة معاً. أيّ اثنين منها لا يكفيان.
//
// ⚠️ س٨ — الفاعل المفوَّض (Security Architecture v1.6 §١٠.١):
// كتابات user_profiles تمرّ بدوال قاعدة `service_role` وحدها،
// تضبط الفاعل وتكتب **في المعاملة نفسها**. والسبب بنيويّ لا
// تفضيليّ: كل طلب PostgREST معاملةٌ مستقلّة، فـGUC مضبوط في
// استدعاء لا يعيش إلى الذي يليه — أي أن ضبط الفاعل باستدعاء
// منفصل **لا يعمل**، لا أنه أقلّ أناقة.
//
// و`p_actor` مصدره **`callerId` المُثبَت من JWT** أعلاه، ولا
// يُقرأ من جسد الطلب بحال. وحقلٌ باسم `actor` في الجسم مُهمَل.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const REQUIRED_PERMISSION = "manage_users";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
const fail = (status: number, message: string) => json(status, { error: message });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail(405, "الطريقة غير مدعومة.");

  let body: {
    action?: string;
    id?: string;
    email?: string;
    password?: string;
    name?: string;
    permissions?: Record<string, boolean>;
    is_active?: boolean;
  };
  try { body = await req.json(); } catch { return fail(400, "طلب غير صالح."); }

  const { action } = body;
  if (action !== "create" && action !== "update" && action !== "delete") {
    return fail(400, "عملية غير معروفة.");
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  /* ١) الهوية — من الرمز لا من الجسم. مفتاح anon يجتاز verify_jwt
     لأنه JWT صالح، فهذا الفحص هو ما يميّز مستخدماً حقيقياً. */
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return fail(401, "غير مصرّح.");

  const { data: caller, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !caller?.user) return fail(401, "غير مصرّح.");
  const callerId = caller.user.id;

  /* ٢) الصلاحية — تُقرأ من user_profiles على الخادم، لا مما يرسله
     المتصفح. وهي نفسها has_permission منطقاً: الملفّ + is_active. */
  const { data: callerProfile } = await admin
    .from("user_profiles").select("is_active, permissions").eq("id", callerId).maybeSingle();

  const perms = (callerProfile?.permissions ?? {}) as Record<string, boolean>;
  if (!callerProfile || callerProfile.is_active !== true || !perms[REQUIRED_PERMISSION]) {
    return fail(403, "لا تملك صلاحية إدارة المستخدمين.");
  }

  /* ٣) حرّاس منع القفل الذاتي — على الخادم لا على الأزرار.
     صفحة الإعدادات محجوبة خلف manage_users، فمن ينزعها عن نفسه أو
     يعطّل حسابه أو يحذفه يفقد الوصول نهائياً بلا وسيلة استعادة. */
  const targetsSelf = body.id === callerId;
  if (action === "delete" && targetsSelf) return fail(400, "لا يمكنك حذف حسابك الحالي.");
  if (action === "update" && targetsSelf) {
    if (body.is_active === false) return fail(400, "لا يمكنك تعطيل حسابك الحالي.");
    if (body.permissions && body.permissions[REQUIRED_PERMISSION] !== true) {
      return fail(400, "لا يمكنك سحب صلاحية إدارة المستخدمين من حسابك.");
    }
  }

  // ── إنشاء ────────────────────────────────────────────────────
  if (action === "create") {
    const email = (body.email ?? "").trim().toLowerCase();
    const name = (body.name ?? "").trim();
    if (!EMAIL_RE.test(email)) return fail(400, "معرّف الدخول يجب أن يكون بصيغة بريد صحيحة.");
    if (!name) return fail(400, "الاسم مطلوب.");
    if (!body.password || body.password.length < 8) return fail(400, "كلمة المرور ثمانية محارف فأكثر.");

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: body.password,
      email_confirm: true, // البريد Login ID لا قناة اتصال — لا رسائل تأكيد
    });
    if (createErr || !created?.user) {
      return fail(400, createErr?.message || "تعذّر إنشاء الحساب.");
    }

    const { error: profErr } = await admin.rpc("admin_write_user_profile", {
      p_actor: callerId,
      p_mode: "insert",
      p_id: created.user.id,
      p_email: email,
      p_name: name,
      p_permissions: body.permissions ?? {},
      p_is_active: body.is_active ?? true,
    });

    /* لا يبقى حساب بلا ملفّ: فشل الملفّ يُلغي الحساب المُنشأ.
       المتطلَّب ٢ من §١٠ — كل مستخدم له صفّ مقابل. */
    if (profErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      return fail(400, `تعذّر إنشاء ملفّ المستخدم: ${profErr.message}`);
    }
    return json(200, { id: created.user.id, email });
  }

  // ── تعديل ────────────────────────────────────────────────────
  if (action === "update") {
    const id = body.id;
    if (!id) return fail(400, "معرّف المستخدم مطلوب.");

    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = body.name.trim();
    if (body.permissions !== undefined) patch.permissions = body.permissions;
    if (body.is_active !== undefined) patch.is_active = body.is_active;

    /* البريد وكلمة المرور يعيشان في auth.users — تُحدَّث هناك أولاً،
       فإن فشلت لا يتغيّر الملفّ ولا ينشأ تعارض بين النظامين. */
    const authPatch: { email?: string; password?: string } = {};
    if (body.email !== undefined) {
      const email = body.email.trim().toLowerCase();
      if (!EMAIL_RE.test(email)) return fail(400, "معرّف الدخول يجب أن يكون بصيغة بريد صحيحة.");
      authPatch.email = email;
      patch.email = email;
    }
    if (body.password) {
      if (body.password.length < 8) return fail(400, "كلمة المرور ثمانية محارف فأكثر.");
      authPatch.password = body.password;
    }

    if (Object.keys(authPatch).length > 0) {
      const { error } = await admin.auth.admin.updateUserById(id, authPatch);
      if (error) return fail(400, error.message || "تعذّر تحديث بيانات الدخول.");
    }

    /* `null` = «لم يُرسَل» فلا يُمسّ — والدالة تطبّق coalesce.
       و`updated_at` تضبطه الدالة، فلا يأتي وقتٌ من العميل. */
    if (Object.keys(patch).length > 0) {
      const { error } = await admin.rpc("admin_write_user_profile", {
        p_actor: callerId,
        p_mode: "update",
        p_id: id,
        p_email: (patch.email as string | undefined) ?? null,
        p_name: (patch.name as string | undefined) ?? null,
        p_permissions: (patch.permissions as Record<string, boolean> | undefined) ?? null,
        p_is_active: (patch.is_active as boolean | undefined) ?? null,
      });
      if (error) return fail(400, error.message || "تعذّر تحديث الملفّ.");
    }
    return json(200, { ok: true });
  }

  // ── حذف ──────────────────────────────────────────────────────
  const id = body.id;
  if (!id) return fail(400, "معرّف المستخدم مطلوب.");
  /* الملفّ يُحذف أولاً **بفاعلٍ مُثبَت**، ثم الحساب. ولولا ذلك
     لسقط الملفّ بـ`ON DELETE CASCADE` من داخل GoTrue — أي بفاعلٍ
     فارغ، وهو أسوأ سؤالٍ يُترك بلا جواب: «من حذف هذا المستخدم؟».
     والترتيب آمن في الاتجاه الصحيح: بلا ملفّ، `has_permission()`
     تُرجع false — فالوصول يسقط أولاً ثم الحساب. */
  const { error: profErr } = await admin.rpc("admin_delete_user_profile", {
    p_actor: callerId,
    p_id: id,
  });
  if (profErr) return fail(400, profErr.message || "تعذّر حذف ملفّ المستخدم.");

  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) {
    console.error("سقط ملفّ المستخدم وتعذّر حذف الحساب", error);
    return fail(400, "حُذف ملفّ المستخدم وسقطت صلاحياته، وتعذّر حذف الحساب نفسه. أعد المحاولة.");
  }
  return json(200, { ok: true });
});
