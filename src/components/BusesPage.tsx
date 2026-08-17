import { useState, useEffect, useRef, useMemo } from "react";
import { isHajj, sortOrderUpdates } from "../utils/passenger";
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
  }, [buses, passengers]);
  const { total, assignedCount, vipRequested, seated } = stats;

  const totalSeats = buses.reduce((s, b) => s + (b.capacity || 50), 0);
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
  const { writeOk, writeAllOk, assertWritable, readOnly } = useSeasonWrite(showAlert);
  const { viewedSeason } = useSeason();

  /* التعطيل البصري لمداخل الكتابة في موسم للعرض فقط — طبقة تجربة
     لا حماية؛ الضمانة محفّز القاعدة */
  const roOff = readOnly ? { opacity: 0.4, pointerEvents: "none" as const } : null;
  const [buses, setBuses] = useState<Bus[]>([]);
  const [busesLoading, setBusesLoading] = useState(true);
  const [busesError, setBusesError] = useState(false);
  const [editingBusId, setEditingBusId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [busName, setBusName] = useState("");
  const [busType, setBusType] = useState("عادي");
  const [busCapacity, setBusCapacity] = useState("50");
  const [nameError, setNameError] = useState("");
  const [dismissedSuggestions, setDismissedSuggestions] = useState(new Set<number>());
  const [selectedBusId, setSelectedBusId] = useState<number | null>(null);

  /* إغلاق المودال بمفتاح Escape */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedBusId != null) { setSelectedBusId(null); setDrawerPSearch(""); }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [selectedBusId]);
  const [drawerPSearch, setDrawerPSearch] = useState("");
  const [selectedAdd, setSelectedAdd] = useState(new Set<number>());
  const [busSearch, setBusSearch] = useState("");

  // Drag state
  const dragPassengerId = useRef<number | null>(null);
  const dragOverPassengerId = useRef<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const dragType = useRef<"reorder"|"add">("reorder");

  useEffect(() => {
    /* الفشل يُبلَّغ عنه بدل «لا يوجد باصات بعد» على بيانات لم تصل */
    supabase.from("buses").select("*").eq("season_id", viewedSeason.id).order("created_at").then(({ data, error }) => {
      if (error || !data) { console.error("تعذر تحميل الباصات", error); setBusesError(true); }
      else { setBuses(data as Bus[]); setBusesError(false); }
      setBusesLoading(false);
    });
  }, [viewedSeason.id]);

  const getBusPassengers = (busId: number) =>
    passengers.filter(p => p.bus_id === busId).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));


  const addBus = async () => {
    if (!assertWritable()) return;
    if (!busName.trim()) { setNameError("يرجى إدخال اسم الباص"); return; }
    if (buses.some(b => b.name.trim() === busName.trim())) { setNameError(`يوجد باص بالاسم "${busName}" بالفعل`); return; }
    setNameError("");
    const { data, error } = await supabase.from("buses").insert([{ name: busName.trim(), type: busType, capacity: Number(busCapacity) || 50 }]).select();
    if (error) { console.error("فشل إضافة الباص", error); showAlert("error", "فشل إضافة الباص، يرجى المحاولة مرة أخرى"); return; }
    if (!error && data?.[0]) {
      const newBus = data[0] as Bus;
      setBuses(prev => [...prev, newBus]);
      setBusName(""); setBusType("عادي"); setBusCapacity("50"); setShowAdd(false);
    }
  };

  const deleteBus = async (id: number) => {
    if (!assertWritable()) return;
    if (getBusPassengers(id).length > 0) { showAlert("warning", "لا يمكن حذف باص يحتوي على مسافرين"); return; }
    const { error } = await supabase.from("buses").delete().eq("id", id);
    if (error) { console.error("فشل حذف الباص", error); showAlert("error", "فشل حذف الباص، يرجى المحاولة مرة أخرى"); return; }
    setBuses(prev => prev.filter(b => b.id !== id));
  };



  const removeP = async (pId: number) => {
    if (!await writeOk(supabase.from("passengers").update({ bus_id: null }).eq("id", pId), "تعذر إزالة المسافر من الباص")) return;
    setPassengers(prev => prev.map(p => p.id === pId ? { ...p, bus_id: null } : p));
  };

  const moveP = async (pId: number, toId: string) => {
    if (!toId) return;
    const newBusId = parseInt(toId);
    if (!await writeOk(supabase.from("passengers").update({ bus_id: newBusId }).eq("id", pId), "تعذر نقل المسافر إلى الباص الآخر")) return;
    setPassengers(prev => prev.map(p => p.id === pId ? { ...p, bus_id: newBusId } : p));
  };

  const renameBus = async (id: number, name: string) => {
    if (!await writeOk(supabase.from("buses").update({ name }).eq("id", id), "تعذر تعديل اسم الباص")) return;
    setBuses(prev => prev.map(b => b.id === id ? { ...b, name } : b));
  };

  // ===== Drag & Drop handlers =====
  const handleDragStart = (pId: number) => {
    dragType.current = "reorder";
    dragPassengerId.current = pId;
    setDraggingId(pId);
  };

  const handleDragStartAdd = (pId: number) => {
    dragType.current = "add";
    dragPassengerId.current = pId;
    setDraggingId(pId);
  };

  const handleDragOver = (e: React.DragEvent, pId: number) => {
    e.preventDefault();
    dragOverPassengerId.current = pId;
    setDragOverId(pId);
  };

  const handleDrop = async (busId: number) => {
    const fromId = dragPassengerId.current;

    /* سحب من قائمة الإضافة → إضافة للباص */
    if (dragType.current === "add" && fromId) {
      if (await writeOk(supabase.from("passengers").update({ bus_id: busId }).eq("id", fromId), "تعذر إضافة المسافر إلى الباص")) {
        setPassengers(prev => prev.map(x => x.id === fromId ? { ...x, bus_id: busId } : x));
      }
      setDraggingId(null); dragPassengerId.current = null; dragOverPassengerId.current = null;
      return;
    }

    /* سحب داخلي → إعادة ترتيب */
    const toId = dragOverPassengerId.current;
    if (!fromId || !toId || fromId === toId) {
      setDraggingId(null); setDragOverId(null);
      dragPassengerId.current = null; dragOverPassengerId.current = null;
      return;
    }
    const bp = getBusPassengers(busId);
    const fromIdx = bp.findIndex(p => p.id === fromId);
    const toIdx = bp.findIndex(p => p.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;

    const newOrder = [...bp];
    const [moved] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, moved);

    const updates = newOrder.map((p, i) => ({ id: p.id, sort_order: i + 1 }));
    setPassengers(prev => prev.map(p => {
      const upd = updates.find(u => u.id === p.id);
      return upd ? { ...p, sort_order: upd.sort_order } : p;
    }));
    /* التحديث أعلاه يبقى تفاؤلياً كما كان — الإبلاغ يُضاف بلا تغيير سلوكي */
    await writeAllOk(sortOrderUpdates(updates), "تعذر حفظ الترتيب الجديد");

    setDraggingId(null); setDragOverId(null);
    dragPassengerId.current = null; dragOverPassengerId.current = null;
  };

  const handleDragEnd = () => {
    setDraggingId(null); setDragOverId(null);
    dragPassengerId.current = null; dragOverPassengerId.current = null;
  };


  const printBus = (bus: Bus) => {
    const bp = getBusPassengers(bus.id);
    const section = makeTwoLogoSectionHTML(`باص ${bus.name}${bus.type === "VIP" ? " ⭐ VIP" : ""}`, "", renderNamesTable(bp, "اسم الحاج / الحاجة", branding.primaryColor), branding);
    printInPage(makeHTML("تقرير الباصات", section, branding, { noHeader: true }));
  };

  const printAll = () => {
    const sections = buses.map(bus => {
      const bp = getBusPassengers(bus.id);
      return makeTwoLogoSectionHTML(`باص ${bus.name}${bus.type === "VIP" ? " ⭐ VIP" : ""}`, "", renderNamesTable(bp, "اسم الحاج / الحاجة", branding.primaryColor), branding);
    });
    printInPage(makeHTML("تقرير الباصات", joinSections(sections), branding, { noHeader: true }));
  };


  return (
    <div style={{ padding: 14, overflowY: "auto", height: "100%" }}>
      <AlertModal alert={alertState} onClose={() => showAlert(null)} />
      <ConfirmModal state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
      <BusesStats buses={buses} passengers={passengers} />
      <div style={{ display: "flex", gap: 8, marginBottom: 12, marginTop: 12 }}>
        <button disabled={readOnly} onClick={() => setShowAdd(true)} style={{ ...roOff, display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 99, background: "var(--paper)", border: "1px solid var(--line)", color: "var(--em7)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)", transition: "var(--transition)", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }} onMouseEnter={e => { e.currentTarget.style.background = "rgba(125,31,60,0.06)"; e.currentTarget.style.borderColor = "var(--em7)"; }} onMouseLeave={e => { e.currentTarget.style.background = "var(--paper)"; e.currentTarget.style.borderColor = "var(--line)"; }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> باص جديد
        </button>
        {buses.length > 0 && <button onClick={printAll} style={btnS()}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> طباعة الكل</button>}
      </div>

      {/* بحث */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 10, padding: "7px 14px", marginBottom: 12, boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input value={busSearch} onChange={e => setBusSearch(e.target.value)} placeholder="ابحث عن باص..." style={{ border: "none", background: "transparent", fontSize: 13, flex: 1, outline: "none", fontFamily: "var(--font-body)" }} />
        {busSearch && <button onClick={() => setBusSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 16, lineHeight: 1 }}>✕</button>}
      </div>

      {/* شبكة الباصات */}
      {busesLoading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)", fontSize: 12 }}>جاري التحميل...</div>
      ) : busesError ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--danger)", fontWeight: 700, fontSize: 13 }}>
          تعذر تحميل الباصات — يرجى التحقق من الاتصال وتحديث الصفحة
        </div>
      ) : !buses.length ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)", fontSize: 12 }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.2" strokeLinecap="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="15" cy="18" r="2"/></svg>
          <div style={{ marginTop: 8 }}>لا يوجد باصات بعد</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 12 }}>
          {buses.filter(b => !busSearch || b.name.includes(busSearch) || getBusPassengers(b.id).some(p => p.name_ar.includes(busSearch) || (p.short_ar||"").includes(busSearch))).map((bus, _idx) => {
            const bp = getBusPassengers(bus.id);
            const isVIP = bus.type === "VIP";
            const busColor = isVIP ? "#D4A017" : "#1D4ED8";
            const isSelected = selectedBusId === bus.id;
                    const cap2 = bus.capacity || 50;
                    const fillPct2 = Math.min(100, Math.round(bp.length / cap2 * 100));
                    return (
                      <div key={bus.id} onClick={() => setSelectedBusId(bus.id)}
                        style={{
                          background: "var(--paper)", borderRadius: 14, cursor: "pointer",
                          border: isSelected ? `2.5px solid ${busColor}` : "1px solid var(--line)",
                          boxShadow: isSelected ? `0 4px 16px ${busColor}30` : "0 1px 4px rgba(0,0,0,.06)",
                          transition: "all .18s", overflow: "hidden",
                          transform: isSelected ? "translateY(-2px)" : "none",
                        }}
                        onMouseEnter={e => { if (!isSelected) { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 6px 18px ${busColor}22`; } }}
                        onMouseLeave={e => { if (!isSelected) { (e.currentTarget as HTMLDivElement).style.transform = "none"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 4px rgba(0,0,0,.06)"; } }}>
                        {/* لافتة الباص العلوية */}
                        <div style={{ background: `linear-gradient(135deg,${busColor},${busColor}cc)`, padding: "10px 12px 8px", position: "relative", overflow: "hidden" }}>
                          {/* أيقونة باص في الخلفية */}
                          <div style={{ position: "absolute", left: -8, bottom: -12, opacity: .08, pointerEvents: "none" }}>
                            <svg width="80" height="80" viewBox="0 0 24 24" fill="white"><path d="M8 6v6M15 6v6M2 12h19.6M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="15" cy="18" r="2"/></svg>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative", zIndex: 1 }}>
                            <div style={{ fontSize: 20, fontWeight: 900, color: "white", lineHeight: 1 }}>{bus.name}</div>
                            {isVIP && <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 8px", borderRadius: 99, background: "rgba(255,255,255,.25)", color: "white" }}>VIP ✦</span>}
                          </div>
                        </div>
                        {/* محتوى الكارت */}
                        <div style={{ padding: "10px 12px 10px" }}>
                          {/* عدد كبير + حالة */}
                          {bp.length === 0 ? (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "10px 0" }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: busColor, padding: "4px 12px", borderRadius: 8, border: `1px dashed ${busColor}60`, background: `${busColor}06` }}>
                                ＋ إضافة مسافر
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 8 }}>
                              <span style={{ fontSize: 32, fontWeight: 900, color: busColor, lineHeight: 1 }}>{bp.length}</span>
                              <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>/ {cap2} مسافر</span>
                            </div>
                          )}
                          {/* Progress bar واضح */}
                          {bp.length > 0 && (
                            <>
                              <div style={{ height: 8, borderRadius: 99, background: `${busColor}18`, overflow: "hidden", marginBottom: 4 }}>
                                <div style={{ height: "100%", borderRadius: 99, background: `linear-gradient(90deg,${busColor},${busColor}cc)`, width: `${fillPct2}%`, transition: "width .3s" }} />
                              </div>
                              <div style={{ fontSize: 10, fontWeight: 700, color: busColor, textAlign: "left" }}>{fillPct2}٪</div>
                            </>
                          )}
                        </div>
                      </div>
                    );
          })}
        </div>
      )}

      {/* ===== مودال تفاصيل الباص — عمودين ===== */}
      {selectedBusId !== null && (() => {
        const bus = buses.find(b => b.id === selectedBusId);
        if (!bus) return null;
        const bp = getBusPassengers(bus.id);
        const isVIP = bus.type === "VIP";
        const busColor = isVIP ? "#D4A017" : "#1D4ED8";
        const cap = bus.capacity || 50;
        const available = Math.max(0, cap - bp.length);
        const fillPct = Math.min(100, Math.round(bp.length / cap * 100));
        /* الإداري يركب الباص كالحاجّ — وكان يُسنَد من صفحة الإداريين
           وحدها، بلا سعة ولا إشغال أمام المستخدم */
        const addFiltered = passengers.filter(p => p.bus_id == null && (!drawerPSearch || p.name_ar.includes(drawerPSearch) || (p.short_ar||"").includes(drawerPSearch)));
        const vipMismatch = (p: typeof bp[0]) => (isVIP && p.services?.bus !== "VIP") || (!isVIP && p.services?.bus === "VIP");
        return (
          <div onClick={() => { setSelectedBusId(null); setDrawerPSearch(""); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "var(--paper)", borderRadius: 20, width: 960, height: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,.35)", overflow: "hidden" }}>

              {/* ══ هيدر ملون ══ */}
              <div style={{ background: `linear-gradient(135deg,${busColor},${busColor}cc)`, padding: "14px 18px", flexShrink: 0, position: "relative", overflow: "hidden" }}>
                {/* أيقونة خلفية */}
                <div style={{ position: "absolute", left: -10, bottom: -14, opacity: .08, pointerEvents: "none" }}>
                  <svg width="90" height="90" viewBox="0 0 24 24" fill="white"><path d="M8 6v6M15 6v6M2 12h19.6M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="15" cy="18" r="2"/></svg>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative", zIndex: 1 }}>
                  <div style={{ width: 72, height: 72, borderRadius: 16, background: "rgba(255,255,255,.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="15" cy="18" r="2"/></svg>
                  </div>
                  <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12 }}>
                    {/* الدائرة — أكبر */}
                    <div style={{ width: 72, height: 72, flexShrink: 0, position: "relative" }}>
                      <svg width="72" height="72" style={{ transform: "rotate(-90deg)" }}>
                        <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(0,0,0,.2)" strokeWidth="6" />
                        <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(255,255,255,.95)" strokeWidth="6" strokeLinecap="round" strokeDasharray={2 * Math.PI * 30} strokeDashoffset={2 * Math.PI * 30 * (1 - fillPct / 100)} style={{ transition: "stroke-dashoffset .3s" }} />
                      </svg>
                      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                        <b style={{ fontSize: 23, fontWeight: 900, lineHeight: 1, fontFamily: "var(--font-heading)" }}>{bp.length}</b>
                        <small style={{ fontSize: 9, fontWeight: 700, opacity: .85, marginTop: 1 }}>من {cap}</small>
                      </div>
                    </div>
                    {/* الاسم + البار */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {editingBusId === bus.id ? (
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <input defaultValue={bus.name} id={`bus-modal-${bus.id}`} style={{ fontSize: 15, fontWeight: 800, padding: "4px 10px", borderRadius: 8, border: "none", outline: "none", width: 140, fontFamily: "var(--font-body)" }} autoFocus
                            onKeyDown={e => { if (e.key === "Enter") { const v = (document.getElementById(`bus-modal-${bus.id}`) as HTMLInputElement)?.value?.trim(); if (v) { renameBus(bus.id, v); } setEditingBusId(null); } if (e.key === "Escape") setEditingBusId(null); }} />
                          <button onClick={() => { const v = (document.getElementById(`bus-modal-${bus.id}`) as HTMLInputElement)?.value?.trim(); if (v) { renameBus(bus.id, v); } setEditingBusId(null); }} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 8, background: "rgba(255,255,255,.25)", color: "white", border: "none", cursor: "pointer" }}>حفظ</button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ fontSize: 24, fontWeight: 900, color: "white", lineHeight: 1, fontFamily: "var(--font-heading)" }} onDoubleClick={() => setEditingBusId(bus.id)}>باص {bus.name}</div>
                          {isVIP && <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 99, background: "rgba(255,255,255,.22)", color: "white" }}>VIP ✦</span>}
                        </div>
                      )}
                      <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,.85)", marginTop: 4 }}>{available} مقعد متبقٍ · {fillPct}٪ ممتلئ</div>
                      <div style={{ height: 6, borderRadius: 99, background: "rgba(0,0,0,.22)", overflow: "hidden", marginTop: 5 }}>
                        <div style={{ height: "100%", borderRadius: 99, background: "#fff", width: `${fillPct}%`, transition: "width .3s" }} />
                      </div>
                    </div>
                  </div>
                  <button onClick={() => printBus(bus)} title="طباعة" style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(0,0,0,.25)", border: "1px solid rgba(255,255,255,.15)", cursor: "pointer", color: "rgba(255,255,255,.9)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/><line x1="9" y1="18" x2="15" y2="18"/><line x1="9" y1="21" x2="12" y2="21"/><circle cx="18" cy="11.5" r="1" fill="currentColor"/></svg>
                  </button>
                  <button onClick={async () => { const ok = await confirmAction(`هل تريد حذف ${bus.name}؟`, { title: "حذف الباص" }); if (ok) { deleteBus(bus.id); setSelectedBusId(null); } }} title="حذف الباص" style={{ ...roOff, width: 32, height: 32, borderRadius: 8, background: "rgba(0,0,0,.25)", border: "1px solid rgba(255,255,255,.15)", cursor: "pointer", color: "#fca5a5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  </button>
                  <button onClick={() => { setSelectedBusId(null); setDrawerPSearch(""); }} style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(0,0,0,.25)", border: "1px solid rgba(255,255,255,.15)", cursor: "pointer", color: "rgba(255,255,255,.9)", fontSize: 18, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✕</button>
                </div>
              </div>

              {/* ══ الجسم — عمودين ══ */}
              <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

                {/* يمين: قائمة المسافرين */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, borderLeft: "1px solid var(--line)" }}>
                  <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>المسافرون المضافون</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: busColor, background: `${busColor}12`, padding: "2px 8px", borderRadius: 99 }}>{bp.length === 1 ? `${bp.length} مسافر` : bp.length === 2 ? `${bp.length} مسافران` : `${bp.length} مسافرين`}</span>
                    {/* التركيبة لا الإجمالي وحده — الرقم أعلاه سعة، وهذا تصنيف */}
                    {bp.some(p => !isHajj(p)) && <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)" }}>{bp.filter(p => isHajj(p)).length} حاج · {bp.filter(p => !isHajj(p)).length} إداري</span>}
                  </div>
                  <div style={{ flex: 1, overflowY: "auto" }} onDragOver={e => e.preventDefault()} onDrop={() => handleDrop(bus.id)}>
                    {bp.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "2rem", color: "var(--muted)", fontSize: 12 }}>لا يوجد مسافرون بعد</div>
                    ) : bp.map((p, i) => (
                      <div key={p.id} draggable onDragStart={() => handleDragStart(p.id)} onDragOver={e => handleDragOver(e, p.id)} onDragEnd={handleDragEnd}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: "1px solid var(--line)", background: draggingId === p.id ? `${busColor}08` : dragOverId === p.id ? `${busColor}04` : "transparent", cursor: "grab", opacity: draggingId === p.id ? 0.5 : 1 }}>
                        <span style={{ color: "var(--muted)", cursor: "grab", flexShrink: 0 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="5" r="1" fill="currentColor"/><circle cx="15" cy="5" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="19" r="1" fill="currentColor"/><circle cx="15" cy="19" r="1" fill="currentColor"/></svg>
                        </span>
                        <span style={{ fontSize: 10, color: "var(--muted)", width: 16, textAlign: "center", flexShrink: 0 }}>{i + 1}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 6 }}>
                            {p.short_ar || p.name_ar}
                            {p.passenger_type && p.passenger_type !== "حاج" && <span style={{ fontSize: 8, fontWeight: 800, padding: "1px 5px", borderRadius: 99, background: "var(--warning-bg)", color: "var(--warning)", flexShrink: 0 }}>{p.passenger_type}</span>}
                            {p.services?.bus === "VIP" && !vipMismatch(p) && <span style={{ fontSize: 8, fontWeight: 800, background: "#E8951A", color: "#fff", padding: "1px 5px", borderRadius: 99, flexShrink: 0, opacity: .9 }}>VIP</span>}
                          </div>
                        </div>
                        {vipMismatch(p) && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: "#C62828", background: "rgba(198,40,40,.08)", padding: "1px 6px", borderRadius: 99, flexShrink: 0 }}>
                            {isVIP ? "ليس VIP" : "VIP"}
                          </span>
                        )}
                        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, opacity: .6 }}>
                          <div style={{ position: "relative", display: "inline-flex" }}>
                            <select onChange={e => moveP(p.id, e.target.value)} defaultValue="" title="نقل لباص آخر" style={{ appearance: "none", WebkitAppearance: "none", MozAppearance: "none", fontSize: 10, fontWeight: 700, color: "var(--muted)", background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 7, padding: "3px 8px 3px 24px", fontFamily: "var(--font-body)", cursor: "pointer", minWidth: 62, textAlign: "center" }}>
                              <option value="">نقل</option>
                              {buses.filter(b => b.id !== bus.id).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                          </div>
                          <button disabled={readOnly} onClick={() => removeP(p.id)} title="إزالة من الباص" style={{ ...roOff, width: 24, height: 24, borderRadius: 7, border: "1px solid var(--line)", background: "var(--paper)", cursor: "pointer", color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                {/* اقتراحات ذكية */}
                {(() => {
                  const roomIds = new Set(bp.map(p => p.room_id).filter(Boolean));
                  const minaIds = new Set(bp.map(p => p.camp_mina_id).filter(Boolean));
                  const allSuggestions = passengers
                    .filter(p =>
                      p.bus_id !== bus.id &&
                      !dismissedSuggestions.has(p.id!) &&
                      (isHajj(p)) &&
                      ((p.room_id && roomIds.has(p.room_id)) || (p.camp_mina_id && minaIds.has(p.camp_mina_id)))
                    )
                    .sort((a, b) => {
                      const sc = (x: Passenger) => {
                        const famIds = new Set(bp.filter(q => q.family_id).map(q => q.family_id));
                        const kin = x.family_id && famIds.has(x.family_id) ? 4 : 0;
                        const room = x.room_id && roomIds.has(x.room_id) ? 2 : 0;
                        const mina = x.camp_mina_id && minaIds.has(x.camp_mina_id) ? 1 : 0;
                        return kin + room + mina;
                      };
                      return sc(b) - sc(a);
                    });
                  if (!allSuggestions.length) return null;
                  return (
                    <div style={{ flexShrink: 0, borderTop: "2px solid var(--line)", background: "var(--ivory)", padding: "8px 12px" }}>
                      <div style={{ fontSize: 10, fontWeight: 900, color: "#1565C0", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4"/></svg>
                        اقتراحات ذكية
                        <span style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700 }}>({allSuggestions.length})</span>
                      </div>
                      <div style={{ maxHeight: 114, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                      {allSuggestions.map(p => {
                        const sharedRoom = p.room_id && roomIds.has(p.room_id);
                        const sharedMina = p.camp_mina_id && minaIds.has(p.camp_mina_id);
                        const matchPax = bp.find(x => sharedRoom ? x.room_id === p.room_id : x.camp_mina_id === p.camp_mina_id);
                        const matchName = matchPax?.short_ar || matchPax?.name_ar?.split(" ").slice(0,2).join(" ") || "";
                        return (
                          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 10px", borderRadius: 8, border: `1.5px solid ${sharedRoom && sharedMina ? "#81C784" : sharedRoom ? "#FFD54F" : "#A5D6A7"}`, background: sharedRoom && sharedMina ? "#F1F8E9" : sharedRoom ? "#FFFDE7" : "#F9FBE7" }}>
                            <span style={{ fontSize: 11.5, fontWeight: 900, color: "var(--ink)", flexShrink: 0 }}>{p.short_ar || p.name_ar}</span>
                            <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              · {sharedRoom && sharedMina ? "نفس الغرفة وخيمة منى" : sharedRoom ? "نفس الغرفة" : "نفس خيمة منى"}
                              {matchName ? <span style={{ color: "var(--primary)", fontWeight: 800 }}> مع {matchName}</span> : null}
                            </span>
                            <button onClick={async () => { if (!await writeOk(supabase.from("passengers").update({ bus_id: bus.id }).eq("id", p.id), "تعذر إضافة المسافر إلى الباص")) return; setPassengers(prev => prev.map(x => x.id === p.id ? { ...x, bus_id: bus.id } : x)); }} title="إضافة للباص" style={{ width: 26, height: 26, borderRadius: 8, border: "none", background: "#2A9D8F", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            </button>
                            <button onClick={() => setDismissedSuggestions(prev => new Set([...prev, p.id!]))} style={{ width: 22, height: 22, borderRadius: 6, border: "none", background: "var(--ivory2)", cursor: "pointer", color: "var(--muted)", fontSize: 11, flexShrink: 0 }}>✕</button>
                          </div>
                        );
                      })}
                      </div>
                    </div>
                  );
                })()}
                </div>

                {/* شمال: إضافة مسافرين */}
                <div style={{ width: 290, flexShrink: 0, display: "flex", flexDirection: "column", minHeight: 0, background: "var(--ivory)" }}>
                  <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>
                      {selectedAdd.size > 0 ? `${selectedAdd.size} محدد` : "إضافة مسافرين"}
                    </span>
                    {addFiltered.length > 0 && (
                      <button
                        onClick={() => {
                          if (selectedAdd.size === addFiltered.length) setSelectedAdd(new Set());
                          else setSelectedAdd(new Set(addFiltered.map(p => p.id)));
                        }}
                        style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: `${busColor}14`, border: `1px solid ${busColor}33`, color: busColor, cursor: "pointer", fontFamily: "var(--font-body)" }}>
                        {selectedAdd.size === addFiltered.length && addFiltered.length > 0 ? "إلغاء تحديد الكل" : "تحديد الكل"}
                      </button>
                    )}
                  </div>
                  <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 9, padding: "6px 10px" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                      <input style={{ border: "none", background: "transparent", fontSize: 12, flex: 1, outline: "none", fontFamily: "var(--font-body)" }} placeholder="ابحث عن مسافر..." value={drawerPSearch} onChange={e => setDrawerPSearch(e.target.value)} autoFocus />
                      {drawerPSearch && <button onClick={() => setDrawerPSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 13 }}>✕</button>}
                    </div>
                  </div>
                  <div style={{ flex: 1, overflowY: "auto" }}>
                    {addFiltered.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "1.5rem", color: "var(--muted)", fontSize: 11 }}>{drawerPSearch ? "لا توجد نتائج" : "جميع الحجاج موزعون"}</div>
                    ) : addFiltered.map(p => {
                      const willMismatch = (isVIP && p.services?.bus !== "VIP") || (!isVIP && p.services?.bus === "VIP");
                      return (
                        <div key={p.id}
                          draggable
                          onDragStart={() => handleDragStartAdd(p.id)}
                          onDragEnd={handleDragEnd}
                          onClick={() => setSelectedAdd(prev => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })}
                          style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", cursor: "grab", borderBottom: "1px solid var(--line)", background: selectedAdd.has(p.id) ? `${busColor}12` : draggingId === p.id ? "rgba(125,31,60,.05)" : "transparent" }}
                          onMouseEnter={e => { if (!selectedAdd.has(p.id)) (e.currentTarget as HTMLDivElement).style.background = "var(--paper)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = selectedAdd.has(p.id) ? `${busColor}12` : "transparent"; }}>
                          <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${selectedAdd.has(p.id) ? busColor : "var(--line)"}`, background: selectedAdd.has(p.id) ? busColor : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {selectedAdd.has(p.id) && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {/* الشارة قبل الإضافة لا بعدها فقط: من يختار
                                لا يعرف أنه إداري إلا بعد فوات الاختيار */}
                            <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.short_ar || p.name_ar}</span>
                              {!isHajj(p) && <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 99, background: "var(--warning-bg)", color: "var(--warning)", flexShrink: 0 }}>{p.passenger_type}</span>}
                            </div>
                            {willMismatch && isVIP && isHajj(p) && <div style={{ fontSize: 9, color: "#C62828", fontWeight: 700 }}>⚠ ليس VIP</div>}
                          </div>
                          {isHajj(p) && p.services?.bus === "VIP" && <span style={{ fontSize: 9, fontWeight: 800, background: "#E8951A", color: "#fff", padding: "1px 6px", borderRadius: 99, flexShrink: 0 }}>VIP</span>}
                        </div>
                      );
                    })}
                  </div>
                  {/* زر الإضافة الجماعي */}
                  {selectedAdd.size > 0 && (
                    <div style={{ padding: "10px 12px", borderTop: "1px solid var(--line)", flexShrink: 0, background: "var(--paper)" }}>
                      <button
                        onClick={async () => {
                          const chosen = addFiltered.filter(p => selectedAdd.has(p.id));
                          const mismatched = chosen.filter(p => (isVIP && p.services?.bus !== "VIP") || (!isVIP && p.services?.bus === "VIP"));
                          if (mismatched.length > 0) {
                            const ok = await confirmAction(
                              `${mismatched.length} من الحجاج المحددين لا يتطابق نوع الباص المطلوب لديهم — هل تريد المتابعة؟`,
                              { title: "تحذير — عدم تطابق النوع", danger: false, confirmLabel: "إضافة على أي حال", cancelLabel: "إلغاء" }
                            );
                            if (!ok) return;
                          }
                          if (!await writeAllOk(chosen.map(p => supabase.from("passengers").update({ bus_id: bus.id }).eq("id", p.id)), "تعذر إضافة بعض المسافرين إلى الباص")) return;
                          setPassengers(prev => prev.map(x => selectedAdd.has(x.id) ? { ...x, bus_id: bus.id } : x));
                          setSelectedAdd(new Set());
                        }}
                        style={{ width: "100%", padding: "9px", borderRadius: 10, border: "none", background: busColor, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "var(--font-body)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        إضافة {selectedAdd.size} مسافر
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal إضافة باص */}
      <Modal show={showAdd} onClose={() => { setShowAdd(false); setNameError(""); }} title="إضافة باص جديد" maxWidth={340}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>اسم الباص</div>
          <input style={{ ...inp, borderColor: nameError ? "var(--danger)" : "var(--border)" }} value={busName} onChange={e => { setBusName(e.target.value); setNameError(""); }} placeholder="مثال: باص 1" autoFocus onKeyDown={e => e.key === "Enter" && addBus()} />
          {nameError && <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 4 }}>{nameError}</div>}
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>نوع الباص</div>
          <div style={{ display: "flex", gap: 8 }}>
            {["عادي", "VIP"].map(t => <div key={t} onClick={() => setBusType(t)} style={{ flex: 1, padding: 10, borderRadius: 8, border: `1.5px solid ${busType === t ? "var(--em7)" : "var(--border)"}`, background: busType === t ? "rgba(125,31,60,.08)" : "transparent", cursor: "pointer", textAlign: "center", fontSize: 12, color: busType === t ? "var(--em7)" : "var(--text-muted)" }}>{t}</div>)}
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>السعة (عدد المقاعد)</div>
          <input style={inp} type="number" value={busCapacity} onChange={e => setBusCapacity(e.target.value)} placeholder="مثال: 50" min="1" max="100" />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={addBus} style={{ ...btnP(), flex: 1 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> إضافة</button>
          <button onClick={() => { setShowAdd(false); setNameError(""); }} style={btnS()}>إلغاء</button>
        </div>
      </Modal>

    </div>
  );
}

export { BusesStats, BusesPage };
