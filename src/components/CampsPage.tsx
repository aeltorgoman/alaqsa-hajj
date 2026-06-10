import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import type { Passenger, Camp } from "../types";
import { Avatar } from "./Avatar";
import { Modal } from "./Modal";
import { inp, btnP, btnS } from "../utils";

function CampsStats({ camps, passengers, campIdKey, campServiceKey }: { camps: Camp[]; passengers: Passenger[]; campIdKey: string; campServiceKey: string }) {
  const stats = useMemo(() => {
    const total = passengers.length;
    const assignedCount = passengers.filter(p => (p as any)[campIdKey] != null).length;
    const unassigned = total - assignedCount;
    const specialRequested = passengers.filter(p => (p.services as any)?.[campServiceKey] === "خاص").length;
    return { total, assignedCount, unassigned, specialRequested };
  }, [camps, passengers, campIdKey, campServiceKey]);
  const { total, assignedCount, unassigned, specialRequested } = stats;

  const cards = [
    { label: "إجمالي الحجاج", num: total, sub: "الموسم الحالي", border: "#c8a24b", clr: "var(--em8)", bg: "var(--paper)" },
    { label: "موزّعون", num: assignedCount, sub: `${total ? Math.round(assignedCount/total*100) : 0}٪ من الإجمالي`, border: "#2A9D8F", clr: "#2A9D8F", bg: "rgba(42,157,143,0.05)" },
    { label: "غير موزّعين", num: unassigned, sub: unassigned > 0 ? "يحتاج توزيع" : "مكتمل", border: unassigned > 0 ? "#c0392b" : "#ccc", clr: unassigned > 0 ? "#c0392b" : "var(--muted)", bg: unassigned > 0 ? "rgba(192,57,43,0.05)" : "var(--paper)" },
    { label: "طالبين خاص", num: specialRequested, sub: `${total ? Math.round(specialRequested/total*100) : 0}٪ من الإجمالي`, border: "#E8951A", clr: "#E8951A", bg: "rgba(232,149,26,0.05)" },
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

// ===== ملخص صفحة الفندق =====
function CampsPage({ pageType, passengers, setPassengers }: { pageType: "منى" | "عرفة"; passengers: Passenger[]; setPassengers: (p: Passenger[]) => void }) {
  const [camps, setCamps] = useState<Camp[]>([]);
  const [editingCampId, setEditingCampId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(new Set<number>());
  const [showAdd, setShowAdd] = useState(false);
  const [showAddP, setShowAddP] = useState(false);
  const [campName, setCampName] = useState("");
  const [campGender, setCampGender] = useState<"ذكر" | "أنثى">("ذكر");
  const [campType, setCampType] = useState<"عادي" | "خاص">("عادي");
  const [nameError, setNameError] = useState("");
  const [currentCampId, setCurrentCampId] = useState<number | null>(null);
  const [selectedP, setSelectedP] = useState(new Set<number>());
  const [pSearch, setPSearch] = useState("");

  const campIdKey = pageType === "منى" ? "camp_mina_id" : "camp_arafa_id";
  const serviceKey = pageType === "منى" ? "camp_mina" : "camp_arafa";
  const IconSvg = () => pageType === "منى"
    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/></svg>
    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>;
  const iconTitle = pageType === "منى" ? "⛺" : "🏔️";

  useEffect(() => {
    supabase.from("camps").select("*").eq("page_type", pageType).order("created_at").then(({ data }: any) => { if (data) setCamps(data as Camp[]); });
  }, [pageType]);

  const getCampPassengers = (campId: number) => passengers.filter(p => (p as any)[campIdKey] === campId);

  const toggleCamp = (id: number) => setExpanded(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const addCamp = async () => {
    if (!campName.trim()) return;
    if (camps.some(c => c.name.trim() === campName.trim() && c.gender === campGender)) { setNameError(`مخيم ${campGender === "ذكر" ? "رجال" : "نساء"} باسم "${campName}" موجود!`); return; }
    setNameError("");
    const { data, error } = await supabase.from("camps").insert([{ name: campName.trim(), gender: campGender, type: campType, page_type: pageType }]).select();
    if (error) { alert(`❌ فشل في إضافة المخيم: ${error.message || "يرجى المحاولة مرة أخرى"}`); return; }
    if (!error && data?.[0]) {
      setCamps(prev => [...prev, data[0] as Camp]);
      setExpanded(prev => new Set([...prev, data[0].id]));
      setCampName(""); setCampGender("ذكر"); setCampType("عادي"); setShowAdd(false);
    }
  };

  const deleteCamp = async (id: number) => {
    if (getCampPassengers(id).length > 0) { alert("أزل المسافرين الأول!"); return; }
    const { error } = await supabase.from("camps").delete().eq("id", id);
    if (error) { alert(`❌ فشل في حذف المخيم: ${error.message}`); return; }
    setCamps(prev => prev.filter(c => c.id !== id));
  };

  const openAddP = (campId: number) => { setCurrentCampId(campId); setSelectedP(new Set()); setPSearch(""); setShowAddP(true); };
  const toggleSelectP = (id: number) => setSelectedP(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const confirmAddP = async () => {
    await Promise.all([...selectedP].map(id => supabase.from("passengers").update({ [campIdKey]: currentCampId }).eq("id", id)));
    setPassengers(passengers.map(p => selectedP.has(p.id) ? { ...p, [campIdKey]: currentCampId } : p));
    // اقتراح إضافة الأقارب
    const isSpecial = currentCamp?.type === "خاص";
    const familyToAdd = passengers.filter(p => !selectedP.has(p.id) && (p as any)[campIdKey] == null && (isSpecial || p.gender === currentCamp?.gender) && [...selectedP].some(id => { const sel = passengers.find(x => x.id === id); return sel?.family_id && sel.family_id === p.family_id; }));
    if (familyToAdd.length > 0 && confirm(`هتوضع حجاج بدون أقاربهم!\nهتضيف أقاربهم معاهم؟\n${familyToAdd.map(p => p.short_ar).join("، ")}`)) {
      await Promise.all(familyToAdd.map(p => supabase.from("passengers").update({ [campIdKey]: currentCampId }).eq("id", p.id)));
      setPassengers((passengers as Passenger[]).map(p => familyToAdd.some((f: Passenger) => f.id === p.id) ? { ...p, [campIdKey]: currentCampId } : p));
    }
    setShowAddP(false);
  };

  const removeP = async (pId: number) => {
    await supabase.from("passengers").update({ [campIdKey]: null }).eq("id", pId);
    setPassengers(passengers.map(p => p.id === pId ? { ...p, [campIdKey]: null } : p));
  };

  const moveP = async (pId: number, toId: string) => {
    if (!toId) return;
    const newCampId = parseInt(toId);
    const fc = camps.find(c => c.id === (passengers.find(p => p.id === pId) as any)?.[campIdKey]);
    const tc = camps.find(c => c.id === newCampId);
    if (fc && tc && fc.gender !== tc.gender && tc.type !== "خاص") return;
    await supabase.from("passengers").update({ [campIdKey]: newCampId }).eq("id", pId);
    setPassengers(passengers.map(p => p.id === pId ? { ...p, [campIdKey]: newCampId } : p));
  };

  const printCamp = (camp: Camp) => {
    const cp = getCampPassengers(camp.id);
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<html><head><title>مخيم ${camp.name}</title><style>body{font-family:Arial;direction:rtl;padding:20px}h2{text-align:center}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px;text-align:right}th{background:${camp.gender === "ذكر" ? "var(--info)" : "var(--female-fg)"};color:white}</style></head><body><h2>${icon} مخيم ${camp.name} — ${camp.gender === "ذكر" ? "رجال" : "نساء"} (${camp.type})</h2><table><tr><th>م</th><th>الاسم</th></tr>${cp.map((p, i) => `<tr><td>${i + 1}</td><td>${p.short_ar}</td></tr>`).join("")}</table><script>window.print();</script></body></html>`);
    w.document.close();
  };

  const printAll = () => {
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<html><head><title>مخيمات ${pageType}</title><style>body{font-family:Arial;direction:rtl;padding:20px}h1,h2{text-align:center}table{width:100%;border-collapse:collapse;margin-bottom:20px}th,td{border:1px solid #ccc;padding:7px;text-align:right}@media print{.c{page-break-after:always}}</style></head><body><h1>${icon} مخيمات ${pageType}</h1>${camps.map(camp => { const cp = getCampPassengers(camp.id); return `<div class="c"><h2 style="background:${camp.gender === "ذكر" ? "var(--info)" : "var(--female-fg)"};color:white;padding:8px;border-radius:6px">مخيم ${camp.name} — ${camp.gender === "ذكر" ? "رجال" : "نساء"}</h2><table><tr><th style="background:#555;color:white">م</th><th style="background:#555;color:white">الاسم</th></tr>${cp.map((p, i) => `<tr><td>${i + 1}</td><td>${p.short_ar}</td></tr>`).join("")}</table></div>`; }).join("")}<script>window.print();</script></body></html>`);
    w.document.close();
  };

  const currentCamp = camps.find(c => c.id === currentCampId);
  const genderPool = currentCamp?.type === "خاص" ? passengers : passengers.filter(p => p.gender === currentCamp?.gender);
  const filteredP = genderPool.filter(p => !pSearch || p.name_ar.includes(pSearch));
  const maleCamps = camps.filter(c => c.gender === "ذكر");
  const femaleCamps = camps.filter(c => c.gender === "أنثى");

  const renderGroup = (groupCamps: Camp[], gender: "ذكر" | "أنثى") => (
    <div style={{ marginBottom: 16 }}>
      <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 99, background: gender === "ذكر" ? "var(--male-bg)" : "var(--female-bg)", color: gender === "ذكر" ? "var(--info)" : "var(--female-fg)", display: "inline-block", marginBottom: 10 }}>
        {gender === "ذكر" ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> رجال</> : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> نساء</>} ({groupCamps.length})
      </span>
      {groupCamps.length === 0 ? <div style={{ fontSize: 11, color: "var(--text-muted)", padding: "6px 0" }}>لا يوجد مخيمات بعد</div> :
        groupCamps.map(camp => {
          const isExpanded = expanded.has(camp.id);
          const cp = getCampPassengers(camp.id);
          const sameCamps = camps.filter(c => c.id !== camp.id && c.gender === camp.gender);
          const isSpecial = camp.type === "خاص";
          return (
            <div key={camp.id} style={{ border: `0.5px solid ${isSpecial ? "var(--accent)" : "var(--border)"}`, borderRadius: 12, marginBottom: 8, overflow: "hidden" }}>
              <div onClick={() => toggleCamp(camp.id)} style={{ padding: "9px 12px", background: isSpecial ? "var(--warning-bg)" : "var(--bg-2)", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <IconSvg />
                <div style={{ flex: 1 }}>
                  <div onDoubleClick={e => { e.stopPropagation(); setEditingCampId(camp.id); }}>
                    {editingCampId === camp.id ? (
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }} onClick={e => e.stopPropagation()}>
                        <input defaultValue={camp.name} id={`cn-${camp.id}`} style={{ ...inp, fontSize: 12, padding: "3px 8px", width: 110 }} autoFocus
                          onKeyDown={e => { if (e.key === "Enter") { const v = (document.getElementById(`cn-${camp.id}`) as HTMLInputElement)?.value?.trim(); if (v) { supabase.from("camps").update({ name: v }).eq("id", camp.id); setCamps(camps.map(c => c.id === camp.id ? { ...c, name: v } : c)); } setEditingCampId(null); } if (e.key === "Escape") setEditingCampId(null); }} />
                        <button onClick={() => { const v = (document.getElementById(`cn-${camp.id}`) as HTMLInputElement)?.value?.trim(); if (v) { supabase.from("camps").update({ name: v }).eq("id", camp.id); setCamps(camps.map(c => c.id === camp.id ? { ...c, name: v } : c)); } setEditingCampId(null); }} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "var(--em7)", color: "#fff", border: "none", cursor: "pointer" }}>✓</button>
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>مخيم {camp.name} <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: isSpecial ? "var(--warning-bg)" : "var(--bg-2)", color: isSpecial ? "var(--warning)" : "var(--text-muted)" }}>{isSpecial ? "خاص" : "عادي"}</span></div>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{cp.length} مسافر</div>
                </div>
                <button onClick={e => { e.stopPropagation(); printCamp(camp); }} style={{ background: "var(--bg-2)", border: "none", padding: "3px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg></button>
                <button onClick={e => { e.stopPropagation(); openAddP(camp.id); }} title="إضافة مسافر" style={{ height: 30, padding: "0 12px", borderRadius: 8, display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(125,31,60,0.08)", border: "1px solid rgba(125,31,60,0.2)", cursor: "pointer", color: "var(--em7)", fontSize: 12, fontWeight: 600, fontFamily: "var(--font-body)", transition: "var(--transition)" }} onMouseEnter={e => { e.currentTarget.style.background = "rgba(125,31,60,0.15)"; }} onMouseLeave={e => { e.currentTarget.style.background = "rgba(125,31,60,0.08)"; }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> إضافة</button>
                <button onClick={e => { e.stopPropagation(); deleteCamp(camp.id); }} title="حذف الخيمة" style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: cp.length === 0 ? "var(--fb)" : "var(--paper)", border: `1px solid ${cp.length === 0 ? "rgba(122,46,69,0.2)" : "var(--line)"}`, cursor: cp.length === 0 ? "pointer" : "not-allowed", color: cp.length === 0 ? "var(--ff)" : "var(--text-muted)", transition: "var(--transition)" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" style={{ transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>
              </div>
              {isExpanded && (
                <div style={{ padding: "8px 12px", borderTop: `0.5px solid ${isSpecial ? "var(--accent)" : "var(--border)"}` }}>
                  {cp.length ? cp.map((p, i) => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 4px", borderRadius: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 10, color: "var(--text-muted)", width: 18, textAlign: "center" }}>{i + 1}</span>
                      <Avatar name={p.name_ar} gender={p.gender} size={24} />
                      <span style={{ fontSize: 11, flex: 1 }}>{p.short_ar}</span>
                      {(p.services as any)[serviceKey] === "خاص" && <span style={{ fontSize: 9, background: "var(--warning-bg)", color: "var(--warning)", padding: "1px 5px", borderRadius: 99 }}>⭐ خاص</span>}
                      {sameCamps.length > 0 && <select onChange={e => moveP(p.id, e.target.value)} defaultValue="" style={{ fontSize: 10, background: "var(--bg-2)", border: "0.5px solid #ddd", borderRadius: 4, padding: "2px 4px", fontFamily: "inherit" }}><option value="">نقل لـ...</option>{sameCamps.map(c => <option key={c.id} value={c.id}>مخيم {c.name}</option>)}</select>}
                      <button onClick={() => removeP(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--border)", fontSize: 12 }}>✕</button>
                    </div>
                  )) : <div style={{ textAlign: "center", padding: "10px", color: "var(--text-muted)", fontSize: 11 }}>لا يوجد مسافرون</div>}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );

  return (
    <div style={{ padding: 14, overflowY: "auto", height: "100%" }}>
      <CampsStats camps={camps} passengers={passengers} campIdKey={campIdKey} campServiceKey={pageType === "منى" ? "camp_mina" : "camp_arafa"} />
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => setShowAdd(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 99, background: "var(--paper)", border: "1px solid var(--line)", color: "var(--em7)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)", transition: "var(--transition)", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }} onMouseEnter={e => { e.currentTarget.style.background = "rgba(125,31,60,0.06)"; e.currentTarget.style.borderColor = "var(--em7)"; }} onMouseLeave={e => { e.currentTarget.style.background = "var(--paper)"; e.currentTarget.style.borderColor = "var(--line)"; }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> مخيم جديد</button>
        {camps.length > 0 && <button onClick={printAll} style={btnS()}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> طباعة الكل</button>}
      </div>
      {!camps.length ? <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)", fontSize: 12 }}><div style={{ fontSize: 32, marginBottom: 8 }}><IconSvg /></div>لا يوجد مخيمات بعد</div> : (<>{renderGroup(maleCamps, "ذكر")}{renderGroup(femaleCamps, "أنثى")}</>)}
      <Modal show={showAdd} onClose={() => { setShowAdd(false); setNameError(""); }} title={`${iconTitle} مخيم جديد`} maxWidth={340}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>رقم / اسم المخيم</div>
          <input style={{ ...inp, borderColor: nameError ? "var(--danger)" : "var(--border)" }} value={campName} onChange={e => { setCampName(e.target.value); setNameError(""); }} autoFocus onKeyDown={e => e.key === "Enter" && addCamp()} />
          {nameError && <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 4 }}>{nameError}</div>}
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>الجنس</div>
          <div style={{ display: "flex", gap: 8 }}>
            {(["ذكر", "أنثى"] as const).map(g => <div key={g} onClick={() => setCampGender(g)} style={{ flex: 1, padding: 8, borderRadius: 8, border: `1.5px solid ${campGender === g ? (g === "ذكر" ? "var(--info)" : "var(--female-fg)") : "var(--border)"}`, background: campGender === g ? (g === "ذكر" ? "var(--male-bg)" : "var(--female-bg)") : "transparent", cursor: "pointer", textAlign: "center", fontSize: 12, color: campGender === g ? (g === "ذكر" ? "var(--info)" : "var(--female-fg)") : "var(--text-muted)" }}>{g === "ذكر" ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> رجال</> : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> نساء</>}</div>)}
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>نوع الخيمة</div>
          <div style={{ display: "flex", gap: 8 }}>
            {(["عادي", "خاص"] as const).map(t => <div key={t} onClick={() => setCampType(t)} style={{ flex: 1, padding: 8, borderRadius: 8, border: `1.5px solid ${campType === t ? "var(--em7)" : "var(--border)"}`, background: campType === t ? "rgba(125,31,60,.08)" : "transparent", cursor: "pointer", textAlign: "center", fontSize: 12, color: campType === t ? "var(--em7)" : "var(--text-muted)" }}>{t === "خاص" ? "خاص" : "عادي"}</div>)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={addCamp} style={{ ...btnP(), flex: 1 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> إضافة</button>
          <button onClick={() => { setShowAdd(false); setNameError(""); }} style={btnS()}>إلغاء</button>
        </div>
      </Modal>
      <Modal show={showAddP} onClose={() => setShowAddP(false)} title={`إضافة ${currentCamp?.gender === "ذكر" ? "رجال" : "نساء"} — مخيم ${currentCamp?.name}`}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-2)", border: "0.5px solid #ddd", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}>
          <span style={{ color: "var(--text-muted)" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21-4.35-4.35"/></svg></span>
          <input style={{ border: "none", background: "transparent", fontSize: 12, flex: 1, outline: "none", fontFamily: "inherit" }} placeholder="ابحث..." value={pSearch} onChange={e => setPSearch(e.target.value)} />
        </div>
        {filteredP.length === 0 ? <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 12, padding: "1rem" }}>لا يوجد مسافرين</div> :
          filteredP.map(p => {
            const isInCamp = (p as any)[campIdKey] === currentCampId;
            const isAssigned = (p as any)[campIdKey] != null && !isInCamp;
            const isSel = selectedP.has(p.id);
            const wantsSpecial = (p.services as any)[serviceKey] === "خاص";
            return (
              <div key={p.id} onClick={() => !isAssigned && !isInCamp && toggleSelectP(p.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 8, marginBottom: 3, cursor: isAssigned || isInCamp ? "not-allowed" : "pointer", background: isSel ? "rgba(125,31,60,.08)" : wantsSpecial ? "var(--warning-bg)" : "transparent", border: `0.5px solid ${isSel ? "var(--em7)" : wantsSpecial ? "var(--accent)" : "transparent"}`, opacity: isAssigned ? 0.4 : 1 }}>
                <Avatar name={p.name_ar} gender={p.gender} size={28} />
                <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 500 }}>{p.short_ar}</div><div style={{ fontSize: 10, color: "var(--text-muted)" }}>{isInCamp ? <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> في المخيم</> : isAssigned ? "موزّع" : "غير موزّع"}</div></div>
                {wantsSpecial && <span style={{ fontSize: 9, background: "var(--warning-bg)", color: "var(--warning)", padding: "1px 5px", borderRadius: 99 }}>⭐ خاص</span>}
                {isSel && <span style={{ color: "var(--em7)" }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg></span>}
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



export { CampsStats, CampsPage };
