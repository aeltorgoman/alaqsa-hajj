import { useMemo, useRef, useState, useEffect } from "react";
import { useConfig } from "../config/ConfigContext";
import type { Passenger } from "../types";
import { Avatar } from "./Avatar";

function Dashboard({ passengers, setPage, onAddManual, onScan }: { passengers: Passenger[]; setPage: (p: string) => void; onAddManual?: () => void; onScan?: (file: File) => void }) {
  const config  = useConfig();
  const hajj    = passengers.filter(p => !p.passenger_type || p.passenger_type === "حاج");
  const males   = hajj.filter(p => p.gender === "ذكر").length;
  const females = hajj.filter(p => p.gender === "أنثى").length;
  const total   = hajj.length || 1;
  const primary = config.color_primary || "#7D1F3C";

  const dist = useMemo(() => {
    const busCount    = hajj.filter(p => (p as any).bus_id        != null).length;
    const minaCount   = hajj.filter(p => (p as any).camp_mina_id  != null).length;
    const arafaCount  = hajj.filter(p => (p as any).camp_arafa_id != null).length;
    const hotelCount  = hajj.filter(p => (p as any).room_id       != null).length;
    const flightCount = hajj.filter(p => (p as any).flight_id     != null).length;
    return [
      { label: "الباصات",     page: "buses",   pct: Math.round(busCount    / total * 100), icon: `<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="15" cy="18" r="2"/>` },
      { label: "مخيمات منى",  page: "mina",    pct: Math.round(minaCount   / total * 100), icon: `<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>` },
      { label: "مخيمات عرفة", page: "arafa",   pct: Math.round(arafaCount  / total * 100), icon: `<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>` },
      { label: "الفندق",      page: "hotel",   pct: Math.round(hotelCount  / total * 100), icon: `<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M10 6h4"/><path d="M10 10h4"/>` },
      { label: "الطيران",     page: "flights", pct: Math.round(flightCount / total * 100), icon: `<path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>` },
    ];
  }, [hajj, total]);

  const alerts = useMemo(() => {
    const noPassport = hajj.filter(p => !p.passport && !p.national_id).length;
    const noPhone    = hajj.filter(p => !p.phone).length;
    // جواز ينتهي قبل 1 ذي الحجة 1447 (2026-05-18) بأقل من 6 شهور
    const dhulHijja1 = new Date("2026-05-18T00:00:00+03:00");
    const sixMonthsBefore = new Date(dhulHijja1);
    sixMonthsBefore.setMonth(sixMonthsBefore.getMonth() - 6);
    const expiringPassport = hajj.filter(p => {
      if (!(p as any).passport_expiry) return false;
      const exp = new Date((p as any).passport_expiry);
      return exp >= sixMonthsBefore && exp <= dhulHijja1;
    }).length;
    const withoutTicket = hajj.filter(p => p.services?.flight === "بدون").length;
    const noHotel       = hajj.filter(p => p.room_id  == null).length;
    const noBus         = hajj.filter(p => p.bus_id   == null).length;
    return [
      { label: "بدون جواز / هوية",       count: noPassport,       page: "passengers", color: "#C62828", bg: "rgba(198,40,40,0.08)",   icon: `<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/><path d="M8 16s1-2 4-2 4 2 4 2"/>` },
      { label: "جواز قريب الانتهاء",     count: expiringPassport, page: "passengers", color: "#E65100", bg: "rgba(230,81,0,0.08)",    icon: `<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/><line x1="12" y1="17" x2="12.01" y2="17"/>` },
      { label: "بدون رقم تليفون",        count: noPhone,          page: "passengers", color: "#1565C0", bg: "rgba(21,101,192,0.08)",  icon: `<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.77 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>` },
      { label: "بدون تذكرة طيران",       count: withoutTicket,    page: "flights",    color: "var(--female-fg)", bg: "var(--female-bg)", icon: `<path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>` },
      { label: "بدون غرفة بالفندق",      count: noHotel,          page: "hotel",      color: "var(--danger)",    bg: "var(--danger-bg)", icon: `<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/>` },
      { label: "بدون باص",               count: noBus,            page: "buses",      color: "var(--danger)",    bg: "var(--danger-bg)", icon: `<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/>` },
    ].filter(a => a.count > 0);
  }, [hajj]);

  // عداد التنبيه الدوار
  const [alertIndex, setAlertIndex] = useState(0);
  useEffect(() => {
    if (alerts.length <= 1) return;
    const t = setInterval(() => setAlertIndex(i => (i + 1) % alerts.length), 4500);
    return () => clearInterval(t);
  }, [alerts.length]);

  const recent      = [...hajj].sort((a, b) => (b.id ?? 0) - (a.id ?? 0)).slice(0, 8);
  const scanInputRef = useRef<HTMLInputElement>(null);

  // ─── ألوان الكروت مطابقة للمعاينة ───
  const statCards = [
    {
      label: "إجمالي الحجاج", num: hajj.length,
      sub: "+" + Math.min(12, hajj.length) + " هذا الأسبوع",
      bg: "var(--paper)", border: "var(--line)", numColor: "var(--em8)",
      lblColor: "var(--g7)", subColor: "var(--g6)",
      iconBg: "rgba(200,162,75,.12)", iconColor: "var(--g5)",
      icon: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
    },
    {
      label: "رجال", num: males,
      sub: Math.round(males / total * 100) + "٪ من الإجمالي",
      bg: "var(--mb)", border: "rgba(19,69,107,.1)", numColor: "var(--mf)",
      lblColor: "var(--mf)", subColor: "var(--mf)",
      iconBg: "rgba(19,69,107,.12)", iconColor: "var(--mf)",
      icon: `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`,
    },
    {
      label: "نساء", num: females,
      sub: Math.round(females / total * 100) + "٪ من الإجمالي",
      bg: "var(--fb)", border: "rgba(122,46,69,.1)", numColor: "var(--ff)",
      lblColor: "var(--ff)", subColor: "var(--ff)",
      iconBg: "rgba(122,46,69,.12)", iconColor: "var(--ff)",
      icon: `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`,
    },
  ];

  return (
    <div style={{ display: "flex", flex: 1 }}>

      {/* ══ العمود الأوسط — Main Content ══ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", padding: 14, gap: 12, minWidth: 0 }}>

        {/* 1) أزرار الإجراءات */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, flexShrink: 0 }}>
          {/* مسح مستند */}
          <div onClick={() => scanInputRef.current?.click()}
            style={{ display: "flex", alignItems: "center", gap: 11, padding: "13px 16px", borderRadius: 12, cursor: "pointer", background: `linear-gradient(135deg,${primary},${primary}cc)`, color: "#fff", boxShadow: `0 6px 18px ${primary}44` }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(255,255,255,.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#D4A017" strokeWidth="2" strokeLinecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.2 }}>مسح مستند</div>
              <div style={{ fontSize: 10.5, marginTop: 2, opacity: .7 }}>جواز / بطاقة / تصريح حج</div>
            </div>
          </div>
          <input ref={scanInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
            const file = e.target.files?.[0]; if (!file) return;
            if (onScan) { onScan(file); } else { (window as any).__hajj_pending_scan_file__ = file; setPage("passengers"); }
            e.target.value = "";
          }} />

          {/* إضافة يدوي */}
          <div onClick={() => { onAddManual ? onAddManual() : setPage("passengers"); }}
            style={{ display: "flex", alignItems: "center", gap: 11, padding: "13px 16px", borderRadius: 12, cursor: "pointer", background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)" }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--ivory2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--em7)" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.2 }}>إضافة يدوي</div>
              <div style={{ fontSize: 10.5, marginTop: 2, opacity: .7 }}>إدخال بيانات الحاج يدوياً</div>
            </div>
          </div>
        </div>

        {/* 2) كروت الإحصاء — ٣ متساوية */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, flexShrink: 0 }}>
          {statCards.map(({ label, num, sub, bg, border, numColor, lblColor, subColor, iconBg, iconColor, icon }) => (
            <div key={label} style={{ borderRadius: 12, padding: "12px 14px", background: bg, border: `1px solid ${border}`, position: "relative", overflow: "hidden" }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="1.8" strokeLinecap="round" dangerouslySetInnerHTML={{ __html: icon }} />
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: lblColor, marginBottom: 3 }}>{label}</div>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: 28, fontWeight: 900, lineHeight: 1, color: numColor }}>{num}</div>
              <div style={{ fontSize: 10.5, marginTop: 3, color: subColor, fontWeight: 600 }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* 3) آخر الحجاج المسجلين */}
        <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--g5)" strokeWidth="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 14, color: "var(--em8)", flex: 1 }}>آخر الحجاج المسجلين</div>
            <span onClick={() => setPage("passengers")} style={{ fontSize: 11, color: "var(--g6)", cursor: "pointer", fontWeight: 600 }}>عرض الكل</span>
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {recent.map(p => (
              <div key={p.id} onClick={() => setPage("passengers")}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--line)", cursor: "pointer" }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--ivory)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}>
                <Avatar name={p.name_ar} gender={p.gender} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.short_ar || p.name_ar}</div>
                  <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nat} · {p.passport || p.national_id || "—"}</div>
                </div>
                {/* باركود ديكو */}
                <div style={{ width: 30, height: 30, borderRadius: 5, border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "var(--muted)" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h.01M18 14h.01M14 18h.01M18 18h.01M14 14v4M18 14v4M14 18h4"/></svg>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══ العمود الأيسر — Analytics ══ */}
      <div style={{ width: 220, flexShrink: 0, background: "var(--paper)", borderRight: "1px solid var(--line)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>

          {/* نسب التوزيع */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--em8)", marginBottom: 10, paddingBottom: 7, borderBottom: "1px solid var(--line)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--g5)" strokeWidth="1.7"><path d="M3 3v18h18"/><path d="M18 9l-5 5-3-3-4 4"/></svg>
              نسب التوزيع
            </div>
            {dist.map(({ label, page, pct, icon }) => {
              const isLow = pct < 30;
              return (
                <div key={label} onClick={() => setPage(page)} style={{ marginBottom: 8, cursor: "pointer" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.opacity = ".75"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.opacity = "1"; }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <div style={{ width: 22, height: 22, borderRadius: 6, background: "rgba(125,31,60,.07)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--em7)" strokeWidth="1.8" strokeLinecap="round" dangerouslySetInnerHTML={{ __html: icon }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, flex: 1, color: "var(--ink)" }}>{label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: isLow ? "var(--danger)" : "var(--em7)", fontFamily: "var(--font-heading)" }}>{pct}٪</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 99, background: "var(--ivory2)", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 99, width: (pct || 2) + "%", background: isLow ? "linear-gradient(90deg,#c0392b,#e67e22)" : `linear-gradient(90deg,${primary},${primary}99)` }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* تنبيهات سريعة — كارت دوار */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--em8)", marginBottom: 8, paddingBottom: 7, borderBottom: "1px solid var(--line)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--g5)" strokeWidth="1.7"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              تنبيهات سريعة
              {alerts.length > 0 && <span style={{ marginInlineStart:"auto", fontSize:10, color:"var(--muted)" }}>{alertIndex + 1}/{alerts.length}</span>}
            </div>
            {alerts.length === 0 ? (
              <div style={{ textAlign: "center", padding: "14px 0", color: "var(--muted)" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2A9D8F" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>
                <div style={{ fontSize: 12, fontWeight: 600, marginTop: 6 }}>كل شيء مكتمل</div>
              </div>
            ) : (() => {
              const a = alerts[alertIndex % alerts.length];
              return (
                <div onClick={() => setPage(a.page)} style={{ display:"flex", alignItems:"center", gap:10, padding:"12px", borderRadius:12, cursor:"pointer", background: a.bg as string, border:`1px solid ${a.color as string}33`, transition:"all .3s" }}>
                  <div style={{ width:36, height:36, borderRadius:9, background: a.color as string, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" dangerouslySetInnerHTML={{ __html: a.icon }} />
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:18, fontWeight:900, color: a.color as string, lineHeight:1 }}>{a.count}</div>
                    <div style={{ fontSize:11, fontWeight:700, color:"var(--ink)", marginTop:2 }}>{a.label}</div>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                </div>
              );
            })()}
            {alerts.length > 1 && (
              <div style={{ display:"flex", gap:4, justifyContent:"center", marginTop:8 }}>
                {alerts.map((_: unknown, i: number) => (
                  <div key={i} onClick={() => setAlertIndex(i)} style={{ width: i === alertIndex ? 16 : 6, height:6, borderRadius:99, background: i === alertIndex ? primary : "var(--line)", transition:"all .3s", cursor:"pointer" }} />
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

export { Dashboard };
