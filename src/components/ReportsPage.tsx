import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../supabase";
import { useConfig } from "../config/ConfigContext";
import type { Passenger, Bus, Camp, Room, Flight } from "../types";
import { makeHTML, printInPage, downloadPDF, ROOM_COLORS, ROOM_TYPES, btnP, btnS } from "../utils";

function ReportsPage({ passengers: rawPassengers }: { passengers: Passenger[] }) {
  const passengers = [...rawPassengers].sort((a, b) => ((a as any).sort_order ?? 0) - ((b as any).sort_order ?? 0));
  const config = useConfig();
  const logoUrl = config.logo_url || "";

  const [activeReport, setActiveReport] = useState<string | null>(null);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [camps, setCamps] = useState<Camp[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(false);

  // تقرير الفندق — فلتر الطباعة
  const [hotelPrintFilter, setHotelPrintFilter] = useState<"all" | "floor" | "type">("all");
  const [hotelPrintFloor, setHotelPrintFloor] = useState("");
  const [hotelPrintType, setHotelPrintType] = useState<string>("");
  const floors = [...new Set(rooms.map(r => r.floor).filter(Boolean))].sort();

  // تقرير الطيران — نوع التقرير الفرعي
  const [flightSubReport, setFlightSubReport] = useState<"airline" | "per_flight" | null>(null);
  const [passportSelectedIds, setPassportSelectedIds] = useState<Set<number>>(new Set());

  // ===== WhatsApp State =====
  const [waToken, setWaToken] = useState(() => localStorage.getItem("wa_token") || "");
  const [waPhoneId, setWaPhoneId] = useState(() => localStorage.getItem("wa_phone_id") || "");
  const [waTemplate, setWaTemplate] = useState(() => localStorage.getItem("wa_template") ||
`السلام عليكم {الاسم}،
تفاصيل رحلتك:
🚌 الباص: {الباص}
✈️ الرحلة: {الرحلة}
🏨 الغرفة: {الغرفة}
⛺ مخيم منى: {منى}
⛺ مخيم عرفة: {عرفة}
بارك الله في حجكم`);
  const [waSendDocs, setWaSendDocs] = useState({ permit: true, ticket: true });
  const [waSending, setWaSending] = useState(false);
  const [waResults, setWaResults] = useState<{ name: string; phone: string; status: "success" | "error" | "pending" }[]>([]);
  const [waShowSettings, setWaShowSettings] = useState(false);
  const [waSelectedIds, setWaSelectedIds] = useState<Set<number>>(new Set());
  const [waSelectMode, setWaSelectMode] = useState<"all" | "select">("all");
  const [waTestPhone, setWaTestPhone] = useState("");

  // الأعمدة لتقرير الحجاج
  const ALL_COLS = [
    { key: "name_ar", label: "الاسم بالعربي", get: (p: Passenger) => p.name_ar },
    { key: "name_en", label: "الاسم بالإنجليزي", get: (p: Passenger) => p.name_en },
    { key: "passport", label: "رقم الجواز", get: (p: Passenger) => p.passport },
    { key: "national_id", label: "رقم البطاقة", get: (p: Passenger) => p.national_id },
    { key: "nat", label: "الجنسية", get: (p: Passenger) => p.nat },
    { key: "gender", label: "الجنس", get: (p: Passenger) => p.gender },
    { key: "dob", label: "تاريخ الميلاد", get: (p: Passenger) => p.dob },
    { key: "expiry", label: "انتهاء الجواز", get: (p: Passenger) => p.expiry },
    { key: "phone", label: "التليفون", get: (p: Passenger) => p.phone },
    { key: "bus", label: "نوع الباص", get: (p: Passenger) => p.services?.bus },
    { key: "bus_name", label: "رقم الباص", get: (p: Passenger) => buses.find(b => b.id === (p as any).bus_id)?.name || "" },
    { key: "flight", label: "الطيران", get: (p: Passenger) => p.services?.flight },
    { key: "hotel_type", label: "نوع الغرفة", get: (p: Passenger) => p.services?.hotel_type },
    { key: "hotel_view", label: "إطلالة الغرفة", get: (p: Passenger) => p.services?.hotel_view },
    { key: "room_number", label: "رقم الغرفة", get: (p: Passenger) => rooms.find(r => r.id === (p as any).room_id)?.number || "" },
    { key: "camp_mina", label: "منى (نوع)", get: (p: Passenger) => p.services?.camp_mina },
    { key: "camp_mina_name", label: "مخيم منى", get: (p: Passenger) => camps.find(c => c.id === (p as any).camp_mina_id)?.name || "" },
    { key: "camp_arafa", label: "عرفة (نوع)", get: (p: Passenger) => p.services?.camp_arafa },
    { key: "camp_arafa_name", label: "مخيم عرفة", get: (p: Passenger) => camps.find(c => c.id === (p as any).camp_arafa_id)?.name || "" },
  ];
  const [selectedCols, setSelectedCols] = useState<string[]>(ALL_COLS.map(c => c.key));
  const toggleCol = (key: string) => setSelectedCols(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  const toggleAll = () => setSelectedCols(prev => prev.length === ALL_COLS.length ? [] : ALL_COLS.map(c => c.key));
  const activeCols = ALL_COLS.filter(c => selectedCols.includes(c.key));

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [{ data: b }, { data: c }, { data: r }, { data: f }] = await Promise.all([
        supabase.from("buses").select("*").order("created_at"),
        supabase.from("camps").select("*").order("created_at"),
        supabase.from("rooms").select("*").order("number"),
        supabase.from("flights").select("*").order("date"),
      ]);
      if (b) setBuses(b as Bus[]);
      if (c) setCamps(c as Camp[]);
      if (r) setRooms(r as Room[]);
      if (f) setFlights(f as Flight[]);
      setLoading(false);
    };
    load();
  }, []);

  // ============================================================
  // تقرير الحجاج
  // ============================================================
  const getPassengersHTML = () => {
    const rows = passengers.map((p, i) =>
      `<tr><td style="text-align:center">${i + 1}</td>${activeCols.map(c => `<td>${c.get(p) || "—"}</td>`).join("")}</tr>`
    ).join("");
    const body = `<table><tr><th style="text-align:center;width:30px">م</th>${activeCols.map(c => `<th>${c.label}</th>`).join("")}</tr>${rows}</table>`;
    return makeHTML("كشف الحجاج", body, true, logoUrl);
  };

  const exportPassengersXLSX = () => {
    const headers = ["م", ...activeCols.map(c => c.label)];
    const rows = passengers.map((p, i) => [i + 1, ...activeCols.map(c => c.get(p) || "")]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = [{ wch: 4 }, ...activeCols.map(c => ({ wch: Math.max(c.label.length + 2, 15) }))];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الحجاج");
    XLSX.writeFile(wb, "تقرير_الحجاج.xlsx");
  };

  // ============================================================
  // تقرير الطيران — خطوط الطيران (airline list)
  // ============================================================
  const getAirlineHTML = () => {
    const list = passengers.filter(p => p.services?.flight !== "بدون");
    const rows = list.map((p, i) => {
      const nat = p.nat === "قطري" ? "QAT" : p.nat === "مصري" ? "EGY" : p.nat;
      const gender = p.gender === "ذكر" ? "MR." : "MRS.";
      const cls = p.flight_class === "درجة أولى" ? "FIRST CLASS" : "";
      return `<tr><td style="text-align:center">${i + 1}</td><td>${p.name_en}</td><td>${nat}</td><td>${p.passport}</td><td>${p.phone || "—"}</td><td>${gender}</td><td>${cls}</td></tr>`;
    }).join("");
    const body = `<table style="direction:ltr"><tr><th style="text-align:center;width:30px">S.N.</th><th>FULL NAME</th><th>NAT.</th><th>PASSPORT NO.</th><th>TEL. NO.</th><th>GENDER</th><th>CLASS</th></tr>${rows}</table>`;
    return makeHTML("Pilgrims Flight List", body, true, logoUrl);
  };

  const exportAirlineXLSX = () => {
    const list = passengers.filter(p => p.services?.flight !== "بدون");
    const headers = ["S.N.", "FULL NAME", "NAT.", "PASSPORT NO.", "TEL. NO.", "GENDER", "CLASS"];
    const rows = list.map((p, i) => [
      i + 1, p.name_en,
      p.nat === "قطري" ? "QAT" : p.nat === "مصري" ? "EGY" : p.nat,
      p.passport, p.phone || "—",
      p.gender === "ذكر" ? "MR." : "MRS.",
      p.flight_class === "درجة أولى" ? "FIRST CLASS" : ""
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = [{ wch: 5 }, { wch: 32 }, { wch: 6 }, { wch: 14 }, { wch: 14 }, { wch: 7 }, { wch: 13 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Flight List");
    XLSX.writeFile(wb, "flight_list.xlsx");
  };

  // ============================================================
  // تقرير الطيران — كل رحلة
  // ============================================================
  const getPerFlightHTML = () => {
    const sections = flights.map(flight => {
      const fp = passengers.filter(p => p.flight_id === flight.id);
      const rows = fp.map((p, i) => {
        const nat = p.nat === "قطري" ? "QAT" : p.nat === "مصري" ? "EGY" : p.nat;
        const gender = p.gender === "ذكر" ? "MR." : "MRS.";
        const cls = p.flight_class === "درجة أولى" ? "FIRST CLASS" : "";
        return `<tr><td style="text-align:center">${i + 1}</td><td>${p.name_en}</td><td>${nat}</td><td>${p.passport}</td><td>${p.phone || "—"}</td><td>${gender}</td><td>${cls}</td></tr>`;
      }).join("");
      return `
        <div class="page-break">
          <div style="background:#f0f4ff;border:1px solid #0C447C;border-radius:8px;padding:12px 16px;margin-bottom:14px;direction:rtl">
            <div style="font-size:16px;font-weight:700;color:#0C447C;margin-bottom:8px">${flight.name} — ${flight.type}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;font-size:10px">
              <div><span style="color:#888">الخط:</span> ${flight.airline}</div>
              <div><span style="color:#888">التاريخ:</span> ${flight.date}</div>
              <div><span style="color:#888">الوقت:</span> ${flight.time}</div>
              <div><span style="color:#888">من:</span> ${flight.from_airport}</div>
              <div><span style="color:#888">إلى:</span> ${flight.to_airport}</div>
              <div><span style="color:#888">عدد الحجاج:</span> ${fp.length}</div>
            </div>
          </div>
          <table style="direction:ltr"><tr><th style="text-align:center;width:30px">S.N.</th><th>FULL NAME</th><th>NAT.</th><th>PASSPORT NO.</th><th>TEL. NO.</th><th>GENDER</th><th>CLASS</th></tr>${rows}</table>
        </div>`;
    }).join("");
    return makeHTML("تقرير الرحلات", sections, true, logoUrl);
  };

  const exportPerFlightXLSX = () => {
    const wb = XLSX.utils.book_new();
    flights.forEach(flight => {
      const fp = passengers.filter(p => p.flight_id === flight.id);
      const headers = ["S.N.", "FULL NAME", "NAT.", "PASSPORT NO.", "TEL. NO.", "GENDER", "CLASS"];
      const info = [["الرحلة:", flight.name], ["الخط:", flight.airline], ["التاريخ:", flight.date], ["الوقت:", flight.time], ["من:", flight.from_airport], ["إلى:", flight.to_airport], []];
      const rows = fp.map((p, i) => [
        i + 1, p.name_en,
        p.nat === "قطري" ? "QAT" : p.nat === "مصري" ? "EGY" : p.nat,
        p.passport, p.phone || "—",
        p.gender === "ذكر" ? "MR." : "MRS.",
        p.flight_class === "درجة أولى" ? "FIRST CLASS" : ""
      ]);
      const ws = XLSX.utils.aoa_to_sheet([...info, headers, ...rows]);
      ws["!cols"] = [{ wch: 5 }, { wch: 32 }, { wch: 6 }, { wch: 14 }, { wch: 14 }, { wch: 7 }, { wch: 13 }];
      XLSX.utils.book_append_sheet(wb, ws, flight.name.slice(0, 31));
    });
    XLSX.writeFile(wb, "تقرير_الرحلات.xlsx");
  };

  // ============================================================
  // تقرير الباصات
  // ============================================================
  const getBusesHTML = () => {
    const sections = buses.map(bus => {
      const bp = passengers.filter(p => p.bus_id === bus.id);
      const rows = bp.map((p, i) =>
        `<tr><td style="text-align:center">${i + 1}</td><td>${p.short_ar || p.name_ar}</td></tr>`
      ).join("");
      return `<div class="page-break">
        <div class="section-title">${bus.name}${bus.type === "VIP" ? " ⭐ VIP" : ""}</div>
        <table><tr><th style="text-align:center;width:40px">م</th><th>اسم الحاج / الحاجة</th></tr>${rows}</table>
      </div>`;
    }).join("");
    return makeHTML("تقرير الباصات", sections, false, logoUrl);
  };

  const exportBusesXLSX = () => {
    const rows: any[][] = [["اسم الباص", "النوع", "م", "اسم الحاج", "الجنس", "الجنسية"]];
    buses.forEach(bus => {
      const bp = passengers.filter(p => p.bus_id === bus.id);
      bp.forEach((p, i) => rows.push([bus.name, bus.type, i + 1, p.short_ar || p.name_ar, p.gender, p.nat]));
      if (bp.length === 0) rows.push([bus.name, bus.type, "", "لا يوجد مسافرون", "", ""]);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 15 }, { wch: 8 }, { wch: 4 }, { wch: 25 }, { wch: 8 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الباصات");
    XLSX.writeFile(wb, "تقرير_الباصات.xlsx");
  };

  // ============================================================
  // تقرير المخيمات (منى / عرفة)
  // ============================================================
  const getCampsHTML = (pageType: "منى" | "عرفة") => {
    const campIdKey = pageType === "منى" ? "camp_mina_id" : "camp_arafa_id";
    const icon = pageType === "منى" ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/></svg>` : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>`;
    const pageCamps = camps.filter(c => c.page_type === pageType);
    const sections = pageCamps.map(camp => {
      const cp = passengers.filter(p => (p as any)[campIdKey] === camp.id);
      const isMale = camp.gender === "ذكر";
      const headerColor = isMale ? "var(--info)" : "var(--female-fg)";
      // عمودين جنب بعض
      const half = Math.ceil(cp.length / 2);
      const col1 = cp.slice(0, half);
      const col2 = cp.slice(half);
      const maxRows = Math.max(col1.length, col2.length);
      let tableRows = "";
      for (let i = 0; i < maxRows; i++) {
        const p1 = col1[i];
        const p2 = col2[i];
        tableRows += `<tr>
          <td style="text-align:center;width:30px">${p1 ? i + 1 : ""}</td>
          <td>${p1 ? (p1.short_ar || p1.name_ar) : ""}</td>
          <td style="text-align:center;width:30px;border-right:2px solid #0C447C">${p2 ? half + i + 1 : ""}</td>
          <td>${p2 ? (p2.short_ar || p2.name_ar) : ""}</td>
        </tr>`;
      }
      return `<div class="page-break">
        <div style="text-align:center;margin-bottom:12px">
          <div style="font-size:22px;font-weight:700;color:${headerColor}">${icon} مخيم ${isMale ? "رجال" : "نساء"} ${camp.name}</div>
          <div style="font-size:11px;color:#888;margin-top:2px">${camp.type} · ${cp.length} مسافر</div>
        </div>
        <table>
          <tr>
            <th style="text-align:center;width:30px;background:${headerColor}">م</th>
            <th style="background:${headerColor}">اسم الحاج</th>
            <th style="text-align:center;width:30px;background:${headerColor}">م</th>
            <th style="background:${headerColor}">اسم الحاج</th>
          </tr>
          ${tableRows}
        </table>
      </div>`;
    }).join("");
    return makeHTML(`مخيمات ${pageType}`, sections, false, logoUrl);
  };

  const exportCampsXLSX = (pageType: "منى" | "عرفة") => {
    const campIdKey = pageType === "منى" ? "camp_mina_id" : "camp_arafa_id";
    const pageCamps = camps.filter(c => c.page_type === pageType);
    const rows: any[][] = [["المخيم", "النوع", "الجنس", "م", "اسم الحاج", "الجنسية"]];
    pageCamps.forEach(camp => {
      const cp = passengers.filter(p => (p as any)[campIdKey] === camp.id);
      cp.forEach((p, i) => rows.push([camp.name, camp.type, camp.gender === "ذكر" ? "رجال" : "نساء", i + 1, p.short_ar || p.name_ar, p.nat]));
      if (cp.length === 0) rows.push([camp.name, camp.type, camp.gender === "ذكر" ? "رجال" : "نساء", "", "لا يوجد مسافرون", ""]);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `مخيمات ${pageType}`);
    XLSX.writeFile(wb, `تقرير_مخيمات_${pageType}.xlsx`);
  };

  // ============================================================
  // تقرير الفندق
  // ============================================================
  const getFilteredRooms = () => {
    if (hotelPrintFilter === "floor") return rooms.filter(r => r.floor === hotelPrintFloor);
    if (hotelPrintFilter === "type") return rooms.filter(r => r.type === hotelPrintType);
    return rooms;
  };

  const getHotelHTML = () => {
    const filtered = getFilteredRooms();
    // 3 أعمدة
    const col1 = filtered.filter((_, i) => i % 3 === 0);
    const col2 = filtered.filter((_, i) => i % 3 === 1);
    const col3 = filtered.filter((_, i) => i % 3 === 2);
    const renderRoomBlock = (room: Room) => {
      const rp = passengers.filter(p => p.room_id === room.id);
      const [bg, clr] = ROOM_COLORS[room.type] || ["var(--bg-2)", "var(--text)"];
      return `<div style="margin-bottom:10px;break-inside:avoid">
        <div style="background:${bg};color:${clr};padding:4px 8px;border:1px solid ${clr}33;border-bottom:none;font-size:10px;font-weight:700;display:flex;justify-content:space-between;border-radius:4px 4px 0 0">
          <span>${room.type}</span><span>غرفة ${room.number}${room.floor ? ` (ط${room.floor})` : ""}</span>
        </div>
        <table style="margin:0">
          <tr style="background:#f0f4ff"><th style="text-align:center;width:20px;background:#0C447C">م</th><th style="background:#0C447C">الاسم</th></tr>
          ${rp.map((p, i) => `<tr><td style="text-align:center">${i + 1}</td><td>${p.short_ar || p.name_ar}</td></tr>`).join("")}
        </table>
      </div>`;
    };
    const body = `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
      <div>${col1.map(renderRoomBlock).join("")}</div>
      <div>${col2.map(renderRoomBlock).join("")}</div>
      <div>${col3.map(renderRoomBlock).join("")}</div>
    </div>`;
    const subtitle = hotelPrintFilter === "floor" ? ` — الطابق ${hotelPrintFloor}` : hotelPrintFilter === "type" ? ` — ${hotelPrintType}` : "";
    return makeHTML(`تقرير الفندق${subtitle}`, body, true, logoUrl);
  };

  const exportHotelXLSX = () => {
    const filtered = getFilteredRooms();
    const rows: any[][] = [["رقم الغرفة", "الطابق", "النوع", "م", "اسم الحاج", "الجنس", "طلب الحاج"]];
    filtered.forEach(room => {
      const rp = passengers.filter(p => p.room_id === room.id);
      rp.forEach((p, i) => rows.push([room.number, room.floor || "—", room.type, i + 1, p.short_ar || p.name_ar, p.gender, `${p.services?.hotel_type} ${p.services?.hotel_view}`]));
      if (rp.length === 0) rows.push([room.number, room.floor || "—", room.type, "", "لا يوجد مسافرون", "", ""]);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الفندق");
    XLSX.writeFile(wb, "تقرير_الفندق.xlsx");
  };

  // ============================================================
  // أزرار التصدير الأربعة
  // ============================================================
  const ExportButtons = ({
    onView, onExcel, onPDF, onPrint
  }: { onView?: () => void; onExcel: () => void; onPDF: () => void; onPrint: () => void }) => (
    <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
      {onView && <button onClick={onView} style={{ ...btnS({ flex: 1, minWidth: 80 }) }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg> عرض</button>}
      <button onClick={onExcel} style={{ ...btnP({ flex: 1, minWidth: 80 }) }}>⬇️ Excel</button>
      <button onClick={onPDF} style={{ background: "var(--info)", color: "var(--bg-card)", border: "none", padding: "7px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontWeight: 500, flex: 1, minWidth: 80 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg> PDF</button>
      <button onClick={onPrint} style={{ ...btnS({ flex: 1, minWidth: 80 }) }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> طباعة</button>
    </div>
  );

  // ============================================================
  // قائمة التقارير
  // ============================================================
  const reports = [
    { id: "passengers_report", name: "تقرير الحجاج", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`, desc: "كشف بيانات الحجاج", color: "var(--success-bg)" },
    { id: "flight", name: "تقرير الطيران", icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>`, desc: "خطوط الطيران والرحلات", color: "var(--male-bg)" },
    { id: "buses", name: "تقرير الباصات", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="15" cy="18" r="2"/></svg>`, desc: "توزيع المسافرين على الباصات", color: "var(--info-bg)" },
    { id: "mina", name: "تقرير منى", icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/></svg>`, desc: "مخيمات منى", color: "var(--success-bg)" },
    { id: "arafa", name: "تقرير عرفة", icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/></svg>`, desc: "مخيمات عرفة", color: "var(--warning-bg)" },
    { id: "hotel", name: "تقرير الفندق", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M10 6h4"/></svg>`, desc: "توزيع الغرف", color: "var(--female-bg)" },
    { id: "passports", name: "طباعة الجوازات", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/><path d="M8 16s1-2 4-2 4 2 4 2"/></svg>`, desc: "طباعة صور جوازات الحجاج", color: "rgba(125,31,60,0.08)" },
    { id: "whatsapp", name: "رسائل WhatsApp", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`, desc: "إرسال رسائل مخصصة للحجاج", color: "rgba(37,211,102,0.1)" },
  ];

  // ============================================================
  // الـ UI
  // ============================================================
  return (
    <div style={{ padding: 14, overflowY: "auto", height: "100%" }}>
      {!activeReport ? (
        <>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>اختر التقرير</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {reports.map(r => (
              <div key={r.id} onClick={() => { setActiveReport(r.id); setFlightSubReport(null); }}
                style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, padding: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, background: "var(--bg-card)" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--bg-2)"}
                onMouseLeave={e => e.currentTarget.style.background = "white"}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: r.color, display: "flex", alignItems: "center", justifyContent: "center" }} dangerouslySetInnerHTML={{ __html: r.icon }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{r.desc}</div>
                  <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: "var(--success-bg)", color: "var(--primary-dark)" }}>Excel</span>
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: "var(--male-bg)", color: "var(--info)" }}>PDF</span>
                    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: "var(--bg-2)", color: "var(--text-muted)" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg></span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div>
          <button onClick={() => setActiveReport(null)} style={{ ...btnS(), marginBottom: 14 }}>رجوع</button>

          {/* ===== تقرير الحجاج ===== */}
          {activeReport === "passengers_report" && (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>تقرير الحجاج</div>
              <div style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 500 }}>اختر الأعمدة</div>
                  <div onClick={toggleAll} style={{ fontSize: 11, color: "var(--em7)", cursor: "pointer" }}>
                    {selectedCols.length === ALL_COLS.length ? "إلغاء الكل" : "تحديد الكل"}
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {ALL_COLS.map(col => (
                    <div key={col.key} onClick={() => toggleCol(col.key)}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, cursor: "pointer", background: selectedCols.includes(col.key) ? "var(--success-bg)" : "var(--bg-2)", border: `0.5px solid ${selectedCols.includes(col.key) ? "var(--em7)" : "var(--border)"}` }}>
                      <div style={{ width: 16, height: 16, borderRadius: 4, background: selectedCols.includes(col.key) ? "var(--em7)" : "var(--bg-card)", border: `1.5px solid ${selectedCols.includes(col.key) ? "var(--em7)" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {selectedCols.includes(col.key) && <span style={{ color: "var(--bg-card)", fontSize: 10 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg></span>}
                      </div>
                      <span style={{ fontSize: 11 }}>{col.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>{passengers.length} حاج · {activeCols.length} عمود</div>
              <ExportButtons
                onExcel={exportPassengersXLSX}
                onPDF={() => downloadPDF(getPassengersHTML(), "تقرير_الحجاج.html")}
                onPrint={() => printInPage(getPassengersHTML())}
              />
            </>
          )}

          {/* ===== تقرير الطيران ===== */}
          {activeReport === "flight" && (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>تقرير الطيران</div>
              {!flightSubReport ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { id: "airline", icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>`, name: "تقرير خطوط الطيران", desc: "كشف الحجاج لإرساله لشركة الطيران" },
                    { id: "per_flight", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--em7)" strokeWidth="1.7" strokeLinecap="round"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>`, name: "تقرير كل رحلة", desc: "قائمة الحجاج على كل رحلة مع تفاصيلها" },
                  ].map(sub => (
                    <div key={sub.id} onClick={() => setFlightSubReport(sub.id as any)}
                      style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, padding: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 12, background: "var(--bg-card)" }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--bg-2)"}
                      onMouseLeave={e => e.currentTarget.style.background = "white"}>
                      <div style={{ width: 44, height: 44, borderRadius: 10, background: "var(--male-bg)", display: "flex", alignItems: "center", justifyContent: "center" }} dangerouslySetInnerHTML={{ __html: sub.icon }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{sub.name}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{sub.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <button onClick={() => setFlightSubReport(null)} style={{ ...btnS(), marginBottom: 14, fontSize: 11 }}>رجوع للطيران</button>

                  {/* خطوط الطيران */}
                  {flightSubReport === "airline" && (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>تقرير خطوط الطيران</div>
                      <div style={{ overflowX: "auto", marginBottom: 12 }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, direction: "ltr" }}>
                          <thead>
                            <tr style={{ background: "var(--info)", color: "var(--bg-card)" }}>
                              {["S.N.", "FULL NAME", "NAT.", "PASSPORT NO.", "TEL. NO.", "GENDER", "CLASS"].map(h =>
                                <th key={h} style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {passengers.filter(p => p.services?.flight !== "بدون").map((p, i) => (
                              <tr key={p.id} style={{ background: i % 2 === 0 ? "white" : "var(--info-bg)" }}>
                                <td style={{ padding: "6px 10px", border: "0.5px solid #eee" }}>{i + 1}</td>
                                <td style={{ padding: "6px 10px", border: "0.5px solid #eee", fontWeight: 500 }}>{p.name_en}</td>
                                <td style={{ padding: "6px 10px", border: "0.5px solid #eee" }}>{p.nat === "قطري" ? "QAT" : p.nat === "مصري" ? "EGY" : p.nat}</td>
                                <td style={{ padding: "6px 10px", border: "0.5px solid #eee" }}>{p.passport}</td>
                                <td style={{ padding: "6px 10px", border: "0.5px solid #eee" }}>{p.phone || "—"}</td>
                                <td style={{ padding: "6px 10px", border: "0.5px solid #eee" }}>{p.gender === "ذكر" ? "MR." : "MRS."}</td>
                                <td style={{ padding: "6px 10px", border: "0.5px solid #eee" }}>{p.flight_class === "درجة أولى" ? "⭐ FIRST" : ""}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <ExportButtons
                        onExcel={exportAirlineXLSX}
                        onPDF={() => downloadPDF(getAirlineHTML(), "flight_list.html")}
                        onPrint={() => printInPage(getAirlineHTML())}
                      />
                    </>
                  )}

                  {/* كل رحلة */}
                  {flightSubReport === "per_flight" && (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg> تقرير كل رحلة</div>
                      {loading ? <div style={{ textAlign: "center", color: "var(--text-muted)" }}>جاري التحميل...</div> :
                        flights.length === 0 ? <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem" }}>لا يوجد رحلات</div> :
                        flights.map(flight => {
                          const fp = passengers.filter(p => p.flight_id === flight.id);
                          return (
                            <div key={flight.id} style={{ border: "0.5px solid #e5e5e5", borderRadius: 10, marginBottom: 12, overflow: "hidden" }}>
                              <div style={{ background: "var(--male-bg)", padding: "10px 14px", borderBottom: "0.5px solid #dce8f8" }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--info)" }}>{flight.name} — {flight.type}</div>
                                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
                                  <span style={{display:"flex",alignItems:"center",gap:4}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg> {flight.airline}</span>
                                  <span style={{display:"flex",alignItems:"center",gap:4}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> {flight.date}</span>
                                  <span>⏰ {flight.time}</span>
                                  <span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg> {flight.from_airport} → {flight.to_airport}</span>
                                  <span style={{ color: "var(--info)", fontWeight: 500 }}>{fp.length} حاج</span>
                                </div>
                              </div>
                              {fp.length > 0 && (
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, direction: "ltr" }}>
                                  <thead>
                                    <tr style={{ background: "var(--info)", color: "var(--bg-card)" }}>
                                      {["S.N.", "FULL NAME", "NAT.", "PASSPORT NO.", "GENDER", "CLASS"].map(h =>
                                        <th key={h} style={{ padding: "5px 10px", textAlign: "left" }}>{h}</th>
                                      )}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {fp.map((p, i) => (
                                      <tr key={p.id} style={{ background: i % 2 === 0 ? "white" : "var(--info-bg)" }}>
                                        <td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{i + 1}</td>
                                        <td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.name_en}</td>
                                        <td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.nat === "قطري" ? "QAT" : "EGY"}</td>
                                        <td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.passport}</td>
                                        <td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.gender === "ذكر" ? "MR." : "MRS."}</td>
                                        <td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.flight_class === "درجة أولى" ? "⭐ FIRST" : ""}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          );
                        })
                      }
                      <ExportButtons
                        onExcel={exportPerFlightXLSX}
                        onPDF={() => downloadPDF(getPerFlightHTML(), "تقرير_الرحلات.html")}
                        onPrint={() => printInPage(getPerFlightHTML())}
                      />
                    </>
                  )}
                </>
              )}
            </>
          )}

          {/* ===== تقرير الباصات ===== */}
          {activeReport === "buses" && (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>تقرير الباصات</div>
              {loading ? <div style={{ textAlign: "center", color: "var(--text-muted)" }}>جاري التحميل...</div> :
                buses.length === 0 ? <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>لا يوجد باصات</div> :
                <>
                  {buses.map(bus => {
                    const bp = passengers.filter(p => p.bus_id === bus.id);
                    return (
                      <div key={bus.id} style={{ border: "0.5px solid #e5e5e5", borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
                        <div style={{ padding: "8px 12px", background: bus.type === "VIP" ? "var(--warning-bg)" : "var(--bg-2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{bus.name} {bus.type === "VIP" && <span style={{ fontSize: 10, background: "var(--warning-bg)", color: "var(--warning)", padding: "1px 6px", borderRadius: 99 }}>VIP</span>}</div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{bp.length} مسافر</div>
                        </div>
                        {bp.length > 0 && (
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                            <thead><tr style={{ background: "var(--info)", color: "var(--bg-card)" }}>
                              <th style={{ padding: "5px 10px", textAlign: "center", width: 30 }}>م</th>
                              <th style={{ padding: "5px 10px", textAlign: "right" }}>اسم الحاج / الحاجة</th>
                            </tr></thead>
                            <tbody>{bp.map((p, i) =>
                              <tr key={p.id} style={{ background: i % 2 === 0 ? "white" : "var(--info-bg)" }}>
                                <td style={{ padding: "5px 10px", border: "0.5px solid #eee", textAlign: "center", color: "var(--text-muted)" }}>{i + 1}</td>
                                <td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.short_ar || p.name_ar}</td>
                              </tr>
                            )}</tbody>
                          </table>
                        )}
                      </div>
                    );
                  })}
                  <ExportButtons
                    onExcel={exportBusesXLSX}
                    onPDF={() => downloadPDF(getBusesHTML(), "تقرير_الباصات.html")}
                    onPrint={() => printInPage(getBusesHTML())}
                  />
                </>
              }
            </>
          )}

          {/* ===== تقرير منى ===== */}
          {activeReport === "mina" && (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>تقرير مخيمات منى</div>
              {loading ? <div style={{ textAlign: "center", color: "var(--text-muted)" }}>جاري التحميل...</div> :
                camps.filter(c => c.page_type === "منى").length === 0 ?
                  <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>لا يوجد مخيمات</div> :
                <>
                  {camps.filter(c => c.page_type === "منى").map(camp => {
                    const cp = passengers.filter(p => p.camp_mina_id === camp.id);
                    const isMale = camp.gender === "ذكر";
                    return (
                      <div key={camp.id} style={{ border: `0.5px solid ${camp.type === "خاص" ? "var(--accent)" : "var(--border)"}`, borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
                        <div style={{ padding: "8px 12px", background: camp.type === "خاص" ? "var(--warning-bg)" : "var(--bg-2)", display: "flex", justifyContent: "space-between" }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>مخيم {camp.name}
                            <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: isMale ? "var(--male-bg)" : "var(--female-bg)", color: isMale ? "var(--info)" : "var(--female-fg)", marginRight: 6 }}>{isMale ? "رجال" : "نساء"}</span>
                            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>({camp.type}) · {cp.length} مسافر</span>
                          </div>
                        </div>
                        {cp.length > 0 && (
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                            <thead><tr style={{ background: isMale ? "var(--info)" : "var(--female-fg)", color: "var(--bg-card)" }}>
                              <th style={{ padding: "5px 10px", textAlign: "center", width: 30 }}>م</th>
                              <th style={{ padding: "5px 10px", textAlign: "right" }}>الاسم</th>
                              <th style={{ padding: "5px 10px", textAlign: "right" }}>الجنسية</th>
                            </tr></thead>
                            <tbody>{cp.map((p, i) =>
                              <tr key={p.id} style={{ background: i % 2 === 0 ? "white" : "var(--bg-2)" }}>
                                <td style={{ padding: "5px 10px", border: "0.5px solid #eee", textAlign: "center", color: "var(--text-muted)" }}>{i + 1}</td>
                                <td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.short_ar || p.name_ar}</td>
                                <td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.nat}</td>
                              </tr>
                            )}</tbody>
                          </table>
                        )}
                      </div>
                    );
                  })}
                  <ExportButtons
                    onExcel={() => exportCampsXLSX("منى")}
                    onPDF={() => downloadPDF(getCampsHTML("منى"), "تقرير_مخيمات_منى.html")}
                    onPrint={() => printInPage(getCampsHTML("منى"))}
                  />
                </>
              }
            </>
          )}

          {/* ===== تقرير عرفة ===== */}
          {activeReport === "arafa" && (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>تقرير مخيمات عرفة</div>
              {loading ? <div style={{ textAlign: "center", color: "var(--text-muted)" }}>جاري التحميل...</div> :
                camps.filter(c => c.page_type === "عرفة").length === 0 ?
                  <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>لا يوجد مخيمات</div> :
                <>
                  {camps.filter(c => c.page_type === "عرفة").map(camp => {
                    const cp = passengers.filter(p => p.camp_arafa_id === camp.id);
                    const isMale = camp.gender === "ذكر";
                    return (
                      <div key={camp.id} style={{ border: `0.5px solid ${camp.type === "خاص" ? "var(--accent)" : "var(--border)"}`, borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
                        <div style={{ padding: "8px 12px", background: camp.type === "خاص" ? "var(--warning-bg)" : "var(--bg-2)", display: "flex", justifyContent: "space-between" }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>مخيم {camp.name}
                            <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: isMale ? "var(--male-bg)" : "var(--female-bg)", color: isMale ? "var(--info)" : "var(--female-fg)", marginRight: 6 }}>{isMale ? "رجال" : "نساء"}</span>
                            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>({camp.type}) · {cp.length} مسافر</span>
                          </div>
                        </div>
                        {cp.length > 0 && (
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                            <thead><tr style={{ background: isMale ? "var(--info)" : "var(--female-fg)", color: "var(--bg-card)" }}>
                              <th style={{ padding: "5px 10px", textAlign: "center", width: 30 }}>م</th>
                              <th style={{ padding: "5px 10px", textAlign: "right" }}>الاسم</th>
                              <th style={{ padding: "5px 10px", textAlign: "right" }}>الجنسية</th>
                            </tr></thead>
                            <tbody>{cp.map((p, i) =>
                              <tr key={p.id} style={{ background: i % 2 === 0 ? "white" : "var(--bg-2)" }}>
                                <td style={{ padding: "5px 10px", border: "0.5px solid #eee", textAlign: "center", color: "var(--text-muted)" }}>{i + 1}</td>
                                <td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.short_ar || p.name_ar}</td>
                                <td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.nat}</td>
                              </tr>
                            )}</tbody>
                          </table>
                        )}
                      </div>
                    );
                  })}
                  <ExportButtons
                    onExcel={() => exportCampsXLSX("عرفة")}
                    onPDF={() => downloadPDF(getCampsHTML("عرفة"), "تقرير_مخيمات_عرفة.html")}
                    onPrint={() => printInPage(getCampsHTML("عرفة"))}
                  />
                </>
              }
            </>
          )}

          {/* ===== تقرير الفندق ===== */}
          {activeReport === "hotel" && (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>تقرير الفندق</div>
              {/* فلتر الطباعة */}
              <div style={{ border: "0.5px solid #e5e5e5", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>نطاق التقرير</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  {[["all", "كل الغرف"], ["floor", "دور معين"], ["type", "نوع معين"]].map(([val, label]) => (
                    <div key={val} onClick={() => setHotelPrintFilter(val as any)}
                      style={{ flex: 1, minWidth: 80, padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${hotelPrintFilter === val ? "var(--info)" : "var(--border)"}`, background: hotelPrintFilter === val ? "var(--male-bg)" : "transparent", cursor: "pointer", textAlign: "center", fontSize: 12, color: hotelPrintFilter === val ? "var(--info)" : "var(--text-muted)" }}>
                      {label}
                    </div>
                  ))}
                </div>
                {hotelPrintFilter === "floor" && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {floors.map(f => (
                      <div key={f} onClick={() => setHotelPrintFloor(f)}
                        style={{ padding: "5px 12px", borderRadius: 99, border: `1.5px solid ${hotelPrintFloor === f ? "var(--info)" : "var(--border)"}`, background: hotelPrintFloor === f ? "var(--male-bg)" : "transparent", cursor: "pointer", fontSize: 12, color: hotelPrintFloor === f ? "var(--info)" : "var(--text-muted)" }}>
                        طابق {f}
                      </div>
                    ))}
                  </div>
                )}
                {hotelPrintFilter === "type" && (
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {ROOM_TYPES.map(t => {
                      const [bg, clr] = ROOM_COLORS[t];
                      return (
                        <div key={t} onClick={() => setHotelPrintType(t)}
                          style={{ flex: 1, padding: 6, borderRadius: 8, border: `1.5px solid ${hotelPrintType === t ? clr : "var(--border)"}`, background: hotelPrintType === t ? bg : "transparent", cursor: "pointer", textAlign: "center", fontSize: 11, color: hotelPrintType === t ? clr : "var(--text-muted)" }}>
                          {t}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {loading ? <div style={{ textAlign: "center", color: "var(--text-muted)" }}>جاري التحميل...</div> :
                rooms.length === 0 ? <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>لا يوجد غرف</div> :
                <>
                  {getFilteredRooms().map(room => {
                    const rp = passengers.filter(p => p.room_id === room.id);
                    const [typeBg, typeClr] = ROOM_COLORS[room.type] || ["var(--bg-2)", "var(--text)"];
                    return (
                      <div key={room.id} style={{ border: "0.5px solid #e5e5e5", borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
                        <div style={{ padding: "7px 12px", background: "var(--bg-2)", display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99, background: typeBg, color: typeClr }}>{room.type}</span>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>غرفة {room.number} {room.floor && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>ط{room.floor}</span>}</div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginRight: "auto" }}>{rp.length} مسافر</div>
                        </div>
                        {rp.length > 0 && (
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                            <thead><tr style={{ background: "var(--info)", color: "var(--bg-card)" }}>
                              <th style={{ padding: "5px 10px", textAlign: "center", width: 30 }}>م</th>
                              <th style={{ padding: "5px 10px", textAlign: "right" }}>الاسم</th>
                              <th style={{ padding: "5px 10px", textAlign: "right" }}>الجنس</th>
                              <th style={{ padding: "5px 10px", textAlign: "right" }}>طلب</th>
                            </tr></thead>
                            <tbody>{rp.map((p, i) =>
                              <tr key={p.id} style={{ background: i % 2 === 0 ? "white" : "var(--info-bg)" }}>
                                <td style={{ padding: "5px 10px", border: "0.5px solid #eee", textAlign: "center", color: "var(--text-muted)" }}>{i + 1}</td>
                                <td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.short_ar || p.name_ar}</td>
                                <td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.gender}</td>
                                <td style={{ padding: "5px 10px", border: "0.5px solid #eee" }}>{p.services?.hotel_type} {p.services?.hotel_view}</td>
                              </tr>
                            )}</tbody>
                          </table>
                        )}
                      </div>
                    );
                  })}
                  <ExportButtons
                    onExcel={exportHotelXLSX}
                    onPDF={() => downloadPDF(getHotelHTML(), "تقرير_الفندق.html")}
                    onPrint={() => printInPage(getHotelHTML())}
                  />
                </>
              }
            </>
          )}

          {/* ===== طباعة الجوازات ===== */}
          {activeReport === "passports" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>طباعة الجوازات</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => {
                    const withPassport = passengers.filter(p => (p as any).passport_url);
                    setPassportSelectedIds(prev => prev.size === withPassport.length ? new Set() : new Set(withPassport.map(p => p.id)));
                  }} style={{ fontSize: 11, padding: "5px 12px", borderRadius: 99, border: "1px solid var(--line)", background: "var(--paper)", cursor: "pointer" }}>
                    {passportSelectedIds.size === passengers.filter(p => (p as any).passport_url).length ? "إلغاء الكل" : "تحديد الكل"}
                  </button>
                  <button onClick={() => {
                    const toprint = passengers.filter(p => (p as any).passport_url && passportSelectedIds.has(p.id));
                    if (!toprint.length) { alert("اختار جوازات أولاً!"); return; }
                    const w = window.open("", "_blank"); if (!w) return;
                    const imgs = toprint.map(p => `<div style="break-inside:avoid;margin-bottom:20px;border:1px solid #ddd;border-radius:8px;overflow:hidden"><div style="background:#7D1F3C;color:#e7cd8a;padding:6px 12px;font-size:12px;font-weight:700;direction:rtl">${p.short_ar || p.name_ar} — ${p.passport || "—"}</div><img src="${(p as any).passport_url}" style="width:100%;max-height:280px;object-fit:contain;display:block" /></div>`).join("");
                    w.document.write(`<html><head><title>جوازات السفر</title><style>body{font-family:Arial;padding:16px;margin:0}@media print{@page{margin:10mm}}</style></head><body><h2 style="text-align:center;color:#7D1F3C;margin-bottom:16px">جوازات السفر (${toprint.length})</h2><div style="columns:2;column-gap:16px">${imgs}</div><script>window.print();<\/script></body></html>`);
                    w.document.close();
                  }} style={{ fontSize: 11, padding: "5px 14px", borderRadius: 99, background: "var(--em7)", color: "var(--g3)", border: "none", cursor: "pointer", fontWeight: 600 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginLeft: 4 }}><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                    طباعة ({passportSelectedIds.size})
                  </button>
                </div>
              </div>
              {passengers.filter(p => (p as any).passport_url).length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>لا يوجد حجاج رُفعت جوازاتهم بعد</div>
              ) : (
                <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
                  {passengers.filter(p => (p as any).passport_url).map((p, i) => (
                    <div key={p.id} onClick={() => setPassportSelectedIds(prev => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderBottom: "0.5px solid var(--line)", cursor: "pointer", background: passportSelectedIds.has(p.id) ? "rgba(125,31,60,0.05)" : "transparent", transition: "background 0.1s" }}>
                      {/* Checkbox */}
                      <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${passportSelectedIds.has(p.id) ? "var(--em7)" : "var(--line)"}`, background: passportSelectedIds.has(p.id) ? "var(--em7)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.1s" }}>
                        {passportSelectedIds.has(p.id) && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                      </div>
                      {/* رقم */}
                      <span style={{ fontSize: 11, color: "var(--text-muted)", width: 24, flexShrink: 0 }}>{i + 1}</span>
                      {/* الاسم */}
                      <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{p.short_ar || p.name_ar}</span>
                      {/* الجواز */}
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{p.passport || "—"}</span>
                      {/* الجنس */}
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99, background: p.gender === "أنثى" ? "var(--fb)" : "var(--mb)", color: p.gender === "أنثى" ? "var(--ff)" : "var(--mf)" }}>{p.gender === "أنثى" ? "أنثى" : "ذكر"}</span>
                    </div>
                  ))}
                </div>
              )}
              {passengers.filter(p => !(p as any).passport_url).length > 0 && (
                <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--warning-bg)", borderRadius: 10, fontSize: 11, color: "var(--warning)" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ marginLeft: 6 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  {passengers.filter(p => !(p as any).passport_url).length} حاج مش عندهم صورة جواز مرفوعة
                </div>
              )}
            </>
          )}

          {/* ===== WhatsApp ===== */}
          {activeReport === "whatsapp" && (
            <>
              {/* إعدادات API */}
              <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 16px", marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 9, height: 9, borderRadius: "50%", background: waToken && waPhoneId ? "#25D366" : "#ccc" }} />
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{waToken && waPhoneId ? "API متصل ✓" : "API غير مضبوط"}</span>
                  </div>
                  <button onClick={() => setWaShowSettings(p => !p)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 99, border: "1px solid var(--line)", background: "var(--bg-2)", cursor: "pointer" }}>
                    {waShowSettings ? "إخفاء" : "إعدادات API"}
                  </button>
                </div>
                {waShowSettings && (
                  <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>API Token</div>
                      <input value={waToken} onChange={e => { setWaToken(e.target.value); localStorage.setItem("wa_token", e.target.value); }} placeholder="EAAxxxxx..." style={{ width: "100%", padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 11, fontFamily: "monospace", boxSizing: "border-box" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Phone Number ID</div>
                      <input value={waPhoneId} onChange={e => { setWaPhoneId(e.target.value); localStorage.setItem("wa_phone_id", e.target.value); }} placeholder="1234567890" style={{ width: "100%", padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 11, fontFamily: "monospace", boxSizing: "border-box" }} />
                    </div>
                  </div>
                )}
              </div>

              {/* نص الرسالة */}
              <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 16px", marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>نص الرسالة</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8, lineHeight: 2 }}>
                  {["{الاسم}", "{الباص}", "{الرحلة}", "{الغرفة}", "{منى}", "{عرفة}"].map(v => (
                    <code key={v} onClick={() => setWaTemplate(t => t + v)} style={{ background: "var(--bg-2)", padding: "2px 7px", borderRadius: 4, marginLeft: 4, fontSize: 10, cursor: "pointer" }}>{v}</code>
                  ))}
                </div>
                <textarea value={waTemplate} onChange={e => { setWaTemplate(e.target.value); localStorage.setItem("wa_template", e.target.value); }}
                  style={{ width: "100%", minHeight: 150, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 12, fontFamily: "var(--font-body)", resize: "vertical", lineHeight: 1.8, boxSizing: "border-box", direction: "rtl" }} />
              </div>

              {/* المرفقات */}
              <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 16px", marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>المرفقات</div>
                <div style={{ display: "flex", gap: 10 }}>
                  {([{ key: "permit" as const, label: "تصريح السفر", field: "hajj_permit_url" }, { key: "ticket" as const, label: "تذكرة الطيران", field: "flight_ticket_url" }]).map(doc => (
                    <div key={doc.key} onClick={() => setWaSendDocs(p => ({ ...p, [doc.key]: !p[doc.key] }))}
                      style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${waSendDocs[doc.key] ? "#25D366" : "var(--line)"}`, background: waSendDocs[doc.key] ? "rgba(37,211,102,0.06)" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${waSendDocs[doc.key] ? "#25D366" : "var(--line)"}`, background: waSendDocs[doc.key] ? "#25D366" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {waSendDocs[doc.key] && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                      </div>
                      <span style={{ fontSize: 12 }}>{doc.label}</span>
                      <span style={{ fontSize: 10, color: "var(--text-muted)", marginRight: "auto" }}>{passengers.filter(p => (p as any)[doc.field]).length} حاج</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* المرسل إليهم */}
              <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 16px", marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>المرسل إليهم</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  {(["all", "select"] as const).map(m => (
                    <div key={m} onClick={() => setWaSelectMode(m)}
                      style={{ flex: 1, padding: "8px", borderRadius: 8, border: `1.5px solid ${waSelectMode === m ? "var(--em7)" : "var(--line)"}`, background: waSelectMode === m ? "rgba(125,31,60,0.06)" : "transparent", cursor: "pointer", textAlign: "center", fontSize: 12, color: waSelectMode === m ? "var(--em7)" : "var(--text-muted)" }}>
                      {m === "all" ? `الكل (${passengers.filter(p => p.phone).length} حاج)` : "اختيار معين"}
                    </div>
                  ))}
                </div>
                {waSelectMode === "select" && (
                  <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 8 }}>
                    {passengers.filter(p => p.phone).map(p => (
                      <div key={p.id} onClick={() => setWaSelectedIds(prev => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderBottom: "0.5px solid var(--line)", cursor: "pointer", background: waSelectedIds.has(p.id) ? "rgba(125,31,60,0.05)" : "transparent" }}>
                        <div style={{ width: 15, height: 15, borderRadius: 4, border: `2px solid ${waSelectedIds.has(p.id) ? "var(--em7)" : "var(--line)"}`, background: waSelectedIds.has(p.id) ? "var(--em7)" : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {waSelectedIds.has(p.id) && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                        </div>
                        <span style={{ fontSize: 12, flex: 1 }}>{p.short_ar || p.name_ar}</span>
                        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{p.phone}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* معاينة */}
              {passengers[0] && (
                <div style={{ background: "rgba(37,211,102,0.05)", border: "1px solid rgba(37,211,102,0.2)", borderRadius: 12, padding: "12px 16px", marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: "#128C7E", fontWeight: 600, marginBottom: 8 }}>معاينة — {passengers[0].short_ar || passengers[0].name_ar}</div>
                  <div style={{ fontSize: 12, whiteSpace: "pre-wrap", lineHeight: 1.8, direction: "rtl" }}>
                    {waTemplate
                      .replace("{الاسم}", passengers[0].short_ar || passengers[0].name_ar)
                      .replace("{الباص}", buses.find(b => b.id === (passengers[0] as any).bus_id)?.name || "—")
                      .replace("{الرحلة}", flights.find(f => f.id === passengers[0].flight_id)?.name || "—")
                      .replace("{الغرفة}", rooms.find(r => r.id === (passengers[0] as any).room_id)?.number || "—")
                      .replace("{منى}", camps.find(c => c.id === (passengers[0] as any).camp_mina_id)?.name || "—")
                      .replace("{عرفة}", camps.find(c => c.id === (passengers[0] as any).camp_arafa_id)?.name || "—")
                    }
                  </div>
                  {(waSendDocs.permit || waSendDocs.ticket) && (
                    <div style={{ marginTop: 8, fontSize: 11, color: "#128C7E" }}>
                      {waSendDocs.permit && <div>📎 تصريح السفر (مرفق منفصل)</div>}
                      {waSendDocs.ticket && <div>📎 تذكرة الطيران (مرفق منفصل)</div>}
                    </div>
                  )}
                </div>
              )}

              {/* Test Send */}
              <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 16px", marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>🧪 Test Send</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={waTestPhone} onChange={e => setWaTestPhone(e.target.value)} placeholder="رقم الموبايل مع كود الدولة (مثال: 97450000000)" style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 12, fontFamily: "var(--font-body)" }} />
                  <button onClick={async () => {
                    if (!waTestPhone) { alert("ادخل رقم!"); return; }
                    if (!waToken || !waPhoneId) { alert("ضبط API الأول!"); return; }
                    if (!passengers[0]) { alert("مفيش حجاج!"); return; }
                    const p = passengers[0];
                    const text = waTemplate
                      .replace("{الاسم}", p.short_ar || p.name_ar)
                      .replace("{الباص}", buses.find(b => b.id === (p as any).bus_id)?.name || "—")
                      .replace("{الرحلة}", flights.find(f => f.id === p.flight_id)?.name || "—")
                      .replace("{الغرفة}", rooms.find(r => r.id === (p as any).room_id)?.number || "—")
                      .replace("{منى}", camps.find(c => c.id === (p as any).camp_mina_id)?.name || "—")
                      .replace("{عرفة}", camps.find(c => c.id === (p as any).camp_arafa_id)?.name || "—");
                    const res = await fetch(`https://graph.facebook.com/v18.0/${waPhoneId}/messages`, {
                      method: "POST",
                      headers: { "Authorization": `Bearer ${waToken}`, "Content-Type": "application/json" },
                      body: JSON.stringify({ messaging_product: "whatsapp", to: waTestPhone.replace(/\D/g, ""), type: "text", text: { body: text } })
                    });
                    alert(res.ok ? "✅ تم الإرسال التجريبي!" : "❌ فشل الإرسال — تأكد من API");
                  }} style={{ padding: "7px 14px", borderRadius: 8, background: "var(--info-bg)", color: "var(--info)", border: "1px solid var(--info)", fontSize: 12, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }}>
                    إرسال تجريبي
                  </button>
                </div>
              </div>

              {/* Send To All */}
              <button disabled={waSending} onClick={async () => {
                const sendList = waSelectMode === "all"
                  ? passengers.filter(p => p.phone)
                  : passengers.filter(p => p.phone && waSelectedIds.has(p.id));
                if (!sendList.length) { alert("مفيش حجاج مختارين أو عندهم رقم!"); return; }
                if (!waToken || !waPhoneId) { alert("ضبط API الأول!"); return; }
                if (!confirm(`هتبعت ${sendList.length} رسالة — متأكد؟`)) return;
                setWaSending(true);
                setWaResults(sendList.map(p => ({ name: p.short_ar || p.name_ar, phone: p.phone, status: "pending" as const })));
                for (let i = 0; i < sendList.length; i++) {
                  const p = sendList[i];
                  try {
                    const text = waTemplate
                      .replace("{الاسم}", p.short_ar || p.name_ar)
                      .replace("{الباص}", buses.find(b => b.id === (p as any).bus_id)?.name || "—")
                      .replace("{الرحلة}", flights.find(f => f.id === p.flight_id)?.name || "—")
                      .replace("{الغرفة}", rooms.find(r => r.id === (p as any).room_id)?.number || "—")
                      .replace("{منى}", camps.find(c => c.id === (p as any).camp_mina_id)?.name || "—")
                      .replace("{عرفة}", camps.find(c => c.id === (p as any).camp_arafa_id)?.name || "—");
                    const res = await fetch(`https://graph.facebook.com/v18.0/${waPhoneId}/messages`, {
                      method: "POST",
                      headers: { "Authorization": `Bearer ${waToken}`, "Content-Type": "application/json" },
                      body: JSON.stringify({ messaging_product: "whatsapp", to: p.phone.replace(/\D/g, ""), type: "text", text: { body: text } })
                    });
                    if (res.ok) {
                      // بعت التصريح لو مختار
                      if (waSendDocs.permit && (p as any).hajj_permit_url) {
                        const path = (p as any).hajj_permit_url.split("/passengers-docs/")[1]?.split("?")[0];
                        if (path) {
                          const { data } = await supabase.storage.from("passengers-docs").createSignedUrl(path, 60 * 60 * 24 * 30);
                          if (data?.signedUrl) await fetch(`https://graph.facebook.com/v18.0/${waPhoneId}/messages`, { method: "POST", headers: { "Authorization": `Bearer ${waToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", to: p.phone.replace(/\D/g, ""), type: "document", document: { link: data.signedUrl, caption: "تصريح السفر" } }) });
                        }
                      }
                      // بعت التذكرة لو مختارة
                      if (waSendDocs.ticket && (p as any).flight_ticket_url) {
                        const path = (p as any).flight_ticket_url.split("/passengers-docs/")[1]?.split("?")[0];
                        if (path) {
                          const { data } = await supabase.storage.from("passengers-docs").createSignedUrl(path, 60 * 60 * 24 * 30);
                          if (data?.signedUrl) await fetch(`https://graph.facebook.com/v18.0/${waPhoneId}/messages`, { method: "POST", headers: { "Authorization": `Bearer ${waToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", to: p.phone.replace(/\D/g, ""), type: "document", document: { link: data.signedUrl, caption: "تذكرة الطيران" } }) });
                        }
                      }
                      setWaResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: "success" as const } : r));
                    } else {
                      setWaResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: "error" as const } : r));
                    }
                  } catch {
                    setWaResults(prev => prev.map((r, idx) => idx === i ? { ...r, status: "error" as const } : r));
                  }
                  await new Promise(r => setTimeout(r, 400));
                }
                setWaSending(false);
              }} style={{ width: "100%", padding: "12px 0", borderRadius: 10, background: waSending ? "var(--bg-2)" : "#25D366", color: waSending ? "var(--text-muted)" : "white", border: "none", fontSize: 13, fontWeight: 700, cursor: waSending ? "not-allowed" : "pointer", fontFamily: "var(--font-body)", marginBottom: 12 }}>
                {waSending ? "جاري الإرسال..." : `📤 Send To All — ${(waSelectMode === "all" ? passengers.filter(p => p.phone) : passengers.filter(p => p.phone && waSelectedIds.has(p.id))).length} حاج`}
              </button>

              {/* نتائج */}
              {waResults.length > 0 && (
                <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", fontSize: 12, fontWeight: 600, display: "flex", gap: 14 }}>
                    <span style={{ color: "#25D366" }}>✓ {waResults.filter(r => r.status === "success").length} نجح</span>
                    <span style={{ color: "var(--danger)" }}>✗ {waResults.filter(r => r.status === "error").length} فشل</span>
                    <span style={{ color: "var(--text-muted)" }}>⏳ {waResults.filter(r => r.status === "pending").length} منتظر</span>
                  </div>
                  <div style={{ maxHeight: 220, overflowY: "auto" }}>
                    {waResults.map((r, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", borderBottom: "0.5px solid var(--line)" }}>
                        <span style={{ color: r.status === "success" ? "#25D366" : r.status === "error" ? "var(--danger)" : "var(--text-muted)" }}>
                          {r.status === "success" ? "✓" : r.status === "error" ? "✗" : "⏳"}
                        </span>
                        <span style={{ fontSize: 12, flex: 1 }}>{r.name}</span>
                        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{r.phone}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {passengers.filter(p => !p.phone).length > 0 && (
                <div style={{ marginTop: 12, padding: "8px 14px", background: "var(--warning-bg)", borderRadius: 10, fontSize: 11, color: "var(--warning)" }}>
                  ⚠️ {passengers.filter(p => !p.phone).length} حاج مش عندهم رقم — مش هيتبعتلهم
                </div>
              )}
            </>
          )}

        </div>
      )}
    </div>
  );
}

export { ReportsPage };
