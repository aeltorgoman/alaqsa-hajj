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
import { cors, fail, json } from "../_shared/http.ts";
import { enforceRateLimit, LIMITS } from "../_shared/rateLimit.ts";

/* ═══ الصلاحيةُ بحسب العملية ═══
   كانت `view_archive` تحرس العمليات الثلاث. فمن مُنح **عرضَ
   الأرشيف** مُنح معه إقفالَ الموسم الجاري و**حذفَ موسمٍ كاملٍ
   حذفاً دائماً** — بحجّاجه وغرفه ومخيّماته ومدفوعاته. وهذا تفويضٌ
   لم يقصده من منح القراءة.

   و`verify` تشترط الصلاحيةَ نفسها عمداً: هي خطوةُ إثبات الهويّة
   التي تسبق الإقفال مباشرةً، وتردّ اسمَ الفاعل. فحراستُها أضعفَ
   من الإقفال كانت ستجعلها نافذةَ استطلاع.

   وخريطةٌ لا ثابت: عمليةٌ تُضاف غداً لا ترث تفويضَ الهدم صامتةً. */
const PERMISSION_BY_ACTION: Record<string, string> = {
  verify: "manage_season_lifecycle",
  close:  "manage_season_lifecycle",
  delete: "manage_season_lifecycle",
};

/* ═══ مستندات الموسم المحذوف ═══
   حذفُ الموسم يمحو صفوفَ حجّاجه، وكانت ملفّاتهم تبقى في الحاوية
   بلا صفٍّ يدلّ عليها — لا واجهةَ تعرضها ولا مسارَ يحذفها، فتتراكم
   إلى الأبد. وهذا ليس حذفاً بالتبعية (م‑٧٠): الحذف هنا مقصودٌ
   معلَن — «سيُحذف الموسم وكلّ ما يخصّه نهائياً» — والمستنداتُ من
   «ما يخصّه»، فتمامُ الحذف هو الصواب لا تركُ اليتامى.

   والحذفُ بقائمةِ مفاتيحَ صريحةٍ لموسمٍ واحد: لا مسحَ ببادئة ولا
   بالحاوية كلّها. */
const DOC_BUCKET = "passengers-docs";
const DOC_COLUMNS = [
  "passport_url", "national_id_url", "photo_url",
  "contract_url", "flight_ticket_url", "hajj_permit_url",
] as const;
const PUBLIC_PREFIX = `/storage/v1/object/public/${DOC_BUCKET}/`;
/** يقبل مفتاحَ كائنٍ أو رابطاً عامّاً قديماً (ق٤)، ويعيد المفتاح. */
function docKey(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  const idx = value.indexOf(PUBLIC_PREFIX);
  if (idx !== -1) return decodeURIComponent(value.slice(idx + PUBLIC_PREFIX.length).split("?")[0]);
  /* رابطٌ لا يخصّ حاويتنا: لا مفتاح له، ولا يُحذف */
  if (/^https?:\/\//i.test(value)) return "";
  return value;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return fail(req, 405, "الطريقة غير مدعومة.");

  let body: {
    action?: string;
    newSeasonName?: string;
    newSeasonHijriYear?: number;
    seasonId?: number;
  };
  try {
    body = await req.json();
  } catch {
    return fail(req, 400, "طلب غير صالح.");
  }

  const { action } = body;
  if (action !== "verify" && action !== "close" && action !== "delete") {
    return fail(req, 400, "عملية غير معروفة.");
  }

  /* ١) الهوية والصلاحية — الطبقة المشتركة، النمط الثلاثي كاملاً */
  const auth = await authorize(req, PERMISSION_BY_ACTION[action]);
  if (!auth.ok) return auth.response;
  const { admin, userId } = auth;

  /* ١.٥) الحدّ الكمّي — س٩ / M4. العمليات هنا لا رجعة فيها */
  const limited = await enforceRateLimit(
    req, admin, LIMITS.seasonAdmin.scope, userId, LIMITS.seasonAdmin.limit, LIMITS.seasonAdmin.windowSeconds,
  );
  if (limited) return limited;

  /* ٢) الاسم للإيصال — من user_profiles بمعرّف الجلسة، لا مما يرسله
     المتصفح ولا من auth.users (الثابت أ١٠) */
  const { data: profile } = await admin
    .from("user_profiles").select("name").eq("id", userId).maybeSingle();
  const actor = (profile?.name ?? "").trim() || "مستخدم غير معروف";

  /* ٣) التنفيذ */

  /* verify يقف هنا عن قصد: خطوة الهوية تثبت الصلاحية ولا تغيّر شيئاً.
     ويعود بالاسم ليكتبه الإيصال من مصدر موثوق لا من الجلسة. */
  if (action === "verify") return json(req, 200, { ok: true, name: actor });

  if (action === "close") {
    const name = (body.newSeasonName ?? "").trim();
    if (!name) return fail(req, 400, "اسم الموسم الجديد مطلوب.");

    /* ═══ السنةُ هويّةٌ صريحة ═══
       لا تُشتقّ من الاسم ولا تُخمَّن منه: «موسم 1449» و«حج 1449»
       و«موسم الحج 1449 هـ» أسماءٌ لموسمٍ واحد، والاسمُ نصٌّ حرٌّ
       يتغيّر. فالسنةُ تُرسَل عدداً، وتُفحَص عدداً. */
    const hijriYear = body.newSeasonHijriYear;
    if (typeof hijriYear !== "number" || !Number.isInteger(hijriYear)
        || hijriYear <= 0 || hijriYear >= 10000) {
      return fail(req, 400, "السنة الهجرية للموسم الجديد مطلوبة ويجب أن تكون عدداً صحيحاً صالحاً.");
    }

    /* س٨: `p_actor` هو `userId` المُثبَت من JWT في `authorize()` —
       لا من جسد الطلب. والدالة تضبط الفاعل وتكتب صفّ التدقيق
       **في معاملتها نفسها**، لأن استدعاءين متتاليين لا يتشاركان
       معاملة. و`p_closed_by` يبقى للإيصال ولا يُستبدل به. */
    const { data, error } = await admin.rpc("close_season", {
      p_new_name: name,
      p_new_hijri_year: hijriYear,
      p_closed_by: actor,
      p_actor: userId,
    });
    /* أخطاء close_season عربية ومكتوبة للمستخدم (اسم مكرر · لا يوجد
       موسم مفتوح) فتُمرَّر كما هي بدل رسالة عامة تُخفي السبب */
    if (error) {
      console.error("تعذر إقفال الموسم", error);
      return fail(req, 400, error.message || "تعذّر إقفال الموسم.");
    }
    return json(req, 200, { newSeasonId: data, closedBy: actor });
  }

  const seasonId = body.seasonId;
  if (typeof seasonId !== "number") return fail(req, 400, "معرّف الموسم مطلوب.");

  /* ١) المفاتيحُ تُحصى **قبل** الحذف (م‑٥٨): الصفوفُ تختفي بعده
        فلا سبيلَ إلى مفاتيحها. وفشلُ الإحصاء يوقف كلّ شيء — لا
        يُحذف موسمٌ لا نعرف ماذا نترك وراءه. */
  const { data: docRows, error: docsErr } = await admin
    .from("passengers")
    .select(DOC_COLUMNS.join(","))
    .eq("season_id", seasonId);
  if (docsErr) {
    console.error("تعذر حصر مستندات الموسم", { seasonId, docsErr });
    return fail(req, 400, "تعذّر حصر مستندات الموسم — لم يُحذف شيء.");
  }
  const keys = [...new Set(
    ((docRows ?? []) as Record<string, unknown>[])
      .flatMap((row) => DOC_COLUMNS.map((c) => docKey(row[c])))
      .filter(Boolean),
  )];

  /* ٢) س٨: العملية الهدّامة تحمل فاعلها معها — الدالة تكتب صفّاً
        ملخّصاً واحداً بالأعداد والفاعل، لا صفّاً لكل سطر ساقط.
        وترتيبُها قبل الملفّات مقصود: لو فشلت لم يُمسّ ملفٌّ واحد. */
  const { error } = await admin.rpc("delete_season", {
    p_season_id: seasonId,
    p_actor: userId,
  });
  if (error) {
    console.error("تعذر حذف الموسم", error);
    return fail(req, 400, error.message || "تعذّر حذف الموسم.");
  }

  /* ٣) الملفّات بعد نجاح القاعدة. `remove` ينجح جزئياً: ما لم
        يُذكر في `data` لم يُحذف. واليتامى يُسجَّلون بأسمائهم لا
        بعددهم، ويُعادون إلى المستدعي — فالنجاحُ لا يُعلَن على نقص. */
  let removed = 0;
  const orphans: string[] = [];
  for (let i = 0; i < keys.length; i += 100) {
    const chunk = keys.slice(i, i + 100);
    const { data: rm, error: rmErr } = await admin.storage.from(DOC_BUCKET).remove(chunk);
    if (rmErr) console.error("تعذر حذف دفعة من مستندات الموسم", { seasonId, rmErr });
    const done = new Set(((rm ?? []) as { name: string }[]).map((f) => f.name));
    removed += done.size;
    for (const k of chunk) if (!done.has(k)) orphans.push(k);
  }
  const storageOk = orphans.length === 0;
  if (!storageOk) {
    console.error("[season-delete] مستندات لم تُحذف — ملفات يتيمة في " + DOC_BUCKET, {
      seasonId, at: new Date().toISOString(), count: orphans.length, paths: orphans,
    });
  }

  /* القاعدةُ ذهبت ولا رجعةَ فيها، فالردُّ يفصل الأمرين: الموسمُ
     حُذف، والملفّاتُ حالتُها هذه. ولا يُقال «تمّ» على نقص. */
  return json(req, 200, {
    ok: true,
    storage: { expected: keys.length, removed, orphans: orphans.length, ok: storageOk },
  });
});
