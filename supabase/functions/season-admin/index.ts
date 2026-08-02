// ============================================================
// season-admin — المنفذ الوحيد للعمليات الإدارية على المواسم
// ============================================================
// close_season() و delete_season() محجوبتان عن anon و authenticated
// منذ م١، والتطبيق لا يحمل غير مفتاح anon. فهذه الدالة هي الجسر:
// تتحقق من هوية المستخدم وصلاحيته، ثم تستدعي الـ RPC بمفتاح الخدمة
// الذي لا يغادر الخادم إطلاقاً.
//
// المبدأ المعتمد: أي عملية تغيّر حالة الموسم أو تمسّ عدة جداول أو
// تُعدّ إدارية خطيرة لا تُنفَّذ من المتصفح مباشرة.
//
// ⚠️ حدّ معروف: المصادقة في هذا النظام مخصّصة ولا تُصدر رمز جلسة،
// فالتحقق هنا يتمّ بإعادة إدخال كلمة المرور عند كل عملية. هذا حلّ
// مرحليّ مقصود لهذه العمليات وحدها، ويُستبدل عند إعادة تصميم
// المصادقة (رمز موقَّع أو Supabase Auth).
//
// الأعمال الثلاثة:
//   verify  — يتحقق ويعود بلا تنفيذ. خطوة الهوية في معالج الإقفال.
//   close   — close_season()
//   delete  — delete_season()
//
// verify_jwt = false عن قصد: الدالة تنفّذ مصادقتها بنفسها أدناه،
// ولا يوجد JWT في هذا النظام لتتحقق منه البوابة.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* الصلاحية التي تحرس صفحة إدارة المواسم في NAV — نفسها تحرس
   العمليات، فلا تتفارق الواجهة عن الخادم */
const REQUIRED_PERMISSION = "view_archive";

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
    username?: string;
    password?: string;
    newSeasonName?: string;
    seasonId?: number;
  };
  try {
    body = await req.json();
  } catch {
    return fail(400, "طلب غير صالح.");
  }

  const { action, username, password } = body;
  if (!username || !password) return fail(400, "اسم المستخدم وكلمة المرور مطلوبان.");
  if (action !== "verify" && action !== "close" && action !== "delete") {
    return fail(400, "عملية غير معروفة.");
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  /* ١) الهوية — بنفس الدالة التي يستعملها تسجيل الدخول، فلا يوجد
     منطق تحقّق ثانٍ يتفارق عن الأول */
  const { data: users, error: verifyErr } = await admin.rpc("verify_user", {
    p_username: username,
    p_password: password,
  });
  if (verifyErr) {
    console.error("تعذر التحقق من المستخدم", verifyErr);
    return fail(500, "تعذّر التحقق، يرجى المحاولة مرة أخرى.");
  }

  const user = Array.isArray(users) ? users[0] : null;
  /* رسالة واحدة للاسم الخاطئ ولكلمة المرور الخاطئة — لا نكشف أيّهما */
  if (!user) return fail(401, "كلمة المرور غير صحيحة.");

  /* ٢) الصلاحية — تُقرأ من الصفّ العائد من القاعدة، لا مما يرسله
     المتصفح. هذا هو الفرق بين تحقّق حقيقي وتحقّق شكليّ. */
  const perms = (user.permissions ?? {}) as Record<string, boolean>;
  if (!perms[REQUIRED_PERMISSION]) return fail(403, "لا تملك صلاحية إدارة المواسم.");

  /* ٣) التنفيذ */

  /* verify يقف هنا عن قصد: خطوة الهوية تثبت الصلاحية ولا تغيّر شيئاً.
     ويعود بالاسم ليكتبه الإيصال من مصدر موثوق لا من الجلسة. */
  if (action === "verify") return json(200, { ok: true, name: user.name ?? username });

  if (action === "close") {
    const name = (body.newSeasonName ?? "").trim();
    if (!name) return fail(400, "اسم الموسم الجديد مطلوب.");

    const { data, error } = await admin.rpc("close_season", {
      p_new_name: name,
      p_closed_by: user.name ?? username,
    });
    /* أخطاء close_season عربية ومكتوبة للمستخدم (اسم مكرر · لا يوجد
       موسم مفتوح) فتُمرَّر كما هي بدل رسالة عامة تُخفي السبب */
    if (error) {
      console.error("تعذر إقفال الموسم", error);
      return fail(400, error.message || "تعذّر إقفال الموسم.");
    }
    return json(200, { newSeasonId: data, closedBy: user.name ?? username });
  }

  const seasonId = body.seasonId;
  if (typeof seasonId !== "number") return fail(400, "معرّف الموسم مطلوب.");

  const { error } = await admin.rpc("delete_season", { p_season_id: seasonId });
  if (error) {
    console.error("تعذر حذف الموسم", error);
    return fail(400, error.message || "تعذّر حذف الموسم.");
  }
  return json(200, { ok: true });
});
