// ============================================================
// pilgrim-doc — المنفذ الوحيد لمستندات الحاجّ في البوابة العامة
// ============================================================
// س٦ / الخطوة ٤ (ب). البوابة تعمل بلا تسجيل دخول، فلا JWT هنا:
// `verify_jwt = false` عن قصد، والحماية كلها في جسم الدالة.
//
// ⚠️ القيد الحاكم: **الدالة لا تقبل من العميل مؤشّراً إلى ملف.**
// لا مفتاح كائن، ولا رابطاً، ولا رقم حاجّ. ما يقبله الجسم ثلاثة
// أشياء فقط: بيانات إثبات الهوية نفسها (وثيقة + تاريخ ميلاد)،
// و`docType` من قائمة سماح صريحة. والمفتاح تستخرجه الدالة بنفسها
// من سجل الحاجّ الذي أثبت هويّته — فلا يوجد مدخل يسمح لمستدعٍ
// بأن يطلب ملف غيره، لا بالتخمين ولا بالتلاعب.
//
// ولهذا أيضاً **لا تكشف الدالة وجود مستند لحاجّ آخر**: من فشل
// إثباته يرى استجابة واحدة لا تفرّق بين «لا حاجّ بهذه البيانات»
// و«حاجّ بلا مستند».
//
// الرابط الموقّع ١٥ دقيقة (DOC_TTL.portal، ق٣)، ولا يُخزَّن في
// القاعدة إطلاقاً: مؤقّت بطبيعته، والقاعدة تحفظ المفتاح وحده (ق٤).
//
// الحدود (fail closed — الحدّ هنا جزء من الحماية لا حارس استهلاك،
// إذ لا تفويض سبقه):
//   (أ) بالمصدر            سخيّ — شبكة واحدة تخدم حجّاجاً كثيرين
//   (ب) بالوثيقة عند الفشل  الحارس الحقيقي ضدّ التخمين
//   (ج) بالحاجّ بعد النجاح  سقف على التوقيع نفسه
//
// وتفاصيل الأخطاء تبقى في سجل الخادم؛ العميل يرى رسالة عربية عامة.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { cors, fail, json } from "../_shared/http.ts";
import { LIMITS, withinLimitFailClosed } from "../_shared/rateLimit.ts";

const BUCKET = "passengers-docs";
/** ق٣ — مدّة رابط البوابة */
const TTL_SECONDS = 15 * 60;

/* قائمة سماح صريحة: النوع المطلوب يُترجم هنا إلى عمود، فلا يصل
   نصّ العميل إلى استعلام ولا إلى مسار تخزين */
const DOC_COLUMNS = {
  photo: "photo_url",
  hajj_permit: "hajj_permit_url",
  flight_ticket: "flight_ticket_url",
} as const;
type DocType = keyof typeof DOC_COLUMNS;

/** رسالة واحدة لكل حالة «لا شيء لك هنا» — لا تفرّق بين الأسباب */
const NOT_AVAILABLE = "المستند غير متاح.";

const PUBLIC_PREFIX = `/storage/v1/object/public/${BUCKET}/`;

/** القيمة المخزَّنة قد تكون مفتاحاً أو رابطاً عامّاً قديماً (ق٤) */
function docKey(value: string | null | undefined): string {
  if (!value) return "";
  const idx = value.indexOf(PUBLIC_PREFIX);
  if (idx !== -1) return decodeURIComponent(value.slice(idx + PUBLIC_PREFIX.length).split("?")[0]);
  if (/^https?:\/\//i.test(value)) return "";
  return value;
}

/** آخر مدخل في x-forwarded-for — أصعبها تزويراً، **وليس برهاناً**،
    ولهذا لا تقوم عليه الحماية وحده (نفس تحفّظ س٦ في القاعدة) */
function sourceOf(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return fail(req, 405, "الطريقة غير مدعومة.");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(req, 400, "طلب غير صالح.");
  }

  /* ١) النوع — من قائمة السماح وحدها */
  const docType = String(body.doc_type ?? "") as DocType;
  if (!Object.hasOwn(DOC_COLUMNS, docType)) {
    return fail(req, 400, "نوع المستند غير مدعوم.");
  }

  /* ٢) بيانات الإثبات — نفس مدخلات البوابة، لا معرّف ولا مسار */
  const doc = String(body.doc ?? "").trim();
  const day = Number(body.day);
  const month = Number(body.month);
  const year = Number(body.year);
  if (!doc || !Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
    return fail(req, 400, "بيانات التحقق غير مكتملة.");
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  /* ٣) حدّ (أ) بالمصدر — قبل أي محاولة إثبات */
  const src = sourceOf(req);
  if (src) {
    const ok = await withinLimitFailClosed(
      admin, LIMITS.portalDocSrc.scope, `src:${src}`,
      LIMITS.portalDocSrc.limit, LIMITS.portalDocSrc.windowSeconds,
    );
    if (!ok) return fail(req, 429, "تجاوزت الحدّ المسموح من الطلبات، حاول بعد قليل.");
  }

  /* ٤) الهوية — عبر resolver المركزي القائم، بلا منطق مطابقة جديد */
  const { data: pilgrimId, error: resolveErr } = await admin.rpc("resolve_pilgrim_id", {
    p_doc: doc, p_day: day, p_month: month, p_year: year,
  });
  if (resolveErr) {
    console.error("تعذّر إثبات هوية الحاجّ", resolveErr);
    return fail(req, 500, "تعذّر إتمام الطلب.");
  }

  /* ٥) حدّ (ب) بالوثيقة — **عند الفشل وحده**، فلا يُعطَّل حاجّ صادق
        بمجرّد أن يعرف مهاجمٌ رقم وثيقته */
  if (!pilgrimId) {
    const ok = await withinLimitFailClosed(
      admin, LIMITS.portalDocFail.scope, `doc:${doc}`,
      LIMITS.portalDocFail.limit, LIMITS.portalDocFail.windowSeconds,
    );
    if (!ok) return fail(req, 429, "تجاوزت الحدّ المسموح من الطلبات، حاول بعد قليل.");
    return fail(req, 404, NOT_AVAILABLE);
  }

  /* ٦) حدّ (ج) بالحاجّ — سقف على التوقيع بعد نجاح الإثبات */
  const signOk = await withinLimitFailClosed(
    admin, LIMITS.portalDocSign.scope, `pilgrim:${pilgrimId}`,
    LIMITS.portalDocSign.limit, LIMITS.portalDocSign.windowSeconds,
  );
  if (!signOk) return fail(req, 429, "تجاوزت الحدّ المسموح من الطلبات، حاول بعد قليل.");

  /* ٧) المفتاح — تستخرجه الدالة من سجل الحاجّ، ولا يأتي من العميل.
        والموسم النشط شرطٌ كما في get_pilgrim_portal */
  const column = DOC_COLUMNS[docType];
  const { data: rows, error: rowErr } = await admin
    .from("passengers")
    .select(`id, season_id, ${column}`)
    .eq("id", pilgrimId)
    .limit(1);
  if (rowErr) {
    console.error("تعذّر قراءة سجل الحاجّ", { pilgrimId, docType, rowErr });
    return fail(req, 500, "تعذّر إتمام الطلب.");
  }

  const { data: activeSeason, error: seasonErr } = await admin.rpc("active_season_id");
  if (seasonErr) {
    console.error("تعذّر قراءة الموسم النشط", seasonErr);
    return fail(req, 500, "تعذّر إتمام الطلب.");
  }

  const row = rows?.[0] as Record<string, unknown> | undefined;
  if (!row || row.season_id !== activeSeason) return fail(req, 404, NOT_AVAILABLE);

  const key = docKey(row[column] as string | null);
  if (!key) return fail(req, 404, NOT_AVAILABLE);

  /* ٨) التوقيع — ١٥ دقيقة، ولا يُخزَّن الرابط في أي مكان */
  const { data: signed, error: signErr } = await admin
    .storage.from(BUCKET).createSignedUrl(key, TTL_SECONDS);
  if (signErr || !signed?.signedUrl) {
    console.error("تعذّر توقيع رابط المستند", { pilgrimId, docType, signErr });
    return fail(req, 500, "تعذّر إتمام الطلب.");
  }

  /* is_pdf يُحسب من المفتاح على الخادم: الواجهة تحتاج معرفة طريقة
     العرض، ولا يجوز أن تحتاج المفتاح نفسه لتعرفها */
  return json(req, 200, {
    url: signed.signedUrl,
    expires_in: TTL_SECONDS,
    is_pdf: key.toLowerCase().split("?")[0].endsWith(".pdf"),
  });
});
