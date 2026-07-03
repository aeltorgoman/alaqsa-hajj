import { useMemo, useRef } from "react";
import { useConfig } from "../config/ConfigContext";
import type { Passenger, User } from "../types";
import { Avatar } from "./Avatar";
import { AlertRotator } from "./AlertRotator";
import { StatsRow, type StatCardData } from "./StatCard";

function Dashboard({ passengers, setPage, currentUser, onAddManual, onScan }: {
  passengers: Passenger[];
  setPage: (p: string) => void;
  currentUser: User;
  onAddManual?: () => void;
  onScan?: (file: File) => void;
}) {
  const config  = useConfig();
  const hajj    = passengers.filter(p => !p.passenger_type || p.passenger_type === "حاج");
  const males   = hajj.filter(p => p.gender === "ذكر").length;
  const females = hajj.filter(p => p.gender === "أنثى").length;
  const total   = hajj.length || 1;
  const primary = config.color_primary || "#7D1F3C";

  /* ── التحقق من الصلاحية قبل التنقل ── */
  const PERM_MAP: Record<string, string> = {
    passengers: "manage_passengers",
    buses:      "manage_buses",
    mina:       "manage_camps",
    arafa:      "manage_camps",
    hotel:      "manage_hotel",
    flights:    "manage_flights",
  };

  const navTo = (page: string) => {
    const perm = PERM_MAP[page];
    if (!perm || currentUser.permissions[perm]) setPage(page);
  };


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

  const recent      = [...hajj].sort((a, b) => (b.id ?? 0) - (a.id ?? 0)).slice(0, 8);
  const scanInputRef = useRef<HTMLInputElement>(null);

  const statCards: StatCardData[] = [
    {
      label: "إجمالي الحجاج",
      num: hajj.length,
      sub: "الموسم الحالي",
      tone: "brand",
      featured: true,
      icon: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
    },
    {
      label: "رجال",
      num: males,
      sub: Math.round(males / total * 100) + "٪ من الإجمالي",
      tone: "info",
      icon: `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`,
    },
    {
      label: "نساء",
      num: females,
      sub: Math.round(females / total * 100) + "٪ من الإجمالي",
      tone: "female",
      icon: `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`,
    },
  ];

  return (
    <div style={{ display: "flex", flex: 1 }}>

      {/* ══ العمود الأوسط ══ */}
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
            <div onClick={() => { onAddManual ? onAddManual() : navTo("passengers"); }}
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

        {/* 2) كروت الإحصاء */}
        <div style={{ flexShrink: 0, margin: "0 -14px" }}>
          <StatsRow cards={statCards} />
        </div>

        {/* 3) آخر الحجاج المسجلين */}
        <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--g5)" strokeWidth="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: 14, color: "var(--em8)", flex: 1 }}>آخر الحجاج المسجلين</div>
              <span onClick={() => navTo("passengers")} style={{ fontSize: 11, color: "var(--g6)", cursor: "pointer", fontWeight: 600 }}>عرض الكل</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, overflowY: "auto", flex: 1 }}>
              {recent.slice(0, 8).map(p => (
                <div key={p.id} onClick={() => navTo("passengers")}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, cursor: "pointer", direction: "rtl" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--ivory)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}>
                  <Avatar name={p.name_ar} gender={p.gender} size={28} />
                  <div style={{ flex: 1, minWidth: 0, textAlign: "right" }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.short_ar || p.name_ar.split(" ").slice(0,2).join(" ")}</div>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nat}</div>
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
              const hasPerm = currentUser.permissions[PERM_MAP[page]];
              const isLow = pct < 30;
              return (
                <div key={label}
                  onClick={() => hasPerm ? navTo(page) : undefined}
                  style={{ marginBottom: 8, cursor: hasPerm ? "pointer" : "default", opacity: hasPerm ? 1 : 0.4 }}
                  onMouseEnter={e => { if (hasPerm) (e.currentTarget as HTMLDivElement).style.opacity = ".75"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.opacity = hasPerm ? "1" : "0.4"; }}>
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

          {/* تنبيهات سريعة */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--em8)", marginBottom: 8, paddingBottom: 7, borderBottom: "1px solid var(--line)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--g5)" strokeWidth="1.7"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              تنبيهات سريعة
            </div>
            <AlertRotator passengers={passengers} setPage={setPage} currentUser={currentUser} />
          </div>

        </div>
      </div>
    </div>
  );
}

export { Dashboard };
