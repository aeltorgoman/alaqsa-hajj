import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import type { Passenger, User } from "../types";
import { Modal } from "./Modal";
import { AlertModal, useAlert } from "./AlertModal";
import { btnS, inp } from "../utils";

function ArchivePage({ currentUser }: { currentUser: User }) {
  const [seasons, setSeasons] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [data, setData] = useState<{ passengers: Passenger[]; buses: any[]; camps: any[]; rooms: any[] }>({ passengers: [], buses: [], camps: [], rooms: [] });
  const [loading, setLoading] = useState(false);
  const [activeReport, setActiveReport] = useState("passengers");
  const [showClose, setShowClose] = useState(false);
  const [closeStep, setCloseStep] = useState(1);
  const [newSeasonName, setNewSeasonName] = useState("");
  const [closing, setClosing] = useState(false);
  const { alert: alertState, showAlert } = useAlert();

  useEffect(() => {
    supabase.from("seasons").select("*").not("closed_at", "is", null).order("id", { ascending: false })
      .then(({ data: d }: any) => { if (d) setSeasons(d); });
  }, []);

  const [showDelete, setShowDelete] = useState(false);
  const [deleteStep, setDeleteStep] = useState(1);
  const [seasonToDelete, setSeasonToDelete] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openDelete = (s: { id: number; name: string; created_at: string }) => { setSeasonToDelete(s); setDeleteStep(1); setShowDelete(true); };

  const confirmDelete = async () => {
    if (!seasonToDelete) return;
    setDeleting(true);
    await Promise.all([
      supabase.from("passengers").delete().eq("season_id", seasonToDelete.id),
      supabase.from("buses").delete().eq("season_id", seasonToDelete.id),
      supabase.from("camps").delete().eq("season_id", seasonToDelete.id),
      supabase.from("rooms").delete().eq("season_id", seasonToDelete.id),
    ]);
    await supabase.from("seasons").delete().eq("id", seasonToDelete.id);
    setSeasons(prev => prev.filter(s => s.id !== seasonToDelete.id));
    setDeleting(false); setShowDelete(false); setSeasonToDelete(null);
  };

  const openSeason = async (season: { id: number; name: string; created_at: string }) => {
    setSelected(season); setLoading(true); setActiveReport("passengers");
    const [{ data: p }, { data: b }, { data: c }, { data: r }] = await Promise.all([
      supabase.from("passengers").select("*").eq("season_id", season.id),
      supabase.from("buses").select("*").eq("season_id", season.id),
      supabase.from("camps").select("*").eq("season_id", season.id),
      supabase.from("rooms").select("*").eq("season_id", season.id),
    ]);
    setData({ passengers: (p || []) as unknown as Passenger[], buses: b || [], camps: c || [], rooms: r || [] });
    setLoading(false);
  };

  const closeSeason = async () => {
    if (!newSeasonName.trim()) { showAlert("warning", "يرجى كتابة اسم الموسم الجديد."); return; }
    setClosing(true);
    // جيب الموسم الحالي
    const { data: current } = await supabase.from("seasons").select("*").is("closed_at", null).single();
    if (!current) { showAlert("error", "لا يوجد موسم مفتوح حالياً."); setClosing(false); return; }
    // قفّل الموسم الحالي
    await supabase.from("seasons").update({ closed_at: new Date().toISOString(), closed_by: currentUser.name }).eq("id", current.id);
    // افتح موسم جديد
    const { data: newSeason } = await supabase.from("seasons").insert([{ name: newSeasonName.trim() }]).select().single();
    if (newSeason) {
      // حدّث season_id للبيانات الحالية (الكل يتنقل للأرشيف)
      await Promise.all([
        supabase.from("passengers").update({ season_id: current.id }).is("season_id", null),
        supabase.from("buses").update({ season_id: current.id }).is("season_id", null),
        supabase.from("camps").update({ season_id: current.id }).is("season_id", null),
        supabase.from("rooms").update({ season_id: current.id }).is("season_id", null),
      ]);
    }
    // إضافة الموسم المقفول للقائمة
    const { data: closedSeasons } = await supabase.from("seasons").select("*").not("closed_at", "is", null).order("id", { ascending: false });
    if (closedSeasons) setSeasons(closedSeasons);
    setShowClose(false); setNewSeasonName(""); setClosing(false);
    showAlert("success", `تم إقفال الموسم الحالي وبدء موسم ${newSeasonName}.`);
  };

  const getBusPassengers = (busId: number) => data.passengers.filter(p => p.bus_id === busId);
  const getCampPassengers = (campId: number, key: string) => data.passengers.filter(p => (p as any)[key] === campId);
  const getRoomPassengers = (roomId: number) => data.passengers.filter(p => p.room_id === roomId);

  const printPassengers = () => {
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<html><head><title>قائمة الحجاج - ${selected?.name}</title><style>body{font-family:Arial;direction:rtl;padding:16px;font-size:10px}h1{text-align:center}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:5px 8px;text-align:right}th{background:#1D9E75;color:white}tr:nth-child(even){background:#f9f9f9}</style></head><body><h1>قائمة الحجاج — موسم ${selected?.name}</h1><table><tr><th>م</th><th>الاسم</th><th>الجواز</th><th>الجنسية</th><th>الجنس</th></tr>${data.passengers.map((p, i) => `<tr><td>${i + 1}</td><td>${p.name_ar}</td><td>${p.passport}</td><td>${p.nat}</td><td>${p.gender}</td></tr>`).join("")}</table><script>window.print();</script></body></html>`);
    w.document.close();
  };

  if (!selected) {
    return (
      <div style={{ padding: 16, overflowY: "auto", height: "100%" }}>
        <AlertModal alert={alertState} onClose={() => showAlert(null)} />
        {currentUser.permissions.view_archive && (
          <div style={{ background: "var(--warning-bg)", border: "1px solid #e67e22", borderRadius: 12, padding: "12px 14px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div><div style={{ fontSize: 13, fontWeight: 600 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> إقفال الموسم الحالي</div><div style={{ fontSize: 11, color: "var(--text-muted)" }}>إقفال الموسم وبدء موسم حج جديد</div></div>
            <button onClick={() => { setShowClose(true); setCloseStep(1); setNewSeasonName(""); }} style={{ background: "var(--warning)", color: "var(--bg-card)", border: "none", padding: "6px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>إقفال</button>
          </div>
        )}
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>المواسم المحفوظة</div>
        {seasons.length === 0 ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}><div style={{ fontSize: 32, marginBottom: 8 }}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v11h14V9M10 13h4"/></svg></div><div>لا يوجد مواسم محفوظة بعد</div></div>
        ) : seasons.map(s => (
          <div key={s.id} onClick={() => openSeason(s)} style={{ border: "0.5px solid var(--border)", borderRadius: 12, padding: "14px 16px", marginBottom: 8, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-card)" }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--bg-2)"} onMouseLeave={e => e.currentTarget.style.background = "var(--bg-card)"}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: "var(--success-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v11h14V9M10 13h4"/></svg></div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>موسم {s.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>أُقفل: {new Date(s.closed_at).toLocaleDateString("ar-EG")} · بواسطة {s.closed_by}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {currentUser.permissions.view_archive && (
                <button onClick={e => { e.stopPropagation(); openDelete(s); }} style={{ background: "var(--female-bg)", border: "none", padding: "4px 10px", borderRadius: 8, fontSize: 11, cursor: "pointer", color: "var(--danger)" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg> مسح</button>
              )}
              <span style={{ color: "var(--border)", fontSize: 18 }}>›</span>
            </div>
          </div>
        ))}
        <Modal show={showClose} onClose={() => setShowClose(false)} title="إقفال الموسم" maxWidth={380}>
          {/* مؤشر الخطوات */}
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {[1, 2, 3].map(s => (
              <div key={s} style={{ flex: 1, height: 4, borderRadius: 99, background: closeStep >= s ? "var(--warning)" : "var(--border)" }} />
            ))}
          </div>

          {/* الخطوة 1: تحذير */}
          {closeStep === 1 && (
            <>
              <div style={{ background: "var(--female-bg)", border: "1px solid #e74c3c", borderRadius: 10, padding: "14px 16px", marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--danger)", marginBottom: 8 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> تنبيه مهم — إقفال الموسم</div>
                <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.7 }}>
                  أنت على وشك إقفال الموسم الحالي نهائياً.<br /><br />
                  سيتم نقل جميع البيانات (الحجاج، الباصات، المخيمات، الغرف) إلى الأرشيف، ولن تتمكن من التعديل عليها بعد ذلك — للعرض فقط.<br /><br />
                  سيبدأ موسم جديد فارغ تماماً.<br /><br />
                  <span style={{ fontWeight: 700, color: "var(--danger)" }}>هذا الإجراء لا يمكن التراجع عنه.</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setCloseStep(2)} style={{ background: "var(--warning)", color: "var(--bg-card)", border: "none", padding: "9px 0", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600, flex: 1 }}>فهمت، التالي ←</button>
                <button onClick={() => setShowClose(false)} style={btnS()}>إلغاء</button>
              </div>
            </>
          )}

          {/* الخطوة 2: اسم الموسم الجديد */}
          {closeStep === 2 && (
            <>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>اكتب اسم الموسم الجديد الذي سيبدأ بعد الإقفال:</div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>اسم الموسم الجديد</div>
                <input style={inp} value={newSeasonName} onChange={e => setNewSeasonName(e.target.value)} placeholder="مثال: 1449" autoFocus />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { if (!newSeasonName.trim()) { showAlert("warning", "يرجى كتابة اسم الموسم الجديد."); return; } setCloseStep(3); }} style={{ background: "var(--warning)", color: "var(--bg-card)", border: "none", padding: "9px 0", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600, flex: 1 }}>التالي ←</button>
                <button onClick={() => setCloseStep(1)} style={btnS()}>→ رجوع</button>
              </div>
            </>
          )}

          {/* الخطوة 3: التأكيد النهائي */}
          {closeStep === 3 && (
            <>
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>تأكيد إقفال الموسم</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>سيتم إقفال الموسم الحالي نهائياً<br />وبدء موسم <span style={{ fontWeight: 700, color: "var(--em7)" }}>{newSeasonName}</span></div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={closeSeason} disabled={closing} style={{ background: "var(--danger)", color: "var(--bg-card)", border: "none", padding: "9px 0", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600, flex: 1, opacity: closing ? 0.6 : 1 }}>{closing ? "جاري الإقفال..." : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> إقفال الموسم نهائياً</>}</button>
                <button onClick={() => setCloseStep(2)} disabled={closing} style={btnS()}>→ رجوع</button>
              </div>
            </>
          )}
        </Modal>
        <Modal show={showDelete} onClose={() => setShowDelete(false)} title="مسح موسم من الأرشيف" maxWidth={380}>
          <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {[1, 2, 3].map(s => <div key={s} style={{ flex: 1, height: 4, borderRadius: 99, background: deleteStep >= s ? "var(--danger)" : "var(--border)" }} />)}
          </div>
          {deleteStep === 1 && (
            <>
              <div style={{ background: "var(--female-bg)", border: "1px solid #e74c3c", borderRadius: 10, padding: "14px 16px", marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--danger)", marginBottom: 8 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> تحذير — مسح موسم من الأرشيف</div>
                <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.7 }}>
                  أنت على وشك مسح موسم <span style={{ fontWeight: 700 }}>{seasonToDelete?.name}</span> نهائياً من الأرشيف.<br /><br />
                  سيتم مسح جميع البيانات المرتبطة بهذا الموسم (الحجاج، الباصات، المخيمات، الغرف) بشكل كامل.<br /><br />
                  <span style={{ fontWeight: 700, color: "var(--danger)" }}>هذا الإجراء لا يمكن التراجع عنه.</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setDeleteStep(2)} style={{ background: "var(--danger)", color: "var(--bg-card)", border: "none", padding: "9px 0", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600, flex: 1 }}>فهمت، التالي ←</button>
                <button onClick={() => setShowDelete(false)} style={btnS()}>إلغاء</button>
              </div>
            </>
          )}
          {deleteStep === 2 && (
            <>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.6 }}>هل أنت متأكد 100% إنك عايز تمسح موسم <span style={{ fontWeight: 700, color: "var(--danger)" }}>{seasonToDelete?.name}</span> وكل بياناته؟</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setDeleteStep(3)} style={{ background: "var(--danger)", color: "var(--bg-card)", border: "none", padding: "9px 0", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600, flex: 1 }}>نعم، متأكد — التالي ←</button>
                <button onClick={() => setDeleteStep(1)} style={btnS()}>→ رجوع</button>
              </div>
            </>
          )}
          {deleteStep === 3 && (
            <>
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>تأكيد المسح النهائي</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>سيتم مسح موسم <span style={{ fontWeight: 700, color: "var(--danger)" }}>{seasonToDelete?.name}</span> وكل بياناته نهائياً</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={confirmDelete} disabled={deleting} style={{ background: "var(--danger)", color: "var(--bg-card)", border: "none", padding: "9px 0", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600, flex: 1, opacity: deleting ? 0.6 : 1 }}>{deleting ? "جاري المسح..." : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg> مسح نهائي</>}</button>
                <button onClick={() => setDeleteStep(2)} disabled={deleting} style={btnS()}>→ رجوع</button>
              </div>
            </>
          )}
        </Modal>
      </div>
    );
  }

  return (
    <div style={{ padding: 14, overflowY: "auto", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <button onClick={() => setSelected(null)} style={btnS()}>رجوع</button>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>موسم {selected.name}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{data.passengers.length} حاج · للعرض فقط</div>
        </div>
      </div>
      {/* تاب التقارير */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {[["passengers", "الحجاج"], ["flight", "الطيران"], ["buses", "الباصات"], ["mina", "منى"], ["arafa", "عرفة"], ["hotel", "الفندق"]].map(([id, label]) => (
          <div key={id} onClick={() => setActiveReport(id)} style={{ padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontSize: 11, background: activeReport === id ? "var(--em7)" : "var(--bg-2)", color: activeReport === id ? "var(--text-inverse)" : "var(--text-muted)", fontWeight: activeReport === id ? 500 : 400 }}>{label}</div>
        ))}
      </div>

      {loading ? <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>جاري التحميل...</div> : (<>

        {activeReport === "passengers" && (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead><tr style={{ background: "var(--em7)", color: "var(--g3)" }}>{["م", "الاسم", "رقم الجواز", "الجنسية", "الجنس"].map(h => <th key={h} style={{ padding: "7px 10px", textAlign: "right", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
              <tbody>{data.passengers.map((p, i) => <tr key={p.id} style={{ background: i % 2 === 0 ? "var(--bg-card)" : "var(--bg-2)" }}><td style={{ padding: "6px 10px", border: "0.5px solid var(--border)" }}>{i + 1}</td><td style={{ padding: "6px 10px", border: "0.5px solid var(--border)", fontWeight: 500 }}>{p.name_ar}</td><td style={{ padding: "6px 10px", border: "0.5px solid var(--border)" }}>{p.passport}</td><td style={{ padding: "6px 10px", border: "0.5px solid var(--border)" }}>{p.nat}</td><td style={{ padding: "6px 10px", border: "0.5px solid var(--border)" }}>{p.gender}</td></tr>)}</tbody>
            </table>
            <button onClick={printPassengers} style={{ ...btnS(), width: "100%", marginTop: 12 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> طباعة</button>
          </>
        )}

        {activeReport === "flight" && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, direction: "ltr" }}>
            <thead><tr style={{ background: "var(--em7)", color: "var(--g3)" }}>{["S.N.", "FULL NAME", "NAT.", "PASSPORT NO.", "GENDER"].map(h => <th key={h} style={{ padding: "7px 10px", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
            <tbody>{data.passengers.filter(p => p.services?.flight !== "بدون").map((p, i) => <tr key={p.id} style={{ background: i % 2 === 0 ? "var(--bg-card)" : "var(--bg-2)" }}><td style={{ padding: "6px 10px", border: "0.5px solid var(--border)" }}>{i + 1}</td><td style={{ padding: "6px 10px", border: "0.5px solid var(--border)", fontWeight: 500 }}>{p.name_en}</td><td style={{ padding: "6px 10px", border: "0.5px solid var(--border)" }}>{p.nat}</td><td style={{ padding: "6px 10px", border: "0.5px solid var(--border)" }}>{p.passport}</td><td style={{ padding: "6px 10px", border: "0.5px solid var(--border)" }}>{p.gender === "ذكر" ? "MR." : "MRS."}</td></tr>)}</tbody>
          </table>
        )}

        {activeReport === "buses" && data.buses.map(bus => {
          const bp = getBusPassengers(bus.id);
          return (
            <div key={bus.id} style={{ border: "0.5px solid var(--border)", borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
              <div style={{ padding: "8px 12px", background: "var(--bg-2)", fontSize: 13, fontWeight: 500 }}>{bus.name} ({bus.type}) · {bp.length} مسافر</div>
              {bp.length > 0 && <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}><thead><tr style={{ background: "var(--em7)", color: "var(--g3)" }}><th style={{ padding: "5px 10px" }}>م</th><th style={{ padding: "5px 10px", textAlign: "right" }}>الاسم</th><th style={{ padding: "5px 10px", textAlign: "right" }}>الجنسية</th></tr></thead><tbody>{bp.map((p, i) => <tr key={p.id} style={{ background: i % 2 === 0 ? "var(--bg-card)" : "var(--bg-2)" }}><td style={{ padding: "5px 10px", border: "0.5px solid var(--border)", textAlign: "center" }}>{i + 1}</td><td style={{ padding: "5px 10px", border: "0.5px solid var(--border)" }}>{p.short_ar || p.name_ar}</td><td style={{ padding: "5px 10px", border: "0.5px solid var(--border)" }}>{p.nat}</td></tr>)}</tbody></table>}
            </div>
          );
        })}

        {(activeReport === "mina" || activeReport === "arafa") && data.camps.filter(c => c.page_type === (activeReport === "mina" ? "منى" : "عرفة")).map(camp => {
          const key = activeReport === "mina" ? "camp_mina_id" : "camp_arafa_id";
          const cp = getCampPassengers(camp.id, key);
          return (
            <div key={camp.id} style={{ border: "0.5px solid var(--border)", borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
              <div style={{ padding: "8px 12px", background: "var(--bg-2)", fontSize: 13, fontWeight: 500 }}>{activeReport === "mina" ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/></svg>` : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/></svg>`} مخيم {camp.name} — {camp.gender === "ذكر" ? "رجال" : "نساء"} · {cp.length} مسافر</div>
              {cp.length > 0 && <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}><thead><tr style={{ background: camp.gender === "ذكر" ? "var(--info)" : "var(--female-fg)", color: "var(--bg-card)" }}><th style={{ padding: "5px 10px" }}>م</th><th style={{ padding: "5px 10px", textAlign: "right" }}>الاسم</th></tr></thead><tbody>{cp.map((p, i) => <tr key={p.id} style={{ background: i % 2 === 0 ? "var(--bg-card)" : "var(--bg-2)" }}><td style={{ padding: "5px 10px", border: "0.5px solid var(--border)", textAlign: "center" }}>{i + 1}</td><td style={{ padding: "5px 10px", border: "0.5px solid var(--border)" }}>{p.short_ar || p.name_ar}</td></tr>)}</tbody></table>}
            </div>
          );
        })}

        {activeReport === "hotel" && data.rooms.map(room => {
          const rp = getRoomPassengers(room.id);
          return (
            <div key={room.id} style={{ border: "0.5px solid var(--border)", borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
              <div style={{ padding: "8px 12px", background: "var(--bg-2)", fontSize: 13, fontWeight: 500 }}>غرفة {room.number} {room.floor && `(ط${room.floor})`} · {room.type} · {rp.length} مسافر</div>
              {rp.length > 0 && <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}><thead><tr style={{ background: "var(--em7)", color: "var(--g3)" }}><th style={{ padding: "5px 10px" }}>م</th><th style={{ padding: "5px 10px", textAlign: "right" }}>الاسم</th><th style={{ padding: "5px 10px", textAlign: "right" }}>الجنس</th></tr></thead><tbody>{rp.map((p, i) => <tr key={p.id} style={{ background: i % 2 === 0 ? "var(--bg-card)" : "var(--bg-2)" }}><td style={{ padding: "5px 10px", border: "0.5px solid var(--border)", textAlign: "center" }}>{i + 1}</td><td style={{ padding: "5px 10px", border: "0.5px solid var(--border)" }}>{p.short_ar || p.name_ar}</td><td style={{ padding: "5px 10px", border: "0.5px solid var(--border)" }}>{p.gender}</td></tr>)}</tbody></table>}
            </div>
          );
        })}

      </>)}
    </div>
  );
}


export { ArchivePage };
