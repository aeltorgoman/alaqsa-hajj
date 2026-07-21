import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import type { TablesUpdate } from "../types/database";
import type { Passenger, Flight } from "../types";
import { Modal } from "./Modal";
import { AlertModal, useAlert } from "./AlertModal";
import { StatsRow, type StatCardData } from "./StatCard";
import { useConfig } from "../config/ConfigContext";
import { inp, btnP, btnS, makeHTML, printInPage, makeFlightSectionHTML, joinSections } from "../utils";

// رحلات الذهاب تستخدم flight_id، ورحلات الإياب تستخدم return_flight_id
const flightField = (type?: string): "flight_id" | "return_flight_id" =>
  type === "إياب" ? "return_flight_id" : "flight_id";

// ===== استخراج كود المطار والمدينة من النص =====
const extractIATA = (airport: string) => {
  const m = airport.match(/\b([A-Z]{3})\b/);
  return m ? m[1] : airport.slice(0, 3).toUpperCase();
};
const extractCity = (airport: string) => airport.replace(/\b[A-Z]{3}\b/, "").trim() || airport;

// ===== أيقونة الطائرة SVG =====
const PlaneIcon = ({ size = 16, color = "currentColor", flip = false, animation }: { size?: number; color?: string; flip?: boolean; animation?: string }) => (
  <span style={{ fontSize: size, lineHeight: 1, display: "block", transform: flip ? "scaleX(-1)" : undefined, animation, color }}>✈</span>
);

// ===== شعارات شركات الطيران =====
const AIRLINE_LOGOS: Record<string, string> = {
  qatar: "https://upload.wikimedia.org/wikipedia/en/thumb/9/9b/Qatar_Airways_Logo.svg/120px-Qatar_Airways_Logo.svg.png",
  saudia: "data:image/png;base64,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",
};

const getAirlineLogoUrl = (airline: string): string | null => {
  const a = airline.toLowerCase();
  if (a.includes("qatar")) return AIRLINE_LOGOS.qatar;
  if (a.includes("saudi") || a.includes("saudia")) return AIRLINE_LOGOS.saudia;
  return null;
};

// ===== ملخص صفحة الطيران =====
function FlightsStats({ passengers }: { passengers: Passenger[] }) {
  const hajjOnly = passengers.filter(p => !p.passenger_type || p.passenger_type === "حاج");
  const total = hajjOnly.length;
  const withoutTicket = hajjOnly.filter(p => p.services?.flight === "بدون").length;
  const needsFlight = total - withoutTicket;
  const assigned = hajjOnly.filter(p => p.flight_id != null).length;
  const firstClass = hajjOnly.filter(p => p.services?.flight === "درجة أولى").length;

  const assignedPct = needsFlight ? Math.round(assigned / needsFlight * 100) : 0;
  const cards: StatCardData[] = [
    { label: "إجمالي الحجاج", num: total, sub: "الموسم الحالي", tone: "brand" },
    { label: "درجة أولى", num: firstClass, sub: `${total ? Math.round(firstClass / total * 100) : 0}٪ من الإجمالي`, tone: "warning" },
    { label: "بدون تذكرة", num: withoutTicket, sub: "حسب طلب الحاج", tone: withoutTicket > 0 ? "female" : "muted" },
    { label: "نسبة التوزيع", num: `${assignedPct}%`, sub: `${assigned} من ${needsFlight} حاج`, tone: assignedPct === 100 ? "success" : "brand", featured: true },
  ];
  return <StatsRow cards={cards} />;
}

// ===== صفحة الطيران =====
function FlightsPage({ passengers, setPassengers }: { passengers: Passenger[]; setPassengers: (p: Passenger[]) => void }) {
  const config = useConfig();
  const { alert: alertState, showAlert } = useAlert();
  const [flights, setFlights] = useState<Flight[]>([]);
  const [editingFlightId, setEditingFlightId] = useState<number | null>(null);
  const [editFlightModal, setEditFlightModal] = useState<Flight | null>(null);
  const [editForm, setEditForm] = useState({ name: "", type: "ذهاب" as "ذهاب" | "إياب", airline: "", date: "", time: "", arrival_time: "", arrival_date: "", from_airport: "", to_airport: "" });
  const [activeTab, setActiveTab] = useState<"ذهاب" | "إياب" | "الكل">("ذهاب");

  // ترتيب الحجاج بالسحب

  const [showAdd, setShowAdd] = useState(false);
  const [flightName, setFlightName] = useState("");
  const [flightType, setFlightType] = useState<"ذهاب" | "إياب">("ذهاب");
  const [airline, setAirline] = useState("");
  const [flightDate, setFlightDate] = useState("");
  const [flightTime, setFlightTime] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");
  const [arrivalDate, setArrivalDate] = useState("");
  const [fromAirport, setFromAirport] = useState("");
  const [toAirport, setToAirport] = useState("");
  const [nameError, setNameError] = useState("");
  const [showAddP, setShowAddP] = useState(false);
  const [currentFlightId, setCurrentFlightId] = useState<number | null>(null);
  const [pSearch, setPSearch] = useState("");

  useEffect(() => {
    supabase.from("flights").select("*").order("created_at").then(({ data }: any) => {
      if (data) setFlights(data as Flight[]);
    });
  }, []);

  const getFlightPassengers = (flight: Flight) => {
    const field = flightField(flight.type);
    return passengers
      .filter(p => (p as any)[field] === flight.id)
      .sort((a, b) => ((a as any).sort_order ?? 0) - ((b as any).sort_order ?? 0));
  };

  // ===== Drag & Drop =====

  // ===== تعديل الرحلة =====
  const openEditFlight = (flight: Flight) => {
    setEditFlightModal(flight);
    setEditForm({ name: flight.name, type: flight.type, airline: flight.airline || "", date: flight.date || "", time: flight.time || "", arrival_time: (flight as any).arrival_time || "", arrival_date: (flight as any).arrival_date || "", from_airport: flight.from_airport || "", to_airport: flight.to_airport || "" });
  };
  const saveEditFlight = async () => {
    if (!editFlightModal) return;
    const upd = { name: editForm.name.trim(), type: editForm.type, airline: editForm.airline.trim(), date: editForm.date, time: editForm.time, arrival_time: editForm.arrival_time, arrival_date: editForm.arrival_date, from_airport: editForm.from_airport.trim(), to_airport: editForm.to_airport.trim() };
    await supabase.from("flights").update(upd).eq("id", editFlightModal.id);
    setFlights(flights.map(f => f.id === editFlightModal.id ? { ...f, ...upd } : f));
    setEditFlightModal(null);
  };

  const addFlight = async () => {
    if (!flightName.trim()) { setNameError("يرجى إدخال رقم الرحلة أو اسمها"); return; }
    if (flights.some(f => f.name.trim() === flightName.trim() && f.type === flightType)) { setNameError(`رحلة ${flightType} بالاسم "${flightName}" موجودة بالفعل`); return; }
    setNameError("");
    const { data, error } = await supabase.from("flights").insert([{ name: flightName.trim(), type: flightType, airline: airline.trim(), date: flightDate, time: flightTime, arrival_time: arrivalTime, arrival_date: arrivalDate, from_airport: fromAirport.trim(), to_airport: toAirport.trim() }]).select();
    if (error) { showAlert("error", `فشل إضافة الرحلة: ${error.message || "يرجى المحاولة مرة أخرى"}`); return; }
    if (!error && data?.[0]) {
      const newFlight = data[0] as Flight;
      setFlights(prev => [...prev, newFlight]);
      setFlightName(""); setFlightType("ذهاب"); setAirline(""); setFlightDate(""); setFlightTime(""); setArrivalTime(""); setArrivalDate(""); setFromAirport(""); setToAirport(""); setShowAdd(false);
    }
  };

  const deleteFlight = async (flight: Flight) => {
    if (getFlightPassengers(flight).length > 0) { showAlert("warning", "لا يمكن حذف رحلة تحتوي على مسافرين"); return; }
    await supabase.from("flights").delete().eq("id", flight.id);
    setFlights(prev => prev.filter(f => f.id !== flight.id));
  };

  const openAddP = (flightId: number) => { setCurrentFlightId(flightId); setPSearch(""); setShowAddP(true); };
  // الدرجة بتتحدد من services.flight بتاع الحاج نفسه تلقائياً

  const removeP = async (pId: number, field: "flight_id" | "return_flight_id") => {
    await supabase.from("passengers").update({ [field]: null } as TablesUpdate<"passengers">).eq("id", pId);
    setPassengers(passengers.map(p => p.id === pId ? { ...p, [field]: null } : p));
  };

  const branding = {
    logoUrl: config.logo_url || "",
    companyName: config.name_ar || "حملة الأقصى",
    tagline: config.tagline || "",
    primaryColor: config.color_primary || "#6B1F3A",
    accentColor: config.color_accent || "#0C447C",
  };
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
    if (val === currentFlightId) return false;
    return val == null;
  });
  const filteredP = availableP.filter(p => !pSearch || p.name_ar.includes(pSearch) || p.passport.includes(pSearch));
  // الدرجة بتتحدد أوتوماتيك من services.flight بتاع الحاج نفسه

  const goFlights = flights.filter(f => f.type === "ذهاب");
  const retFlights = flights.filter(f => f.type === "إياب");
  const visibleFlights = activeTab === "ذهاب" ? goFlights : activeTab === "إياب" ? retFlights : flights;

  // ===== Boarding Pass Card =====
  const renderBoardingPass = (flight: Flight) => {
    const fp = getFlightPassengers(flight);
    const isReturn = flight.type === "إياب";
    const fromIATA = extractIATA(flight.from_airport || "");
    const toIATA = extractIATA(flight.to_airport || "");
    const fromCity = extractCity(flight.from_airport || "");
    const toCity = extractCity(flight.to_airport || "");
    const firstClassCount = fp.filter(p => (p as any).flight_class === "درجة أولى" || p.services?.flight === "درجة أولى").length;
    const economyCount = fp.length - firstClassCount;
    const arrivalTime = (flight as any).arrival_time || "";

    // تنسيق التاريخ بالإنجليزي — زي تذكرة الطيران
    let dateDisplay = flight.date || "";
    if (flight.date) {
      try {
        const d = new Date(flight.date);
        const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
        dateDisplay = `${String(d.getDate()).padStart(2,"0")} ${months[d.getMonth()]} ${d.getFullYear()}`;
      } catch { /* keep raw */ }
    }

    // هل الرحلة بكرة؟
    const isTomorrow = (() => {
      if (!flight.date) return false;
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const fd = new Date(flight.date);
      return fd.getFullYear() === tomorrow.getFullYear() && fd.getMonth() === tomorrow.getMonth() && fd.getDate() === tomorrow.getDate();
    })();

    return (
      <div key={flight.id} style={{ marginBottom: 12 }}>
        {/* ===== البطاقة الرئيسية ===== */}
        <div
          onClick={() => openAddP(flight.id)}
          style={{
            background: "var(--paper)",
            border: "1.5px solid var(--line)",
            borderRadius: 18,
            display: "flex",
            overflow: "hidden",
            boxShadow: "0 2px 8px rgba(0,0,0,.06)",
            transition: "all .2s",
            cursor: "pointer",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 20px rgba(125,31,60,.12)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(0,0,0,.06)"; (e.currentTarget as HTMLDivElement).style.transform = "none"; }}
        >
          {/* ══ يمين — Timeline ══ */}
          <div style={{ width: 300, flexShrink: 0, padding: "16px 20px", background: "var(--paper)", display: "flex", flexDirection: "column", gap: 10 }}>
            {/* شعار + اسم الشركة */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 70, height: 70, borderRadius: 14, background: "white", border: "2.5px solid #D4A017", boxShadow: "0 2px 12px rgba(212,160,23,.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden", padding: 6 }}>
                {flight.airline && getAirlineLogoUrl(flight.airline) ? (
                  <img src={getAirlineLogoUrl(flight.airline)!} alt={flight.airline} style={{ width: "100%", height: "100%", objectFit: "contain" }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                ) : (
                  <PlaneIcon size={28} color="#D4A017" />
                )}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>{flight.airline || "شركة الطيران"}</div>
                <div style={{ fontFamily: "monospace", fontSize: 10, color: "var(--muted)", marginTop: 1 }}>{flight.name}</div>
              </div>
              {isTomorrow && (
                <span style={{ marginRight: "auto", fontSize: 9, fontWeight: 800, padding: "2px 8px", borderRadius: 99, background: "rgba(125,31,60,.1)", color: "#7D1F3C", border: "1px solid rgba(125,31,60,.2)" }}>
                  غداً
                </span>
              )}
            </div>
            {/* Timeline المطارات */}
            <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
              <div style={{ flexShrink: 0, textAlign: "center", minWidth: 60 }}>
                <div style={{ fontFamily: "monospace", fontSize: 24, fontWeight: 700, color: "#7D1F3C", lineHeight: 1 }}>{fromIATA || "—"}</div>
                <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>{fromCity}</div>
                {flight.time && <div style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 800, color: "#7D1F3C", marginTop: 3 }}>{flight.time}</div>}
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "0 8px", position: "relative" }}>
                <div style={{ width: "100%", height: 2, background: "linear-gradient(90deg, var(--line), #c8b8a0, var(--line))", borderRadius: 99, position: "relative" }}>
                  <div className={isTomorrow ? "plane-pulse" : "plane-float"}>
                    <PlaneIcon size={16} color="#7D1F3C" flip={isReturn} />
                  </div>
                </div>
                {dateDisplay && <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 5, textAlign: "center", whiteSpace: "nowrap" }}>{dateDisplay}</div>}
              </div>
              <div style={{ flexShrink: 0, textAlign: "center", minWidth: 60 }}>
                <div style={{ fontFamily: "monospace", fontSize: 24, fontWeight: 700, color: "#059669", lineHeight: 1 }}>{toIATA || "—"}</div>
                <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>{toCity}</div>
                {arrivalTime && <div style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 800, color: "#059669", marginTop: 3 }}>{arrivalTime}</div>}
              </div>
            </div>
          </div>

          {/* ══ الفاصل المنقط ══ */}
          <div style={{ width: 0, borderRight: "2px dashed var(--line)", flexShrink: 0, position: "relative", margin: "14px 0" }}>
            <div style={{ position: "absolute", width: 20, height: 20, borderRadius: "50%", background: "var(--bg-2)", border: "1px solid var(--line)", right: -11, top: -24 }} />
            <div style={{ position: "absolute", width: 20, height: 20, borderRadius: "50%", background: "var(--bg-2)", border: "1px solid var(--line)", right: -11, bottom: -24 }} />
          </div>

          {/* ══ يسار — البيانات والأزرار ══ */}
          <div style={{ flex: 1, padding: "11px 14px", display: "flex", flexDirection: "column", gap: 7 }}>
            {/* الاسم والتاريخ */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div>
                <div
                  style={{ fontSize: 15, fontWeight: 800, color: "var(--ink)", cursor: "pointer" }}
                  onDoubleClick={e => { e.stopPropagation(); setEditingFlightId(flight.id); }}
                >
                  {editingFlightId === flight.id ? (
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input defaultValue={flight.name} id={`fn-${flight.id}`} style={{ ...inp, fontSize: 12, padding: "3px 8px", width: 130 }} autoFocus
                        onKeyDown={e => {
                          if (e.key === "Enter") { const v = (document.getElementById(`fn-${flight.id}`) as HTMLInputElement)?.value?.trim(); if (v) { supabase.from("flights").update({ name: v }).eq("id", flight.id); setFlights(flights.map(f => f.id === flight.id ? { ...f, name: v } : f)); } setEditingFlightId(null); }
                          if (e.key === "Escape") setEditingFlightId(null);
                        }}
                      />
                      <button onClick={() => { const v = (document.getElementById(`fn-${flight.id}`) as HTMLInputElement)?.value?.trim(); if (v) { supabase.from("flights").update({ name: v }).eq("id", flight.id); setFlights(flights.map(f => f.id === flight.id ? { ...f, name: v } : f)); } setEditingFlightId(null); }} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "var(--em7)", color: "#fff", border: "none", cursor: "pointer" }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                      </button>
                    </div>
                  ) : flight.name}
                </div>
                {dateDisplay && <div style={{ fontSize: 13, fontWeight: 700, color: "var(--em7)", marginTop: 2 }}>{dateDisplay}</div>}
              </div>
              {/* أزرار التحكم */}
              <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                <button onClick={e => { e.stopPropagation(); openEditFlight(flight); }} title="تعديل" style={{ width: 28, height: 28, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--paper)", border: "1px solid var(--line)", cursor: "pointer", color: "var(--muted)" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                </button>
                <button onClick={e => { e.stopPropagation(); printFlight(flight); }} title="طباعة" style={{ width: 28, height: 28, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--paper)", border: "1px solid var(--line)", cursor: "pointer", color: "var(--muted)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                </button>
                <button onClick={e => { e.stopPropagation(); deleteFlight(flight); }} title="حذف" style={{ width: 28, height: 28, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", background: fp.length === 0 ? "var(--fb)" : "var(--paper)", border: `1px solid ${fp.length === 0 ? "rgba(122,46,69,.2)" : "var(--line)"}`, cursor: fp.length === 0 ? "pointer" : "not-allowed", color: fp.length === 0 ? "var(--ff)" : "var(--muted)" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
                </button>
              </div>
            </div>

            {/* صف الإحصائيات المصغر */}
            {fp.length > 0 ? (
              <>
                <div style={{ display: "flex", gap: 6 }}>
                  {([
                    [fp.filter(p => p.gender === "ذكر").length, "رجال", "var(--male-bg)", "var(--male-fg)"],
                    [fp.filter(p => p.gender === "أنثى").length, "نساء", "var(--female-bg)", "var(--female-fg)"],
                    [firstClassCount, "درجة أولى", "#FFF8E1", "#B8880F"],
                    [economyCount, "سياحية", "var(--ivory)", "var(--ink)"],
                  ] as [number, string, string, string][]).map(([n, l, bg, fg]) => (
                    <div key={l} style={{ flex: 1, borderRadius: 9, padding: "5px 9px", display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--line)", background: bg }}>
                      <span style={{ fontSize: 15, fontWeight: 900, lineHeight: 1, color: fg }}>{n}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: "var(--muted)" }}>{l}</span>
                    </div>
                  ))}
                </div>
                {/* مؤشر جاهزية التذاكر */}
                {(() => {
                  const withTicket = fp.filter(p => (p as any).flight_ticket_url).length;
                  const pct = fp.length ? Math.round(withTicket / fp.length * 100) : 0;
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: 9, background: "var(--ivory)", borderRadius: 9, padding: "6px 11px", border: "1px solid var(--line)" }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: "var(--ink)", flexShrink: 0 }}>جاهزية التذاكر</span>
                      <div style={{ flex: 1, height: 6, background: "var(--line)", borderRadius: 99, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, background: "linear-gradient(90deg,#2E7D32,#66BB6A)" }} />
                      </div>
                      <span style={{ fontSize: 10.5, fontWeight: 900, color: "var(--success)", flexShrink: 0 }}>{pct}٪</span>
                      <span style={{ fontSize: 8.5, color: "var(--muted)", flexShrink: 0 }}>{withTicket} من {fp.length} مرفوعة</span>
                    </div>
                  );
                })()}
              </>
            ) : (
              <div style={{ display: "flex" }}>
                <span style={{ padding: "3px 10px", borderRadius: 99, fontSize: 10, fontWeight: 700, background: "var(--danger-bg)", color: "var(--danger)" }}>
                  لم يبدأ التوزيع
                </span>
              </div>
            )}

            {/* أسفل: عدد الحجاج + بار + إضافة */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: "auto" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 3, flexShrink: 0 }}>
                <div style={{ fontSize: 26, fontWeight: 900, color: "#7D1F3C", lineHeight: 1 }}>{fp.length}</div>
                <div style={{ fontSize: 10, color: "var(--muted)" }}>مسافر</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ height: 5, borderRadius: 99, background: "var(--line)", overflow: "hidden", marginBottom: 3 }}>
                  <div style={{ height: "100%", borderRadius: 99, background: "linear-gradient(90deg,#7D1F3C,#A32D52)", width: `${Math.min(fp.length / Math.max(passengers.length, 1) * 100, 100)}%` }} />
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 9, color: "var(--muted)" }}>{fp.length} حاج</div>
              </div>
              <button onClick={e => { e.stopPropagation(); openAddP(flight.id); }} style={{ height: 32, padding: "0 14px", borderRadius: 9, display: "inline-flex", alignItems: "center", gap: 5, background: "#7D1F3C", color: "white", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "var(--font-body)", flexShrink: 0 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                إضافة
              </button>
              {/* زر توسيع قائمة الحجاج */}
              
            </div>
          </div>
        </div>


      </div>
    );
  };

  return (
    <div style={{ overflowY: "auto", height: "100%", display: "flex", flexDirection: "column" }}>
      {/* أنيميشن الطائرة */}
      <style>{`
        @keyframes bpPlaneFloat {
          0%,100% { transform: translate(-50%,-55%) translateX(0); }
          50%      { transform: translate(-50%,-55%) translateX(-5px); }
        }
        @keyframes bpPlanePulse {
          0%,100% { transform: translate(-50%,-55%) translateX(0) scale(1); opacity:1; }
          40%,60% { transform: translate(-50%,-55%) translateX(-7px) scale(1.15); opacity:.8; }
        }
        .plane-float {
          position: absolute;
          top: 50%;
          left: 50%;
          animation: bpPlaneFloat 4s ease-in-out infinite;
        }
        .plane-pulse {
          position: absolute;
          top: 50%;
          left: 50%;
          animation: bpPlanePulse 2.5s ease-in-out infinite;
        }
      `}</style>

      <AlertModal alert={alertState} onClose={() => showAlert(null)} />

      {/* KPI Cards */}
      <FlightsStats passengers={passengers} />

      {/* شريط التحكم */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", flexShrink: 0 }}>
        {/* تابز */}
        <div style={{ display: "flex", background: "var(--ivory)", borderRadius: 10, padding: 3, gap: 2, border: "1px solid var(--line)" }}>
          {(["ذهاب", "إياب", "الكل"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              padding: "6px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, border: "none", cursor: "pointer",
              background: activeTab === tab ? "var(--paper)" : "transparent",
              color: activeTab === tab ? "#7D1F3C" : "var(--muted)",
              boxShadow: activeTab === tab ? "0 1px 4px rgba(0,0,0,.08)" : "none",
              fontFamily: "var(--font-body)",
              transition: "all .2s",
            }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <PlaneIcon size={11} color={activeTab === tab ? "#7D1F3C" : "var(--muted)"} flip={tab === "إياب"} />
                {tab}
                <span style={{ fontSize: 10, opacity: 0.7 }}>
                  ({tab === "ذهاب" ? goFlights.length : tab === "إياب" ? retFlights.length : flights.length})
                </span>
              </span>
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowAdd(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 99, background: "var(--paper)", border: "1px solid var(--line)", color: "var(--em7)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)", boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          رحلة جديدة
        </button>
        {flights.length > 0 && (
          <button onClick={printAll} style={btnS()}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            طباعة الكل
          </button>
        )}
      </div>

      {/* قائمة الرحلات */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 14px" }}>
        {visibleFlights.length === 0 ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--muted)", fontSize: 12 }}>
            <PlaneIcon size={36} color="var(--muted)" />
            <div style={{ marginTop: 10 }}>لا يوجد رحلات بعد</div>
          </div>
        ) : (
          visibleFlights.map(flight => renderBoardingPass(flight))
        )}
      </div>

      {/* ===== مودال رحلة جديدة ===== */}
      <Modal show={showAdd} onClose={() => { setShowAdd(false); setNameError(""); }} title="رحلة جديدة" maxWidth={420}>
        {/* نوع الرحلة */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>نوع الرحلة</div>
          <div style={{ display: "flex", gap: 8 }}>
            {(["ذهاب", "إياب"] as const).map(t => (
              <div key={t} onClick={() => setFlightType(t)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `1.5px solid ${flightType === t ? (t === "ذهاب" ? "var(--info)" : "var(--female-fg)") : "var(--border)"}`, background: flightType === t ? (t === "ذهاب" ? "var(--male-bg)" : "var(--female-bg)") : "transparent", cursor: "pointer", textAlign: "center", fontSize: 13, fontWeight: 700, color: flightType === t ? (t === "ذهاب" ? "var(--info)" : "var(--female-fg)") : "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <PlaneIcon size={13} color={flightType === t ? (t === "ذهاب" ? "var(--info)" : "var(--female-fg)") : "var(--muted)"} flip={t === "إياب"} />
                {t}
              </div>
            ))}
          </div>
        </div>

        {/* رقم الرحلة + شركة الطيران في سطر واحد */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>رقم الرحلة</div>
            <input style={{ ...inp, borderColor: nameError ? "var(--danger)" : "var(--border)" }} value={flightName} onChange={e => { setFlightName(e.target.value); setNameError(""); }} placeholder="مثال: QR501" autoFocus onKeyDown={e => e.key === "Enter" && addFlight()} />
            {nameError && <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 4 }}>{nameError}</div>}
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>شركة الطيران</div>
            <select value={["Qatar Airways", "Saudia"].includes(airline) ? airline : (airline ? "أخرى" : "")} onChange={e => { if (e.target.value === "أخرى") setAirline("__other__"); else setAirline(e.target.value); }} style={{ ...inp, cursor: "pointer" }}>
              <option value="">— اختر —</option>
              <option value="Qatar Airways">Qatar Airways</option>
              <option value="Saudia">Saudia</option>
              <option value="أخرى">أخرى</option>
            </select>
            {(airline === "__other__" || (!["Qatar Airways", "Saudia", "", "__other__"].includes(airline))) && (
              <input style={{ ...inp, marginTop: 6 }} value={airline === "__other__" ? "" : airline} onChange={e => setAirline(e.target.value)} placeholder="اسم الشركة" />
            )}
          </div>
        </div>

        {/* المطارات */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>المطارات</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>مطار المغادرة</div>
              <input style={inp} value={fromAirport} onChange={e => setFromAirport(e.target.value)} placeholder="مثال: DOH" />
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>مطار الوصول</div>
              <input style={inp} value={toAirport} onChange={e => setToAirport(e.target.value)} placeholder="مثال: JED" />
            </div>
          </div>
        </div>

        {/* موعد الإقلاع */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>موعد الإقلاع</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>التاريخ</div>
              <input style={{ ...inp, direction: "ltr" }} type="date" value={flightDate} onChange={e => setFlightDate(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>الوقت</div>
              <input style={{ ...inp, direction: "ltr" }} type="time" value={flightTime} onChange={e => setFlightTime(e.target.value)} />
            </div>
          </div>
        </div>

        {/* موعد الوصول */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>موعد الوصول</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>التاريخ</div>
              <input style={{ ...inp, direction: "ltr" }} type="date" value={arrivalDate} onChange={e => setArrivalDate(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>الوقت</div>
              <input style={{ ...inp, direction: "ltr" }} type="time" value={arrivalTime} onChange={e => setArrivalTime(e.target.value)} />
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={addFlight} style={{ ...btnP(), flex: 1 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            إضافة الرحلة
          </button>
          <button onClick={() => { setShowAdd(false); setNameError(""); }} style={btnS()}>إلغاء</button>
        </div>
      </Modal>

      {/* ===== مودال إضافة مسافرين ===== */}
      {showAddP && (
        <div onClick={() => setShowAddP(false)} onKeyDown={e => { if (e.key === "Escape") setShowAddP(false); }} tabIndex={-1} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "var(--paper)", borderRadius: 20, width: "94%", maxWidth: 720, maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,.35)", overflow: "hidden" }}>

            {/* ══ هيدر ملون بشكل تذكرة الطيران ══ */}
            <div style={{ background: "linear-gradient(135deg,#7D1F3C,#A32D52)", padding: "16px 20px", flexShrink: 0, position: "relative", overflow: "hidden" }}>
              {/* أيقونة خلفية */}
              <div style={{ position: "absolute", left: -10, bottom: -14, opacity: .06, pointerEvents: "none" }}>
                <svg width="100" height="100" viewBox="0 0 24 24" fill="white"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>
              </div>
              <div style={{ position: "relative", zIndex: 1 }}>
                {/* سطر علوي: رقم الرحلة + اختيار الدرجة + زر الإغلاق */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  {/* شعار الشركة */}
                  {currentFlight?.airline && getAirlineLogoUrl(currentFlight.airline) && (
                    <div style={{ width: 60, height: 60, borderRadius: 12, background: "rgba(255,255,255,.95)", border: "1px solid rgba(255,255,255,.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden", padding: 6 }}>
                      <img src={getAirlineLogoUrl(currentFlight.airline)!} alt={currentFlight.airline} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,.6)", fontWeight: 600, marginBottom: 2 }}>رقم الرحلة</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: "white", fontFamily: "monospace", lineHeight: 1 }}>{currentFlight?.name || "—"}</div>
                  </div>
                  <button onClick={() => setShowAddP(false)} style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(0,0,0,.25)", border: "1px solid rgba(255,255,255,.15)", cursor: "pointer", color: "rgba(255,255,255,.9)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
                {/* Timeline — بشكل تذكرة الطيران */}
                <div style={{ display: "flex", alignItems: "center", gap: 0, background: "rgba(0,0,0,.15)", borderRadius: 12, padding: "12px 16px" }}>
                  {/* المغادرة */}
                  <div style={{ textAlign: "center", minWidth: 70 }}>
                    <div style={{ fontFamily: "monospace", fontSize: 28, fontWeight: 700, color: "white", lineHeight: 1 }}>{extractIATA(currentFlight?.from_airport || "")}</div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,.6)", marginTop: 2 }}>{extractCity(currentFlight?.from_airport || "")}</div>
                    {currentFlight?.time && <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,.9)", marginTop: 3 }}>{currentFlight.time}</div>}
                  </div>
                  {/* الخط */}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "0 12px" }}>
                    <div style={{ width: "100%", height: 1, background: "rgba(255,255,255,.3)", position: "relative", marginBottom: 4 }}>
                      <div style={{ position: "absolute", top: "50%", left: "50%", transform: `translate(-50%,-55%)${currentFlight?.type === "إياب" ? " scaleX(-1)" : ""}` }}>
                        <PlaneIcon size={16} color="white" />
                      </div>
                    </div>
                    {currentFlight?.date && (
                      <div style={{ fontFamily: "monospace", fontSize: 9, color: "rgba(255,255,255,.55)", textAlign: "center" }}>
                        {(() => { const d = new Date(currentFlight.date); const m = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"]; return `${String(d.getDate()).padStart(2,"0")} ${m[d.getMonth()]} ${d.getFullYear()}`; })()}
                      </div>
                    )}
                  </div>
                  {/* الوصول */}
                  <div style={{ textAlign: "center", minWidth: 70 }}>
                    <div style={{ fontFamily: "monospace", fontSize: 28, fontWeight: 700, color: "rgba(255,255,255,.9)", lineHeight: 1 }}>{extractIATA(currentFlight?.to_airport || "")}</div>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,.6)", marginTop: 2 }}>{extractCity(currentFlight?.to_airport || "")}</div>
                    {(currentFlight as any)?.arrival_time && <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,.9)", marginTop: 3 }}>{(currentFlight as any).arrival_time}</div>}
                  </div>
                </div>
              </div>
            </div>

            {/* ══ الجسم — عمودين ══ */}
            <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

              {/* يمين: المسافرون المضافون */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, borderLeft: "1px solid var(--line)" }}>
                <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>المسافرون المضافون</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#7D1F3C", background: "rgba(125,31,60,.08)", padding: "2px 8px", borderRadius: 99 }}>{currentFlight ? getFlightPassengers(currentFlight).length : 0} مسافر</span>
                </div>
                <div style={{ flex: 1, overflowY: "auto" }}>
                  {currentFlight && getFlightPassengers(currentFlight).length === 0 ? (
                    <div style={{ textAlign: "center", padding: "2rem", color: "var(--muted)", fontSize: 12 }}>لا يوجد مسافرون بعد</div>
                  ) : currentFlight && getFlightPassengers(currentFlight).map((p, i) => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: "1px solid var(--line)" }}>
                      <span style={{ fontSize: 10, color: "var(--muted)", width: 18, textAlign: "center", flexShrink: 0 }}>{i + 1}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", flex: 1 }}>{p.short_ar || p.name_ar}</span>
                      {((p as any).flight_class === "درجة أولى" || p.services?.flight === "درجة أولى") && <span style={{ fontSize: 9, fontWeight: 800, background: "linear-gradient(135deg,#D4A017,#b8860b)", color: "#fff", padding: "1px 7px", borderRadius: 99, flexShrink: 0 }}>أولى</span>}
                      <button onClick={() => removeP(p.id, flightField(currentFlight.type))} title="إزالة من الرحلة" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", lineHeight: 1, padding: "0 2px", flexShrink: 0 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* شمال: إضافة مسافرين */}
              <div style={{ width: 260, flexShrink: 0, display: "flex", flexDirection: "column", minHeight: 0, background: "var(--ivory)" }}>
                <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>إضافة مسافرين</span>
                  {filteredP.length > 0 && (
                    <button
                      onClick={async () => {
                        const field = flightField(currentFlight?.type);
                        await Promise.all(filteredP.map(p =>
                          supabase.from("passengers").update({ [field]: currentFlightId, flight_class: p.services?.flight === "درجة أولى" ? "درجة أولى" : "عادي" } as TablesUpdate<"passengers">).eq("id", p.id)
                        ));
                        setPassengers(passengers.map(x => {
                          const found = filteredP.find(p => p.id === x.id);
                          return found ? { ...x, [field]: currentFlightId, flight_class: found.services?.flight === "درجة أولى" ? "درجة أولى" : "عادي" } : x;
                        }));
                      }}
                      style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: "rgba(125,31,60,.08)", border: "1px solid rgba(125,31,60,.2)", color: "#7D1F3C", cursor: "pointer", fontFamily: "var(--font-body)" }}
                    >
                      تحديد الكل ({filteredP.length})
                    </button>
                  )}
                </div>
                <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 9, padding: "6px 10px" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                    <input style={{ border: "none", background: "transparent", fontSize: 12, flex: 1, outline: "none", fontFamily: "var(--font-body)" }} placeholder="ابحث عن مسافر..." value={pSearch} onChange={e => setPSearch(e.target.value)} autoFocus />
                    {pSearch && <button onClick={() => setPSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 13, lineHeight: 1 }}>✕</button>}
                  </div>
                </div>
                <div style={{ flex: 1, overflowY: "auto" }}>
                  {filteredP.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "1.5rem", color: "var(--muted)", fontSize: 11 }}>{pSearch ? "لا توجد نتائج" : "جميع الحجاج موزعون"}</div>
                  ) : filteredP.map(p => {
                    const wantsFirst = p.services?.flight === "درجة أولى";
                    return (
                      <div key={p.id}
                        onClick={async () => {
                          const field = flightField(currentFlight?.type);
                          await supabase.from("passengers").update({ [field]: currentFlightId, flight_class: p.services?.flight === "درجة أولى" ? "درجة أولى" : "عادي" } as TablesUpdate<"passengers">).eq("id", p.id);
                          setPassengers(passengers.map(x => x.id === p.id ? { ...x, [field]: currentFlightId, flight_class: p.services?.flight === "درجة أولى" ? "درجة أولى" : "عادي" } : x));
                        }}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", cursor: "pointer", borderBottom: "1px solid var(--line)" }}
                        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "var(--paper)"}
                        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "transparent"}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.short_ar || p.name_ar}</div>
                        </div>
                        {wantsFirst && <span style={{ fontSize: 9, fontWeight: 800, background: "linear-gradient(135deg,#D4A017,#b8860b)", color: "#fff", padding: "1px 6px", borderRadius: 99, flexShrink: 0 }}>أولى</span>}
                        <span style={{ fontSize: 16, color: "#7D1F3C", fontWeight: 700, flexShrink: 0 }}>＋</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== مودال تعديل الرحلة ===== */}
      <Modal show={!!editFlightModal} onClose={() => setEditFlightModal(null)} title="تعديل بيانات الرحلة" maxWidth={420}>
        {/* نوع الرحلة */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>نوع الرحلة</div>
          <div style={{ display: "flex", gap: 8 }}>
            {(["ذهاب", "إياب"] as const).map(t => (
              <div key={t} onClick={() => setEditForm(p => ({ ...p, type: t }))} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `1.5px solid ${editForm.type === t ? (t === "ذهاب" ? "var(--info)" : "var(--female-fg)") : "var(--border)"}`, background: editForm.type === t ? (t === "ذهاب" ? "var(--male-bg)" : "var(--female-bg)") : "transparent", cursor: "pointer", textAlign: "center", fontSize: 13, fontWeight: 700, color: editForm.type === t ? (t === "ذهاب" ? "var(--info)" : "var(--female-fg)") : "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <PlaneIcon size={13} color={editForm.type === t ? (t === "ذهاب" ? "var(--info)" : "var(--female-fg)") : "var(--muted)"} flip={t === "إياب"} />
                {t}
              </div>
            ))}
          </div>
        </div>

        {/* رقم الرحلة */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>رقم الرحلة</div>
          <input style={inp} value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} placeholder="مثال: QR501" />
        </div>

        {/* شركة الطيران */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>شركة الطيران</div>
          <select
            value={["Qatar Airways", "Saudia"].includes(editForm.airline) ? editForm.airline : (editForm.airline ? "أخرى" : "")}
            onChange={e => { if (e.target.value === "أخرى") setEditForm(p => ({ ...p, airline: "__other__" })); else setEditForm(p => ({ ...p, airline: e.target.value })); }}
            style={{ ...inp, cursor: "pointer" }}
          >
            <option value="">— اختر شركة الطيران —</option>
            <option value="Qatar Airways">Qatar Airways — القطرية</option>
            <option value="Saudia">Saudia — السعودية</option>
            <option value="أخرى">أخرى</option>
          </select>
          {(editForm.airline === "__other__" || (!["Qatar Airways", "Saudia", "", "__other__"].includes(editForm.airline))) && (
            <input style={{ ...inp, marginTop: 8 }} value={editForm.airline === "__other__" ? "" : editForm.airline} onChange={e => setEditForm(p => ({ ...p, airline: e.target.value }))} placeholder="اكتب اسم شركة الطيران" />
          )}
        </div>

        {/* المطارات */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>المطارات</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>مطار المغادرة</div>
              <input style={inp} value={editForm.from_airport} onChange={e => setEditForm(p => ({ ...p, from_airport: e.target.value }))} placeholder="مثال: DOH" />
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>مطار الوصول</div>
              <input style={inp} value={editForm.to_airport} onChange={e => setEditForm(p => ({ ...p, to_airport: e.target.value }))} placeholder="مثال: JED" />
            </div>
          </div>
        </div>

        {/* موعد الإقلاع */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>موعد الإقلاع</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>التاريخ</div>
              <input style={inp} type="date" value={editForm.date} onChange={e => setEditForm(p => ({ ...p, date: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>الوقت</div>
              <input style={inp} type="time" value={editForm.time} onChange={e => setEditForm(p => ({ ...p, time: e.target.value }))} />
            </div>
          </div>
        </div>

        {/* موعد الوصول */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 6 }}>موعد الوصول</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>التاريخ</div>
              <input style={inp} type="date" value={editForm.arrival_date} onChange={e => setEditForm(p => ({ ...p, arrival_date: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>الوقت</div>
              <input style={inp} type="time" value={editForm.arrival_time} onChange={e => setEditForm(p => ({ ...p, arrival_time: e.target.value }))} />
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={saveEditFlight} style={{ ...btnP(), flex: 1 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            حفظ التعديلات
          </button>
          <button onClick={() => setEditFlightModal(null)} style={btnS()}>إلغاء</button>
        </div>
      </Modal>
    </div>
  );
}

export { FlightsStats, FlightsPage };
