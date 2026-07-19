import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import type { Passenger, Flight } from "../types";

/* ════════════════════════════════════════════════════════════
   منطق حساب مراحل الموسم — تلقائي بالكامل من البيانات
   ════════════════════════════════════════════════════════════ */
const PHASE_THRESHOLD = 10;

interface PhaseInfo {
  id: "reg" | "dist" | "prep" | "travel";
  label: string;
  icon: string;
  active: boolean;
  current: boolean;
  sub: string;
  pct: number;
}

function useSeasonPhases(passengers: Passenger[]) {
  const [flights, setFlights] = useState<Flight[]>([]);
  useEffect(() => {
    supabase.from("flights").select("*").then(({ data }: { data: Flight[] | null }) => { if (data) setFlights(data); });
  }, []);

  return useMemo(() => {
    const hajj = passengers.filter(p => !p.passenger_type || p.passenger_type === "حاج");
    const total = hajj.length;
    const regActive = total > 0;
    const docsComplete = hajj.filter(p => p.photo_url && p.passport_url && p.national_id_url).length;
    const regPct = total ? Math.round(docsComplete / total * 100) : 0;
    const distributed = hajj.filter(p => p.bus_id != null || p.room_id != null).length;
    const distActive = distributed >= PHASE_THRESHOLD;
    const fullyDist = hajj.filter(p => p.bus_id != null && p.room_id != null && p.camp_mina_id != null && p.camp_arafa_id != null).length;
    const distPct = total ? Math.round(fullyDist / total * 100) : 0;
    const permits = hajj.filter(p => p.hajj_permit_url).length;
    const tickets = hajj.filter(p => p.flight_ticket_url).length;
    const prepActive = permits >= PHASE_THRESHOLD || tickets >= PHASE_THRESHOLD;
    const prepDone = hajj.filter(p => p.hajj_permit_url && p.flight_ticket_url).length;
    const prepPct = total ? Math.round(prepDone / total * 100) : 0;
    const depDates = flights.filter(f => f.type === "ذهاب" && f.date).map(f => f.date).sort();
    const retDates = flights.filter(f => f.type === "إياب" && f.date).map(f => f.date).sort();
    const firstDep = depDates[0] || null;
    const firstRet = retDates[0] || null;
    const todayStr = new Date().toISOString().split("T")[0];
    const travelActive = !!firstDep && todayStr >= firstDep;
    const travelEnded = !!firstRet && todayStr > firstRet;
    let daysToTravel: number | null = null;
    if (firstDep) { const diff = Math.ceil((new Date(firstDep).getTime() - Date.now()) / 86400000); daysToTravel = diff > 0 ? diff : 0; }

    const phases: PhaseInfo[] = [
      { id: "reg", label: "التسجيل", icon: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/>`, active: regActive, current: false, sub: `${total} حاج · المستندات ${regPct}٪`, pct: regPct },
      { id: "dist", label: "التوزيع", icon: `<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>`, active: distActive, current: false, sub: distActive ? `اكتمل توزيع ${fullyDist} من ${total} حاج` : `${distributed} من ${PHASE_THRESHOLD} للبدء`, pct: distPct },
      { id: "prep", label: "التجهيز للسفر", icon: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/>`, active: prepActive, current: false, sub: prepActive ? `تصاريح ${permits} · تذاكر ${tickets}` : `${Math.max(permits, tickets)} من ${PHASE_THRESHOLD} للبدء`, pct: prepPct },
      { id: "travel", label: "السفر والحج", icon: `<path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>`, active: travelActive, current: false, sub: travelEnded ? "انتهى الموسم" : travelActive ? "الحجاج في رحلة الحج" : daysToTravel != null ? `بعد ${daysToTravel} يوم` : "لم تُحدد الرحلات بعد", pct: travelActive ? (travelEnded ? 100 : 50) : 0 },
    ];

    let currentIdx = 0;
    phases.forEach((ph, i) => { if (ph.active) currentIdx = i; });
    phases[currentIdx].current = true;
    const seasonPct = Math.min(100, Math.round(currentIdx * 25 + phases[currentIdx].pct * 0.25));
    return { phases, currentIdx, seasonPct, daysToTravel, total, fullyDist, hajj };
  }, [passengers, flights]);
}

/* ════════════════════════════════════════════════════════════
   كارت مراحل الموسم
   ════════════════════════════════════════════════════════════ */
function SeasonPhaseCard({ passengers, setPage }: { passengers: Passenger[]; setPage?: (p: string) => void }) {
  const { phases, currentIdx, seasonPct, daysToTravel, total, hajj } = useSeasonPhases(passengers);
  const current = phases[currentIdx];
  const next = phases[currentIdx + 1] || null;
  const busCount   = hajj.filter(p => p.bus_id != null).length;
  const roomCount  = hajj.filter(p => p.room_id != null).length;
  const minaCount  = hajj.filter(p => p.camp_mina_id != null).length;
  const arafaCount = hajj.filter(p => p.camp_arafa_id != null).length;

  /* القوس */
  const R = 54, C = Math.PI * R;
  const arcLen = C * (seasonPct / 100);
  const angle = Math.PI * (1 - seasonPct / 100);
  const dotX = 66 + R * Math.cos(angle);
  const dotY = 72 - R * Math.sin(angle);
  const gradId = "seasonArcGrad";

  return (
    <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 14, overflow: "hidden", flexShrink: 0, boxShadow: "0 2px 12px rgba(0,0,0,.05)" }}>

      {/* ═══ الجزء العلوي ═══ */}
      <div style={{ padding: "15px 18px", display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>

        {/* القوس المتدرج */}
        <div style={{ position: "relative", width: 170, height: 106, flexShrink: 0 }}>
          <svg viewBox="0 0 132 82" style={{ width: "100%", height: "100%" }}>
            <defs>
              <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" style={{ stopColor: "var(--primary)" }} />
                <stop offset="100%" style={{ stopColor: "var(--accent)" }} />
              </linearGradient>
            </defs>
            <path d="M 12 72 A 54 54 0 0 1 120 72" fill="none" stroke="var(--ivory2)" strokeWidth="10" strokeLinecap="round" />
            <path d="M 12 72 A 54 54 0 0 1 120 72" fill="none" stroke={`url(#${gradId})`} strokeWidth="10" strokeLinecap="round"
              strokeDasharray={`${arcLen} ${C * 2}`} />
            {seasonPct > 3 && <circle cx={dotX} cy={dotY} r="7" fill="var(--accent)" stroke="var(--paper)" strokeWidth="2.5" />}
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", paddingBottom: 4 }}>
            {daysToTravel != null && daysToTravel > 0 ? (
              <>
                <div style={{ fontSize: 27, fontWeight: 900, color: "var(--primary)", lineHeight: 1, fontFamily: "var(--font-heading)" }}>{daysToTravel}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, fontWeight: 700 }}>يوم على السفر</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 27, fontWeight: 900, color: "var(--primary)", lineHeight: 1, fontFamily: "var(--font-heading)" }}>{seasonPct}٪</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, fontWeight: 700 }}>من الموسم</div>
              </>
            )}
          </div>
        </div>

        {/* فاصل */}
        <div style={{ width: 1, alignSelf: "stretch", background: "var(--line)" }} />

        {/* المرحلة الحالية */}
        <div style={{ flex: 1, minWidth: 170 }}>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 4, fontWeight: 700 }}>المرحلة الحالية</div>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: "linear-gradient(135deg, var(--primary), var(--primary-dark))", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-inverse)" strokeWidth="2" strokeLinecap="round" dangerouslySetInnerHTML={{ __html: current.icon }} />
            </div>
            <span style={{ fontSize: 28, fontWeight: 900, color: "var(--ink)", fontFamily: "var(--font-heading)" }}>{current.label}</span>
            <span style={{ fontSize: 12, background: "rgba(var(--accent-rgb, 200,162,75),.15)", color: "var(--accent-dark)", padding: "2px 11px", borderRadius: 99, fontWeight: 800, border: "1px solid var(--accent)" }}>{current.pct}٪</span>
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>{current.sub}</div>
        </div>

        {/* المحطة القادمة */}
        {next && (
          <div style={{ minWidth: 135, background: "var(--ivory)", border: "1px solid var(--line)", borderRadius: 11, padding: "10px 14px" }}>
            <div style={{ fontSize: 10.5, color: "var(--accent-dark)", marginBottom: 3, fontWeight: 800 }}>المحطة القادمة</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--ink)", marginBottom: 1 }}>{next.label}</div>
            <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 600 }}>{next.sub}</div>
          </div>
        )}
      </div>

      {/* ═══ المحطات المدمجة ═══ */}
      <div style={{ borderTop: "1px solid var(--line)", background: "var(--ivory)", padding: "12px 22px 10px" }}>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", top: 12, right: 28, left: 28, height: 3, background: "var(--ivory2)", borderRadius: 3 }} />
          <div style={{ position: "absolute", top: 12, right: 28, width: `${(currentIdx / (phases.length - 1)) * 88}%`, height: 3, background: "linear-gradient(to left, var(--primary), var(--accent))", borderRadius: 3 }} />
          <div style={{ display: "flex", justifyContent: "space-between", position: "relative" }}>
            {phases.map((ph, i) => {
              const done = i < currentIdx;
              const isCurrent = i === currentIdx;
              return (
                <div key={ph.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 86 }}>
                  <div style={{
                    width: 25, height: 25, borderRadius: "50%",
                    background: done ? "var(--primary)" : isCurrent ? "var(--accent)" : "var(--paper)",
                    border: done || isCurrent ? "none" : "2px solid var(--line)",
                    boxShadow: isCurrent ? "0 0 0 4px color-mix(in srgb, var(--accent) 25%, transparent)" : "none",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    {done ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-inverse)" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                    ) : (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={isCurrent ? "var(--text-inverse)" : "var(--muted)"} strokeWidth="2.2" strokeLinecap="round" dangerouslySetInnerHTML={{ __html: ph.icon }} />
                    )}
                  </div>
                  <span style={{
                    fontSize: 12,
                    fontWeight: isCurrent ? 900 : done ? 800 : 700,
                    color: done ? "var(--ink)" : isCurrent ? "var(--accent)" : "var(--muted)",
                  }}>{ph.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ═══ شريط المهام ═══ */}
      <div style={{ borderTop: "1px solid var(--line)", padding: "10px 18px", display: "flex", gap: 20, background: "var(--paper)", flexWrap: "wrap", alignItems: "center" }}>
        {([
          { label: "غرف", count: roomCount, page: "hotel",  icon: `<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M10 6h4"/><path d="M10 10h4"/>` },
          { label: "باصات", count: busCount, page: "buses", icon: `<rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 4v4h-7V8z"/>` },
          { label: "منى", count: minaCount, page: "mina",   icon: `<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M2 21h20"/>` },
          { label: "عرفة", count: arafaCount, page: "arafa", icon: `<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M2 21h20"/>` },
        ]).map(item => (
          <span key={item.label}
            onClick={() => setPage?.(item.page)}
            style={{ fontSize: 14, color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 6, cursor: setPage ? "pointer" : "default", fontWeight: 700 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" dangerouslySetInnerHTML={{ __html: item.icon }} />
            {item.label}: <b style={{ color: "var(--ink)", fontSize: 15.5, fontWeight: 900 }}>{item.count}/{total}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   كارت توزيع الباقات
   ════════════════════════════════════════════════════════════ */
const PACKAGE_COLORS: Record<string, string> = {
  "ثنائية": "#7D1F3C", "ثلاثية": "#D4A017", "رباعية": "#2A9D8F",
  "فردية": "#1565C0", "خاص": "#7E57C2",
};
const PACKAGE_FALLBACK = "#8a7d68";

function PackagesCard({ passengers, setPage }: { passengers: Passenger[]; setPage?: (p: string) => void }) {
  const hajj = passengers.filter(p => !p.passenger_type || p.passenger_type === "حاج");
  const total = hajj.length;
  const counts: Record<string, number> = {};
  hajj.forEach(p => { const t = p.services?.hotel_type?.trim(); if (!t) return; counts[t] = (counts[t] || 0) + 1; });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const maxCount = entries.length ? entries[0][1] : 0;

  return (
    <div style={{ flex: 1, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 14, overflow: "hidden", minWidth: 0, display: "flex", flexDirection: "column" }}>
      {/* هيدر بلون مميز */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", background: "var(--warning-bg)", borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="1.8" strokeLinecap="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          </svg>
          <span style={{ fontFamily: "var(--font-heading)", fontSize: 14, color: "var(--ink)", fontWeight: 800 }}>توزيع الباقات</span>
        </div>
        <span style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 700 }}>{total} حاج</span>
      </div>

      <div style={{ padding: "12px 14px", flex: 1 }}>
        {entries.length === 0 ? (
          <div style={{ textAlign: "center", padding: 20, color: "var(--muted)", fontSize: 12.5 }}>لا توجد باقات محددة بعد</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {entries.map(([pkg, count]) => {
              const color = PACKAGE_COLORS[pkg] || PACKAGE_FALLBACK;
              const widthPct = maxCount ? Math.max(9, Math.round(count / maxCount * 100)) : 0;
              const pctOfTotal = total ? Math.round(count / total * 100) : 0;
              return (
                <div key={pkg}
                  onClick={() => { if (setPage) { sessionStorage.setItem("__hajj_pkg_filter__", pkg); setPage("passengers"); } }}
                  style={{ display: "flex", alignItems: "center", gap: 10, cursor: setPage ? "pointer" : "default" }}
                  title={`عرض حجاج باقة ${pkg}`}>
                  <span style={{ width: 54, fontSize: 13.5, fontWeight: 800, color: "var(--ink)", flexShrink: 0 }}>{pkg}</span>
                  <div style={{ flex: 1, height: 22, background: "var(--ivory)", borderRadius: 7, overflow: "hidden" }}>
                    <div style={{ width: `${widthPct}%`, height: "100%", borderRadius: 7, background: `linear-gradient(to left, ${color}, ${color}cc)`, display: "flex", alignItems: "center", paddingRight: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 900, color: "#fff" }}>{count}</span>
                    </div>
                  </div>
                  <span style={{ width: 42, fontSize: 12.5, color: "var(--muted)", fontWeight: 700, flexShrink: 0, textAlign: "left" }}>{pctOfTotal}٪</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   كارت إجمالي الحجاج
   ════════════════════════════════════════════════════════════ */
function TotalPilgrimsCard({ passengers }: { passengers: Passenger[] }) {
  const hajj = passengers.filter(p => !p.passenger_type || p.passenger_type === "حاج");
  const total = hajj.length;
  const men   = hajj.filter(p => p.gender === "ذكر").length;
  const women = hajj.filter(p => p.gender === "أنثى").length;

  return (
    <div style={{ background: "linear-gradient(145deg, var(--primary), var(--primary-dark))", borderRadius: 14, padding: "18px 18px 14px", color: "var(--text-inverse)", position: "relative", overflow: "hidden", flexShrink: 0 }}>
      <div style={{ position: "absolute", left: -30, bottom: -30, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,.05)", pointerEvents: "none" }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, opacity: .85 }}>إجمالي الحجاج</span>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(255,255,255,.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text-inverse)" strokeWidth="1.8" strokeLinecap="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </div>
      </div>
      <div style={{ fontSize: 46, fontWeight: 900, lineHeight: 1, fontFamily: "var(--font-heading)", marginBottom: 3 }}>{total}</div>
      <div style={{ fontSize: 11.5, opacity: .7, marginBottom: 10 }}>الموسم الحالي</div>
      <div style={{ display: "flex", gap: 10, paddingTop: 9, borderTop: "1px solid rgba(255,255,255,.15)", fontSize: 12.5, fontWeight: 700 }}>
        <span style={{ color: "var(--male-fg)", background: "var(--male-bg)", padding: "2px 8px", borderRadius: 99 }}>{men} رجال</span>
        <span style={{ color: "var(--female-fg)", background: "var(--female-bg)", padding: "2px 8px", borderRadius: 99 }}>{women} نساء</span>
      </div>
    </div>
  );
}

export { SeasonPhaseCard, PackagesCard, TotalPilgrimsCard, useSeasonPhases };
