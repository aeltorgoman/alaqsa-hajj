/* ═══════════════════════════════════════════════════════════════
   مطابقةُ الحاجّ عند المسح والحفظ — وحدةٌ خالصةٌ بلا تبعيّات
   ═══════════════════════════════════════════════════════════════
   قاعدتان لا ثالث لهما، والقائمةُ المُمرَّرة هي حجّاجُ **الموسم المعروض**
   وحده (`App.tsx` يجلبها بـ`season_id`) — فحاجُّ موسمٍ سابق يُسجَّل جديداً.

   (أ) تطابقُ المستند: رقمُ الجواز أو الهوية نفسُه بعد تطبيعٍ لا يدمج رقمين
       مختلفين — حذفُ الفراغات، والأرقامُ العربيّة إلى لاتينيّة، والحروفُ
       كبيرة. لا شرطات تُحذف ولا أصفار. وهذا تكرارٌ مؤكَّد يمنع الحفظ.
       والقاعدةُ تفرضه أيضاً: فهرسٌ فريدٌ لكلّ موسم بالتطبيع نفسه
       (`20261101120000_passengers_document_uniqueness_per_season`).

   (ب) تشابهُ الاسم: **اقتراحٌ** لا هويّة، ولا يظهر إلا إذا
       ١) اتّفقت المكوّناتُ الثلاثة الأولى من الاسم الكامل **وتاريخُ الميلاد**، أو
       ٢) اتّفق الاسمُ الكامل كلُّه وفيه أربعةُ مكوّنات فأكثر.
       الاسمُ المختصر لا يدخل المقارنة، ولا الاسمُ الأول وحده ولا اثنان،
       ولا اسمُ العائلة ولا الجنسيّة ولا الجنس وحدها.
   ═══════════════════════════════════════════════════════════════ */

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹";
const toLatinDigits = (s: string) =>
  s.replace(/[٠-٩۰-۹]/g, d => String(ARABIC_INDIC.indexOf(d) % 10));

/** رقمُ مستندٍ للمقارنة: بلا فراغات، بأرقام لاتينيّة، بحروفٍ كبيرة — أو "" إن خلا.
 *  ⚠️ يطابق تعبيرَ الفهرس الفريد في القاعدة؛ ولا يحذف شيئاً غير الفراغ. */
export function normalizeDocNumber(value?: string | null): string {
  return toLatinDigits((value ?? "").replace(/\s+/g, "")).toUpperCase();
}

/* ── الاسم ─────────────────────────────────────────────────────── */

/** أدواتُ النسب ليست مكوّنات: «محمد بن علي» اسمان. */
const CONNECTORS = new Set(["بن", "ابن", "بنت", "bin", "ben", "ibn", "bint"]);
/** مقاطعُ تُكتب منفصلةً أو موصولة: «عبد الله» = «عبدالله»، «Al Hajri» = «AlHajri». */
const JOIN_NEXT = new Set(["عبد", "ابو", "ال", "abd", "abdul", "abdel", "abdal", "abdil", "abu", "abo", "al", "el"]);

/** يوحّد كتابةَ المقطع اللاتينيّ الموصول: abdul/abdel… ← abd. */
const canonLatin = (w: string) => w.replace(/^abd(?:ul|el|al|il)(?=.)/, "abd").replace(/^ab[uo](?=.)/, "abu").replace(/^el(?=.)/, "al");

/** مكوّناتُ الاسم الكامل بعد التطبيع — للعربيّة والإنجليزيّة معاً. */
export function nameComponents(value?: string | null): string[] {
  const text = (value ?? "")
    .normalize("NFKD")
    /* التشكيل والهمزات المركّبة (أ إ آ ؤ ئ تتفكّك إلى حرفٍ وعلامة) والمدّة والتطويل والنبر اللاتينيّ */
    .replace(/[̀-ͯؐ-ًؚ-ٰٟۖ-ۭـ]/g, "")
    .replace(/[ٱ]/g, "ا").replace(/ى/g, "ي").replace(/ی/g, "ي").replace(/ة/g, "ه").replace(/ک/g, "ك")
    .toLowerCase()
    /* كلُّ ما ليس حرفاً أو رقماً فاصل: الشرطة والنقطة والفاصلة والفراغات كلّها */
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  if (!text) return [];
  const out: string[] = [];
  let carry = "";
  for (const raw of text.split(" ")) {
    const w = canonLatin(raw);
    if (CONNECTORS.has(w)) continue;
    if (JOIN_NEXT.has(w)) { carry += w; continue; }
    out.push(canonLatin(carry + w));
    carry = "";
  }
  if (carry) out.push(carry);
  return out;
}

/* ── تاريخ الميلاد ─────────────────────────────────────────────── */

/** تاريخُ ميلادٍ صالح بصيغةٍ موحّدة YYYY-MM-DD — أو null إن غاب أو لم يصحّ.
 *  الصيغةُ المخزَّنة وصيغةُ القارئ DD/MM/YYYY؛ وتُقبل YYYY-MM-DD. */
export function normalizeDob(value?: string | null): string | null {
  const s = toLatinDigits((value ?? "").trim());
  let y: number, m: number, d: number;
  let r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (r) { d = +r[1]; m = +r[2]; y = +r[3]; }
  else if ((r = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/.exec(s))) { y = +r[1]; m = +r[2]; d = +r[3]; }
  else return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (y < 1900 || t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/* ── القاعدة (ب): اقتراحُ تشابهٍ بالاسم ─────────────────────────── */

export type NameMatchReason = "three_names_and_dob" | "full_name_four_plus";

/** سببُ اقتراح التشابه بين اسمين كاملين — أو null. اقتراحٌ لا هويّة. */
export function possibleNameMatch(
  storedName?: string | null, scannedName?: string | null,
  storedDob?: string | null, scannedDob?: string | null,
): NameMatchReason | null {
  const a = nameComponents(storedName), b = nameComponents(scannedName);
  if (a.length < 3 || b.length < 3) return null;
  if (!a.slice(0, 3).every((w, i) => w === b[i])) return null;
  if (a.length >= 4 && a.length === b.length && a.every((w, i) => w === b[i])) return "full_name_four_plus";
  const da = normalizeDob(storedDob), db = normalizeDob(scannedDob);
  return da && db && da === db ? "three_names_and_dob" : null;
}

type MatchablePilgrim = {
  id: number; name_ar?: string | null; name_en?: string | null; dob?: string | null;
  passport?: string | null; national_id?: string | null;
};

/** حجّاجُ الموسم المحتمَل تطابقُهم بالاسم مع مستندٍ ممسوح — بالاسم الكامل العربيّ أو الإنجليزيّ. */
export function nameMatchCandidates<P extends MatchablePilgrim>(
  pilgrims: readonly P[], scanned: { name_ar?: string | null; name_en?: string | null; dob?: string | null },
  excludeId?: number | null,
): P[] {
  return pilgrims.filter(p => p.id !== excludeId && (
    (!!scanned.name_ar && !!possibleNameMatch(p.name_ar, scanned.name_ar, p.dob, scanned.dob)) ||
    (!!scanned.name_en && !!possibleNameMatch(p.name_en, scanned.name_en, p.dob, scanned.dob))));
}

/* ── القاعدة (أ): تطابقُ المستند ───────────────────────────────── */

export type DocField = "passport" | "national_id";
export type DocConflict<P> = { field: DocField; pilgrim: P };

/** حاجُّ الموسم الذي يحمل رقمَ هذا المستند — لا يُعدّ الحاجُّ نفسُه (`excludeId`). */
export function findDocOwner<P extends MatchablePilgrim>(
  pilgrims: readonly P[], field: DocField, value?: string | null, excludeId?: number | null,
): P | undefined {
  const key = normalizeDocNumber(value);
  if (!key) return undefined;
  return pilgrims.find(p => p.id !== excludeId && normalizeDocNumber(p[field]) === key);
}

/** أوّلُ تعارضٍ لرقمَي الجواز والهوية مع حاجٍّ آخر في الموسم — أو null. */
export function findDocConflict<P extends MatchablePilgrim>(
  pilgrims: readonly P[], docs: { passport?: string | null; national_id?: string | null }, excludeId?: number | null,
): DocConflict<P> | null {
  for (const field of ["passport", "national_id"] as const) {
    const pilgrim = findDocOwner(pilgrims, field, docs[field], excludeId);
    if (pilgrim) return { field, pilgrim };
  }
  return null;
}

const FIELD_LABEL: Record<DocField, string> = { passport: "رقم الجواز", national_id: "رقم البطاقة الشخصية" };

/** رسالةُ التكرار المؤكَّد — تسمّي الحاجَّ الموجود. */
export function docConflictMessage(c: { field: DocField; pilgrim: { short_ar?: string | null; name_ar?: string | null; name_en?: string | null } }): string {
  const who = c.pilgrim.name_ar || c.pilgrim.short_ar || c.pilgrim.name_en || "حاجٍّ آخر";
  return `${FIELD_LABEL[c.field]} هذا مسجَّل في هذا الموسم للحاجّ «${who}» — لا يُحفظ رقمٌ واحد لحاجَّين.`;
}

/** خطأُ القاعدة حين يرفض الفهرسُ الفريد رقماً مكرَّراً (حفظٌ متزامن أو تجاوزٌ للواجهة). */
export function docUniqueViolation(error: { code?: string | null; message?: string | null } | null | undefined): DocField | null {
  if (!error) return null;
  const msg = error.message ?? "";
  if (error.code !== "23505" && !/duplicate key/i.test(msg)) return null;
  if (/passengers_season_passport_uniq/.test(msg)) return "passport";
  if (/passengers_season_national_id_uniq/.test(msg)) return "national_id";
  return null;
}

export const DOC_UNIQUE_MESSAGE: Record<DocField, string> = {
  passport: "رقم الجواز هذا مسجَّل بالفعل لحاجٍّ آخر في هذا الموسم — لم يُحفظ شيء.",
  national_id: "رقم البطاقة الشخصية هذا مسجَّل بالفعل لحاجٍّ آخر في هذا الموسم — لم يُحفظ شيء.",
};
