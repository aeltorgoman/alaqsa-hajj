// ============================================================
// season-admin — المنفذ الوحيد للعمليات الإدارية على المواسم
// ============================================================
// close_season() و delete_season() محجوبتان عن anon و authenticated
// منذ م١، والتطبيق لا يستطيع استدعاءهما مباشرة. فهذه الدالة هي
// الجسر: تتحقق من هوية المستخدم وصلاحيته، ثم تستدعي الـ RPC بمفتاح
// الخدمة الذي لا يغادر الخادم إطلاقاً.
//
// المبدأ المعتمد: أي عملية تغيّر حالة الموسم أو تمسّ عدة جداول أو
// تُعدّ إدارية خطيرة لا تُنفَّذ من المتصفح مباشرة.
//
// س٣ / §٧.١: الحدّ المعروف الذي كان مكتوباً هنا — «المصادقة مخصّصة
// ولا تُصدر رمز جلسة فالتحقق بإعادة إدخال كلمة المرور» — انتهى.
// الهوية صارت JWT المستدعي، وكلمة المرور لم تعد تُرسل إلى هذه
// الدالة إطلاقاً. إعادة إدخالها في الواجهة بقيت **تأكيداً لعملية
// لا رجعة فيها**، لا آلية أمنية، وتُتحقَّق عند Supabase Auth وحده.
//
// verify_jwt = true، والتفويض كله عبر _shared/authorize.ts — لا
// منطق تفويض في هذا الملف ولا في أي دالة أخرى.
import { authorize } from "../_shared/authorize.ts";
import { CORS, fail, json } from "../_shared/http.ts";

/* الصلاحية التي تحرس صفحة إدارة المواسم في NAV — نفسها تحرس
   العمليات، فلا تتفارق الواجهة عن الخادم */
const REQUIRED_PERMISSION = "view_archive";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail(405, "الطريقة غير مدعومة.");

  let body: {
    action?: string;
    newSeasonName?: string;
    seasonId?: number;
  };
  try {
    body = await req.json();
  } catch {
    return fail(400, "طلب غير صالح.");
  }

  const { action } = body;
  if (action !== "verify" && action !== "close" && action !== "delete") {
    return fail(400, "عملية غير معروفة.");
  }

  /* ١) الهوية والصلاحية — الطبقة المشتركة، النمط الثلاثي كاملاً */
  const auth = await authorize(req, REQUIRED_PERMISSION);
  if (!auth.ok) return auth.response;
  const { admin, userId } = auth;

  /* ٢) الاسم للإيصال — من user_profiles بمعرّف الجلسة، لا مما يرسله
     المتصفح ولا من auth.users (الثابت أ١٠) */
  const { data: profile } = await admin
    .from("user_profiles").select("name").eq("id", userId).maybeSingle();
  const actor = (profile?.name ?? "").trim() || "مستخدم غير معروف";

  /* ٣) التنفيذ */

  /* verify يقف هنا عن قصد: خطوة الهوية تثبت الصلاحية ولا تغيّر شيئاً.
     ويعود بالاسم ليكتبه الإيصال من مصدر موثوق لا من الجلسة. */
  if (action === "verify") return json(200, { ok: true, name: actor });

  if (action === "close") {
    const name = (body.newSeasonName ?? "").trim();
    if (!name) return fail(400, "اسم الموسم الجديد مطلوب.");

    const { data, error } = await admin.rpc("close_season", {
      p_new_name: name,
      p_closed_by: actor,
    });
    /* أخطاء close_season عربية ومكتوبة للمستخدم (اسم مكرر · لا يوجد
       موسم مفتوح) فتُمرَّر كما هي بدل رسالة عامة تُخفي السبب */
    if (error) {
      console.error("تعذر إقفال الموسم", error);
      return fail(400, error.message || "تعذّر إقفال الموسم.");
    }
    return json(200, { newSeasonId: data, closedBy: actor });
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
