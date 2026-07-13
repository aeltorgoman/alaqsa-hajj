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
  const passengers = [...rawPassengers].sort((a, b) => ((a.sort_order ?? 0) - (b.sort_order ?? 0)));
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
  // ألوان التقارير المطبوعة = لون الشركة الثابت من الإعدادات (مستقل عن ثيم الواجهة)
  // بحيث يثبّت كل عميل/شركة لونه الخاص في المطبوعات بصرف النظر عن الثيم الذي يستخدمه الموظف على الشاشة
  const primaryColor = config.color_primary || "#6B1F3A";
  const accentColor = config.color_accent || "#0C447C";
  const mkHTML = (title: string, body: string, landscape = false, noHeader = false, patternOpacity?: number) =>
    makeHTML(title, body, landscape, logoUrl, companyName, tagline, primaryColor, accentColor, noHeader, patternOpacity);

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
    if (resetKey !== undefined) { const t = setTimeout(() => setActiveReport(null), 0); return () => clearTimeout(t); }
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
  const [docPersonFilter, setDocPersonFilter] = useState<"all" | "hajj" | "admin">("all");

  /* ─── مطبوعات الشنط ─── */
  const [stkFilter, setStkFilter] = useState<"all" | "bus" | "room" | "one">("all");
  const [stkBusId, setStkBusId] = useState<number | null>(null);
  const [stkRoomId, setStkRoomId] = useState<number | null>(null);
  // @ts-ignore
  const [stkPassId, setStkPassId] = useState<number | null>(null);
  const [stkTypes, setStkTypes] = useState({ sticker: true, hand_tag: true, long_tag: true });
  // @ts-ignore — مستخدم داخل IIFE في JSX
  const [stkDrawerOpen, setStkDrawerOpen] = useState(false);
  // @ts-ignore — مستخدم داخل IIFE في JSX
  const [stkSearch, setStkSearch] = useState("");
  // @ts-ignore — مستخدم داخل IIFE في JSX
  const [stkSelected, setStkSelected] = useState<Set<number>>(() => new Set());
  const [printDates, setPrintDates] = useState<Record<number, string>>(() => {
    try { return JSON.parse(localStorage.getItem("stk_print_dates") || "{}"); } catch { return {}; }
  });

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
    { key: "bus_name", label: "رقم الباص", get: (p: Passenger) => buses.find(b => b.id === p.bus_id)?.name || "" },
    { key: "flight", label: "الطيران", get: (p: Passenger) => p.services?.flight },
    { key: "flight_dep", label: "رحلة الذهاب", get: (p: Passenger) => flights.find(f => f.id === p.flight_id)?.name || "" },
    { key: "flight_ret", label: "رحلة الإياب", get: (p: Passenger) => flights.find(f => f.id === p.return_flight_id)?.name || "" },
    { key: "hotel_type", label: "نوع الغرفة", get: (p: Passenger) => p.services?.hotel_type },
    { key: "hotel_view", label: "إطلالة الغرفة", get: (p: Passenger) => p.services?.hotel_view },
    { key: "room_number", label: "رقم الغرفة", get: (p: Passenger) => rooms.find(r => r.id === p.room_id)?.number || "" },
    { key: "camp_mina", label: "منى (نوع)", get: (p: Passenger) => p.services?.camp_mina },
    { key: "camp_mina_name", label: "مخيم منى", get: (p: Passenger) => camps.find(c => c.id === p.camp_mina_id)?.name || "" },
    { key: "camp_arafa", label: "عرفة (نوع)", get: (p: Passenger) => p.services?.camp_arafa },
    { key: "camp_arafa_name", label: "مخيم عرفة", get: (p: Passenger) => camps.find(c => c.id === p.camp_arafa_id)?.name || "" },
  ];
  const [selectedCols, setSelectedCols] = useState<string[]>(ALL_COLS.map(c => c.key));
  const toggleCol = (key: string) => setSelectedCols(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  const toggleAll = () => setSelectedCols(prev => prev.length === ALL_COLS.length ? [] : ALL_COLS.map(c => c.key));
  const [filterGender, setFilterGender] = useState<string>("الكل");
  const [filterNat, setFilterNat] = useState<string>("الكل");
  const nats = ["الكل", ...Array.from(new Set(passengers.map(p => p.nat).filter(Boolean)))];
  const filteredPassengers = passengers.filter(p =>
    (filterGender === "الكل" || p.gender === filterGender) &&
    (filterNat === "الكل" || p.nat === filterNat)
  );
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
        const validCamps = (c as Camp[]).filter(x => x.type || passengers.some(p => p.camp_mina_id === x.id || p.camp_arafa_id === x.id));
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
    const rows = filteredPassengers.map((p, i) =>
      `<tr><td style="text-align:center">${i + 1}</td>${activeCols.map(c => `<td>${c.get(p) || "—"}</td>`).join("")}</tr>`
    ).join("");
    const body = `<table style="width:100%;border-collapse:collapse;table-layout:auto"><tr><th style="text-align:center;width:25pt;background:${primaryColor};color:#fff;padding:5pt 4pt;font-size:9pt">م</th>${activeCols.map(c => `<th style="background:${primaryColor};color:#fff;padding:5pt 6pt;font-size:9pt;text-align:right">${c.label}</th>`).join("")}</tr>${rows}</table>`;
    return mkHTML("كشف الحجاج", body, activeCols.length > 5);
  };

  const exportPassengersXLSX = () => {
    const headers = ["م", ...activeCols.map(c => c.label)];
    const rows = filteredPassengers.map((p, i) => [i + 1, ...activeCols.map(c => c.get(p) || "")]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = [{ wch: 4 }, ...activeCols.map(c => ({ wch: Math.max(c.label.length + 2, 15) }))];
    freezeHeaderRow(ws);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الحجاج");
    addSummarySheet(wb, XLSX, "كشف الحجاج", companyName, [
      ["إجمالي عدد الحجاج", filteredPassengers.length],
      ["عدد الرجال", filteredPassengers.filter(p => p.gender === "ذكر").length],
      ["عدد النساء", filteredPassengers.filter(p => p.gender === "أنثى").length],
      ["عدد الأعمدة المعروضة", activeCols.length],
    ]);
    XLSX.writeFile(wb, "تقرير_الحجاج.xlsx");
  };

  // ============================================================
  // تقرير الطيران — خطوط الطيران (airline list)
  // ============================================================
  const getAirlineHTML = () => {
    const adminsWithFlight = passengers.filter(p => (p.passenger_type && p.passenger_type !== "حاج") && (wantsFirstClass(p) || p.flight_id));
    const list = [...passengers.filter(p => (!p.passenger_type || p.passenger_type === "حاج") && p.services?.flight !== "بدون"), ...adminsWithFlight];
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
    const adminsWithFlight = passengers.filter(p => (p.passenger_type && p.passenger_type !== "حاج") && (wantsFirstClass(p) || p.flight_id));
    const list = [...passengers.filter(p => (!p.passenger_type || p.passenger_type === "حاج") && p.services?.flight !== "بدون"), ...adminsWithFlight];
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
      const aoa: (string | number | null)[][] = [[title], ["م", "اسم الحاج / الحاجة", "الجنس", "الجنسية"]];
      bp.forEach((p, i) => aoa.push([i + 1, p.short_ar || p.name_ar, p.gender, p.nat]));
      if (bp.length === 0) aoa.push(["", "لا يوجد مسافرون", "", ""]);
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = [{ wch: 4 }, { wch: 30 }, { wch: 8 }, { wch: 12 }];
      styleTitleRow(ws, 0, 4, primaryColor);
      styleHeaderRow(ws, 1, 4, primaryColor);
      freezeHeaderRow(ws, 2);
      const name = safeSheetName(`${bus.name}${bus.type === "VIP" ? " VIP" : ""}`);
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
      const aoa: (string | number | null)[][] = [[title], ["م", "اسم الحاج", "م", "اسم الحاج"]];
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
      const name = safeSheetName(camp.name);
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

  const getHotelHTML = (opts?: { landscape?: boolean; showPattern?: boolean }) => {
    const landscape = opts?.landscape ?? false;
    const showPattern = opts?.showPattern ?? true;
    const filtered = getFilteredRooms();
    const COLS = landscape ? 5 : 4;
    const ROWS = landscape ? 3 : 4;
    const PER_PAGE = COLS * ROWS; // landscape: 15 غرفة | portrait: 16 غرفة

    // ألوان واضحة ومريحة لكل نوع غرفة — الترويسة بلون مصمت كامل ونص أبيض
    const PRINT_ROOM_COLORS: Record<string, string> = {
      "فردية":  "#b8762a",  // كهرماني دافئ
      "ثنائية": "#1565a8",  // أزرق واضح
      "ثلاثية": "#6B21A8",  // بنفسجي واضح
      "رباعية": "#1f8a4c",  // أخضر واضح
    };

    // نوع وسعة الغرفة الفعلية تُحسب من عدد الحجاج المتعيّنين فيها فعلياً
    // (وليس من حقل room.type المخزّن، الذي قد لا يعكس الواقع)
    const roomLabelByCount = (count: number): string => {
      if (count <= 1) return "فردية";
      if (count === 2) return "ثنائية";
      if (count === 3) return "ثلاثية";
      return "رباعية";
    };

    // حجم الخط لكروت الغرف يُحدَّد ديناميكياً حسب أعلى سعة غرفة موجودة فعلياً في الصفحة
    // (معايرة حقيقية مُختبرة بمحاكاة طباعة A4 لضمان عدم الفيضان مع استغلال أكبر مساحة ممكنة)
    const FONT_BY_MAX_CAP: Record<number, number> = { 1: 22, 2: 22, 3: 21, 4: 17 };
    const getRoomFontSize = (maxCapInPage: number): number => FONT_BY_MAX_CAP[Math.min(4, Math.max(1, maxCapInPage))] || 17;

    const renderRoomBlock = (room: Room, fontSize: number) => {
      const rp = passengers.filter(p => p.room_id === room.id && (!p.passenger_type || p.passenger_type === "حاج"));
      const actualLabel = roomLabelByCount(rp.length);
      const cap = Math.max(rp.length, 1); // عدد الصفوف = عدد الحجاج الفعليين (بحد أدنى صف واحد)
      const clr = PRINT_ROOM_COLORS[actualLabel] || "#5C1830";
      const rowPad = Math.round(fontSize * 0.28 * 10) / 10;
      const numSize = fontSize - 1;
      const headerFs = Math.min(15, fontSize + 2);
      const rows = Array.from({ length: cap }, (_, i) => {
        const p = rp[i];
        return p
          ? `<tr>
              <td style="text-align:center;padding:${rowPad}px 4px;font-size:${numSize}px;font-weight:600;color:#333;width:18px;border-bottom:1px solid rgba(0,0,0,0.12);line-height:1.2">${i + 1}</td>
              <td class="auto-fit-name" data-max-size="${fontSize}" style="padding:${rowPad}px 7px;font-size:${fontSize}px;font-weight:600;color:#000;border-bottom:1px solid rgba(0,0,0,0.12);line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.short_ar || p.name_ar}</td>
            </tr>`
          : `<tr>
              <td style="padding:${rowPad}px 4px;border-bottom:1px solid rgba(0,0,0,0.06);width:18px">&nbsp;</td>
              <td style="padding:${rowPad}px 7px;border-bottom:1px solid rgba(0,0,0,0.06)">&nbsp;</td>
            </tr>`;
      }).join("");

      const cardBg = showPattern ? "rgba(255,255,255,0.4)" : "#ffffff";
      return `<div style="break-inside:avoid;border:1.5px solid ${clr};border-radius:5px;overflow:hidden;display:flex;flex-direction:column;height:100%;background:${cardBg}">
        <div style="background:${clr};color:#ffffff;padding:5px 7px;flex-shrink:0;text-align:center;font-size:${headerFs}px;font-weight:800;line-height:1.3">
          غرفة ${room.number}${room.floor ? ` — الدور ${room.floor}` : ""}
        </div>
        <table style="margin:0;width:100%;table-layout:fixed;border-collapse:collapse;flex:1;font-family:'Cairo',sans-serif;background:transparent">
          ${rows}
        </table>
      </div>`;
    };

    const pages: Room[][] = [];
    for (let i = 0; i < filtered.length; i += PER_PAGE) {
      pages.push(filtered.slice(i, i + PER_PAGE));
    }

    const cairoFont = `@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');`;

    const pagesHTML = `<style>
      ${cairoFont}
      * { font-family: 'Cairo', sans-serif !important; }
      ${showPattern ? "" : "html, body { background-image: none !important; background: #ffffff !important; }"}
      /* تصغير الهيدر العلوي خاصة بتقرير الفندق لاستيعاب 16 غرفة في الصفحة */
      .doc-header { padding-bottom: 4px !important; margin-bottom: 2px !important; }
      .doc-header .logo-box { width: 14mm !important; height: 14mm !important; font-size: 11pt !important; }
      .doc-header .company-name { font-size: 10pt !important; }
      .doc-header .tagline { font-size: 6.5pt !important; }
      .doc-title-bar { padding: 3pt 0 !important; margin: 4pt 0 6pt !important; font-size: 11pt !important; }
      .hotel-page { display: grid; grid-template-columns: repeat(${COLS}, 1fr); grid-template-rows: repeat(${ROWS}, 1fr); gap: 6px; box-sizing: border-box; ${showPattern ? "" : "background: #ffffff;"} }
      .hotel-page table { margin: 0 !important; }
      .hotel-page td { border: none; white-space: normal !important; vertical-align: middle; }
      .hotel-page tr:nth-child(even) td { background: transparent !important; }
    </style>` +
      pages.map((pageRooms, pi) => {
        // أقصى عدد حجاج في غرفة واحدة ضمن هذه الصفحة يحدد حجم الخط المناسب لكل كروتها
        const roomOccupancy = (room: Room) => passengers.filter(p => p.room_id === room.id && (!p.passenger_type || p.passenger_type === "حاج")).length;
        const maxCapInPage = Math.max(1, ...pageRooms.map(r => Math.max(roomOccupancy(r), 1)));
        const fontSize = getRoomFontSize(maxCapInPage);
        const padded = [...pageRooms];
        while (padded.length < PER_PAGE) padded.push(null as any);
        const cells = padded.map(room =>
          room
            ? renderRoomBlock(room, fontSize)
            : `<div style="background:transparent"></div>`
        ).join("");
        return `<div class="hotel-page" style="page-break-after:${pi < pages.length - 1 ? "always" : "avoid"}">
          ${cells}
        </div>`;
      }).join("");

    // سكريبت يضبط حجم خط كل اسم بشكل مستقل حسب طوله الفعلي:
    // الاسم القصير يحتفظ بالحجم الأقصى المحسوب للصفحة، والاسم الطويل يصغر فقط بقدر ما يلزم ليبقى في سطر واحد
    const autoFitScript = `<script>
      (function() {
        function fitNames() {
          var cells = document.querySelectorAll('.auto-fit-name');
          var canvas = document.createElement('canvas');
          var ctx = canvas.getContext('2d');
          cells.forEach(function(cell) {
            var maxSize = parseFloat(cell.getAttribute('data-max-size')) || 17;
            var minSize = 8;
            var available = cell.clientWidth - 14; // طرح padding التقريبي يمين/يسار
            var text = cell.textContent;
            var size = maxSize;
            while (size > minSize) {
              ctx.font = '600 ' + size + 'px Cairo, sans-serif';
              if (ctx.measureText(text).width <= available) break;
              size -= 0.5;
            }
            cell.style.fontSize = size + 'px';
          });
          document.documentElement.setAttribute('data-fit-done', '1');
        }
        function runWhenFontReady() {
          if (document.fonts && document.fonts.load) {
            // نجبر تحميل الخط فعلياً بنفس الوزن المستخدم في القياس قبل أي حساب
            Promise.all([
              document.fonts.load('600 17px Cairo'),
              document.fonts.ready
            ]).then(fitNames).catch(fitNames);
          } else {
            window.addEventListener('load', fitNames);
          }
        }
        runWhenFontReady();
      })();
    </script>`;

    const subtitle = hotelPrintFilter === "type" ? ` — ${hotelPrintType}` : "";
    return mkHTML(`تقرير الفندق${subtitle}`, pagesHTML + autoFitScript, landscape, false, showPattern ? 0.04 : 0);
  };

  const exportHotelXLSX = () => {
    const filtered = getFilteredRooms();
    const MAX_GUESTS = 4;
    const COLS = 4; // 4 غرف في كل صف

    const wb = XLSX.utils.book_new();

    // شيت واحد بشكل 4 غرف في الصف
    // كل غرفة تاخد عمودين: رقم الغرفة/النوع + الأسماء
    // الترتيب: غرفة1 | غرفة2 | غرفة3 | غرفة4 ... كل 4 غرف في صف

    const aoa: (string | number | null)[][] = [];

    for (let i = 0; i < filtered.length; i += COLS) {
      const rowRooms = filtered.slice(i, i + COLS);
      // بادينج لو أقل من 4
      while (rowRooms.length < COLS) rowRooms.push(null as any);

      // صف header الغرف
      const headerRow: (string | number | null)[] = [];
      rowRooms.forEach(room => {
        if (room) {
          headerRow.push(`غرفة ${room.number}${room.floor ? ` — ط${room.floor}` : ""} (${room.type})`);
          headerRow.push(""); // دمج
        } else {
          headerRow.push(""); headerRow.push("");
        }
      });
      aoa.push(headerRow);

      // صف عناوين الأعمدة
      const subHeader: (string | number | null)[] = [];
      rowRooms.forEach(() => { subHeader.push("م"); subHeader.push("الاسم"); });
      aoa.push(subHeader);

      // صفوف الحجاج (4 صفوف ثابتة)
      for (let g = 0; g < MAX_GUESTS; g++) {
        const guestRow: (string | number | null)[] = [];
        rowRooms.forEach(room => {
          if (room) {
            const rp = passengers.filter(p => p.room_id === room.id && (!p.passenger_type || p.passenger_type === "حاج"));
            const p = rp[g];
            guestRow.push(p ? g + 1 : "");
            guestRow.push(p ? (p.short_ar || p.name_ar) : "");
          } else {
            guestRow.push(""); guestRow.push("");
          }
        });
        aoa.push(guestRow);
      }

      // صف فاصل
      aoa.push([]);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // عرض الأعمدة: كل غرفة = عمود رقم (4) + عمود اسم (22)
    ws["!cols"] = Array.from({ length: COLS * 2 }, (_, i) => ({ wch: i % 2 === 0 ? 4 : 22 }));

    const subtitle = hotelPrintFilter === "type" ? ` — ${hotelPrintType}` : "";
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(`تقرير الفندق${subtitle}`));

    addSummarySheet(wb, XLSX, `تقرير الفندق${subtitle}`, companyName, [
      ["إجمالي عدد الغرف", filtered.length],
      ["إجمالي عدد النزلاء", passengers.filter(p => p.room_id && filtered.some(r => r.id === p.room_id) && (!p.passenger_type || p.passenger_type === "حاج")).length],
      ...ROOM_TYPES.map(t => [`غرف ${t}`, filtered.filter(r => r.type === t).length]),
    ]);
    XLSX.writeFile(wb, "تقرير_الفندق.xlsx");
  };

  // ============================================================
  // أزرار التصدير (عرض / Excel / طباعة) — موحّدة وثابتة أعلى التقرير
  // Excel: لون الهوية الأساسي | طباعة: لون رمادي داكن موحّد
  // أحجام مدمجة (ليست flex:1) حتى لا تأخذ سطراً كاملاً بمفردها
  // ============================================================
  const printBtnStyle = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--text)", padding: "5px 11px", borderRadius: "var(--radius-sm)", fontSize: 12, cursor: "pointer", fontWeight: 600, fontFamily: "var(--font-body)", transition: "var(--transition)" };
  const excelBtnStyle = { ...btnP({ fontSize: 12, fontWeight: 600, padding: "5px 11px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: "var(--radius-sm)" }) };
  const printIcon = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>;
  const excelIcon = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>;

  const ExportButtons = ({
    title, onView, onExcel, onPrint
  }: { title?: string; onView?: () => void; onExcel: () => void; onPrint: () => void }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 10, flexWrap: "wrap", position: "sticky", top: 0, zIndex: 5, background: "var(--bg)", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
      {title && <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginInlineStart: "auto" }}>
        <button onClick={onExcel} style={excelBtnStyle}>{excelIcon} Excel</button>
        <button onClick={onPrint} style={printBtnStyle}>{printIcon} طباعة</button>
        {onView && <button onClick={onView} style={{ ...btnS({ padding: "5px 10px", fontSize: 12, borderRadius: "var(--radius-sm)" }) }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg> عرض</button>}
      </div>
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
      <div style={{ border: "0.5px solid var(--border)", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
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
  const isAdminPerson = (p: Passenger) => !!p.passenger_type && p.passenger_type !== "حاج";
  const docListAll = passengers.filter(p => (p as any)[docType]);
  const docList = docListAll.filter(p =>
    docPersonFilter === "all" ? true :
    docPersonFilter === "admin" ? isAdminPerson(p) :
    !isAdminPerson(p)
  );
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
    printInPage(mkHTML(docTypeLabel, pagesHTML, false, true));
  };


  // ============================================================
  // قائمة التقارير
  // ============================================================
  // ============================================================
  // KPI calculations للـ gateway
  // ============================================================
  const hajjTotal = passengers.filter(p => !p.passenger_type || p.passenger_type === "حاج").length || 1;
  const withFlight = passengers.filter(p => (!p.passenger_type || p.passenger_type === "حاج") && p.flight_id != null).length;
  const withBus    = passengers.filter(p => (!p.passenger_type || p.passenger_type === "حاج") && p.bus_id != null).length;
  const withMina   = passengers.filter(p => (!p.passenger_type || p.passenger_type === "حاج") && p.camp_mina_id != null).length;
  const withArafa  = passengers.filter(p => (!p.passenger_type || p.passenger_type === "حاج") && p.camp_arafa_id != null).length;
  const withRoom   = passengers.filter(p => (!p.passenger_type || p.passenger_type === "حاج") && p.room_id != null).length;
  const noFlight   = hajjTotal - withFlight;
  const noBus      = hajjTotal - withBus;
  const noMina     = hajjTotal - withMina;
  const noArafa    = hajjTotal - withArafa;
  const noRoom     = hajjTotal - withRoom;
  const pctFlight  = Math.round(withFlight / hajjTotal * 100);
  const pctBus     = Math.round(withBus    / hajjTotal * 100);
  const pctMina    = Math.round(withMina   / hajjTotal * 100);
  const pctArafa   = Math.round(withArafa  / hajjTotal * 100);
  const pctRoom    = Math.round(withRoom   / hajjTotal * 100);


  // ============================================================
  // الـ UI
  // ============================================================
  return (
    <div style={{ padding: "0 2px", overflowY: "auto", height: "100%" }}>
      <AlertModal alert={alertState} onClose={() => showAlert(null)} />
      {!activeReport ? (
        <>
          {/* Quick Actions */}
          <div style={{ display:"flex", gap:10, marginBottom:16 }}>
            {[
              { id:"documents", label:"طباعة المستندات", sub:"جواز · بطاقة · تصريح · تذكرة", bg:"rgba(125,31,60,0.08)", color:"var(--primary)", icon:`<path d="M3 3h18v18H3z M12 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4z M8 16s1-2 4-2 4 2 4 2"/>` },
              { id:"whatsapp",  label:"رسائل WhatsApp",  sub:"إرسال رسائل مخصصة للحجاج",    bg:"rgba(37,211,102,0.08)", color:"#25D366", icon:`<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>` },
              { id:"stickers",   label:"مطبوعات الشنط",   sub:"استيكر · تاج اليد · التاج الطولي", bg:"rgba(212,160,23,0.1)", color:"#8a6a10", icon:`<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>` },
            ].map(qa => (
              <div key={qa.id} onClick={() => { setActiveReport(qa.id); setFlightSubReport(null); }}
                style={{ flex:1, display:"flex", alignItems:"center", gap:12, padding:"11px 16px", borderRadius:12, border:"1.5px solid var(--line)", background:"var(--paper)", cursor:"pointer", transition:"all 0.15s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor="var(--primary)"; (e.currentTarget as HTMLDivElement).style.boxShadow="0 4px 14px rgba(125,31,60,0.1)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor="var(--line)"; (e.currentTarget as HTMLDivElement).style.boxShadow="none"; }}>
                <div style={{ width:36, height:36, borderRadius:9, background:qa.bg, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={qa.color} strokeWidth="1.7" strokeLinecap="round" dangerouslySetInnerHTML={{ __html: qa.icon }} />
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:"var(--ink)" }}>{qa.label}</div>
                  <div style={{ fontSize:11, color:"var(--muted)", marginTop:1 }}>{qa.sub}</div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
              </div>
            ))}
          </div>

          {/* Smart Cards Grid */}
          <div style={{ fontSize:10, fontWeight:700, color:"var(--muted)", letterSpacing:"0.08em", marginBottom:10, display:"flex", alignItems:"center", gap:8 }}>
            تقارير الأقسام
            <div style={{ flex:1, height:1, background:"linear-gradient(to left, transparent, var(--line))" }} />
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
            {[
              { id:"passengers_report", name:"تقرير الحجاج",  icon:`<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`, color:"#2A9D8F", bg:"rgba(42,157,143,0.1)",  kpiNum: String(passengers.filter(p=>!p.passenger_type||p.passenger_type==="حاج").length), kpiLabel:"إجمالي الحجاج", kpiSub:"", pct:100, alert:false },
              { id:"flight",            name:"تقرير الطيران", icon:`<path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>`,                             color:"#0C447C", bg:"rgba(12,68,124,0.1)",   kpiNum:pctFlight+"%", kpiLabel:"لديهم تذاكر طيران", kpiSub: noFlight > 0 ? noFlight+" بدون تذكرة" : "جميعهم مكتملون", pct:pctFlight, alert: noFlight>0 },
              { id:"buses",             name:"تقرير الباصات", icon:`<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="15" cy="18" r="2"/>`, color:"#3F51B5", bg:"rgba(63,81,181,0.1)",  kpiNum:pctBus+"%",    kpiLabel:"موزّعون على الباصات",  kpiSub: noBus   > 0 ? noBus+  " بدون باص"    : "جميعهم مكتملون", pct:pctBus,    alert: noBus>0 },
              { id:"mina",              name:"تقرير منى",     icon:`<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>`,                                                                           color:"#5C7C2E", bg:"rgba(92,124,46,0.1)",   kpiNum:pctMina+"%",   kpiLabel:"في مخيمات منى",        kpiSub: noMina  > 0 ? noMina+ " لم يُعيَّنوا" : "جميعهم مكتملون", pct:pctMina,   alert: noMina>0 },
              { id:"arafa",             name:"تقرير عرفة",    icon:`<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>`,                                                                           color:"#B5651D", bg:"rgba(181,101,29,0.1)",  kpiNum:pctArafa+"%",  kpiLabel:"في مخيمات عرفة",       kpiSub: noArafa > 0 ? noArafa+" لم يُعيَّنوا" : "جميعهم مكتملون", pct:pctArafa,  alert: noArafa>0 },
              { id:"hotel",             name:"تقرير الفندق",  icon:`<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M10 6h4"/><path d="M10 10h4"/>`,                                                                                    color:"#8B3A6B", bg:"rgba(139,58,107,0.1)",  kpiNum:pctRoom+"%",   kpiLabel:"تم تسكينهم بالفندق",  kpiSub: noRoom  > 0 ? noRoom+ " بدون غرفة"   : "جميعهم مكتملون", pct:pctRoom,   alert: noRoom>0 },
            ].map(card => (
              <div key={card.id} onClick={() => { setActiveReport(card.id); setFlightSubReport(null); }}
                style={{ background:"var(--paper)", border:"1.5px solid var(--line)", borderRadius:16, padding:"16px 16px 0", cursor:"pointer", display:"flex", flexDirection:"column", overflow:"hidden", position:"relative", transition:"all 0.2s" }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor=card.color; el.style.boxShadow="0 8px 24px "+card.color+"22"; el.style.transform="translateY(-2px)"; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor="var(--line)"; el.style.boxShadow="none"; el.style.transform="none"; }}>
                {/* Header */}
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:12 }}>
                  <div>
                    <div style={{ width:34, height:34, borderRadius:9, background:card.bg, display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={card.color} strokeWidth="1.7" strokeLinecap="round" dangerouslySetInnerHTML={{ __html: card.icon }} />
                    </div>
                    <div style={{ fontSize:12, fontWeight:700, color:"var(--ink)", marginTop:8 }}>{card.name}</div>
                  </div>
                  <div style={{ width:22, height:22, borderRadius:6, background:"var(--ivory2)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                  </div>
                </div>
                {/* KPI */}
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:30, fontWeight:900, lineHeight:1, color:card.color, marginBottom:3 }}>{card.kpiNum}</div>
                  <div style={{ fontSize:10, color:"var(--muted)", fontWeight:600 }}>{card.kpiLabel}</div>
                  {card.kpiSub && <div style={{ fontSize:10, marginTop:4, display:"inline-block", padding:"2px 7px", borderRadius:99, background: card.alert?"rgba(192,57,43,0.1)":"rgba(42,157,143,0.1)", color: card.alert?"#C0392B":"#2A9D8F", fontWeight:700 }}>{card.kpiSub}</div>}
                </div>
                {/* Progress Bar */}
                <div style={{ height:4, background:"var(--ivory2)", margin:"0 -16px", overflow:"hidden" }}>
                  <div style={{ height:"100%", width:card.pct+"%", background:"linear-gradient(to left, #D4A017, "+card.color+")", transition:"width 0.8s ease" }} />
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
              <ExportButtons
                title="تقرير الحجاج"
                onExcel={exportPassengersXLSX}
                onPrint={() => printInPage(getPassengersHTML())}
              />
              <div style={{ border: "0.5px solid var(--border)", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
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
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>{filteredPassengers.length} حاج · {activeCols.length} عمود</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                {["الكل", "ذكر", "أنثى"].map(g => (
                  <div key={g} onClick={() => setFilterGender(g)} style={{ padding: "4px 12px", borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: "pointer", background: filterGender === g ? "var(--em7)" : "var(--bg-2)", color: filterGender === g ? "#fff" : "var(--text-muted)", border: `1px solid ${filterGender === g ? "var(--em7)" : "var(--line)"}` }}>
                    {g === "الكل" ? "الجنس: الكل" : g === "ذكر" ? "رجال" : "نساء"}
                  </div>
                ))}
                <select value={filterNat} onChange={e => setFilterNat(e.target.value)} style={{ padding: "4px 10px", borderRadius: 99, fontSize: 11, border: "1px solid var(--line)", background: "var(--bg-2)", color: "var(--ink)", cursor: "pointer" }}>
                  {nats.map(n => <option key={n} value={n}>{n === "الكل" ? "الجنسية: الكل" : n}</option>)}
                </select>
              </div>
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
                    <div key={sub.id} onClick={() => setFlightSubReport(sub.id as "airline" | "per_flight")}
                      style={{ border: "0.5px solid var(--border)", borderRadius: 12, padding: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 12, background: "var(--bg-card)" }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--bg-2)"}
                      onMouseLeave={e => e.currentTarget.style.background = "var(--bg-card)"}>
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
                      <ExportButtons
                        title="تقرير خطوط الطيران"
                        onExcel={exportAirlineXLSX}
                        onPrint={() => printInPage(getAirlineHTML())}
                      />
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
                    </>
                  )}

                  {/* كل رحلة */}
                  {flightSubReport === "per_flight" && (
                    <>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 10, flexWrap: "wrap", position: "sticky", top: 0, zIndex: 5, background: "var(--bg)", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                        <div style={{ fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 5 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg> تقرير كل رحلة</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginInlineStart: "auto" }}>
                          <button onClick={exportPerFlightXLSX} style={excelBtnStyle}>{excelIcon} Excel</button>
                          <button onClick={() => printInPage(getPerFlightHTML())} style={printBtnStyle}>{printIcon} طباعة</button>
                        </div>
                      </div>
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
                            <div key={flight.id} style={{ border: "0.5px solid var(--border)", borderRadius: 10, marginBottom: 12, overflow: "hidden" }}>
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
                    </>
                  )}
                </>
              )}
            </>
          )}

          {/* ===== تقرير الباصات ===== */}
          {activeReport === "buses" && (
            <>
              {loading ? <><div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>تقرير الباصات</div><div style={{ textAlign: "center", color: "var(--text-muted)" }}>جاري التحميل...</div></> :
                buses.length === 0 ? <><div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>تقرير الباصات</div><div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>لا يوجد باصات</div></> :
                <>
                  <ExportButtons
                    title="تقرير الباصات"
                    onExcel={exportBusesXLSX}
                    onPrint={() => printInPage(getBusesHTML())}
                  />
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
                      <div key={bus.id} style={{ border: "0.5px solid var(--border)", borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
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
                </>
              }
            </>
          )}

          {/* ===== تقرير منى ===== */}
          {activeReport === "mina" && (
            <>
              {loading ? <><div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>تقرير مخيمات منى</div><div style={{ textAlign: "center", color: "var(--text-muted)" }}>جاري التحميل...</div></> :
                camps.filter(c => c.page_type === "منى").length === 0 ?
                  <><div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>تقرير مخيمات منى</div><div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>لا يوجد مخيمات</div></> :
                <>
                  <ExportButtons
                    title="تقرير مخيمات منى"
                    onExcel={() => exportCampsXLSX("منى")}
                    onPrint={() => printInPage(getCampsHTML("منى"))}
                  />
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
                </>
              }
            </>
          )}

          {/* ===== تقرير عرفة ===== */}
          {activeReport === "arafa" && (
            <>
              {loading ? <><div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>تقرير مخيمات عرفة</div><div style={{ textAlign: "center", color: "var(--text-muted)" }}>جاري التحميل...</div></> :
                camps.filter(c => c.page_type === "عرفة").length === 0 ?
                  <><div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>تقرير مخيمات عرفة</div><div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>لا يوجد مخيمات</div></> :
                <>
                  <ExportButtons
                    title="تقرير مخيمات عرفة"
                    onExcel={() => exportCampsXLSX("عرفة")}
                    onPrint={() => printInPage(getCampsHTML("عرفة"))}
                  />
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
                </>
              }
            </>
          )}

          {/* ===== تقرير الفندق ===== */}
          {activeReport === "hotel" && (
            <>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>تقرير الفندق</div>
              {/* فلتر الطباعة */}
              <div style={{ border: "0.5px solid var(--border)", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>نطاق التقرير</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  {[["all", "كل الغرف"], ["type", "نوع معين"]].map(([val, label]) => (
                    <div key={val} onClick={() => setHotelPrintFilter(val as "all" | "type")}
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

              <ExportButtons
                onExcel={exportHotelXLSX}
                onPrint={() => printInPage(getHotelHTML())}
              />
              <div style={{ marginTop: -6, marginBottom: 12 }}>
                <button
                  onClick={() => printInPage(getHotelHTML({ landscape: true, showPattern: true }))}
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "transparent", border: "1px dashed var(--accent-dark)", color: "var(--accent-dark)", padding: "4px 10px", borderRadius: "var(--radius-sm)", fontSize: 11, cursor: "pointer", fontFamily: "var(--font-body)" }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2v6m0 8v6M4.93 4.93l4.24 4.24m5.66 5.66 4.24 4.24M2 12h6m8 0h6M4.93 19.07l4.24-4.24m5.66-5.66 4.24-4.24"/></svg>
                  تجربة: عرض + نقشة ظاهرة
                </button>
              </div>

              {loading ? <div style={{ textAlign: "center", color: "var(--text-muted)" }}>جاري التحميل...</div> :
                rooms.length === 0 ? <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>لا يوجد غرف</div> :
                <>
                  {getFilteredRooms().map(room => {
                    const rp = passengers.filter(p => p.room_id === room.id);
                    const [typeBg, typeClr] = ROOM_COLORS[room.type] || ["var(--bg-2)", "var(--text)"];
                    const isOpen = expandedItems.has(room.id);
                    return (
                      <div key={room.id} style={{ border: "0.5px solid var(--border)", borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
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
                </>
              }
            </>
          )}

          {/* ===== طباعة المستندات ===== */}
          {activeReport === "documents" && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 10, flexWrap: "wrap", position: "sticky", top: 0, zIndex: 5, background: "var(--bg)", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>طباعة المستندات</div>
                {docList.length > 0 && (
                  <button onClick={printDocuments} style={printBtnStyle}>{printIcon} طباعة ({docSelectedIds.size})</button>
                )}
              </div>

              {/* نوع المستند */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                {DOC_TYPES.map(d => (
                  <div key={d.key} onClick={() => setDocType(d.key)}
                    style={{ flex: 1, minWidth: 90, padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${docType === d.key ? "var(--em7)" : "var(--border)"}`, background: docType === d.key ? "var(--success-bg)" : "transparent", cursor: "pointer", textAlign: "center", fontSize: 12, color: docType === d.key ? "var(--em7)" : "var(--text-muted)" }}>
                    {d.label} ({passengers.filter(p => (p as any)[d.key]).length})
                  </div>
                ))}
              </div>

              {/* فلتر حجاج / إداريين / الكل */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>عرض:</div>
                {([["all", "الكل"], ["hajj", "الحجاج"], ["admin", "الإداريون"]] as const).map(([key, label]) => (
                  <div key={key} onClick={() => setDocPersonFilter(key)}
                    style={{ padding: "6px 14px", borderRadius: 99, border: `1.5px solid ${docPersonFilter === key ? "var(--warning)" : "var(--border)"}`, background: docPersonFilter === key ? "var(--warning-bg)" : "transparent", cursor: "pointer", fontSize: 12, fontWeight: 600, color: docPersonFilter === key ? "var(--warning)" : "var(--text-muted)" }}>
                    {label} ({key === "all" ? docListAll.length : key === "admin" ? docListAll.filter(isAdminPerson).length : docListAll.filter(p => !isAdminPerson(p)).length})
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
                <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                  لا يوجد {docPersonFilter === "admin" ? "إداريون" : docPersonFilter === "hajj" ? "حجاج" : "أشخاص"} عندهم {docTypeLabel} مرفوع
                </div>
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
                        {/* علامة تمييز: إداري / نوعه — لا تظهر للحجاج */}
                        {isAdminPerson(p) && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "var(--warning-bg)", color: "var(--warning)" }}>{p.passenger_type}</span>
                        )}
                        {/* الجواز */}
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{p.passport || "—"}</span>
                        {/* الجنس */}
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99, background: p.gender === "أنثى" ? "var(--fb)" : "var(--mb)", color: p.gender === "أنثى" ? "var(--ff)" : "var(--mf)" }}>{p.gender === "أنثى" ? "أنثى" : "ذكر"}</span>
                      </div>
                    ))}
                  </div>
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

          {/* ═══════════════════════════════════════════════════
              مطبوعات الشنط — استيكر + تاج اليد + التاج الطولي
              ═══════════════════════════════════════════════════ */}
          {activeReport === "stickers" && (() => {
            /* ─── بناء قائمة الحجاج المستهدفين ─── */
            const stkPassengers = (() => {
              if (stkFilter === "all") return passengers;
              if (stkFilter === "bus")  return passengers.filter(p => p.bus_id === stkBusId);
              if (stkFilter === "room") return passengers.filter(p => p.room_id === stkRoomId);
              if (stkFilter === "one")  return passengers.filter(p => p.id === stkPassId);
              return passengers;
            })();

            /* ══ دوال مساعدة مشتركة ══ */
            const mkLogo = (size: number) => logoUrl
              ? `<img src="${logoUrl}" style="width:${size}px;height:${size}px;object-fit:contain;border-radius:50%;border:2.5px solid ${accentColor};padding:2px;" />`
              : `<div style="width:${size}px;height:${size}px;border-radius:50%;border:2.5px solid ${accentColor};display:flex;align-items:center;justify-content:center;background:#F8F2E4;"><svg width="${Math.round(size*.55)}" height="${Math.round(size*.55)}" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="1.4"><path d="M12 2l2.4 4.8L19.5 8l-3.5 4 .7 5.5L12 15l-4.7 2.5.7-5.5-3.5-4 5.1-1.2z"/></svg></div>`;
            // @ts-ignore
            const patBg = `url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22 viewBox=%220 0 48 48%22%3E%3Cpath d=%22M24 6l3.5 7.5 8 1.5-6 6.5 1.5 8.5-7-3.5-7 3.5 1.5-8.5-6-6.5 8-1.5z%22 fill=%22none%22 stroke=%22%237D1F3C%22 stroke-width=%22.9%22/%3E%3C/svg%3E')`;

            /* ══ ورقة ١: الاستيكر العريض (3 استيكرات رأسياً) ══ */
            const buildStickerPage = (p: Passenger) => {
              const room = rooms.find(r => r.id === p.room_id);
              const bus  = buses.find(b => b.id === p.bus_id);
              const roomNo   = room?.number || "—";
              const roomFloor = room?.floor  ? `الدور ${room.floor}` : "";
              const busName  = bus?.name || "";
              const logoHtml = mkLogo(62);
              const shortName = p.short_ar || p.name_ar || "";
              const stk = () => `
                <div style="width:100%;height:99mm;box-sizing:border-box;border-bottom:2px dashed #E8D5C4;display:flex;page-break-inside:avoid;break-inside:avoid;overflow:hidden;position:relative;">
                  <div style="position:absolute;inset:0;opacity:.03;background-image:url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22 viewBox=%220 0 48 48%22%3E%3Cpath d=%22M24 6l3.5 7.5 8 1.5-6 6.5 1.5 8.5-7-3.5-7 3.5 1.5-8.5-6-6.5 8-1.5z%22 fill=%22none%22 stroke=%22%237D1F3C%22 stroke-width=%22.9%22/%3E%3C/svg%3E');pointer-events:none;"></div>
                  <div style="position:absolute;inset:6px;border:2.5px solid ${primaryColor};border-radius:10px;pointer-events:none;"></div>
                  <div style="position:absolute;inset:10px;border:1px solid ${accentColor};border-radius:7px;pointer-events:none;opacity:.55;"></div>
                  <!-- هوية الحملة يمين —  -->
                  <div style="width:32%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;padding:10px 8px;border-right:2px solid ${accentColor};">
                    ${logoHtml}
                    <div style="font-size:14pt;font-weight:700;color:${primaryColor};text-align:center;line-height:1.3;font-family:'El Messiri',Cairo,sans-serif;">${companyName}</div>
                    <div style="font-size:8pt;font-weight:700;color:#8a6a10;text-align:center;line-height:1.5;">${tagline || config.season_label || ""}</div>
                    <div style="font-size:8.5pt;font-weight:800;color:#241318;direction:ltr;">${config.admin_phone || ""}</div>
                  </div>
                  <!-- البيانات وسط -->
                  <div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:12px 10px;gap:0;">
                    <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px dashed #E8D5C4;">
                      <span style="font-size:9pt;font-weight:800;color:#8a6a10;min-width:46px;font-family:Cairo,sans-serif;flex-shrink:0;">الحاج</span>
                      <span style="font-size:13pt;font-weight:900;color:#241318;font-family:Cairo,sans-serif;">${shortName}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;padding:5px 0;border-bottom:1px dashed #E8D5C4;">
                      <span style="font-size:9pt;font-weight:800;color:#8a6a10;min-width:46px;font-family:Cairo,sans-serif;flex-shrink:0;"></span>
                      <span style="font-size:8.5pt;font-weight:600;color:#7A6570;direction:ltr;font-family:Arial,sans-serif;">${p.name_en || ""}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px dashed #E8D5C4;">
                      <span style="font-size:9pt;font-weight:800;color:#8a6a10;min-width:46px;font-family:Cairo,sans-serif;flex-shrink:0;">الفندق</span>
                      <span style="font-size:11pt;font-weight:800;color:#241318;font-family:Cairo,sans-serif;">${config.hotel_name || companyName}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;padding:5px 0;border-bottom:1px dashed #E8D5C4;">
                      <span style="font-size:9pt;font-weight:800;color:#8a6a10;min-width:46px;font-family:Cairo,sans-serif;flex-shrink:0;">العنوان</span>
                      <span style="font-size:9pt;font-weight:700;color:#7A6570;font-family:Cairo,sans-serif;">${(config as any).hotel_address || ""}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;padding:6px 0;">
                      <span style="font-size:9pt;font-weight:800;color:#8a6a10;min-width:46px;font-family:Cairo,sans-serif;flex-shrink:0;">الهاتف</span>
                      <span style="font-size:11pt;font-weight:800;color:#241318;direction:ltr;font-family:Arial,sans-serif;">${p.phone || "—"}</span>
                    </div>
                  </div>
                  <!-- رقم الغرفة يسار — أكبر بكثير -->
                  <div style="width:26%;margin:10px 10px 10px 0;background:#F8F2E4;border:2px solid ${accentColor};border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;">
                    <div style="font-size:10pt;font-weight:800;color:#8a6a10;font-family:Cairo,sans-serif;">الغرفة</div>
                    <div style="font-size:48pt;font-weight:900;color:${primaryColor};line-height:1;font-family:Cairo,sans-serif;">${roomNo}</div>
                    <div style="font-size:8pt;font-weight:800;color:#241318;background:rgba(125,31,60,.1);border-radius:99px;padding:3px 10px;text-align:center;font-family:Cairo,sans-serif;">${roomFloor}${busName ? ` · أوتوبيس ${busName}` : ""}</div>
                  </div>
                </div>`;
              return `<div style="width:210mm;height:297mm;background:#fff;display:block;page-break-after:always;font-family:Cairo,sans-serif;direction:rtl;overflow:hidden;">${stk()}${stk()}${stk()}</div>`;
            };

            /* ══ ورقة ٢: تاج اليد — 3 شرائط أفقية (وجه واحد يلتف ويلتصق) ══ */
            const buildHandTagPage = (p: Passenger) => {
              const room = rooms.find(r => r.id === p.room_id);
              const bus  = buses.find(b => b.id === p.bus_id);
              const roomNo    = room?.number || "—";
              const roomFloor = room?.floor ? `الدور ${room.floor}` : "";
              const busName   = bus?.name || "";
              const handShort = p.short_ar || p.name_ar || "";
              /* كل شريط: 297mm طول × 70mm عرض — يُطبع landscape ويُقص ويُلف */
              const strip = () => `
                <div style="width:297mm;height:70mm;box-sizing:border-box;border-bottom:2px dashed #E8D5C4;display:flex;align-items:stretch;overflow:hidden;position:relative;flex-shrink:0;">
                  <div style="position:absolute;inset:5px;border:2.5px solid ${primaryColor};border-radius:10px;pointer-events:none;z-index:1;"></div>
                  <div style="position:absolute;inset:9px;border:1px solid ${accentColor};border-radius:7px;pointer-events:none;opacity:.5;z-index:1;"></div>
                  <!-- هوية الحملة -->
                  <div style="width:22%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:10px 8px;border-left:2px solid ${accentColor};height:100%;box-sizing:border-box;">
                    ${mkLogo(52)}
                    <div style="font-size:14pt;font-weight:700;color:${primaryColor};text-align:center;line-height:1.3;font-family:'El Messiri',Cairo,sans-serif;white-space:nowrap;">${companyName}</div>
                    <div style="font-size:9pt;font-weight:700;color:#8a6a10;text-align:center;">${config.season_label || ""}</div>
                    <div style="font-size:9pt;font-weight:800;color:#241318;direction:ltr;">${config.admin_phone || ""}</div>
                  </div>
                  <!-- رقم الغرفة ضخم -->
                  <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10px;gap:4px;">
                    <div style="font-size:9pt;font-weight:800;color:#8a6a10;font-family:Cairo,sans-serif;">الغرفة</div>
                    <div style="font-size:44pt;font-weight:900;color:${primaryColor};line-height:1;font-family:Cairo,sans-serif;letter-spacing:3px;">${roomNo}</div>
                    <div style="font-size:9pt;font-weight:800;color:#241318;background:rgba(125,31,60,.08);border-radius:99px;padding:3px 14px;font-family:Cairo,sans-serif;">${roomFloor}${busName ? ` · أوتوبيس ${busName}` : ""}</div>
                  </div>
                  <!-- اسم الحاج -->
                  <div style="width:18%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;padding:10px 8px;border-right:2px solid ${accentColor};height:100%;box-sizing:border-box;">
                    <div style="font-size:13pt;font-weight:900;color:#241318;text-align:center;line-height:1.5;font-family:Cairo,sans-serif;">${handShort}</div>
                    <div style="width:70%;height:1px;background:linear-gradient(90deg,transparent,${accentColor},transparent);"></div>
                    <div style="font-size:8.5pt;font-weight:700;color:#7A6570;text-align:center;font-family:Cairo,sans-serif;">${config.hotel_name || companyName}</div>
                    <div style="font-size:8pt;font-weight:700;color:#7A6570;direction:ltr;">${p.phone || ""}</div>
                  </div>
                </div>`;
              /* ورقة landscape: 3 شرائط فوق بعض */
              return `<div style="width:297mm;height:210mm;background:#fff;display:flex;flex-direction:column;page-break-after:always;font-family:Cairo,sans-serif;direction:rtl;">${strip()}${strip()}${strip()}</div>`;
            };

            /* ══ ورقة ٣: التاج الطولي الكلاسيكي (3 تاجات جنب بعض) ══ */
            const buildLongTagPage = (p: Passenger) => {
              const room = rooms.find(r => r.id === p.room_id);
              const bus  = buses.find(b => b.id === p.bus_id);
              const roomNo    = room?.number || "—";
              const roomFloor = room?.floor ? `الدور ${room.floor}` : "";
              const busName   = bus?.name || "";
              const shortName = p.short_ar || p.name_ar || "";
              const hotelName = config.hotel_name || companyName;
              const hotelAddr = (config as any).hotel_address || "";
              const tag = () => `
                <div style="width:calc(100%/3);height:100%;border-left:2px dashed #E8D5C4;box-sizing:border-box;display:flex;flex-direction:column;background:#fff;overflow:hidden;position:relative;">
                  <div style="position:absolute;inset:6px;border:2.5px solid ${primaryColor};border-radius:10px;pointer-events:none;z-index:1;"></div>
                  <div style="position:absolute;inset:10px;border:1px solid ${accentColor};border-radius:7px;pointer-events:none;z-index:1;opacity:.55;"></div>
                  <div style="width:30px;height:11px;border-radius:99px;background:#E8D5C4;margin:22px auto 0;flex-shrink:0;position:relative;z-index:2;"></div>
                  <div style="display:flex;flex-direction:column;align-items:center;padding:14px 10px 12px;gap:5px;flex-shrink:0;border-bottom:2px solid ${accentColor};">
                    ${mkLogo(50)}
                    <div style="font-size:13pt;font-weight:700;color:${primaryColor};text-align:center;line-height:1.2;font-family:'El Messiri',Cairo,sans-serif;">${companyName}</div>
                    <div style="font-size:8.5pt;font-weight:700;color:#8a6a10;text-align:center;">${config.season_label || ""}</div>
                  </div>
                  <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px 8px;flex-shrink:0;border-bottom:1.5px dashed #E8D5C4;">
                    <div style="font-size:9pt;font-weight:800;color:#8a6a10;font-family:Cairo,sans-serif;margin-bottom:4px;">الغرفة</div>
                    <div style="font-size:54pt;font-weight:900;color:${primaryColor};line-height:1;font-family:Cairo,sans-serif;text-align:center;">${roomNo}</div>
                    <div style="font-size:9pt;font-weight:800;color:#241318;background:rgba(125,31,60,.08);border-radius:99px;padding:4px 14px;margin-top:6px;font-family:Cairo,sans-serif;">${roomFloor}</div>
                  </div>
                  <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:14px 10px;gap:6px;background:#F8F2E4;">
                    <div style="font-size:13pt;font-weight:900;color:#241318;text-align:center;line-height:1.5;font-family:Cairo,sans-serif;">${shortName}</div>
                    <div style="width:60%;height:1px;background:linear-gradient(90deg,transparent,${accentColor},transparent);"></div>
                    <div style="font-size:9pt;font-weight:700;color:#241318;text-align:center;font-family:Cairo,sans-serif;">${hotelName}</div>
                    ${hotelAddr ? `<div style="font-size:8pt;font-weight:600;color:#7A6570;text-align:center;font-family:Cairo,sans-serif;">${hotelAddr}</div>` : ""}
                    ${busName ? `<div style="font-size:8.5pt;font-weight:800;color:${primaryColor};background:rgba(125,31,60,.08);border:1px solid rgba(125,31,60,.2);border-radius:99px;padding:3px 12px;font-family:Cairo,sans-serif;">أوتوبيس ${busName}</div>` : ""}
                    ${p.phone ? `<div style="font-size:8pt;font-weight:700;color:#7A6570;direction:ltr;">${p.phone}</div>` : ""}
                  </div>
                </div>`;
              return `<div style="width:210mm;height:297mm;background:#fff;display:flex;flex-direction:row;page-break-after:always;font-family:Cairo,sans-serif;direction:rtl;">${tag()}${tag()}${tag()}</div>`;
            };

            /* ─── دالة الطباعة الفعلية ─── */
            const finalPassengers = stkSelected.size > 0
              ? passengers.filter(pp => stkSelected.has(pp.id))
              : stkPassengers;

            const doPrint = () => {
              if (!finalPassengers.length) { showAlert("warning", "يرجى اختيار حاج واحد على الأقل."); return; }
              let html = "";
              const now = new Date().toLocaleDateString("ar-EG");
              const newDates: Record<number, string> = { ...printDates };
              for (const p of finalPassengers) {
                if (stkTypes.sticker)  html += buildStickerPage(p);
                if (stkTypes.hand_tag) html += buildHandTagPage(p).replace('<div style="width:297mm', '<div class="landscape-page" style="width:297mm');
                if (stkTypes.long_tag) html += buildLongTagPage(p);
                newDates[p.id] = now;
              }
              setPrintDates(newDates);
              localStorage.setItem("stk_print_dates", JSON.stringify(newDates));
              const full = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
                <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@700;800;900&family=El+Messiri:wght@600;700&display=swap" rel="stylesheet">
                <style>@page{size:A4;margin:0}@page landscape{size:A4 landscape;margin:0}body{margin:0;padding:0}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}.landscape-page{page:landscape;}</style>
                </head><body>${html}</body></html>`;
              printInPage(full);
            };

            return (
              <>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", marginBottom: 14 }}>مطبوعات الشنط</div>

                {/* Drawer جانبي */}
                {stkDrawerOpen && (
                  <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex" }}>
                    <div onClick={() => setStkDrawerOpen(false)} style={{ flex: 1, background: "rgba(0,0,0,.45)" }} />
                    <div style={{ width: 320, background: "var(--paper)", display: "flex", flexDirection: "column", boxShadow: "-8px 0 30px rgba(0,0,0,.2)", height: "100%", overflowY: "auto" }}>
                      <div style={{ padding: "16px 16px 10px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "var(--ink)" }}>اختيار الحجاج</div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => setStkSelected(new Set(passengers.map(pp => pp.id)))}
                            style={{ fontSize: 11.5, fontWeight: 700, padding: "5px 12px", borderRadius: 99, border: "1px solid var(--line)", background: "var(--paper)", cursor: "pointer", fontFamily: "inherit" }}>تحديد الكل</button>
                          <button onClick={() => setStkSelected(new Set())}
                            style={{ fontSize: 11.5, fontWeight: 700, padding: "5px 12px", borderRadius: 99, border: "1px solid var(--line)", background: "var(--paper)", cursor: "pointer", fontFamily: "inherit" }}>إلغاء الكل</button>
                        </div>
                      </div>
                      <div style={{ padding: "10px 16px" }}>
                        <input value={stkSearch} onChange={e => setStkSearch(e.target.value)} placeholder="بحث بالاسم..."
                          style={{ width: "100%", padding: "8px 12px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 13, fontFamily: "inherit", background: "var(--paper)", color: "var(--ink)", boxSizing: "border-box" }} />
                      </div>
                      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>
                        {passengers.filter(pp => !stkSearch || (pp.name_ar || "").includes(stkSearch)).map(pp => {
                          const checked = stkSelected.has(pp.id);
                          const lastPrint = printDates[pp.id];
                          return (
                            <div key={pp.id} onClick={() => setStkSelected(prev => { const n = new Set(prev); if (n.has(pp.id)) { n.delete(pp.id); } else { n.add(pp.id); } return n; })}
                              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 4px", borderBottom: "1px dashed var(--line)", cursor: "pointer" }}>
                              <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${checked ? "var(--primary)" : "var(--line)"}`, background: checked ? "var(--primary)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                {checked && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{pp.name_ar}</div>
                                {lastPrint && <div style={{ fontSize: 10.5, color: "var(--text-muted)", fontWeight: 600, marginTop: 1 }}>آخر طباعة: {lastPrint}</div>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ padding: "12px 16px", borderTop: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>{stkSelected.size} حاج محدد</div>
                        <button onClick={() => setStkDrawerOpen(false)}
                          style={{ padding: "8px 20px", borderRadius: 99, border: "none", background: "var(--primary)", color: "#fff", fontFamily: "inherit", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>تأكيد</button>
                      </div>
                    </div>
                  </div>
                )}

                {/* اختيار الحجاج */}
                <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 16px", marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 10 }}>اختيار الحجاج</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[
                      { id: "all", label: `الكل (${passengers.length})` },
                      { id: "bus",  label: "أوتوبيس محدد" },
                      { id: "room", label: "غرفة محددة" },
                    ].map(o => (
                      <button key={o.id} onClick={() => { setStkFilter(o.id as typeof stkFilter); setStkSelected(new Set()); }}
                        style={{ padding: "6px 14px", borderRadius: 99, border: `1.5px solid ${stkFilter === o.id && stkSelected.size === 0 ? "var(--primary)" : "var(--line)"}`, background: stkFilter === o.id && stkSelected.size === 0 ? "var(--primary)" : "var(--paper)", color: stkFilter === o.id && stkSelected.size === 0 ? "#fff" : "var(--ink)", fontFamily: "inherit", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                        {o.label}
                      </button>
                    ))}
                    <button onClick={() => setStkDrawerOpen(true)}
                      style={{ padding: "6px 14px", borderRadius: 99, border: `1.5px solid ${stkSelected.size > 0 ? "var(--primary)" : "var(--line)"}`, background: stkSelected.size > 0 ? "var(--primary)" : "var(--paper)", color: stkSelected.size > 0 ? "#fff" : "var(--ink)", fontFamily: "inherit", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                      {stkSelected.size > 0 ? `اختيار يدوي (${stkSelected.size})` : "اختيار يدوي"}
                    </button>
                  </div>
                  {stkFilter === "bus" && stkSelected.size === 0 && (
                    <select value={stkBusId ?? ""} onChange={e => setStkBusId(Number(e.target.value) || null)}
                      style={{ marginTop: 10, width: "100%", padding: "8px 12px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 13, fontFamily: "inherit", background: "var(--paper)", color: "var(--ink)" }}>
                      <option value="">اختر الأوتوبيس...</option>
                      {buses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  )}
                  {stkFilter === "room" && stkSelected.size === 0 && (
                    <select value={stkRoomId ?? ""} onChange={e => setStkRoomId(Number(e.target.value) || null)}
                      style={{ marginTop: 10, width: "100%", padding: "8px 12px", borderRadius: 9, border: "1px solid var(--line)", fontSize: 13, fontFamily: "inherit", background: "var(--paper)", color: "var(--ink)" }}>
                      <option value="">اختر الغرفة...</option>
                      {rooms.map(r => <option key={r.id} value={r.id}>غرفة {r.number}{r.floor ? ` — الدور ${r.floor}` : ""}</option>)}
                    </select>
                  )}
                  <div style={{ marginTop: 10, fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)" }}>
                    {finalPassengers.length} حاج محدد
                  </div>
                </div>

                {/* اختيار نوع الورقة */}
                <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 10 }}>نوع الورقة المطبوعة</div>
                  {[
                    { key: "sticker",  label: "الاستيكر العريض",    sub: "3 استيكرات للشنط الثلاث" },
                    { key: "hand_tag", label: "تاج اليد",          sub: "3 شرائط تلتف على المقبض" },
                    { key: "long_tag", label: "التاج الطولي",      sub: "3 تاجات كلاسيكية معلقة" },
                  ].map(t => (
                    <div key={t.key} onClick={() => setStkTypes(prev => ({ ...prev, [t.key]: !prev[t.key as keyof typeof prev] }))}
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 2px", borderBottom: "1px dashed var(--line)", cursor: "pointer" }}>
                      <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${stkTypes[t.key as keyof typeof stkTypes] ? "var(--primary)" : "var(--line)"}`, background: stkTypes[t.key as keyof typeof stkTypes] ? "var(--primary)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .2s" }}>
                        {stkTypes[t.key as keyof typeof stkTypes] && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{t.label}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{t.sub}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* ملخص + زرار الطباعة */}
                <div style={{ background: "rgba(212,160,23,.06)", border: "1px solid rgba(212,160,23,.35)", borderRadius: 12, padding: "12px 16px", marginBottom: 14 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "#8a6a10" }}>
                    إجمالي الأوراق: {stkPassengers.length * [stkTypes.sticker, stkTypes.hand_tag, stkTypes.long_tag].filter(Boolean).length} ورقة A4 لاصقة
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
                    {stkPassengers.length} حاج × {[stkTypes.sticker && "استيكر عريض", stkTypes.hand_tag && "تاج يد", stkTypes.long_tag && "تاج طولي"].filter(Boolean).join(" + ")} = {stkPassengers.length * [stkTypes.sticker, stkTypes.hand_tag, stkTypes.long_tag].filter(Boolean).length} ورقة
                  </div>
                </div>

                <button onClick={doPrint} style={{ width: "100%", padding: "13px 0", borderRadius: 12, border: "none", background: "var(--primary)", color: "#fff", fontFamily: "inherit", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
                  طباعة {stkPassengers.length * [stkTypes.sticker, stkTypes.hand_tag, stkTypes.long_tag].filter(Boolean).length} ورقة
                </button>
              </>
            );
          })()}

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
                      <div key={p.id} onClick={() => setWaSelectedIds(prev => { const n = new Set(prev); if (n.has(p.id)) { n.delete(p.id); } else { n.add(p.id); } return n; })}
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
                  <div style={{ fontSize: 11, color: "var(--success)", fontWeight: 600, marginBottom: 8 }}>معاينة — {passengers[0].short_ar || passengers[0].name_ar}</div>
                  <div style={{ fontSize: 12, whiteSpace: "pre-wrap", lineHeight: 1.8, direction: "rtl" }}>
                    {waTemplate
                      .replace("{الاسم}", passengers[0].short_ar || passengers[0].name_ar)
                      .replace("{الباص}", buses.find(b => b.id === passengers[0]?.bus_id)?.name || "—")
                      .replace("{الرحلة}", flightNameFor(passengers[0]))
                      .replace("{الغرفة}", rooms.find(r => r.id === passengers[0]?.room_id)?.number || "—")
                      .replace("{منى}", camps.find(c => c.id === passengers[0]?.camp_mina_id)?.name || "—")
                      .replace("{عرفة}", camps.find(c => c.id === passengers[0]?.camp_arafa_id)?.name || "—")
                    }
                  </div>
                  {(waSendDocs.permit || waSendDocs.ticket) && (
                    <div style={{ marginTop: 8, fontSize: 11, color: "var(--success)" }}>
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
                      .replace("{الباص}", buses.find(b => b.id === p.bus_id)?.name || "—")
                      .replace("{الرحلة}", flightNameFor(p))
                      .replace("{الغرفة}", rooms.find(r => r.id === p.room_id)?.number || "—")
                      .replace("{منى}", camps.find(c => c.id === p.camp_mina_id)?.name || "—")
                      .replace("{عرفة}", camps.find(c => c.id === p.camp_arafa_id)?.name || "—");
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
                      .replace("{الباص}", buses.find(b => b.id === p.bus_id)?.name || "—")
                      .replace("{الرحلة}", flightNameFor(p))
                      .replace("{الغرفة}", rooms.find(r => r.id === p.room_id)?.number || "—")
                      .replace("{منى}", camps.find(c => c.id === p.camp_mina_id)?.name || "—")
                      .replace("{عرفة}", camps.find(c => c.id === p.camp_arafa_id)?.name || "—");
                    const res = await fetch(`https://graph.facebook.com/v18.0/${waPhoneId}/messages`, {
                      method: "POST",
                      headers: { "Authorization": `Bearer ${waToken}`, "Content-Type": "application/json" },
                      body: JSON.stringify({ messaging_product: "whatsapp", to: p.phone.replace(/\D/g, ""), type: "text", text: { body: text } })
                    });
                    if (res.ok) {
                      // بعت التصريح لو مختار
                      if (waSendDocs.permit && p.hajj_permit_url) {
                        const path = p.hajj_permit_url.split("/passengers-docs/")[1]?.split("?")[0];
                        if (path) {
                          const { data } = await supabase.storage.from("passengers-docs").createSignedUrl(path, 60 * 60 * 24 * 30);
                          if (data?.signedUrl) await fetch(`https://graph.facebook.com/v18.0/${waPhoneId}/messages`, { method: "POST", headers: { "Authorization": `Bearer ${waToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", to: p.phone.replace(/\D/g, ""), type: "document", document: { link: data.signedUrl, caption: "تصريح السفر" } }) });
                        }
                      }
                      // بعت التذكرة لو مختارة
                      if (waSendDocs.ticket && p.flight_ticket_url) {
                        const path = p.flight_ticket_url.split("/passengers-docs/")[1]?.split("?")[0];
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
