import { useRef } from "react";
import type { Passenger, User } from "../types";
import { AlertRotator } from "./AlertRotator";
import { SeasonPhaseCard, PackagesCard, TotalPilgrimsCard } from "./Seasontimeline";

function Dashboard({ passengers, setPage, currentUser, onAddManual, onScan }: {
  passengers: Passenger[];
  setPage: (p: string) => void;
  currentUser: User;
  onAddManual?: () => void;
  onScan?: (file: File) => void;
}) {
  const hajj = passengers.filter(p => !p.passenger_type || p.passenger_type === "حاج");

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

  const recent = [...hajj].sort((a, b) => (b.id ?? 0) - (a.id ?? 0)).slice(0, 10);
  const scanInputRef = useRef<HTMLInputElement>(null);

  return (
    <div style={{ display: "flex", flex: 1 }}>

      {/* ══ العمود الأوسط ══ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto", padding: 14, gap: 12, minWidth: 0 }}>

        {/* 1) أزرار الإجراءات */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, flexShrink: 0 }}>

          {/* مسح مستند — لون الثيم الأساسي */}
          <div onClick={() => scanInputRef.current?.click()}
            style={{ display: "flex", alignItems: "center", gap: 11, padding: "13px 16px", borderRadius: 12, cursor: "pointer", background: "linear-gradient(135deg, var(--primary), var(--primary-light))", color: "var(--text-inverse)", boxShadow: "var(--shadow-md)" }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(255,255,255,.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--accent-light)" strokeWidth="2" strokeLinecap="round">
                <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/>
                <path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
                <line x1="7" y1="12" x2="17" y2="12"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.2 }}>مسح مستند</div>
              <div style={{ fontSize: 10.5, marginTop: 2, opacity: .75 }}>جواز / بطاقة / تصريح حج</div>
            </div>
          </div>
          <input ref={scanInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
            const file = e.target.files?.[0]; if (!file) return;
            if (onScan) { onScan(file); } else { (window as any).__hajj_pending_scan_file__ = file; setPage("passengers"); }
            e.target.value = "";
          }} />

          {/* إضافة يدوي — لون الـ accent الذهبي */}
          <div onClick={() => { onAddManual ? onAddManual() : navTo("passengers"); }}
            style={{ display: "flex", alignItems: "center", gap: 11, padding: "13px 16px", borderRadius: 12, cursor: "pointer", background: "linear-gradient(135deg, var(--accent-dark), var(--accent))", color: "#1a1200", boxShadow: "var(--shadow-sm)" }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(255,255,255,.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,.6)" strokeWidth="2.2" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.2 }}>إضافة يدوي</div>
              <div style={{ fontSize: 10.5, marginTop: 2, opacity: .65 }}>إدخال بيانات الحاج يدوياً</div>
            </div>
          </div>
        </div>

        {/* 2) كارت مراحل الموسم */}
        <SeasonPhaseCard passengers={passengers} setPage={navTo} />

        {/* 3) الصف السفلي: آخر المسجلين + توزيع الباقات */}
        <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>

          {/* آخر الحجاج المسجلين */}
          <div style={{ flex: 1, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", background: "var(--info-bg)", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--info)" strokeWidth="1.7" strokeLinecap="round">
                <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
              </svg>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: 14, color: "var(--ink)", flex: 1 }}>آخر الحجاج المسجلين</div>
              <span onClick={() => navTo("passengers")} style={{ fontSize: 11, color: "var(--info)", cursor: "pointer", fontWeight: 700 }}>عرض الكل</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, overflowY: "auto", flex: 1, padding: "4px 6px" }}>
              {recent.map(p => (
                <div key={p.id} onClick={() => navTo("passengers")}
                  style={{ display: "flex", flexDirection: "column", padding: "7px 10px", borderRadius: 8, cursor: "pointer", direction: "rtl", minWidth: 0 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--ivory)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.short_ar || p.name_ar.split(" ").slice(0,2).join(" ")}</div>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nat}</div>
                </div>
              ))}
            </div>
          </div>

          {/* توزيع الباقات */}
          <PackagesCard passengers={passengers} setPage={navTo} />
        </div>
      </div>

      {/* ══ العمود الأيسر — Analytics ══ */}
      <div style={{ width: 220, flexShrink: 0, background: "var(--paper)", borderRight: "1px solid var(--line)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
          <div style={{ marginBottom: 16 }}>
            <TotalPilgrimsCard passengers={passengers} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--em8)", marginBottom: 8, paddingBottom: 7, borderBottom: "1px solid var(--line)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.7">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
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
