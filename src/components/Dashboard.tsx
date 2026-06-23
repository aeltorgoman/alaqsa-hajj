import { useMemo, useRef } from "react";
import { useConfig } from "../config/ConfigContext";
import type { Passenger, User } from "../types";
import { Avatar } from "./Avatar";

function Dashboard({ passengers, setPage }: { passengers: Passenger[]; setPage: (p: string) => void }) {
  const config = useConfig();
  const hajj = passengers.filter(p => !p.passenger_type || p.passenger_type === "حاج");

  const { males, females } = useMemo(() => ({
    males:   hajj.filter(p => p.gender === "ذكر").length,
    females: hajj.filter(p => p.gender === "أنثى").length,
  }), [hajj]);

  const total = hajj.length || 1;

  const dist = useMemo(() => {
    const busCount    = hajj.filter(p => (p as any).bus_id        != null).length;
    const minaCount   = hajj.filter(p => (p as any).camp_mina_id  != null).length;
    const arafaCount  = hajj.filter(p => (p as any).camp_arafa_id != null).length;
    const hotelCount  = hajj.filter(p => (p as any).room_id       != null).length;
    const flightCount = hajj.filter(p => (p as any).flight_id     != null).length;
    return [
      { label: "الباصات",     page: "buses",   count: busCount,    pct: Math.round(busCount    / total * 100), icon: `<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="15" cy="18" r="2"/>` },
      { label: "مخيمات منى",  page: "mina",    count: minaCount,   pct: Math.round(minaCount   / total * 100), icon: `<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>` },
      { label: "مخيمات عرفة", page: "arafa",   count: arafaCount,  pct: Math.round(arafaCount  / total * 100), icon: `<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>` },
      { label: "الفندق",      page: "hotel",   count: hotelCount,  pct: Math.round(hotelCount  / total * 100), icon: `<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M10 6h4"/><path d="M10 10h4"/>` },
      { label: "الطيران",     page: "flights", count: flightCount, pct: Math.round(flightCount / total * 100), icon: `<path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>` },
    ];
  }, [hajj, total]);

  const alerts = useMemo(() => {
    const withoutTicket = hajj.filter(p => p.services?.flight === "بدون").length;
    const firstClass    = hajj.filter(p => p.services?.flight === "درجة أولى").length;
    const vipBus        = hajj.filter(p => p.services?.bus    === "VIP").length;
    const noHotel       = hajj.filter(p => p.room_id == null).length;
    const noBus         = hajj.filter(p => p.bus_id  == null).length;
    return [
      { label: "بدون تذكرة طيران", count: withoutTicket, page: "flights", color: "var(--female-fg)", bg: "var(--female-bg)", icon: `<path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>` },
      { label: "طالبين درجة أولى", count: firstClass,    page: "flights", color: "var(--warning)",   bg: "var(--warning-bg)", icon: `<path d="M12 2l2.4 7.6H22l-6.2 4.7 2.4 7.7L12 17l-6.2 5 2.4-7.7L2 9.6h7.6z"/>` },
      { label: "VIP في الباصات",   count: vipBus,        page: "buses",   color: "var(--em7)",       bg: "rgba(125,31,60,0.08)", icon: `<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/>` },
      { label: "بدون غرفة بالفندق",count: noHotel,       page: "hotel",   color: "var(--danger)",    bg: "var(--danger-bg)",  icon: `<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/>` },
      { label: "بدون باص",          count: noBus,         page: "buses",   color: "var(--danger)",    bg: "var(--danger-bg)",  icon: `<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/>` },
    ].filter(a => a.count > 0);
  }, [hajj]);

  const recent   = [...hajj].sort((a, b) => (b.id ?? 0) - (a.id ?? 0)).slice(0, 6);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const primary  = config.color_primary || "#7D1F3C";

  return (
    <div style={{ flex:1, display:"flex", gap:12, overflow:"hidden", padding:"50px 14px 14px" }}>

        {/* ===== وسط ===== */}
        <div style={{ flex:1, minWidth:0, overflowY:"auto", display:"flex", flexDirection:"column", gap:12 }}>

          {/* أزرار الإضافة */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <div onClick={() => scanInputRef.current?.click()} style={{ display:"flex", alignItems:"center", gap:11, padding:13, borderRadius:14, cursor:"pointer", background:"linear-gradient(135deg,"+primary+","+primary+"cc)", color:"#fff", boxShadow:"0 6px 18px "+primary+"44" }}>
              <div style={{ width:38, height:38, borderRadius:10, background:"rgba(255,255,255,0.15)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D4A017" strokeWidth="1.8" strokeLinecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>
              </div>
              <div><div style={{ fontSize:14, fontWeight:700 }}>مسح مستند</div><div style={{ fontSize:11, color:"rgba(255,255,255,0.7)", marginTop:2 }}>جواز / بطاقة / تصريح حج</div></div>
            </div>
            <input ref={scanInputRef} type="file" accept="image/*" style={{ display:"none" }} onChange={e => {
              const file = e.target.files?.[0]; if (!file) return;
              (window as any).__hajj_pending_scan_file__ = file;
              setPage("passengers"); e.target.value = "";
            }} />
            <div onClick={() => setPage("passengers")} style={{ display:"flex", alignItems:"center", gap:11, padding:13, borderRadius:14, cursor:"pointer", background:"var(--paper)", border:"1px solid var(--line)", color:"var(--ink)" }}>
              <div style={{ width:38, height:38, borderRadius:10, background:"var(--ivory2)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--em7)" strokeWidth="1.7" strokeLinecap="round"><path d="M16 3l5 5L8 21H3v-5z"/><path d="M13 6l5 5"/></svg>
              </div>
              <div><div style={{ fontSize:14, fontWeight:700 }}>إضافة يدوي</div><div style={{ fontSize:11, color:"var(--muted)", marginTop:2 }}>إدخال بيانات يدوياً</div></div>
            </div>
          </div>

          {/* آخر المضافين */}
          {recent.length > 0 && (
            <div style={{ background:"var(--paper)", border:"1px solid var(--line)", borderRadius:14, padding:"14px 16px" }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10, paddingBottom:9, borderBottom:"1px solid var(--line)" }}>
                <div style={{ display:"flex", alignItems:"center", gap:7, fontSize:14, fontWeight:700, color:"var(--text)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--g5)" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                  آخر المضافين
                </div>
                <span onClick={() => setPage("passengers")} style={{ fontSize:11, color:"var(--muted)", cursor:"pointer" }}>عرض الكل ←</span>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                {recent.map(p => (
                  <div key={p.id} onClick={() => setPage("passengers")}
                    style={{ display:"flex", alignItems:"center", gap:9, padding:"7px 10px", borderRadius:10, cursor:"pointer", border:"1px solid transparent" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background="var(--ivory)"; (e.currentTarget as HTMLDivElement).style.borderColor="var(--line)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background="transparent"; (e.currentTarget as HTMLDivElement).style.borderColor="transparent"; }}>
                    <Avatar name={p.name_ar} gender={p.gender} size={30} />
                    <div style={{ flex:1, minWidth:0, textAlign:"right" }}>
                      <div style={{ fontSize:12, fontWeight:600, color:"var(--ink)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{p.short_ar||p.name_ar}</div>
                      <div style={{ fontSize:10, color:"var(--muted)", marginTop:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{p.nat} · {p.passport||p.national_id||"—"}</div>
                    </div>
                    {p.services?.bus==="VIP" && <span style={{ fontSize:9, fontWeight:700, padding:"1px 7px", borderRadius:99, background:"rgba(200,162,75,.12)", color:"var(--g6)", border:"1px solid rgba(200,162,75,.25)", flexShrink:0 }}>VIP</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ===== يسار: نسب التوزيع + تنبيهات ===== */}
        <div style={{ width:200, flexShrink:0, overflowY:"auto", display:"flex", flexDirection:"column", gap:10 }}>

          {/* نسب التوزيع */}
          <div style={{ background:"var(--paper)", border:"1px solid var(--line)", borderRadius:14, padding:"14px 16px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:12, paddingBottom:9, borderBottom:"1px solid var(--line)" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--g5)" strokeWidth="1.8"><path d="M3 3v18h18"/><path d="M18 9l-5 5-3-3-4 4"/></svg>
              <div style={{ fontSize:13, fontWeight:700, color:"var(--text)" }}>نسب التوزيع</div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {dist.map(({ label, page, pct, icon }) => {
                const isLow = pct < 30;
                return (
                  <div key={label} onClick={() => setPage(page)} style={{ cursor:"pointer" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.opacity="0.75"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.opacity="1"; }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--em7)" strokeWidth="1.7" strokeLinecap="round" dangerouslySetInnerHTML={{ __html: icon }} />
                      <span style={{ fontSize:11, fontWeight:600, color:"var(--ink)", flex:1 }}>{label}</span>
                      <span style={{ fontSize:12, fontWeight:700, color:isLow?"var(--danger)":"var(--primary)" }}>{pct}٪</span>
                    </div>
                    <div style={{ height:4, borderRadius:99, background:"var(--ivory2)", overflow:"hidden" }}>
                      <div style={{ height:"100%", borderRadius:99, width:((pct||2)+"%"), background:isLow ? "linear-gradient(90deg,#c0392b,#e67e22)" : ("linear-gradient(90deg,"+primary+","+primary+"99)") }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* تنبيهات سريعة */}
          <div style={{ background:"var(--paper)", border:"1px solid var(--line)", borderRadius:14, padding:"14px 16px", flex:1 }}>
            <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:10, paddingBottom:9, borderBottom:"1px solid var(--line)" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--g5)" strokeWidth="1.8"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <div style={{ fontSize:13, fontWeight:700, color:"var(--text)" }}>تنبيهات سريعة</div>
            </div>
            {alerts.length === 0 ? (
              <div style={{ textAlign:"center", padding:"16px 0", color:"var(--muted)" }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2A9D8F" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>
                <div style={{ fontSize:12, fontWeight:600, marginTop:8 }}>كل شيء متوزّع</div>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {alerts.map(({ label, count, page, color, bg, icon }) => (
                  <div key={label} onClick={() => setPage(page)}
                    style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 9px", borderRadius:10, cursor:"pointer", background:bg as string }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.filter="brightness(0.97)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.filter="none"; }}>
                    <div style={{ width:26, height:26, borderRadius:7, background:color as string, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" dangerouslySetInnerHTML={{ __html: icon }} />
                    </div>
                    <span style={{ fontSize:10.5, fontWeight:600, color:"var(--ink)", flex:1 }}>{label}</span>
                    <span style={{ fontSize:13, fontWeight:700, color:color as string }}>{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
  );
}
export { Dashboard };
