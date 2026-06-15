import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../supabase";
import { useConfig } from "../config/ConfigContext";
import type { Passenger, Bus, Camp, Room, Flight } from "../types";
import { makeHTML, printInPage, freezeHeaderRow, addSummarySheet, styleTitleRow, styleHeaderRow, safeSheetName, renderNamesTable, makeTwoLogoSectionHTML, joinSections, makeFlightSectionHTML, ROOM_COLORS, ROOM_TYPES, ROOM_ICON_COLORS, ICON_COLOR_CYCLE, VIP_ICON_COLOR, btnP, btnS } from "../utils";
import { AlertModal, useAlert } from "./AlertModal";

// ============================================================
// تحويل الجنسية لكود إنجليزي موحّد لتقرير خطوط الطيران
// ============================================================
const NAT_CODE_MAP: Record<string, string> = {
  "قطري": "QAT", "قطرية": "QAT",
  "سعودي": "KSA", "سعودية": "KSA",
  "اماراتي": "UAE", "إماراتي": "UAE", "اماراتية": "UAE", "إماراتية": "UAE",
  "كويتي": "KWT", "كويتية": "KWT",
  "بحريني": "BHR", "بحرينية": "BHR",
  "عماني": "OMN", "عمانية": "OMN", "عُماني": "OMN",
  "مصري": "EGY", "مصرية": "EGY",
  "يمني": "YEM", "يمنية": "YEM",
  "سوري": "SYR", "سورية": "SYR",
  "لبناني": "LBN", "لبنانية": "LBN",
  "اردني": "JOR", "أردني": "JOR", "اردنية": "JOR", "أردنية": "JOR",
  "فلسطيني": "PLE", "فلسطينية": "PLE",
  "عراقي": "IRQ", "عراقية": "IRQ",
  "سوداني": "SDN", "سودانية": "SDN",
  "ليبي": "LBY", "ليبية": "LBY",
  "تونسي": "TUN", "تونسية": "TUN",
  "جزائري": "ALG", "جزائرية": "ALG",
  "مغربي": "MAR", "مغربية": "MAR",
  "هندي": "IND", "هندية": "IND",
  "باكستاني": "PAK", "باكستانية": "PAK",
  "بنغلاديشي": "BAN", "بنغلاديشية": "BAN",
  "فلبيني": "PHI", "فلبينية": "PHI",
  "نيبالي": "NEP", "نيبالية": "NEP",
  "سريلانكي": "SRI", "سريلانكية": "SRI",
};
const NAT_EN_PATTERNS: [RegExp, string][] = [
  [/qatar/i, "QAT"], [/saudi/i, "KSA"], [/emirat|uae/i, "UAE"], [/kuwait/i, "KWT"],
  [/bahrain/i, "BHR"], [/oman/i, "OMN"], [/egypt/i, "EGY"], [/yemen/i, "YEM"],
  [/syria/i, "SYR"], [/lebanon|lebanes/i, "LBN"], [/jordan/i, "JOR"], [/palestin/i, "PLE"],
  [/iraq/i, "IRQ"], [/sudan/i, "SDN"], [/liby/i, "LBY"], [/tunis/i, "TUN"],
  [/algeri/i, "ALG"], [/morocc/i, "MAR"], [/india/i, "IND"], [/pakistan/i, "PAK"],
  [/banglades/i, "BAN"], [/philippin/i, "PHI"], [/nepal/i, "NEP"], [/sri ?lank/i, "SRI"],
];
function natCode(nat: string | undefined | null): string {
  const v = (nat || "").trim();
  if (!v) return "—";
  if (NAT_CODE_MAP[v]) return NAT_CODE_MAP[v];
  for (const [re, code] of NAT_EN_PATTERNS) if (re.test(v)) return code;
  // غير معروفة: أول 3 حروف بالإنجليزي لو متاحة، وإلا القيمة الأصلية
  return /^[A-Za-z]/.test(v) ? v.slice(0, 3).toUpperCase() : v;
}

function ReportsPage({ passengers: rawPassengers, resetKey }: { passengers: Passenger[]; resetKey?: number }) {
  const { alert: alertState, showAlert } = useAlert();
  const passengers = [...rawPassengers].sort((a, b) => ((a as any).sort_order ?? 0) - ((b as any).sort_order ?? 0));
  // طالب درجة أولى: لو الدرجة المخصصة "درجة أولى" أو لو ده طلبه الأصلي في بياناته
  const wantsFirstClass = (p: Passenger) => p.flight_class === "درجة أولى" || p.services?.flight === "درجة أولى";
  // الحجاج المرتبطين برحلة معينة — ذهاب عبر flight_id، إياب عبر return_flight_id (مستقلين)
  const passengersOfFlight = (flight: Flight) => passengers.filter(p => (flight.type === "إياب" ? p.return_flight_id : p.flight_id) === flight.id);
  // اسم الرحلة المرتبط بالحاج (لرسائل الواتساب) — ذهاب أولاً ثم إياب
  const flightNameFor = (p: Passenger) => flights.find(f => f.id === p.flight_id)?.name || flights.find(f => f.id === p.return_flight_id)?.name || "—";
  const config = useConfig();
  const logoUrl = config.logo_url || "";
  const companyName = config.name_ar || "حملة الأقصى";
  const tagline = config.tagline || "";
  const primaryColor = config.color_primary || "#6B1F3A";
  const accentColor = config.color_accent || "#0C447C";
  const mkHTML = (title: string, body: string, landscape = false, noHeader = false) =>
    makeHTML(title, body, landscape, logoUrl, companyName, tagline, primaryColor, accentColor, noHeader);

  const [activeReport, setActiveReport] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const toggleExpandedItem = (id: number) => setExpandedItems(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const [openPanels, setOpenPanels] = useState<Set<string>>(new Set());
  const togglePanel = (key: string) => setOpenPanels(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  // الرجوع لقائمة التقارير لو ضغط المستخدم على "التقارير" في القايمة الجانبية وهو بالفعل داخل تقرير
  useEffect(() => {
    if (resetKey !== undefined) setActiveReport(null);
  }, [resetKey]);

  const [buses, setBuses] = useState<Bus[]>([]);
  const [camps, setCamps] = useState<Camp[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(false);

  // تحديد عناصر التقرير (لطباعة عنصر واحد بس أو أكثر)
  const [selectedBusIds, setSelectedBusIds] = useState<Set<number>>(new Set());
  const [selectedFlightIds, setSelectedFlightIds] = useState<Set<number>>(new Set());
  const [selectedMinaCampIds, setSelectedMinaCampIds] = useState<Set<number>>(new Set());
  const [selectedArafaCampIds, setSelectedArafaCampIds] = useState<Set<number>>(new Set());
  const [selectedFloors, setSelectedFloors] = useState<Set<string>>(new Set());
  const floorKey = (r: Room) => r.floor ? String(r.floor) : "بدون طابق";

  // تقرير الفندق — فلتر الطباعة
  const [hotelPrintFilter, setHotelPrintFilter] = useState<"all" | "type">("all");
  const [hotelPrintType, setHotelPrintType] = useState<string>("");
  const floorItems = [...new Set(rooms.map(r => floorKey(r)))]
    .sort((a, b) => {
      if (a === "بدون طابق") return 1;
      if (b === "بدون طابق") return -1;
      return Number(a) - Number(b);
    })
    .map(f => ({ id: f, label: f === "بدون طابق" ? f : `طابق ${f}` }));

  // تقرير الطيران — نوع التقرير الفرعي
  const [flightSubReport, setFlightSubReport] = useState<"airline" | "per_flight" | null>(null);
  const [docType, setDocType] = useState<"passport_url" | "national_id_url" | "hajj_permit_url" | "flight_ticket_url">("passport_url");
  const [docSelected, setDocSelected] = useState<Record<string, Set<number>>>({});
  const [docPerPage, setDocPerPage] = useState<1 | 2 | 4>(2);

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
    { key: "flight_dep", label: "رحلة الذهاب", get: (p: Passenger) => flights.find(f => f.id === p.flight_id)?.name || "" },
    { key: "flight_ret", label: "رحلة الإياب", get: (p: Passenger) => flights.find(f => f.id === p.return_flight_id)?.name || "" },
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
      if (b) {
        const validBuses = (b as Bus[]).filter(x => x.type || passengers.some(p => p.bus_id === x.id));
        setBuses(validBuses);
        setSelectedBusIds(new Set(validBuses.map(x => x.id)));
      }
      if (c) {
        const validCamps = (c as Camp[]).filter(x => x.type || passengers.some(p => (p as any).camp_mina_id === x.id || (p as any).camp_arafa_id === x.id));
        setCamps(validCamps);
        setSelectedMinaCampIds(new Set(validCamps.filter(x => x.page_type === "منى").map(x => x.id)));
        setSelectedArafaCampIds(new Set(validCamps.filter(x => x.page_type === "عرفة").map(x => x.id)));
      }
      if (r) {
        setRooms(r as Room[]);
        setSelectedFloors(new Set((r as Room[]).map(x => x.floor ? String(x.floor) : "بدون طابق")));
      }
      if (f) {
        const validFlights = (f as Flight[]).filter(x => x.type || passengers.some(p => p.flight_id === x.id || p.return_flight_id === x.id));
        setFlights(validFlights);
        setSelectedFlightIds(new Set(validFlights.map(x => x.id)));
      }
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
    const body = `<table class="wide-table"><tr><th style="text-align:center;width:30px">م</th>${activeCols.map(c => `<th>${c.label}</th>`).join("")}</tr>${rows}</table>`;
    return mkHTML("كشف الحجاج", body, activeCols.length > 5);
  };

  const exportPassengersXLSX = () => {
    const headers = ["م", ...activeCols.map(c => c.label)];
    const rows = passengers.map((p, i) => [i + 1, ...activeCols.map(c => c.get(p) || "")]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = [{ wch: 4 }, ...activeCols.map(c => ({ wch: Math.max(c.label.length + 2, 15) }))];
    freezeHeaderRow(ws);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الحجاج");
    addSummarySheet(wb, XLSX, "كشف الحجاج", companyName, [
      ["إجمالي عدد الحجاج", passengers.length],
      ["عدد الرجال", passengers.filter(p => p.gender === "ذكر").length],
      ["عدد النساء", passengers.filter(p => p.gender === "أنثى").length],
      ["عدد الأعمدة المعروضة", activeCols.length],
    ]);
    XLSX.writeFile(wb, "تقرير_الحجاج.xlsx");
  };

  // ============================================================
  // تقرير الطيران — خطوط الطيران (airline list)
  // ============================================================
  const getAirlineHTML = () => {
    const list = passengers.filter(p => p.services?.flight !== "بدون");
    const rows = list.map((p, i) => {
      const nat = natCode(p.nat);
      const gender = p.gender === "ذكر" ? "MR." : "MRS.";
      const cls = wantsFirstClass(p) ? "FIRST CLASS" : "";
      return `<tr><td style="text-align:center">${i + 1}</td><td>${p.name_en}</td><td>${nat}</td><td>${p.passport}</td><td>${p.phone || "—"}</td><td>${gender}</td><td>${cls}</td></tr>`;
    }).join("");
    const body = `<table class="flight-table ltr-table" style="direction:ltr"><tr><th style="text-align:center;width:30px">S.N.</th><th>FULL NAME</th><th>NAT.</th><th>PASSPORT NO.</th><th>TEL. NO.</th><th>GENDER</th><th>CLASS</th></tr>${rows}</table>`;
    return mkHTML("Pilgrims Flight List", body, false);
  };

  const exportAirlineXLSX = () => {
    const list = passengers.filter(p => p.services?.flight !== "بدون");
    const headers = ["S.N.", "FULL NAME", "NAT.", "PASSPORT NO.", "TEL. NO.", "GENDER", "CLASS"];
    const rows = list.map((p, i) => [
      i + 1, p.name_en,
      natCode(p.nat),
      p.passport, p.phone || "—",
      p.gender === "ذكر" ? "MR." : "MRS.",
      wantsFirstClass(p) ? "FIRST CLASS" : ""
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = [{ wch: 5 }, { wch: 32 }, { wch: 6 }, { wch: 14 }, { wch: 14 }, { wch: 7 }, { wch: 13 }];
    freezeHeaderRow(ws);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Flight List");
    addSummarySheet(wb, XLSX, "Pilgrims Flight List", companyName, [
      ["إجمالي عدد الحجاج", list.length],
      ["درجة أولى", list.filter(p => wantsFirstClass(p)).length],
      ["درجة اقتصادية", list.filter(p => !wantsFirstClass(p)).length],
    ]);
    XLSX.writeFile(wb, "flight_list.xlsx");
  };

  // ============================================================
  // تقرير الطيران — كل رحلة
  // ============================================================
  const getPerFlightHTML = () => {
    const selFlights = flights.filter(f => selectedFlightIds.has(f.id));
    const sections = selFlights.map(flight => {
      const fp = passengersOfFlight(flight);
      return makeFlightSectionHTML(flight, fp, { logoUrl, companyName, tagline, primaryColor, accentColor });
    });
    return mkHTML("تقرير الرحلات", joinSections(sections), false);
  };

  const exportPerFlightXLSX = () => {
    const selFlights = flights.filter(f => selectedFlightIds.has(f.id));
    const wb = XLSX.utils.book_new();
    selFlights.forEach(flight => {
      const fp = passengersOfFlight(flight);
      const headers = ["م", "اسم الحاج / الحاجة", "الجنسية", "رقم الجواز", "التليفون", "الجنس", "الدرجة"];
      const info = [["الرحلة:", flight.name], ["الخط:", flight.airline], ["التاريخ:", flight.date], ["الوقت:", flight.time], ["من:", flight.from_airport], ["إلى:", flight.to_airport], []];
      const rows = fp.map((p, i) => [
        i + 1, p.short_ar || p.name_ar, p.nat, p.passport, p.phone || "—", p.gender,
        wantsFirstClass(p) ? "درجة أولى" : "اقتصادية"
      ]);
      const ws = XLSX.utils.aoa_to_sheet([...info, headers, ...rows]);
      ws["!cols"] = [{ wch: 5 }, { wch: 30 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 12 }];
      freezeHeaderRow(ws, info.length + 1);
      XLSX.utils.book_append_sheet(wb, ws, flight.name.slice(0, 31));
    });
    addSummarySheet(wb, XLSX, "تقرير الرحلات", companyName, [
      ["إجمالي عدد الرحلات", selFlights.length],
      ["إجمالي عدد الحجاج", selFlights.reduce((sum, f) => sum + passengersOfFlight(f).length, 0)],
      ...selFlights.map(f => [f.name, passengersOfFlight(f).length]),
    ]);
    XLSX.writeFile(wb, "تقرير_الرحلات.xlsx");
  };

  // ============================================================
  // عرض قائمة أسماء: عمود واحد لو أقل من 20، وعمودين لو 20 فأكثر
  // ============================================================
  // تقرير الباصات
  // ============================================================
  const getBusesHTML = () => {
    const selBuses = buses.filter(b => selectedBusIds.has(b.id));
    const branding = { logoUrl, companyName, tagline, primaryColor, accentColor };
    const sections = selBuses.map(bus => {
      const bp = passengers.filter(p => p.bus_id === bus.id);
      return makeTwoLogoSectionHTML(`باص ${bus.name}${bus.type === "VIP" ? " ⭐ VIP" : ""}`, "", renderNamesTable(bp, "اسم الحاج / الحاجة", primaryColor), branding);
    });
    return mkHTML("تقرير الباصات", joinSections(sections), false, true);
  };

  const exportBusesXLSX = () => {
    const selBuses = buses.filter(b => selectedBusIds.has(b.id));
    const wb = XLSX.utils.book_new();
    const usedNames = new Set<string>();
    selBuses.forEach(bus => {
      const bp = passengers.filter(p => p.bus_id === bus.id);
      const title = `باص ${bus.name}${bus.type === "VIP" ? " ⭐ VIP" : ""}`;
      const aoa: any[][] = [[title], ["م", "اسم الحاج / الحاجة", "الجنس", "الجنسية"]];
      bp.forEach((p, i) => aoa.push([i + 1, p.short_ar || p.name_ar, p.gender, p.nat]));
      if (bp.length === 0) aoa.push(["", "لا يوجد مسافرون", "", ""]);
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = [{ wch: 4 }, { wch: 30 }, { wch: 8 }, { wch: 12 }];
      styleTitleRow(ws, 0, 4, primaryColor);
      styleHeaderRow(ws, 1, 4, primaryColor);
      freezeHeaderRow(ws, 2);
      let name = safeSheetName(`${bus.name}${bus.type === "VIP" ? " VIP" : ""}`);
      let n = name, i = 2;
      while (usedNames.has(n)) { n = safeSheetName(`${name} ${i++}`); }
      usedNames.add(n);
      XLSX.utils.book_append_sheet(wb, ws, n);
    });
    addSummarySheet(wb, XLSX, "تقرير الباصات", companyName, [
      ["إجمالي عدد الباصات", selBuses.length],
      ["إجمالي عدد المسافرين", passengers.filter(p => selBuses.some(b => b.id === p.bus_id)).length],
      ...selBuses.map(b => [`${b.name}${b.type === "VIP" ? " (VIP)" : ""}`, passengers.filter(p => p.bus_id === b.id).length]),
    ]);
    XLSX.writeFile(wb, "تقرير_الباصات.xlsx");
  };

  // ============================================================
  // تقرير المخيمات (منى / عرفة)
  // ============================================================
  const getCampsHTML = (pageType: "منى" | "عرفة") => {
    const campIdKey = pageType === "منى" ? "camp_mina_id" : "camp_arafa_id";
    const selectedCampIds = pageType === "منى" ? selectedMinaCampIds : selectedArafaCampIds;
    const pageCamps = camps.filter(c => c.page_type === pageType && selectedCampIds.has(c.id));
    const branding = { logoUrl, companyName, tagline, primaryColor, accentColor };
    const sections = pageCamps.map(camp => {
      const cp = passengers.filter(p => (p as any)[campIdKey] === camp.id);
      const isMale = camp.gender === "ذكر";
      return makeTwoLogoSectionHTML(`مخيم ${pageType} ${camp.name}`, isMale ? "رجال" : "نساء", renderNamesTable(cp, "اسم الحاج", primaryColor), branding);
    });
    return mkHTML(`مخيمات ${pageType}`, joinSections(sections), false, true);
  };

  const exportCampsXLSX = (pageType: "منى" | "عرفة") => {
    const campIdKey = pageType === "منى" ? "camp_mina_id" : "camp_arafa_id";
    const selectedCampIds = pageType === "منى" ? selectedMinaCampIds : selectedArafaCampIds;
    const pageCamps = camps.filter(c => c.page_type === pageType && selectedCampIds.has(c.id));
    const wb = XLSX.utils.book_new();
    const usedNames = new Set<string>();
    pageCamps.forEach(camp => {
      const cp = passengers.filter(p => (p as any)[campIdKey] === camp.id);
      const isMale = camp.gender === "ذكر";
      const half = Math.ceil(cp.length / 2);
      const col1 = cp.slice(0, half);
      const col2 = cp.slice(half);
      const maxRows = Math.max(col1.length, col2.length);
      const title = `مخيم ${pageType} ${camp.name} — ${isMale ? "رجال" : "نساء"}`;
      const aoa: any[][] = [[title], ["م", "اسم الحاج", "م", "اسم الحاج"]];
      for (let i = 0; i < maxRows; i++) {
        const p1 = col1[i], p2 = col2[i];
        aoa.push([p1 ? i + 1 : "", p1 ? (p1.short_ar || p1.name_ar) : "", p2 ? half + i + 1 : "", p2 ? (p2.short_ar || p2.name_ar) : ""]);
      }
      if (cp.length === 0) aoa.push(["", "لا يوجد مسافرون", "", ""]);
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = [{ wch: 4 }, { wch: 28 }, { wch: 4 }, { wch: 28 }];
      styleTitleRow(ws, 0, 4, primaryColor);
      styleHeaderRow(ws, 1, 4, primaryColor);
      freezeHeaderRow(ws, 2);
      let name = safeSheetName(camp.name);
      let n = name, i = 2;
      while (usedNames.has(n)) { n = safeSheetName(`${name} ${i++}`); }
      usedNames.add(n);
      XLSX.utils.book_append_sheet(wb, ws, n);
    });
    addSummarySheet(wb, XLSX, `تقرير مخيمات ${pageType}`, companyName, [
      ["إجمالي عدد المخيمات", pageCamps.length],
      ["إجمالي عدد الحجاج", passengers.filter(p => (p as any)[campIdKey]).length],
      ...pageCamps.map(c => [`${c.name} (${c.gender === "ذكر" ? "رجال" : "نساء"})`, passengers.filter(p => (p as any)[campIdKey] === c.id).length]),
    ]);
    XLSX.writeFile(wb, `تقرير_مخيمات_${pageType}.xlsx`);
  };

  // ============================================================
  // تقرير الفندق
  // ============================================================
  const getFilteredRooms = () => {
    let r = rooms.filter(rm => selectedFloors.has(floorKey(rm)));
    if (hotelPrintFilter === "type") r = r.filter(rm => rm.type === hotelPrintType);
    return r;
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
      return `<div style="margin-bottom:12px;break-inside:avoid">
        <div style="background:${bg};color:${clr};padding:6px 10px;border:1px solid ${clr}33;border-bottom:none;font-size:13px;font-weight:700;display:flex;justify-content:space-between;border-radius:4px 4px 0 0">
          <span>${room.type}</span><span>غرفة ${room.number}${room.floor ? ` (ط${room.floor})` : ""}</span>
        </div>
        <table style="margin:0">
          <tr><th style="text-align:center;width:24px;background:${primaryColor}">م</th><th style="background:${primaryColor}">الاسم</th></tr>
          ${rp.map((p, i) => `<tr><td style="text-align:center">${i + 1}</td><td>${p.short_ar || p.name_ar}</td></tr>`).join("")}
        </table>
      </div>`;
    };
    const body = `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
      <div>${col1.map(renderRoomBlock).join("")}</div>
      <div>${col2.map(renderRoomBlock).join("")}</div>
      <div>${col3.map(renderRoomBlock).join("")}</div>
    </div>`;
    const subtitle = hotelPrintFilter === "type" ? ` — ${hotelPrintType}` : "";
    return mkHTML(`تقرير الفندق${subtitle}`, body, true);
  };

  const exportHotelXLSX = () => {
    const filtered = getFilteredRooms();
    const floors = new Map<string, Room[]>();
    filtered.forEach(room => {
      const key = room.floor ? String(room.floor) : "بدون طابق";
      if (!floors.has(key)) floors.set(key, []);
      floors.get(key)!.push(room);
    });
    const floorKeys = [...floors.keys()].sort((a, b) => {
      if (a === "بدون طابق") return 1;
      if (b === "بدون طابق") return -1;
      return Number(a) - Number(b);
    });
    const wb = XLSX.utils.book_new();
    const usedNames = new Set<string>();
    floorKeys.forEach(key => {
      const floorRooms = floors.get(key)!;
      const guestCount = floorRooms.reduce((s, r) => s + passengers.filter(p => p.room_id === r.id).length, 0);
      const title = `${key === "بدون طابق" ? key : `الطابق ${key}`} — ${floorRooms.length} غرفة — ${guestCount} نزيل`;
      const aoa: any[][] = [[title], ["رقم الغرفة", "النوع", "م", "اسم الحاج", "الجنس", "طلب الحاج"]];
      floorRooms.forEach(room => {
        const rp = passengers.filter(p => p.room_id === room.id);
        rp.forEach((p, i) => aoa.push([room.number, room.type, i + 1, p.short_ar || p.name_ar, p.gender, `${p.services?.hotel_type} ${p.services?.hotel_view}`]));
        if (rp.length === 0) aoa.push([room.number, room.type, "", "لا يوجد مسافرون", "", ""]);
      });
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = [{ wch: 10 }, { wch: 10 }, { wch: 4 }, { wch: 30 }, { wch: 8 }, { wch: 16 }];
      styleTitleRow(ws, 0, 6, primaryColor);
      styleHeaderRow(ws, 1, 6, primaryColor);
      freezeHeaderRow(ws, 2);
      let name = safeSheetName(key === "بدون طابق" ? key : `الطابق ${key}`);
      let n = name, i = 2;
      while (usedNames.has(n)) { n = safeSheetName(`${name} ${i++}`); }
      usedNames.add(n);
      XLSX.utils.book_append_sheet(wb, ws, n);
    });
    const subtitle = hotelPrintFilter === "type" ? ` — ${hotelPrintType}` : "";
    addSummarySheet(wb, XLSX, `تقرير الفندق${subtitle}`, companyName, [
      ["إجمالي عدد الغرف", filtered.length],
      ["إجمالي عدد النزلاء", passengers.filter(p => p.room_id && filtered.some(r => r.id === p.room_id)).length],
      ...ROOM_TYPES.map(t => [`غرف ${t}`, filtered.filter(r => r.type === t).length]),
    ]);
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
  // اختيار عناصر التقرير (طباعة عنصر واحد أو أكثر بدل الكل)
  // ============================================================
  const SelectionPanel = ({
    title, items, selected, setSelected, panelKey, alwaysOpen
  }: { title: string; items: { id: number | string; label: string }[]; selected: Set<any>; setSelected: (s: Set<any>) => void; panelKey: string; alwaysOpen?: boolean }) => {
    const allSelected = items.length > 0 && items.every(it => selected.has(it.id));
    const open = alwaysOpen || openPanels.has(panelKey);
    return (
      <div style={{ border: "0.5px solid #e5e5e5", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
        <div onClick={() => !alwaysOpen && togglePanel(panelKey)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: alwaysOpen ? "default" : "pointer", marginBottom: open ? 8 : 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {!alwaysOpen && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", color: "var(--text-muted)" }}><polyline points="9 18 15 12 9 6"/></svg>}
            <div style={{ fontSize: 12, fontWeight: 500 }}>{title}</div>
            {!open && <div style={{ fontSize: 10, color: "var(--text-muted)" }}>({allSelected ? "الكل" : `${[...selected].length} من ${items.length}`})</div>}
          </div>
          {open && (
            <div onClick={e => { e.stopPropagation(); setSelected(allSelected ? new Set() : new Set(items.map(i => i.id))); }} style={{ fontSize: 11, color: "var(--em7)", cursor: "pointer" }}>
              {allSelected ? "إلغاء الكل" : "تحديد الكل"}
            </div>
          )}
        </div>
        {open && (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {items.map(it => {
                const checked = selected.has(it.id);
                return (
                  <div key={it.id} onClick={() => {
                    const next = new Set(selected);
                    if (next.has(it.id)) next.delete(it.id); else next.add(it.id);
                    setSelected(next);
                  }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 8, border: `1.5px solid ${checked ? "var(--em7)" : "var(--border)"}`, background: checked ? "var(--success-bg)" : "transparent", cursor: "pointer", fontSize: 12, color: checked ? "var(--em7)" : "var(--text-muted)" }}>
                    <div style={{ width: 14, height: 14, borderRadius: 4, background: checked ? "var(--em7)" : "var(--bg-card)", border: `1.5px solid ${checked ? "var(--em7)" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {checked && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                    {it.label}
                  </div>
                );
              })}
            </div>
            {items.length > 0 && !allSelected && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>سيشمل التقرير فقط العناصر المحددة ({[...selected].length} من {items.length})</div>}
          </>
        )}
      </div>
    );
  };


  // ============================================================
  // طباعة المستندات (جواز / بطاقة / تصريح / تذكرة)
  // ============================================================
  const DOC_TYPES: { key: "passport_url" | "national_id_url" | "hajj_permit_url" | "flight_ticket_url"; label: string }[] = [
    { key: "passport_url", label: "جواز السفر" },
    { key: "national_id_url", label: "البطاقة الشخصية" },
    { key: "hajj_permit_url", label: "التصريح" },
    { key: "flight_ticket_url", label: "تذكرة الطيران" },
  ];
  const docTypeLabel = DOC_TYPES.find(d => d.key === docType)?.label || "";
  const docList = passengers.filter(p => (p as any)[docType]);
  const docSelectedIds = docSelected[docType] || new Set<number>();
  const toggleDocSelected = (id: number) => setDocSelected(prev => {
    const cur = new Set(prev[docType] || []);
    if (cur.has(id)) cur.delete(id); else cur.add(id);
    return { ...prev, [docType]: cur };
  });
  const printDocuments = () => {
    const toPrint = docList.filter(p => docSelectedIds.has(p.id));
    if (!toPrint.length) { showAlert("warning", "يرجى تحديد حاج واحد على الأقل"); return; }
    const cols = docPerPage === 4 ? 2 : 1;
    const rows = docPerPage === 1 ? 1 : 2;
    const pages: Passenger[][] = [];
    for (let i = 0; i < toPrint.length; i += docPerPage) pages.push(toPrint.slice(i, i + docPerPage));
    const pagesHTML = pages.map(pg => `
      <div style="page-break-after:always;height:100vh;display:grid;grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr);gap:10px;padding:10px;box-sizing:border-box">
        ${pg.map(p => `
          <div style="border:1px solid #ddd;border-radius:8px;overflow:hidden;display:flex;flex-direction:column">
            <div style="background:${primaryColor};color:#fff;padding:6px 12px;font-size:13px;font-weight:700">${p.short_ar || p.name_ar} — ${docTypeLabel}</div>
            <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:6px;min-height:0">
              <img src="${(p as any)[docType]}" style="max-width:100%;max-height:100%;object-fit:contain" />
            </div>
          </div>`).join("")}
      </div>`).join("");
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<html><head><title>${docTypeLabel}</title><style>body{font-family:Tajawal,Arial;margin:0;direction:rtl}@media print{@page{margin:8mm}}</style></head><body>${pagesHTML}<script>window.print();<\/script></body></html>`);
    w.document.close();
  };


  // ============================================================
  // قائمة التقارير
  // ============================================================
  const reports = [
    { id: "passengers_report", name: "تقرير الحجاج", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`, desc: "كشف بيانات الحجاج", color: "#2A9D8F" },
    { id: "flight", name: "تقرير الطيران", icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>`, desc: "خطوط الطيران والرحلات", color: "#0C447C" },
    { id: "buses", name: "تقرير الباصات", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="15" cy="18" r="2"/></svg>`, desc: "توزيع المسافرين على الباصات", color: "#3F51B5" },
    { id: "mina", name: "تقرير منى", icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/></svg>`, desc: "مخيمات منى", color: "#5C7C2E" },
    { id: "arafa", name: "تقرير عرفة", icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/></svg>`, desc: "مخيمات عرفة", color: "#B5651D" },
    { id: "hotel", name: "تقرير الفندق", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M10 6h4"/></svg>`, desc: "توزيع الغرف", color: "#8B3A6B" },
    { id: "documents", name: "طباعة المستندات", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/><path d="M8 16s1-2 4-2 4 2 4 2"/></svg>`, desc: "طباعة جواز / بطاقة / تصريح / تذكرة", color: "#7D1F3C" },
    { id: "whatsapp", name: "رسائل WhatsApp", icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`, desc: "إرسال رسائل مخصصة للحجاج", color: "#25D366" },
  ];

  // ============================================================
  // الـ UI
  // ============================================================
  return (
    <div style={{ padding: 14, overflowY: "auto", height: "100%" }}>
      <AlertModal alert={alertState} onClose={() => showAlert(null)} />
      {!activeReport ? (
        <>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>اختر التقرير</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {reports.map(r => (
              <div key={r.id} onClick={() => { setActiveReport(r.id); setFlightSubReport(null); }}
                style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, padding: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, background: "var(--bg-card)" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--bg-2)"}
                onMouseLeave={e => e.currentTarget.style.background = "white"}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: r.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} dangerouslySetInnerHTML={{ __html: r.icon }} />
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
        <div style={{ textAlign: "right" }}>
          <button onClick={() => setActiveReport(null)} style={{ ...btnS(), display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            رجوع
          </button>

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
                onPDF={() => printInPage(getPassengersHTML())}
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
                            <tr style={{ background: primaryColor, color: "#fff" }}>
                              {["S.N.", "FULL NAME", "NAT.", "PASSPORT NO.", "TEL. NO.", "GENDER", "CLASS"].map(h =>
                                <th key={h} style={{ padding: "8px 10px", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {passengers.filter(p => p.services?.flight !== "بدون").map((p, i) => (
                              <tr key={p.id} style={{ background: i % 2 === 0 ? "var(--paper)" : "rgba(212,160,23,0.08)" }}>
                                <td style={{ padding: "6px 10px", border: "0.5px solid rgba(0,0,0,0.06)" }}>{i + 1}</td>
                                <td style={{ padding: "6px 10px", border: "0.5px solid rgba(0,0,0,0.06)", fontWeight: 500 }}>{p.name_en}</td>
                                <td style={{ padding: "6px 10px", border: "0.5px solid rgba(0,0,0,0.06)" }}>{natCode(p.nat)}</td>
                                <td style={{ padding: "6px 10px", border: "0.5px solid rgba(0,0,0,0.06)" }}>{p.passport}</td>
                                <td style={{ padding: "6px 10px", border: "0.5px solid rgba(0,0,0,0.06)" }}>{p.phone || "—"}</td>
                                <td style={{ padding: "6px 10px", border: "0.5px solid rgba(0,0,0,0.06)" }}>{p.gender === "ذكر" ? "MR." : "MRS."}</td>
                                <td style={{ padding: "6px 10px", border: "0.5px solid rgba(0,0,0,0.06)" }}>{wantsFirstClass(p) ? "⭐ FIRST" : ""}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <ExportButtons
                        onExcel={exportAirlineXLSX}
                        onPDF={() => printInPage(getAirlineHTML())}
                        onPrint={() => printInPage(getAirlineHTML())}
                      />
                    </>
                  )}

                  {/* كل رحلة */}
                  {flightSubReport === "per_flight" && (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg> تقرير كل رحلة</div>
                      {!loading && flights.length > 0 && (
                        <SelectionPanel
                          title="الرحلات المطلوبة في التقرير"
                          items={flights.map(f => ({ id: f.id, label: `${f.name} — ${f.type}` }))}
                          selected={selectedFlightIds}
                          panelKey="flights"
                          alwaysOpen
                          setSelected={(s) => setSelectedFlightIds(s as Set<number>)}
                        />
                      )}
                      {loading ? <div style={{ textAlign: "center", color: "var(--text-muted)" }}>جاري التحميل...</div> :
                        flights.length === 0 ? <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem" }}>لا يوجد رحلات</div> :
                        flights.map((flight, idx) => {
                          const fp = passengersOfFlight(flight);
                          const flightColor = ICON_COLOR_CYCLE[idx % ICON_COLOR_CYCLE.length];
                          const isOpen = expandedItems.has(flight.id);
                          return (
                            <div key={flight.id} style={{ border: "0.5px solid #e5e5e5", borderRadius: 10, marginBottom: 12, overflow: "hidden" }}>
                              <div onClick={() => toggleExpandedItem(flight.id)} style={{ background: "var(--male-bg)", padding: "10px 14px", borderBottom: isOpen ? "0.5px solid #dce8f8" : "none", display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", color: "var(--text-muted)", marginTop: 9, flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
                                <div style={{ width: 30, height: 30, borderRadius: 8, background: flightColor, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>
                                </div>
                                <div>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--info)" }}>{flight.name} — {flight.type}</div>
                                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
                                    <span style={{display:"flex",alignItems:"center",gap:4}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg> {flight.airline}</span>
                                    <span style={{display:"flex",alignItems:"center",gap:4}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> {flight.date}</span>
                                    <span>⏰ {flight.time}</span>
                                    <span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg> {flight.from_airport} → {flight.to_airport}</span>
                                    <span style={{ color: "var(--info)", fontWeight: 500 }}>{fp.length} حاج</span>
                                  </div>
                                </div>
                              </div>
                              {isOpen && fp.length > 0 && (
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                                  <thead>
                                    <tr style={{ background: primaryColor, color: "#fff" }}>
                                      {["م", "اسم الحاج / الحاجة", "الجنسية", "رقم الجواز", "التليفون", "الجنس", "الدرجة"].map(h =>
                                        <th key={h} style={{ padding: "5px 10px", textAlign: "right" }}>{h}</th>
                                      )}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {fp.map((p, i) => (
                                      <tr key={p.id} style={{ background: i % 2 === 0 ? "var(--paper)" : "rgba(212,160,23,0.08)" }}>
                                        <td style={{ padding: "5px 10px", border: "0.5px solid rgba(0,0,0,0.06)", textAlign: "center" }}>{i + 1}</td>
                                        <td style={{ padding: "5px 10px", border: "0.5px solid rgba(0,0,0,0.06)" }}>{p.short_ar || p.name_ar}</td>
                                        <td style={{ padding: "5px 10px", border: "0.5px solid rgba(0,0,0,0.06)" }}>{p.nat}</td>
                                        <td style={{ padding: "5px 10px", border: "0.5px solid rgba(0,0,0,0.06)" }}>{p.passport}</td>
                                        <td style={{ padding: "5px 10px", border: "0.5px solid rgba(0,0,0,0.06)" }}>{p.phone || "—"}</td>
                                        <td style={{ padding: "5px 10px", border: "0.5px solid rgba(0,0,0,0.06)" }}>{p.gender}</td>
                                        <td style={{ padding: "5px 10px", border: "0.5px solid rgba(0,0,0,0.06)" }}>{wantsFirstClass(p) ? "درجة أولى" : "اقتصادية"}</td>
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
                        onPDF={() => printInPage(getPerFlightHTML())}
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
                  <SelectionPanel
                    title="الباصات المطلوبة في التقرير"
                    panelKey="buses"
                    alwaysOpen
                    items={buses.map(b => ({ id: b.id, label: `${b.name}${b.type === "VIP" ? " ⭐" : ""}` }))}
                    selected={selectedBusIds}
                    setSelected={(s) => setSelectedBusIds(s as Set<number>)}
                  />
                  {buses.map((bus, idx) => {
                    const bp = passengers.filter(p => p.bus_id === bus.id);
                    const isOpen = expandedItems.has(bus.id);
                    const busColor = bus.type === "VIP" ? VIP_ICON_COLOR : ICON_COLOR_CYCLE[idx % ICON_COLOR_CYCLE.length];
                    return (
                      <div key={bus.id} style={{ border: "0.5px solid #e5e5e5", borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
                        <div onClick={() => toggleExpandedItem(bus.id)} style={{ padding: "8px 12px", background: bus.type === "VIP" ? "var(--warning-bg)" : "var(--bg-2)", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", color: "var(--text-muted)" }}><polyline points="9 18 15 12 9 6"/></svg>
                            <div style={{ width: 28, height: 28, borderRadius: 8, background: busColor, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="15" cy="18" r="2"/></svg>
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{bus.name} {bus.type === "VIP" && <span style={{ fontSize: 10, background: "var(--warning-bg)", color: "var(--warning)", padding: "1px 6px", borderRadius: 99 }}>VIP</span>}</div>
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{bp.length} مسافر</div>
                        </div>
                        {isOpen && bp.length > 0 && (
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                            <thead><tr style={{ background: primaryColor, color: "#fff" }}>
                              <th style={{ padding: "5px 10px", textAlign: "center", width: 30 }}>م</th>
                              <th style={{ padding: "5px 10px", textAlign: "right" }}>اسم الحاج / الحاجة</th>
                            </tr></thead>
                            <tbody>{bp.map((p, i) =>
                              <tr key={p.id} style={{ background: i % 2 === 0 ? "var(--paper)" : "rgba(212,160,23,0.08)" }}>
                                <td style={{ padding: "5px 10px", border: "0.5px solid rgba(0,0,0,0.06)", textAlign: "center", color: "var(--text-muted)" }}>{i + 1}</td>
                                <td style={{ padding: "5px 10px", border: "0.5px solid rgba(0,0,0,0.06)" }}>{p.short_ar || p.name_ar}</td>
                              </tr>
                            )}</tbody>
                          </table>
                        )}
                      </div>
                    );
                  })}
                  <ExportButtons
                    onExcel={exportBusesXLSX}
                    onPDF={() => printInPage(getBusesHTML())}
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
                  <SelectionPanel
                    title="مخيمات منى المطلوبة في التقرير"
                    panelKey="mina"
                    alwaysOpen
                    items={camps.filter(c => c.page_type === "منى").map(c => ({ id: c.id, label: `${c.name} (${c.gender === "ذكر" ? "رجال" : "نساء"})` }))}
                    selected={selectedMinaCampIds}
                    setSelected={(s) => setSelectedMinaCampIds(s as Set<number>)}
                  />
                  {camps.filter(c => c.page_type === "منى").map(camp => {
                    const cp = passengers.filter(p => p.camp_mina_id === camp.id);
                    const isMale = camp.gender === "ذكر";
                    const isOpen = expandedItems.has(camp.id);
                    const genderCamps = camps.filter(c => c.page_type === "منى" && c.gender === camp.gender);
                    const campIdx = genderCamps.findIndex(c => c.id === camp.id);
                    const campColor = ICON_COLOR_CYCLE[campIdx % ICON_COLOR_CYCLE.length];
                    return (
                      <div key={camp.id} style={{ border: `0.5px solid ${camp.type === "خاص" ? "var(--accent)" : "var(--border)"}`, borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
                        <div onClick={() => toggleExpandedItem(camp.id)} style={{ padding: "8px 12px", background: camp.type === "خاص" ? "var(--warning-bg)" : "var(--bg-2)", display: "flex", justifyContent: "space-between", cursor: "pointer" }}>
                          <div style={{ fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", color: "var(--text-muted)" }}><polyline points="9 18 15 12 9 6"/></svg>
                            <div style={{ width: 28, height: 28, borderRadius: 8, background: campColor, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/></svg>
                            </div>
                            مخيم {camp.name}
                            <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: isMale ? "var(--male-bg)" : "var(--female-bg)", color: isMale ? "var(--info)" : "var(--female-fg)" }}>{isMale ? "رجال" : "نساء"}</span>
                            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>({camp.type}) · {cp.length} مسافر</span>
                          </div>
                        </div>
                        {isOpen && cp.length > 0 && (
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                            <thead><tr style={{ background: primaryColor, color: "#fff" }}>
                              <th style={{ padding: "5px 10px", textAlign: "center", width: 30 }}>م</th>
                              <th style={{ padding: "5px 10px", textAlign: "right" }}>الاسم</th>
                              <th style={{ padding: "5px 10px", textAlign: "right" }}>الجنسية</th>
                            </tr></thead>
                            <tbody>{cp.map((p, i) =>
                              <tr key={p.id} style={{ background: i % 2 === 0 ? "var(--paper)" : "rgba(212,160,23,0.08)" }}>
                                <td style={{ padding: "5px 10px", border: "0.5px solid rgba(0,0,0,0.06)", textAlign: "center", color: "var(--text-muted)" }}>{i + 1}</td>
                                <td style={{ padding: "5px 10px", border: "0.5px solid rgba(0,0,0,0.06)" }}>{p.short_ar || p.name_ar}</td>
                                <td style={{ padding: "5px 10px", border: "0.5px solid rgba(0,0,0,0.06)" }}>{p.nat}</td>
                              </tr>
                            )}</tbody>
                          </table>
                        )}
                      </div>
                    );
                  })}
                  <ExportButtons
                    onExcel={() => exportCampsXLSX("منى")}
                    onPDF={() => printInPage(getCampsHTML("منى"))}
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
                  <SelectionPanel
                    title="مخيمات عرفة المطلوبة في التقرير"
                    panelKey="arafa"
                    alwaysOpen
                    items={camps.filter(c => c.page_type === "عرفة").map(c => ({ id: c.id, label: `${c.name} (${c.gender === "ذكر" ? "رجال" : "نساء"})` }))}
                    selected={selectedArafaCampIds}
                    setSelected={(s) => setSelectedArafaCampIds(s as Set<number>)}
                  />
                  {camps.filter(c => c.page_type === "عرفة").map(camp => {
                    const cp = passengers.filter(p => p.camp_arafa_id === camp.id);
                    const isMale = camp.gender === "ذكر";
                    const isOpen = expandedItems.has(camp.id);
                    const genderCamps = camps.filter(c => c.page_type === "عرفة" && c.gender === camp.gender);
                    const campIdx = genderCamps.findIndex(c => c.id === camp.id);
                    const campColor = ICON_COLOR_CYCLE[campIdx % ICON_COLOR_CYCLE.length];
                    return (
                      <div key={camp.id} style={{ border: `0.5px solid ${camp.type === "خاص" ? "var(--accent)" : "var(--border)"}`, borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
                        <div onClick={() => toggleExpandedItem(camp.id)} style={{ padding: "8px 12px", background: camp.type === "خاص" ? "var(--warning-bg)" : "var(--bg-2)", display: "flex", justifyContent: "space-between", cursor: "pointer" }}>
                          <div style={{ fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", color: "var(--text-muted)" }}><polyline points="9 18 15 12 9 6"/></svg>
                            <div style={{ width: 28, height: 28, borderRadius: 8, background: campColor, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>
                            </div>
                            مخيم {camp.name}
                            <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: isMale ? "var(--male-bg)" : "var(--female-bg)", color: isMale ? "var(--info)" : "var(--female-fg)" }}>{isMale ? "رجال" : "نساء"}</span>
                            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>({camp.type}) · {cp.length} مسافر</span>
                          </div>
                        </div>
                        {isOpen && cp.length > 0 && (
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                            <thead><tr style={{ background: primaryColor, color: "#fff" }}>
                              <th style={{ padding: "5px 10px", textAlign: "center", width: 30 }}>م</th>
                              <th style={{ padding: "5px 10px", textAlign: "right" }}>الاسم</th>
                              <th style={{ padding: "5px 10px", textAlign: "right" }}>الجنسية</th>
                            </tr></thead>
                            <tbody>{cp.map((p, i) =>
                              <tr key={p.id} style={{ background: i % 2 === 0 ? "var(--paper)" : "rgba(212,160,23,0.08)" }}>
                                <td style={{ padding: "5px 10px", border: "0.5px solid rgba(0,0,0,0.06)", textAlign: "center", color: "var(--text-muted)" }}>{i + 1}</td>
                                <td style={{ padding: "5px 10px", border: "0.5px solid rgba(0,0,0,0.06)" }}>{p.short_ar || p.name_ar}</td>
                                <td style={{ padding: "5px 10px", border: "0.5px solid rgba(0,0,0,0.06)" }}>{p.nat}</td>
                              </tr>
                            )}</tbody>
                          </table>
                        )}
                      </div>
                    );
                  })}
                  <ExportButtons
                    onExcel={() => exportCampsXLSX("عرفة")}
                    onPDF={() => printInPage(getCampsHTML("عرفة"))}
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
                  {[["all", "كل الغرف"], ["type", "نوع معين"]].map(([val, label]) => (
                    <div key={val} onClick={() => setHotelPrintFilter(val as any)}
                      style={{ flex: 1, minWidth: 80, padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${hotelPrintFilter === val ? "var(--info)" : "var(--border)"}`, background: hotelPrintFilter === val ? "var(--male-bg)" : "transparent", cursor: "pointer", textAlign: "center", fontSize: 12, color: hotelPrintFilter === val ? "var(--info)" : "var(--text-muted)" }}>
                      {label}
                    </div>
                  ))}
                </div>
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

              <SelectionPanel
                title="الأدوار المطلوبة في التقرير"
                panelKey="hotel"
                alwaysOpen
                items={floorItems}
                selected={selectedFloors}
                setSelected={(s) => setSelectedFloors(s as Set<string>)}
              />

              {loading ? <div style={{ textAlign: "center", color: "var(--text-muted)" }}>جاري التحميل...</div> :
                rooms.length === 0 ? <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>لا يوجد غرف</div> :
                <>
                  {getFilteredRooms().map(room => {
                    const rp = passengers.filter(p => p.room_id === room.id);
                    const [typeBg, typeClr] = ROOM_COLORS[room.type] || ["var(--bg-2)", "var(--text)"];
                    const isOpen = expandedItems.has(room.id);
                    return (
                      <div key={room.id} style={{ border: "0.5px solid #e5e5e5", borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
                        <div onClick={() => toggleExpandedItem(room.id)} style={{ padding: "7px 12px", background: "var(--bg-2)", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", color: "var(--text-muted)" }}><polyline points="9 18 15 12 9 6"/></svg>
                          <div style={{ width: 28, height: 28, borderRadius: 8, background: ROOM_ICON_COLORS[room.type] || "#999", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>
                          </div>
                          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99, background: typeBg, color: typeClr }}>{room.type}</span>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>غرفة {room.number} {room.floor && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>ط{room.floor}</span>}</div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginRight: "auto" }}>{rp.length} مسافر</div>
                        </div>
                        {isOpen && rp.length > 0 && (
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                            <thead><tr style={{ background: primaryColor, color: "#fff" }}>
                              <th style={{ padding: "5px 10px", textAlign: "center", width: 30 }}>م</th>
                              <th style={{ padding: "5px 10px", textAlign: "right" }}>الاسم</th>
                              <th style={{ padding: "5px 10px", textAlign: "right" }}>الجنس</th>
                              <th style={{ padding: "5px 10px", textAlign: "right" }}>طلب</th>
                            </tr></thead>
                            <tbody>{rp.map((p, i) =>
                              <tr key={p.id} style={{ background: i % 2 === 0 ? "var(--paper)" : "rgba(212,160,23,0.08)" }}>
                                <td style={{ padding: "5px 10px", border: "0.5px solid rgba(0,0,0,0.06)", textAlign: "center", color: "var(--text-muted)" }}>{i + 1}</td>
                                <td style={{ padding: "5px 10px", border: "0.5px solid rgba(0,0,0,0.06)" }}>{p.short_ar || p.name_ar}</td>
                                <td style={{ padding: "5px 10px", border: "0.5px solid rgba(0,0,0,0.06)" }}>{p.gender}</td>
                                <td style={{ padding: "5px 10px", border: "0.5px solid rgba(0,0,0,0.06)" }}>{p.services?.hotel_type} {p.services?.hotel_view}</td>
                              </tr>
                            )}</tbody>
                          </table>
                        )}
                      </div>
                    );
                  })}
                  <ExportButtons
                    onExcel={exportHotelXLSX}
                    onPDF={() => printInPage(getHotelHTML())}
                    onPrint={() => printInPage(getHotelHTML())}
                  />
                </>
              }
            </>
          )}

          {/* ===== طباعة المستندات ===== */}
          {activeReport === "documents" && (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>طباعة المستندات</div>

              {/* نوع المستند */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                {DOC_TYPES.map(d => (
                  <div key={d.key} onClick={() => setDocType(d.key)}
                    style={{ flex: 1, minWidth: 90, padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${docType === d.key ? "var(--em7)" : "var(--border)"}`, background: docType === d.key ? "var(--success-bg)" : "transparent", cursor: "pointer", textAlign: "center", fontSize: 12, color: docType === d.key ? "var(--em7)" : "var(--text-muted)" }}>
                    {d.label} ({passengers.filter(p => (p as any)[d.key]).length})
                  </div>
                ))}
              </div>

              {/* عدد المستندات في الصفحة */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>عدد المستندات في الصفحة:</div>
                {[1, 2, 4].map(n => (
                  <div key={n} onClick={() => setDocPerPage(n as 1 | 2 | 4)}
                    style={{ padding: "6px 16px", borderRadius: 8, border: `1.5px solid ${docPerPage === n ? "var(--info)" : "var(--border)"}`, background: docPerPage === n ? "var(--male-bg)" : "transparent", cursor: "pointer", fontSize: 12, fontWeight: 600, color: docPerPage === n ? "var(--info)" : "var(--text-muted)" }}>
                    {n}
                  </div>
                ))}
              </div>

              {docList.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>لا يوجد حجاج عندهم {docTypeLabel} مرفوع</div>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{docTypeLabel} ({docList.length})</div>
                    <div onClick={() => setDocSelected(prev => ({ ...prev, [docType]: docSelectedIds.size === docList.length ? new Set() : new Set(docList.map(p => p.id)) }))} style={{ fontSize: 11, color: "var(--em7)", cursor: "pointer" }}>
                      {docSelectedIds.size === docList.length ? "إلغاء الكل" : "تحديد الكل"}
                    </div>
                  </div>
                  <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
                    {docList.map((p, i) => (
                      <div key={p.id} onClick={() => toggleDocSelected(p.id)}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderBottom: "0.5px solid var(--line)", cursor: "pointer", background: docSelectedIds.has(p.id) ? "rgba(125,31,60,0.05)" : "transparent", transition: "background 0.1s" }}>
                        {/* Checkbox */}
                        <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${docSelectedIds.has(p.id) ? "var(--em7)" : "var(--line)"}`, background: docSelectedIds.has(p.id) ? "var(--em7)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.1s" }}>
                          {docSelectedIds.has(p.id) && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
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
                  <button onClick={printDocuments} style={{ width: "100%", padding: "10px 0", borderRadius: 10, background: "var(--em7)", color: "var(--g3)", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                    طباعة ({docSelectedIds.size})
                  </button>
                </>
              )}

              {passengers.filter(p => !(p as any)[docType]).length > 0 && (
                <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--warning-bg)", borderRadius: 10, fontSize: 11, color: "var(--warning)" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ marginLeft: 6 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  {passengers.filter(p => !(p as any)[docType]).length} حاج مش عندهم {docTypeLabel} مرفوع
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
                      .replace("{الرحلة}", flightNameFor(passengers[0]))
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
                    if (!waTestPhone) { showAlert("warning", "يرجى إدخال رقم الهاتف"); return; }
                    if (!waToken || !waPhoneId) { showAlert("warning", "يرجى ضبط إعدادات API أولًا"); return; }
                    if (!passengers[0]) { showAlert("warning", "لا يوجد حجاج في القائمة"); return; }
                    const p = passengers[0];
                    const text = waTemplate
                      .replace("{الاسم}", p.short_ar || p.name_ar)
                      .replace("{الباص}", buses.find(b => b.id === (p as any).bus_id)?.name || "—")
                      .replace("{الرحلة}", flightNameFor(p))
                      .replace("{الغرفة}", rooms.find(r => r.id === (p as any).room_id)?.number || "—")
                      .replace("{منى}", camps.find(c => c.id === (p as any).camp_mina_id)?.name || "—")
                      .replace("{عرفة}", camps.find(c => c.id === (p as any).camp_arafa_id)?.name || "—");
                    const res = await fetch(`https://graph.facebook.com/v18.0/${waPhoneId}/messages`, {
                      method: "POST",
                      headers: { "Authorization": `Bearer ${waToken}`, "Content-Type": "application/json" },
                      body: JSON.stringify({ messaging_product: "whatsapp", to: waTestPhone.replace(/\D/g, ""), type: "text", text: { body: text } })
                    });
                    showAlert(res.ok ? "success" : "error", res.ok ? "تم الإرسال التجريبي بنجاح" : "فشل الإرسال — يرجى التحقق من إعدادات API");
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
                if (!sendList.length) { showAlert("warning", "لا يوجد حجاج محددون أو لديهم رقم هاتف"); return; }
                if (!waToken || !waPhoneId) { showAlert("warning", "يرجى ضبط إعدادات API أولًا"); return; }
                if (!confirm(`سيتم إرسال ${sendList.length} رسالة — هل أنت متأكد؟`)) return;
                setWaSending(true);
                setWaResults(sendList.map(p => ({ name: p.short_ar || p.name_ar, phone: p.phone, status: "pending" as const })));
                for (let i = 0; i < sendList.length; i++) {
                  const p = sendList[i];
                  try {
                    const text = waTemplate
                      .replace("{الاسم}", p.short_ar || p.name_ar)
                      .replace("{الباص}", buses.find(b => b.id === (p as any).bus_id)?.name || "—")
                      .replace("{الرحلة}", flightNameFor(p))
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
                    <span style={{ color: "var(--text-muted)" }}>⏳ {waResults.filter(r => r.
