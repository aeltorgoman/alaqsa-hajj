import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "../supabase";
import type { Passenger, Bus } from "../types";
import { Avatar } from "./Avatar";
import { Modal } from "./Modal";
import { AlertModal, useAlert, ConfirmModal, useConfirm } from "./AlertModal";
import { StatsRow, type StatCardData } from "./StatCard";
import { useConfig } from "../config/ConfigContext";
import { inp, btnP, btnS, makeHTML, printInPage, makeTwoLogoSectionHTML, joinSections, renderNamesTable } from "../utils";

// ===== دالة حفظ الترتيب في Supabase =====
async function saveSortOrder(items: { id: number; sort_order: number }[]) {
  await Promise.all(items.map(item =>
    supabase.from("passengers").update({ sort_order: item.sort_order }).eq("id", item.id)
  ));
}

// ===== إحصائيات الباصات =====
function BusesStats({ buses, passengers }: { buses: Bus[]; passengers: Passenger[] }) {
  const stats = useMemo(() => {
    const hajj = passengers.filter(p => !p.passenger_type || p.passenger_type === "حاج");
    const total = hajj.length;
    const assignedCount = hajj.filter(p => p.bus_id != null).length;
    const unassigned = total - assignedCount;
    const vipRequested = hajj.filter(p => p.services?.bus === "VIP").length;
    return { total, assignedCount, unassigned, vipRequested };
  }, [buses, passengers]);
  const { total, assignedCount, vipRequested } = stats;

  const totalSeats = buses.reduce((s, b) => s + ((b as any).capacity || 50), 0);
  const availableSeats = Math.max(0, totalSeats - assignedCount);
  const cards: StatCardData[] = [
    { label: "إجمالي الباصات", num: buses.length, sub: `${buses.filter(b => b.type === "VIP").length} VIP`, tone: "brand" },
    { label: "طالبين VIP", num: vipRequested, sub: `${total ? Math.round(vipRequested / total * 100) : 0}٪ من الإجمالي`, tone: "warning" },
    { label: "مقاعد متاحة", num: availableSeats, sub: `من ${totalSeats} مقعد`, tone: availableSeats === 0 ? "danger" : "info" },
    { label: "نسبة التوزيع", num: `${total ? Math.round(assignedCount / total * 100) : 0}٪`, sub: `${assignedCount} من ${total} حاج`, tone: "success", featured: true },
  ];

  return <StatsRow cards={cards} />;
}

// ===== صفحة الباصات =====
function BusesPage({ passengers, setPassengers }: { passengers: Passenger[]; setPassengers: (p: Passenger[]) => void }) {
  const config = useConfig();
  const { alert: alertState, showAlert } = useAlert();
  const { confirmState, confirmAction, handleConfirm, handleCancel } = useConfirm();
  const [buses, setBuses] = useState<Bus[]>([]);
  const [editingBusId, setEditingBusId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [busName, setBusName] = useState("");
  const [busType, setBusType] = useState("عادي");
  const [busCapacity, setBusCapacity] = useState("50");
  const [nameError, setNameError] = useState("");
  const [showAddP, setShowAddP] = useState(false);
  const [currentBusId] = useState<number | null>(null);
  const [selectedP, setSelectedP] = useState(new Set<number>());
  const [pSearch, setPSearch] = useState("");
  const [selectedBusId, setSelectedBusId] = useState<number | null>(null);
  const [drawerPSearch, setDrawerPSearch] = useState("");
  const [busSearch, setBusSearch] = useState("");

  // Drag state
  const dragPassengerId = useRef<number | null>(null);
  const dragOverPassengerId = useRef<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  useEffect(() => {
    supabase.from("buses").select("*").order("created_at").then(({ data }: any) => { if (data) setBuses(data); });
  }, []);

  const getBusPassengers = (busId: number) =>
    passengers.filter(p => p.bus_id === busId).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));


  const addBus = async () => {
    if (!busName.trim()) { setNameError("يرجى إدخال اسم الباص"); return; }
    if (buses.some(b => b.name.trim() === busName.trim())) { setNameError(`يوجد باص بالاسم "${busName}" بالفعل`); return; }
    setNameError("");
    const { data, error } = await supabase.from("buses").insert([{ name: busName.trim(), type: busType, capacity: Number(busCapacity) || 50 }]).select();
    if (error) { showAlert("error", `فشل إضافة الباص: ${error.message || "يرجى المحاولة مرة أخرى"}`); return; }
    if (!error && data?.[0]) {
      const newBus = data[0] as Bus;
      setBuses(prev => [...prev, newBus]);
      setBusName(""); setBusType("عادي"); setBusCapacity("50"); setShowAdd(false);
    }
  };

  const deleteBus = async (id: number) => {
    if (getBusPassengers(id).length > 0) { showAlert("warning", "لا يمكن حذف باص يحتوي على مسافرين"); return; }
    const { error } = await supabase.from("buses").delete().eq("id", id);
    if (error) { showAlert("error", `فشل حذف الباص: ${error.message}`); return; }
    setBuses(prev => prev.filter(b => b.id !== id));
  };

  const toggleSelectP = (id: number) => setSelectedP(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const confirmAddP = async () => {
    await Promise.all([...selectedP].map(id => supabase.from("passengers").update({ bus_id: currentBusId }).eq("id", id)));
    setPassengers(passengers.map(p => selectedP.has(p.id) ? { ...p, bus_id: currentBusId } : p));
    const familyToAdd = passengers.filter(p => !selectedP.has(p.id) && p.bus_id == null && [...selectedP].some(id => { const sel = passengers.find(x => x.id === id); return sel?.family_id && sel.family_id === p.family_id; }));
    const familyOk = familyToAdd.length > 0 && await confirmAction(`سيتم تعيين حجاج بدون أقاربهم.\nهل تريد إضافة أقاربهم معهم أيضًا؟\n${familyToAdd.map(p => p.short_ar).join("، ")}`, { title: "إضافة الأقارب", danger: false });
    if (familyOk) {
      await Promise.all(familyToAdd.map(p => supabase.from("passengers").update({ bus_id: currentBusId }).eq("id", p.id)));
      setPassengers((passengers as Passenger[]).map(p => familyToAdd.some((f: Passenger) => f.id === p.id) ? { ...p, bus_id: currentBusId } : p));
    }
    setShowAddP(false);
  };

  const removeP = async (pId: number) => {
    await supabase.from("passengers").update({ bus_id: null }).eq("id", pId);
    setPassengers(passengers.map(p => p.id === pId ? { ...p, bus_id: null } : p));
  };

  const moveP = async (pId: number, toId: string) => {
    if (!toId) return;
    const newBusId = parseInt(toId);
    await supabase.from("passengers").update({ bus_id: newBusId }).eq("id", pId);
    setPassengers(passengers.map(p => p.id === pId ? { ...p, bus_id: newBusId } : p));
  };

  // ===== Drag & Drop handlers =====
  const handleDragStart = (pId: number) => {
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
    const updatedPassengers = passengers.map(p => {
      const upd = updates.find(u => u.id === p.id);
      return upd ? { ...p, sort_order: upd.sort_order } : p;
    });
    setPassengers(updatedPassengers);
    await saveSortOrder(updates);

    setDraggingId(null); setDragOverId(null);
    dragPassengerId.current = null; dragOverPassengerId.current = null;
  };

  const handleDragEnd = () => {
    setDraggingId(null); setDragOverId(null);
    dragPassengerId.current = null; dragOverPassengerId.current = null;
  };

  const branding = { logoUrl: config.logo_url || "", companyName: config.name_ar || "حملة الأقصى", tagline: config.tagline || "", primaryColor: config.color_primary || "#6B1F3A", accentColor: config.color_accent || "#0C447C" };

  const printBus = (bus: Bus) => {
    const bp = getBusPassengers(bus.id);
    const section = makeTwoLogoSectionHTML(`باص ${bus.name}${bus.type === "VIP" ? " ⭐ VIP" : ""}`, "", renderNamesTable(bp, "اسم الحاج / الحاجة", branding.primaryColor), branding);
    printInPage(makeHTML("تقرير الباصات", section, false, branding.logoUrl, branding.companyName, branding.tagline, branding.primaryColor, branding.accentColor, true));
  };

  const printAll = () => {
    const sections = buses.map(bus => {
      const bp = getBusPassengers(bus.id);
      return makeTwoLogoSectionHTML(`باص ${bus.name}${bus.type === "VIP" ? " ⭐ VIP" : ""}`, "", renderNamesTable(bp, "اسم الحاج / الحاجة", branding.primaryColor), branding);
    });
    printInPage(makeHTML("تقرير الباصات", joinSections(sections), false, branding.logoUrl, branding.companyName, branding.tagline, branding.primaryColor, branding.accentColor, true));
  };

  const currentBus = buses.find(b => b.id === currentBusId);
  const filteredP = passengers
    .filter(p => p.bus_id == null && (!p.passenger_type || p.passenger_type === "حاج") && (!pSearch || p.name_ar.includes(pSearch)))
    .sort((a, b) => (a.short_ar || a.name_ar).localeCompare(b.short_ar || b.name_ar, "ar"));

  return (
    <div style={{ padding: 14, overflowY: "auto", height: "100%" }}>
      <AlertModal alert={alertState} onClose={() => showAlert(null)} />
      <ConfirmModal state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
      <BusesStats buses={buses} passengers={passengers} />
      <div style={{ display: "flex", gap: 8, marginBottom: 12, marginTop: 12 }}>
        <button onClick={() => setShowAdd(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 99, background: "var(--paper)", border: "1px solid var(--line)", color: "var(--em7)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)", transition: "var(--transition)", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }} onMouseEnter={e => { e.currentTarget.style.background = "rgba(125,31,60,0.06)"; e.currentTarget.style.borderColor = "var(--em7)"; }} onMouseLeave={e => { e.currentTarget.style.background = "var(--paper)"; e.currentTarget.style.borderColor = "var(--line)"; }}>
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
      {!buses.length ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)", fontSize: 12 }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.2" strokeLinecap="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="15" cy="18" r="2"/></svg>
          <div style={{ marginTop: 8 }}>لا يوجد باصات بعد</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 12 }}>
          {buses.filter(b => !busSearch || b.name.includes(busSearch) || getBusPassengers(b.id).some(p => p.name_ar.includes(busSearch) || (p.short_ar || "").includes(busSearch))).map((bus, _idx) => {
            const bp = getBusPassengers(bus.id);
            const isVIP = bus.type === "VIP";
            const busColor = isVIP ? "#D4A017" : "#1D4ED8";
            const isSelected = selectedBusId === bus.id;
                    const cap2 = (bus as any).capacity || 50;
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

      {/* ===== Drawer تفاصيل الباص ===== */}
      {selectedBusId !== null && (() => {
        const bus = buses.find(b => b.id === selectedBusId);
        if (!bus) return null;
        const bp = getBusPassengers(bus.id);
        const isVIP = bus.type === "VIP";

        const busColor = isVIP ? "#D4A017" : "#1D4ED8";
        const drawerFiltered = passengers.filter(p => p.bus_id == null && (!p.passenger_type || p.passenger_type === "حاج") && (!drawerPSearch || p.name_ar.includes(drawerPSearch)));
        return (
          <div onClick={() => setSelectedBusId(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "var(--paper)", borderRadius: 18, width: "90%", maxWidth: 580, maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 40px rgba(0,0,0,.3)" }}>
              {/* هيدر الـ Drawer */}
              <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: `${busColor}18`, display: "flex", alignItems: "center", justifyContent: "center", border: `1.5px solid ${busColor}30` }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={busColor} strokeWidth="1.8" strokeLinecap="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="15" cy="18" r="2"/></svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    {editingBusId === bus.id ? (
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input defaultValue={bus.name} id={`bus-drawer-${bus.id}`} style={{ ...inp, fontSize: 14, padding: "4px 10px", width: 140 }} autoFocus onKeyDown={e => { if (e.key === "Enter") { const v = (document.getElementById(`bus-drawer-${bus.id}`) as HTMLInputElement)?.value?.trim(); if (v) { supabase.from("buses").update({ name: v }).eq("id", bus.id); setBuses(buses.map(b => b.id === bus.id ? { ...b, name: v } : b)); } setEditingBusId(null); } if (e.key === "Escape") setEditingBusId(null); }} />
                        <button onClick={() => { const v = (document.getElementById(`bus-drawer-${bus.id}`) as HTMLInputElement)?.value?.trim(); if (v) { supabase.from("buses").update({ name: v }).eq("id", bus.id); setBuses(buses.map(b => b.id === bus.id ? { ...b, name: v } : b)); } setEditingBusId(null); }} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 8, background: "var(--primary)", color: "#fff", border: "none", cursor: "pointer" }}>✓</button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ fontSize: 17, fontWeight: 800, color: "var(--ink)" }} onDoubleClick={() => setEditingBusId(bus.id)}>{bus.name}</div>
                        {isVIP && <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 99, background: "#D4A01720", color: "#b8860b" }}>VIP</span>}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{bp.length} مسافر</div>
                  </div>
                  {/* أزرار الهيدر */}
                  <button onClick={() => printBus(bus)} style={{ ...btnS(), flexShrink: 0 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                  </button>
                  <button onClick={async () => { const ok = await confirmAction(`هل تريد حذف ${bus.name}؟`, { title: "حذف الباص" }); if (ok) { deleteBus(bus.id); setSelectedBusId(null); } }} style={{ background: "none", border: "1px solid rgba(198,40,40,.2)", borderRadius: 8, padding: "5px 9px", cursor: "pointer", color: "#C62828", flexShrink: 0 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
                  </button>
                  <button onClick={() => setSelectedBusId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 20, lineHeight: 1, padding: "4px 6px", flexShrink: 0 }}>✕</button>
                </div>
              </div>

              {/* قائمة المسافرين */}
              <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}
                onDragOver={e => e.preventDefault()}
                onDrop={() => handleDrop(bus.id)}>
                {bp.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "2rem", color: "var(--muted)", fontSize: 12 }}>لا يوجد مسافرون بعد</div>
                ) : bp.map((p, i) => (
                  <div key={p.id} draggable onDragStart={() => handleDragStart(p.id)} onDragOver={e => handleDragOver(e, p.id)} onDragEnd={handleDragEnd}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 18px", borderBottom: "1px solid var(--line)", background: draggingId === p.id ? "rgba(125,31,60,.06)" : dragOverId === p.id ? "rgba(125,31,60,.03)" : "transparent", cursor: "grab", opacity: draggingId === p.id ? 0.5 : 1 }}>
                    <span style={{ color: "var(--muted)", cursor: "grab", flexShrink: 0 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="5" r="1" fill="currentColor"/><circle cx="15" cy="5" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="19" r="1" fill="currentColor"/><circle cx="15" cy="19" r="1" fill="currentColor"/></svg>
                    </span>
                    <span style={{ fontSize: 11, color: "var(--muted)", width: 22, textAlign: "center", flexShrink: 0 }}>{i + 1}</span>
                    <Avatar name={p.name_ar} gender={p.gender} size={28} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", flex: 1 }}>{p.short_ar || p.name_ar}</span>
                    {p.services?.bus === "VIP" && <span style={{ fontSize: 10, fontWeight: 800, background: "#E8951A", color: "#fff", padding: "2px 8px", borderRadius: 99, flexShrink: 0 }}>VIP</span>}
                    <select onChange={e => moveP(p.id, e.target.value)} defaultValue="" style={{ fontSize: 11, background: "var(--ivory)", border: "1px solid var(--line)", borderRadius: 6, padding: "3px 6px", fontFamily: "inherit" }}>
                      <option value="">نقل لـ...</option>
                      {buses.filter(b => b.id !== bus.id).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <button onClick={() => removeP(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#C62828", fontSize: 18, lineHeight: 1, flexShrink: 0 }}>✕</button>
                  </div>
                ))}
              </div>

              {/* إضافة مسافرين */}
              <div style={{ padding: "10px 18px", borderTop: "1px solid var(--line)", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--ivory)", border: "1px solid var(--line)", borderRadius: 10, padding: "7px 12px", marginBottom: 8 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                  <input style={{ border: "none", background: "transparent", fontSize: 12, flex: 1, outline: "none", fontFamily: "inherit" }} placeholder="ابحث لإضافة مسافر..." value={drawerPSearch} onChange={e => setDrawerPSearch(e.target.value)} />
                </div>
                {drawerPSearch && (
                  <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 10, background: "var(--paper)" }}>
                    {drawerFiltered.length === 0 ? (
                      <div style={{ padding: 12, textAlign: "center", fontSize: 11, color: "var(--muted)" }}>لا توجد نتائج</div>
                    ) : drawerFiltered.map(p => (
                      <div key={p.id} onClick={async () => { await supabase.from("passengers").update({ bus_id: bus.id }).eq("id", p.id); setPassengers(passengers.map(x => x.id === p.id ? { ...x, bus_id: bus.id } : x)); setDrawerPSearch(""); }}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", cursor: "pointer", borderBottom: "1px solid var(--line)" }}
                        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "var(--ivory)"}
                        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}>
                        <Avatar name={p.name_ar} gender={p.gender} size={26} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", flex: 1 }}>{p.short_ar || p.name_ar}</span>
                        {p.services?.bus === "VIP" && <span style={{ fontSize: 10, fontWeight: 800, background: "#E8951A", color: "#fff", padding: "2px 7px", borderRadius: 99 }}>VIP</span>}
                        <span style={{ fontSize: 11, color: "var(--primary)", fontWeight: 700 }}>+ إضافة</span>
                      </div>
                    ))}
                  </div>
                )}
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
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>السعة (عدد المقاعد)</div>
          <input style={inp} type="number" value={busCapacity} onChange={e => setBusCapacity(e.target.value)} placeholder="مثال: 50" min="1" max="100" />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={addBus} style={{ ...btnP(), flex: 1 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> إضافة</button>
          <button onClick={() => { setShowAdd(false); setNameError(""); }} style={btnS()}>إلغاء</button>
        </div>
      </Modal>

      {/* Modal إضافة مسافرين */}
      <Modal show={showAddP} onClose={() => setShowAddP(false)} title={`إضافة مسافرين — ${currentBus?.name}`}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-2)", border: "0.5px solid #ddd", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}>
          <span style={{ color: "var(--text-muted)" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21-4.35-4.35"/></svg></span>
          <input style={{ border: "none", background: "transparent", fontSize: 12, flex: 1, outline: "none", fontFamily: "inherit" }} placeholder="ابحث..." value={pSearch} onChange={e => setPSearch(e.target.value)} />
        </div>
        {filteredP.map(p => {
          const isSel = selectedP.has(p.id);
          return (
            <div key={p.id} onClick={() => toggleSelectP(p.id)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, marginBottom: 2, cursor: "pointer", background: isSel ? "rgba(125,31,60,.08)" : "transparent" }}>
              <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${isSel ? "var(--em7)" : "var(--line)"}`, background: isSel ? "var(--em7)" : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {isSel && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
              </div>
              <span style={{ fontSize: 12, flex: 1 }}>{p.short_ar || p.name_ar}</span>
              {p.services?.bus === "VIP" && <span style={{ fontSize: 11, fontWeight: 700, background: "#E8951A", color: "#fff", padding: "2px 8px", borderRadius: 99 }}>VIP</span>}
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={confirmAddP} style={{ ...btnP(), flex: 1 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> إضافة ({selectedP.size})</button>
          <button onClick={() => setShowAddP(false)} style={btnS()}>إلغاء</button>
        </div>
      </Modal>
    </div>
  );
}

export { BusesStats, BusesPage };
