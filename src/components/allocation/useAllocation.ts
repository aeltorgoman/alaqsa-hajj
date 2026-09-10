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
export type AllocColumn = "bus_id" | "camp_mina_id" | "camp_arafa_id";

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

  /* إسناد واحد */
  const assign = useCallback(async (passengerId: number, containerId: number, fallback: string): Promise<boolean> => {
    if (!guard()) return false;
    const { error } = await supabase.from("passengers")
      .update({ [column]: containerId } as TablesUpdate<"passengers">).eq("id", passengerId);
    if (error) { console.error(fallback, error); showAlert("error", allocWriteError(fallback, error.message)); return false; }
    setPassengers(prev => prev.map(p => p.id === passengerId ? { ...p, [column]: containerId } : p));
    return true;
  }, [column, guard, setPassengers, showAlert]);

  /* إسناد دفعة — واحداً بعد واحد لا على التوازي: السقف في القاعدة
     يقفل صفّ الحاوية، وعشرون طلباً متوازياً على قفلٍ واحد يطيل
     الانتظار بلا فائدة. والتسلسل يجعل الرفض دقيقاً: نعرف من دخل
     ومن ردّته السعة. */
  const assignMany = useCallback(async (passengerIds: number[], containerId: number, fallback: string): Promise<number> => {
    if (!guard()) return 0;
    const done: number[] = [];
    let firstError: string | undefined;
    for (const id of passengerIds) {
      const { error } = await supabase.from("passengers")
        .update({ [column]: containerId } as TablesUpdate<"passengers">).eq("id", id);
      if (error) { console.error(fallback, error); firstError = error.message; break; }
      done.push(id);
    }
    if (done.length) {
      const set = new Set(done);
      setPassengers(prev => prev.map(p => set.has(p.id) ? { ...p, [column]: containerId } : p));
    }
    if (firstError) showAlert("error", allocWriteError(fallback, firstError));
    return done.length;
  }, [column, guard, setPassengers, showAlert]);

  /* إخراج — لا يُفحص سقفٌ عند إخلاء مقعد */
  const unassign = useCallback(async (passengerId: number, fallback: string): Promise<boolean> => {
    if (!guard()) return false;
    const { error } = await supabase.from("passengers")
      .update({ [column]: null } as TablesUpdate<"passengers">).eq("id", passengerId);
    if (error) { console.error(fallback, error); showAlert("error", allocWriteError(fallback, error.message)); return false; }
    setPassengers(prev => prev.map(p => p.id === passengerId ? { ...p, [column]: null } : p));
    return true;
  }, [column, guard, setPassengers, showAlert]);

  /* الترتيب يكتب في عمود الحاوية وحده — `bus_sort_order` للباص،
     و`camp_mina_sort_order` لمنى، و`camp_arafa_sort_order` لعرفة.
     كانت الكتابة في `sort_order` العام فتسحق ترتيب كل حاويةٍ أخرى،
     إذ يبدأ كلٌّ ترقيمه من ١. والعمود يأتي من المنادي فلا يُخطأ. */
  const reorder = useCallback(async (ordered: { id: number }[], fallback: string): Promise<boolean> => {
    if (!guard()) return false;
    setPassengers(prev => applyReorder(prev, orderColumn, ordered));
    const results = await Promise.all(reorderUpdates(orderColumn, ordered));
    const failed = results.filter(r => r.error);
    if (failed.length) {
      console.error(fallback, failed.map(f => f.error));
      showAlert("error", fallback);
      return false;
    }
    return true;
  }, [guard, orderColumn, setPassengers, showAlert]);

  return { assign, assignMany, unassign, reorder };
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
