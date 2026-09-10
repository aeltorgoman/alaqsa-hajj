import { useState, useEffect, useMemo } from "react";
import { isHajj, byOrder } from "../utils/passenger";
import type { Dispatch, SetStateAction } from "react";
import { supabase } from "../supabase";
import type { Passenger, Bus } from "../types";
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
  allocWriteError, matchesPassenger, useAllocationDrag, useAllocationWrites, useContainerSelection,
} from "./allocation/useAllocation";

/* أيقونة الباص — الفرق الأول الذي تراه العين بين الباص والمخيّم،
   والتمييز بها لا بلوحةِ ألوانٍ خاصّةٍ بالصفحة */
const BusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M8 6v6" /><path d="M15 6v6" /><path d="M2 12h19.6" />
    <path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3" />
    <circle cx="7" cy="18" r="2" /><circle cx="15" cy="18" r="2" />
  </svg>
);

const paxLabel = (n: number) => n === 1 ? "مسافر واحد" : n === 2 ? "مسافران" : n <= 10 ? `${n} مسافرين` : `${n} مسافراً`;
const seatsLabel = (n: number) => n === 1 ? "مقعد واحد متبقٍ" : n === 2 ? "مقعدان متبقيان" : n <= 10 ? `${n} مقاعد متبقية` : `${n} مقعداً متبقياً`;

// ===== إحصائيات الباصات =====
function BusesStats({ buses, passengers }: { buses: Bus[]; passengers: Passenger[] }) {
  const stats = useMemo(() => {
    const hajj = passengers.filter(p => isHajj(p));
    const total = hajj.length;
    const assignedCount = hajj.filter(p => p.bus_id != null).length;
    /* المقعد يشغله من يجلس عليه: الإداري يستهلك مقعداً كالحاجّ،
       فالمتاح يُحسب على الجميع. أما «نسبة التوزيع» أدناه فمؤشّر
       حجّاجي ونصّه «من X حاج» — يبقى كما هو. */
    const seated = passengers.filter(p => p.bus_id != null).length;
    const unassigned = total - assignedCount;
    const vipRequested = hajj.filter(p => p.services?.bus === "VIP").length;
    return { total, assignedCount, unassigned, vipRequested, seated };
  }, [passengers]);
  const { total, assignedCount, vipRequested, seated } = stats;

  const totalSeats = buses.reduce((s, b) => s + b.capacity, 0);
  const availableSeats = Math.max(0, totalSeats - seated);
  const cards: StatCardData[] = [
    { label: "إجمالي الباصات", num: buses.length, sub: `${buses.filter(b => b.type === "VIP").length} VIP`, tone: "brand" },
    { label: "طالبين VIP", num: vipRequested, sub: `${total ? Math.round(vipRequested / total * 100) : 0}٪ من الإجمالي`, tone: "warning" },
    { label: "مقاعد متاحة", num: availableSeats, sub: `من ${totalSeats} مقعد`, tone: availableSeats === 0 ? "danger" : "info" },
    { label: "نسبة التوزيع", num: `${total ? Math.round(assignedCount / total * 100) : 0}٪`, sub: `${assignedCount} من ${total} حاج`, tone: "success", featured: true },
  ];

  return <StatsRow cards={cards} />;
}

// ===== صفحة الباصات =====
function BusesPage({ passengers, setPassengers }: { passengers: Passenger[]; setPassengers: Dispatch<SetStateAction<Passenger[]>> }) {
  const branding = useReportBranding();
  const { alert: alertState, showAlert } = useAlert();
  const { confirmState, confirmAction, handleConfirm, handleCancel } = useConfirm();
  const { assertWritable, readOnly } = useSeasonWrite(showAlert);
  const { viewedSeason } = useSeason();

  /* التعطيل البصري لمداخل الكتابة في موسم للعرض فقط — طبقة تجربة
     لا حماية؛ الضمانة محفّز القاعدة */
  const roOff = readOnly ? { opacity: 0.4, pointerEvents: "none" as const } : null;
  const [buses, setBuses] = useState<Bus[]>([]);
  const [busesLoading, setBusesLoading] = useState(true);
  const [busesError, setBusesError] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingCap, setEditingCap] = useState(false);
  const [capDraft, setCapDraft] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [busName, setBusName] = useState("");
  const [busType, setBusType] = useState("عادي");
  const [busCapacity, setBusCapacity] = useState("50");
  const [nameError, setNameError] = useState("");
  const [dismissed, setDismissed] = useState(new Set<number>());
  const [busSearch, setBusSearch] = useState("");

  const sel = useContainerSelection();
  const selectedBus = buses.find(b => b.id === sel.selectedId) || null;

  useEffect(() => {
    /* الفشل يُبلَّغ عنه بدل «لا يوجد باصات بعد» على بيانات لم تصل */
    supabase.from("buses").select("*").eq("season_id", viewedSeason.id).order("created_at").then(({ data, error }) => {
      if (error || !data) { console.error("تعذر تحميل الباصات", error); setBusesError(true); }
      else { setBuses(data as Bus[]); setBusesError(false); }
      setBusesLoading(false);
    });
  }, [viewedSeason.id]);

  const riders = (busId: number) => passengers.filter(p => p.bus_id === busId).sort(byOrder("bus_sort_order"));
  const remainingOf = (bus: Bus) => Math.max(0, bus.capacity - riders(bus.id).length);

  const writes = useAllocationWrites({
    column: "bus_id", orderColumn: "bus_sort_order", setPassengers, readOnly, showAlert,
    onBlocked: () => assertWritable(),
  });

  // ══════════════════════════════════════════════════════════
  // قواعد الباص — هنا، ظاهرةً، لا داخل بدائل مشتركة
  // ══════════════════════════════════════════════════════════

  /* حدٌّ صلب: السقف. القاعدة ترفضه أيضاً، وهذا الفحص يشرح قبل
     أن تُرسَل كتابةٌ محكومٌ عليها. */
  const seatBlock = (bus: Bus, wanted: number): string | null => {
    const left = remainingOf(bus);
    if (left <= 0) return `الباص «${bus.name}» مكتمل (${riders(bus.id).length}/${bus.capacity}) — لا يتّسع لمسافرٍ آخر.`;
    if (wanted > left) return `الباص «${bus.name}» فيه ${seatsLabel(left)} فقط، وقد حدّدت ${paxLabel(wanted)}. قلّل التحديد أو وزّع على باصٍ آخر.`;
    return null;
  };

  /* تعارضٌ طريّ: الخدمة المطلوبة غير فعليّة التوزيع. لا يُمنع —
     يُعلَن ويُؤكَّد. والترقية ليست مجّانيّةً تمرّ بصمت، والتنزيل
     ليس خطأً يُخفى. */
  const vipMismatch = (bus: Bus, p: Passenger) =>
    (bus.type === "VIP" && p.services?.bus !== "VIP") || (bus.type !== "VIP" && p.services?.bus === "VIP");

  const confirmMismatch = async (bus: Bus, chosen: Passenger[]): Promise<boolean> => {
    const bad = chosen.filter(p => vipMismatch(bus, p));
    if (!bad.length) return true;
    const names = bad.slice(0, 3).map(p => p.short_ar || p.name_ar).join(" · ");
    const more = bad.length > 3 ? ` و${bad.length - 3} غيرهم` : "";
    return confirmAction(
      bus.type === "VIP"
        ? `${names}${more} لم يطلبوا باص VIP، والباص «${bus.name}» ‏VIP. الخدمة المطلوبة تبقى كما هي ولا تُعدَّل.`
        : `${names}${more} طلبوا باص VIP، والباص «${bus.name}» عاديّ. الخدمة المطلوبة تبقى كما هي ولا تُعدَّل.`,
      { title: "الخدمة المطلوبة تخالف التوزيع", confirmLabel: "وزّع على أي حال", cancelLabel: "إلغاء" },
    );
  };

  // ══════════════════════════════════════════════════════════
  // مسارات الكتابة — كلّها تمرّ بالحدّ الصلب ثم بالتأكيد الطريّ
  // ══════════════════════════════════════════════════════════
  const addOne = async (bus: Bus, pId: number) => {
    const p = passengers.find(x => x.id === pId);
    if (!p) return;
    const blocked = seatBlock(bus, 1);
    if (blocked) { showAlert("warning", blocked); return; }
    if (!await confirmMismatch(bus, [p])) return;
    await writes.assign(pId, bus.id, "تعذر إضافة المسافر إلى الباص");
  };

  const addPicked = async (bus: Bus) => {
    const chosen = passengers.filter(p => sel.picked.has(p.id) && p.bus_id == null);
    if (!chosen.length) return;
    const blocked = seatBlock(bus, chosen.length);
    if (blocked) { showAlert("warning", blocked); return; }
    if (!await confirmMismatch(bus, chosen)) return;
    const done = await writes.assignMany(chosen.map(p => p.id), bus.id, "تعذر إضافة بعض المسافرين إلى الباص");
    if (done === chosen.length) sel.setPicked(new Set());
    else sel.setPicked(new Set(chosen.slice(done).map(p => p.id)));
  };

  const moveP = async (p: Passenger, toId: string) => {
    if (!toId) return;
    const target = buses.find(b => b.id === parseInt(toId, 10));
    if (!target) return;
    const blocked = seatBlock(target, 1);
    if (blocked) { showAlert("warning", blocked); return; }
    if (!await confirmMismatch(target, [p])) return;
    await writes.assign(p.id, target.id, "تعذر نقل المسافر إلى الباص الآخر");
  };

  const drag = useAllocationDrag({
    onAdd: pId => { if (selectedBus) void addOne(selectedBus, pId); },
    onReorder: ordered => { void writes.reorder(ordered, "تعذر حفظ الترتيب الجديد"); },
  });

  // ══════════════════════════════════════════════════════════
  // الحاوية — إنشاء وتعديل وحذف
  // ══════════════════════════════════════════════════════════
  const addBus = async () => {
    if (!assertWritable()) return;
    const name = busName.trim();
    const cap = parseInt(busCapacity, 10);
    if (!name) { setNameError("يرجى إدخال اسم الباص"); return; }
    if (buses.some(b => b.name.trim() === name)) { setNameError(`يوجد باص بالاسم "${name}" بالفعل`); return; }
    if (!Number.isFinite(cap) || cap < 1) { setNameError("السعة يجب أن تكون عدداً أكبر من صفر"); return; }
    setNameError("");
    const { data, error } = await supabase.from("buses").insert([{ name, type: busType, capacity: cap }]).select();
    if (error) {
      console.error("فشل إضافة الباص", error);
      showAlert("error", allocWriteError("فشل إضافة الباص، يرجى المحاولة مرة أخرى", error.message));
      return;
    }
    if (data?.[0]) {
      setBuses(prev => [...prev, data[0] as Bus]);
      setBusName(""); setBusType("عادي"); setBusCapacity("50"); setShowAdd(false);
    }
  };

  const deleteBus = async (bus: Bus) => {
    if (!assertWritable()) return;
    /* القاعدة ترفضه بالمفتاح الأجنبي كذلك — وهذا يشرح قبل المحاولة */
    if (riders(bus.id).length > 0) { showAlert("warning", `الباص «${bus.name}» يضمّ ${paxLabel(riders(bus.id).length)} — أخرِجهم قبل حذفه.`); return; }
    const { error } = await supabase.from("buses").delete().eq("id", bus.id);
    if (error) { console.error("فشل حذف الباص", error); showAlert("error", allocWriteError("فشل حذف الباص، يرجى المحاولة مرة أخرى", error.message)); return; }
    setBuses(prev => prev.filter(b => b.id !== bus.id));
    sel.close();
  };

  const renameBus = async (bus: Bus, name: string) => {
    if (!assertWritable()) return;
    const next = name.trim();
    if (!next || next === bus.name) { setEditingName(false); return; }
    if (buses.some(b => b.id !== bus.id && b.name.trim() === next)) { showAlert("warning", `يوجد باص بالاسم "${next}" بالفعل`); return; }
    const { error } = await supabase.from("buses").update({ name: next }).eq("id", bus.id);
    if (error) { console.error("تعذر تعديل اسم الباص", error); showAlert("error", allocWriteError("تعذر تعديل اسم الباص", error.message)); return; }
    setBuses(prev => prev.map(b => b.id === bus.id ? { ...b, name: next } : b));
    setEditingName(false);
  };

  /* السعة تُعدَّل، ولا تنزل تحت الإشغال — هنا وفي القاعدة */
  const saveCapacity = async (bus: Bus) => {
    if (!assertWritable()) return;
    const cap = parseInt(capDraft, 10);
    const occ = riders(bus.id).length;
    if (!Number.isFinite(cap) || cap < 1) { showAlert("warning", "السعة يجب أن تكون عدداً أكبر من صفر"); return; }
    if (cap < occ) { showAlert("warning", `الباص «${bus.name}» يضمّ ${paxLabel(occ)}، فلا تُخفَّض سعته إلى ${cap}. أخرِج المسافرين أولاً.`); return; }
    const { error } = await supabase.from("buses").update({ capacity: cap }).eq("id", bus.id);
    if (error) { console.error("تعذر تعديل سعة الباص", error); showAlert("error", allocWriteError("تعذر تعديل سعة الباص", error.message)); return; }
    setBuses(prev => prev.map(b => b.id === bus.id ? { ...b, capacity: cap } : b));
    setEditingCap(false);
  };

  // ══════════════════════════════════════════════════════════
  // الاقتراحات الذكيّة — قرابة، ثم غرفة، ثم خيمة منى
  // ══════════════════════════════════════════════════════════
  // الأولويّة منتَجٌ لا تفصيل: القرابة أقوى إشارةٍ على مجموعةٍ
  // قائمة، ثم رفقة الغرفة، ثم خيمة منى. والإشارات تتضافر فيقوى
  // الترتيب. ولا رقمَ يُعرَض ولا وزنَ داخليّاً — السبب نصٌّ يُقرأ.
  const busSuggestions = (bus: Bus): SuggestionItem[] => {
    const inBus = riders(bus.id);
    const famIds = new Set(inBus.map(p => p.family_id).filter(Boolean));
    const roomIds = new Set(inBus.map(p => p.room_id).filter(Boolean));
    const minaIds = new Set(inBus.map(p => p.camp_mina_id).filter(Boolean));

    const signals = (p: Passenger) => ({
      kin: !!(p.family_id && famIds.has(p.family_id)),
      room: !!(p.room_id && roomIds.has(p.room_id)),
      mina: !!(p.camp_mina_id && minaIds.has(p.camp_mina_id)),
    });

    return passengers
      /* الأهليّة تمرّ بالحدود الصلبة أولاً: غير موزَّعٍ في هذا
         الباص، حاجّ، وفي موسمه. التعارض الطريّ (VIP) لا يُخرجه —
         يبقى ويُطلب التأكيد عند القبول. */
      .filter(p => p.bus_id !== bus.id && isHajj(p) && !dismissed.has(p.id))
      .map(p => ({ p, s: signals(p) }))
      .filter(({ s }) => s.kin || s.room || s.mina)
      .map(({ p, s }) => ({ p, s, score: (s.kin ? 4 : 0) + (s.room ? 2 : 0) + (s.mina ? 1 : 0) }))
      .sort((a, b) => b.score - a.score || a.p.id - b.p.id)
      .map(({ p, s }) => {
        const withWhom = inBus.find(x =>
          s.kin ? x.family_id === p.family_id : s.room ? x.room_id === p.room_id : x.camp_mina_id === p.camp_mina_id);
        const name = withWhom?.short_ar || withWhom?.name_ar?.split(" ").slice(0, 2).join(" ") || "";
        const why = [s.kin && "صلة قرابة", s.room && "نفس الغرفة", s.mina && "نفس خيمة منى"].filter(Boolean).join(" · ");
        return {
          id: p.id,
          name: p.short_ar || p.name_ar,
          tone: (s.kin ? "kin" : s.room ? "room" : "other") as SuggestionItem["tone"],
          reason: <>{why}{name ? <span style={{ color: "var(--primary)", fontWeight: 800 }}> مع {name}</span> : null}</>,
        };
      });
  };

  // ══════════════════════════════════════════════════════════
  // الطباعة — بلا تغيير
  // ══════════════════════════════════════════════════════════
  const printBus = (bus: Bus) => {
    const section = makeTwoLogoSectionHTML(`باص ${bus.name}${bus.type === "VIP" ? " ⭐ VIP" : ""}`, "", renderNamesTable(riders(bus.id), "اسم الحاج / الحاجة", branding.primaryColor), branding);
    printInPage(makeHTML("تقرير الباصات", section, branding, { noHeader: true }));
  };

  const printAll = () => {
    const sections = buses.map(bus =>
      makeTwoLogoSectionHTML(`باص ${bus.name}${bus.type === "VIP" ? " ⭐ VIP" : ""}`, "", renderNamesTable(riders(bus.id), "اسم الحاج / الحاجة", branding.primaryColor), branding));
    printInPage(makeHTML("تقرير الباصات", joinSections(sections), branding, { noHeader: true }));
  };

  // ══════════════════════════════════════════════════════════
  const vipBadge = (light?: boolean) => (
    <span style={{ fontSize: 9.5, fontWeight: 800, padding: "2px 8px", borderRadius: 99, flexShrink: 0, background: light ? "color-mix(in srgb, var(--text-inverse) 22%, transparent)" : "var(--warning-bg)", color: light ? "var(--text-inverse)" : "var(--warning)" }}>VIP ✦</span>
  );

  const visibleBuses = buses.filter(b =>
    !busSearch || b.name.includes(busSearch.trim()) || riders(b.id).some(p => matchesPassenger(p, busSearch)));

  return (
    <div style={{ padding: 14, overflowY: "auto", height: "100%" }}>
      <AlertModal alert={alertState} onClose={() => showAlert(null)} />
      <ConfirmModal state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
      <BusesStats buses={buses} passengers={passengers} />

      <div style={{ display: "flex", gap: 8, marginBottom: 12, marginTop: 12 }}>
        <button disabled={readOnly} onClick={() => setShowAdd(true)}
          style={{ ...roOff, display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 99, background: "var(--paper)", border: "1px solid var(--line)", color: "var(--primary)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)", transition: "var(--transition)", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg> باص جديد
        </button>
        {buses.length > 0 && <button onClick={printAll} style={btnS()}><svg aria-hidden width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg> طباعة الكل</button>}
      </div>

      <div style={{ marginBottom: 12 }}>
        <AllocationSearch value={busSearch} onChange={setBusSearch} placeholder="ابحث عن باص أو مسافر..." />
      </div>

      <AllocationStates loading={busesLoading} error={busesError} empty={!buses.length}
        icon={<BusIcon />} errorText="تعذر تحميل الباصات — يرجى التحقق من الاتصال وتحديث الصفحة" emptyText="لا يوجد باصات بعد" />

      {!busesLoading && !busesError && buses.length > 0 && (
        visibleBuses.length === 0
          ? <div style={{ fontSize: 12, color: "var(--muted)", padding: "8px 2px" }}>لا نتائج لهذا البحث</div>
          : <div style={{ display: "grid", gridTemplateColumns: ALLOC_GRID, gap: ALLOC_GAP }}>
            {visibleBuses.map(bus => {
              const occ = riders(bus.id).length;
              const left = bus.capacity - occ;
              return (
                <AllocationCard key={bus.id} selected={sel.selectedId === bus.id} onClick={() => sel.open(bus.id)}
                  icon={<BusIcon />} title={`باص ${bus.name}`} badge={bus.type === "VIP" ? vipBadge(true) : undefined}
                  occ={occ} cap={bus.capacity} emptyHint="＋ إضافة مسافر"
                  capacityNote={left > 0 ? seatsLabel(left) : left === 0 ? "مكتمل" : `تجاوز السعة بـ ${-left}`} />
              );
            })}
          </div>
      )}

      {/* ═══ مودال الباص ═══ */}
      {selectedBus && (() => {
        const bus = selectedBus;
        const list = riders(bus.id);
        const left = remainingOf(bus);
        const others = buses.filter(b => b.id !== bus.id);
        const pickerSource = passengers.filter(p => p.bus_id == null && matchesPassenger(p, sel.pickerSearch));

        const items: PickerItem[] = pickerSource.map(p => ({
          id: p.id,
          name: p.short_ar || p.name_ar,
          badges: (
            <>
              {!isHajj(p) && <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 99, background: "var(--warning-bg)", color: "var(--warning)", flexShrink: 0 }}>{p.passenger_type}</span>}
              {p.services?.bus === "VIP" && vipBadge()}
            </>
          ),
          notice: vipMismatch(bus, p)
            ? <div style={{ fontSize: 9, color: "var(--danger)", fontWeight: 700 }}>⚠ {bus.type === "VIP" ? "لم يطلب VIP" : "طلب VIP"}</div>
            : undefined,
        }));

        const blockedReason = readOnly ? "موسم للعرض فقط" : left <= 0 ? "الباص مكتمل" : undefined;

        return (
          <AllocationDialog onClose={sel.close} icon={<BusIcon />}
            title={editingName ? (
              <input defaultValue={bus.name} autoFocus aria-label="اسم الباص"
                onBlur={e => renameBus(bus, e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") renameBus(bus, (e.target as HTMLInputElement).value); if (e.key === "Escape") setEditingName(false); }}
                style={{ width: 140, fontSize: 18, fontWeight: 900, padding: "2px 8px", borderRadius: 8, border: "none", outline: "none", fontFamily: "var(--font-body)" }} />
            ) : (
              <span onDoubleClick={() => !readOnly && setEditingName(true)} title="انقر نقرتين لتعديل الاسم">باص {bus.name}</span>
            )}
            badges={bus.type === "VIP" ? vipBadge(true) : undefined}
            meta={
              <div style={{ maxWidth: 420 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, fontWeight: 800, marginBottom: 5 }}>
                  <span dir="ltr">{list.length} / {bus.capacity}</span>
                  <span style={{ opacity: .85 }}>· {left > 0 ? seatsLabel(left) : left === 0 ? "مكتمل" : `تجاوز السعة بـ ${-left}`}</span>
                  {editingCap ? (
                    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                      <input value={capDraft} onChange={e => setCapDraft(e.target.value)} type="number" min="1" autoFocus aria-label="سعة الباص"
                        style={{ width: 56, padding: "2px 6px", borderRadius: 6, border: "none", outline: "none", background: "var(--paper)", color: "var(--ink)", fontSize: 11, fontFamily: "var(--font-body)" }} />
                      <button onClick={() => saveCapacity(bus)} style={{ fontSize: 10, fontWeight: 900, padding: "2px 8px", borderRadius: 6, border: "none", background: "var(--paper)", color: "var(--primary)", cursor: "pointer", fontFamily: "var(--font-body)" }}>حفظ</button>
                      <button onClick={() => setEditingCap(false)} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, border: "1px solid color-mix(in srgb, var(--text-inverse) 35%, transparent)", background: "transparent", color: "var(--text-inverse)", cursor: "pointer", fontFamily: "var(--font-body)" }}>إلغاء</button>
                    </span>
                  ) : (
                    <button disabled={readOnly} onClick={() => { setCapDraft(String(bus.capacity)); setEditingCap(true); }}
                      style={{ ...roOff, fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 99, border: "1px solid color-mix(in srgb, var(--text-inverse) 35%, transparent)", background: "color-mix(in srgb, var(--text-inverse) 14%, transparent)", color: "var(--text-inverse)", cursor: "pointer", fontFamily: "var(--font-body)" }}>تعديل السعة</button>
                  )}
                </div>
                <CapacityBar occ={list.length} cap={bus.capacity} height={6} />
              </div>
            }
            actions={
              <>
                <DialogAction onClick={() => printBus(bus)} label="طباعة قائمة الباص">
                  <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" rx="1" /></svg>
                </DialogAction>
                <DialogAction danger disabled={readOnly} label="حذف الباص"
                  onClick={async () => { if (await confirmAction(`هل تريد حذف باص ${bus.name}؟`, { title: "حذف الباص", danger: true })) void deleteBus(bus); }}>
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
                    ? <div style={{ textAlign: "center", padding: "2rem", color: "var(--muted)", fontSize: 12 }}>لا يوجد مسافرون بعد</div>
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
                            {p.services?.bus === "VIP" && !vipMismatch(bus, p) && vipBadge()}
                          </>
                        }
                        notice={vipMismatch(bus, p) ? (
                          <span style={{ fontSize: 9, fontWeight: 800, color: "var(--danger)", background: "var(--danger-bg)", padding: "1px 6px", borderRadius: 99, flexShrink: 0 }}>
                            {bus.type === "VIP" ? "لم يطلب VIP" : "طلب VIP"}
                          </span>
                        ) : undefined}
                        actions={
                          <>
                            {others.length > 0 && (
                              <select onChange={e => { void moveP(p, e.target.value); e.currentTarget.value = ""; }} defaultValue="" disabled={readOnly}
                                aria-label={`نقل ${p.short_ar || p.name_ar} إلى باص آخر`} title="نقل لباص آخر"
                                style={{ ...roOff, fontSize: 10, fontWeight: 700, color: "var(--muted)", background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 7, padding: "3px 8px", fontFamily: "var(--font-body)", cursor: "pointer", minWidth: 62 }}>
                                <option value="">نقل</option>
                                {others.map(b => <option key={b.id} value={b.id}>{b.name} ({remainingOf(b)} متاح)</option>)}
                              </select>
                            )}
                            <button disabled={readOnly} onClick={() => void writes.unassign(p.id, "تعذر إزالة المسافر من الباص")}
                              aria-label={`إزالة ${p.short_ar || p.name_ar} من الباص`} title="إزالة من الباص"
                              style={{ ...roOff, width: 24, height: 24, borderRadius: 7, border: "1px solid var(--danger)", background: "var(--paper)", cursor: "pointer", color: "var(--danger)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" /></svg>
                            </button>
                          </>
                        } />
                    ))}
                </div>
                <SuggestionStrip items={busSuggestions(bus)} blockedReason={blockedReason}
                  onAccept={pId => void addOne(bus, pId)}
                  onDismiss={pId => setDismissed(prev => new Set([...prev, pId]))} />
              </>
            }
            picker={
              <PassengerPicker title="إضافة مسافرين" search={sel.pickerSearch} onSearch={sel.setPickerSearch}
                items={items} selected={sel.picked} onToggle={sel.toggle} disabled={readOnly}
                onToggleAll={() => sel.setPicked(sel.picked.size === items.length ? new Set() : new Set(items.map(i => i.id)))}
                countText={`${items.length} غير موزّع · ${left > 0 ? seatsLabel(left) : "الباص مكتمل"}`}
                emptyText={sel.pickerSearch ? "لا توجد نتائج" : "جميع المسافرين موزعون"}
                drag={readOnly ? undefined : { onDragStart: drag.startAdd, onDragEnd: drag.end, draggingId: drag.draggingId }}
                footer={sel.picked.size > 0 && (
                  <button disabled={readOnly} onClick={() => void addPicked(bus)}
                    style={{ ...roOff, width: "100%", padding: 9, borderRadius: 10, border: "none", background: "var(--primary)", color: "var(--text-inverse)", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "var(--font-body)" }}>
                    إضافة {paxLabel(sel.picked.size)}
                  </button>
                )} />
            } />
        );
      })()}

      {/* Modal إضافة باص */}
      <Modal show={showAdd} onClose={() => { setShowAdd(false); setNameError(""); }} title="إضافة باص جديد" maxWidth={340}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>اسم الباص</div>
          <input style={{ ...inp, borderColor: nameError ? "var(--danger)" : "var(--border)" }} value={busName} onChange={e => { setBusName(e.target.value); setNameError(""); }} placeholder="مثال: باص 1" autoFocus onKeyDown={e => e.key === "Enter" && addBus()} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>نوع الباص</div>
          <div style={{ display: "flex", gap: 8 }}>
            {["عادي", "VIP"].map(t => <div key={t} onClick={() => setBusType(t)} style={{ flex: 1, padding: 10, borderRadius: 8, border: `1.5px solid ${busType === t ? "var(--primary)" : "var(--border)"}`, background: busType === t ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "transparent", cursor: "pointer", textAlign: "center", fontSize: 12, color: busType === t ? "var(--primary)" : "var(--text-muted)" }}>{t}</div>)}
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>السعة (عدد المقاعد) — مطلوبة</div>
          <input style={inp} type="number" value={busCapacity} onChange={e => { setBusCapacity(e.target.value); setNameError(""); }} placeholder="مثال: 50" min="1" />
        </div>
        {nameError && <div role="alert" style={{ fontSize: 11, color: "var(--danger)", marginBottom: 10 }}>{nameError}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={addBus} style={{ ...btnP(), flex: 1 }}><svg aria-hidden width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg> إضافة</button>
          <button onClick={() => { setShowAdd(false); setNameError(""); }} style={btnS()}>إلغاء</button>
        </div>
      </Modal>
    </div>
  );
}

export { BusesStats, BusesPage };
