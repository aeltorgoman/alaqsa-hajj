import { useState, useMemo } from "react";
import { supabase } from "../supabase";
import type { Passenger } from "../types";
import { Avatar } from "./Avatar";
import { Modal } from "./Modal";
import { makeShort, scanDocument, uploadDoc, downloadFile, getStoragePath, isExpired, isExpiringSoon, inp, btnP, btnS } from "../utils";

function PassengersStats({ passengers }: { passengers: Passenger[] }) {

  const stats = useMemo(() => {
    const total = passengers.length;
    const males = passengers.filter(p => p.gender === "ذكر").length;
    const females = passengers.filter(p => p.gender === "أنثى").length;
    const docsComplete = (p: Passenger) => !!(p.photo_url && p.passport_url && p.national_id_url);
    const docsDone = passengers.filter(docsComplete).length;
    const docPct = total ? Math.round(docsDone / total * 100) : 0;
    return { total, males, females, docsDone, docPct };
  }, [passengers]);

  const { total, males, females, docsDone, docPct } = stats;

  const cards = [
    { label: "إجمالي الحجاج", num: total, sub: "الموسم الحالي", border: "#c8a24b", clr: "var(--em8)", bg: "var(--paper)" },
    { label: "رجال", num: males, sub: `${total ? Math.round(males/total*100) : 0}٪ من الإجمالي`, border: "#4A90D9", clr: "#4A90D9", bg: "var(--mb)" },
    { label: "نساء", num: females, sub: `${total ? Math.round(females/total*100) : 0}٪ من الإجمالي`, border: "#db2777", clr: "#db2777", bg: "var(--fb)" },
    { label: "اكتمال المستندات", num: `${docPct}٪`, sub: `${docsDone} من ${total}`, border: "var(--em7)", clr: "var(--em7)", bg: "var(--paper)" },
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

function PassengersPage({ passengers, setPassengers, initialShowManual, setPage }: { passengers: Passenger[]; setPassengers: (p: Passenger[]) => void; initialShowManual?: boolean; setPage?: (p: string) => void }) {
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "table">("list");
  const [selected, setSelected] = useState<Passenger | null>(null);
  const [editing, setEditing] = useState<Passenger | null>(null);
  

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
    { key: "hotel_type", label: "نوع الغرفة", opts: ["ثنائية", "ثلاثية", "رباعية", "سويت"] },
    { key: "hotel_view", label: "الإطلالة", opts: ["مطلة", "غير مطلة"] },
    { key: "camp_mina", label: "منى", opts: ["عادي", "خاص", "بدون"] },
    { key: "camp_arafa", label: "عرفة", opts: ["عادي", "خاص", "بدون"] },
    { key: "nat", label: "الجنسية", opts: [...new Set(passengers.map(p => p.nat).filter(Boolean))] },
  ];

  const filtered = useMemo(() => passengers
    .filter(p => {
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

  const [docUploading, setDocUploading] = useState<string | null>(null);
  const [docViewer, setDocViewer] = useState<{ url: string; label: string } | null>(null);
  const [showManual, setShowManual] = useState(initialShowManual || false);
  const [manualForm, setManualForm] = useState({ name_ar: "", name_en: "", passport: "", national_id: "", nat: "قطري", dob: "", expiry: "", id_expiry: "", gender: "ذكر", phone: "" });
  const [manualServices, setManualServices] = useState({ bus: "عادي", flight: "عادي", hotel_type: "ثنائية", hotel_view: "غير مطلة", camp_mina: "عادي", camp_arafa: "عادي" });
  const [manualSaving, setManualSaving] = useState(false);

  const handleManualSave = async () => {
    if (!manualForm.name_ar && !manualForm.name_en) { alert("اكتب الاسم على الأقل!"); return; }
    const dupP = manualForm.passport && passengers.some((p: Passenger) => p.passport === manualForm.passport);
    const dupN = manualForm.national_id && passengers.some((p: Passenger) => p.national_id === manualForm.national_id);
    if (dupP) { alert("⚠️ رقم الجواز ده مسجل بالفعل!"); return; }
    if (dupN) { alert("⚠️ رقم البطاقة ده مسجل بالفعل!"); return; }
    setManualSaving(true);
    const short_ar = makeShort(manualForm.name_ar);
    const short_en = makeShort(manualForm.name_en);
    const { data, error } = await supabase.from("passengers").insert([{ ...manualForm, short_ar, short_en, bus: manualServices.bus, flight: manualServices.flight, hotel_type: manualServices.hotel_type, hotel_view: manualServices.hotel_view, camp_mina: manualServices.camp_mina, camp_arafa: manualServices.camp_arafa }]).select();
    if (error) {
      console.error("Manual save error:", error);
      alert(`❌ فشل في حفظ البيانات: ${error.message || "يرجى المحاولة مرة أخرى"}`);
      setManualSaving(false);
      return;
    }
    if (data && data[0]) {
      setPassengers([...passengers, { id: data[0].id, ...manualForm, short_ar, short_en, services: manualServices, rel: "", linked: -1 } as Passenger]);
      setShowManual(false);
      setManualForm({ name_ar: "", name_en: "", passport: "", national_id: "", nat: "قطري", dob: "", expiry: "", id_expiry: "", gender: "ذكر", phone: "" });
    }
    setManualSaving(false);
  };

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
  const saveEdit = async (p: Passenger) => {
    const { error } = await supabase.from("passengers").update({
      name_ar: p.name_ar, name_en: p.name_en, short_ar: p.short_ar, short_en: p.short_en,
      passport: p.passport, national_id: p.national_id, nat: p.nat,
      dob: p.dob, expiry: p.expiry, gender: p.gender, phone: p.phone,
      bus: p.services?.bus, flight: p.services?.flight, hotel_type: p.services?.hotel_type, hotel_view: p.services?.hotel_view,
      camp_mina: p.services?.camp_mina, camp_arafa: p.services?.camp_arafa
    }).eq("id", p.id);
    if (error) { alert("حصل خطأ في الحفظ!"); return; }
    setPassengers(passengers.map(x => x.id === p.id ? p : x));
    setEditing(null); setSelected(p);
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
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
            {/* مسح جواز */}
            <div onClick={() => setPage?.("scan")} title="مسح جواز" style={{ height: 34, padding: "0 10px", borderRadius: 99, display: "inline-flex", alignItems: "center", gap: 5, background: "var(--paper)", border: "1px solid var(--em7)", color: "var(--em7)", cursor: "pointer", fontSize: 11, fontWeight: 700, transition: "var(--transition)", flexShrink: 0 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>
              مسح
            </div>
            {/* إضافة يدوي */}
            <div onClick={() => setShowManual(true)} title="إضافة يدوي" style={{ height: 34, padding: "0 10px", borderRadius: 99, display: "inline-flex", alignItems: "center", gap: 5, background: "var(--paper)", border: "1px solid var(--line)", color: "var(--muted)", cursor: "pointer", fontSize: 11, fontWeight: 600, transition: "var(--transition)", flexShrink: 0 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M16 3l5 5L8 21H3v-5z"/></svg>
              يدوي
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
                <div key={p.id} onClick={() => setSelected(p)}
                  style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 18px", borderBottom: "1px solid var(--line)", cursor: "pointer", transition: "background .14s", background: selected?.id === p.id ? "var(--ivory)" : "transparent" }}
                  onMouseEnter={e => { if (selected?.id !== p.id) e.currentTarget.style.background = "var(--ivory)"; }}
                  onMouseLeave={e => { if (selected?.id !== p.id) e.currentTarget.style.background = "transparent"; }}>
                  {/* رقم تسلسلي */}
                  <div style={{ width: 22, textAlign: "center", fontSize: 11, color: "var(--muted)", flexShrink: 0 }}>{idx + 1}</div>
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
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: p.gender === "أنثى" ? "var(--fb)" : "var(--mb)", color: p.gender === "أنثى" ? "var(--ff)" : "var(--mf)" }}>{p.gender === "أنثى" ? "أنثى" : "ذكر"}</span>
                    {p.services?.bus === "VIP" && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "rgba(200,162,75,.12)", color: "var(--g6)", border: "1px solid rgba(200,162,75,.25)" }}>VIP</span>}
                    {p.services?.flight === "درجة أولى" && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "var(--info-bg)", color: "var(--info)" }}>أولى</span>}
                    {p.family_id && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: "rgba(125,31,60,.08)", color: "var(--em7)" }}>أسرة</span>}
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
                <tr style={{ background: "var(--bg-2)" }}>
                  <td style={{ padding: "4px 6px", border: "0.5px solid #ddd" }}></td>
                  {COLS.map(col => (
                    <td key={col.key} style={{ padding: "4px 6px", border: "0.5px solid #ddd" }}>
                      <input value={filters[col.key] || ""} onChange={e => setFilter(col.key, e.target.value)} style={{ ...inp, padding: "2px 6px", fontSize: 10, minWidth: 60 }} placeholder="فلتر..." />
                    </td>
                  ))}
                  <td style={{ padding: "4px 6px", border: "0.5px solid #ddd" }}></td>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => (
                  <tr key={p.id} onClick={() => setSelected(p)} style={{ cursor: "pointer", background: selected?.id === p.id ? "var(--success-bg)" : i % 2 === 0 ? "white" : "var(--bg-2)" }}>
                    <td style={{ padding: "6px 10px", border: "0.5px solid #eee", textAlign: "center", color: "var(--text-muted)" }}>{i + 1}</td>
                    {COLS.map(col => (
                      <td key={col.key} style={{ padding: "6px 10px", border: "0.5px solid #eee", whiteSpace: "nowrap" }}>
                        {getVal(p, col.key, col.get)}
                        {col.key === "name_ar" && ((isExpired(p.expiry) || isExpired((p as any).id_expiry)) ? <span style={{ marginRight: 4, color: "var(--danger)" }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></span> : (isExpiringSoon(p.expiry) || isExpiringSoon((p as any).id_expiry)) && <span style={{ marginRight: 4, color: "var(--warning)" }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>)}
                      </td>
                    ))}
                    <td style={{ padding: "6px 10px", border: "0.5px solid #eee", textAlign: "center" }}>
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
        <div style={{ width: 280, borderRight: "0.5px solid #e5e5e5", overflowY: "auto", padding: 12, flexShrink: 0 }}>
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
          <div style={{ border: "0.5px solid #e5e5e5", borderRadius: 10, padding: "10px 12px", marginTop: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 6 }}>الخدمات</div>
            {[["الباص", selected.services?.bus], ["الطيران", selected.services?.flight], ["الفندق", `${selected.services?.hotel_type || ""} ${selected.services?.hotel_view || ""}`.trim()], ["منى", selected.services?.camp_mina], ["عرفة", selected.services?.camp_arafa]].map(([icon, label, val]) => (
              <div key={label as string} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0", borderBottom: "0.5px solid #f5f5f5" }}>
                <span style={{ color: "var(--text-muted)" }}>{icon as string} {label as string}</span>
                <span style={{ fontWeight: 500, color: (val === "VIP" || val === "درجة أولى" || val === "خاص") ? "var(--warning)" : "var(--text)" }}>{val as string}</span>
              </div>
            ))}
          </div>
          <div style={{ border: "0.5px solid #e5e5e5", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
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
          <div style={{ border: "0.5px solid #e5e5e5", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
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
            <div key={label as string} style={{ border: "0.5px solid #e5e5e5", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ background: "var(--bg-2)", padding: "6px 10px", fontSize: 11, fontWeight: 500, borderBottom: "0.5px solid #e5e5e5" }}>{label as string}</div>
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
                {([["الباص", "bus", ["عادي","VIP"]], ["الطيران", "flight", ["عادي","درجة أولى","بدون"]], ["نوع الغرفة", "hotel_type", ["ثنائية","ثلاثية","رباعية","سويت"]], ["🪟 إطلالة", "hotel_view", ["مطلة","غير مطلة"]], ["منى", "camp_mina", ["عادي","خاص"]], ["عرفة", "camp_arafa", ["عادي","خاص"]]] as [string,string,string[]][]).map(([l,k,opts]) => (
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
      <Modal show={showManual} onClose={() => setShowManual(false)} title="إضافة حاج يدوياً" maxWidth={460}>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>أدخل البيانات يدوياً — المستندات تقدر ترفعها بعدين من ملف الحاج</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
          {([["الاسم بالعربي *", "name_ar"], ["الاسم بالإنجليزي", "name_en"], ["رقم الجواز", "passport"], ["رقم البطاقة", "national_id"], ["الجنسية", "nat"], ["التليفون", "phone"], ["تاريخ الميلاد", "dob"], ["انتهاء الجواز", "expiry"], ["انتهاء البطاقة", "id_expiry"]] as [string,string][]).map(([l, k]) => (
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
            {([["الباص", "bus", ["عادي","VIP"]], ["الطيران", "flight", ["عادي","درجة أولى","بدون"]], ["نوع الغرفة", "hotel_type", ["ثنائية","ثلاثية","رباعية","سويت"]], ["🪟 إطلالة", "hotel_view", ["مطلة","غير مطلة"]], ["منى", "camp_mina", ["عادي","خاص"]], ["عرفة", "camp_arafa", ["عادي","خاص"]]] as [string,string,string[]][]).map(([l,k,opts]) => (
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
          <button onClick={() => setShowManual(false)} style={btnS()}>إلغاء</button>
        </div>
      </Modal>
    </div>
  );
}



export { PassengersStats, PassengersPage };
