// ============================================================
// whatsapp-send — رسالة واتساب واحدة، ورمز Meta لا يغادر الخادم
// ============================================================
// كان رمز Meta الدائم يُلصَق في حقل نصّيّ ويُحفظ في
// `localStorage["wa_token"]`، ثم يُرسَل من المتصفّح مباشرةً إلى
// `graph.facebook.com` في ترويسة `Authorization`. أي أن **رمزاً
// يخوّل المراسلة باسم رقم الحملة كان يعيش في متصفّح كل موظّف**،
// بلا انتهاء صلاحية، ويقرؤه أي XSS. هذه الدالّة تُخرجه من هناك.
//
// ⚠️ **رسالة واحدة لكل استدعاء — وهذا قرار معماريّ لا تفصيل.**
// الإرسال الجماعيّ حلقةٌ على عشرات الحجّاج، لكل واحد حتى ثلاثة
// نداءات وتهدئة بينها. ونقل الحلقة إلى الخادم كان:
//   · يصطدم بالسقف الزمنيّ للدالّة كلّما كبرت الحملة،
//   · ويُلغي حالة كل صفّ الحيّة التي يراها الموظّف أثناء الإرسال.
// فالحلقة تبقى في المتصفّح، والدالّة تنقل رسالةً واحدة.
//
// ⚠️ **النمط الثلاثي (ق٥)** عبر `_shared/authorize.ts` وحدها:
//   verify_jwt=true · getUser(jwt) · has_permission('manage_portal')
//
// وصلاحية `manage_portal` لا `view_reports`: التبويب يسكن صفحة
// التقارير، لكن `view_reports` صلاحية **عرض وطباعة وتصدير** —
// وإرسال رسائل إلى كل الحجّاج فعلٌ صادر لا قراءة. و`manage_portal`
// هي التي تحرس المراسلة الصادرة النظيرة في `send-pilgrim-push`.
// (قرار صاحب المشروع، وصفحة التقارير نفسها تبقى على `view_reports`.)
//
// ⚠️ **كلُّ رسالة تخصّ حاجّاً بعينه — نصّاً كانت أو مستنداً.**
// لا تقبل هذه الدالّة رقماً حرّاً بحال: `passengerId` مطلوبٌ دائماً،
// والرقمُ يُطابَق بسجلّ الحاجّ، والحاجُّ يجب أن يكون في الموسم
// النشط. فلا تصير الدالّة قناةَ إرسالٍ عامّة على حساب رقم الحملة،
// ولا تُراسَل مواسمُ مؤرشَفة. والواجهةُ تحرس الشيءَ نفسه، لكن
// الحارسَ المعتمَد هنا.
import { authorize } from "../_shared/authorize.ts";
import { cors, fail, json } from "../_shared/http.ts";
import { enforceRateLimit, LIMITS } from "../_shared/rateLimit.ts";

const REQUIRED_PERMISSION = "manage_portal";

const GRAPH_VERSION = "v18.0";
const BUCKET = "passengers-docs";

/* ق٣ — مدّة رابط المستند المُرسَل عبر واتساب. سبعة أيام لأن
   المستلم يفتحه لاحقاً لا لحظة الوصول. **لا تُقصَّر**: تقصيرها
   يكسر المستندات بعد الإرسال بصمتٍ لا يظهر في أي سجلّ. */
const DOC_TTL_SECONDS = 7 * 24 * 60 * 60;

/* قائمة سماح صريحة — نمط `pilgrim-doc` نفسه: نوعُ المستند يُترجم
   هنا إلى عمود، فلا يصل نصّ العميل إلى استعلام ولا إلى مسار. */
const DOC_COLUMNS = {
  hajj_permit: "hajj_permit_url",
  flight_ticket: "flight_ticket_url",
} as const;
type DocType = keyof typeof DOC_COLUMNS;

const DOC_CAPTIONS: Record<DocType, string> = {
  hajj_permit: "تصريح السفر",
  flight_ticket: "تذكرة الطيران",
};

const PUBLIC_PREFIX = `/storage/v1/object/public/${BUCKET}/`;

/** القيمة المخزَّنة قد تكون مفتاحاً أو رابطاً عامّاً قديماً (ق٤) */
function docKey(value: string | null | undefined): string {
  if (!value) return "";
  const idx = value.indexOf(PUBLIC_PREFIX);
  if (idx !== -1) return decodeURIComponent(value.slice(idx + PUBLIC_PREFIX.length).split("?")[0]);
  if (/^https?:\/\//i.test(value)) return "";
  return value;
}

/** تطبيع الرقم — أرقام فقط، كما كانت تفعل الواجهة حرفياً */
const normalizePhone = (v: unknown) => String(v ?? "").replace(/\D/g, "");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return fail(req, 405, "الطريقة غير مدعومة.");

  let body: {
    to?: string;
    kind?: string;
    text?: string;
    passengerId?: number;
    docType?: string;
  };
  try {
    body = await req.json();
  } catch {
    return fail(req, 400, "طلب غير صالح.");
  }

  const kind = body.kind;
  if (kind !== "text" && kind !== "document") {
    return fail(req, 400, "نوع الرسالة غير معروف.");
  }

  const to = normalizePhone(body.to);
  if (!to) return fail(req, 400, "رقم المستلم مطلوب.");

  /* ١) الهوية والصلاحية — الطبقة المشتركة، النمط الثلاثي كاملاً */
  const auth = await authorize(req, REQUIRED_PERMISSION);
  if (!auth.ok) return auth.response;
  const { admin, userId } = auth;

  /* ٢) الحدّ الكمّي — رسائل صادرة إلى أطراف خارجية على حساب الحملة،
     فحدُّها بالفاعل يمنع أن يتحوّل خطأٌ في حلقة إلى فاتورة أو حظر. */
  const limited = await enforceRateLimit(
    req, admin, LIMITS.whatsappSend.scope, userId,
    LIMITS.whatsappSend.limit, LIMITS.whatsappSend.windowSeconds,
  );
  if (limited) return limited;

  /* ٣) المستلِم — حاجٌّ بعينه، في الموسم النشط، وبرقمه هو
     ═══════════════════════════════════════════════════════════
     الفحصُ صار **قبل** تفرّع النوع، ويشمل النصَّ كما يشمل المستند.

     كان النصُّ يمرّ برقمٍ يرسله العميل بلا أيّ سؤال، فكانت الدالّة
     قناةَ إرسالٍ إلى أيّ رقم على حساب رقم الحملة — ولو بنصٍّ يحمل
     بيانات رحلةِ حاجٍّ من موسمٍ مؤرشَف. والواجهةُ وحدها كانت تختار
     القائمة، وواجهةٌ ليست حارساً.

     ولا استثناءَ «للإرسال التجريبيّ»: استثناءٌ برقمٍ حرّ هو بالضبط
     الالتفافُ الذي يُبطل هذه القاعدة، فحُذف من الواجهة بدل أن
     يُفتَح له بابٌ هنا. */
  const passengerId = Number(body.passengerId);
  if (!Number.isInteger(passengerId) || passengerId <= 0) {
    return fail(req, 400, "معرّف الحاجّ مطلوب.");
  }

  const docType = kind === "document" ? (body.docType as DocType | undefined) : undefined;
  if (kind === "document" && (!docType || !(docType in DOC_COLUMNS))) {
    return fail(req, 400, "نوع المستند غير معروف.");
  }

  /* عمودُ المستند يدخل الاستعلامَ من قائمة السماح وحدها — لا نصَّ
     عميلٍ يصل إلى `select` ولا إلى مسار تخزين. */
  const column = docType ? DOC_COLUMNS[docType] : null;
  const columns = column ? `id, season_id, phone, ${column}` : "id, season_id, phone";

  const { data: rows, error: rowErr } = await admin
    .from("passengers")
    .select(columns)
    .eq("id", passengerId)
    .limit(1);
  if (rowErr) {
    console.error("تعذّر قراءة سجل الحاجّ", { passengerId, kind, docType, rowErr });
    return fail(req, 500, "تعذّر إتمام الطلب.");
  }

  const { data: activeSeason, error: seasonErr } = await admin.rpc("active_season_id");
  if (seasonErr) {
    console.error("تعذّر قراءة الموسم النشط", seasonErr);
    return fail(req, 500, "تعذّر إتمام الطلب.");
  }

  const row = rows?.[0] as Record<string, unknown> | undefined;

  /* الموسم النشط شرط — لا يُراسَل حاجُّ موسمٍ مؤرشَف بنصٍّ ولا
     بمستند. ورمزُ ٤٠٤ واحدٌ لا يفرّق بين «لا حاجّ» و«موسمٌ آخر»،
     فلا يصير الردُّ أداةَ استطلاع. */
  if (!row || row.season_id !== activeSeason) {
    return fail(req, 404, "الحاجّ غير متاح للمراسلة.");
  }

  /* والمستلِم هو صاحبُ السجلّ — لا رقمٌ يرسله العميل */
  if (normalizePhone(row.phone) !== to) {
    return fail(req, 403, "رقم المستلم لا يطابق الحاجّ المحدَّد.");
  }

  /* ٤) بناء الحمولة */
  let payload: Record<string, unknown>;

  if (kind === "text") {
    const text = String(body.text ?? "").trim();
    if (!text) return fail(req, 400, "نصّ الرسالة مطلوب.");
    payload = { messaging_product: "whatsapp", to, type: "text", text: { body: text } };
  } else {
    /* ── مستند ──────────────────────────────────────────────
       الرابط الموقَّع **يُولَّد هنا** بمفتاح الخدمة، ومفتاح الخدمة
       يتجاوز RLS — فحُرّاسُ المستلِم والموسم أعلاه هم ما يمنع أن
       يكفي رقمُ حاجٍّ لطلب مستنده. والمفتاحُ من السجلّ لا من العميل. */
    const key = docKey(row[column as string] as string | null);
    if (!key) return fail(req, 404, "المستند غير متاح.");

    const { data: signed, error: signErr } = await admin
      .storage.from(BUCKET).createSignedUrl(key, DOC_TTL_SECONDS);
    if (signErr || !signed?.signedUrl) {
      console.error("تعذّر توقيع رابط المستند", { passengerId, docType, signErr });
      return fail(req, 500, "تعذّر إتمام الطلب.");
    }

    payload = {
      messaging_product: "whatsapp",
      to,
      type: "document",
      document: { link: signed.signedUrl, caption: DOC_CAPTIONS[docType as DocType] },
    };
  }

  /* ٥) الاعتماد — من أسرار البنية وحدها. لا يُقرأ من الجسم ولا
     يُعاد في أي استجابة ولا يُسجَّل في أي سطر.
     ⚠️ ويُقرأ **بعد** كلّ فحصٍ سابق عمداً: لو سبقها لَحجب ٥٠٣ كلَّ
     أخطاء التحقّق، فلا يمكن إثباتُ حارسٍ واحد قبل توفّر بيانات
     واتساب. وبهذا الترتيب تُردّ الطلباتُ الفاسدة بأخطائها
     الحقيقية، ولا يبلغ ٥٠٣ إلا طلبٌ اجتاز كلَّ شيء — فيصير ٥٠٣
     نفسُه دليلَ أن الحُرّاس تعمل. ولا يُستعمل سرٌّ قبل هذه النقطة. */
  const token = Deno.env.get("WHATSAPP_TOKEN");
  const phoneId = Deno.env.get("WHATSAPP_PHONE_ID");
  if (!token || !phoneId) {
    console.error("سرّا واتساب غير مضبوطين على المشروع");
    return fail(req, 503, "إعداد واتساب غير مكتمل على الخادم.");
  }

  /* ٦) النداء — الرمز يدخل هنا ولا يخرج */
  let metaStatus: number;
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    metaStatus = res.status;
    if (!res.ok) {
      /* تفصيل الخطأ إلى سجلّ الخادم، والمستدعي يأخذ حالةً ورسالة
         عامة (س٩): ردّ Meta قد يحمل تفاصيل حساب لا تخصّ المتصفّح. */
      const detail = await res.text().catch(() => "");
      console.error("رفض Meta الرسالة", { status: res.status, detail: detail.slice(0, 500) });
      return json(req, 502, { ok: false, status: res.status });
    }
  } catch (err) {
    console.error("تعذّر الوصول إلى Meta", err);
    return fail(req, 502, "تعذّر الوصول إلى واتساب.");
  }

  /* ٧) الاستجابة — نجاحٌ ورمز حالة فقط. لا رمز ولا phoneId ولا
     رابط موقَّع: الرابط سرّ مؤقّت لا سبب لعودته إلى المتصفّح. */
  return json(req, 200, { ok: true, status: metaStatus });
});
