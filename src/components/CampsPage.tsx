import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "../supabase";
import type { TablesUpdate } from "../types/database";
import type { Passenger, Camp } from "../types";
import { Modal } from "./Modal";
import { AlertModal, useAlert, ConfirmModal, useConfirm } from "./AlertModal";
import { StatsRow, type StatCardData } from "./StatCard";
import { useConfig } from "../config/ConfigContext";
import { inp, btnP, btnS, makeHTML, printInPage, makeTwoLogoSectionHTML, joinSections, renderNamesTable } from "../utils";

// ===== ألوان أيقونات المخيمات (دورة ألوان موحّدة) =====

// ===== دالة حفظ الترتيب في Supabase =====
async function saveSortOrder(items: { id: number; sort_order: number }[]) {
  await Promise.all(items.map(item =>
    supabase.from("passengers").update({ sort_order: item.sort_order }).eq("id", item.id)
  ));
}

// ===== إحصائيات المخيمات =====
function CampsStats({ camps, passengers, campIdKey, campServiceKey }: { camps: Camp[]; passengers: Passenger[]; campIdKey: string; campServiceKey: string }) {
  const stats = useMemo(() => {
    const hajj = passengers.filter(p => !p.passenger_type || p.passenger_type === "حاج");
    const total = hajj.length;
    const assignedCount = hajj.filter(p => (p as any)[campIdKey] != null).length;
    const unassigned = total - assignedCount;
    const specialRequested = hajj.filter(p => (p.services as any)[campServiceKey] === "خاص").length;
    return { total, assignedCount, unassigned, specialRequested };
  }, [camps, passengers, campIdKey, campServiceKey]);
  const { total, assignedCount, unassigned, specialRequested } = stats;

  const cards: StatCardData[] = [
    { label: "إجمالي الحجاج", num: total, sub: "الموسم الحالي", tone: "brand" },
    { label: "غير موزّعين", num: unassigned, sub: unassigned > 0 ? "يحتاج توزيع" : "مكتمل", tone: unassigned > 0 ? "danger" : "muted" },
    { label: "طالبين خاص", num: specialRequested, sub: `${total ? Math.round(specialRequested / total * 100) : 0}٪ من الإجمالي`, tone: "warning" },
    { label: "نسبة التوزيع", num: `${total ? Math.round(assignedCount / total * 100) : 0}٪`, sub: `${assignedCount} من ${total} حاج`, tone: "success", featured: true },
  ];

  return <StatsRow cards={cards} />;
}

// ===== صفحة المخيمات =====
function CampsPage({ pageType, passengers, setPassengers }: { pageType: "منى" | "عرفة"; passengers: Passenger[]; setPassengers: (p: Passenger[]) => void }) {
  const config = useConfig();
  const { alert: alertState, showAlert } = useAlert();
  const { confirmState, confirmAction, handleConfirm, handleCancel } = useConfirm();
  const [camps, setCamps] = useState<Camp[]>([]);
  const [editingCampId, setEditingCampId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [campName, setCampName] = useState("");
  const [campGender, setCampGender] = useState<"ذكر" | "أنثى">("ذكر");
  const [campType, setCampType] = useState<"عادي" | "خاص">("عادي");
  const [nameError, setNameError] = useState("");

  // Drag state
  const dragPassengerId = useRef<number | null>(null);
  const dragOverPassengerId = useRef<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const [selectedCampId, setSelectedCampId] = useState<number | null>(null);
  const [dismissedCampSuggestions, setDismissedCampSuggestions] = useState(new Set<number>());
  const [campSearch, setCampSearch] = useState("");
  const [addSearch, setAddSearch] = useState("");
  const dragType = useRef<"reorder"|"add">("reorder");

  const campIdKey = pageType === "منى" ? "camp_mina_id" : "camp_arafa_id";
  const serviceKey = pageType === "منى" ? "camp_mina" : "camp_arafa";

  const IconSvg = () => pageType === "منى"
    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/></svg>
    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>;
  const iconTitle = pageType === "منى" ? "مخيمات منى" : "مخيمات عرفة";

  useEffect(() => {
    supabase.from("camps").select("*").eq("page_type", pageType).order("created_at").then(({ data }: any) => { if (data) setCamps(data as Camp[]); });
  }, [pageType]);

  const getCampPassengers = (campId: number) =>
    passengers.filter(p => (p as any)[campIdKey] === campId).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));


  const addCamp = async () => {
    if (!campName.trim()) { setNameError("يرجى إدخال اسم المخيم"); return; }
    if (camps.some(c => c.name.trim() === campName.trim() && c.gender === campGender)) { setNameError(`يوجد مخيم ${campGender === "ذكر" ? "رجال" : "نساء"} بالاسم "${campName}" بالفعل`); return; }
    setNameError("");
    const { data, error } = await supabase.from("camps").insert([{ name: campName.trim(), gender: campGender, type: campType, page_type: pageType }]).select();
    if (error) { showAlert("error", `فشل إضافة المخيم: ${error.message || "يرجى المحاولة مرة أخرى"}`); return; }
    if (!error && data?.[0]) {
      setCamps((prev: Camp[]) => [...prev, data[0] as Camp]);
      setCampName(""); setCampGender("ذكر"); setCampType("عادي"); setShowAdd(false);
    }
  };

  const deleteCamp = async (id: number) => {
    if (getCampPassengers(id).length > 0) { showAlert("warning", "يرجى إزالة المسافرين قبل حذف المخيم"); return; }
    const { error } = await supabase.from("camps").delete().eq("id", id);
    if (error) { showAlert("error", `فشل حذف المخيم: ${error.message}`); return; }
    setCamps((prev: Camp[]) => prev.filter(c => c.id !== id));
  };




  const removeP = async (pId: number) => {
    await supabase.from("passengers").update({ [campIdKey]: null } as TablesUpdate<"passengers">).eq("id", pId);
    setPassengers(passengers.map(p => p.id === pId ? { ...p, [campIdKey]: null } : p));
  };

  const moveP = async (pId: number, toId: string) => {
    if (!toId) return;
    const newCampId = parseInt(toId);
    const fc = camps.find(c => c.id === (passengers.find(p => p.id === pId) as any)?.[campIdKey]);
    const tc = camps.find(c => c.id === newCampId);
    if (fc && tc && fc.gender !== tc.gender && tc.type !== "خاص") return;
    await supabase.from("passengers").update({ [campIdKey]: newCampId } as TablesUpdate<"passengers">).eq("id", pId);
    setPassengers(passengers.map(p => p.id === pId ? { ...p, [campIdKey]: newCampId } : p));
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

  const handleDrop = async (campId: number) => {
    const fromId = dragPassengerId.current;
    if (dragType.current === "add" && fromId) {
      await supabase.from("passengers").update({ [campIdKey]: campId } as TablesUpdate<"passengers">).eq("id", fromId);
      setPassengers(passengers.map(x => x.id === fromId ? { ...x, [campIdKey]: campId } : x));
      setDraggingId(null); dragPassengerId.current = null; dragOverPassengerId.current = null;
      return;
    }
    const toId = dragOverPassengerId.current;
    if (!fromId || !toId || fromId === toId) {
      setDraggingId(null); setDragOverId(null);
      dragPassengerId.current = null; dragOverPassengerId.current = null;
      return;
    }
    const cp = getCampPassengers(campId);
    const fromIdx = cp.findIndex(p => p.id === fromId);
    const toIdx = cp.findIndex(p => p.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;

    const newOrder = [...cp];
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

  const printCamp = (camp: Camp) => {
    const cp = getCampPassengers(camp.id);
    const isMale = camp.gender === "ذكر";
    const section = makeTwoLogoSectionHTML(`مخيم ${pageType} ${camp.name}`, isMale ? "رجال" : "نساء", renderNamesTable(cp, "اسم الحاج", branding.primaryColor), branding);
    printInPage(makeHTML(`مخيمات ${pageType}`, section, false, branding.logoUrl, branding.companyName, branding.tagline, branding.primaryColor, branding.accentColor, true));
  };

  const printAll = () => {
    const sections = camps.map(camp => {
      const cp = getCampPassengers(camp.id);
      const isMale = camp.gender === "ذكر";
      return makeTwoLogoSectionHTML(`مخيم ${pageType} ${camp.name}`, isMale ? "رجال" : "نساء", renderNamesTable(cp, "اسم الحاج", branding.primaryColor), branding);
    });
    printInPage(makeHTML(`مخيمات ${pageType}`, joinSections(sections), false, branding.logoUrl, branding.companyName, branding.tagline, branding.primaryColor, branding.accentColor, true));
  };

  const maleCamps = camps.filter(c => c.gender === "ذكر");
  const femaleCamps = camps.filter(c => c.gender === "أنثى");

  const renderGroup = (groupCamps: Camp[], gender: "ذكر" | "أنثى") => {
    const genderColor = gender === "ذكر" ? "#1D4ED8" : "#BE185D";
    const filteredGroup = groupCamps.filter(c => !campSearch || c.name.includes(campSearch) || getCampPassengers(c.id).some(p => p.name_ar.includes(campSearch)));
    return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: gender === "ذكر" ? "var(--male-bg)" : "var(--female-bg)", color: genderColor, display: "inline-block" }}>
          {gender === "ذكر" ? "رجال" : "نساء"} ({groupCamps.length})
        </span>
      </div>
      {filteredGroup.length === 0
        ? <div style={{ fontSize: 11, color: "var(--muted)", padding: "6px 0" }}>لا يوجد مخيمات بعد</div>
        : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 12 }}>
          {filteredGroup.map(camp => {
            const cp = getCampPassengers(camp.id);
            const isSpecial = camp.type === "خاص";
            const campColor = isSpecial ? "#D4A017" : genderColor;
            const isSelected = selectedCampId === camp.id;
            return (
              <div key={camp.id} onClick={() => setSelectedCampId(camp.id)}
                style={{
                  background: "var(--paper)", borderRadius: 14, cursor: "pointer",
                  border: isSelected ? `2.5px solid ${campColor}` : "1px solid var(--line)",
                  boxShadow: isSelected ? `0 4px 16px ${campColor}30` : "0 1px 4px rgba(0,0,0,.06)",
                  transition: "all .18s", overflow: "hidden",
                  transform: isSelected ? "translateY(-2px)" : "none",
                }}
                onMouseEnter={e => { if (!isSelected) { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 6px 18px ${campColor}22`; } }}
                onMouseLeave={e => { if (!isSelected) { (e.currentTarget as HTMLDivElement).style.transform = "none"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 4px rgba(0,0,0,.06)"; } }}>
                {/* لافتة المخيم */}
                <div style={{ background: `linear-gradient(135deg,${campColor},${campColor}cc)`, padding: "10px 12px 8px", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", left: -8, bottom: -12, opacity: .08, pointerEvents: "none" }}>
                    <IconSvg />
                  </div>
                  <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: "white", lineHeight: 1 }}>مخيم {camp.name}</div>
                    {isSpecial && <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 99, background: "rgba(255,255,255,.22)", color: "white" }}>خاص</span>}
                  </div>
                </div>
                <div style={{ padding: "10px 12px 10px" }}>
                  {cp.length === 0 ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "10px 0" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: campColor, padding: "4px 12px", borderRadius: 8, border: `1px dashed ${campColor}60`, background: `${campColor}06` }}>
                        ＋ إضافة مسافر
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 8 }}>
                      <span style={{ fontSize: 28, fontWeight: 900, color: campColor, lineHeight: 1 }}>{cp.length}</span>
                      <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>مسافر</span>
                    </div>
                  )}
                  {cp.length > 0 && (
                    <div style={{ height: 6, borderRadius: 99, background: `${campColor}18`, overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 99, background: `linear-gradient(90deg,${campColor},${campColor}cc)`, width: "100%", transition: "width .3s" }} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      }
    </div>
    );
  };

  return (
    <div style={{ padding: 14, overflowY: "auto", height: "100%" }}>
      <AlertModal alert={alertState} onClose={() => showAlert(null)} />
      <ConfirmModal state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
      <CampsStats camps={camps} passengers={passengers} campIdKey={campIdKey} campServiceKey={serviceKey} />
      <div style={{ display: "flex", gap: 8, marginBottom: 12, marginTop: 12 }}>
        <button onClick={() => setShowAdd(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 99, background: "var(--paper)", border: "1px solid var(--line)", color: "var(--em7)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)", transition: "var(--transition)", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }} onMouseEnter={e => { e.currentTarget.style.background = "rgba(125,31,60,0.06)"; e.currentTarget.style.borderColor = "var(--em7)"; }} onMouseLeave={e => { e.currentTarget.style.background = "var(--paper)"; e.currentTarget.style.borderColor = "var(--line)"; }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> مخيم جديد
        </button>
        {camps.length > 0 && <button onClick={printAll} style={btnS()}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> طباعة الكل</button>}
      </div>

      {/* بحث */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 10, padding: "7px 14px", marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input value={campSearch} onChange={e => setCampSearch(e.target.value)} placeholder="ابحث عن مخيم أو مسافر..." style={{ border: "none", background: "transparent", fontSize: 13, flex: 1, outline: "none", fontFamily: "var(--font-body)" }} />
        {campSearch && <button onClick={() => setCampSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 16 }}>✕</button>}
      </div>

      {!camps.length
        ? <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)", fontSize: 12 }}><div style={{ marginBottom: 8 }}><IconSvg /></div>لا يوجد مخيمات بعد</div>
        : <>{renderGroup(maleCamps, "ذكر")}{renderGroup(femaleCamps, "أنثى")}</>
      }

      {/* ===== مودال تفاصيل المخيم — عمودين ===== */}
      {selectedCampId !== null && (() => {
        const camp = camps.find(c => c.id === selectedCampId);
        if (!camp) return null;
        const cp = getCampPassengers(camp.id);
        const isSpecial = camp.type === "خاص";
        const campColor = isSpecial ? "#D4A017" : (camp.gender === "ذكر" ? "#1D4ED8" : "#BE185D");
        const sameCamps = camps.filter(c => c.id !== camp.id && c.gender === camp.gender);
        const genderPool = camp.type === "خاص" ? passengers : passengers.filter(p => p.gender === camp.gender);
        const addFiltered = genderPool.filter(p => (p as any)[campIdKey] == null && (!p.passenger_type || p.passenger_type === "حاج") && (!addSearch || p.name_ar.includes(addSearch) || (p.short_ar||"").includes(addSearch)));
        return (
          <div onClick={() => { setSelectedCampId(null); setAddSearch(""); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "var(--paper)", borderRadius: 20, width: 960, height: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,.35)", overflow: "hidden" }}>
              {/* هيدر */}
              <div style={{ background: `linear-gradient(135deg,${campColor},${campColor}cc)`, padding: "14px 18px", flexShrink: 0, position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", left: -10, bottom: -14, opacity: .08 }}><IconSvg /></div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative", zIndex: 1 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(255,255,255,.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><IconSvg /></div>
                  <div style={{ flex: 1 }}>
                    {editingCampId === camp.id ? (
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input defaultValue={camp.name} id={`cm-${camp.id}`} style={{ fontSize: 15, fontWeight: 800, padding: "4px 10px", borderRadius: 8, border: "none", outline: "none", width: 140, fontFamily: "var(--font-body)" }} autoFocus
                          onKeyDown={e => { if (e.key === "Enter") { const v = (document.getElementById(`cm-${camp.id}`) as HTMLInputElement)?.value?.trim(); if (v) { supabase.from("camps").update({ name: v }).eq("id", camp.id); setCamps(camps.map(c => c.id === camp.id ? { ...c, name: v } : c)); } setEditingCampId(null); } if (e.key === "Escape") setEditingCampId(null); }} />
                        <button onClick={() => { const v = (document.getElementById(`cm-${camp.id}`) as HTMLInputElement)?.value?.trim(); if (v) { supabase.from("camps").update({ name: v }).eq("id", camp.id); setCamps(camps.map(c => c.id === camp.id ? { ...c, name: v } : c)); } setEditingCampId(null); }} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 8, background: "rgba(255,255,255,.25)", color: "white", border: "none", cursor: "pointer" }}>✓</button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ fontSize: 26, fontWeight: 900, color: "white", lineHeight: 1, fontFamily: "var(--font-heading)" }} onDoubleClick={() => setEditingCampId(camp.id)}>مخيم {camp.name}</div>
                        {isSpecial && <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 99, background: "rgba(255,255,255,.22)", color: "white" }}>خاص</span>}
                      </div>
                    )}
                    <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.85)", marginTop: 4 }}>{cp.length === 1 ? `${cp.length} مسافر` : cp.length === 2 ? `${cp.length} مسافران` : `${cp.length} مسافرين`} · {camp.gender === "ذكر" ? "رجال" : "نساء"}</div>
                  </div>
                  <button onClick={() => printCamp(camp)} title="طباعة" style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(0,0,0,.25)", border: "1px solid rgba(255,255,255,.15)", cursor: "pointer", color: "rgba(255,255,255,.9)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/><line x1="9" y1="18" x2="15" y2="18"/><line x1="9" y1="21" x2="12" y2="21"/><circle cx="18" cy="11.5" r="1" fill="currentColor"/></svg>
                  </button>
                  <button onClick={async () => { const ok = await confirmAction(`هل تريد حذف مخيم ${camp.name}؟`, { title: "حذف المخيم" }); if (ok) { deleteCamp(camp.id); setSelectedCampId(null); } }} title="حذف المخيم" style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(0,0,0,.25)", border: "1px solid rgba(255,255,255,.15)", cursor: "pointer", color: "#fca5a5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                  </button>
                  <button onClick={() => { setSelectedCampId(null); setAddSearch(""); }} style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(0,0,0,.25)", border: "1px solid rgba(255,255,255,.15)", cursor: "pointer", color: "rgba(255,255,255,.9)", fontSize: 18, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                </div>
              </div>

              {/* العمودين */}
              <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
                {/* يمين: المسافرون */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, borderLeft: "1px solid var(--line)" }}>
                  <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>المسافرون المضافون</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: campColor, background: `${campColor}12`, padding: "2px 8px", borderRadius: 99 }}>{cp.length === 1 ? `${cp.length} مسافر` : cp.length === 2 ? `${cp.length} مسافران` : `${cp.length} مسافرين`}</span>
                  </div>
                  <div style={{ flex: 1, overflowY: "auto" }} onDragOver={e => e.preventDefault()} onDrop={() => handleDrop(camp.id)}>
                    {cp.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "2rem", color: "var(--muted)", fontSize: 12 }}>لا يوجد مسافرون بعد</div>
                    ) : cp.map((p, i) => (
                      <div key={p.id} draggable onDragStart={() => handleDragStart(p.id)} onDragOver={e => handleDragOver(e, p.id)} onDragEnd={handleDragEnd}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderBottom: "1px solid var(--line)", background: draggingId === p.id ? `${campColor}08` : dragOverId === p.id ? `${campColor}04` : "transparent", cursor: "grab", opacity: draggingId === p.id ? 0.5 : 1 }}>
                        <span style={{ color: "var(--muted)", cursor: "grab", flexShrink: 0 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="5" r="1" fill="currentColor"/><circle cx="15" cy="5" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="19" r="1" fill="currentColor"/><circle cx="15" cy="19" r="1" fill="currentColor"/></svg>
                        </span>
                        <span style={{ fontSize: 10, color: "var(--muted)", width: 18, textAlign: "center", flexShrink: 0 }}>{i + 1}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", flex: 1 }}>{p.short_ar || p.name_ar}</span>
                        {(p.services as any)[serviceKey] === "خاص" && <span style={{ fontSize: 9, fontWeight: 800, background: "#E8951A", color: "#fff", padding: "1px 7px", borderRadius: 99, flexShrink: 0 }}>خاص</span>}
                        {sameCamps.length > 0 && (
                          <select onChange={e => moveP(p.id, e.target.value)} defaultValue="" style={{ fontSize: 10, background: "var(--ivory)", border: "1px solid var(--line)", borderRadius: 6, padding: "2px 5px", fontFamily: "inherit", flexShrink: 0 }}>
                            <option value="">نقل لـ...</option>
                            {sameCamps.map(c => <option key={c.id} value={c.id}>مخيم {c.name}</option>)}
                          </select>
                        )}
                        <button onClick={() => removeP(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 16, lineHeight: 1, flexShrink: 0, padding: "0 2px" }}>↩</button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* اقتراحات ذكية */}
                {(() => {
                  const busIds = new Set(cp.map((p: any) => p.bus_id).filter(Boolean));
                  const roomIds = new Set(cp.map((p: any) => p.room_id).filter(Boolean));
                  const famIds = new Set(cp.filter((p: any) => p.family_id).map((p: any) => p.family_id));
                  const allSuggestions = passengers
                    .filter(p =>
                      (p as any)[campIdKey] !== camp.id &&
                      !dismissedCampSuggestions.has(p.id!) &&
                      (!p.passenger_type || p.passenger_type === "حاج") &&
                      (camp.type === "خاص" || p.gender === camp.gender) &&
                      ((p.family_id && famIds.has(p.family_id)) ||
                       ((p as any).bus_id && busIds.has((p as any).bus_id)) ||
                       ((p as any).room_id && roomIds.has((p as any).room_id)))
                    )
                    .sort((a, b) => {
                      const sc = (x: any) => (x.family_id && famIds.has(x.family_id) ? 4 : 0) + (x.bus_id && busIds.has(x.bus_id) ? 2 : 0) + (x.room_id && roomIds.has(x.room_id) ? 1 : 0);
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
                          const hasFam = p.family_id && famIds.has(p.family_id);
                          const hasBus = (p as any).bus_id && busIds.has((p as any).bus_id);
                          const hasRoom = (p as any).room_id && roomIds.has((p as any).room_id);
                          const reason = hasFam ? "صلة قرابة" : hasBus ? "نفس الباص" : "نفس الغرفة";
                          const matchPax = cp.find((x: any) => hasFam ? x.family_id === p.family_id : hasBus ? (x as any).bus_id === (p as any).bus_id : (x as any).room_id === (p as any).room_id);
                          const matchName = (matchPax as any)?.short_ar || (matchPax as any)?.name_ar?.split(" ").slice(0,2).join(" ") || "";
                          const isTypeMismatch = camp.type === "خاص" && (p.services as any)?.[serviceKey] !== "خاص";
                          return (
                            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 10px", borderRadius: 8, border: `1.5px solid ${hasFam ? "#A5D6A7" : hasBus ? "#90CAF9" : "#FFD54F"}`, background: hasFam ? "#F1F8E9" : hasBus ? "#E3F2FD" : "#FFFDE7" }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ fontSize: 11.5, fontWeight: 900, color: "var(--ink)" }}>{(p as any).short_ar || p.name_ar}</span>
                                <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--muted)", marginRight: 5 }}>· {reason}{matchName ? <span style={{ color: "var(--primary)", fontWeight: 800 }}> مع {matchName}</span> : null}</span>
                              </div>
                              <button onClick={async () => {
                                if (isTypeMismatch) { showAlert("warning", `تنبيه: ${(p as any).short_ar || p.name_ar} طالب خيمة عادية وليس خاصة`); }
                                await supabase.from("passengers").update({ [campIdKey]: camp.id } as any).eq("id", p.id);
                                setPassengers(passengers.map((x: any) => x.id === p.id ? { ...x, [campIdKey]: camp.id } : x));
                              }} style={{ padding: "3px 9px", borderRadius: 7, border: "none", background: "var(--primary)", color: "#fff", fontSize: 10, fontWeight: 800, cursor: "pointer", fontFamily: "var(--font-body)", whiteSpace: "nowrap", flexShrink: 0 }}>+ إضافة</button>
                              <button onClick={() => setDismissedCampSuggestions(prev => new Set([...prev, p.id!]))} style={{ width: 22, height: 22, borderRadius: 6, border: "none", background: "var(--ivory2)", cursor: "pointer", color: "var(--muted)", fontSize: 11, flexShrink: 0 }}>✕</button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* شمال: إضافة */}
                <div style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column", minHeight: 0, background: "var(--ivory)" }}>
                  <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>إضافة مسافرين</span>
                  </div>
                  <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 9, padding: "6px 10px" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                      <input style={{ border: "none", background: "transparent", fontSize: 12, flex: 1, outline: "none", fontFamily: "var(--font-body)" }} placeholder="ابحث عن مسافر..." value={addSearch} onChange={e => setAddSearch(e.target.value)} autoFocus />
                      {addSearch && <button onClick={() => setAddSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 13 }}>✕</button>}
                    </div>
                  </div>
                  <div style={{ flex: 1, overflowY: "auto" }}>
                    {addFiltered.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "1.5rem", color: "var(--muted)", fontSize: 11 }}>{addSearch ? "لا توجد نتائج" : "جميع الحجاج موزعون"}</div>
                    ) : addFiltered.map(p => (
                      <div key={p.id}
                        draggable onDragStart={() => handleDragStartAdd(p.id)} onDragEnd={handleDragEnd}
                        onClick={async () => { if (camp.type === "خاص" && (p.services as any)?.[serviceKey] !== "خاص") { showAlert("warning", `تنبيه: ${(p as any).short_ar || p.name_ar} طالب خيمة عادية وليس خاصة`); } await supabase.from("passengers").update({ [campIdKey]: camp.id } as TablesUpdate<"passengers">).eq("id", p.id); setPassengers(passengers.map(x => x.id === p.id ? { ...x, [campIdKey]: camp.id } : x)); }}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", cursor: "grab", borderBottom: "1px solid var(--line)", background: draggingId === p.id ? `${campColor}05` : "transparent" }}
                        onMouseEnter={e => { if (draggingId !== p.id) (e.currentTarget as HTMLDivElement).style.background = "var(--paper)"; }}
                        onMouseLeave={e => { if (draggingId !== p.id) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.short_ar || p.name_ar}</div>
                        </div>
                        {(p.services as any)[serviceKey] === "خاص" && <span style={{ fontSize: 9, fontWeight: 800, background: "#E8951A", color: "#fff", padding: "1px 6px", borderRadius: 99, flexShrink: 0 }}>خاص</span>}
                        <span style={{ fontSize: 16, color: campColor, fontWeight: 700, flexShrink: 0 }}>＋</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal إضافة مخيم */}
      <Modal show={showAdd} onClose={() => { setShowAdd(false); setNameError(""); }} title={`${iconTitle} — مخيم جديد`} maxWidth={340}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>رقم / اسم المخيم</div>
          <input style={{ ...inp, borderColor: nameError ? "var(--danger)" : "var(--border)" }} value={campName} onChange={e => { setCampName(e.target.value); setNameError(""); }} autoFocus onKeyDown={e => e.key === "Enter" && addCamp()} />
          {nameError && <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 4 }}>{nameError}</div>}
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>الجنس</div>
          <div style={{ display: "flex", gap: 8 }}>
            {(["ذكر", "أنثى"] as const).map(g => (
              <div key={g} onClick={() => setCampGender(g)} style={{ flex: 1, padding: 8, borderRadius: 8, border: `1.5px solid ${campGender === g ? (g === "ذكر" ? "var(--info)" : "var(--female-fg)") : "var(--border)"}`, background: campGender === g ? (g === "ذكر" ? "var(--male-bg)" : "var(--female-bg)") : "transparent", cursor: "pointer", textAlign: "center", fontSize: 12, color: campGender === g ? (g === "ذكر" ? "var(--info)" : "var(--female-fg)") : "var(--text-muted)" }}>
                {g === "ذكر" ? "رجال" : "نساء"}
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>نوع المخيم</div>
          <div style={{ display: "flex", gap: 8 }}>
            {(["عادي", "خاص"] as const).map(t => (
              <div key={t} onClick={() => setCampType(t)} style={{ flex: 1, padding: 8, borderRadius: 8, border: `1.5px solid ${campType === t ? "var(--em7)" : "var(--border)"}`, background: campType === t ? "rgba(125,31,60,.08)" : "transparent", cursor: "pointer", textAlign: "center", fontSize: 12, color: campType === t ? "var(--em7)" : "var(--text-muted)" }}>
                {t}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={addCamp} style={{ ...btnP(), flex: 1 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> إضافة</button>
          <button onClick={() => { setShowAdd(false); setNameError(""); }} style={btnS()}>إلغاء</button>
        </div>
      </Modal>

    </div>
  );
}

export { CampsStats, CampsPage };
