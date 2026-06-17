import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "../supabase";
import type { Passenger, Bus } from "../types";
import { Avatar } from "./Avatar";
import { Modal } from "./Modal";
import { AlertModal, useAlert } from "./AlertModal";
import { useConfig } from "../config/ConfigContext";
import { inp, btnP, btnS, makeHTML, printInPage, makeTwoLogoSectionHTML, joinSections, renderNamesTable, ICON_COLOR_CYCLE, VIP_ICON_COLOR } from "../utils";

// ===== دالة حفظ الترتيب في Supabase =====
async function saveSortOrder(items: { id: number; sort_order: number }[]) {
  await Promise.all(items.map(item =>
    supabase.from("passengers").update({ sort_order: item.sort_order }).eq("id", item.id)
  ));
}

// ===== إحصائيات الباصات =====
function BusesStats({ buses, passengers }: { buses: Bus[]; passengers: Passenger[] }) {
  const stats = useMemo(() => {
    const total = passengers.length;
    const assignedCount = passengers.filter(p => p.bus_id != null).length;
    const unassigned = total - assignedCount;
    const vipRequested = passengers.filter(p => p.services?.bus === "VIP").length;
    return { total, assignedCount, unassigned, vipRequested };
  }, [buses, passengers]);
  const { total, assignedCount, unassigned, vipRequested } = stats;

  const cards = [
    { label: "إجمالي الحجاج", num: total, sub: "الموسم الحالي", border: "#c8a24b", clr: "var(--em8)", bg: "var(--paper)" },
    { label: "موزّعون", num: assignedCount, sub: `${total ? Math.round(assignedCount / total * 100) : 0}٪ من الإجمالي`, border: "#2A9D8F", clr: "#2A9D8F", bg: "rgba(42,157,143,0.05)" },
    { label: "غير موزّعين", num: unassigned, sub: unassigned > 0 ? "يحتاج توزيع" : "مكتمل", border: unassigned > 0 ? "#c0392b" : "#ccc", clr: unassigned > 0 ? "#c0392b" : "var(--muted)", bg: unassigned > 0 ? "rgba(192,57,43,0.05)" : "var(--paper)" },
    { label: "طالبين VIP", num: vipRequested, sub: `${total ? Math.round(vipRequested / total * 100) : 0}٪ من الإجمالي`, border: "#E8951A", clr: "#E8951A", bg: "rgba(232,149,26,0.05)" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--line)", flexShrink: 0, background: "var(--ivory)" }}>
      {cards.map(({ label, num, sub, border, clr, bg }) => (
        <div key={label} style={{ background: bg, border: "1.5px solid var(--line)", borderRight: `4px solid ${border}`, borderRadius: 10, padding: "11px 14px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", marginBottom: 5 }}>{label}</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 32, fontWeight: 700, lineHeight: 1, color: clr }}>{num}</div>
          <div style={{ fontSize: 11, marginTop: 4, color: "var(--g7)" }}>{sub}</div>
        </div>
      ))}
    </div>
  );
}

// ===== صفحة الباصات =====
function BusesPage({ passengers, setPassengers }: { passengers: Passenger[]; setPassengers: (p: Passenger[]) => void }) {
  const config = useConfig();
  const { alert: alertState, showAlert } = useAlert();
  const [buses, setBuses] = useState<Bus[]>([]);
  const [editingBusId, setEditingBusId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(new Set<number>());
  const [showAdd, setShowAdd] = useState(false);
  const [showAddP, setShowAddP] = useState(false);
  const [busName, setBusName] = useState("");
  const [busType, setBusType] = useState("عادي");
  const [nameError, setNameError] = useState("");
  const [currentBusId, setCurrentBusId] = useState<number | null>(null);
  const [selectedP, setSelectedP] = useState(new Set<number>());
  const [pSearch, setPSearch] = useState("");

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

  const toggleBus = (id: number) => setExpanded(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const addBus = async () => {
    if (!busName.trim()) { setNameError("يرجى إدخال اسم الباص"); return; }
    if (buses.some(b => b.name.trim() === busName.trim())) { setNameError(`يوجد باص بالاسم "${busName}" بالفعل`); return; }
    setNameError("");
    const { data, error } = await supabase.from("buses").insert([{ name: busName.trim(), type: busType }]).select();
    if (error) { showAlert("error", `فشل إضافة الباص: ${error.message || "يرجى المحاولة مرة أخرى"}`); return; }
    if (!error && data?.[0]) {
      const newBus = data[0] as Bus;
      setBuses(prev => [...prev, newBus]);
      setExpanded(prev => new Set([...prev, newBus.id]));
      setBusName(""); setBusType("عادي"); setShowAdd(false);
    }
  };

  const deleteBus = async (id: number) => {
    if (getBusPassengers(id).length > 0) { showAlert("warning", "لا يمكن حذف باص يحتوي على مسافرين"); return; }
    const { error } = await supabase.from("buses").delete().eq("id", id);
    if (error) { showAlert("error", `فشل حذف الباص: ${error.message}`); return; }
    setBuses(prev => prev.filter(b => b.id !== id));
  };

  const openAddP = (busId: number) => { setCurrentBusId(busId); setSelectedP(new Set()); setPSearch(""); setShowAddP(true); };
  const toggleSelectP = (id: number) => setSelectedP(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const confirmAddP = async () => {
    await Promise.all([...selectedP].map(id => supabase.from("passengers").update({ bus_id: currentBusId }).eq("id", id)));
    setPassengers(passengers.map(p => selectedP.has(p.id) ? { ...p, bus_id: currentBusId } : p));
    const familyToAdd = passengers.filter(p => !selectedP.has(p.id) && p.bus_id == null && [...selectedP].some(id => { const sel = passengers.find(x => x.id === id); return sel?.family_id && sel.family_id === p.family_id; }));
    if (familyToAdd.length > 0 && confirm(`سيتم تعيين حجاج بدون أقاربهم.\nهل تريد إضافة أقاربهم معهم أيضًا؟\n${familyToAdd.map(p => p.short_ar).join("، ")}`)) {
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
      <BusesStats buses={buses} passengers={passengers} />
      <div style={{ display: "flex", gap: 8, marginBottom: 12, marginTop: 12 }}>
        <button onClick={() => setShowAdd(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 99, background: "var(--paper)", border: "1px solid var(--line)", color: "var(--em7)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)", transition: "var(--transition)", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }} onMouseEnter={e => { e.currentTarget.style.background = "rgba(125,31,60,0.06)"; e.currentTarget.style.borderColor = "var(--em7)"; }} onMouseLeave={e => { e.currentTarget.style.background = "var(--paper)"; e.currentTarget.style.borderColor = "var(--line)"; }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> باص جديد
        </button>
        {buses.length > 0 && <button onClick={printAll} style={btnS()}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> طباعة الكل</button>}
      </div>

      {!buses.length ? (
        <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)", fontSize: 12 }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="15" cy="18" r="2"/></svg>
          <br />لا يوجد باصات بعد
        </div>
      ) : buses.map((bus, idx) => {
        const isExpanded = expanded.has(bus.id);
        const bp = getBusPassengers(bus.id);
        const isVIP = bus.type === "VIP";
        const busColor = isVIP ? VIP_ICON_COLOR : ICON_COLOR_CYCLE[idx % ICON_COLOR_CYCLE.length];
        return (
          <div key={bus.id} style={{ border: `0.5px solid ${isVIP ? "var(--accent)" : "var(--border)"}`, borderRadius: 12, marginBottom: 8, overflow: "hidden" }}>
            {/* Header */}
            <div onClick={() => toggleBus(bus.id)} style={{ padding: "10px 12px", background: isVIP ? "var(--warning-bg)" : "var(--bg-2)", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: busColor, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="15" cy="18" r="2"/></svg>
              </div>
              <div style={{ flex: 1 }}>
                {editingBusId === bus.id ? (
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }} onClick={e => e.stopPropagation()}>
                    <input defaultValue={bus.name} id={`bus-name-${bus.id}`} style={{ ...inp, fontSize: 12, padding: "3px 8px", width: 120 }} onKeyDown={e => { if (e.key === "Enter") { const v = (document.getElementById(`bus-name-${bus.id}`) as HTMLInputElement)?.value?.trim(); if (v) { supabase.from("buses").update({ name: v }).eq("id", bus.id); setBuses(buses.map(b => b.id === bus.id ? { ...b, name: v } : b)); } setEditingBusId(null); } if (e.key === "Escape") setEditingBusId(null); }} autoFocus />
                    <button onClick={() => { const v = (document.getElementById(`bus-name-${bus.id}`) as HTMLInputElement)?.value?.trim(); if (v) { supabase.from("buses").update({ name: v }).eq("id", bus.id); setBuses(buses.map(b => b.id === bus.id ? { ...b, name: v } : b)); } setEditingBusId(null); }} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "var(--em7)", color: "#fff", border: "none", cursor: "pointer" }}>✓</button>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }} onDoubleClick={e => { e.stopPropagation(); setEditingBusId(bus.id); }}>
                    {bus.name}
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: isVIP ? "var(--warning-bg)" : "var(--info-bg)", color: isVIP ? "var(--warning)" : "var(--info)" }}>{isVIP ? "VIP" : "عادي"}</span>
                  </div>
                )}
              </div>
              <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 4 }}>{bp.length} مسافر</span>
              <button onClick={e => { e.stopPropagation(); printBus(bus); }} style={btnS()}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg></button>
              <button onClick={e => { e.stopPropagation(); openAddP(bus.id); }} style={{ ...btnS(), background: "rgba(125,31,60,0.08)", borderColor: "var(--em7)", color: "var(--em7)" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
              <button onClick={e => { e.stopPropagation(); deleteBus(bus.id); }} style={{ background: "none", border: `1px solid ${bp.length === 0 ? "rgba(122,46,69,0.2)" : "var(--line)"}`, borderRadius: 6, padding: "4px 7px", cursor: bp.length === 0 ? "pointer" : "not-allowed", color: bp.length === 0 ? "var(--ff)" : "var(--text-muted)", transition: "var(--transition)" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" style={{ transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>
            </div>

            {/* Passengers list with Drag & Drop */}
            {isExpanded && (
              <div
                style={{ padding: "8px 12px", borderTop: `0.5px solid ${isVIP ? "var(--accent)" : "var(--border)"}` }}
                onDragOver={e => e.preventDefault()}
                onDrop={() => handleDrop(bus.id)}
              >
                {bp.length ? bp.map((p, i) => (
                  <div
                    key={p.id}
                    draggable
                    onDragStart={() => handleDragStart(p.id)}
                    onDragOver={e => handleDragOver(e, p.id)}
                    onDragEnd={handleDragEnd}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "5px 4px", borderRadius: 6, marginBottom: 2,
                      background: draggingId === p.id ? "rgba(125,31,60,0.08)" : dragOverId === p.id ? "rgba(125,31,60,0.04)" : "transparent",
                      border: `1px solid ${dragOverId === p.id ? "var(--em7)" : "transparent"}`,
                      cursor: "grab", transition: "background 0.15s",
                      opacity: draggingId === p.id ? 0.5 : 1,
                    }}
                  >
                    {/* أيقونة السحب */}
                    <span style={{ color: "var(--muted)", cursor: "grab", flexShrink: 0 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <circle cx="9" cy="5" r="1" fill="currentColor"/><circle cx="15" cy="5" r="1" fill="currentColor"/>
                        <circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/>
                        <circle cx="9" cy="19" r="1" fill="currentColor"/><circle cx="15" cy="19" r="1" fill="currentColor"/>
                      </svg>
                    </span>
                    <span style={{ fontSize: 10, color: "var(--text-muted)", width: 18, textAlign: "center" }}>{i + 1}</span>
                    <Avatar name={p.name_ar} gender={p.gender} size={24} />
                    <span style={{ fontSize: 11, flex: 1 }}>{p.short_ar || p.name_ar}</span>
                    {p.services?.bus === "VIP" && <span style={{ fontSize: 11, fontWeight: 700, background: "#E8951A", color: "#fff", padding: "2px 8px", borderRadius: 99 }}>VIP</span>}
                    <select onChange={e => moveP(p.id, e.target.value)} defaultValue="" style={{ fontSize: 10, background: "var(--bg-2)", border: "0.5px solid #ddd", borderRadius: 4, padding: "2px 4px", fontFamily: "inherit" }}>
                      <option value="">نقل لـ...</option>
                      {buses.filter(b => b.id !== bus.id).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <button onClick={() => removeP(p.id)} title="إزالة من الباص" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", fontSize: 18, lineHeight: 1, padding: "0 4px" }}>✕</button>
                  </div>
                )) : (
                  <div style={{ textAlign: "center", padding: "10px", color: "var(--text-muted)", fontSize: 11 }}>لا يوجد مسافرون</div>
                )}
              </div>
            )}
          </div>
        );
      })}

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
