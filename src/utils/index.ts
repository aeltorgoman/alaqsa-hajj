import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../supabase";
import { portalSupabase } from "../portalSupabase";

export function makeShort(fullName: string): string {
  if (!fullName) return "";
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 3) return parts.join(" ");
  return [parts[0], parts[1], parts[parts.length - 1]].join(" ");
}

/* «٥ بنود» — تمييزُ العربية لا صيغةٌ واحدة بـ«s». يسكن هنا لأن
   كارت الداشبورد وغرفة العمليات كليهما يعدّ بنوداً، ونسختان منه
   تفترقان بالكلمة أو بالعتبة عند أول تعديل. */
export function itemsLabel(n: number): string {
  if (n === 1) return "بند واحد";
  if (n === 2) return "بندان";
  if (n <= 10) return `${n} بنود`;
  return `${n} بنداً`;
}

export function isExpiringSoon(dateStr: string): boolean {
  const d = parseDate(dateStr);
  if (!d) return false;
  const now = new Date();
  const sixMonths = new Date();
  sixMonths.setMonth(sixMonths.getMonth() + 6);
  return d >= now && d < sixMonths;
}

export function isExpired(dateStr: string): boolean {
  const d = parseDate(dateStr);
  if (!d) return false;
  return d < new Date();
}

export function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  let d: Date | null = null;
  const parts = dateStr.split(/[\/\-.]/).map(s => s.trim());
  if (parts.length === 3) {
    if (parts[0].length === 4) d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    else d = new Date(+parts[2], +parts[1] - 1, +parts[0]);
  }
  if (!d || isNaN(d.getTime())) return null;
  return d;
}

// وقت نسبي (منذ X) — يُستخدم لعرض وقت إضافة الحاج في "آخر المضافين"
export function timeAgo(isoString?: string | null): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "";
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return "الآن";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `منذ ${diffHour} ساعة`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `منذ ${diffDay} يوم`;
  const diffMonth = Math.floor(diffDay / 30);
  return `منذ ${diffMonth} شهر`;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve((e.target?.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export type ScanMode = "passport" | "idcard" | "hajj_permit" | "auto";
export type ScannedDocument = Record<string, unknown> & {
  doc_type: string;
  name_en: string;
  name_ar: string;
  passport: string;
  national_id: string;
  nationality: string;
  dob: string;
  expiry: string;
  id_expiry: string;
  gender: string;
  permit_number: string;
  /* عقد تصريح الحج — تحليل بالمحتوى لا بالقالب، وأي حقل غائب يعود "" */
  passport_number: string;
  full_name: string;
};

type AnthropicContent = { type?: unknown; text?: unknown };
type ScanFunctionResponse = {
  content?: unknown;
  error?: unknown;
  message?: unknown;
};

export class DocumentScanError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(
    message: string,
    code: string,
    status?: number,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "DocumentScanError";
    this.code = code;
    this.status = status;
  }
}

const EXPECTED_FIELDS: Record<ScanMode, readonly string[]> = {
  passport: ["name_en", "name_ar", "passport", "nationality", "dob", "expiry", "gender"],
  idcard: ["name_en", "name_ar", "national_id", "id_expiry", "dob", "gender"],
  /* يكفي حقل واحد: غياب رقم الهوية لا يُفشل العملية إذا وُجد الجواز */
  hajj_permit: ["national_id", "passport_number", "full_name", "passport", "name_ar", "name_en"],
  auto: ["name_en", "name_ar", "national_id", "passport"],
};

const DOCUMENT_TYPES = ["passport", "idcard", "hajj_permit"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExpectedDocumentData(value: Record<string, unknown>, mode: ScanMode): boolean {
  if (mode === "auto") {
    const hasValidDocumentType = typeof value.doc_type === "string" &&
      (DOCUMENT_TYPES as readonly string[]).includes(value.doc_type.trim());
    const hasIdentityData = EXPECTED_FIELDS.auto.some(field =>
      typeof value[field] === "string" && value[field].trim().length > 0
    );
    return hasValidDocumentType && hasIdentityData;
  }

  return EXPECTED_FIELDS[mode].some(field => {
    const fieldValue = value[field];
    return typeof fieldValue === "string" ? fieldValue.trim().length > 0 : fieldValue !== undefined && fieldValue !== null;
  });
}

export function parseScanResponse(payload: unknown, mode: ScanMode): ScannedDocument {
  if (!isRecord(payload) || Object.keys(payload).length === 0) {
    throw new DocumentScanError("استجابة خدمة المسح فارغة.", "EMPTY_RESPONSE");
  }

  const response = payload as ScanFunctionResponse;
  if (response.error) {
    throw new DocumentScanError("أعادت خدمة تحليل المستند خطأ.", "PROVIDER_ERROR");
  }

  if (!Array.isArray(response.content)) {
    throw new DocumentScanError("لا تحتوي استجابة التحليل على محتوى صالح.", "INVALID_CONTENT");
  }

  const text = response.content
    .filter((item): item is AnthropicContent => isRecord(item))
    .map(item => typeof item.text === "string" ? item.text : "")
    .join("")
    .replace(/```(?:json)?|```/gi, "")
    .trim();

  if (!text) {
    throw new DocumentScanError("لا تحتوي استجابة التحليل على نص.", "EMPTY_CONTENT");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new DocumentScanError("تعذر تحليل بيانات المستند.", "INVALID_JSON", undefined, { cause: error });
  }

  if (!isRecord(parsed) || !hasExpectedDocumentData(parsed, mode)) {
    throw new DocumentScanError("لم يتم العثور على بيانات مستند متوقعة.", "NO_DOCUMENT_DATA");
  }

  const stringValue = (field: string) => typeof parsed[field] === "string" ? parsed[field] : "";
  return {
    ...parsed,
    /* ⚠️ يُقصّ هنا لأن الفحص أعلاه يقصّ: `hasExpectedDocumentData`
       يقبل `doc_type` بعد `trim()`، فكان `"hajj_permit\n"` يجتاز
       التحقّق ثم يسقط في مقارنة `=== "hajj_permit"` عند المستدعي
       فيُعامَل المستند كجواز. القصّ يوحّد الطرفين — ولا يغيّر منطق
       التعرّف: النوع كما قرأه المزوّد، بلا فراغ حوله. */
    doc_type: stringValue("doc_type").trim(),
    name_en: stringValue("name_en"),
    name_ar: stringValue("name_ar"),
    passport: stringValue("passport"),
    national_id: stringValue("national_id"),
    nationality: stringValue("nationality"),
    dob: stringValue("dob"),
    expiry: stringValue("expiry"),
    id_expiry: stringValue("id_expiry"),
    gender: stringValue("gender"),
    permit_number: stringValue("permit_number"),
    /* الجواز يصل باسمين حسب الوضع (`passport` في الجواز والوضع
       التلقائي، `passport_number` في التصريح) — والمطابقة تقرأ
       الاثنين فلا تتعلّق بنوع المستند */
    passport_number: stringValue("passport_number") || stringValue("passport"),
    full_name: stringValue("full_name") || stringValue("name_ar") || stringValue("name_en"),
  };
}

function getFunctionErrorStatus(error: unknown): number | undefined {
  if (!isRecord(error) || !("context" in error)) return undefined;
  const context = error.context;
  return isRecord(context) && typeof context.status === "number" ? context.status : undefined;
}

export async function scanDocument(file: File, mode: ScanMode): Promise<ScannedDocument> {
  const imageBase64 = await fileToBase64(file);
  const { data, error } = await supabase.functions.invoke("Scan-passport", {
    body: { imageBase64, mediaType: file.type, mode },
  });

  if (error) {
    const status = getFunctionErrorStatus(error);
    const code = status === 401
      ? "UNAUTHORIZED"
      : status === 415
        ? "UNSUPPORTED_MEDIA_TYPE"
        : status === 429
          ? "RATE_LIMITED"
          : status && status >= 500 ? "FUNCTION_SERVER_ERROR" : "FUNCTION_REQUEST_FAILED";
    console.error("Document scan function failed", { mode, status, code, error });
    throw new DocumentScanError(
      status === 401 ? "انتهت صلاحية جلسة المسح أو لم يتم السماح بالطلب."
        : status === 415 ? "صيغة الملف غير مدعومة للمسح. المدعوم: JPG · PNG · WebP · GIF · PDF."
        : status === 429 ? "تجاوزت الحدّ المسموح من عمليات المسح، حاول بعد قليل."
        : "تعذر الاتصال بخدمة مسح المستندات.",
      code,
      status,
      { cause: error }
    );
  }

  try {
    return parseScanResponse(data, mode);
  } catch (error) {
    console.error("Document scan response was invalid", { mode, error });
    throw error;
  }
}

/* ═══════════════════════════════════════════════════════════════
   مستندات الحجاج — طبقة التوقيع (س٦ / الخطوة ١)

   الحاوية `passengers-docs` عامة اليوم، وستصير خاصّة في آخر س٦.
   ولهذا **يمرّ كل قارئ من هنا** بدل أن يبني رابطاً بنفسه: يوم
   الخصخصة لا تتغيّر إلا هذه الدالة.

   والقاعدة تحفظ **مفتاح الكائن** لا الرابط (القرار ق٤): الرابط
   الموقّع مؤقّت بطبيعته فلا يُخزَّن، والمفتاح ثابت. و`docKey`
   تقبل الشكلين — المفتاح الجديد والرابط العامّ القديم — فلا
   يحتاج الانتقال لحظةَ توقّف واحدة.
   ═══════════════════════════════════════════════════════════════ */

const DOC_BUCKET = "passengers-docs";
const PUBLIC_PREFIX = `/storage/v1/object/public/${DOC_BUCKET}/`;

/* سعة الغرفة مشتقّة من نوعها — لا عمود `capacity` في `rooms`.
   خرجت من صفحة الفندق إلى هنا حين احتاجتها صفحة الإداريين أيضاً:
   نسختان من هذا الجدول تفترقان يوماً، وسعةٌ مختلفة بين شاشتين
   تعني تسكيناً فوق سرير مشغول. الصفر يعني «بلا حدّ» (مجلس · أخرى). */
/* سعة الأنواع القياسية — نسخةُ الواجهة من `room_type_capacity()` في
   القاعدة. «خاص» ليست هنا عمداً: لا سعة ثابتة لها، تُدخَل صراحةً
   وتُقرأ من `rooms.capacity`. والقاعدة هي الحَكَم عند الكتابة. */
export const ROOM_TYPE_CAP: Record<string, number> = {
  "فردية": 1, "ثنائية": 2, "ثلاثية": 3, "رباعية": 4, "مجلس": 0,
};

/* أنواع غرف الفندق المعتمَدة بترتيب العرض. تُميَّز عن `ROOM_TYPES`
   أدناه: تلك أنواع التسعير الأربعة (عدد الأَسِرّة)، وهذه مفردات
   صفحة الفندق كاملةً ومنها «خاص» و«مجلس». */
export const HOTEL_ROOM_TYPES = ["فردية", "ثنائية", "ثلاثية", "رباعية", "خاص", "مجلس"] as const;

/** هل يفرض النوع سعته؟ «خاص» وحدها لا تفرضها */
export const isFixedCapType = (t: string) => t in ROOM_TYPE_CAP;

/** السعة الفعلية للغرفة — المحفوظة أولاً، ثم سعة نوعها القياسيّ */
export function roomCapacity(room: { type?: string | null; capacity?: number | null }): number | null {
  if (room.capacity != null) return room.capacity;
  const t = (room.type || "").trim();
  return t in ROOM_TYPE_CAP ? ROOM_TYPE_CAP[t] : null;
}

/** مدد الصلاحية المعتمدة — ق٣ */
export const DOC_TTL = {
  /** عرض داخليّ للموظّف */
  view: 5 * 60,
  /** بوابة الحاج */
  portal: 15 * 60,
  /** روابط ترسَل عبر واتساب ويفتحها المستلم لاحقاً */
  whatsapp: 7 * 24 * 60 * 60,
} as const;

/** يقبل مفتاح كائن أو رابطاً عاماً قديماً، ويعيد مفتاح الكائن. */
export function docKey(value: string | null | undefined): string {
  if (!value) return "";
  const idx = value.indexOf(PUBLIC_PREFIX);
  if (idx !== -1) return decodeURIComponent(value.slice(idx + PUBLIC_PREFIX.length).split("?")[0]);
  /* رابط لا يخصّ حاويتنا: لا مفتاح له */
  if (/^https?:\/\//i.test(value)) return "";
  return value;
}

/* ذاكرة داخل الجلسة: الرابط الموقّع يُعاد استعماله ما بقي حيّاً،
   وهامش نصف دقيقة يمنع تسليم رابط يموت بين التوقيع والفتح */
const signedCache = new Map<string, { url: string; expiresAt: number }>();
const SIGN_MARGIN_MS = 30_000;

/** رابط موقّع قصير العمر لمستند — المسار الوحيد للقراءة. */
export async function signedDocUrl(
  value: string | null | undefined,
  ttlSeconds: number = DOC_TTL.view
): Promise<string> {
  const key = docKey(value);
  if (!key) return "";

  const cacheKey = `${key}|${ttlSeconds}`;
  const cached = signedCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const { data, error } = await supabase.storage.from(DOC_BUCKET).createSignedUrl(key, ttlSeconds);
  if (error || !data?.signedUrl) {
    console.error("تعذّر توقيع رابط المستند", { key, error });
    return "";
  }
  signedCache.set(cacheKey, {
    url: data.signedUrl,
    expiresAt: Date.now() + ttlSeconds * 1000 - SIGN_MARGIN_MS,
  });
  return data.signedUrl;
}

/* ═══════════════════════════════════════════════════════════════
   جلب بايتات مستند — بالتحقّق لا بالثقة

   🔴 الفخّ الذي كلّفنا أرشيفاً كاملاً: `vercel.json` يعيد كتابة
   `/(.*)` إلى `/index.html`. فأي جلب لمسار نسبيّ — مفتاح كائن مثلاً —
   لا يردّ ٤٠٤ بل **٢٠٠ ومعه قشرة التطبيق**. فتمرّ `response.ok`،
   ويُحفَظ في الأرشيف ملفٌّ حجمه ٤٢٦١ بايت لكل «مستند»، صورةً كان
   أو PDF. ولهذا **لا تكفي الحالة ٢٠٠ برهاناً**.

   ثلاث بوّابات، أي واحدة تسقط تُسقط المستند:
     ١) الرابط من مسار التوقيع في التخزين لا من أصل التطبيق
     ٢) الحالة ناجحة، والنوع ليس نصّاً ولا HTML ولا JSON
     ٣) **البايتات الأولى تطابق نوع الملفّ فعلاً** — والحكم الأخير
   ═══════════════════════════════════════════════════════════════ */

/** التوقيع الثنائي لكل نوع مسموح — البرهان الأخير على سلامة الحمولة */
const MAGIC: Record<string, (b: Uint8Array) => boolean> = {
  pdf:  b => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,          // %PDF
  jpg:  b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  jpeg: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  png:  b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  webp: b => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46           // RIFF
          && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,        // WEBP
};

const looksLikeMarkup = (b: Uint8Array): boolean => {
  /* `<!DOCTYPE`، `<html`، `{`، `[` — قشرة تطبيق أو خطأ JSON */
  const head = String.fromCharCode(...b.slice(0, 16)).trim().toLowerCase();
  return head.startsWith("<!do") || head.startsWith("<htm") || head.startsWith("<") ||
         head.startsWith("{") || head.startsWith("[");
};

export class DocumentFetchError extends Error {}

/** يُعيد بايتات المستند الأصلية، أو يرمي بسبب مفهوم. */
export async function fetchDocumentBytes(value: string): Promise<Uint8Array> {
  const key = docKey(value);
  if (!key) throw new DocumentFetchError("قيمة غير صالحة للمستند");

  const url = await signedDocUrl(value, DOC_TTL.view);
  if (!url) throw new DocumentFetchError("تعذّر توقيع الرابط");

  /* (١) الرابط الموقّع وحده — لا أصل التطبيق ولا أي مسار آخر */
  if (!url.includes("/storage/v1/object/sign/")) {
    throw new DocumentFetchError("الرابط ليس رابط تخزين موقّعاً");
  }

  const res = await fetch(url);
  if (!res.ok) throw new DocumentFetchError(`HTTP ${res.status}`);

  /* (٢) النوع المعلَن: نصّ أو HTML أو JSON = استجابة خطأ لا مستند */
  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  if (/text\/|json|html/.test(contentType)) {
    throw new DocumentFetchError(`نوع غير متوقّع: ${contentType || "غير معلوم"}`);
  }

  /* البايتات كما هي — لا تحويل إلى نصّ في أي خطوة */
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength === 0) throw new DocumentFetchError("حمولة فارغة");

  /* (٣) التوقيع الثنائي — الحكم الأخير */
  if (looksLikeMarkup(bytes)) throw new DocumentFetchError("الحمولة صفحة أو JSON لا مستند");

  const ext = key.toLowerCase().split("?")[0].split(".").pop() ?? "";
  const check = MAGIC[ext];
  if (check && !check(bytes)) {
    throw new DocumentFetchError(`البايتات لا تطابق نوع ${ext}`);
  }

  return bytes;
}

/* ── بوابة الحاج — س٦ / الخطوة ٤ ──
   `publicDocUrl` انتهت. الحاجّ المجهول لا يبني رابطاً بنفسه بعد
   اليوم، ولا يملك ما يبنيه به أصلاً: البوابة لم تعد تستلم مفاتيح
   المستندات (ق٦)، بل ثلاث قيم منطقية. والرابط يأتي موقّعاً من
   `pilgrim-doc` التي تستخرج المفتاح من سجل الحاجّ بعد إثبات هويّته.
   ولهذا يوم تصير الحاوية خاصّة لا يتغيّر شيء في هذه الشاشة. */

/** أنواع المستندات المسموحة للبوابة — نفس قائمة السماح في الخادم */
export type PortalDocType = "photo" | "hajj_permit" | "flight_ticket";

/* ── س٧: الجلسة تحلّ محلّ الاعتماد الثابت (الثابت أ١٢) ──
   ما كان يُحفظ على جهاز الحاجّ رقمَ جوازه وتاريخ ميلاده — وثيقتان
   حقيقيتان لا تُدوَّران ولا تُبطَلان. صار رمزاً عشوائياً ينتهي
   ويُبطَل ويموت بموسمه. والرمز نصّ مبهم لا بنية له عند العميل:
   الخادم وحده يعرف ما وراءه. */
export type PortalSession = {
  token: string;
  idle_expires_at: string;
  absolute_expires_at: string;
};

/** مفتاح التخزين المحلّي لرمز الجلسة — الموضع الوحيد الذي يُذكر فيه */
export const PORTAL_SESSION_KEY = "portal_session";

export type PortalDoc = { url: string; is_pdf: boolean };

/* الرابط الموقّع لا يُخزَّن: ذاكرة الصفحة وحدها، وبهامش نصف دقيقة
   يمنع تسليم رابط يموت بين الطلب والفتح.
   والمفتاح **النوعُ وحده** لا الرمز: لا سبب لأن يصير رمز جلسة
   مفتاحَ خريطة، والجلسة واحدة في الصفحة على أي حال. */
const portalDocCache = new Map<PortalDocType, { doc: PortalDoc; expiresAt: number }>();

/** تُفرَّغ عند الدخول والخروج: روابط حاجٍّ لا تُسلَّم لجلسة أخرى. */
export function clearPortalDocCache(): void {
  portalDocCache.clear();
}

/** يطلب رابطاً موقّعاً (١٥ دقيقة) لمستند الحاجّ من `pilgrim-doc`.
 *  لا يُرسل مفتاحاً ولا رابطاً ولا رقم حاجّ ولا اعتماداً ثابتاً —
 *  رمز الجلسة والنوع فقط. */
export async function portalDocUrl(
  token: string | null,
  docType: PortalDocType
): Promise<PortalDoc | null> {
  if (!token) return null;

  const cached = portalDocCache.get(docType);
  if (cached && cached.expiresAt > Date.now()) return cached.doc;

  /* عميل البوابة لا العميل المشترك: `pilgrim-doc` عامة
     (`verify_jwt=false`) فلا تتأثر بوجود جلسة موظّف من عدمه — لكن
     لا سبب لإرسال رمز هوية موظّف إلى مسار عامّ لا يقرؤه */
  const { data, error } = await portalSupabase.functions.invoke("pilgrim-doc", {
    body: { token, doc_type: docType },
  });
  if (error || !data?.url) {
    /* الرمز لا يُسجَّل — النوع والخطأ يكفيان للتشخيص */
    console.error("تعذّر جلب رابط المستند", { docType, error });
    return null;
  }

  const doc: PortalDoc = { url: data.url, is_pdf: data.is_pdf === true };
  portalDocCache.set(docType, {
    doc,
    expiresAt: Date.now() + (Number(data.expires_in) || DOC_TTL.portal) * 1000 - SIGN_MARGIN_MS,
  });
  return doc;
}

/** خطّاف عرض للبوابة — يطلب الرابط عند الحاجة ويعيده جاهزاً للـ`src`. */
export function usePortalDoc(
  token: string | null,
  docType: PortalDocType,
  enabled: boolean
): string {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let alive = true;
    if (!enabled || !token) { setUrl(""); return; }
    void portalDocUrl(token, docType).then(d => { if (alive) setUrl(d?.url ?? ""); });
    return () => { alive = false; };
  }, [token, docType, enabled]);
  return url;
}

/** خطّاف عرض: يوقّع القيمة المخزّنة ويعيد رابطاً جاهزاً للـ`src`. */
export function useSignedDoc(
  value: string | null | undefined,
  ttlSeconds: number = DOC_TTL.view
): string {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let alive = true;
    if (!value) { setUrl(""); return; }
    void signedDocUrl(value, ttlSeconds).then(u => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [value, ttlSeconds]);
  return url;
}

export async function downloadFile(value: string) {
  const url = await signedDocUrl(value);
  if (!url) return;

  /* ⚠️ الاسم من **مفتاح الكائن** لا من الرابط الموقّع: الرابط يحمل
     `?token=…`، وقصّه بـ`split("/").pop()` كان يُنتج اسماً مثل
     `passport_doc_178….jpg?token=eyJhbGciOi…` — لا ينتهي بامتداد
     فلا يفتحه النظام. والمفتاح ثابت ونظيف ولا استعلام فيه. */
  const filename = docKey(value).split("/").pop() || "document";

  try {
    const response = await fetch(url);
    /* استجابة خطأ تُنتج ملفاً «صالحاً» فيه نصّ الخطأ — تُرفض هنا */
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch { window.open(url, "_blank"); }
}

/** الاسم القديم — يبقى للمستدعين، وصار واجهةً لـ docKey. */
export const getStoragePath = docKey;

export function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) { resolve(file); return; }
    const isPng = file.type === "image/png";
    const outputType = isPng ? "image/png" : "image/jpeg";
    const outputQuality = isPng ? 1 : 0.8;
    const img = new Image();
    img.onload = () => {
      const maxDim = 1400;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = height * maxDim / width; width = maxDim; }
        else { width = width * maxDim / height; height = maxDim; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx && !isPng) {
        /* لون صريح لا متغيّر CSS: canvas لا يفسّر var() ويتجاهل القيمة
           غير الصالحة صامتاً، فتبقى #000000 الافتراضية وتخرج الخلفية
           سوداء. ولو فُسِّر المتغيّر لتبع مظهر الواجهة — و‑‑text-inverse
           أسود في الثيم الداكن — والمطلوب أبيض دائماً تحت الشفافية. */
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
      }
      ctx?.drawImage(img, 0, 0, width, height);
      canvas.toBlob(b => resolve(b || file), outputType, outputQuality);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

export async function uploadDoc(file: File, passengerId: number, docType: string): Promise<string | null> {
  const compressed = await compressImage(file);
  const isPng = file.type === "image/png";
  const ext = file.type === "application/pdf" ? "pdf" : isPng ? "png" : "jpg";
  const contentType = file.type === "application/pdf" ? "application/pdf" : isPng ? "image/png" : "image/jpeg";
  const path = `${passengerId}/${docType}_${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(DOC_BUCKET).upload(path, compressed, { upsert: true, contentType });
  if (error) { console.error("upload error", error); return null; }
  /* س٦ / ق٤: يُعاد **مفتاح الكائن** لا رابطاً عاماً. القيمة تُخزَّن
     كما هي في العمود، وطبقة التوقيع تبني الرابط عند العرض. */
  return path;
}

/** حذف كائن رُفع للتوّ — تنظيفٌ بعد فشل تحديث القاعدة.
 *  يُرجع نجاح الحذف، ولا يرمي: هو مسار تعويض لا مسار عمل. */
export async function removeDoc(key: string): Promise<boolean> {
  const path = docKey(key);
  if (!path) return false;
  const { error } = await supabase.storage.from(DOC_BUCKET).remove([path]);
  if (error) {
    /* الفشل يُسجَّل ولا يُبتلع: يبقى كائن يتيم في الحاوية، ومن يقرأ
       السجلّ يعرف مفتاحه بالضبط */
    console.error("تعذّر حذف الكائن بعد فشل حفظ المستند — كائن يتيم", { path, error });
    return false;
  }
  return true;
}

/* ═══════════════════════════════════════════════════════════════
   أصول الشركة — حاوية أخرى بقاعدة أخرى (س٦ / الخطوة ٣ · ق١)

   الشعار والخلفية **عامّان بطبيعتهما**: شاشة الدخول تعرضهما لزائر
   مجهول قبل وجود جلسة. فلا توقيع ولا مفاتيح هنا — يُخزَّن الرابط
   العامّ كاملاً، وهو ثابت لأن الحاوية تبقى عامة.

   وهذا **ليس نقضاً لـق٤**: تلك القاعدة سببها أن حاوية المستندات
   تصير خاصّة فيموت رابطها. وهنا لا يموت.

   ⚠️ ولهذا لا تُستعمل `uploadDoc` للأصول: كانت ترفع إلى
   `passengers-docs` وتُعيد **مفتاحاً**، و`normalizeCompanyAssetUrl`
   ترفض المفتاح وتُرجع null — فيختفي الشعار.
   ═══════════════════════════════════════════════════════════════ */

const COMPANY_BUCKET = "company-assets";

export async function uploadCompanyAsset(file: File, kind: string): Promise<string | null> {
  const compressed = await compressImage(file);
  const isPng = file.type === "image/png";
  const ext = isPng ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const contentType = isPng ? "image/png" : file.type === "image/webp" ? "image/webp" : "image/jpeg";
  const path = `${kind}_${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from(COMPANY_BUCKET).upload(path, compressed, { upsert: true, contentType });
  if (error) { console.error("تعذّر رفع أصل الشركة", error); return null; }

  const { data } = supabase.storage.from(COMPANY_BUCKET).getPublicUrl(path);
  return data?.publicUrl || null;
}
/* ═══ طبقةُ الطباعة انتقلت إلى `src/print/` ═══
   القشرةُ والسمةُ والهويّةُ والكتلُ والإخراجُ ومطبوعاتُ الشنط صارت
   وحدةً مشتركةً واحدة. وإعاداتُ التصدير أدناه توافقيّةٌ فلا يتغيّر
   سطرُ استيرادٍ واحد في الصفحات القائمة — ولا منطقَ يُكرَّر. */
export type { PrintBranding, NameItem, StickerConfig, StickerPassenger, StickerMeta, StickerTypes } from "../print";


// ===== تثبيت صف العنوان (Freeze Header Row) =====
export function freezeHeaderRow(ws: import("xlsx").WorkSheet, rows = 1) {
  (ws as any)["!views"] = [{ state: "frozen", xSplit: 0, ySplit: rows, topLeftCell: `A${rows + 1}`, activePane: "bottomLeft" }];
}
export {
  makeHTML, makeFinanceHTML,
  sectionLogoHtml, renderNamesTable, makeTwoLogoSectionHTML, joinSections, makeFlightSectionHTML,
  printInPage, downloadPDF,
  buildStickerPageHTML, buildHandTagPageHTML, buildLongTagPageHTML, buildStickersHTML,
} from "../print";


// ===== تنسيق صف عنوان رئيسي (دمج + خلفية ملوّنة) =====
export function styleTitleRow(ws: import("xlsx").WorkSheet, rowIndex: number, colCount: number, primaryColor: string) {
  const rgb = primaryColor.replace("#", "");
  if (!ws["!merges"]) ws["!merges"] = [];
  ws["!merges"]!.push({ s: { r: rowIndex, c: 0 }, e: { r: rowIndex, c: colCount - 1 } });
  for (let c = 0; c < colCount; c++) {
    const addr = XLSX.utils.encode_cell({ r: rowIndex, c });
    if (!ws[addr]) ws[addr] = { t: "s", v: "" };
    (ws[addr] as any).s = { fill: { fgColor: { rgb } }, font: { color: { rgb: "FFFFFF" }, bold: true, sz: 13 }, alignment: { horizontal: "center", vertical: "center" } };
  }
}

// ===== تنسيق صف رؤوس الأعمدة (خلفية ملوّنة + خط أبيض) =====
export function styleHeaderRow(ws: import("xlsx").WorkSheet, rowIndex: number, colCount: number, primaryColor: string) {
  const rgb = primaryColor.replace("#", "");
  for (let c = 0; c < colCount; c++) {
    const addr = XLSX.utils.encode_cell({ r: rowIndex, c });
    if (!ws[addr]) continue;
    (ws[addr] as any).s = { fill: { fgColor: { rgb } }, font: { color: { rgb: "FFFFFF" }, bold: true }, alignment: { horizontal: "center", vertical: "center" } };
  }
}

// ===== اسم شيت صالح (حد 31 حرف وبدون رموز ممنوعة) =====
export function safeSheetName(name: string): string {
  return (name || "ورقة").replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "ورقة";
}

// ===== إضافة شيت ملخص في أول الملف =====
export function addSummarySheet(
  wb: import("xlsx").WorkBook,
  XLSXLib: typeof import("xlsx"),
  reportTitle: string,
  companyName: string,
  stats: (string | number)[][],
  sheetName = "ملخص"
) {
  const now = new Date();
  const aoa: (string | number)[][] = [
    [companyName],
    [reportTitle],
    [`تاريخ الإصدار: ${now.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}`],
    [],
    ["البيان", "القيمة"],
    ...stats,
  ];
  const ws = XLSXLib.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 30 }, { wch: 16 }];
  XLSXLib.utils.book_append_sheet(wb, ws, sheetName);
  // نقل شيت الملخص لأول الملف
  wb.SheetNames.unshift(wb.SheetNames.pop() as string);
}

export const ALL_PERMISSIONS = [
  { key: "manage_passengers", label: "إدارة الحجاج (عرض، إضافة، تعديل، حذف)" },
  { key: "manage_buses", label: "إدارة الباصات" },
  { key: "manage_camps", label: "إدارة المخيمات" },
  { key: "manage_hotel", label: "إدارة الفندق" },
  { key: "view_reports", label: "التقارير (عرض، طباعة، تصدير)" },
  { key: "manage_users", label: "إدارة المستخدمين" },
  { key: "view_archive", label: "عرض الأرشيف" },
  { key: "manage_flights", label: "إدارة الطيران" },
  { key: "manage_payments", label: "إدارة الحسابات المالية" },
  { key: "manage_admins", label: "إدارة الإداريين" },
  { key: "manage_portal", label: "بوابة الحاج (التنبيهات والإعدادات)" },
  // س٨: صلاحية مستقلّة عمداً — لا تُدمج في manage_users، وإلا صار
  // المراقِب هو المراقَب. ولا بند NAV لها: لا شاشة عارض في س٨ (ق٤).
  { key: "view_audit", label: "سجل التدقيق (عرض)" },
];

export const ROOM_TYPES = ["فردية", "ثنائية", "ثلاثية", "رباعية"] as const;
export const ROOM_COLORS: Record<string, [string, string]> = { "فردية": ["var(--info-bg)", "var(--info)"], "ثنائية": ["var(--male-bg)", "var(--info)"], "ثلاثية": ["#f3e8ff", "#6B21A8"], "رباعية": ["var(--success-bg)", "var(--primary-dark)"] };

// ============================================================
// أيقونات ملوّنة موحّدة (باصات/مخيمات/غرف/رحلات) — صفحات التنظيم وصفحة التقارير
// ============================================================
export const ICON_COLOR_CYCLE = ["#7D1F3C", "#0C447C", "#2A9D8F", "#E8951A", "#8B3A6B", "#5C7C2E", "#B5651D", "#3F51B5"];
export const VIP_ICON_COLOR = "#B5651D";
export const ROOM_ICON_COLORS: Record<string, string> = { "فردية": "#5C7C2E", "ثنائية": "#0C447C", "ثلاثية": "#6B21A8", "رباعية": "#2A9D8F", "فارغة": "#999999" };
export const FLIGHT_ICON_COLORS: Record<string, string> = { "ذهاب": "#0C447C", "إياب": "#8B3A6B" };

export const NAV = [
  { section: "الرئيسية", items: [{ id: "dash", label: "الرئيسية", perm: "" }] },
  { section: "التنظيم", items: [{ id: "passengers", label: "الحجاج", perm: "manage_passengers" }, { id: "buses", label: "الباصات", perm: "manage_buses" }, { id: "flights", label: "الطيران", perm: "manage_flights" }, { id: "mina", label: "مخيمات منى", perm: "manage_camps" }, { id: "arafa", label: "مخيمات عرفة", perm: "manage_camps" }, { id: "hotel", label: "الفندق", perm: "manage_hotel" }] },
  { section: "التقارير", items: [{ id: "reports", label: "التقارير", perm: "view_reports" }] },
  { section: "بوابة الحاج", items: [{ id: "portal", label: "بوابة الحاج", perm: "manage_portal" }] },
  { section: "المواسم", items: [{ id: "archive", label: "إدارة المواسم", perm: "view_archive" }] },
  { section: "الإعدادات", items: [{ id: "users", label: "الإعدادات", perm: "manage_users" }, { id: "finance", label: "الحسابات", perm: "manage_payments" }, { id: "admins", label: "الإداريون", perm: "manage_admins" }] },
];

export const NAV_ICONS: Record<string, string> = {
  dash:       '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  passengers: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  buses:      '<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="15" cy="18" r="2"/>',
  flights:    '<path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>',
  mina:       '<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>',
  arafa:      '<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>',
  hotel:      '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M10 6h4"/><path d="M10 10h4"/>',
  reports:    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/>',
  archive:    '<rect x="2" y="4" width="20" height="5" rx="1"/><path d="M4 9v11h16V9"/><path d="M10 13h4"/>',
  users:      '<circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  finance:    '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  admins:     '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>',
};

export const inp = { fontSize: 12, background: "var(--bg-input)", border: "0.5px solid var(--border)", borderRadius: "var(--radius-md)", padding: "7px 10px", width: "100%", fontFamily: "var(--font-body)", outline: "none", boxSizing: "border-box" as const, color: "var(--text)" };
export const btnP = (extra?: any) => ({ background: "var(--primary)", color: "var(--text-inverse)", border: "none", padding: "7px 14px", borderRadius: "var(--radius-md)", fontSize: 12, cursor: "pointer", fontWeight: 500, fontFamily: "var(--font-body)", transition: "var(--transition)", ...extra });
export const btnS = (extra?: any) => ({ background: "transparent", border: "0.5px solid var(--border)", padding: "7px 12px", borderRadius: "var(--radius-md)", fontSize: 12, cursor: "pointer", color: "var(--text-secondary)", fontFamily: "var(--font-body)", transition: "var(--transition)", ...extra });


// ============================================================
// هل الحاج طالب هذه الخدمة؟
// ============================================================
// **الطيران وحده** يقبل «بدون» — قرارُ منتَجٍ لا تفصيل: الحاجّ قد
// يصل بتذكرته، فيُخصم «بدون تذكرة» من حسابه. أما الباص والغرفة
// ومخيّما منى وعرفة فخدماتٌ لا يستغني عنها حاجّ، ولا تعرضها أي
// قائمةٍ في النظام أصلاً (شاشة المسح والإضافة والتعديل تعرض
// «بدون» للطيران وحده). فكان تعميمُ الاستثناء على الخمس بابَ
// صمتٍ: قيمةٌ شاذّة في `services.bus` تُسقط الحاجّ من كل تنبيهات
// الباص بلا أثر يُرى.
export type ServiceKey = "bus" | "flight" | "hotel_type" | "camp_mina" | "camp_arafa";

const OPTIONAL_SERVICES: ReadonlySet<ServiceKey> = new Set<ServiceKey>(["flight"]);

export function wantsService(p: any, key: ServiceKey): boolean {
  if (!OPTIONAL_SERVICES.has(key)) return true;
  const v = (p?.services?.[key] ?? "").toString().trim();
  return v !== "بدون";
}

/* هل ينقص الحاج توزيع هذه الخدمة فعلياً؟
   (طالب الخدمة + لم يتم تعيينه بعد) */
export function isMissingService(p: any, key: ServiceKey): boolean {
  if (!wantsService(p, key)) return false;
  const idField: Record<ServiceKey, string> = {
    bus: "bus_id",
    flight: "flight_id",
    hotel_type: "room_id",
    camp_mina: "camp_mina_id",
    camp_arafa: "camp_arafa_id",
  };
  return p?.[idField[key]] == null;
}
