import { useState, useMemo, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../supabase";
import type { Passenger, User } from "../types";
import { Avatar } from "./Avatar";
import { Modal } from "./Modal";
import { AlertModal, useAlert } from "./AlertModal";
import { StatsRow, type StatCardData } from "./StatCard";
import { useConfig } from "../config/ConfigContext";
import { makeShort, scanDocument, uploadDoc, downloadFile, getStoragePath, isExpired, isExpiringSoon, makeHTML, printInPage, freezeHeaderRow, addSummarySheet, timeAgo, inp, btnP, btnS } from "../utils";

// تطابق تقريبي للأسماء (مشاركة كلمتين على الأقل) — يُستخدم لاقتراح حجاج مطابقين عند مسح بطاقة شخصية
function nameMatches(a?: string | null, b?: string | null): boolean {
  const norm = (s?: string | null) => (s || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  const wa = norm(a), wb = norm(b);
  if (!wa.length || !wb.length) return false;
  const common = wa.filter(w => wb.includes(w)).length;
  return common >= Math.min(2, Math.min(wa.length, wb.length));
}

// مطابقة مشددة: الاسم الأول متطابق + نفس شرط الكلمتين المشتركتين أعلاه — تقلل المرشحين الخاطئين بشكل كبير
function strongNameMatch(a?: string | null, b?: string | null): boolean {
  const norm = (s?: string | null) => (s || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  const wa = norm(a), wb = norm(b);
  if (!wa.length || !wb.length) return false;
  if (wa[0] !== wb[0]) return false;
  return nameMatches(a, b);
}

function PassengersStats({ passengers }: { passengers: Passenger[] }) {

  const stats = useMemo(() => {
    const hajj = passengers.filter(p => !p.passenger_type || p.passenger_type === "حاج");
    const total = hajj.length;
    const males = hajj.filter(p => p.gender === "ذكر").length;
    const females = hajj.filter(p => p.gender === "أنثى").length;
    const docsComplete = (p: Passenger) => !!(p.photo_url && p.passport_url && p.national_id_url);
    const docsDone = hajj.filter(docsComplete).length;
    const docPct = total ? Math.round(docsDone / total * 100) : 0;
    return { total, males, females, docsDone, docPct };
  }, [passengers]);

  const { total, males, females, docsDone, docPct } = stats;

  const cards: StatCardData[] = [
    { label: "إجمالي الحجاج", num: total, sub: "الموسم الحالي", tone: "brand" },
    { label: "رجال", num: males, sub: `${total ? Math.round(males/total*100) : 0}٪ من الإجمالي`, tone: "info" },
    { label: "نساء", num: females, sub: `${total ? Math.round(females/total*100) : 0}٪ من الإجمالي`, tone: "female" },
    { label: "اكتمال المستندات", num: `${docPct}٪`, sub: `${docsDone} من ${total}`, tone: "success" },
  ];
  return <StatsRow cards={cards} />;
}

function PassengersPage({ passengers, setPassengers, currentUser, globalShowManual, onGlobalManualClose }: { passengers: Passenger[]; setPassengers: (p: Passenger[]) => void; currentUser?: User; globalShowManual?: boolean; onGlobalManualClose?: () => void }) {
  const config = useConfig();
  const { alert: alertState, showAlert } = useAlert();
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "table">("list");
  const [selected, setSelected] = useState<Passenger | null>(null);
  const [editing, setEditing] = useState<Passenger | null>(null);
  const [metaBuses, setMetaBuses] = useState<any[]>([]);
  const [metaRooms, setMetaRooms] = useState<any[]>([]);
  const [metaCamps, setMetaCamps] = useState<any[]>([]);

  useEffect(() => {
    supabase.from("buses").select("id,name").then(({ data }) => { if (data) setMetaBuses(data); });
    supabase.from("rooms").select("id,number").then(({ data }) => { if (data) setMetaRooms(data); });
    supabase.from("camps").select("id,name,page_type").then(({ data }) => { if (data) setMetaCamps(data); });
  }, []);

  // استقبال scan من Dashboard
  useEffect(() => {
    const file = (window as any).__hajj_pending_scan_file__;
    if (file) {
      (window as any).__hajj_pending_scan_file__ = null;
      runUnifiedScan(file);
    }
  }, []);

  // فتح مودال الإضافة اليدوية من الداشبورد
  useEffect(() => {
    if (globalShowManual) {
      resetManualModal();
      setShowManual(true);
      onGlobalManualClose?.();
    }
  }, [globalShowManual]);
  

  const COLS = [
    { key: "name_ar", label: "الاسم بالعربي" },
    { key: "name_en", label: "الاسم بالإنجليزي" },
    { key: "passport", label: "رقم الجواز" },
    { key: "national_id", label: "رقم البطاقة" },
    { key: "nat", label: "الجنسية" },
    { key: "gender", label: "الجنس" },
    { key: "dob", label: "تاريخ الميلاد" },
    { key: "expiry", label: "انتهاء الجواز" },
    { key: "phone", label: "التليفون" },
    { key: "bus", label: "الباص", get: (p: Passenger) => p.services?.bus },
    { key: "flight", label: "الطيران", get: (p: Passenger) => p.services?.flight },
    { key: "hotel_type", label: "نوع الغرفة", get: (p: Passenger) => p.services?.hotel_type },
    { key: "hotel_view", label: "إطلالة الغرفة", get: (p: Passenger) => p.services?.hotel_view },
    { key: "camp_mina", label: "منى", get: (p: Passenger) => p.services?.camp_mina },
    { key: "camp_arafa", label: "عرفة", get: (p: Passenger) => p.services?.camp_arafa },
  ] as { key: string; label: string; get?: (p: Passenger) => string }[];

  const getVal = (p: Passenger, key: string, getter?: (p: Passenger) => string) => {
    if (getter) return getter(p) || "";
    return (p as any)[key] || "";
  };

  // فلتر متعدد
  const [filters, setFilters] = useState<Record<string, string>>({});
  const setFilter = (key: string, val: string) => setFilters(prev => val ? { ...prev, [key]: val } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key)));

  const QUICK_FILTERS = [
    { key: "gender", label: "الجنس", opts: ["ذكر", "أنثى"] },
    { key: "bus", label: "الباص", opts: ["عادي", "VIP", "بدون"] },
    { key: "flight", label: "الطيران", opts: ["عادي", "درجة أولى", "بدون"] },
    { key: "hotel_type", label: "نوع الغرفة", opts: ["فردية", "ثنائية", "ثلاثية", "رباعية"] },
    { key: "hotel_view", label: "الإطلالة", opts: ["مطلة", "غير مطلة"] },
    { key: "camp_mina", label: "منى", opts: ["عادي", "خاص", "بدون"] },
    { key: "camp_arafa", label: "عرفة", opts: ["عادي", "خاص", "بدون"] },
    { key: "nat", label: "الجنسية", opts: [...new Set(passengers.map(p => p.nat).filter(Boolean))] },
  ];

  const filtered = useMemo(() => passengers
    .filter(p => {
      if (p.passenger_type && p.passenger_type !== "حاج") return false;
      const fullName = `${p.name_ar} ${p.name_en}`;
      if (search && !fullName.toLowerCase().includes(search.toLowerCase()) &&
        ![p.passport, p.national_id, p.nat, p.phone, p.gender].join(" ").toLowerCase().includes(search.toLowerCase())) return false;
      for (const [key, val] of Object.entries(filters)) {
        if (!val) continue;
        const pval = key === "bus" ? p.services?.bus :
                     key === "flight" ? p.services?.flight :
                     key === "hotel_type" ? p.services?.hotel_type :
                     key === "hotel_view" ? p.services?.hotel_view :
                     key === "camp_mina" ? p.services?.camp_mina :
                     key === "camp_arafa" ? p.services?.camp_arafa :
                     (p as any)[key];
        if (pval !== val) return false;
      }
      return true;
    })
    .sort((a, b) => ((a as any).sort_order || 0) - ((b as any).sort_order || 0)),
  [passengers, search, filters]);

  // ===== طباعة كشف الحجاج الحالي (بعد البحث/الفلاتر) =====
  const printList = () => {
    const headers = COLS.map(c => `<th style="padding:4pt 6pt;background:${config.color_primary || "#6B1F3A"};color:#fff;text-align:right;font-size:8pt">${c.label}</th>`).join("");
    const rows = filtered.map((p, i) =>
      `<tr style="background:${i % 2 === 0 ? "#fff" : "#f9f6f2"}">
        <td style="text-align:center;padding:4pt 5pt;border:0.5pt solid #ddd;font-size:8pt">${i + 1}</td>
        ${COLS.map(col => `<td style="padding:4pt 5pt;border:0.5pt solid #ddd;font-size:8pt;white-space:normal">${getVal(p, col.key, col.get)}</td>`).join("")}
      </tr>`
    ).join("");
    const body = `<table style="width:100%;border-collapse:collapse;table-layout:fixed">
      <thead><tr><th style="text-align:center;padding:4pt 5pt;background:${config.color_primary || "#6B1F3A"};color:#fff;width:20pt;font-size:8pt">م</th>${headers}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
    const html = makeHTML("كشف الحجاج", body, true, config.logo_url || "", config.name_ar || "حملة الأقصى", config.tagline || "", config.color_primary || "#6B1F3A", config.color_accent || "#0C447C");
    printInPage(html);
  };

  // ===== تصدير كشف الحجاج الحالي إكسيل (بعد البحث/الفلاتر) =====
  const exportExcel = () => {
    const headers = ["م", ...COLS.map(c => c.label)];
    const rows = filtered.map((p, i) => [i + 1, ...COLS.map(col => getVal(p, col.key, col.get) || "—")]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = [{ wch: 4 }, ...COLS.map(() => ({ wch: 18 }))];
    freezeHeaderRow(ws);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الحجاج");
    addSummarySheet(wb, XLSX, "كشف الحجاج", config.name_ar || "حملة الأقصى", [
      ["إجمالي عدد الحجاج", filtered.length],
      ["عدد الرجال", filtered.filter(p => p.gender === "ذكر").length],
      ["عدد النساء", filtered.filter(p => p.gender === "أنثى").length],
    ]);
    XLSX.writeFile(wb, "كشف_الحجاج.xlsx");
  };

  const [docUploading, setDocUploading] = useState<string | null>(null);
  const [docViewer, setDocViewer] = useState<{ url: string; label: string } | null>(null);
  const [showManual, setShowManual] = useState(false);
  const DEFAULT_MANUAL_FORM = { name_ar: "", name_en: "", short_ar: "", short_en: "", passport: "", national_id: "", nat: "قطري", dob: "", expiry: "", id_expiry: "", gender: "ذكر", phone: "" };
  const DEFAULT_MANUAL_SERVICES = { bus: "عادي", flight: "عادي", hotel_type: "ثنائية", hotel_view: "غير مطلة", camp_mina: "عادي", camp_arafa: "عادي" };
  const [manualForm, setManualForm] = useState(DEFAULT_MANUAL_FORM);
  const [manualServices, setManualServices] = useState(DEFAULT_MANUAL_SERVICES);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualPassportImg, setManualPassportImg] = useState<string | null>(null);
  const [manualPassportFile, setManualPassportFile] = useState<File | null>(null);
  const [manualIdImg, setManualIdImg] = useState<string | null>(null);
  const [manualIdFile, setManualIdFile] = useState<File | null>(null);
  const [manualScanning, setManualScanning] = useState(false);
  const [autoScanning, setAutoScanning] = useState(false);
  const [docMatchCandidates, setDocMatchCandidates] = useState<Passenger[] | null>(null);
  const [pendingDocScan, setPendingDocScan] = useState<{ file: File; dataUrl: string; parsed: any; docKind: "idcard" | "hajj_permit" | "passport" } | null>(null);
  const [compareCandidate, setCompareCandidate] = useState<Passenger | null>(null);

  const resetManualModal = () => {
    setManualPassportImg(null); setManualPassportFile(null);
    setManualIdImg(null); setManualIdFile(null);
    setManualForm(DEFAULT_MANUAL_FORM);
    setManualServices(DEFAULT_MANUAL_SERVICES);
  };

  // مسح موحّد: يتعرف على نوع المستند (جواز / بطاقة / تصريح حج) ويتصرف تلقائيًا
  const runUnifiedScan = async (file: File) => {
    setAutoScanning(true);
    const reader = new FileReader();
    reader.onload = async ev => {
      const dataUrl = ev.target?.result as string;
      try {
        const parsed = await scanDocument(file, "auto");
        if (parsed.doc_type === "hajj_permit") {
          // تصريح حج — يتطلب تطابقًا تامًا في رقم البطاقة أو رقم الجواز فقط (بدون مطابقة بالاسم)
          const permitId = parsed.national_id || "";
          const permitPassport = parsed.passport || "";
          let candidates: Passenger[] = [];
          if (permitId) candidates = passengers.filter(p => p.national_id === permitId);
          if (candidates.length === 0 && permitPassport) candidates = passengers.filter(p => p.passport === permitPassport);
          setPendingDocScan({ file, dataUrl, parsed, docKind: "hajj_permit" });
          setDocMatchCandidates(candidates);
        } else if (parsed.doc_type === "idcard") {
          // بطاقة شخصية — دايمًا تأكيد قبل الربط أو فتح الإضافة (تجنب الدبلكيت)
          const idNum = parsed.national_id || "";
          const nameAr = parsed.name_ar || "";
          const nameEn = parsed.name_en || "";
          if (idNum) {
            const exactId = passengers.find(p => p.national_id === idNum);
            if (exactId && (exactId as any).national_id_url) {
              showAlert("warning", `هذه البطاقة مسجَّلة بالفعل في ملف ${exactId.short_ar || exactId.name_ar}`);
              setAutoScanning(false);
              return;
            }
          }
          let candidates: Passenger[] = [];
          if (idNum) candidates = passengers.filter(p => p.national_id === idNum);
          if (candidates.length === 0 && (nameAr || nameEn)) {
            candidates = passengers.filter(p =>
              (!parsed.gender || p.gender === parsed.gender) &&
              ((nameAr && (strongNameMatch(p.name_ar, nameAr) || strongNameMatch(p.short_ar, nameAr))) ||
              (nameEn && (strongNameMatch(p.name_en, nameEn) || strongNameMatch(p.short_en, nameEn))))
            );
          }
          setPendingDocScan({ file, dataUrl, parsed, docKind: "idcard" });
          setDocMatchCandidates(candidates);
        } else {
          // جواز سفر — تحقق أولًا من تكرار رقم الجواز نفسه، ثم من وجود حاج مطابق قبل فتح الإضافة
          const passportNum = parsed.passport || "";
          const idNum = parsed.national_id || "";
          const nameAr = parsed.name_ar || "";
          const nameEn = parsed.name_en || "";
          if (passportNum) {
            const exactPassport = passengers.find(p => p.passport === passportNum);
            if (exactPassport) {
              showAlert("warning", `هذا الجواز مسجَّل بالفعل في ملف ${exactPassport.short_ar || exactPassport.name_ar}`);
              setAutoScanning(false);
              return;
            }
          }
          let candidates: Passenger[] = [];
          if (idNum) candidates = passengers.filter(p => p.national_id === idNum);
          if (candidates.length === 0 && (nameAr || nameEn)) {
            candidates = passengers.filter(p =>
              (!parsed.gender || p.gender === parsed.gender) &&
              ((nameAr && (strongNameMatch(p.name_ar, nameAr) || strongNameMatch(p.short_ar, nameAr))) ||
              (nameEn && (strongNameMatch(p.name_en, nameEn) || strongNameMatch(p.short_en, nameEn))))
            );
          }
          if (candidates.length > 0) {
            setPendingDocScan({ file, dataUrl, parsed, docKind: "passport" });
            setDocMatchCandidates(candidates);
          } else {
            resetManualModal();
            setManualPassportImg(dataUrl); setManualPassportFile(file);
            setManualForm(prev => ({
              ...prev,
              name_en: parsed.name_en || prev.name_en,
              short_en: parsed.name_en ? makeShort(parsed.name_en) : prev.short_en,
              name_ar: parsed.name_ar || prev.name_ar,
              short_ar: parsed.name_ar ? makeShort(parsed.name_ar) : prev.short_ar,
              passport: parsed.passport || prev.passport,
              national_id: parsed.national_id || prev.national_id,
              nat: parsed.nationality || prev.nat,
              dob: parsed.dob || prev.dob,
              expiry: parsed.expiry || prev.expiry,
              gender: parsed.gender || prev.gender,
            }));
            setShowManual(true);
          }
        }
      } catch {
        // فشل القراءة — افتح مودال الإضافة اليدوي فاضي
        resetManualModal();
        setShowManual(true);
      }
      setAutoScanning(false);
    };
    reader.readAsDataURL(file);
  };

  // ربط الصورة (بطاقة أو تصريح) بحاج موجود بالفعل
  const linkDocToExisting = async (passenger: Passenger) => {
    if (!pendingDocScan) return;
    const { file, parsed, docKind } = pendingDocScan;
    setAutoScanning(true);
    if (docKind === "hajj_permit") {
      const url = await uploadDoc(file, passenger.id, "hajj_permit");
      if (url) {
        await supabase.from("passengers").update({ hajj_permit_url: url }).eq("id", passenger.id);
        const updated = { ...passenger, hajj_permit_url: url } as Passenger;
        setPassengers(passengers.map(x => x.id === passenger.id ? updated : x));
        showAlert("success", `تم حفظ تصريح الحج في ملف ${passenger.short_ar || passenger.name_ar} بنجاح`);
      } else {
        showAlert("error", "فشل رفع الملف، يرجى المحاولة مرة أخرى");
      }
    } else if (docKind === "idcard") {
      const url = await uploadDoc(file, passenger.id, "idcard");
      if (url) {
        const updates: any = { national_id_url: url };
        if (!passenger.national_id && parsed.national_id) updates.national_id = parsed.national_id;
        if (!(passenger as any).id_expiry && parsed.id_expiry) updates.id_expiry = parsed.id_expiry;
        if (!passenger.dob && parsed.dob) updates.dob = parsed.dob;
        await supabase.from("passengers").update(updates).eq("id", passenger.id);
        const updated = { ...passenger, ...updates } as Passenger;
        setPassengers(passengers.map(x => x.id === passenger.id ? updated : x));
        showAlert("success", `تم ربط البطاقة الشخصية بملف ${passenger.short_ar || passenger.name_ar} بنجاح`);
      } else {
        showAlert("error", "فشل رفع الملف، يرجى المحاولة مرة أخرى");
      }
    } else {
      // passport — حفظ الصورة وإضافة البيانات التكميلية الفاضية فقط
      const url = await uploadDoc(file, passenger.id, "passport_doc");
      if (url) {
        const updates: any = { passport_url: url };
        if (!passenger.passport && parsed.passport) updates.passport = parsed.passport;
        if (!passenger.national_id && parsed.national_id) updates.national_id = parsed.national_id;
        if (!(passenger as any).expiry && parsed.expiry) updates.expiry = parsed.expiry;
        if (!passenger.dob && parsed.dob) updates.dob = parsed.dob;
        if (!passenger.gender && parsed.gender) updates.gender = parsed.gender;
        if (!passenger.name_en && parsed.name_en) {
          updates.name_en = parsed.name_en;
          updates.short_en = makeShort(parsed.name_en);
        }
        await supabase.from("passengers").update(updates).eq("id", passenger.id);
        const updated = { ...passenger, ...updates } as Passenger;
        setPassengers(passengers.map(x => x.id === passenger.id ? updated : x));
        showAlert("success", `تم حفظ صورة جواز السفر وتحديث بيانات ملف ${passenger.short_ar || passenger.name_ar} بنجاح`);
      } else {
        showAlert("error", "فشل رفع الملف، يرجى المحاولة مرة أخرى");
      }
    }
    setAutoScanning(false);
    setDocMatchCandidates(null); setPendingDocScan(null);
    setCompareCandidate(null);
  };

  // الحاج جديد — افتح مودال الإضافة مع البيانات المستخرجة (بطاقة أو جواز)
  const proceedDocAsNew = () => {
    if (!pendingDocScan || pendingDocScan.docKind === "hajj_permit") return;
    const { dataUrl, file, parsed, docKind } = pendingDocScan;
    resetManualModal();
    if (docKind === "idcard") {
      setManualIdImg(dataUrl); setManualIdFile(file);
      setManualForm(prev => ({
        ...prev,
        national_id: parsed.national_id || prev.national_id,
        id_expiry: parsed.id_expiry || prev.id_expiry,
        name_ar: parsed.name_ar || prev.name_ar,
        short_ar: parsed.name_ar ? makeShort(parsed.name_ar) : prev.short_ar,
        name_en: parsed.name_en || prev.name_en,
        short_en: parsed.name_en ? makeShort(parsed.name_en) : prev.short_en,
        nat: parsed.nationality || prev.nat,
        dob: parsed.dob || prev.dob,
        gender: parsed.gender || prev.gender,
      }));
    } else {
      setManualPassportImg(dataUrl); setManualPassportFile(file);
      setManualForm(prev => ({
        ...prev,
        name_en: parsed.name_en || prev.name_en,
        short_en: parsed.name_en ? makeShort(parsed.name_en) : prev.short_en,
        name_ar: parsed.name_ar || prev.name_ar,
        short_ar: parsed.name_ar ? makeShort(parsed.name_ar) : prev.short_ar,
        passport: parsed.passport || prev.passport,
        national_id: parsed.national_id || prev.national_id,
        nat: parsed.nationality || prev.nat,
        dob: parsed.dob || prev.dob,
        expiry: parsed.expiry || prev.expiry,
        gender: parsed.gender || prev.gender,
      }));
    }
    setShowManual(true);
    setDocMatchCandidates(null); setPendingDocScan(null);
    setCompareCandidate(null);
  };

  const cancelDocScan = () => {
    setDocMatchCandidates(null); setPendingDocScan(null);
    setCompareCandidate(null);
  };

  const handleManualSave = async () => {
    if (!manualForm.name_ar && !manualForm.name_en) { showAlert("warning", "يرجى إدخال الاسم على الأقل"); return; }
    const dupP = manualForm.passport && passengers.some((p: Passenger) => p.passport === manualForm.passport);
    const dupN = manualForm.national_id && passengers.some((p: Passenger) => p.national_id === manualForm.national_id);
    if (dupP) { showAlert("warning", "رقم جواز السفر هذا مسجَّل بالفعل لحاج آخر"); return; }
    if (dupN) { showAlert("warning", "رقم البطاقة الشخصية هذا مسجَّل بالفعل لحاج آخر"); return; }
    setManualSaving(true);
    const short_ar = makeShort(manualForm.name_ar);
    const short_en = makeShort(manualForm.name_en);
    const { data, error } = await supabase.from("passengers").insert([{ ...manualForm, short_ar, short_en, bus: manualServices.bus, flight: manualServices.flight, hotel_type: manualServices.hotel_type, hotel_view: manualServices.hotel_view, camp_mina: manualServices.camp_mina, camp_arafa: manualServices.camp_arafa, created_by: currentUser?.name || null }]).select();
    if (error) {
      console.error("Manual save error:", error);
      showAlert("error", `فشل حفظ البيانات: ${error.message || "يرجى المحاولة مرة أخرى"}`);
      setManualSaving(false);
      return;
    }
    if (data && data[0]) {
      const newId = data[0].id;
      const docUpdates: any = {};
      if (manualPassportFile) {
        const url = await uploadDoc(manualPassportFile, newId, "passport_doc");
        if (url) docUpdates.passport_url = url;
      }
      if (manualIdFile) {
        const url = await uploadDoc(manualIdFile, newId, "idcard");
        if (url) docUpdates.national_id_url = url;
      }
      if (Object.keys(docUpdates).length > 0) {
        await supabase.from("passengers").update(docUpdates).eq("id", newId);
      }
      setPassengers([{ id: newId, ...manualForm, short_ar, short_en, services: manualServices, rel: "", linked: -1, created_by: data[0].created_by, created_at: data[0].created_at, ...docUpdates } as Passenger, ...passengers]);
      setShowManual(false);
      resetManualModal();
    }
    setManualSaving(false);
  };

  const [permitConfirm, setPermitConfirm] = useState<{ url: string; field: string; passenger: Passenger; idNum: string } | null>(null);
  const [showVerify, setShowVerify] = useState(false);
  const [verifyData, setVerifyData] = useState<{ passportUrl: string; idUrl: string; passenger: any; updates: any; isQatari: boolean; idMismatch: boolean; } | null>(null);

  const handleDocUpload = async (p: Passenger, docType: string, field: string, file: File) => {
    setDocUploading(docType);
    if (docType === "passport_doc") {
      const [url, parsed] = await Promise.all([uploadDoc(file, p.id, docType), scanDocument(file, "passport")]);
      const updates: any = {};
      if (url) updates.passport_url = url;
      if (parsed.name_en) { updates.name_en = parsed.name_en; updates.short_en = makeShort(parsed.name_en); }
      if (parsed.name_ar) { updates.name_ar = parsed.name_ar; updates.short_ar = makeShort(parsed.name_ar); }
      if (parsed.passport) updates.passport = parsed.passport;
      if (parsed.nationality) updates.nat = parsed.nationality;
      if (parsed.dob) updates.dob = parsed.dob;
      if (parsed.expiry) updates.expiry = parsed.expiry;
      if (parsed.gender) updates.gender = parsed.gender;
      setDocUploading(null);
      // لو في بطاقة موجودة → عرض مودال التحقق
      if (p.national_id_url) {
        setVerifyData({ passportUrl: url || p.passport_url || "", idUrl: p.national_id_url, passenger: p, updates, isQatari: p.nat === "قطري", idMismatch: false });
        setShowVerify(true);
      } else {
        await saveDocUpdates(p, updates);
      }
    } else if (docType === "idcard") {
      const [url, parsed] = await Promise.all([uploadDoc(file, p.id, docType), scanDocument(file, "idcard")]);
      const updates: any = {};
      if (url) updates.national_id_url = url;
      if (parsed.national_id) updates.national_id = parsed.national_id;
      if (parsed.id_expiry) updates.id_expiry = parsed.id_expiry;
      setDocUploading(null);
      // لو في جواز موجود → عرض مودال التحقق
      if (p.passport_url) {
        const isQatari = p.nat === "قطري";
        const idMismatch = isQatari && parsed.national_id && p.national_id && parsed.national_id !== p.national_id;
        setVerifyData({ passportUrl: p.passport_url || "", idUrl: url || p.national_id_url || "", passenger: p, updates, isQatari, idMismatch: !!idMismatch });
        setShowVerify(true);
      } else {
        await saveDocUpdates(p, updates);
      }
    } else if (docType === "hajj_permit") {
      // OCR تصريح السفر — يقرأ رقم البطاقة ويدور على الحاج
      const [url, parsed] = await Promise.all([
        uploadDoc(file, p.id, docType),
        scanDocument(file, "hajj_permit")
      ]);
      setDocUploading(null);
      if (url) {
        // دور على الحاج بالبطاقة أو الجواز
        const idNum = parsed.national_id || parsed.passport || "";
        const matched = idNum
          ? passengers.find(x => x.national_id === idNum || x.passport === idNum)
          : null;

        if (matched) {
          // طلع رسالة تأكيد
          setPermitConfirm({ url, field, passenger: matched, idNum });
        } else {
          // مش لاقي حاج → ارفع على الحاج الحالي بدون تأكيد
          await supabase.from("passengers").update({ [field]: url }).eq("id", p.id);
          const updated = { ...p, [field]: url };
          setPassengers(passengers.map((x: Passenger) => x.id === p.id ? updated : x));
          setSelected(updated);
          if (idNum) showAlert("warning", `تمت قراءة الرقم "${idNum}" من المستند، لكنه غير موجود في القائمة — تم رفع الملف على ${p.short_ar || p.name_ar}`);
        }
      }
    } else {
      const url = await uploadDoc(file, p.id, docType);
      if (url) {
        await supabase.from("passengers").update({ [field]: url }).eq("id", p.id);
        const updated = { ...p, [field]: url };
        setPassengers(passengers.map((x: Passenger) => x.id === p.id ? updated : x));
        setSelected(updated);
      }
      setDocUploading(null);
    }
  };

  const saveDocUpdates = async (p: Passenger, updates: Partial<Passenger>) => {
    await supabase.from("passengers").update(updates).eq("id", p.id);
    const updated = { ...p, ...updates };
    setPassengers(passengers.map((x: Passenger) => x.id === p.id ? updated : x));
    setSelected(updated);
  };

  const confirmVerify = async () => {
    if (!verifyData) return;
    await saveDocUpdates(verifyData.passenger, verifyData.updates);
    setShowVerify(false); setVerifyData(null);
  };

  const handleDocDelete = async (p: Passenger, field: string, url: string) => {
    if (!confirm("هتمسح المستند ده؟")) return;
    const path = getStoragePath(url);
    if (path) await supabase.storage.from("passengers-docs").remove([path]);
    await supabase.from("passengers").update({ [field]: null }).eq("id", p.id);
    const updated = { ...p, [field]: null };
    setPassengers(passengers.map((x: Passenger) => x.id === p.id ? updated : x));
    setSelected(updated);
  };
  const [showLinkFamily, setShowLinkFamily] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");

  const handleLinkFamily = async (p1: Passenger, p2: Passenger) => {
    const familyId = p1.family_id || p2.family_id || `fam_${Date.now()}`;
    await supabase.from("passengers").update({ family_id: familyId }).eq("id", p1.id);
    await supabase.from("passengers").update({ family_id: familyId }).eq("id", p2.id);
    const updated1 = { ...p1, family_id: familyId };
    const updated2 = { ...p2, family_id: familyId };
    setPassengers(passengers.map(p => p.id === p1.id ? updated1 : p.id === p2.id ? updated2 : p));
    setSelected(updated1);
    setShowLinkFamily(false); setLinkSearch("");
  };

  const handleUnlinkFamily = async (p: Passenger) => {
    if (!confirm("هتفك الارتباط العائلي لهذا الحاج؟")) return;
    await supabase.from("passengers").update({ family_id: null }).eq("id", p.id);
    const updated = { ...p, family_id: null };
    setPassengers(passengers.map(x => x.id === p.id ? updated : x));
    setSelected(updated);
  };

  const getFamilyMembers = (p: Passenger) => p.family_id ? passengers.filter(x => x.family_id === p.family_id && x.id !== p.id) : [];

  const deleteP = async (id: number) => {
    await supabase.from("passengers").delete().eq("id", id);
    setPassengers(passengers.filter(p => p.id !== id));
    setSelected(null);
  };

  const moveP_order = async (p: Passenger, direction: "up" | "down") => {
    const sorted = [...passengers].sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
    const idx = sorted.findIndex((x: Passenger) => x.id === p.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx] as any;
    const myOrder = (p as any).sort_order || 0;
    const otherOrder = other.sort_order || 0;
    await Promise.all([
      supabase.from("passengers").update({ sort_order: otherOrder }).eq("id", p.id),
      supabase.from("passengers").update({ sort_order: myOrder }).eq("id", other.id),
    ]);
    setPassengers((passengers as any[]).map((x: any) =>
      x.id === p.id ? { ...x, sort_order: otherOrder } :
      x.id === other.id ? { ...x, sort_order: myOrder } : x
    ) as Passenger[]);
  };

  // ===== Drag & Drop =====
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const dragFromId = useRef<number | null>(null);
  const dragToId = useRef<number | null>(null);

  const handleDragStart = (pId: number) => { dragFromId.current = pId; setDraggingId(pId); };
  const handleDragOver = (e: React.DragEvent, pId: number) => { e.preventDefault(); dragToId.current = pId; setDragOverId(pId); };
  const handleDragEnd = () => { setDraggingId(null); setDragOverId(null); dragFromId.current = null; dragToId.current = null; };

  const handleDrop = async () => {
    const fromId = dragFromId.current;
    const toId = dragToId.current;
    setDraggingId(null); setDragOverId(null);
    dragFromId.current = null; dragToId.current = null;
    if (!fromId || !toId || fromId === toId) return;
    const sorted = [...passengers].sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
    const fromIdx = sorted.findIndex(p => p.id === fromId);
    const toIdx = sorted.findIndex(p => p.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;
    const newOrder = [...sorted];
    const [moved] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, moved);
    const updates = newOrder.map((p, i) => ({ id: p.id, sort_order: (i + 1) * 10 }));
    setPassengers(passengers.map(p => { const u = updates.find(x => x.id === p.id); return u ? { ...p, sort_order: u.sort_order } : p; }));
    await Promise.all(updates.map(u => supabase.from("passengers").update({ sort_order: u.sort_order }).eq("id", u.id)));
  };

  // ===== رتب حسب العائلة =====
  const sortByFamily = async () => {
    const sorted = [...passengers].sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
    const result: Passenger[] = [];
    const visited = new Set<number>();
    for (const p of sorted) {
      if (visited.has(p.id)) continue;
      visited.add(p.id);
      result.push(p);
      if (p.family_id) {
        const family = sorted.filter(x => x.family_id === p.family_id && x.id !== p.id && !visited.has(x.id));
        family.forEach(f => { visited.add(f.id); result.push(f); });
      }
    }
    const updates = result.map((p, i) => ({ id: p.id, sort_order: (i + 1) * 10 }));
    setPassengers(passengers.map(p => { const u = updates.find(x => x.id === p.id); return u ? { ...p, sort_order: u.sort_order } : p; }));
    await Promise.all(updates.map(u => supabase.from("passengers").update({ sort_order: u.sort_order }).eq("id", u.id)));
  };

  // ===== تغيير الرقم يدوياً =====
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);
  const [editingOrderVal, setEditingOrderVal] = useState("");

  const applyOrderChange = async (p: Passenger, newNum: number) => {
    setEditingOrderId(null);
    if (!newNum || newNum < 1) return;
    const sorted = [...passengers].sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
    const currentIdx = sorted.findIndex(x => x.id === p.id);
    const targetIdx = Math.min(newNum - 1, sorted.length - 1);
    if (currentIdx === targetIdx) return;
    const newOrder = [...sorted];
    const [moved] = newOrder.splice(currentIdx, 1);
    newOrder.splice(targetIdx, 0, moved);
    const updates = newOrder.map((x, i) => ({ id: x.id, sort_order: (i + 1) * 10 }));
    setPassengers(passengers.map(x => { const u = updates.find(y => y.id === x.id); return u ? { ...x, sort_order: u.sort_order } : x; }));
    await Promise.all(updates.map(u => supabase.from("passengers").update({ sort_order: u.sort_order }).eq("id", u.id)));
  };
  const saveEdit = async (p: Passenger) => {
    const updated_at = new Date().toISOString();
    const updated_by = currentUser?.name || null;
    const { error } = await supabase.from("passengers").update({
      name_ar: p.name_ar, name_en: p.name_en, short_ar: p.short_ar, short_en: p.short_en,
      passport: p.passport, national_id: p.national_id, nat: p.nat,
      dob: p.dob, expiry: p.expiry, gender: p.gender, phone: p.phone,
      bus: p.services?.bus, flight: p.services?.flight, hotel_type: p.services?.hotel_type, hotel_view: p.services?.hotel_view,
      camp_mina: p.services?.camp_mina, camp_arafa: p.services?.camp_arafa,
      updated_by, updated_at
    }).eq("id", p.id);
    if (error) { showAlert("error", "حدث خطأ أثناء حفظ التعديلات، يرجى المحاولة مرة أخرى"); return; }
    const updatedP = { ...p, updated_by, updated_at };
    setPassengers(passengers.map(x => x.id === p.id ? updatedP : x));
    setEditing(null); setSelected(updatedP);
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {autoScanning && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400 }}>
          <div style={{ background: "var(--paper)", borderRadius: 14, padding: "24px 32px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, border: "3px solid rgba(125,31,60,0.2)", borderTop: "3px solid var(--em7)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--em7)" }}>جاري قراءة المستند...</span>
          </div>
        </div>
      )}
      <AlertModal alert={alertState} onClose={() => showAlert(null)} />
      {docMatchCandidates !== null && pendingDocScan && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 350, padding: 16 }}>
          <div style={{ background: "var(--paper)", borderRadius: 14, padding: 18, maxWidth: 380, width: "100%", maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>
              {pendingDocScan.docKind === "hajj_permit" ? "تأكيد تصريح الحج" : pendingDocScan.docKind === "passport" ? "تأكيد جواز السفر" : "تأكيد البطاقة الشخصية"}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>
              {docMatchCandidates.length > 0
                ? (pendingDocScan.docKind === "hajj_permit" ? "تم العثور على حاج مطابق بنفس الاسم أو الرقم — هل هذا هو؟" : "تم العثور على حجاج بنفس الاسم أو الرقم — هل أحدهم هو المقصود؟")
                : (pendingDocScan.docKind === "hajj_permit" ? "لم يتم العثور على حاج مطابق لهذا التصريح" : "لا يوجد حاج بنفس الاسم في القائمة")}
            </div>
            {pendingDocScan.docKind !== "hajj_permit" && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>الصورة الممسوحة:</div>
                <img src={pendingDocScan.dataUrl} style={{ width: "100%", maxHeight: 140, objectFit: "contain", borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg-2)" }} />
              </div>
            )}
            {docMatchCandidates.map(p => {
              const existingDoc = pendingDocScan.docKind === "passport" ? (p as any).national_id_url : (p as any).passport_url;
              return (
              <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line)", marginBottom: 6, background: "var(--bg-2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {existingDoc ? (
                    <button onClick={() => setCompareCandidate(p)} title="عرض الصور بحجم أكبر للمقارنة" style={{ width: 40, height: 40, padding: 0, border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden", cursor: "pointer", flexShrink: 0, background: "none" }}>
                      <img src={existingDoc} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </button>
                  ) : (
                    <Avatar name={p.name_ar} gender={p.gender} size={36} />
                  )}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>{p.short_ar || p.name_ar}</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{p.nat} {p.passport ? `· ${p.passport}` : ""}</div>
                  </div>
                </div>
                <button onClick={() => linkDocToExisting(p)} style={{ ...btnP(), fontSize: 11, padding: "5px 10px", flexShrink: 0 }}>هذا هو</button>
              </div>
              );
            })}
            {pendingDocScan.docKind !== "hajj_permit" && (
              <button onClick={proceedDocAsNew} style={{ ...btnS(), width: "100%", marginTop: 6, fontWeight: 600 }}>لا، هذا حاج جديد ← فتح نموذج الإضافة</button>
            )}
            <button onClick={cancelDocScan} style={{ width: "100%", marginTop: 8, background: "none", border: "none", color: "var(--text-muted)", fontSize: 11, cursor: "pointer", padding: "4px 0" }}>{pendingDocScan.docKind === "hajj_permit" ? "إلغاء / تجاهل" : "إلغاء"}</button>
          </div>
        </div>
      )}
      {compareCandidate && pendingDocScan && (() => {
        const existingDoc = pendingDocScan.docKind === "passport" ? (compareCandidate as any).national_id_url : (compareCandidate as any).passport_url;
        const existingLabel = pendingDocScan.docKind === "passport" ? "البطاقة الشخصية المحفوظة" : "جواز السفر المحفوظ";
        const scannedLabel = pendingDocScan.docKind === "passport" ? "صورة الجواز الممسوحة" : "صورة البطاقة الممسوحة";
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 360, padding: 16 }}>
            <div style={{ background: "var(--paper)", borderRadius: 14, padding: 18, maxWidth: 720, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>مقارنة الصور — {compareCandidate.short_ar || compareCandidate.name_ar}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>تأكد من تطابق الصورتين قبل الربط بملف هذا الحاج</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--em7)", marginBottom: 6, textAlign: "center" }}>{scannedLabel}</div>
                  <img src={pendingDocScan.dataUrl} style={{ width: "100%", maxHeight: 360, objectFit: "contain", borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg-2)" }} />
                </div>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--em7)", marginBottom: 6, textAlign: "center" }}>{existingLabel}</div>
                  {existingDoc ? (
                    <img src={existingDoc} style={{ width: "100%", maxHeight: 360, objectFit: "contain", borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg-2)" }} />
                  ) : (
                    <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "1px dashed var(--line)", background: "var(--bg-2)", fontSize: 12, color: "var(--text-muted)" }}>لا توجد صورة محفوظة لهذا الحاج</div>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button onClick={() => linkDocToExisting(compareCandidate)} style={{ ...btnP(), flex: 1 }}>تأكيد، هذا هو</button>
                <button onClick={() => setCompareCandidate(null)} style={btnS()}>رجوع</button>
              </div>
            </div>
          </div>
        );
      })()}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <PassengersStats passengers={passengers} />
        <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)", flexShrink: 0, background: "var(--paper)" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            {/* البحث */}
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 99, padding: "7px 14px", transition: "var(--transition)" }}
              onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--g5)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 3px rgba(200,162,75,.12)"; }}
              onBlur={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--line)"; (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input value={search} onChange={e => setSearch(e.target.value)} style={{ border: "none", background: "transparent", fontSize: 13, flex: 1, outline: "none", fontFamily: "var(--font-body)", color: "var(--ink)" }} placeholder="ابحث..." />
              {search && <span onClick={() => setSearch("")} style={{ cursor: "pointer", color: "var(--muted)", fontSize: 16, lineHeight: 1 }}>✕</span>}
            </div>
            {/* مسح موحّد — جواز/بطاقة/تصريح حج، بيتعرف على النوع ويتصرف تلقائيًا */}
            <div onClick={() => document.getElementById("scan-input-btn")?.click()} title="مسح جواز / بطاقة / تصريح حج" style={{ height: 34, padding: "0 10px", borderRadius: 99, display: "inline-flex", alignItems: "center", gap: 5, background: "var(--paper)", border: "1px solid var(--em7)", color: "var(--em7)", cursor: "pointer", fontSize: 11, fontWeight: 700, transition: "var(--transition)", flexShrink: 0 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>
              مسح
            </div>
            <input id="scan-input-btn" type="file" accept="image/*" style={{ display: "none" }} onChange={async e => {
              const file = e.target.files?.[0];
              if (!file) return;
              runUnifiedScan(file);
              e.target.value = "";
            }} />
            {/* إضافة يدوي */}
            <div onClick={() => { resetManualModal(); setShowManual(true); }} title="إضافة يدوي" style={{ height: 34, padding: "0 10px", borderRadius: 99, display: "inline-flex", alignItems: "center", gap: 5, background: "var(--paper)", border: "1px solid var(--line)", color: "var(--muted)", cursor: "pointer", fontSize: 11, fontWeight: 600, transition: "var(--transition)", flexShrink: 0 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M16 3l5 5L8 21H3v-5z"/></svg>
              يدوي
            </div>
            {/* رتب حسب العائلة */}
            <div onClick={sortByFamily} title="رتب حسب العائلة" style={{ height: 34, padding: "0 10px", borderRadius: 99, display: "inline-flex", alignItems: "center", gap: 5, background: "var(--paper)", border: "1px solid var(--line)", color: "var(--muted)", cursor: "pointer", fontSize: 11, fontWeight: 600, transition: "var(--transition)", flexShrink: 0 }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--em7)"; e.currentTarget.style.color = "var(--em7)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--line)"; e.currentTarget.style.color = "var(--muted)"; }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              أسر
            </div>
            {/* تصدير إكسيل */}
            <div onClick={exportExcel} title="تصدير إكسيل" style={{ height: 34, padding: "0 10px", borderRadius: 99, display: "inline-flex", alignItems: "center", gap: 5, background: "var(--paper)", border: "1px solid var(--line)", color: "var(--muted)", cursor: "pointer", fontSize: 11, fontWeight: 600, transition: "var(--transition)", flexShrink: 0 }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--em7)"; e.currentTarget.style.color = "var(--em7)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--line)"; e.currentTarget.style.color = "var(--muted)"; }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="19"/><line x1="15" y1="13" x2="9" y2="19"/></svg>
              إكسيل
            </div>
            {/* طباعة */}
            <div onClick={printList} title="طباعة" style={{ height: 34, padding: "0 10px", borderRadius: 99, display: "inline-flex", alignItems: "center", gap: 5, background: "var(--paper)", border: "1px solid var(--line)", color: "var(--muted)", cursor: "pointer", fontSize: 11, fontWeight: 600, transition: "var(--transition)", flexShrink: 0 }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--em7)"; e.currentTarget.style.color = "var(--em7)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--line)"; e.currentTarget.style.color = "var(--muted)"; }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              طباعة
            </div>
            {/* list/table toggle */}
            <div style={{ display: "flex", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", flexShrink: 0 }}>
              <div onClick={() => setViewMode("list")} style={{ padding: "8px 10px", cursor: "pointer", background: viewMode === "list" ? "var(--em7)" : "var(--paper)", color: viewMode === "list" ? "var(--g3)" : "var(--muted)", transition: "var(--transition)" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
              </div>
              <div onClick={() => setViewMode("table")} style={{ padding: "8px 10px", cursor: "pointer", background: viewMode === "table" ? "var(--em7)" : "var(--paper)", color: viewMode === "table" ? "var(--g3)" : "var(--muted)", transition: "var(--transition)", borderRight: "1px solid var(--line)" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>
              </div>
            </div>
          </div>
          {/* فلاتر سريعة */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {QUICK_FILTERS.map(({ key, label, opts }) => (
              <select key={key} value={filters[key] || ""} onChange={e => setFilter(key, e.target.value)}
                style={{ fontSize: 11, padding: "4px 8px", borderRadius: 99, border: `1.5px solid ${filters[key] ? "var(--em7)" : "var(--line)"}`, background: filters[key] ? "rgba(125,31,60,0.06)" : "var(--paper)", color: filters[key] ? "var(--em7)" : "var(--muted)", fontFamily: "var(--font-body)", cursor: "pointer", outline: "none" }}>
                <option value="">{label}</option>
                {opts.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ))}
            {Object.keys(filters).length > 0 && (
              <button onClick={() => setFilters({})} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 99, border: "1px solid var(--danger)", background: "var(--fb)", color: "var(--ff)", cursor: "pointer", fontFamily: "var(--font-body)" }}>مسح الفلاتر ✕</button>
            )}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>{filtered.length} من {passengers.length} حاج</div>
        </div>
        <div style={{ flex: 1, overflow: "auto" }}>
          {viewMode === "list" ? (
            <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 16, margin: "12px 14px", overflow: "hidden" }}>
              {filtered.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem", color: "var(--muted)", fontSize: 12 }}>لا توجد نتائج</div>
              ) : filtered.map((p, idx) => (
                <div key={p.id}
                  draggable
                  onDragStart={() => handleDragStart(p.id)}
                  onDragOver={e => handleDragOver(e, p.id)}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                  onClick={() => setSelected(p)}
                  style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 18px", borderBottom: "1px solid var(--line)", cursor: "grab", transition: "background .14s", background: draggingId === p.id ? "rgba(125,31,60,0.06)" : dragOverId === p.id ? "rgba(125,31,60,0.03)" : selected?.id === p.id ? "var(--ivory)" : "transparent", border: dragOverId === p.id ? "1px solid var(--em7)" : "none", opacity: draggingId === p.id ? 0.5 : 1 }}
                  onMouseEnter={e => { if (selected?.id !== p.id && draggingId !== p.id) e.currentTarget.style.background = "var(--ivory)"; }}
                  onMouseLeave={e => { if (selected?.id !== p.id && draggingId !== p.id) e.currentTarget.style.background = "transparent"; }}>
                  {/* أيقونة السحب */}
                  <span style={{ color: "var(--muted)", flexShrink: 0, cursor: "grab" }}>
                    <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><circle cx="3" cy="2" r="1.2"/><circle cx="7" cy="2" r="1.2"/><circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/><circle cx="3" cy="12" r="1.2"/><circle cx="7" cy="12" r="1.2"/></svg>
                  </span>
                  {/* رقم تسلسلي قابل للتعديل */}
                  {editingOrderId === p.id ? (
                    <input
                      autoFocus
                      type="number"
                      value={editingOrderVal}
                      onChange={e => setEditingOrderVal(e.target.value)}
                      onBlur={() => applyOrderChange(p, parseInt(editingOrderVal))}
                      onKeyDown={e => { if (e.key === "Enter") applyOrderChange(p, parseInt(editingOrderVal)); if (e.key === "Escape") setEditingOrderId(null); e.stopPropagation(); }}
                      onClick={e => e.stopPropagation()}
                      style={{ width: 36, fontSize: 11, textAlign: "center", border: "1.5px solid var(--em7)", borderRadius: 6, padding: "2px 4px", outline: "none", flexShrink: 0 }}
                    />
                  ) : (
                    <div onClick={e => { e.stopPropagation(); setEditingOrderId(p.id); setEditingOrderVal(String(idx + 1)); }} style={{ width: 28, height: 22, textAlign: "center", fontSize: 11, color: "var(--muted)", flexShrink: 0, borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                      onMouseEnter={e => { e.currentTarget.style.background = "var(--ivory2)"; e.currentTarget.style.color = "var(--em7)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--muted)"; }}>
                      {idx + 1}
                    </div>
                  )}
                  {/* الأفاتار */}
                  <div style={{ borderRadius: "50%", flexShrink: 0, border: selected?.id === p.id ? "2px solid var(--g5)" : "2px solid transparent", lineHeight: 0 }}>
                    <Avatar name={p.name_ar} gender={p.gender} size={36} />
                  </div>
                  {/* الاسم والبيانات */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", display: "flex", alignItems: "center", gap: 5 }}>
                      {p.short_ar || p.name_ar}
                      {(isExpired(p.expiry) || isExpired((p as any).id_expiry)) && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "var(--danger-bg)", color: "var(--danger)" }}>منتهي</span>
                      )}
                      {!isExpired(p.expiry) && (isExpiringSoon(p.expiry) || isExpiringSoon((p as any).id_expiry)) && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "var(--warning-bg)", color: "var(--warning)" }}>قريب</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{p.nat} · {p.passport}{p.phone ? ` · ${p.phone}` : ""}</div>
                  </div>
                  {/* الشيبس */}
                  <div style={{ display: "flex", gap: 4, flexShrink: 0, flexWrap: "wrap", maxWidth: 200, justifyContent: "flex-end" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: p.gender === "أنثى" ? "var(--fb)" : "var(--mb)", color: p.gender === "أنثى" ? "var(--ff)" : "var(--mf)" }}>{p.gender === "أنثى" ? "أنثى" : "ذكر"}</span>
                    {p.services?.bus === "VIP" && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "rgba(200,162,75,.12)", color: "var(--g6)", border: "1px solid rgba(200,162,75,.25)" }}>VIP</span>}
                    {p.services?.flight === "درجة أولى" && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "var(--info-bg)", color: "var(--info)" }}>أولى</span>}
                    {p.family_id && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "rgba(125,31,60,.08)", color: "var(--em7)" }}>أسرة</span>}
                    {(p as any).bus_id != null && metaBuses.find(b => b.id === (p as any).bus_id) && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 99, background: "var(--info-bg)", color: "var(--info)", fontWeight: 600 }}>باص {metaBuses.find(b => b.id === (p as any).bus_id)?.name}</span>}
                    {(p as any).room_id != null && metaRooms.find(r => r.id === (p as any).room_id) && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 99, background: "var(--fb)", color: "var(--ff)", fontWeight: 600 }}>غ {metaRooms.find(r => r.id === (p as any).room_id)?.number}</span>}
                    {(p as any).camp_mina_id != null && metaCamps.find(c => c.id === (p as any).camp_mina_id) && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 99, background: "var(--success-bg)", color: "var(--success)", fontWeight: 600 }}>منى {metaCamps.find(c => c.id === (p as any).camp_mina_id)?.name}</span>}
                    {(p as any).camp_arafa_id != null && metaCamps.find(c => c.id === (p as any).camp_arafa_id) && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 99, background: "var(--warning-bg)", color: "var(--warning)", fontWeight: 600 }}>عرفة {metaCamps.find(c => c.id === (p as any).camp_arafa_id)?.name}</span>}
                  </div>
                  {/* الأزرار */}
                  <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                    {/* ترتيب ↑↓ */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      <div onClick={e => { e.stopPropagation(); moveP_order(p, "up"); }} style={{ width: 22, height: 14, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--muted)", transition: "var(--transition)" }}
                        onMouseEnter={e => { e.currentTarget.style.background = "var(--ivory2)"; e.currentTarget.style.color = "var(--em7)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--muted)"; }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="18 15 12 9 6 15"/></svg>
                      </div>
                      <div onClick={e => { e.stopPropagation(); moveP_order(p, "down"); }} style={{ width: 22, height: 14, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--muted)", transition: "var(--transition)" }}
                        onMouseEnter={e => { e.currentTarget.style.background = "var(--ivory2)"; e.currentTarget.style.color = "var(--em7)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--muted)"; }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                      </div>
                    </div>
                    <div onClick={e => { e.stopPropagation(); setEditing(p); }} style={{ width: 28, height: 28, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--muted)", transition: "var(--transition)" }}
                      onMouseEnter={e => { e.currentTarget.style.background = "var(--ivory2)"; e.currentTarget.style.color = "var(--em7)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--muted)"; }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </div>
                    <div onClick={e => { e.stopPropagation(); if (confirm("هتمسح الحاج ده؟")) deleteP(p.id); }} style={{ width: 28, height: 28, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--muted)", transition: "var(--transition)" }}
                      onMouseEnter={e => { e.currentTarget.style.background = "var(--fb)"; e.currentTarget.style.color = "var(--ff)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--muted)"; }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <table style={{ borderCollapse: "collapse", fontSize: 11, minWidth: "max-content", width: "100%" }}>
              <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
                <tr style={{ background: "var(--em7)", color: "var(--g3)" }}>
                  <th style={{ padding: "8px 10px", border: "0.5px solid #17836", textAlign: "center" }}>م</th>
                  {COLS.map(col => <th key={col.key} style={{ padding: "8px 10px", border: "0.5px solid #17836", whiteSpace: "nowrap", textAlign: "right" }}>{col.label}</th>)}
                  <th style={{ padding: "8px 10px", border: "0.5px solid #17836", textAlign: "center" }}>إجراءات</th>
                </tr>

              </thead>
              <tbody>
                {filtered.map((p, i) => (
                  <tr key={p.id} onClick={() => setSelected(p)} style={{ cursor: "pointer", background: selected?.id === p.id ? "var(--success-bg)" : i % 2 === 0 ? "var(--bg-card)" : "var(--bg-2)" }}>
                    <td style={{ padding: "6px 10px", border: "0.5px solid var(--border)", textAlign: "center", color: "var(--text-muted)" }}>{i + 1}</td>
                    {COLS.map(col => (
                      <td key={col.key} style={{ padding: "6px 10px", border: "0.5px solid var(--border)", whiteSpace: "nowrap" }}>
                        {getVal(p, col.key, col.get)}
                        {col.key === "name_ar" && ((isExpired(p.expiry) || isExpired((p as any).id_expiry)) ? <span style={{ marginRight: 4, color: "var(--danger)" }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></span> : (isExpiringSoon(p.expiry) || isExpiringSoon((p as any).id_expiry)) && <span style={{ marginRight: 4, color: "var(--warning)" }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>)}
                      </td>
                    ))}
                    <td style={{ padding: "6px 10px", border: "0.5px solid var(--border)", textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                        <button onClick={e => { e.stopPropagation(); setEditing(p); }} style={{ background: "var(--male-bg)", border: "none", padding: "2px 6px", borderRadius: 4, fontSize: 10, cursor: "pointer", color: "var(--info)" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                        <button onClick={e => { e.stopPropagation(); if (confirm("هتمسح الحاج ده؟")) deleteP(p.id); }} style={{ background: "var(--female-bg)", border: "none", padding: "2px 6px", borderRadius: 4, fontSize: 10, cursor: "pointer", color: "var(--danger)" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selected && !editing && (
        <div style={{ width: 280, borderRight: "0.5px solid var(--border)", overflowY: "auto", padding: 12, flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>ملف الحاج</div>
            <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 16 }}>✕</button>
          </div>
          <div style={{ textAlign: "center", marginBottom: 12, background: "var(--bg-2)", borderRadius: 10, padding: 12 }}>
            {(selected as any).photo_url ? (
              <img src={(selected as any).photo_url} alt={selected.name_ar} style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", margin: "0 auto", display: "block", border: "2px solid #5DCAA5" }} />
            ) : <Avatar name={selected.name_ar} gender={selected.gender} size={48} />}
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8 }}>{selected.name_ar}</div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{selected.name_en}</div>
          </div>
          {(isExpired(selected.expiry) || isExpired((selected as any).id_expiry)) ? (
            <div style={{ background: "var(--female-bg)", border: "1.5px solid #c0392b", borderRadius: 8, padding: "8px 10px", marginBottom: 10, fontSize: 11, color: "var(--danger)", fontWeight: 700, textAlign: "center" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> {isExpired(selected.expiry) ? "الجواز منتهي" : "البطاقة منتهية"}
            </div>
          ) : (isExpiringSoon(selected.expiry) || isExpiringSoon((selected as any).id_expiry)) && (
            <div style={{ background: "var(--warning-bg)", border: "1px solid #e67e22", borderRadius: 8, padding: "8px 10px", marginBottom: 10, fontSize: 11, color: "var(--warning)", fontWeight: 600, textAlign: "center" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> صلاحية {isExpiringSoon(selected.expiry) ? "الجواز" : "البطاقة"} ستنتهي خلال أقل من 6 شهور
            </div>
          )}
          {[["الجواز", selected.passport], ["البطاقة", selected.national_id], ["الجنسية", selected.nat], ["الجنس", selected.gender], ["الميلاد", selected.dob], ["انتهاء الجواز", selected.expiry], ["التليفون", selected.phone]].filter(([, v]) => v).map(([icon, val]) => (
            <div key={icon as string} style={{ background: "var(--bg-2)", borderRadius: 8, padding: "6px 10px", marginBottom: 4, fontSize: 11 }}>{icon as string} {val as string}</div>
          ))}
          <div style={{ border: "0.5px solid var(--border)", borderRadius: 10, padding: "10px 12px", marginTop: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 6 }}>الخدمات</div>
            {[["الباص", selected.services?.bus], ["الطيران", selected.services?.flight], ["الفندق", `${selected.services?.hotel_type || ""} ${selected.services?.hotel_view || ""}`.trim()], ["منى", selected.services?.camp_mina], ["عرفة", selected.services?.camp_arafa]].map(([icon, label, val]) => (
              <div key={label as string} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0", borderBottom: "0.5px solid #f5f5f5" }}>
                <span style={{ color: "var(--text-muted)" }}>{icon as string} {label as string}</span>
                <span style={{ fontWeight: 500, color: (val === "VIP" || val === "درجة أولى" || val === "خاص") ? "var(--warning)" : "var(--text)" }}>{val as string}</span>
              </div>
            ))}
          </div>
          <div style={{ border: "0.5px solid var(--border)", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 8 }}>المستندات</div>
            {([
              ["صورة شخصية", (selected as any).photo_url, "photo_url", "photo", "image/*"],
              ["جواز السفر", (selected as any).passport_url, "passport_url", "passport_doc", "image/*"],
              ["البطاقة", (selected as any).national_id_url, "national_id_url", "idcard", "image/*"],
              ["العقد", (selected as any).contract_url, "contract_url", "contract", "image/*,application/pdf"],
              ["تذكرة الطيران", (selected as any).flight_ticket_url, "flight_ticket_url", "flight_ticket", "image/*,application/pdf"],
              ["تصريح الحاج", (selected as any).hajj_permit_url, "hajj_permit_url", "hajj_permit", "image/*,application/pdf"],
            ] as [string, string, string, string, string][]).map(([label, url, field, docType, accept]) => (
              <div key={label} style={{ padding: "7px 0", borderBottom: "0.5px solid #f5f5f5" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: url ? "var(--text)" : "var(--text-muted)" }}>{label}</span>
                  {docUploading === docType ? (
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>جاري الرفع...</span>
                  ) : url ? (
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => setDocViewer({ url, label })} style={{ background: "var(--male-bg)", border: "none", padding: "3px 8px", borderRadius: 6, fontSize: 10, cursor: "pointer", color: "var(--info)" }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg> عرض</button>
                      <button onClick={() => downloadFile(url)} style={{ background: "var(--success-bg)", border: "none", padding: "3px 8px", borderRadius: 6, fontSize: 10, cursor: "pointer", color: "var(--primary-dark)" }}>⬇️</button>
                      <button onClick={() => handleDocDelete(selected, field, url)} style={{ background: "var(--female-bg)", border: "none", padding: "3px 8px", borderRadius: 6, fontSize: 10, cursor: "pointer", color: "var(--danger)" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
                    </div>
                  ) : (
                    <>
                      <input id={`upload-${docType}`} type="file" accept={accept} style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleDocUpload(selected, docType, field, f); e.currentTarget.value = ""; }} />
                      <button onClick={() => document.getElementById(`upload-${docType}`)?.click()} style={{ background: "var(--success-bg)", border: "none", padding: "3px 8px", borderRadius: 6, fontSize: 10, cursor: "pointer", color: "var(--primary-dark)" }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> رفع</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          {/* الأقارب */}
          <div style={{ border: "0.5px solid var(--border)", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 500 }}>الأقارب</div>
              <button onClick={() => { setShowLinkFamily(true); setLinkSearch(""); }} style={{ background: "var(--success-bg)", border: "none", padding: "2px 8px", borderRadius: 6, fontSize: 10, cursor: "pointer", color: "var(--primary-dark)" }}>+ ربط</button>
            </div>
            {getFamilyMembers(selected).length === 0 ? (
              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>لا يوجد أقارب مرتبطين</div>
            ) : (
              getFamilyMembers(selected).map(fm => (
                <div key={fm.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 0", borderBottom: "0.5px solid #f5f5f5" }}>
                  <div onClick={() => setSelected(fm)} style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, cursor: "pointer" }}>
                    <Avatar name={fm.name_ar} gender={fm.gender} size={24} />
                    <span style={{ fontSize: 11 }}>{fm.short_ar || fm.name_ar}</span>
                  </div>
                  <button onClick={() => handleUnlinkFamily(fm)} title="فك الارتباط مع هذا الشخص" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--border)", fontSize: 12 }}>✕</button>
                </div>
              ))
            )}
          </div>

          {(selected.created_by || selected.updated_by) && (
            <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 10, padding: "0 2px", lineHeight: 1.6 }}>
              {selected.created_by && <div>أُضيف بواسطة: {selected.created_by}{selected.created_at && ` · ${timeAgo(selected.created_at)}`}</div>}
              {selected.updated_by && <div>آخر تعديل: {selected.updated_by}{selected.updated_at && ` · ${timeAgo(selected.updated_at)}`}</div>}
            </div>
          )}
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setEditing(selected)} style={{ ...btnP({ background: "var(--male-bg)", color: "var(--info)" }), flex: 1 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> تعديل</button>
            <button onClick={() => { if (confirm("هتمسح الحاج ده؟")) deleteP(selected.id); }} style={{ background: "var(--female-bg)", border: "none", padding: "7px 12px", borderRadius: 8, fontSize: 11, cursor: "pointer", color: "var(--danger)" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
          </div>
        </div>
      )}

      {/* مودال التحقق من الهوية */}
      <Modal show={showVerify} onClose={() => { setShowVerify(false); setVerifyData(null); }} title="تأكيد هوية الحاج" maxWidth={520}>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 14px", lineHeight: 1.6 }}>تأكد إن صورة الجواز وصورة البطاقة لنفس الشخص قبل الحفظ</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          {[["صورة الجواز", verifyData?.passportUrl], ["صورة البطاقة", verifyData?.idUrl]].map(([label, url]) => (
            <div key={label as string} style={{ border: "0.5px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ background: "var(--bg-2)", padding: "6px 10px", fontSize: 11, fontWeight: 500, borderBottom: "0.5px solid var(--border)" }}>{label as string}</div>
              {url ? (
                <img src={url as string} alt={label as string} style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }} />
              ) : (
                <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--border)", fontSize: 12 }}>لم يتم الرفع</div>
              )}
            </div>
          ))}
        </div>
        {verifyData?.idMismatch && (
          <div style={{ background: "var(--warning-bg)", border: "0.5px solid #e67e22", borderRadius: 8, padding: "8px 12px", marginBottom: 14, display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ fontSize: 16 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>
            <span style={{ fontSize: 12, color: "var(--warning)", lineHeight: 1.6 }}>الرقم الشخصي في البطاقة مختلف عن المسجل في الجواز — تأكد قبل الحفظ</span>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <button onClick={confirmVerify} style={{ background: "var(--em7)", color: "var(--g3)", border: "none", padding: "10px 0", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> نعم، نفس الشخص — حفظ</button>
          <button onClick={() => { setShowVerify(false); setVerifyData(null); }} style={{ background: "var(--female-bg)", color: "var(--danger)", border: "0.5px solid #f0c0cc", padding: "10px 0", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> لا، مش نفس الشخص</button>
        </div>
      </Modal>

      {/* مودال تأكيد تصريح السفر */}
      <Modal show={!!permitConfirm} onClose={() => setPermitConfirm(null)} title="تأكيد تصريح السفر" maxWidth={380}>
        {permitConfirm && (
          <>
            <div style={{ background: "var(--bg-2)", borderRadius: 10, padding: "14px 16px", marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>قرأ الذكاء الاصطناعي من التصريح:</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--em7)", marginBottom: 4 }}>{permitConfirm.idNum}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>ووجد الحاج:</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, background: "var(--paper)", borderRadius: 8, padding: "10px 12px", border: "1px solid var(--line)" }}>
                <Avatar name={permitConfirm.passenger.name_ar} gender={permitConfirm.passenger.gender} size={36} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{permitConfirm.passenger.short_ar || permitConfirm.passenger.name_ar}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{permitConfirm.passenger.nat} · {permitConfirm.passenger.national_id || permitConfirm.passenger.passport}</div>
                </div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>هل أنت متأكد أن هذا التصريح يخص هذا الحاج؟</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={async () => {
                const { passenger, url, field } = permitConfirm;
                await supabase.from("passengers").update({ [field]: url }).eq("id", passenger.id);
                const updated = { ...passenger, [field]: url };
                setPassengers(passengers.map((x: Passenger) => x.id === passenger.id ? updated : x));
                setSelected(updated);
                setPermitConfirm(null);
              }} style={{ flex: 1, background: "var(--em7)", color: "var(--g3)", border: "none", padding: "10px 0", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> نعم، حفظ
              </button>
              <button onClick={() => setPermitConfirm(null)} style={{ flex: 1, background: "var(--female-bg)", color: "var(--danger)", border: "0.5px solid #f0c0cc", padding: "10px 0", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> إلغاء
              </button>
            </div>
          </>
        )}
      </Modal>

      <Modal show={showLinkFamily} onClose={() => setShowLinkFamily(false)} title="ربط بأقارب">
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>اختر الحاج اللي عايز تربطه بـ {selected?.short_ar}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-2)", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}>
          <span style={{ color: "var(--text-muted)" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21-4.35-4.35"/></svg></span>
          <input style={{ border: "none", background: "transparent", fontSize: 12, flex: 1, outline: "none", fontFamily: "inherit" }} placeholder="ابحث..." value={linkSearch} onChange={e => setLinkSearch(e.target.value)} autoFocus />
        </div>
        <div style={{ maxHeight: 300, overflowY: "auto" }}>
          {passengers.filter(p => selected && p.id !== selected.id && (!linkSearch || p.name_ar.includes(linkSearch) || p.short_ar.includes(linkSearch))).map(p => (
            <div key={p.id} onClick={() => selected && handleLinkFamily(selected, p)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 8, marginBottom: 3, cursor: "pointer", background: "transparent" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--success-bg)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <Avatar name={p.name_ar} gender={p.gender} size={28} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 500 }}>{p.short_ar || p.name_ar}</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{p.nat} · {p.gender}</div>
              </div>
              {p.family_id && <span style={{ fontSize: 9, background: "var(--success-bg)", color: "var(--primary-dark)", padding: "1px 5px", borderRadius: 99 }}>عنده أقارب</span>}
            </div>
          ))}
        </div>
        <button onClick={() => setShowLinkFamily(false)} style={{ ...btnS(), width: "100%", marginTop: 10 }}>إلغاء</button>
      </Modal>

      <Modal show={!!editing} onClose={() => setEditing(null)} title="تعديل بيانات الحاج" maxWidth={460}>
        {editing && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              {[["الاسم بالعربي", "name_ar"], ["الاسم بالإنجليزي", "name_en"], ["المختصر عربي", "short_ar"], ["المختصر إنجليزي", "short_en"], ["رقم الجواز", "passport"], ["الرقم الشخصي", "national_id"], ["الجنسية", "nat"], ["التليفون", "phone"], ["تاريخ الميلاد", "dob"], ["انتهاء الجواز", "expiry"]].map(([l, k]) => (
                <div key={k as string}><div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 3 }}>{l as string}</div><input style={inp} value={(editing as any)[k as string] || ""} onChange={e => setEditing({ ...editing, [k as string]: e.target.value })} /></div>
              ))}
              <div><div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 3 }}>الجنس</div><select style={inp} value={editing.gender} onChange={e => setEditing({ ...editing, gender: e.target.value })}><option value="ذكر">ذكر</option><option value="أنثى">أنثى</option></select></div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 8 }}>الخدمات المطلوبة</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {([["الباص", "bus", ["عادي","VIP"]], ["الطيران", "flight", ["عادي","درجة أولى","بدون"]], ["نوع الغرفة", "hotel_type", ["فردية","ثنائية","ثلاثية","رباعية"]], ["🪟 إطلالة", "hotel_view", ["مطلة","غير مطلة"]], ["منى", "camp_mina", ["عادي","خاص"]], ["عرفة", "camp_arafa", ["عادي","خاص"]]] as [string,string,string[]][]).map(([l,k,opts]) => (
                  <div key={k}><div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>{l}</div>
                    <div style={{ display: "flex", gap: 4 }}>
                      {opts.map(o => <div key={o} onClick={() => setEditing({ ...editing, services: { ...editing.services, [k]: o } })} style={{ flex: 1, padding: "4px 2px", borderRadius: 6, border: "1.5px solid " + (editing.services?.[k as keyof typeof editing.services] === o ? "var(--em7)" : "var(--border)"), background: editing.services?.[k as keyof typeof editing.services] === o ? "rgba(125,31,60,.08)" : "transparent", cursor: "pointer", fontSize: 10, color: editing.services?.[k as keyof typeof editing.services] === o ? "var(--em7)" : "var(--text-muted)", textAlign: "center" as const }}>{o}</div>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => saveEdit(editing)} style={{ ...btnP(), flex: 1 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> حفظ</button>
              <button onClick={() => setEditing(null)} style={btnS()}>إلغاء</button>
            </div>
          </>
        )}
      </Modal>

      {/* مودال الإضافة اليدوية */}
      {/* مودال عارض المستند */}
      {docViewer && (
        <div onClick={() => setDocViewer(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "var(--paper)", borderRadius: 14, padding: 16, maxWidth: "90vw", maxHeight: "90vh", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 700, color: "var(--ink)", fontSize: 14 }}>{docViewer.label}</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => downloadFile(docViewer.url)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 7, background: "var(--ivory2)", border: "1px solid var(--line)", cursor: "pointer", color: "var(--ink)" }}>تحميل</button>
                <button onClick={() => setDocViewer(null)} style={{ fontSize: 16, background: "none", border: "none", cursor: "pointer", color: "var(--muted)", lineHeight: 1 }}>✕</button>
              </div>
            </div>
            {docViewer.url.endsWith(".pdf") || docViewer.url.includes("pdf") ? (
              <iframe src={docViewer.url} style={{ width: "80vw", height: "75vh", border: "none", borderRadius: 8 }} />
            ) : (
              <img src={docViewer.url} alt={docViewer.label} style={{ maxWidth: "80vw", maxHeight: "75vh", objectFit: "contain", borderRadius: 8 }} />
            )}
          </div>
        </div>
      )}
      {/* مودال عارض المستند */}
      {docViewer && (
        <div onClick={() => setDocViewer(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "var(--paper)", borderRadius: 14, padding: 16, maxWidth: "90vw", maxHeight: "90vh", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontWeight: 700, color: "var(--ink)", fontSize: 14 }}>{docViewer.label}</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => downloadFile(docViewer.url)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 7, background: "var(--ivory2)", border: "1px solid var(--line)", cursor: "pointer", color: "var(--ink)" }}>تحميل</button>
                <button onClick={() => setDocViewer(null)} style={{ fontSize: 18, background: "none", border: "none", cursor: "pointer", color: "var(--muted)", lineHeight: 1 }}>✕</button>
              </div>
            </div>
            {docViewer.url.toLowerCase().includes("pdf") ? (
              <iframe src={docViewer.url} style={{ width: "80vw", height: "75vh", border: "none", borderRadius: 8 }} />
            ) : (
              <img src={docViewer.url} alt={docViewer.label} style={{ maxWidth: "80vw", maxHeight: "75vh", objectFit: "contain", borderRadius: 8 }} />
            )}
          </div>
        </div>
      )}
      <Modal show={showManual} onClose={() => { setShowManual(false); resetManualModal(); }} title={manualPassportImg || manualIdImg || manualScanning ? "إضافة بالمسح الذكي" : "إضافة حاج يدوياً"} maxWidth={(manualPassportImg || manualIdImg) ? 820 : 460}>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{manualPassportImg || manualIdImg || manualScanning ? "راجع البيانات المستخرجة وعدّل لو محتاج" : "أدخل البيانات — المستندات تقدر ترفعها بعدين من ملف الحاج"}</span>
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          {/* البيانات */}
          <div style={{ flex: 1 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              {([["الاسم بالعربي *", "name_ar"], ["الاسم بالإنجليزي", "name_en"], ["المختصر عربي", "short_ar"], ["المختصر إنجليزي", "short_en"], ["رقم الجواز", "passport"], ["رقم البطاقة", "national_id"], ["الجنسية", "nat"], ["التليفون", "phone"], ["تاريخ الميلاد", "dob"], ["انتهاء الجواز", "expiry"], ["انتهاء البطاقة", "id_expiry"]] as [string,string][]).map(([l, k]) => (
                <div key={k}><div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 3 }}>{l}</div>
                  <input style={inp} value={(manualForm as any)[k]} onChange={e => setManualForm(prev => ({ ...prev, [k]: e.target.value }))} />
                </div>
              ))}
              <div><div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 3 }}>الجنس</div>
                <select style={inp} value={manualForm.gender} onChange={e => setManualForm(prev => ({ ...prev, gender: e.target.value }))}>
                  <option value="ذكر">ذكر</option><option value="أنثى">أنثى</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 8 }}>الخدمات</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {([["الباص", "bus", ["عادي","VIP"]], ["الطيران", "flight", ["عادي","درجة أولى","بدون"]], ["نوع الغرفة", "hotel_type", ["فردية","ثنائية","ثلاثية","رباعية"]], ["إطلالة", "hotel_view", ["مطلة","غير مطلة"]], ["منى", "camp_mina", ["عادي","خاص"]], ["عرفة", "camp_arafa", ["عادي","خاص"]]] as [string,string,string[]][]).map(([l,k,opts]) => (
                  <div key={k}><div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>{l}</div>
                    <div style={{ display: "flex", gap: 4 }}>
                      {opts.map(o => <div key={o} onClick={() => setManualServices(prev => ({ ...prev, [k]: o }))} style={{ flex: 1, padding: "4px 2px", borderRadius: 6, border: `1.5px solid ${(manualServices as any)[k] === o ? "var(--em7)" : "var(--border)"}`, background: (manualServices as any)[k] === o ? "rgba(125,31,60,.08)" : "transparent", cursor: "pointer", fontSize: 10, color: (manualServices as any)[k] === o ? "var(--em7)" : "var(--text-muted)", textAlign: "center" }}>{o}</div>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleManualSave} disabled={manualSaving} style={{ ...btnP(), flex: 1, opacity: manualSaving ? 0.6 : 1 }}>{manualSaving ? "جاري الحفظ..." : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> حفظ</>}</button>
              <button onClick={() => { setShowManual(false); resetManualModal(); }} style={btnS()}>إلغاء</button>
            </div>
          </div>

          {/* صور المستندات (الجواز / البطاقة) */}
          {(manualPassportImg || manualIdImg) && (
            <div style={{ width: 320, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              {/* صورة الجواز */}
              {manualPassportImg && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--em7)" }}>📋 صورة الجواز</span>
                    {!manualScanning && (
                      <label style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99, border: "1px solid var(--line)", background: "var(--bg-2)", cursor: "pointer" }}>
                        تغيير
                        <input type="file" accept="image/*" style={{ display: "none" }} onChange={async e => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setManualPassportImg(null); setManualPassportFile(null);
                          setManualScanning(true);
                          const reader = new FileReader();
                          reader.onload = async ev => {
                            setManualPassportImg(ev.target?.result as string);
                            setManualPassportFile(file);
                            try {
                              const parsed = await scanDocument(file, "passport");
                              setManualForm(prev => ({
                                ...prev,
                                name_en: parsed.name_en || prev.name_en,
                                short_en: parsed.name_en ? makeShort(parsed.name_en) : prev.short_en,
                                name_ar: parsed.name_ar || prev.name_ar,
                                short_ar: parsed.name_ar ? makeShort(parsed.name_ar) : prev.short_ar,
                                passport: parsed.passport || prev.passport,
                                national_id: parsed.national_id || prev.national_id,
                                nat: parsed.nationality || prev.nat,
                                dob: parsed.dob || prev.dob,
                                expiry: parsed.expiry || prev.expiry,
                                gender: parsed.gender || prev.gender,
                              }));
                            } catch { /* تجاهل */ }
                            setManualScanning(false);
                          };
                          reader.readAsDataURL(file);
                          e.target.value = "";
                        }} />
                      </label>
                    )}
                  </div>
                  <div style={{ position: "relative", borderRadius: 10, overflow: "hidden" }}>
                    <img src={manualPassportImg} style={{ width: "100%", display: "block", objectFit: "contain", maxHeight: 260, filter: manualScanning ? "blur(2px)" : "none", transition: "filter 0.3s" }} />
                    {manualScanning && (
                      <div style={{ position: "absolute", inset: 0, background: "rgba(125,31,60,0.15)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
                        <div style={{ width: 36, height: 36, border: "3px solid rgba(255,255,255,0.3)", borderTop: "3px solid var(--em7)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                        <span style={{ fontSize: 12, color: "var(--em7)", fontWeight: 600, background: "rgba(255,255,255,0.9)", padding: "4px 10px", borderRadius: 99 }}>جاري القراءة...</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* صورة البطاقة الشخصية */}
              {manualIdImg ? (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--em7)" }}>🪪 صورة البطاقة الشخصية</span>
                    {!manualScanning && (
                      <label style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99, border: "1px solid var(--line)", background: "var(--bg-2)", cursor: "pointer" }}>
                        تغيير
                        <input type="file" accept="image/*" style={{ display: "none" }} onChange={async e => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setManualIdImg(null); setManualIdFile(null);
                          setManualScanning(true);
                          const reader = new FileReader();
                          reader.onload = async ev => {
                            setManualIdImg(ev.target?.result as string);
                            setManualIdFile(file);
                            try {
                              const parsed = await scanDocument(file, "idcard");
                              setManualForm(prev => ({
                                ...prev,
                                national_id: parsed.national_id || prev.national_id,
                                id_expiry: parsed.id_expiry || prev.id_expiry,
                              }));
                            } catch { /* تجاهل */ }
                            setManualScanning(false);
                          };
                          reader.readAsDataURL(file);
                          e.target.value = "";
                        }} />
                      </label>
                    )}
                  </div>
                  <div style={{ position: "relative", borderRadius: 10, overflow: "hidden" }}>
                    <img src={manualIdImg} style={{ width: "100%", display: "block", objectFit: "contain", maxHeight: 260, filter: manualScanning ? "blur(2px)" : "none", transition: "filter 0.3s" }} />
                    {manualScanning && (
                      <div style={{ position: "absolute", inset: 0, background: "rgba(125,31,60,0.15)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
                        <div style={{ width: 36, height: 36, border: "3px solid rgba(255,255,255,0.3)", borderTop: "3px solid var(--em7)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                        <span style={{ fontSize: 12, color: "var(--em7)", fontWeight: 600, background: "rgba(255,255,255,0.9)", padding: "4px 10px", borderRadius: 99 }}>جاري القراءة...</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px", borderRadius: 10, border: "1.5px dashed var(--line)", color: "var(--text-muted)", fontSize: 11, cursor: "pointer", background: "var(--bg-2)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  + إضافة صورة البطاقة الشخصية (اختياري)
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={async e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setManualScanning(true);
                    const reader = new FileReader();
                    reader.onload = async ev => {
                      setManualIdImg(ev.target?.result as string);
                      setManualIdFile(file);
                      try {
                        const parsed = await scanDocument(file, "idcard");
                        setManualForm(prev => ({
                          ...prev,
                          national_id: parsed.national_id || prev.national_id,
                          id_expiry: parsed.id_expiry || prev.id_expiry,
                        }));
                      } catch { /* تجاهل */ }
                      setManualScanning(false);
                    };
                    reader.readAsDataURL(file);
                    e.target.value = "";
                  }} />
                </label>
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}



export { PassengersStats, PassengersPage };
