// ═══════════════════════════════════════════════════════════
// كتابات الحاويات — تعديلٌ وحذفٌ ببرهان
// ═══════════════════════════════════════════════════════════
// باصٌ أو مخيّمٌ أو رحلةٌ أو غرفة. «لا خطأ» ليس نجاحاً: سياسات الكتابة
// (`manage_buses` / `manage_camps` / `manage_flights` / `manage_hotel`) تحجب الصفّ عمّن
// لا يملكها فيمرّ الطلب بلا خطأ ولا يمسّ شيئاً، وصفٌّ حُذف من مكانٍ آخر
// لا يعود كذلك. فالنجاح صفٌّ واحدٌ بعينه عائداً من القاعدة، وما سواه
// يُقرأ الصفُّ بعده ليُعرَف لماذا — فتُعرض الحقيقة لا الأمنية.
import { useCallback, useRef } from "react";
import { supabase } from "../../supabase";

type ContainerTable = "buses" | "camps" | "flights" | "rooms";
type Row = Record<string, unknown>;

/* `ok` كُتب · `stale` غيّر غيرُك حقلاً شرطناه (و`current` قيمته الآن)
   · `gone` لم يعد الصفّ موجوداً · `denied` موجودٌ ولم يُكتب (الصلاحية)
   · `uncertain` انقطع الطلب ولا يُعرف ما وقع (و`current` ما في القاعدة
   الآن إن قُرئ، أو `undefined` إن تعذّرت القراءة) · `error` رفضته القاعدة */
export type UpdateOutcome =
  | { kind: "ok" }
  | { kind: "stale"; current: Row }
  | { kind: "gone" }
  | { kind: "denied" }
  | { kind: "uncertain"; current?: Row | null }
  | { kind: "error"; message: string };

/* `inUse` رفضه المفتاح الأجنبي: أُسند إلى الحاوية مسافرون من مكانٍ آخر */
export type DeleteOutcome =
  | { kind: "ok" }
  | { kind: "gone" }
  | { kind: "denied" }
  | { kind: "inUse" }
  | { kind: "uncertain"; exists?: boolean }
  | { kind: "error"; message: string };

/* خطأٌ بلا رمزٍ من القاعدة = لم يصل ردّها (شبكة، أو بوّابة) — النتيجة مجهولة */
const isUncertain = (error: { code?: string }) => !error.code;

/* الإسناد إلى `from()` باسمٍ متغيّر — الأنواع لكلّ جدول على حدة، والحقول
   يحدّدها المنادي من نوع حاويته */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (t: ContainerTable) => supabase.from(t) as any;

const readRow = async (t: ContainerTable, id: number): Promise<{ ok: true; row: Row | null } | { ok: false }> => {
  const { data, error } = await table(t).select("*").eq("id", id).maybeSingle();
  return error ? { ok: false } : { ok: true, row: (data as Row | null) ?? null };
};

/* تعديلٌ مشروط: `patch` ما يُكتب، و`expect` ما يجب أن تكونه الحقول حين
   الكتابة (`null` = فارغ) — فلا يُكتب فوق ما غيّره غيرُك في الأثناء */
export async function updateContainer(t: ContainerTable, id: number, patch: Row, expect: Row = {}): Promise<UpdateOutcome> {
  let q = table(t).update(patch).eq("id", id);
  for (const [k, v] of Object.entries(expect)) q = v === null ? q.is(k, null) : q.eq(k, v);
  const { data, error } = await q.select("id");
  if (error) {
    if (!isUncertain(error)) return { kind: "error", message: error.message };
    const r = await readRow(t, id);
    return { kind: "uncertain", current: r.ok ? r.row : undefined };
  }
  if (Array.isArray(data) && data.length === 1 && (data[0] as Row).id === id) return { kind: "ok" };
  const r = await readRow(t, id);
  if (!r.ok) return { kind: "uncertain" };
  if (!r.row) return { kind: "gone" };
  const current = r.row;
  if (Object.entries(expect).some(([k, v]) => (current[k] ?? null) !== v)) return { kind: "stale", current };
  return { kind: "denied" };
}

export async function deleteContainer(t: ContainerTable, id: number): Promise<DeleteOutcome> {
  const { data, error } = await table(t).delete().eq("id", id).select("id");
  if (error) {
    if (error.code === "23503") return { kind: "inUse" };
    if (!isUncertain(error)) return { kind: "error", message: error.message };
    const r = await readRow(t, id);
    return { kind: "uncertain", exists: r.ok ? r.row != null : undefined };
  }
  if (Array.isArray(data) && data.length === 1) return { kind: "ok" };
  const r = await readRow(t, id);
  if (!r.ok) return { kind: "uncertain" };
  return r.row ? { kind: "denied" } : { kind: "gone" };
}

/* طلبٌ واحدٌ جارٍ لكلّ مفتاح: النقرة الثانية (أو Enter ثم الخروج من الحقل)
   قبل انتهاء الأولى لا تُرسَل — بلا تعطيلٍ مرئيّ للأزرار */
export function useInFlight() {
  const busy = useRef(new Set<string>());
  return useCallback(async (key: string, fn: () => Promise<void>) => {
    if (busy.current.has(key)) return;
    busy.current.add(key);
    try { await fn(); } finally { busy.current.delete(key); }
  }, []);
}

// ═══════════════════════════════════════════════════════════
// الرسائل — واحدةٌ للصفحات الثلاث، ولا تُظهر تفاصيل القاعدة
// ═══════════════════════════════════════════════════════════
// `label` اسم الحاوية كما يُقرأ («الباص «٣»»)، و`what` العمليّة
// («تعذر تعديل سعة الباص»). و`apply` ما تفعله الصفحة بحالتها:
// `remove` الحاوية لم تعد موجودة، و`merge` تُستبدل بقيمتها الفعليّة.
export type Feedback = {
  type: "error" | "warning";
  message: string;
  apply?: { kind: "remove" } | { kind: "merge"; row: Row };
};

export function updateFeedback(r: Exclude<UpdateOutcome, { kind: "ok" }>, label: string, what: string, dbMessage: (fallback: string, msg?: string) => string, fem = false): Feedback {
  const g = (m: string, f: string) => fem ? f : m;
  switch (r.kind) {
    case "gone":
      return { type: "warning", message: `${what}: ${label} ${g("حُذف", "حُذفت")} من مكانٍ آخر — لم يُحفظ شيء.`, apply: { kind: "remove" } };
    case "stale":
      return { type: "warning", message: `${what}: غيّر غيرُك ${label} في الأثناء — لم يُحفظ تعديلك، وعُرضت القيمة الحالية.`, apply: { kind: "merge", row: r.current } };
    case "denied":
      return { type: "error", message: `${what}: لم يتغيّر شيء — قد لا تملك صلاحية تعديل ${label}. حدّث الصفحة.` };
    case "uncertain":
      if (r.current === null) return { type: "warning", message: `${what}: انقطع الاتصال، وتبيّن أن ${label} ${g("لم يعد موجوداً", "لم تعد موجودة")}.`, apply: { kind: "remove" } };
      if (r.current) return { type: "warning", message: `${what}: انقطع الاتصال فلم يُعرف إن حُفظ التعديل — عُرضت القيمة المحفوظة فعلاً.`, apply: { kind: "merge", row: r.current } };
      return { type: "error", message: `${what}: انقطع الاتصال فلم يُعرف إن حُفظ التعديل — تحقّق من الاتصال ثم حدّث الصفحة.` };
    case "error":
      return { type: "error", message: dbMessage(what, r.message) };
  }
}

export function deleteFeedback(r: Exclude<DeleteOutcome, { kind: "ok" }>, label: string, what: string, dbMessage: (fallback: string, msg?: string) => string, fem = false): Feedback {
  const g = (m: string, f: string) => fem ? f : m;
  switch (r.kind) {
    case "gone":
      return { type: "warning", message: `${label} ${g("كان قد حُذف", "كانت قد حُذفت")} من مكانٍ آخر.`, apply: { kind: "remove" } };
    case "inUse":
      return { type: "warning", message: `${what}: أُسند إلى ${label} مسافرون من مكانٍ آخر في الأثناء — ${g("لم يُحذف", "لم تُحذف")}. حدّث الصفحة لعرضهم، وأخرِجهم قبل الحذف.` };
    case "denied":
      return { type: "error", message: `${what}: ${g("لم يُحذف", "لم تُحذف")} ${label} — قد لا تملك صلاحية ${g("حذفه", "حذفها")}. حدّث الصفحة.` };
    case "uncertain":
      if (r.exists === false) return { type: "warning", message: `انقطع الاتصال، وتبيّن أن ${label} ${g("حُذف", "حُذفت")}.`, apply: { kind: "remove" } };
      if (r.exists === true) return { type: "error", message: `${what}: انقطع الاتصال ${g("ولم يُحذف", "ولم تُحذف")} ${label} — أعد المحاولة.` };
      return { type: "error", message: `${what}: انقطع الاتصال فلم يُعرف إن ${g("حُذف", "حُذفت")} ${label} — تحقّق من الاتصال ثم حدّث الصفحة.` };
    case "error":
      return { type: "error", message: dbMessage(what, r.message) };
  }
}
