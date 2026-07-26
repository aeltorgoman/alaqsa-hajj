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
    supabase.from("flights").select("*").then((res: any) => { if (res.data) setFlights(res.data as Flight[]); });
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


/* ════════════════════════════════════════════════════════════
   الكارت الذكي — تنبيهات حسب المرحلة الحالية
   يقرأ المرحلة تلقائياً من useSeasonPhases
   ════════════════════════════════════════════════════════════ */
function isExpiredDate(d?: string | null) {
  if (!d) return false;
  return new Date(d) < new Date();
}
function isExpiringSoonDate(d?: string | null) {
  if (!d) return false;
  const dt = new Date(d).getTime();
  const now = Date.now();
  return dt >= now && dt <= now + 180 * 86400000;
}

function SmartAlertsCard({ passengers, setPage }: { passengers: Passenger[]; setPage: (p: string) => void }) {
  const { phases, currentIdx } = useSeasonPhases(passengers);
  const phaseId = phases[currentIdx].id;
  const phaseLabel = phases[currentIdx].label;
  const hajj = passengers.filter(p => !p.passenger_type || p.passenger_type === "حاج");

  /* الانتقال: التسجيل والسفر → صفحة الحجاج بالفلتر · التوزيع → صفحة الخدمة */
  const go = (target: string, searchTerm?: string) => {
    if (searchTerm) (window as any).__hajj_pending_search__ = searchTerm;
    setPage(target);
  };

  const items = useMemo(() => {
    const cnt = (fn: (p: Passenger) => boolean) => hajj.filter(fn).length;
    const mk = (key: string, label: string, desc: string, count: number, icon: string, critical: boolean, target: string, term?: string) =>
      count > 0 ? { key, label, desc, count, icon, critical, target, term } : null;

    if (phaseId === "reg") {
      return [
        mk("expired_passport", "جوازات منتهية الصلاحية", "يحتاج تجديد فوري", cnt(p => isExpiredDate(p.expiry)), `<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>`, true, "passengers", "جواز منتهي"),
        mk("expiring_soon", "جوازات تنتهي خلال ٦ أشهر", "تحتاج متابعة عاجلة", cnt(p => !isExpiredDate(p.expiry) && isExpiringSoonDate(p.expiry)), `<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>`, true, "passengers", "جواز قريب"),
        mk("no_photo", "صور شخصية ناقصة", "مستند مطلوب للتسجيل", cnt(p => !p.photo_url), `<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>`, false, "passengers", "بدون صورة"),
        mk("no_passport_file", "جوازات لم يتم رفعها", "مستندات مفقودة", cnt(p => !p.passport_url), `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>`, false, "passengers", "بدون جواز"),
        mk("no_phone", "حجاج بدون رقم هاتف", "بيانات التواصل مفقودة", cnt(p => !p.phone), `<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 12 19.79 19.79 0 0 1 1.07 3.4 2 2 0 0 1 3.04 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 8.14a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.03z"/>`, false, "passengers", "بدون تليفون"),
      ].filter(Boolean).sort((a: any, b: any) => b.count - a.count) as any[];
    }
    if (phaseId === "dist") {
      return [
        mk("no_bus", "حجاج بدون باص", "لم يتم التوزيع بعد", cnt(p => !(p as any).bus_id), `<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>`, false, "buses"),
        mk("no_flight", "حجاج بدون رحلة طيران", "لم يتم التوزيع بعد", cnt(p => !(p as any).flight_id), `<path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>`, false, "flights"),
        mk("no_room", "حجاج بدون غرفة فندق", "لم يتم التوزيع بعد", cnt(p => !(p as any).room_id), `<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>`, false, "hotel"),
        mk("no_mina", "حجاج بدون مخيم منى", "لم يتم التوزيع بعد", cnt(p => !(p as any).camp_mina_id), `<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>`, false, "mina"),
        mk("no_arafa", "حجاج بدون مخيم عرفة", "لم يتم التوزيع بعد", cnt(p => !(p as any).camp_arafa_id), `<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>`, false, "arafa"),
      ].filter(Boolean).sort((a: any, b: any) => b.count - a.count) as any[];
    }
    /* prep + travel */
    return [
      mk("no_permit", "حجاج بدون تصريح حج", "تصريح الحج مفقود", cnt(p => !p.hajj_permit_url), `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 15 11 17 15 13"/>`, true, "passengers", "بدون تصريح"),
      mk("no_ticket", "حجاج بدون تذكرة طيران", "مستند السفر مفقود", cnt(p => !p.flight_ticket_url), `<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>`, false, "passengers", "بدون تذكرة"),
    ].filter(Boolean).sort((a: any, b: any) => b.count - a.count) as any[];
  }, [hajj, phaseId]);

  return (
    <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0, boxShadow: "0 2px 10px rgba(0,0,0,.04)" }}>
      {/* الهيدر */}
      <div style={{ background: "linear-gradient(135deg, var(--primary), var(--primary-dark, var(--primary)))", padding: "11px 14px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: items.length > 0 ? "var(--danger-soft, #fca5a5)" : "var(--success-soft, #86efac)", animation: "blink 2s infinite", flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 900, color: "var(--text-inverse)", flex: 1 }}>يحتاج انتباهك</span>
        <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--accent-soft, #F3D98B)", background: "rgba(0,0,0,.2)", padding: "2px 9px", borderRadius: 99, whiteSpace: "nowrap" }}>{phaseLabel}</span>
        {items.length > 0 && <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(255,255,255,.2)", color: "var(--text-inverse)", padding: "2px 8px", borderRadius: 99 }}>{items.length}</span>}
      </div>

      {/* البنود */}
      <div style={{ padding: 8, flex: 1, overflowY: "auto", minHeight: 0 }}>
        {items.length === 0 ? (
          <div style={{ textAlign: "center", padding: "26px 14px", color: "var(--muted)" }}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="1.8" strokeLinecap="round" style={{ marginBottom: 8, opacity: .5 }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--success)" }}>كل شيء مكتمل</div>
            <div style={{ fontSize: 10.5, marginTop: 3 }}>لا توجد بنود تحتاج متابعة في هذه المرحلة</div>
          </div>
        ) : items.map(it => {
          const clr = it.critical ? "var(--danger)" : "var(--warning)";
          const bg  = it.critical ? "var(--danger-bg)" : "var(--warning-bg)";
          return (
            <div key={it.key} onClick={() => go(it.target, it.term)}
              style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: 9, marginBottom: 5, cursor: "pointer", border: "1px solid transparent", transition: ".12s" }}
              onMouseEnter={e => { const t = e.currentTarget as HTMLDivElement; t.style.background = "var(--ivory)"; t.style.borderColor = "var(--line)"; }}
              onMouseLeave={e => { const t = e.currentTarget as HTMLDivElement; t.style.background = "transparent"; t.style.borderColor = "transparent"; }}>
              <span style={{ width: 30, height: 30, borderRadius: 9, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth="2" strokeLinecap="round" dangerouslySetInnerHTML={{ __html: it.icon }} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.label}</div>
                {it.desc && <div style={{ fontSize: 9.5, color: "var(--muted)", fontWeight: 600, marginTop: 1 }}>{it.desc}</div>}
              </span>
              <span style={{ fontSize: 19, fontWeight: 900, lineHeight: 1, color: clr, flexShrink: 0, fontFamily: "var(--font-heading)" }}>{it.count}</span>
              <span style={{ color: "var(--line)", flexShrink: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
              </span>
            </div>
          );
        })}
      </div>

      {items.length > 0 && (
        <div style={{ borderTop: "1px solid var(--line)", padding: "7px 12px", background: "var(--ivory)", flexShrink: 0 }}>
          {phaseId === "dist" && (() => {
            const incomplete = hajj.filter(p => !(p as any).bus_id || !(p as any).flight_id || !(p as any).room_id || !(p as any).camp_mina_id || !(p as any).camp_arafa_id).length;
            return incomplete > 0 ? (
              <div style={{ fontSize: 10.5, color: "var(--ink)", fontWeight: 800, marginBottom: 5, paddingBottom: 5, borderBottom: "1px dashed var(--line)" }}>
                {incomplete} حاج لم يكتمل توزيعهم
                <span style={{ fontWeight: 600, color: "var(--muted)", fontSize: 9.5 }}> · قد يظهر الحاج في أكثر من بند</span>
              </div>
            ) : null;
          })()}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700 }}>اضغط أي بند للانتقال</span>
            <span onClick={() => setPage("passengers")} style={{ fontSize: 10.5, color: "var(--primary)", fontWeight: 800, cursor: "pointer" }}>عرض الكل ←</span>
          </div>
        </div>
      )}
    </div>
  );
}

export { SeasonPhaseCard, PackagesCard, TotalPilgrimsCard, SmartAlertsCard, useSeasonPhases };
