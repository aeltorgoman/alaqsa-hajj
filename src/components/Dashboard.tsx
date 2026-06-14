import { useMemo, useRef } from "react";
import { useConfig } from "../config/ConfigContext";
import type { Passenger, User } from "../types";
import { Avatar } from "./Avatar";
import { timeAgo } from "../utils";

function Dashboard({ passengers, setPage, currentUser }: { passengers: Passenger[]; setPage: (p: string) => void; currentUser: User }) {
  const config = useConfig();
  const { males, females } = useMemo(() => ({
    males: passengers.filter(p => p.gender === "ذكر").length,
    females: passengers.filter(p => p.gender === "أنثى").length,
  }), [passengers]);

  const total = passengers.length || 1;
  const dist = useMemo(() => {
    const busCount = passengers.filter(p => (p as any).bus_id != null).length;
    const minaCount = passengers.filter(p => (p as any).camp_mina_id != null).length;
    const arafaCount = passengers.filter(p => (p as any).camp_arafa_id != null).length;
    const hotelCount = passengers.filter(p => (p as any).room_id != null).length;
    const flightCount = passengers.filter(p => (p as any).flight_id != null).length;
    return [
      { label: "الباصات", page: "buses", count: busCount, pct: Math.round(busCount / total * 100), icon: `<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="15" cy="18" r="2"/>` },
      { label: "مخيمات منى", page: "mina", count: minaCount, pct: Math.round(minaCount / total * 100), icon: `<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>` },
      { label: "مخيمات عرفة", page: "arafa", count: arafaCount, pct: Math.round(arafaCount / total * 100), icon: `<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>` },
      { label: "الفندق", page: "hotel", count: hotelCount, pct: Math.round(hotelCount / total * 100), icon: `<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/>` },
      { label: "الطيران", page: "flights", count: flightCount, pct: Math.round(flightCount / total * 100), icon: `<path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>` },
    ];
  }, [passengers, total]);

  // تنبيهات سريعة — أرقام تحتاج مراجعة من الأدمن
  const alerts = useMemo(() => {
    const withoutTicket = passengers.filter(p => p.services?.flight === "بدون").length;
    const firstClass = passengers.filter(p => p.services?.flight === "درجة أولى").length;
    const vipBus = passengers.filter(p => p.services?.bus === "VIP").length;
    const noHotel = passengers.filter(p => p.room_id == null).length;
    const noBus = passengers.filter(p => p.bus_id == null).length;
    return [
      { label: "بدون تذكرة طيران", count: withoutTicket, page: "flights", color: "#7a2e45", bg: "var(--fb)", icon: `<path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>` },
      { label: "طالبين درجة أولى", count: firstClass, page: "flights", color: "#E8951A", bg: "rgba(232,149,26,0.08)", icon: `<path d="M12 2l2.4 7.6H22l-6.2 4.7 2.4 7.7L12 17l-6.2 5 2.4-7.7L2 9.6h7.6z"/>` },
      { label: "VIP في الباصات", count: vipBus, page: "buses", color: "#8B3A6B", bg: "rgba(139,58,107,0.08)", icon: `<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="15" cy="18" r="2"/>` },
      { label: "بدون غرفة بالفندق", count: noHotel, page: "hotel", color: "#c0392b", bg: "rgba(192,57,43,0.08)", icon: `<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/>` },
      { label: "بدون باص", count: noBus, page: "buses", color: "#c0392b", bg: "rgba(192,57,43,0.08)", icon: `<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="15" cy="18" r="2"/>` },
    ].filter(a => a.count > 0);
  }, [passengers]);

  const recent = [...passengers].sort((a, b) => (b.id ?? 0) - (a.id ?? 0)).slice(0, 5);

  const scanInputRef = useRef<HTMLInputElement>(null);

  return (
    <div style={{ display: "flex", gap: 14, height: "100%", overflow: "hidden", padding: "12px 14px", background: "var(--bg)" }}>
      <div style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div onClick={() => scanInputRef.current?.click()} style={{ display: "flex", alignItems: "center", gap: 11, padding: 13, borderRadius: "var(--radius-lg)", cursor: "pointer", background: "linear-gradient(135deg, var(--em7), var(--em6))", color: "var(--text-inverse)", boxShadow: "0 8px 24px rgba(125,31,60,0.25)", transition: "var(--transition)" }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(255,255,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--g3)" strokeWidth="1.7"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>مسح مستند</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 2 }}>جواز / بطاقة / تصريح حج</div>
            </div>
          </div>
          <input ref={scanInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
            const file = e.target.files?.[0];
            if (!file) return;
            (window as any).__hajj_pending_scan_file__ = file;
            setPage("passengers");
            e.target.value = "";
          }} />
          <div onClick={() => setPage("passengers")} style={{ display: "flex", alignItems: "center", gap: 11, padding: 13, borderRadius: "var(--radius-lg)", cursor: "pointer", background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink)", transition: "var(--transition)" }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--ivory2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--em7)" strokeWidth="1.7"><path d="M16 3l5 5L8 21H3v-5z"/><path d="M13 6l5 5"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>إضافة يدوي</div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>إدخال بيانات يدوياً</div>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 0 14px" }}>
          <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, transparent, var(--g5), transparent)" }} />
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="var(--g5)" strokeWidth="1.3"><path d="M12 2l2.4 7.6H22l-6.2 4.7 2.4 7.7L12 17l-6.2 5 2.4-7.7L2 9.6h7.6z"/></svg>
          <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, transparent, var(--g5), transparent)" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 12 }}>
          {[
            { label: "الحجاج", num: passengers.length, sub: `+${Math.min(12,passengers.length)} هذا الأسبوع`, bg: "linear-gradient(145deg,#21867A,#2A9D8F)", shadow: "rgba(33,134,122,0.35)", icon: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>` },
            { label: "رجال", num: males, sub: `${passengers.length ? Math.round(males/passengers.length*100) : 0}٪ من الإجمالي`, bg: "linear-gradient(145deg,#2F78C5,#4A90D9)", shadow: "rgba(47,120,197,0.35)", icon: `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>` },
            { label: "نساء", num: females, sub: `${passengers.length ? Math.round(females/passengers.length*100) : 0}٪ من الإجمالي`, bg: "linear-gradient(145deg,#D4820F,#E8951A)", shadow: "rgba(212,130,15,0.35)", icon: `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>` },
          ].map(({ label, num, sub, bg, shadow, icon }) => (
            <div key={label} style={{ background: bg, borderRadius: 14, padding: "12px 14px", cursor: "pointer", transition: "var(--transition)", boxShadow: `0 4px 16px ${shadow}`, border: `2px solid ${shadow}` }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.filter = "brightness(1.05)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.filter = "none"; }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.8" strokeLinecap="round" dangerouslySetInnerHTML={{ __html: icon }} />
              </div>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: "rgba(255,255,255,0.75)", marginBottom: 2 }}>{label}</div>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: 44, fontWeight: 700, lineHeight: 1, color: "#fff" }}>{num}</div>
              <div style={{ fontSize: 10, marginTop: 4, color: "rgba(255,255,255,0.65)" }}>{sub}</div>
            </div>
          ))}
        </div>
        {recent.length > 0 && (
          <div className="panel">
            <div className="panel-head">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
              <div className="h">آخر المضافين</div>
              <span className="ph-action" onClick={() => setPage("passengers")}>عرض الكل</span>
            </div>
            {recent.map(p => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 18px", borderBottom: "1px solid var(--line)", cursor: "pointer", transition: "background 0.14s" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--ivory)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                <Avatar name={p.name_ar} gender={p.gender} size={38} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{p.short_ar || p.name_ar}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>{p.nat} · {p.passport}</div>
                </div>
                {p.created_at && <span style={{ fontSize: 10, color: "var(--muted)", flexShrink: 0 }}>{timeAgo(p.created_at)}</span>}
                {p.services?.bus === "VIP" && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 99, background: "rgba(200,162,75,.12)", color: "var(--g6)", border: "1px solid rgba(200,162,75,.25)" }}>VIP</span>}
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ width: 220, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
        <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 14, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 14, borderBottom: "1px solid var(--line)", paddingBottom: 10 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--g5)" strokeWidth="1.8"><path d="M3 3v18h18"/><path d="M18 9l-5 5-3-3-4 4"/></svg>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 14, fontWeight: 600, color: "var(--em8)" }}>نِسب التوزيع</div>
          </div>
          {dist.map(({ label, page, pct, icon }) => {
            const isLow = pct < 30;
            const barGradient = isLow ? "linear-gradient(90deg,#c0392b,#e67e22)" : "linear-gradient(90deg,var(--em7),var(--em6))";
            const pctColor = isLow ? "#c0392b" : "var(--em7)";
            return (
            <div key={label} onClick={() => setPage(page)} style={{ marginBottom: 12, cursor: "pointer" }}
              onMouseEnter={e => { e.currentTarget.style.opacity = "0.75"; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                <div style={{ width: 26, height: 26, borderRadius: 7, background: "rgba(125,31,60,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--em7)" strokeWidth="1.7" strokeLinecap="round" dangerouslySetInnerHTML={{ __html: icon }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", flex: 1 }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: pctColor, fontFamily: "var(--font-heading)" }}>{pct}٪</span>
              </div>
              <div style={{ height: 5, borderRadius: 99, background: "var(--ivory2)", overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 99, background: barGradient, width: `${pct || 2}%`, transition: "width 0.8s ease" }} />
              </div>
            </div>
            );
          })}
        </div>
        <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 14, padding: "14px 16px", flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12, borderBottom: "1px solid var(--line)", paddingBottom: 10 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--g5)" strokeWidth="1.8"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 14, fontWeight: 600, color: "var(--em8)" }}>تنبيهات سريعة</div>
          </div>
          {alerts.length === 0 ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--muted)", textAlign: "center", padding: "10px 0" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2A9D8F" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>
              <div style={{ fontSize: 12, fontWeight: 600 }}>كل شيء متوزّع</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {alerts.map(({ label, count, page, color, bg, icon }) => (
                <div key={label} onClick={() => setPage(page)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 8px", borderRadius: 10, cursor: "pointer", background: bg, transition: "var(--transition)" }}
                  onMouseEnter={e => { e.currentTarget.style.filter = "brightness(0.97)"; }}
                  onMouseLeave={e => { e.currentTarget.style.filter = "none"; }}>
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" dangerouslySetInnerHTML={{ __html: icon }} />
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink)", flex: 1 }}>{label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color, fontFamily: "var(--font-heading)" }}>{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ background: "linear-gradient(145deg,var(--em8),var(--em7))", borderRadius: 14, padding: "14px 16px", color: "#fff" }}>
          <div style={{ fontSize: 10, color: "var(--g3)", letterSpacing: "0.06em", marginBottom: 3, fontWeight: 600 }}>الموسم الحالي</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 10 }}>{config.season_label}</div>
          <div style={{ height: 1, background: "rgba(255,255,255,0.15)", marginBottom: 10 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.16)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--g3)" strokeWidth="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{currentUser.name}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)" }}>@{currentUser.username}</div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export { Dashboard };
