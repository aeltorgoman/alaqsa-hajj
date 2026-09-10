import { useState, useEffect, useMemo } from "react";
import { isHajj, byOrder } from "../utils/passenger";
import type { Dispatch, SetStateAction } from "react";
import { supabase } from "../supabase";
import type { Passenger, Camp } from "../types";
import { Modal } from "./Modal";
import { AlertModal, useAlert, ConfirmModal, useConfirm } from "./AlertModal";
import { StatsRow, type StatCardData } from "./StatCard";
import { useReportBranding } from "../company/CompanyContext";
import { inp, btnP, btnS, makeHTML, printInPage, makeTwoLogoSectionHTML, joinSections, renderNamesTable } from "../utils";
import { useSeasonWrite } from "../season/useSeasonWrite";
import { useSeason } from "../season/useSeason";
import {
  ALLOC_GRID, ALLOC_GAP, AllocationCard, AllocationDialog, AllocationSearch, AllocationStates,
  AssignedRow, CapacityBar, DialogAction, PassengerPicker, RosterHeader, SuggestionStrip,
  type PickerItem, type SuggestionItem,
} from "./allocation/AllocationUI";
import {
  allocWriteError, matchesPassenger, useAllocationDrag, useAllocationWrites, useContainerReorder, useContainerSelection,
} from "./allocation/useAllocation";

/* مفاتيح الأعمدة والخدمة — حرفيّة لا string عام، فالفهرسة بها آمنة
   نوعياً. ومنى وعرفة يفترقان هنا وحدهما: عمودُ إسنادٍ وعمودُ ترتيبٍ
   ومفتاحُ خدمة. ما بعد ذلك واحد. */
type CampIdKey = "camp_mina_id" | "camp_arafa_id";
type CampServiceKey = "camp_mina" | "camp_arafa";

const MinaIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M3.5 21 14 3" /><path d="M20.5 21 10 3" /><path d="M15.5 21 12 15l-3.5 6" /><path d="M2 21h20" />
  </svg>
);
const ArafaIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
  </svg>
);

const paxLabel = (n: number) => n === 1 ? "نازل واحد" : n === 2 ? "نازلان" : n <= 10 ? `${n} نازلين` : `${n} نازلاً`;
const placesLabel = (n: number) => n === 1 ? "مكان واحد متبقٍ" : n === 2 ? "مكانان متبقيان" : n <= 10 ? `${n} أماكن متبقية` : `${n} مكاناً متبقياً`;

// ===== إحصائيات المخيمات =====
function CampsStats({ camps, passengers, campIdKey, campServiceKey }: { camps: Camp[]; passengers: Passenger[]; campIdKey: CampIdKey; campServiceKey: CampServiceKey }) {
  const stats = useMemo(() => {
    const hajj = passengers.filter(p => isHajj(p));
    const total = hajj.length;
    const assignedCount = hajj.filter(p => p[campIdKey] != null).length;
    const unassigned = total - assignedCount;
    const specialRequested = hajj.filter(p => p.services[campServiceKey] === "خاص").length;
    return { total, assignedCount, unassigned, specialRequested };
  }, [passengers, campIdKey, campServiceKey]);
  const { total, assignedCount, unassigned, specialRequested } = stats;

  /* السعة قد تكون غير محدّدة لمخيّمٍ أُنشئ قبل عمود السعة، فلا
     تُحتسب في الإجمالي — وإلا صار «١٢ مكاناً متاحاً» كذباً */
  const withCap = camps.filter(c => c.capacity != null);
  const totalPlaces = withCap.reduce((s, c) => s + (c.capacity || 0), 0);
  const takenInCapped = passengers.filter(p => withCap.some(c => c.id === p[campIdKey])).length;

  const cards: StatCardData[] = [
    { label: "إجمالي الحجاج", num: total, sub: "الموسم الحالي", tone: "brand" },
    { label: "غير موزّعين", num: unassigned, sub: unassigned > 0 ? "يحتاج توزيع" : "مكتمل", tone: unassigned > 0 ? "danger" : "muted" },
    { label: "أماكن متاحة", num: Math.max(0, totalPlaces - takenInCapped), sub: withCap.length === camps.length ? `من ${totalPlaces} مكان` : `${camps.length - withCap.length} مخيّم بلا سعة`, tone: "info" },
    { label: "طالبين خاص", num: specialRequested, sub: `${total ? Math.round(specialRequested / total * 100) : 0}٪ من الإجمالي`, tone: "warning" },
    { label: "نسبة التوزيع", num: `${total ? Math.round(assignedCount / total * 100) : 0}٪`, sub: `${assignedCount} من ${total} حاج`, tone: "success", featured: true },
  ];

  return <StatsRow cards={cards} />;
}

// ===== صفحة المخيمات — منى وعرفة تهيئتان لتطبيقٍ واحد =====
function CampsPage({ pageType, passengers, setPassengers }: { pageType: "منى" | "عرفة"; passengers: Passenger[]; setPassengers: Dispatch<SetStateAction<Passenger[]>> }) {
  const branding = useReportBranding();
  const { alert: alertState, showAlert } = useAlert();
  const { confirmState, confirmAction, handleConfirm, handleCancel } = useConfirm();
  const { assertWritable, readOnly } = useSeasonWrite(showAlert);
  const { viewedSeason } = useSeason();

  const roOff = readOnly ? { opacity: 0.4, pointerEvents: "none" as const } : null;
  const isMina = pageType === "منى";
  const campIdKey: CampIdKey = isMina ? "camp_mina_id" : "camp_arafa_id";
  const campOrderKey = isMina ? "camp_mina_sort_order" : "camp_arafa_sort_order";
  const serviceKey: CampServiceKey = isMina ? "camp_mina" : "camp_arafa";
  const Icon = isMina ? MinaIcon : ArafaIcon;

  const [camps, setCamps] = useState<Camp[]>([]);
  const [campsLoading, setCampsLoading] = useState(true);
  const [campsError, setCampsError] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingCap, setEditingCap] = useState(false);
  const [capDraft, setCapDraft] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [campName, setCampName] = useState("");
  const [campGender, setCampGender] = useState<"ذكر" | "أنثى">("ذكر");
  const [campType, setCampType] = useState<"عادي" | "خاص">("عادي");
  const [campCapacity, setCampCapacity] = useState("");
  const [formError, setFormError] = useState("");
  const [dismissed, setDismissed] = useState(new Set<number>());
  const [campSearch, setCampSearch] = useState("");

  const sel = useContainerSelection();
  const selectedCamp = camps.find(c => c.id === sel.selectedId) || null;

  useEffect(() => {
    setCampsLoading(true);
    /* `sort_order` هو المصدر التشغيليّ لترتيب الحاويات منذ ترحيل
       ٢٠٢٦٠٩١٠، و`id` يحسم التساوي فالنتيجة محدَّدة لا عشوائية.
       ولم يعد `created_at` مرجعاً — كان أثراً لتسلسل الإنشاء لا
       قراراً يملكه الموظّف. */
    supabase.from("camps").select("*").eq("page_type", pageType).eq("season_id", viewedSeason.id)
      .order("sort_order", { nullsFirst: false }).order("id").then(({ data, error }) => {
      if (error || !data) { console.error("تعذر تحميل المخيمات", error); setCampsError(true); }
      else { setCamps(data as Camp[]); setCampsError(false); }
      setCampsLoading(false);
    });
  }, [pageType, viewedSeason.id]);

  const dwellers = (campId: number) => passengers.filter(p => p[campIdKey] === campId).sort(byOrder(campOrderKey));
  const remainingOf = (c: Camp) => c.capacity == null ? null : Math.max(0, c.capacity - dwellers(c.id).length);

  const writes = useAllocationWrites({
    column: campIdKey, orderColumn: campOrderKey, setPassengers, readOnly, showAlert,
    onBlocked: () => assertWritable(),
  });

  // ══════════════════════════════════════════════════════════
  // ترتيب الحاويات — بطاقات المخيّمات، لا نازليها
  // ══════════════════════════════════════════════════════════
  // ⚠️ `camps.sort_order` ترتيبُ المخيّمات داخل مجموعتها
  // (الموسم · نوع الصفحة · الجنس). و`camp_mina_sort_order` /
  // `camp_arafa_sort_order` ترتيبُ النازلين داخل مخيّم. مفهومان
  // منفصلان، وعمودان منفصلان، وخطّافان منفصلان.
  const byContainerOrder = (a: Camp, b: Camp) =>
    ((a.sort_order ?? 0) - (b.sort_order ?? 0)) || a.id - b.id;

  const inGroup = (gender: "ذكر" | "أنثى") => camps.filter(c => c.gender === gender).sort(byContainerOrder);

  /* إعادة الترقيم بفجوة عشرة — نفس عُرف `reorderUpdates` للنازلين،
     وفي القاعدة نفسها في التعبئة الرجعيّة. */
  const saveContainerOrder = async (gender: string, ordered: Camp[]) => {
    if (!assertWritable()) return;
    /* الحدّ الأخير على النطاق: لا يُكتب إلا لمن هم فعلاً في مجموعة
       الجنس المسحوب فيها — فبطاقةٌ من مجموعةٍ أخرى لا تُرقَّم هنا. */
    if (ordered.some(c => c.gender !== gender)) { console.error("محاولة ترتيب عبر مجموعتَي الجنس — أُلغيت"); return; }
    const before = camps;
    const pos = new Map(ordered.map((c, i) => [c.id, (i + 1) * 10]));
    /* تفاؤليّ مع تراجعٍ آمن: البطاقات تستقرّ فوراً، وإن رفضت
       القاعدة عادت الحالة كما كانت بدل أن تبقى كذبةً على الشاشة. */
    setCamps(prev => prev.map(c => pos.has(c.id) ? { ...c, sort_order: pos.get(c.id)! } : c));
    const results = await Promise.all(
      ordered.map((c, i) => supabase.from("camps").update({ sort_order: (i + 1) * 10 }).eq("id", c.id)));
    const failed = results.filter(r => r.error);
    if (failed.length) {
      console.error("تعذر حفظ ترتيب المخيمات", failed.map(f => f.error));
      setCamps(before);
      showAlert("error", allocWriteError("تعذر حفظ ترتيب المخيمات", failed[0].error?.message));
    }
  };

  const cardDrag = useContainerReorder<Camp>({ onReorder: saveContainerOrder });

  // ══════════════════════════════════════════════════════════
  // قواعد المخيّم — حدود صلبة ثم تعارض طريّ
  // ══════════════════════════════════════════════════════════

  /* الفصل بالجنس مطلق: «خاص» تصنيفٌ تجاريّ لا استثناءٌ من الفصل.
     كانت الواجهة تجعله يقبل الجنسين، وقرار المنتج ألغى ذلك.
     والقاعدة ترفضه أيضاً، فلا يمرّ من مسارٍ آخر. */
  const genderOk = (camp: Camp, p: Passenger) => !!p.gender && p.gender === camp.gender;

  const hardBlock = (camp: Camp, chosen: Passenger[]): string | null => {
    const bad = chosen.find(p => !genderOk(camp, p));
    if (bad) {
      return bad.gender
        ? `المخيّم «${camp.name}» مخيّم ${camp.gender === "ذكر" ? "رجال" : "نساء"}، و${bad.short_ar || bad.name_ar} ${bad.gender}. الفصل بالجنس لا يُتجاوز.`
        : `${bad.short_ar || bad.name_ar} بلا جنسٍ مسجَّل — سجّله قبل الإسناد.`;
    }
    if (camp.capacity == null) return `المخيّم «${camp.name}» بلا سعة محدّدة — حدّد سعته قبل الإسناد.`;
    const left = remainingOf(camp) ?? 0;
    if (left <= 0) return `المخيّم «${camp.name}» مكتمل (${dwellers(camp.id).length}/${camp.capacity}) — لا يتّسع لنازلٍ آخر.`;
    if (chosen.length > left) return `المخيّم «${camp.name}» فيه ${placesLabel(left)} فقط، وقد حدّدت ${paxLabel(chosen.length)}. قلّل التحديد أو وزّع على مخيّمٍ آخر.`;
    return null;
  };

  /* التعارض الطريّ: نوع المخيّم المطلوب غير نوع المخيّم الفعليّ.
     يُعلَن ويُؤكَّد ولا يُمنع — والخدمة المطلوبة تبقى كما هي فلا
     تُعاد كتابتها لتوافق التوزيع. */
  const typeMismatch = (camp: Camp, p: Passenger) => {
    const wanted = p.services?.[serviceKey] === "خاص" ? "خاص" : "عادي";
    return wanted !== (camp.type === "خاص" ? "خاص" : "عادي");
  };

  const confirmMismatch = async (camp: Camp, chosen: Passenger[]): Promise<boolean> => {
    const bad = chosen.filter(p => typeMismatch(camp, p));
    if (!bad.length) return true;
    const names = bad.slice(0, 3).map(p => p.short_ar || p.name_ar).join(" · ");
    const more = bad.length > 3 ? ` و${bad.length - 3} غيرهم` : "";
    return confirmAction(
      camp.type === "خاص"
        ? `${names}${more} طلبوا خيمة عادية، والمخيّم «${camp.name}» خاصّ. الخدمة المطلوبة تبقى كما هي ولا تُعدَّل.`
        : `${names}${more} طلبوا خيمة خاصّة، والمخيّم «${camp.name}» عاديّ. الخدمة المطلوبة تبقى كما هي ولا تُعدَّل.`,
      { title: "الخدمة المطلوبة تخالف التوزيع", confirmLabel: "وزّع على أي حال", cancelLabel: "إلغاء" },
    );
  };

  // ══════════════════════════════════════════════════════════
  // مسارات الكتابة
  // ══════════════════════════════════════════════════════════
  const addOne = async (camp: Camp, pId: number) => {
    const p = passengers.find(x => x.id === pId);
    if (!p) return;
    const blocked = hardBlock(camp, [p]);
    if (blocked) { showAlert("warning", blocked); return; }
    if (!await confirmMismatch(camp, [p])) return;
    await writes.assign(pId, camp.id, "تعذر إضافة المسافر إلى المخيم");
  };

  const addPicked = async (camp: Camp) => {
    const chosen = passengers.filter(p => sel.picked.has(p.id) && p[campIdKey] == null);
    if (!chosen.length) return;
    const blocked = hardBlock(camp, chosen);
    if (blocked) { showAlert("warning", blocked); return; }
    if (!await confirmMismatch(camp, chosen)) return;
    const done = await writes.assignMany(chosen.map(p => p.id), camp.id, "تعذر إضافة بعض النازلين إلى المخيم");
    if (done === chosen.length) sel.setPicked(new Set());
    else sel.setPicked(new Set(chosen.slice(done).map(p => p.id)));
  };

  /* النقل كان يعود بـ `return` صامت عند مخالفة الجنس — فلا يفهم
     الموظّف لماذا لم يقع شيء. الآن يُشرَح. */
  const moveP = async (p: Passenger, toId: string) => {
    if (!toId) return;
    const target = camps.find(c => c.id === parseInt(toId, 10));
    if (!target) return;
    const blocked = hardBlock(target, [p]);
    if (blocked) { showAlert("warning", blocked); return; }
    if (!await confirmMismatch(target, [p])) return;
    await writes.assign(p.id, target.id, "تعذر نقل المسافر إلى المخيم الآخر");
  };

  const drag = useAllocationDrag({
    onAdd: pId => { if (selectedCamp) void addOne(selectedCamp, pId); },
    onReorder: ordered => { void writes.reorder(ordered, "تعذر حفظ الترتيب الجديد"); },
  });

  // ══════════════════════════════════════════════════════════
  // الحاوية — إنشاء وتعديل وحذف
  // ══════════════════════════════════════════════════════════
  const addCamp = async () => {
    if (!assertWritable()) return;
    const name = campName.trim();
    const cap = parseInt(campCapacity, 10);
    if (!name) { setFormError("يرجى إدخال اسم المخيم"); return; }
    /* الجنس جزءٌ من هويّة المخيّم: «منى ٢ رجال» و«منى ٢ نساء»
       مخيّمان مختلفان — وهو حدّ التميُّز في القاعدة كذلك. */
    if (camps.some(c => c.name.trim() === name && c.gender === campGender)) {
      setFormError(`يوجد مخيم ${campGender === "ذكر" ? "رجال" : "نساء"} بالاسم "${name}" بالفعل`); return;
    }
    if (!Number.isFinite(cap) || cap < 1) { setFormError("السعة مطلوبة، ويجب أن تكون عدداً أكبر من صفر"); return; }
    setFormError("");
    const { data, error } = await supabase.from("camps")
      .insert([{ name, gender: campGender, type: campType, page_type: pageType, capacity: cap }]).select();
    if (error) {
      console.error("فشل إضافة المخيم", error);
      showAlert("error", allocWriteError("فشل إضافة المخيم، يرجى المحاولة مرة أخرى", error.message));
      return;
    }
    if (data?.[0]) {
      setCamps(prev => [...prev, data[0] as Camp]);
      setCampName(""); setCampGender("ذكر"); setCampType("عادي"); setCampCapacity(""); setShowAdd(false);
    }
  };

  const deleteCamp = async (camp: Camp) => {
    if (!assertWritable()) return;
    if (dwellers(camp.id).length > 0) { showAlert("warning", `المخيّم «${camp.name}» يضمّ ${paxLabel(dwellers(camp.id).length)} — أخرِجهم قبل حذفه.`); return; }
    const { error } = await supabase.from("camps").delete().eq("id", camp.id);
    if (error) { console.error("فشل حذف المخيم", error); showAlert("error", allocWriteError("فشل حذف المخيم، يرجى المحاولة مرة أخرى", error.message)); return; }
    setCamps(prev => prev.filter(c => c.id !== camp.id));
    sel.close();
  };

  const renameCamp = async (camp: Camp, name: string) => {
    if (!assertWritable()) return;
    const next = name.trim();
    if (!next || next === camp.name) { setEditingName(false); return; }
    if (camps.some(c => c.id !== camp.id && c.name.trim() === next && c.gender === camp.gender)) {
      showAlert("warning", `يوجد مخيم ${camp.gender === "ذكر" ? "رجال" : "نساء"} بالاسم "${next}" بالفعل`); return;
    }
    const { error } = await supabase.from("camps").update({ name: next }).eq("id", camp.id);
    if (error) { console.error("تعذر تعديل اسم المخيم", error); showAlert("error", allocWriteError("تعذر تعديل اسم المخيم", error.message)); return; }
    setCamps(prev => prev.map(c => c.id === camp.id ? { ...c, name: next } : c));
    setEditingName(false);
  };

  const saveCapacity = async (camp: Camp) => {
    if (!assertWritable()) return;
    const cap = parseInt(capDraft, 10);
    const occ = dwellers(camp.id).length;
    if (!Number.isFinite(cap) || cap < 1) { showAlert("warning", "السعة يجب أن تكون عدداً أكبر من صفر"); return; }
    if (cap < occ) { showAlert("warning", `المخيّم «${camp.name}» يضمّ ${paxLabel(occ)}، فلا تُخفَّض سعته إلى ${cap}. أخرِج النازلين أولاً.`); return; }
    const { error } = await supabase.from("camps").update({ capacity: cap }).eq("id", camp.id);
    if (error) { console.error("تعذر تعديل سعة المخيم", error); showAlert("error", allocWriteError("تعذر تعديل سعة المخيم", error.message)); return; }
    setCamps(prev => prev.map(c => c.id === camp.id ? { ...c, capacity: cap } : c));
    setEditingCap(false);
  };

  // ══════════════════════════════════════════════════════════
  // الاقتراحات الذكيّة — منى وحدها
  // ══════════════════════════════════════════════════════════
  // الأولويّة: قرابة، ثم غرفة الفندق، ثم الباص. ومنى تحتاجها لأن
  // مخيّماتها كثيرةٌ صغيرة، والموظّف يحتاج معونةً في حفظ المجموعات.
  //
  // ⚠️ عرفة لا اقتراحات لها — قرارُ منتج: مخيّم رجالٍ واحد ومخيّم
  // نساءٍ واحد في الغالب، فلا مجموعاتٍ تُوزَّع. ولها بدلاً منها
  // «ترتيب حسب منى» أدناه.
  const minaSuggestions = (camp: Camp): SuggestionItem[] => {
    if (!isMina) return [];
    const inCamp = dwellers(camp.id);
    const famIds = new Set(inCamp.map(p => p.family_id).filter(Boolean));
    const roomIds = new Set(inCamp.map(p => p.room_id).filter(Boolean));
    const busIds = new Set(inCamp.map(p => p.bus_id).filter(Boolean));

    return passengers
      /* الحدود الصلبة ترشّح الأهليّة: خارج هذا المخيّم، حاجّ،
         وجنسه جنس المخيّم. التعارض الطريّ (خاص/عادي) لا يُخرجه —
         يبقى ويُطلب التأكيد عند القبول. */
      .filter(p => p[campIdKey] !== camp.id && isHajj(p) && !dismissed.has(p.id) && genderOk(camp, p))
      .map(p => ({
        p,
        s: {
          kin: !!(p.family_id && famIds.has(p.family_id)),
          room: !!(p.room_id && roomIds.has(p.room_id)),
          bus: !!(p.bus_id && busIds.has(p.bus_id)),
        },
      }))
      .filter(({ s }) => s.kin || s.room || s.bus)
      .map(({ p, s }) => ({ p, s, score: (s.kin ? 4 : 0) + (s.room ? 2 : 0) + (s.bus ? 1 : 0) }))
      .sort((a, b) => b.score - a.score || a.p.id - b.p.id)
      .map(({ p, s }) => {
        const withWhom = inCamp.find(x =>
          s.kin ? x.family_id === p.family_id : s.room ? x.room_id === p.room_id : x.bus_id === p.bus_id);
        const name = withWhom?.short_ar || withWhom?.name_ar?.split(" ").slice(0, 2).join(" ") || "";
        const why = [s.kin && "صلة قرابة", s.room && "نفس الغرفة", s.bus && "نفس الباص"].filter(Boolean).join(" · ");
        return {
          id: p.id,
          name: p.short_ar || p.name_ar,
          tone: (s.kin ? "kin" : s.room ? "room" : "other") as SuggestionItem["tone"],
          reason: <>{why}{name ? <span style={{ color: "var(--primary)", fontWeight: 800 }}> مع {name}</span> : null}</>,
        };
      });
  };

  // ══════════════════════════════════════════════════════════
  // «ترتيب حسب منى» — عرفة وحدها، وترتيبٌ لا إسناد
  // ══════════════════════════════════════════════════════════
  // عرفة مخيّمٌ كبير، ومنى مخيّماتٌ صغيرة. ومن نزل في منى معاً
  // يُراد له أن يبقى متجاوراً في عرفة. فيُقرأ ترتيب منى — ترتيبُ
  // مخيّماتها من `camps.sort_order` ثم ترتيبُ النازلين داخل كلٍّ
  // منها من `camp_mina_sort_order` — ويُطبَّق على من هم **أصلاً**
  // في مخيّم عرفة المفتوح.
  //
  // لا يُسنِد أحداً، ولا ينقل أحداً بين مخيّمات عرفة، ولا يمسّ منى،
  // ولا يغيّر سعةً ولا جنساً ولا نوعاً. يكتب في
  // `camp_arafa_sort_order` وحده.
  const orderByMina = async (camp: Camp) => {
    if (!assertWritable()) return;

    const ok = await confirmAction(
      `سيُعاد ترتيب النازلين داخل مخيّم «${camp.name}» ليتبع ترتيب مخيّمات منى ${camp.gender === "ذكر" ? "للرجال" : "للنساء"} وترتيبَ نازليها.\n\n· لن يُنقل أحدٌ إلى مخيّمٍ آخر.\n· لن يُسنَد أحدٌ جديد ولا يُخرَج أحد.\n· لن يتغيّر شيءٌ في منى.\n\nالترتيب داخل هذا المخيّم وحده هو ما يتغيّر.`,
      { title: "ترتيب حسب منى", confirmLabel: "رتّب", cancelLabel: "إلغاء" },
    );
    if (!ok) return;

    /* مصدر ترتيب حاويات منى هو `camps.sort_order` — القرار
       التشغيليّ الذي يملكه الموظّف بسحب البطاقات، لا `created_at`
       الذي كان أثراً لتسلسل الإنشاء. و`id` يحسم التساوي وحده.
       ⚠️ والجنس شرطٌ لا زينة: الفصل بالجنس حدٌّ صلب، فمخيّم عرفة
       للرجال يشتقّ ترتيبه من مخيّمات منى للرجال وحدها — ولا
       يختلط التيّاران. و«خاص» لا يستثنى. */
    const { data, error } = await supabase.from("camps")
      .select("id").eq("page_type", "منى").eq("season_id", viewedSeason.id).eq("gender", camp.gender)
      .order("sort_order", { nullsFirst: false }).order("id");
    if (error || !data) {
      console.error("تعذر قراءة ترتيب مخيّمات منى", error);
      showAlert("error", "تعذر قراءة ترتيب مخيّمات منى — يرجى المحاولة مرة أخرى");
      return;
    }

    const current = dwellers(camp.id);
    const here = new Set(current.map(p => p.id));

    /* ١) تسطيح منى: مخيّماً بعد مخيّم، وداخل كلٍّ بترتيب نازليه */
    const fromMina: Passenger[] = [];
    for (const m of data as { id: number }[]) {
      passengers
        .filter(p => p.camp_mina_id === m.id && here.has(p.id))
        .sort(byOrder("camp_mina_sort_order"))
        .forEach(p => fromMina.push(p));
    }

    /* ٢) من لا منى له يبقى بعدهم، بترتيبه الحاليّ في عرفة */
    const seen = new Set(fromMina.map(p => p.id));
    const rest = current.filter(p => !seen.has(p.id));
    const next = [...fromMina, ...rest];

    if (!fromMina.length) {
      showAlert("warning", `لا أحد من نازلي «${camp.name}» مُسنَدٌ إلى مخيّم منى — لا ترتيب يُشتقّ.`);
      return;
    }
    /* لا كتابةَ بلا تغيير */
    if (next.every((p, i) => p.id === current[i]?.id)) {
      showAlert("warning", `ترتيب «${camp.name}» يتبع منى بالفعل — لا تغيير.`);
      return;
    }

    if (await writes.reorder(next, "تعذر حفظ الترتيب الجديد")) {
      showAlert("success", `تمّ ترتيب «${camp.name}» حسب منى — ${paxLabel(fromMina.length)} من مخيّمات منى، و${rest.length} بعدهم.`);
    }
  };

  // ══════════════════════════════════════════════════════════
  const printCamp = (camp: Camp) => {
    const section = makeTwoLogoSectionHTML(`مخيم ${pageType} ${camp.name}`, camp.gender === "ذكر" ? "رجال" : "نساء", renderNamesTable(dwellers(camp.id), "اسم الحاج", branding.primaryColor), branding);
    printInPage(makeHTML(`مخيمات ${pageType}`, section, branding, { noHeader: true }));
  };

  const printAll = () => {
    const sections = camps.map(camp =>
      makeTwoLogoSectionHTML(`مخيم ${pageType} ${camp.name}`, camp.gender === "ذكر" ? "رجال" : "نساء", renderNamesTable(dwellers(camp.id), "اسم الحاج", branding.primaryColor), branding));
    printInPage(makeHTML(`مخيمات ${pageType}`, joinSections(sections), branding, { noHeader: true }));
  };

  const specialBadge = (light?: boolean) => (
    <span style={{ fontSize: 9.5, fontWeight: 800, padding: "2px 8px", borderRadius: 99, flexShrink: 0, background: light ? "color-mix(in srgb, var(--text-inverse) 22%, transparent)" : "var(--warning-bg)", color: light ? "var(--text-inverse)" : "var(--warning)" }}>خاص</span>
  );

  /* هويّة الجنس برموز السمة القائمة — لا وردياً ولا أزرقَ مثبَّتاً */
  const genderPill = (g: string) => (
    <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 99, background: g === "ذكر" ? "var(--male-bg)" : "var(--female-bg)", color: g === "ذكر" ? "var(--male-fg)" : "var(--female-fg)" }}>
      {g === "ذكر" ? "رجال" : "نساء"}
    </span>
  );

  const capNote = (c: Camp) => {
    if (c.capacity == null) return "السعة غير محدّدة";
    const left = c.capacity - dwellers(c.id).length;
    return left > 0 ? placesLabel(left) : left === 0 ? "مكتمل" : `تجاوز السعة بـ ${-left}`;
  };

  const renderGroup = (gender: "ذكر" | "أنثى") => {
    const group = inGroup(gender);
    const shown = group.filter(c => !campSearch || c.name.includes(campSearch.trim()) || dwellers(c.id).some(p => matchesPassenger(p, campSearch)));
    /* السحب يُعطَّل أثناء البحث: القائمة المعروضة ليست المجموعة
       كاملةً، فإعادة الترقيم فوقها تُفسد مواضع المخفيّين. */
    const canReorder = !readOnly && !campSearch && group.length > 1;
    return (
      <div style={{ marginBottom: 20 }}>
        <div style={{ marginBottom: 10 }}>{genderPill(gender)} <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>({group.length})</span></div>
        {shown.length === 0
          ? <div style={{ fontSize: 11, color: "var(--muted)", padding: "6px 0" }}>{campSearch ? "لا نتائج لهذا البحث" : "لا يوجد مخيمات بعد"}</div>
          : <div style={{ display: "grid", gridTemplateColumns: ALLOC_GRID, gap: ALLOC_GAP }}>
            {shown.map(camp => (
              <AllocationCard key={camp.id} selected={sel.selectedId === camp.id} onClick={() => sel.open(camp.id)}
                icon={<Icon />} title={`مخيم ${camp.name}`} badge={camp.type === "خاص" ? specialBadge(true) : undefined}
                subtitle={camp.gender === "ذكر" ? "رجال" : "نساء"}
                occ={dwellers(camp.id).length} cap={camp.capacity ?? null}
                emptyHint="＋ إضافة نازل" capacityNote={capNote(camp)} noteNeedsAction={camp.capacity == null}
                reorder={canReorder ? {
                  onDragStart: () => cardDrag.start(camp.id, gender),
                  onDragOver: e => cardDrag.over(e, camp.id, gender),
                  onDragEnd: () => cardDrag.drop(gender, group),
                  dragging: cardDrag.draggingId === camp.id,
                  dragOver: cardDrag.overId === camp.id && cardDrag.draggingId !== camp.id,
                } : undefined} />
            ))}
          </div>}
      </div>
    );
  };

  return (
    <div style={{ padding: 14, overflowY: "auto", height: "100%" }}>
      <AlertModal alert={alertState} onClose={() => showAlert(null)} />
      <ConfirmModal state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
      <CampsStats camps={camps} passengers={passengers} campIdKey={campIdKey} campServiceKey={serviceKey} />

      <div style={{ display: "flex", gap: 8, marginBottom: 12, marginTop: 12 }}>
        <button disabled={readOnly} onClick={() => setShowAdd(true)}
          style={{ ...roOff, display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 99, background: "var(--paper)", border: "1px solid var(--line)", color: "var(--primary)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)", transition: "var(--transition)", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg> مخيم جديد
        </button>
        {camps.length > 0 && <button onClick={printAll} style={btnS()}><svg aria-hidden width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg> طباعة الكل</button>}
      </div>

      <div style={{ marginBottom: 14 }}>
        <AllocationSearch value={campSearch} onChange={setCampSearch} placeholder="ابحث عن مخيم أو مسافر..." />
      </div>

      <AllocationStates loading={campsLoading} error={campsError} empty={!camps.length}
        icon={<Icon />} errorText="تعذر تحميل المخيمات — يرجى التحقق من الاتصال وتحديث الصفحة" emptyText="لا يوجد مخيمات بعد" />

      {!campsLoading && !campsError && camps.length > 0 && <>{renderGroup("ذكر")}{renderGroup("أنثى")}</>}

      {/* ═══ مودال المخيّم ═══ */}
      {selectedCamp && (() => {
        const camp = selectedCamp;
        const list = dwellers(camp.id);
        const left = remainingOf(camp);
        /* النقل إلى مخيّماتٍ من نفس الجنس وحدها — الفصل مطلق */
        const others = camps.filter(c => c.id !== camp.id && c.gender === camp.gender);
        /* الأهليّة: غير موزَّع في هذه الصفحة، ومن جنس المخيّم */
        const pickerSource = passengers.filter(p =>
          p[campIdKey] == null && genderOk(camp, p) && matchesPassenger(p, sel.pickerSearch));

        const items: PickerItem[] = pickerSource.map(p => ({
          id: p.id,
          name: p.short_ar || p.name_ar,
          badges: (
            <>
              {!isHajj(p) && <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 99, background: "var(--warning-bg)", color: "var(--warning)", flexShrink: 0 }}>{p.passenger_type}</span>}
              {p.services?.[serviceKey] === "خاص" && specialBadge()}
            </>
          ),
          notice: typeMismatch(camp, p)
            ? <div style={{ fontSize: 9, color: "var(--danger)", fontWeight: 700 }}>⚠ {camp.type === "خاص" ? "طلب خيمة عادية" : "طلب خيمة خاصة"}</div>
            : undefined,
        }));

        const blockedReason = readOnly ? "موسم للعرض فقط"
          : camp.capacity == null ? "السعة غير محدّدة"
          : (left ?? 0) <= 0 ? "المخيّم مكتمل" : undefined;

        return (
          <AllocationDialog onClose={sel.close} icon={<Icon />}
            title={editingName ? (
              <input defaultValue={camp.name} autoFocus aria-label="اسم المخيم"
                onBlur={e => renameCamp(camp, e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") renameCamp(camp, (e.target as HTMLInputElement).value); if (e.key === "Escape") setEditingName(false); }}
                style={{ width: 140, fontSize: 18, fontWeight: 900, padding: "2px 8px", borderRadius: 8, border: "none", outline: "none", fontFamily: "var(--font-body)" }} />
            ) : (
              <span onDoubleClick={() => !readOnly && setEditingName(true)} title="انقر نقرتين لتعديل الاسم">مخيم {camp.name}</span>
            )}
            badges={
              <>
                <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 99, background: "color-mix(in srgb, var(--text-inverse) 22%, transparent)" }}>
                  {camp.gender === "ذكر" ? "رجال" : "نساء"}
                </span>
                {camp.type === "خاص" && specialBadge(true)}
              </>
            }
            meta={
              <div style={{ maxWidth: 420 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, fontWeight: 800, marginBottom: 5, flexWrap: "wrap" }}>
                  <span dir="ltr">{list.length} / {camp.capacity ?? "—"}</span>
                  <span style={{ opacity: .85 }}>· {capNote(camp)}</span>
                  {editingCap ? (
                    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                      <input value={capDraft} onChange={e => setCapDraft(e.target.value)} type="number" min="1" autoFocus aria-label="سعة المخيم"
                        style={{ width: 56, padding: "2px 6px", borderRadius: 6, border: "none", outline: "none", background: "var(--paper)", color: "var(--ink)", fontSize: 11, fontFamily: "var(--font-body)" }} />
                      <button onClick={() => saveCapacity(camp)} style={{ fontSize: 10, fontWeight: 900, padding: "2px 8px", borderRadius: 6, border: "none", background: "var(--paper)", color: "var(--primary)", cursor: "pointer", fontFamily: "var(--font-body)" }}>حفظ</button>
                      <button onClick={() => setEditingCap(false)} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, border: "1px solid color-mix(in srgb, var(--text-inverse) 35%, transparent)", background: "transparent", color: "var(--text-inverse)", cursor: "pointer", fontFamily: "var(--font-body)" }}>إلغاء</button>
                    </span>
                  ) : (
                    <button disabled={readOnly} onClick={() => { setCapDraft(camp.capacity != null ? String(camp.capacity) : ""); setEditingCap(true); }}
                      style={{ ...roOff, fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 99, border: "1px solid color-mix(in srgb, var(--text-inverse) 35%, transparent)", background: "color-mix(in srgb, var(--text-inverse) 14%, transparent)", color: "var(--text-inverse)", cursor: "pointer", fontFamily: "var(--font-body)" }}>
                      {camp.capacity == null ? "حدّد السعة" : "تعديل السعة"}
                    </button>
                  )}
                </div>
                <CapacityBar occ={list.length} cap={camp.capacity ?? null} height={6} onDark />
              </div>
            }
            actions={
              <>
                {/* ترتيب حسب منى — عرفة وحدها */}
                {!isMina && (
                  <DialogAction disabled={readOnly} label="ترتيب حسب منى" onClick={() => void orderByMina(camp)}>
                    <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h13" /><path d="M3 12h9" /><path d="M3 18h5" /><path d="m18 9 3 3-3 3" /></svg>
                  </DialogAction>
                )}
                <DialogAction onClick={() => printCamp(camp)} label="طباعة قائمة المخيم">
                  <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" rx="1" /></svg>
                </DialogAction>
                <DialogAction danger disabled={readOnly} label="حذف المخيم"
                  onClick={async () => { if (await confirmAction(`هل تريد حذف مخيم ${camp.name}؟`, { title: "حذف المخيم", danger: true })) void deleteCamp(camp); }}>
                  <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
                </DialogAction>
              </>
            }
            roster={
              <>
                <RosterHeader count={paxLabel(list.length)}
                  breakdown={list.some(p => !isHajj(p)) ? `${list.filter(p => isHajj(p)).length} حاج · ${list.filter(p => !isHajj(p)).length} إداري` : undefined} />
                <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }} onDragOver={e => e.preventDefault()} onDrop={() => drag.drop(list)}>
                  {list.length === 0
                    ? <div style={{ textAlign: "center", padding: "2rem", color: "var(--muted)", fontSize: 12 }}>لا يوجد نازلون بعد</div>
                    : list.map((p, i) => (
                      <AssignedRow key={p.id} index={i + 1} name={p.short_ar || p.name_ar}
                        drag={readOnly ? undefined : {
                          onDragStart: () => drag.startReorder(p.id),
                          onDragOver: e => drag.over(e, p.id),
                          onDragEnd: drag.end,
                          dragging: drag.draggingId === p.id,
                          dragOver: drag.dragOverId === p.id,
                        }}
                        badges={
                          <>
                            {p.passenger_type && p.passenger_type !== "حاج" && <span style={{ fontSize: 8.5, fontWeight: 800, padding: "1px 5px", borderRadius: 99, background: "var(--warning-bg)", color: "var(--warning)", flexShrink: 0 }}>{p.passenger_type}</span>}
                            {p.services?.[serviceKey] === "خاص" && !typeMismatch(camp, p) && specialBadge()}
                          </>
                        }
                        notice={typeMismatch(camp, p) ? (
                          <span style={{ fontSize: 9, fontWeight: 800, color: "var(--danger)", background: "var(--danger-bg)", padding: "1px 6px", borderRadius: 99, flexShrink: 0 }}>
                            {camp.type === "خاص" ? "طلب عادية" : "طلب خاصة"}
                          </span>
                        ) : undefined}
                        actions={
                          <>
                            {others.length > 0 && (
                              <select onChange={e => { void moveP(p, e.target.value); e.currentTarget.value = ""; }} defaultValue="" disabled={readOnly}
                                aria-label={`نقل ${p.short_ar || p.name_ar} إلى مخيم آخر`} title="نقل لمخيم آخر"
                                style={{ ...roOff, fontSize: 10, fontWeight: 700, color: "var(--muted)", background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 7, padding: "3px 8px", fontFamily: "var(--font-body)", cursor: "pointer", minWidth: 62 }}>
                                <option value="">نقل</option>
                                {others.map(c => <option key={c.id} value={c.id}>{c.name} ({c.capacity == null ? "بلا سعة" : `${remainingOf(c)} متاح`})</option>)}
                              </select>
                            )}
                            <button disabled={readOnly} onClick={() => void writes.unassign(p.id, "تعذر إزالة المسافر من المخيم")}
                              aria-label={`إزالة ${p.short_ar || p.name_ar} من المخيم`} title="إزالة من المخيم"
                              style={{ ...roOff, width: 24, height: 24, borderRadius: 7, border: "1px solid var(--danger)", background: "var(--paper)", cursor: "pointer", color: "var(--danger)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" /></svg>
                            </button>
                          </>
                        } />
                    ))}
                </div>
                {/* عرفة بلا اقتراحات — قرار منتج، لا نقصٌ في التنفيذ */}
                {isMina && (
                  <SuggestionStrip items={minaSuggestions(camp)} blockedReason={blockedReason}
                    onAccept={pId => void addOne(camp, pId)}
                    onDismiss={pId => setDismissed(prev => new Set([...prev, pId]))} />
                )}
              </>
            }
            picker={
              <PassengerPicker title="إضافة نازلين" search={sel.pickerSearch} onSearch={sel.setPickerSearch}
                items={items} selected={sel.picked} onToggle={sel.toggle} disabled={readOnly}
                onToggleAll={() => sel.setPicked(sel.picked.size === items.length ? new Set() : new Set(items.map(i => i.id)))}
                countText={`${items.length} ${camp.gender === "ذكر" ? "من الرجال" : "من النساء"} غير موزّع · ${camp.capacity == null ? "السعة غير محدّدة" : (left ?? 0) > 0 ? placesLabel(left ?? 0) : "المخيّم مكتمل"}`}
                emptyText={sel.pickerSearch ? "لا توجد نتائج" : `جميع ${camp.gender === "ذكر" ? "الرجال" : "النساء"} موزعون`}
                drag={readOnly ? undefined : { onDragStart: drag.startAdd, onDragEnd: drag.end, draggingId: drag.draggingId }}
                footer={sel.picked.size > 0 && (
                  <button disabled={readOnly} onClick={() => void addPicked(camp)}
                    style={{ ...roOff, width: "100%", padding: 9, borderRadius: 10, border: "none", background: "var(--primary)", color: "var(--text-inverse)", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "var(--font-body)" }}>
                    إضافة {paxLabel(sel.picked.size)}
                  </button>
                )} />
            } />
        );
      })()}

      {/* Modal إضافة مخيم — نوع الصفحة من سياقها لا من اختيارٍ يدويّ */}
      <Modal show={showAdd} onClose={() => { setShowAdd(false); setFormError(""); }} title={`مخيمات ${pageType} — مخيم جديد`} maxWidth={340}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>رقم / اسم المخيم</div>
          <input style={{ ...inp, borderColor: formError ? "var(--danger)" : "var(--border)" }} value={campName} onChange={e => { setCampName(e.target.value); setFormError(""); }} autoFocus onKeyDown={e => e.key === "Enter" && addCamp()} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>الجنس</div>
          <div style={{ display: "flex", gap: 8 }}>
            {(["ذكر", "أنثى"] as const).map(g => (
              <div key={g} onClick={() => setCampGender(g)} style={{ flex: 1, padding: 8, borderRadius: 8, cursor: "pointer", textAlign: "center", fontSize: 12, border: `1.5px solid ${campGender === g ? (g === "ذكر" ? "var(--male-fg)" : "var(--female-fg)") : "var(--border)"}`, background: campGender === g ? (g === "ذكر" ? "var(--male-bg)" : "var(--female-bg)") : "transparent", color: campGender === g ? (g === "ذكر" ? "var(--male-fg)" : "var(--female-fg)") : "var(--text-muted)" }}>
                {g === "ذكر" ? "رجال" : "نساء"}
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>نوع المخيم</div>
          <div style={{ display: "flex", gap: 8 }}>
            {(["عادي", "خاص"] as const).map(t => (
              <div key={t} onClick={() => setCampType(t)} style={{ flex: 1, padding: 8, borderRadius: 8, cursor: "pointer", textAlign: "center", fontSize: 12, border: `1.5px solid ${campType === t ? "var(--primary)" : "var(--border)"}`, background: campType === t ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "transparent", color: campType === t ? "var(--primary)" : "var(--text-muted)" }}>
                {t}
              </div>
            ))}
          </div>
          {/* «خاص» تصنيفٌ تجاريّ لا استثناءٌ من الفصل بالجنس */}
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 5 }}>«خاص» لا يقبل الجنسين — الفصل بالجنس يسري على كل المخيّمات.</div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>السعة (عدد الأماكن) — مطلوبة</div>
          <input style={inp} type="number" value={campCapacity} onChange={e => { setCampCapacity(e.target.value); setFormError(""); }} placeholder="مثال: 20" min="1" />
        </div>
        {formError && <div role="alert" style={{ fontSize: 11, color: "var(--danger)", marginBottom: 10 }}>{formError}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={addCamp} style={{ ...btnP(), flex: 1 }}><svg aria-hidden width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg> إضافة</button>
          <button onClick={() => { setShowAdd(false); setFormError(""); }} style={btnS()}>إلغاء</button>
        </div>
      </Modal>
    </div>
  );
}

export { CampsStats, CampsPage };
