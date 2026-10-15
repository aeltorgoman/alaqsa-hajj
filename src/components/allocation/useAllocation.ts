// ════════════════════════════════════════════════════════════
// آليّات التوزيع المشتركة — لا قواعدَ عملٍ فيها
// ════════════════════════════════════════════════════════════
// كانت ماكينة السحب مكرّرةً حرفياً في `BusesPage` و`CampsPage`:
// مرجعان و‍أربع حالات وخمسة معالِجات، بفرقٍ واحدٍ هو اسم العمود.
// وكذلك الكتابة: `update({col: id})` ثم تحديثٌ تفاؤليّ — أربع مرّات
// في كل صفحة.
//
// ما هنا **ميكانيكا**: تسحب، ترتّب، تكتب ما يُقال لها. ولا تقرّر
// شيئاً — لا جنساً ولا سعةً ولا تطابق خدمة. كل ذلك يبقى مكتوباً في
// `BusesPage` و`CampsPage` حيث يُراجَع.
import { useCallback, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { supabase } from "../../supabase";
import type { Passenger } from "../../types";
import type { TablesUpdate } from "../../types/database";
import { reorderUpdates, applyReorder } from "../../utils/passenger";
import type { OrderColumn } from "../../utils/passenger";

/* عمود الإسناد — حرفيّ لا string عام، فالفهرسة به آمنة نوعياً */
export type AllocColumn =
  | "bus_id" | "camp_mina_id" | "camp_arafa_id"
  /* الطيران ساقان مستقلّتان، وكلٌّ عمودُ إسنادٍ كالباص والمخيّم —
     فالبدائل نفسها تخدمهما. والقواعد تبقى في `FlightsPage`. */
  | "flight_id" | "return_flight_id";

/* رسائل القاعدة بالعربية وجاهزةٌ للعرض (errcode P0001): السقف
   والجنس والموسم ونوع الصفحة. فتُعرض كما هي بدل نصٍّ عامٍّ يخفيها.
   وما لم يكن منها — خطأ شبكةٍ أو قيدٌ تقنيّ — يُترجَم إلى نصّ
   الصفحة، فلا يرى الموظّف كلام بوستجرس. */
export function allocWriteError(fallback: string, msg?: string): string {
  if (!msg) return fallback;
  if (/duplicate key|unique constraint/i.test(msg)) return fallback;
  if (/violates foreign key/i.test(msg)) return fallback;
  /* علامةُ أنها رسالتنا: حرفٌ عربيّ في النصّ */
  return /[؀-ۿ]/.test(msg) ? msg : fallback;
}

// ═══════════════════════════════════════════════════════════
// الكتابة — بدائلُ صمّاء
// ═══════════════════════════════════════════════════════════
// تنفّذ ولا تسأل: المنادي فحص قواعده قبل أن يدعوها، والقاعدة هي
// الحدّ الأخير. وترجع true عند النجاح فقط، فلا تُحدَّث الحالة
// المحليّة على كتابةٍ لم تقع.
//
// ⚠️ برهانُ الكتابة صفُّ الحاجّ نفسُه عائداً من القاعدة: سياسةُ
// `passengers_update` تحجب الصفَّ عمّن لا يملك صلاحيّته (حاجٌّ بلا
// `manage_passengers`، أو إداريٌّ بلا `manage_admins`)، فيمرّ الطلب
// بلا خطأ ولا يمسّ شيئاً. فالنجاحُ عودةُ صفّه بعينه، وصفرُ صفوفٍ فشل.

/* نتيجة النقل المشروط: «stale» = لم يعد الحاجّ في الحاوية المتوقَّعة
   (غيّره غيرُك) — لم يُكتب شيء، وحُدِّثت الحالة المحليّة بقيمته الفعليّة */
export type MoveOutcome = "ok" | "stale" | "failed";

const NO_ROWS = "لم يتغيّر شيء في قاعدة البيانات — قد لا تملك صلاحية تعديل هذا المسافر.";

export function useAllocationWrites({
  column, orderColumn, setPassengers, readOnly, showAlert, onBlocked,
}: {
  column: AllocColumn;
  orderColumn: OrderColumn;
  setPassengers: Dispatch<SetStateAction<Passenger[]>>;
  readOnly: boolean;
  showAlert: (type: "error" | "warning", message: string) => void;
  onBlocked: () => void;   // رسالة «موسم للعرض فقط» — من طبقة الموسم
}) {
  const guard = useCallback(() => {
    if (readOnly) { onBlocked(); return false; }
    return true;
  }, [readOnly, onBlocked]);

  /* كتابةٌ واحدة ببرهانها. `expectFrom` (اختياريّ) شرطٌ على القيمة الحاليّة
     داخل الطلب نفسه: لا يُكتب إلا إن كان الحاجّ حيث يُظَنّ — `null` = غير موزَّع. */
  const writeOne = useCallback(async (passengerId: number, value: number | null, expectFrom?: number | null) => {
    let q = supabase.from("passengers")
      .update({ [column]: value } as TablesUpdate<"passengers">).eq("id", passengerId);
    if (expectFrom !== undefined) q = expectFrom === null ? q.is(column, null) : q.eq(column, expectFrom);
    const { data, error } = await q.select("id");
    if (error) return { ok: false as const, message: error.message };
    if (!data || data.length !== 1 || data[0].id !== passengerId) return { ok: false as const, noRows: true };
    return { ok: true as const };
  }, [column]);

  /* القيمة الفعليّة في القاعدة — لتمييز «تغيّر من مكانٍ آخر» من «حجبته الصلاحية» */
  const readCurrent = useCallback(async (passengerId: number): Promise<{ found: boolean; value: number | null }> => {
    const { data, error } = await supabase.from("passengers").select(column).eq("id", passengerId).maybeSingle();
    if (error || !data) return { found: false, value: null };
    return { found: true, value: (data as Record<string, number | null>)[column] ?? null };
  }, [column]);

  /* إسناد واحد */
  const assign = useCallback(async (passengerId: number, containerId: number, fallback: string): Promise<boolean> => {
    if (!guard()) return false;
    const r = await writeOne(passengerId, containerId);
    if (!r.ok) {
      console.error(fallback, r);
      showAlert("error", r.noRows ? `${fallback}: ${NO_ROWS}` : allocWriteError(fallback, r.message));
      return false;
    }
    setPassengers(prev => prev.map(p => p.id === passengerId ? { ...p, [column]: containerId } : p));
    return true;
  }, [column, guard, setPassengers, showAlert, writeOne]);

  /* نقلٌ مشروط: من `expectFrom` إلى `containerId` في طلبٍ واحد — لا إخراجَ ثم
     إسناد. فإن لم يعد الحاجّ حيث يُظَنّ لم يُكتب شيء، وتُحدَّث الحالة المحليّة
     بقيمته الفعليّة، ويقرّر المنادي ما يقول («stale»). */
  const move = useCallback(async (passengerId: number, expectFrom: number | null, containerId: number, fallback: string): Promise<MoveOutcome> => {
    if (!guard()) return "failed";
    const r = await writeOne(passengerId, containerId, expectFrom);
    if (r.ok) {
      setPassengers(prev => prev.map(p => p.id === passengerId ? { ...p, [column]: containerId } : p));
      return "ok";
    }
    if (r.noRows) {
      const cur = await readCurrent(passengerId);
      if (cur.found && cur.value !== expectFrom) {
        setPassengers(prev => prev.map(p => p.id === passengerId ? { ...p, [column]: cur.value } : p));
        return "stale";
      }
    }
    console.error(fallback, r);
    showAlert("error", r.noRows ? `${fallback}: ${NO_ROWS}` : allocWriteError(fallback, r.message));
    return "failed";
  }, [column, guard, readCurrent, setPassengers, showAlert, writeOne]);

  /* إسناد دفعة — واحداً بعد واحد لا على التوازي: السقف في القاعدة
     يقفل صفّ الحاوية، وعشرون طلباً متوازياً على قفلٍ واحد يطيل
     الانتظار بلا فائدة. والتسلسل يجعل الرفض دقيقاً: نعرف من دخل
     ومن ردّته السعة. و`expectFrom` (اختياريّ) كما في `move`. */
  const assignMany = useCallback(async (passengerIds: number[], containerId: number, fallback: string, expectFrom?: number | null): Promise<number> => {
    if (!guard()) return 0;
    const done: number[] = [];
    let failure: string | undefined;
    for (const id of passengerIds) {
      const r = await writeOne(id, containerId, expectFrom);
      if (!r.ok) {
        console.error(fallback, r);
        failure = r.noRows
          ? (expectFrom !== undefined ? `${fallback}: تغيّر توزيع أحد المسافرين من مكانٍ آخر، أو ${NO_ROWS}` : `${fallback}: ${NO_ROWS}`)
          : allocWriteError(fallback, r.message);
        break;
      }
      done.push(id);
    }
    if (done.length) {
      const set = new Set(done);
      setPassengers(prev => prev.map(p => set.has(p.id) ? { ...p, [column]: containerId } : p));
    }
    if (failure) showAlert("error", failure);
    return done.length;
  }, [column, guard, setPassengers, showAlert, writeOne]);

  /* إخراج — لا يُفحص سقفٌ عند إخلاء مقعد */
  const unassign = useCallback(async (passengerId: number, fallback: string): Promise<boolean> => {
    if (!guard()) return false;
    const r = await writeOne(passengerId, null);
    if (!r.ok) {
      console.error(fallback, r);
      showAlert("error", r.noRows ? `${fallback}: ${NO_ROWS}` : allocWriteError(fallback, r.message));
      return false;
    }
    setPassengers(prev => prev.map(p => p.id === passengerId ? { ...p, [column]: null } : p));
    return true;
  }, [column, guard, setPassengers, showAlert, writeOne]);

  /* الترتيب يكتب في عمود الحاوية وحده — `bus_sort_order` للباص،
     و`camp_mina_sort_order` لمنى، و`camp_arafa_sort_order` لعرفة.
     كانت الكتابة في `sort_order` العام فتسحق ترتيب كل حاويةٍ أخرى،
     إذ يبدأ كلٌّ ترقيمه من ١. والعمود يأتي من المنادي فلا يُخطأ.
     والعرضُ تفاؤليّ (السحب يستجيب فوراً)، وما رفضته القاعدة — خطأً أو
     صفراً من الصفوف — يُعاد إلى قيمته الفعليّة مقروءةً منها. */
  const reorder = useCallback(async (ordered: { id: number }[], fallback: string): Promise<boolean> => {
    if (!guard()) return false;
    setPassengers(prev => applyReorder(prev, orderColumn, ordered));
    const results = await Promise.all(reorderUpdates(orderColumn, ordered).map(q => q.select("id")));
    const failedIds = ordered
      .filter((item, i) => { const r = results[i]; return !!r.error || !r.data || r.data.length !== 1 || r.data[0].id !== item.id; })
      .map(item => item.id);
    if (!failedIds.length) return true;
    console.error(fallback, { failedIds, errors: results.filter(r => r.error).map(r => r.error) });
    const { data: actual, error } = await supabase.from("passengers").select(`id, ${orderColumn}`).in("id", failedIds);
    if (!error && actual) {
      const back = new Map((actual as unknown as Record<string, number | null>[]).map(row => [row.id as number, row[orderColumn] ?? null]));
      setPassengers(prev => prev.map(p => back.has(p.id) ? { ...p, [orderColumn]: back.get(p.id) } : p));
      showAlert("error", fallback);
    } else {
      showAlert("error", `${fallback} — حدّث الصفحة لعرض الترتيب المحفوظ فعلاً`);
    }
    return false;
  }, [guard, orderColumn, setPassengers, showAlert]);

  return { assign, move, assignMany, unassign, reorder };
}

// ═══════════════════════════════════════════════════════════
// السحب — حالةٌ ومعالِجات
// ═══════════════════════════════════════════════════════════
// نوعان: سحبٌ من المنتقي (إضافة) وسحبٌ داخل القائمة (ترتيب).
// والفرق محفوظٌ في `kind` كما كان في `dragType`.
export function useAllocationDrag({ onAdd, onReorder }: {
  onAdd: (passengerId: number) => void;
  onReorder: (ordered: { id: number }[], fromId: number, toId: number) => void;
}) {
  const fromId = useRef<number | null>(null);
  const overId = useRef<number | null>(null);
  const kind = useRef<"reorder" | "add">("reorder");
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  const reset = useCallback(() => {
    setDraggingId(null); setDragOverId(null);
    fromId.current = null; overId.current = null;
  }, []);

  const startReorder = useCallback((id: number) => { kind.current = "reorder"; fromId.current = id; setDraggingId(id); }, []);
  const startAdd = useCallback((id: number) => { kind.current = "add"; fromId.current = id; setDraggingId(id); }, []);
  const over = useCallback((e: React.DragEvent, id: number) => { e.preventDefault(); overId.current = id; setDragOverId(id); }, []);

  /* `items` ترتيبُ القائمة الحاليّ للحاوية التي أُفلت عليها */
  const drop = useCallback((items: { id: number }[]) => {
    const from = fromId.current;
    if (kind.current === "add") {
      if (from != null) onAdd(from);
      reset();
      return;
    }
    const to = overId.current;
    if (from == null || to == null || from === to) { reset(); return; }
    const fromIdx = items.findIndex(p => p.id === from);
    const toIdx = items.findIndex(p => p.id === to);
    if (fromIdx === -1 || toIdx === -1) { reset(); return; }
    const next = [...items];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    onReorder(next, from, to);
    reset();
  }, [onAdd, onReorder, reset]);

  return { draggingId, dragOverId, startReorder, startAdd, over, drop, end: reset };
}

// ═══════════════════════════════════════════════════════════
// اختيار الحاوية — الفتح والإغلاق وتصفير البحث
// ═══════════════════════════════════════════════════════════
export function useContainerSelection() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());

  /* الفتح والإغلاق يصفّران البحث والتحديد معاً: «٣ محدد» من باصٍ
     آخر خطأٌ ينتظر، فلا يُحمل من حاوية إلى حاوية. */
  const close = useCallback(() => { setSelectedId(null); setPickerSearch(""); setPicked(new Set()); }, []);
  const open = useCallback((id: number) => { setSelectedId(id); setPickerSearch(""); setPicked(new Set()); }, []);

  const toggle = useCallback((id: number) => {
    setPicked(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  return { selectedId, open, close, pickerSearch, setPickerSearch, picked, setPicked, toggle };
}

/* بحثٌ واحدٌ عن مسافر في الصفحتين: الاسم الكامل والاسم المختصر
   معاً. كان الباص يشمل `short_ar` والمخيّم لا يشمله. */
export function matchesPassenger(p: { name_ar?: string | null; short_ar?: string | null }, q: string): boolean {
  if (!q) return true;
  const t = q.trim();
  return (p.name_ar || "").includes(t) || (p.short_ar || "").includes(t);
}

// ═══════════════════════════════════════════════════════════
// ترتيب الحاويات — بطاقاتٌ لا نازلين
// ═══════════════════════════════════════════════════════════
// هذا **ليس** `useAllocationDrag`. ذاك يسحب مسافراً داخل قائمة
// حاويةٍ واحدة أو من المنتقي إليها؛ وهذا يسحب الحاوية نفسها بين
// أخواتها. والدلالتان تختلفان اختلافاً تاماً:
//
//   `passengers.camp_mina_sort_order` — ترتيب النازل داخل مخيّم.
//   `camps.sort_order`                — ترتيب المخيّمات نفسها.
//
// وخلطهما في خطّافٍ واحد كان سيوفّر أسطراً ويكلّف وضوحاً — والوضوح
// أغلى. فالحالة منفصلة هنا، والمجموعة (`groupKey`) تمنع الإفلات
// عبر الحدود: بطاقة رجالٍ لا تُفلَت في مجموعة النساء، ومنى لا
// تُفلَت في عرفة — لأن كل مجموعةٍ تُرسم بمفتاحها ولا يتقاطعان.
export function useContainerReorder<T extends { id: number }>({ onReorder }: {
  onReorder: (groupKey: string, ordered: T[]) => void;
}) {
  const from = useRef<{ id: number; group: string } | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);

  const reset = useCallback(() => { from.current = null; setDraggingId(null); setOverId(null); }, []);

  const start = useCallback((id: number, group: string) => {
    from.current = { id, group };
    setDraggingId(id);
  }, []);

  /* الإفلات خارج المجموعة يُلغى بلا كتابة — لا يُنقل جنسٌ ولا
     نوعُ صفحة، ولا تتغيّر أي خاصّيّة للمخيّم غير موضعه. */
  const over = useCallback((e: React.DragEvent, id: number, group: string) => {
    if (!from.current || from.current.group !== group) return;
    e.preventDefault();
    setOverId(id);
  }, []);

  const drop = useCallback((group: string, items: T[]) => {
    const src = from.current;
    if (!src || src.group !== group || overId == null || overId === src.id) { reset(); return; }
    const fromIdx = items.findIndex(c => c.id === src.id);
    const toIdx = items.findIndex(c => c.id === overId);
    if (fromIdx === -1 || toIdx === -1) { reset(); return; }
    const next = [...items];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    onReorder(group, next);
    reset();
  }, [onReorder, overId, reset]);

  return { draggingId, overId, start, over, drop, end: reset };
}
