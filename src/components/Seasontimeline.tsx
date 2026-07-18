import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import { useConfig } from "../config/ConfigContext";
import type { Passenger, Flight } from "../types";

/* ════════════════════════════════════════════════════════════
   منطق حساب مراحل الموسم — تلقائي بالكامل من البيانات
   ١. التسجيل:      تبدأ مع أول حاج مسجل (لا تُغلق)
   ٢. التوزيع:      تبدأ عند توزيع ١٠ حجاج فأكثر (باص أو غرفة)
   ٣. التجهيز للسفر: تبدأ عند رفع ١٠ تصاريح أو ١٠ تذاكر طيران
   ٤. السفر والحج:   من تاريخ أول رحلة ذهاب حتى أول رحلة عودة
   المرحلة النشطة = آخر مرحلة تحقق شرطها
   ════════════════════════════════════════════════════════════ */

const PHASE_THRESHOLD = 10;

interface PhaseInfo {
  id: "reg" | "dist" | "prep" | "travel";
  label: string;
  icon: string;
  active: boolean;    // تحقق شرطها
  current: boolean;   // هي المرحلة النشطة حالياً
  sub: string;        // وصف مختصر للحالة
  pct: number;        // نسبة الإنجاز داخل المرحلة
}

function useSeasonPhases(passengers: Passenger[]) {
  const [flights, setFlights] = useState<Flight[]>([]);

  useEffect(() => {
    supabase.from("flights").select("*").then(({ data }) => {
      if (data) setFlights(data as Flight[]);
    });
  }, []);

  return useMemo(() => {
    const hajj = passengers.filter(p => !p.passenger_type || p.passenger_type === "حاج");
    const total = hajj.length;

    /* ── ١. التسجيل ── */
    const regActive = total > 0;
    const docsComplete = hajj.filter(p => p.photo_url && p.passport_url && p.national_id_url).length;
    const regPct = total ? Math.round(docsComplete / total * 100) : 0;

    /* ── ٢. التوزيع ── */
    const distributed = hajj.filter(p => (p as any).bus_id != null || (p as any).room_id != null).length;
    const distActive = distributed >= PHASE_THRESHOLD;
    const fullyDist = hajj.filter(p =>
      (p as any).bus_id != null && (p as any).room_id != null &&
      (p as any).camp_mina_id != null && (p as any).camp_arafa_id != null
    ).length;
    const distPct = total ? Math.round(fullyDist / total * 100) : 0;

    /* ── ٣. التجهيز للسفر ── */
    const permits = hajj.filter(p => (p as any).hajj_permit_url).length;
    const tickets = hajj.filter(p => (p as any).flight_ticket_url).length;
    const prepActive = permits >= PHASE_THRESHOLD || tickets >= PHASE_THRESHOLD;
    const prepDone = hajj.filter(p => (p as any).hajj_permit_url && (p as any).flight_ticket_url).length;
    const prepPct = total ? Math.round(prepDone / total * 100) : 0;

    /* ── ٤. السفر والحج ── */
    const depDates = flights.filter(f => f.type === "ذهاب" && f.date).map(f => f.date).sort();
    const retDates = flights.filter(f => f.type === "إياب" && f.date).map(f => f.date).sort();
    const firstDep = depDates[0] || null;
    const firstRet = retDates[0] || null;
    const todayStr = new Date().toISOString().split("T")[0];
    const travelActive = !!firstDep && todayStr >= firstDep;
    const travelEnded = !!firstRet && todayStr > firstRet;

    /* أيام متبقية على السفر */
    let daysToTravel: number | null = null;
    if (firstDep) {
      const diff = Math.ceil((new Date(firstDep).getTime() - Date.now()) / 86400000);
      daysToTravel = diff > 0 ? diff : 0;
    }

    const phases: PhaseInfo[] = [
      {
        id: "reg", label: "التسجيل",
        icon: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/>`,
        active: regActive, current: false,
        sub: `${total} حاج · اكتمال المستندات ${regPct}٪`,
        pct: regPct,
      },
      {
        id: "dist", label: "التوزيع",
        icon: `<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>`,
        active: distActive, current: false,
        sub: distActive ? `اكتمل توزيع ${fullyDist} من ${total}` : `${distributed} من ${PHASE_THRESHOLD} للبدء`,
        pct: distPct,
      },
      {
        id: "prep", label: "التجهيز للسفر",
        icon: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/>`,
        active: prepActive, current: false,
        sub: prepActive ? `تصاريح ${permits} · تذاكر ${tickets}` : `${Math.max(permits, tickets)} من ${PHASE_THRESHOLD} للبدء`,
        pct: prepPct,
      },
      {
        id: "travel", label: "السفر والحج",
        icon: `<path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>`,
        active: travelActive, current: false,
        sub: travelEnded ? "انتهى الموسم" : travelActive ? "الحجاج في رحلة الحج" : daysToTravel != null ? `بعد ${daysToTravel} يوم` : "لم تُحدد الرحلات بعد",
        pct: travelActive ? (travelEnded ? 100 : 50) : 0,
      },
    ];

    /* المرحلة النشطة = آخر مرحلة تحقق شرطها */
    let currentIdx = 0;
    phases.forEach((ph, i) => { if (ph.active) currentIdx = i; });
    phases[currentIdx].current = true;

    /* نسبة تقدم الموسم ككل: كل مرحلة مكتملة = ٢٥٪ + نسبة المرحلة الحالية */
    const seasonPct = Math.min(100, Math.round(currentIdx * 25 + phases[currentIdx].pct * 0.25));

    return { phases, currentIdx, seasonPct, daysToTravel, total, fullyDist, hajj };
  }, [passengers, flights]);
}

/* ════════════════════════════════════════════════════════════
   النموذج الأول: كارت المرحلة المدموج (قوس + مرحلة + مهام)
   ════════════════════════════════════════════════════════════ */
function SeasonPhaseCard({ passengers, setPage }: { passengers: Passenger[]; setPage?: (p: string) => void }) {
  const config = useConfig();
  const primary = config.color_primary || "#7D1F3C";
  const accent = config.color_accent || "#D4A017";
  const { phases, currentIdx, seasonPct, daysToTravel, total, hajj } = useSeasonPhases(passengers);

  const current = phases[currentIdx];
  const next = phases[currentIdx + 1] || null;

  /* حسابات شريط المهام */
  const busCount   = hajj.filter(p => (p as any).bus_id != null).length;
  const roomCount  = hajj.filter(p => (p as any).room_id != null).length;
  const minaCount  = hajj.filter(p => (p as any).camp_mina_id != null).length;
  const arafaCount = hajj.filter(p => (p as any).camp_arafa_id != null).length;

  /* القوس: نصف دائرة — محيطها الكامل ≈ π×r */
  const R = 52, C = Math.PI * R;
  const arcLen = C * (seasonPct / 100);

  return (
    <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden", flexShrink: 0 }}>

      {/* شريط المراحل العلوي */}
      <div style={{ display: "flex", height: 5 }}>
        {phases.map((ph, i) => (
          <div key={ph.id} style={{ flex: 1, background: i < currentIdx ? primary : i === currentIdx ? `${primary}aa` : "var(--ivory2)" }} />
        ))}
      </div>

      <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>

        {/* القوس */}
        <div style={{ position: "relative", width: 128, height: 78, flexShrink: 0 }}>
          <svg viewBox="0 0 128 78" style={{ width: "100%", height: "100%" }}>
            <path d="M 12 70 A 52 52 0 0 1 116 70" fill="none" stroke="var(--ivory2)" strokeWidth="9" strokeLinecap="round" />
            <path d="M 12 70 A 52 52 0 0 1 116 70" fill="none" stroke={primary} strokeWidth="9" strokeLinecap="round"
              strokeDasharray={`${arcLen} ${C}`} />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", paddingBottom: 2 }}>
            {daysToTravel != null && daysToTravel > 0 ? (
              <>
                <div style={{ fontSize: 22, fontWeight: 800, color: "var(--ink)", lineHeight: 1, fontFamily: "var(--font-heading)" }}>{daysToTravel}</div>
                <div style={{ fontSize: 9.5, color: "var(--muted)", marginTop: 2 }}>يوم على السفر</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 22, fontWeight: 800, color: "var(--ink)", lineHeight: 1, fontFamily: "var(--font-heading)" }}>{seasonPct}٪</div>
                <div style={{ fontSize: 9.5, color: "var(--muted)", marginTop: 2 }}>من الموسم</div>
              </>
            )}
          </div>
        </div>

        {/* فاصل */}
        <div style={{ width: 1, alignSelf: "stretch", background: "var(--line)" }} />

        {/* المرحلة الحالية */}
        <div style={{ flex: 1, minWidth: 150 }}>
          <div style={{ fontSize: 10.5, color: "var(--muted)", marginBottom: 3 }}>المرحلة الحالية</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={primary} strokeWidth="1.8" strokeLinecap="round" dangerouslySetInnerHTML={{ __html: current.icon }} />
            <span style={{ fontSize: 17, fontWeight: 800, color: "var(--ink)", fontFamily: "var(--font-heading)" }}>{current.label}</span>
            <span style={{ fontSize: 10, background: `${primary}12`, color: primary, padding: "2px 9px", borderRadius: 99, fontWeight: 700 }}>{current.pct}٪</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>{current.sub}</div>
        </div>

        {/* المحطة القادمة */}
        {next && (
          <div style={{ minWidth: 130 }}>
            <div style={{ fontSize: 10.5, color: "var(--muted)", marginBottom: 3 }}>المحطة القادمة</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 2 }}>{next.label}</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>{next.sub}</div>
          </div>
        )}
      </div>

      {/* شريط مهام المرحلة */}
      <div style={{ borderTop: "1px solid var(--line)", padding: "8px 16px", display: "flex", gap: 16, background: "var(--ivory)", flexWrap: "wrap", alignItems: "center" }}>
        {([
          { label: "غرف", count: roomCount, page: "hotel",  icon: `<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M10 6h4"/><path d="M10 10h4"/>` },
          { label: "باصات", count: busCount, page: "buses", icon: `<rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 4v4h-7V8z"/>` },
          { label: "منى", count: minaCount, page: "mina",   icon: `<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M2 21h20"/>` },
          { label: "عرفة", count: arafaCount, page: "arafa", icon: `<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M2 21h20"/>` },
        ]).map(item => (
          <span key={item.label}
            onClick={() => setPage?.(item.page)}
            style={{ fontSize: 10.5, color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 5, cursor: setPage ? "pointer" : "default" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.8" strokeLinecap="round" dangerouslySetInnerHTML={{ __html: item.icon }} />
            {item.label}: <b style={{ color: "var(--ink)" }}>{item.count}/{total}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   النموذج الثاني: مسار المحطات الأفقي
   ════════════════════════════════════════════════════════════ */
function SeasonStations({ passengers }: { passengers: Passenger[] }) {
  const config = useConfig();
  const primary = config.color_primary || "#7D1F3C";
  const { phases, currentIdx } = useSeasonPhases(passengers);

  return (
    <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: "20px 22px 16px", flexShrink: 0 }}>
      <div style={{ position: "relative" }}>

        {/* الخط الواصل */}
        <div style={{ position: "absolute", top: 20, right: 42, left: 42, height: 3, background: "var(--ivory2)", borderRadius: 3 }} />
        <div style={{ position: "absolute", top: 20, right: 42, width: `calc(${(currentIdx / (phases.length - 1)) * 100}% - ${42 * (currentIdx / (phases.length - 1)) * 2}px)`, height: 3, background: primary, borderRadius: 3 }} />

        <div style={{ display: "flex", justifyContent: "space-between", position: "relative" }}>
          {phases.map((ph, i) => {
            const done = i < currentIdx;
            const isCurrent = i === currentIdx;
            return (
              <div key={ph.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 110, textAlign: "center" }}>

                {/* الدائرة */}
                <div style={{
                  width: 40, height: 40, borderRadius: "50%", position: "relative",
                  background: done ? primary : "var(--paper)",
                  border: done ? "none" : isCurrent ? `2.5px solid ${primary}` : "2px solid var(--line)",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  {done ? (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isCurrent ? primary : "var(--muted)"} strokeWidth="1.8" strokeLinecap="round" dangerouslySetInnerHTML={{ __html: ph.icon }} />
                  )}
                  {isCurrent && <div style={{ position: "absolute", inset: -6, borderRadius: "50%", border: `2px solid ${primary}33` }} />}
                </div>

                {/* الاسم */}
                <span style={{ fontSize: 12, fontWeight: isCurrent ? 800 : done ? 700 : 500, color: done || isCurrent ? "var(--ink)" : "var(--muted)" }}>{ph.label}</span>

                {/* الحالة */}
                <span style={{ fontSize: 9.5, color: isCurrent ? primary : "var(--muted)", fontWeight: isCurrent ? 700 : 400, lineHeight: 1.4 }}>{ph.sub}</span>

                {/* شريط تقدم صغير للمرحلة الحالية */}
                {isCurrent && (
                  <div style={{ width: 68, height: 4, background: "var(--ivory2)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ width: `${ph.pct}%`, height: "100%", background: primary, borderRadius: 99 }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export { SeasonPhaseCard, SeasonStations };
