import { useState, useEffect, useCallback, useMemo } from "react";
import type { Passenger, User } from "../types";

interface Alert {
  key: string;
  label: string;
  count: number;
  sub: string;
  color: string;
  bg: string;
  borderColor: string;
  svgPath: string;
  page: string;
  perm: string;
}

const INTERVAL = 4500;

function buildAlerts(hajj: Passenger[]): Alert[] {
  const total = hajj.length;

  const dhulHijja1 = new Date("2026-05-18T00:00:00+03:00");
  const sixMonthsBefore = new Date(dhulHijja1);
  sixMonthsBefore.setMonth(sixMonthsBefore.getMonth() - 6);

  const expiringCount = hajj.filter(p => {
    const exp = (p as any).passport_expiry;
    if (!exp) return false;
    const d = new Date(exp);
    return !isNaN(d.getTime()) && d >= sixMonthsBefore && d <= dhulHijja1;
  }).length;

  const all: Alert[] = [
    {
      key: "no_passport",
      label: "بدون جواز سفر",
      count: hajj.filter(p => !p.passport || p.passport.trim() === "").length,
      sub: `من إجمالي ${total} حاج`,
      color: "#C62828",
      bg: "rgba(198,40,40,.07)",
      borderColor: "rgba(198,40,40,.25)",
      svgPath: `<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/><path d="M8 16s1-2 4-2 4 2 4 2"/>`,
      page: "passengers",
      perm: "manage_passengers",
    },
    {
      key: "expiry_soon",
      label: "جواز قريب الانتهاء",
      count: expiringCount,
      sub: "ينتهي قبل وقفة عرفات",
      color: "#E65100",
      bg: "rgba(230,81,0,.07)",
      borderColor: "rgba(230,81,0,.25)",
      svgPath: `<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>`,
      page: "passengers",
      perm: "manage_passengers",
    },
    {
      key: "no_phone",
      label: "بدون رقم تليفون",
      count: hajj.filter(p => !p.phone || p.phone.trim() === "").length,
      sub: "لا يمكن التواصل معهم",
      color: "#1565C0",
      bg: "rgba(21,101,192,.07)",
      borderColor: "rgba(21,101,192,.25)",
      svgPath: `<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.38 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.4a16 16 0 0 0 5.69 5.69l.95-.95a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>`,
      page: "passengers",
      perm: "manage_passengers",
    },
  ];

  return all.filter(a => a.count > 0);
}

function AlertRotator({ passengers, setPage, currentUser }: {
  passengers: Passenger[];
  setPage: (p: string) => void;
  currentUser: User;
}) {
  const hajj   = useMemo(() => passengers.filter(p => !p.passenger_type || p.passenger_type === "حاج"), [passengers]);
  const alerts = useMemo(() => buildAlerts(hajj), [hajj]);
  const [idx, setIdx]           = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused]     = useState(false);

  const next = useCallback(() => {
    setIdx(i => (i + 1) % Math.max(alerts.length, 1));
    setProgress(0);
  }, [alerts.length]);

  const prev = useCallback(() => {
    setIdx(i => (i - 1 + Math.max(alerts.length, 1)) % Math.max(alerts.length, 1));
    setProgress(0);
  }, [alerts.length]);

  useEffect(() => {
    if (paused || alerts.length <= 1) return;
    const step = 50;
    const inc  = (step / INTERVAL) * 100;
    const timer = setInterval(() => {
      setProgress(p => {
        if (p + inc >= 100) { next(); return 0; }
        return p + inc;
      });
    }, step);
    return () => clearInterval(timer);
  }, [paused, alerts.length, next]);

  useEffect(() => {
    if (alerts.length === 0) return;
    setIdx(i => i >= alerts.length ? 0 : i);
  }, [alerts.length]);

  if (alerts.length === 0) {
    return (
      <div style={{ borderRadius: 12, padding: "14px 16px", background: "rgba(42,157,143,.07)", border: "1px solid rgba(42,157,143,.2)", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(42,157,143,.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2A9D8F" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#2A9D8F" }}>كل شيء مكتمل ✓</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>لا توجد بيانات ناقصة</div>
        </div>
      </div>
    );
  }

  const cur     = alerts[Math.min(idx, alerts.length - 1)];
  const hasPerm = currentUser.permissions[cur.perm];

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onClick={() => { if (hasPerm) setPage(cur.page); }}
      style={{ borderRadius: 12, border: `1px solid ${cur.borderColor}`, background: cur.bg, cursor: hasPerm ? "pointer" : "default", overflow: "hidden", position: "relative", opacity: hasPerm ? 1 : 0.6 }}
      onMouseOver={e => { if (hasPerm) (e.currentTarget as HTMLDivElement).style.boxShadow = `0 4px 16px ${cur.color}22`; }}
      onMouseOut={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}
    >
      {/* شريط التقدم */}
      <div style={{ height: 3, background: "rgba(0,0,0,.07)", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, right: 0, height: "100%", width: `${100 - progress}%`, background: cur.color, borderRadius: 99, transition: "width .05s linear" }} />
      </div>

      {/* المحتوى */}
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: 11, background: `${cur.color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={cur.color} strokeWidth="1.9" strokeLinecap="round" dangerouslySetInnerHTML={{ __html: cur.svgPath }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: cur.color, marginBottom: 2, letterSpacing: ".5px" }}>تنبيه</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 28, fontWeight: 900, lineHeight: 1, color: cur.color }}>{cur.count}</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", marginTop: 3 }}>{cur.label}</div>
          <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 1 }}>{cur.sub}</div>
        </div>
        {alerts.length > 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <div onClick={prev} style={{ width: 26, height: 26, borderRadius: 7, background: `${cur.color}15`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: cur.color }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15"/></svg>
            </div>
            <div onClick={next} style={{ width: 26, height: 26, borderRadius: 7, background: `${cur.color}15`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: cur.color }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
          </div>
        )}
      </div>

      {/* نقاط التنقل */}
      {alerts.length > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, paddingBottom: 10 }} onClick={e => e.stopPropagation()}>
          {alerts.map((a, i) => (
            <div key={a.key} onClick={() => { setIdx(i); setProgress(0); }}
              style={{ width: i === idx ? 18 : 6, height: 6, borderRadius: 99, cursor: "pointer", transition: "width .3s, background .3s", background: i === idx ? cur.color : `${cur.color}30` }} />
          ))}
        </div>
      )}
    </div>
  );
}

export { AlertRotator };
