import { useState, useEffect, useRef } from "react";
import type { DragEvent } from "react";
import { supabase } from "../supabase";
import type { Passenger, Flight } from "../types";
import { Modal } from "./Modal";
import { AlertModal, useAlert } from "./AlertModal";
import { useConfig } from "../config/ConfigContext";
import { inp, btnP, btnS, makeHTML, printInPage, makeFlightSectionHTML, joinSections, ICON_COLOR_CYCLE, FLIGHT_ICON_COLORS } from "../utils";

// ===== دالة حفظ ترتيب الحجاج =====
async function saveSortOrder(items: { id: number; sort_order: number }[]) {
  await Promise.all(items.map(item =>
    supabase.from("passengers").update({ sort_order: item.sort_order }).eq("id", item.id)
  ));
}

// رحلات الذهاب تستخدم flight_id، ورحلات الإياب تستخدم return_flight_id — كل واحد مستقل عن التاني
const flightField = (type?: string): "flight_id" | "return_flight_id" => type === "إياب" ? "return_flight_id" : "flight_id";

function FlightsStats({ passengers }: { passengers: Passenger[] }) {
  const hajjOnly = passengers.filter(p => !p.passenger_type || p.passenger_type === "حاج");
  const total = hajjOnly.length;
  const withoutTicket = hajjOnly.filter(p => p.services?.flight === "بدون").length;
  const needsFlight = total - withoutTicket;
  const assigned = hajjOnly.filter(p => p.flight_id != null).length;
  const unassigned = passengers.filter(p => p.flight_id == null && p.services?.flight !== "بدون" && (!p.passenger_type || p.passenger_type === "حاج")).length;
  const firstClass = hajjOnly.filter(p => p.services?.flight === "درجة أولى").length;

  const cards = [
    { label: "إجمالي الحجاج", num: total, sub: "الموسم الحالي", border: "#c8a24b", clr: "var(--em8)", bg: "var(--paper)" },
    { label: "موزّعون", num: assigned, sub: `${needsFlight ? Math.round(assigned/needsFlight*100) : 0}٪ من المحتاجين`, border: "#2A9D8F", clr: "#2A9D8F", bg: "rgba(42,157,143,0.05)" },
    { label: "غير موزّعين", num: unassigned, sub: unassigned > 0 ? "يحتاج توزيع" : "مكتمل", border: unassigned > 0 ? "#c0392b" : "#ccc", clr: unassigned > 0 ? "#c0392b" : "var(--muted)", bg: unassigned > 0 ? "rgba(192,57,43,0.05)" : "var(--paper)" },
    { label: "درجة أولى", num: firstClass, sub: `${total ? Math.round(firstClass/total*100) : 0}٪ من الإجمالي`, border: "#E8951A", clr: "#E8951A", bg: "rgba(232,149,26,0.05)" },
    { label: "بدون تذكرة", num: withoutTicket, sub: withoutTicket > 0 ? "يحتاج مراجعة" : "لا يوجد", border: withoutTicket > 0 ? "#7a2e45" : "#ccc", clr: withoutTicket > 0 ? "var(--ff)" : "var(--muted)", bg: withoutTicket > 0 ? "var(--fb)" : "var(--paper)" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--line)", flexShrink: 0, background: "var(--ivory)" }}>
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

// ===== صفحة الطيران =====
function FlightsPage({ passengers, setPassengers }: { passengers: Passenger[]; setPassengers: (p: Passenger[]) => void }) {
  const config = useConfig();
  const { alert: alertState, showAlert } = useAlert();
  const [flights, setFlights] = useState<Flight[]>([]);
  const [editingFlightId, setEditingFlightId] = useState<number | null>(null);
  const [editFlightModal, setEditFlightModal] = useState<Flight | null>(null);
  const [editForm, setEditForm] = useState({ name: "", type: "ذهاب" as "ذهاب" | "إياب", airline: "", date: "", time: "", from_airport: "", to_airport: "" });
  const [expanded, setExpanded] = useState(new Set<number>());
  // ترتيب الحجاج بالسحب
  const dragPassengerId = useRef<number | null>(null);
  const dragOverPassengerId = useRef<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [flightName, setFlightName] = useState("");
  const [flightType, setFlightType] = useState<"ذهاب" | "إياب">("ذهاب");
  const [airline, setAirline] = useState("");
  const [flightDate, setFlightDate] = useState("");
  const [flightTime, setFlightTime] = useState("");
  const [fromAirport, setFromAirport] = useState("");
  const [toAirport, setToAirport] = useState("");
  const [nameError, setNameError] = useState("");
  const [showAddP, setShowAddP] = useState(false);
  const [currentFlightId, setCurrentFlightId] = useState<number | null>(null);
  const [addFlightClass, setAddFlightClass] = useState("عادي");
  const [selectedP, setSelectedP] = useState(new Set<number>());
  const [pSearch, setPSearch] = useState("");

  useEffect(() => {
    supabase.from("flights").select("*").order("created_at").then(({ data }: any) => { if (data) setFlights(data as Flight[]); });
  }, []);

  const getFlightPassengers = (flight: Flight) => {
    const field = flightField(flight.type);
    return passengers.filter(p => (p as any)[field] === flight.id).sort((a, b) => ((a as any).sort_order ?? 0) - ((b as any).sort_order ?? 0));
  };
  const toggleFlight = (id: number) => setExpanded(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  // ===== Drag & Drop لترتيب الحجاج =====
  const handleDragStart = (pId: number) => { dragPassengerId.current = pId; setDraggingId(pId); };
  const handleDragOver = (e: DragEvent, pId: number) => { e.preventDefault(); dragOverPassengerId.current = pId; setDragOverId(pId); };
  const handleDragEnd = () => { setDraggingId(null); setDragOverId(null); dragPassengerId.current = null; dragOverPassengerId.current = null; };
  const handleDrop = async (flight: Flight) => {
    const fromId = dragPassengerId.current;
    const toId = dragOverPassengerId.current;
    if (!fromId || !toId || fromId === toId) { handleDragEnd(); return; }
    const fp = getFlightPassengers(flight);
    const fromIdx = fp.findIndex(p => p.id === fromId);
    const toIdx = fp.findIndex(p => p.id === toId);
    if (fromIdx === -1 || toIdx === -1) { handleDragEnd(); return; }
    const newOrder = [...fp];
    const [moved] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, moved);
    const updates = newOrder.map((p, i) => ({ id: p.id, sort_order: i + 1 }));
    setPassengers(passengers.map(p => {
      const upd = updates.find(u => u.id === p.id);
      return upd ? { ...p, sort_order: upd.sort_order } : p;
    }));
    await saveSortOrder(updates);
    handleDragEnd();
  };

  // ===== تعديل بيانات الرحلة كاملة =====
  const openEditFlight = (flight: Flight) => {
    setEditFlightModal(flight);
    setEditForm({ name: flight.name, type: flight.type, airline: flight.airline || "", date: flight.date || "", time: flight.time || "", from_airport: flight.from_airport || "", to_airport: flight.to_airport || "" });
  };
  const saveEditFlight = async () => {
    if (!editFlightModal) return;
    const upd = { name: editForm.name.trim(), type: editForm.type, airline: editForm.airline.trim(), date: editForm.date, time: editForm.time, from_airport: editForm.from_airport.trim(), to_airport: editForm.to_airport.trim() };
    await supabase.from("flights").update(upd).eq("id", editFlightModal.id);
    setFlights(flights.map(f => f.id === editFlightModal.id ? { ...f, ...upd } : f));
    setEditFlightModal(null);
  };

  const addFlight = async () => {
    if (!flightName.trim()) { setNameError("يرجى إدخال رقم الرحلة أو اسمها"); return; }
    if (flights.some(f => f.name.trim() === flightName.trim() && f.type === flightType)) { setNameError(`رحلة ${flightType} بالاسم "${flightName}" موجودة بالفعل`); return; }
    setNameError("");
    const { data, error } = await supabase.from("flights").insert([{ name: flightName.trim(), type: flightType, airline: airline.trim(), date: flightDate, time: flightTime, from_airport: fromAirport.trim(), to_airport: toAirport.trim() }]).select();
    if (error) { showAlert("error", `فشل إضافة الرحلة: ${error.message || "يرجى المحاولة مرة أخرى"}`); return; }
    if (!error && data?.[0]) {
      const newFlight = data[0] as Flight;
      setFlights(prev => [...prev, newFlight]);
      setExpanded(prev => new Set([...prev, newFlight.id]));
      setFlightName(""); setFlightType("ذهاب"); setAirline(""); setFlightDate(""); setFlightTime(""); setFromAirport(""); setToAirport(""); setShowAdd(false);
    }
  };

  const deleteFlight = async (flight: Flight) => {
    if (getFlightPassengers(flight).length > 0) { showAlert("warning", "لا يمكن حذف رحلة تحتوي على مسافرين"); return; }
    await supabase.from("flights").delete().eq("id", flight.id);
    setFlights(prev => prev.filter(f => f.id !== flight.id));
  };

  const openAddP = (flightId: number) => { setCurrentFlightId(flightId); setSelectedP(new Set()); setPSearch(""); setAddFlightClass("عادي"); setShowAddP(true); };
  const toggleSelectP = (id: number) => setSelectedP(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const confirmAddP = async () => {
    const field = flightField(currentFlight?.type);
    await Promise.all([...selectedP].map(id => supabase.from("passengers").update({ [field]: currentFlightId, flight_class: effectiveClass }).eq("id", id)));
    setPassengers(passengers.map(p => selectedP.has(p.id) ? { ...p, [field]: currentFlightId, flight_class: effectiveClass } : p));
    setShowAddP(false);
  };

  const removeP = async (pId: number, field: "flight_id" | "return_flight_id") => {
    await supabase.from("passengers").update({ [field]: null }).eq("id", pId);
    setPassengers(passengers.map(p => p.id === pId ? { ...p, [field]: null } : p));
  };

  const branding = { logoUrl: config.logo_url || "", companyName: config.name_ar || "حملة الأقصى", tagline: config.tagline || "", primaryColor: config.color_primary || "#6B1F3A", accentColor: config.color_accent || "#0C447C" };

  const printFlight = (flight: Flight) => {
    const fp = getFlightPassengers(flight);
    printInPage(makeHTML("تقرير الرحلة", makeFlightSectionHTML(flight, fp, branding), false, branding.logoUrl, branding.companyName, branding.tagline, branding.primaryColor, branding.accentColor));
  };

  const printAll = () => {
    const sections = flights.map(f => makeFlightSectionHTML(f, getFlightPassengers(f), branding));
    printInPage(makeHTML("تقرير الرحلات", joinSections(sections), false, branding.logoUrl, branding.companyName, branding.tagline, branding.primaryColor, branding.accentColor, true));
  };

  const currentFlight = flights.find(f => f.id === currentFlightId);
  const currentField = flightField(currentFlight?.type);
  const availableP = passengers.filter(p => {
    if (p.passenger_type && p.passenger_type !== "حاج") return false;
    if (p.services?.flight === "بدون") return false;
    if (!currentFlight) return false;
    const val = (p as any)[currentField];
    if (val === currentFlightId) return false; // already in this flight
    return val == null; // مفيش رحلة من نفس النوع متخصصة له بعد
  });
  const allSelectedWantFirst = selectedP.size > 0 && [...selectedP].every(id => passengers.find(p => p.id === id)?.services?.flight === "درجة أولى");
  const effectiveClass = (!allSelectedWantFirst && addFlightClass === "درجة أولى") ? "عادي" : addFlightClass;
  const filteredP = availableP.filter(p => !pSearch || p.name_ar.includes(pSearch) || p.passport.includes(pSearch));
  const goFlights = flights.filter(f => f.type === "ذهاب");
  const retFlights = flights.filter(f => f.type === "إياب");

  const renderGroup = (groupFlights: Flight[], type: "ذهاب" | "إياب") => (
    <div style={{ marginBottom: 16 }}>
      <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 99, background: type === "ذهاب" ? "var(--male-bg)" : "var(--female-bg)", color: type === "ذهاب" ? "var(--info)" : "var(--female-fg)", display: "inline-block", marginBottom: 10 }}>
        {type === "ذهاب" ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg> رحلات الذهاب</> : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg> رحلات الإياب</>} ({groupFlights.length})
      </span>
      {groupFlights.length === 0 ? <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "6px 0" }}>لا يوجد رحلات بعد</div> :
        groupFlights.map((flight, idx) => {
          const isExpanded = expanded.has(flight.id);
          const fp = getFlightPassengers(flight);
          const flightColor = ICON_COLOR_CYCLE[idx % ICON_COLOR_CYCLE.length] || FLIGHT_ICON_COLORS[type];
          return (
            <div key={flight.id} style={{ border: `0.5px solid ${type === "ذهاب" ? "var(--male-bg)" : "var(--female-bg)"}`, borderRadius: 12, marginBottom: 8, overflow: "hidden" }}>
              <div onClick={() => toggleFlight(flight.id)} style={{ padding: "10px 12px", background: type === "ذهاب" ? "var(--info-bg)" : "var(--female-bg)", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: flightColor, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>
                </div>
                <div style={{ flex: 1 }} onDoubleClick={e => { e.stopPropagation(); setEditingFlightId(flight.id); }}>
                  {editingFlightId === flight.id ? (
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }} onClick={e => e.stopPropagation()}>
                      <input defaultValue={flight.name} id={`fn-${flight.id}`} style={{ ...inp, fontSize: 12, padding: "3px 8px", width: 130 }} autoFocus
                        onKeyDown={e => { if (e.key === "Enter") { const v = (document.getElementById(`fn-${flight.id}`) as HTMLInputElement)?.value?.trim(); if (v) { supabase.from("flights").update({ name: v }).eq("id", flight.id); setFlights(flights.map(f => f.id === flight.id ? { ...f, name: v } : f)); } setEditingFlightId(null); } if (e.key === "Escape") setEditingFlightId(null); }} />
                      <button onClick={() => { const v = (document.getElementById(`fn-${flight.id}`) as HTMLInputElement)?.value?.trim(); if (v) { supabase.from("flights").update({ name: v }).eq("id", flight.id); setFlights(flights.map(f => f.id === flight.id ? { ...f, name: v } : f)); } setEditingFlightId(null); }} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "var(--em7)", color: "#fff", border: "none", cursor: "pointer" }}>✓</button>
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{flight.name} {flight.airline && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>— {flight.airline}</span>}</div>
                  )}
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{flight.from_airport} {flight.to_airport ? `← ${flight.to_airport}` : ""} {flight.date ? `| ${flight.date}` : ""} {flight.time || ""}</div>
                </div>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{fp.length} مسافر</span>
                <button onClick={e => { e.stopPropagation(); openEditFlight(flight); }} title="تعديل بيانات الرحلة" style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--paper)", border: "1px solid var(--line)", cursor: "pointer", color: "var(--muted)", transition: "var(--transition)" }} onMouseEnter={e => { e.currentTarget.style.background = "var(--ivory2)"; e.currentTarget.style.color = "var(--ink)"; }} onMouseLeave={e => { e.currentTarget.style.background = "var(--paper)"; e.currentTarget.style.color = "var(--muted)"; }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button>
                <button onClick={e => { e.stopPropagation(); printFlight(flight); }} title="طباعة" style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--paper)", border: "1px solid var(--line)", cursor: "pointer", color: "var(--muted)", transition: "var(--transition)" }} onMouseEnter={e => { e.currentTarget.style.background = "var(--ivory2)"; e.currentTarget.style.color = "var(--ink)"; }} onMouseLeave={e => { e.currentTarget.style.background = "var(--paper)"; e.currentTarget.style.color = "var(--muted)"; }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg></button>
                <button onClick={e => { e.stopPropagation(); openAddP(flight.id); }} title="إضافة مسافر" style={{ height: 30, padding: "0 12px", borderRadius: 8, display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(125,31,60,0.08)", border: "1px solid rgba(125,31,60,0.2)", cursor: "pointer", color: "var(--em7)", fontSize: 12, fontWeight: 600, fontFamily: "var(--font-body)", transition: "var(--transition)" }} onMouseEnter={e => { e.currentTarget.style.background = "rgba(125,31,60,0.15)"; }} onMouseLeave={e => { e.currentTarget.style.background = "rgba(125,31,60,0.08)"; }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> إضافة</button>
                <button onClick={e => { e.stopPropagation(); deleteFlight(flight); }} title="حذف الرحلة" style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: fp.length === 0 ? "var(--fb)" : "var(--paper)", border: `1px solid ${fp.length === 0 ? "rgba(122,46,69,0.2)" : "var(--line)"}`, cursor: fp.length === 0 ? "pointer" : "not-allowed", color: fp.length === 0 ? "var(--ff)" : "var(--text-muted)", transition: "var(--transition)" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" style={{ transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>
              </div>
              {isExpanded && (
                <div
                  style={{ padding: "8px 12px", borderTop: `0.5px solid ${type === "ذهاب" ? "var(--male-bg)" : "var(--female-bg)"}` }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => handleDrop(flight)}
                >
                  {fp.length ? fp.map((p, i) => (
                    <div
                      key={p.id}
                      draggable
                      onDragStart={() => handleDragStart(p.id)}
                      onDragOver={e => handleDragOver(e, p.id)}
                      onDragEnd={handleDragEnd}
                      style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "4px", borderRadius: 6, marginBottom: 2,
                        background: draggingId === p.id ? "rgba(125,31,60,0.08)" : dragOverId === p.id ? "rgba(125,31,60,0.04)" : "transparent",
                        border: `1px solid ${dragOverId === p.id ? "var(--em7)" : "transparent"}`,
                        cursor: "grab", transition: "background 0.15s",
                        opacity: draggingId === p.id ? 0.5 : 1,
                      }}
                    >
                      <span style={{ color: "var(--muted)", cursor: "grab", flexShrink: 0 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <circle cx="9" cy="5" r="1" fill="currentColor"/><circle cx="15" cy="5" r="1" fill="currentColor"/>
                          <circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/>
                          <circle cx="9" cy="19" r="1" fill="currentColor"/><circle cx="15" cy="19" r="1" fill="currentColor"/>
                        </svg>
                      </span>
                      <span style={{ fontSize: 10, color: "var(--text-muted)", width: 18, textAlign: "center", flexShrink: 0 }}>{i + 1}</span>
                      <span style={{ fontSize: 11, flex: 1 }}>{p.short_ar || p.name_ar}</span>
                      {(p as any).flight_class === "درجة أولى" && <span style={{ fontSize: 11, fontWeight: 700, background: "#E8951A", color: "#fff", padding: "2px 8px", borderRadius: 99 }}>⭐ أولى</span>}
                      <button onClick={() => removeP(p.id, flightField(type))} title="إزالة من الرحلة" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", fontSize: 18, lineHeight: 1, padding: "0 4px" }}>✕</button>
                    </div>
                  )) : <div style={{ textAlign: "center", padding: "8px", color: "var(--text-muted)", fontSize: 11 }}>لا يوجد مسافرون</div>}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );

  return (
    <div style={{ padding: 14, overflowY: "auto", height: "100%" }}>
      <AlertModal alert={alertState} onClose={() => showAlert(null)} />
      <FlightsStats passengers={passengers} />
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => setShowAdd(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 99, background: "var(--paper)", border: "1px solid var(--line)", color: "var(--em7)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)", transition: "var(--transition)", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }} onMouseEnter={e => { e.currentTarget.style.background = "rgba(125,31,60,0.06)"; e.currentTarget.style.borderColor = "var(--em7)"; }} onMouseLeave={e => { e.currentTarget.style.background = "var(--paper)"; e.currentTarget.style.borderColor = "var(--line)"; }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> رحلة جديدة</button>
        {flights.length > 0 && <button onClick={printAll} style={btnS()}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> طباعة الكل</button>}
      </div>
      {!flights.length ? <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)", fontSize: 12 }}><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.2" strokeLinecap="round"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg><br />لا يوجد رحلات بعد</div> : (
        <>{renderGroup(goFlights, "ذهاب")}{renderGroup(retFlights, "إياب")}</>
      )}

      <Modal show={showAdd} onClose={() => { setShowAdd(false); setNameError(""); }} title="رحلة جديدة" maxWidth={380}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>نوع الرحلة</div>
          <div style={{ display: "flex", gap: 8 }}>
            {(["ذهاب", "إياب"] as const).map(t => (
              <div key={t} onClick={() => setFlightType(t)} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: `1.5px solid ${flightType === t ? (t === "ذهاب" ? "var(--info)" : "var(--female-fg)") : "var(--border)"}`, background: flightType === t ? (t === "ذهاب" ? "var(--male-bg)" : "var(--female-bg)") : "transparent", cursor: "pointer", textAlign: "center", fontSize: 12, color: flightType === t ? (t === "ذهاب" ? "var(--info)" : "var(--female-fg)") : "var(--text-muted)" }}>
                {t === "ذهاب" ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg> ذهاب</> : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg> إياب</>}
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>رقم الرحلة</div>
          <input style={{ ...inp, borderColor: nameError ? "var(--danger)" : "var(--border)" }} value={flightName} onChange={e => { setFlightName(e.target.value); setNameError(""); }} placeholder="مثال: QR501" autoFocus onKeyDown={e => e.key === "Enter" && addFlight()} />
          {nameError && <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 3 }}>{nameError}</div>}
        </div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>الشركة</div>
          <input style={inp} value={airline} onChange={e => setAirline(e.target.value)} placeholder="مثال: Qatar Airways" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <div><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>التاريخ</div><input style={inp} type="date" value={flightDate} onChange={e => setFlightDate(e.target.value)} /></div>
          <div><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>الوقت</div><input style={inp} type="time" value={flightTime} onChange={e => setFlightTime(e.target.value)} /></div>
          <div><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>من</div><input style={inp} value={fromAirport} onChange={e => setFromAirport(e.target.value)} placeholder="الدوحة DOH" /></div>
          <div><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>إلى</div><input style={inp} value={toAirport} onChange={e => setToAirport(e.target.value)} placeholder="جدة JED" /></div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={addFlight} style={{ ...btnP(), flex: 1 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> إضافة</button>
          <button onClick={() => { setShowAdd(false); setNameError(""); }} style={btnS()}>إلغاء</button>
        </div>
      </Modal>

      <Modal show={showAddP} onClose={() => setShowAddP(false)} title={`إضافة — ${currentFlight?.name} (${currentFlight?.type})`}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {(["عادي", ...(allSelectedWantFirst ? ["درجة أولى"] : [])] as string[]).map(cls => (
            <div key={cls} onClick={() => setAddFlightClass(cls)} style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: `1.5px solid ${addFlightClass === cls ? "var(--em7)" : "var(--border)"}`, background: addFlightClass === cls ? "rgba(125,31,60,.08)" : "transparent", cursor: "pointer", textAlign: "center", fontSize: 12, color: addFlightClass === cls ? "var(--em7)" : "var(--text-muted)" }}>
              {cls === "درجة أولى" ? "درجة أولى" : "عادي"}
            </div>
          ))}
          {!allSelectedWantFirst && selectedP.size > 0 && <div style={{ fontSize: 10, color: "var(--text-muted)", alignSelf: "center" }}>درجة أولى متاحة بس للي طلبوها</div>}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-2)", border: "0.5px solid #ddd", borderRadius: 8, padding: "6px 10px", flex: 1 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21-4.35-4.35"/></svg>
            <input style={{ border: "none", background: "transparent", fontSize: 12, flex: 1, outline: "none", fontFamily: "inherit" }} placeholder="ابحث..." value={pSearch} onChange={e => setPSearch(e.target.value)} />
          </div>
          <button onClick={() => setSelectedP(prev => prev.size === filteredP.length ? new Set() : new Set(filteredP.map(p => p.id)))}
            style={{ fontSize: 11, padding: "0 10px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg-2)", cursor: "pointer", whiteSpace: "nowrap" }}>
            {selectedP.size === filteredP.length ? "إلغاء الكل" : "تحديد الكل"}
          </button>
        </div>
        {filteredP.length === 0 ? <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 12, padding: "1rem" }}>لا يوجد مسافرين متاحين</div> :
          filteredP.map(p => {
            const isSel = selectedP.has(p.id);
            const wantsFirst = p.services?.flight === "درجة أولى";
            return (
              <div key={p.id} onClick={() => toggleSelectP(p.id)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, marginBottom: 2, cursor: "pointer", background: isSel ? "rgba(125,31,60,.08)" : "transparent" }}>
                <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${isSel ? "var(--em7)" : "var(--line)"}`, background: isSel ? "var(--em7)" : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {isSel && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                </div>
                <span style={{ fontSize: 12, flex: 1 }}>{p.short_ar || p.name_ar}</span>
                {wantsFirst && <span style={{ fontSize: 11, fontWeight: 700, background: "#E8951A", color: "#fff", padding: "2px 8px", borderRadius: 99 }}>أولى</span>}
              </div>
            );
          })}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={confirmAddP} style={{ ...btnP(), flex: 1 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> إضافة ({selectedP.size})</button>
          <button onClick={() => setShowAddP(false)} style={btnS()}>إلغاء</button>
        </div>
      </Modal>

      <Modal show={!!editFlightModal} onClose={() => setEditFlightModal(null)} title="تعديل بيانات الرحلة" maxWidth={380}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>نوع الرحلة</div>
          <div style={{ display: "flex", gap: 8 }}>
            {(["ذهاب", "إياب"] as const).map(t => (
              <div key={t} onClick={() => setEditForm(p => ({ ...p, type: t }))} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: `1.5px solid ${editForm.type === t ? (t === "ذهاب" ? "var(--info)" : "var(--female-fg)") : "var(--border)"}`, background: editForm.type === t ? (t === "ذهاب" ? "var(--male-bg)" : "var(--female-bg)") : "transparent", cursor: "pointer", textAlign: "center", fontSize: 12, color: editForm.type === t ? (t === "ذهاب" ? "var(--info)" : "var(--female-fg)") : "var(--text-muted)" }}>
                {t === "ذهاب" ? "ذهاب" : "إياب"}
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>رقم الرحلة</div>
          <input style={inp} value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} placeholder="مثال: QR501" />
        </div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>الشركة</div>
          <input style={inp} value={editForm.airline} onChange={e => setEditForm(p => ({ ...p, airline: e.target.value }))} placeholder="مثال: Qatar Airways" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <div><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>التاريخ</div><input style={inp} type="date" value={editForm.date} onChange={e => setEditForm(p => ({ ...p, date: e.target.value }))} /></div>
          <div><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>الوقت</div><input style={inp} type="time" value={editForm.time} onChange={e => setEditForm(p => ({ ...p, time: e.target.value }))} /></div>
          <div><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>من</div><input style={inp} value={editForm.from_airport} onChange={e => setEditForm(p => ({ ...p, from_airport: e.target.value }))} placeholder="الدوحة DOH" /></div>
          <div><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>إلى</div><input style={inp} value={editForm.to_airport} onChange={e => setEditForm(p => ({ ...p, to_airport: e.target.value }))} placeholder="جدة JED" /></div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={saveEditFlight} style={{ ...btnP(), flex: 1 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> حفظ</button>
          <button onClick={() => setEditFlightModal(null)} style={btnS()}>إلغاء</button>
        </div>
      </Modal>
    </div>
  );
}


export { FlightsStats, FlightsPage };
