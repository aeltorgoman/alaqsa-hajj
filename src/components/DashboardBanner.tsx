import { useState, useEffect } from "react";
import { useConfig } from "../config/ConfigContext";
import { ThemeSwitcher } from "../config/ThemeContext";
import type { User } from "../types";
import { NotificationBell } from "./NotificationBell";

function DashboardBanner({ setPage, currentUser, onLogout }: {
  setPage: (p: string) => void;
  onLogout: () => void;
  currentUser: User;
}) {
  const config  = useConfig();
  const primary = config.color_primary || "#7D1F3C";

  // ─── عداد يوم عرفة ───
  function getArafaDate(): Date {
    try {
      const fmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { year:"numeric", month:"numeric", day:"numeric" });
      const now = new Date();
      const partsNow = fmt.formatToParts(now);
      let hYear  = parseInt(partsNow.find(p => p.type === "year")!.value);
      const hMon = parseInt(partsNow.find(p => p.type === "month")!.value);
      const hDay = parseInt(partsNow.find(p => p.type === "day")!.value);
      if (hMon === 12 && hDay > 9) hYear++;
      const base = new Date(now);
      base.setDate(base.getDate() - 60);
      for (let i = 0; i < 400; i++) {
        const d = new Date(base);
        d.setDate(d.getDate() + i);
        const parts = fmt.formatToParts(d);
        const y = parseInt(parts.find(p => p.type === "year")!.value);
        const m = parseInt(parts.find(p => p.type === "month")!.value);
        const day = parseInt(parts.find(p => p.type === "day")!.value);
        if (y === hYear && m === 12 && day === 9) {
          return new Date(d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")+"T00:00:00+03:00");
        }
      }
      return new Date("2027-05-15T00:00:00+03:00");
    } catch {
      return new Date("2027-05-15T00:00:00+03:00");
    }
  }

  const pad = (n: number) => n < 10 ? "0" + n : "" + n;

  function calcDiff() {
    const diffMs = Math.max(0, getArafaDate().getTime() - Date.now());
    return {
      days: Math.floor(diffMs / 864e5),
      hrs:  Math.floor((diffMs % 864e5) / 36e5),
      mins: Math.floor((diffMs % 36e5) / 6e4),
      secs: Math.floor((diffMs % 6e4) / 1e3),
    };
  }

  const [countdown, setCountdown] = useState(calcDiff);
  const [showThemes, setShowThemes] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCountdown(calcDiff()), 1000);
    return () => clearInterval(timer);
  }, []);

  const { days: diffDays, hrs: diffHrs, mins: diffMins, secs: diffSecs } = countdown;

  // أول حرفين من الاسم للأفاتار
  const initials = currentUser.name.trim().split(" ").map((w: string) => w[0]).slice(0, 2).join("");

  // ─── inline styles مستخرجة بالضبط من المعاينة ───
  const S = {
    banner: {
      position: "relative" as const,
      flexShrink: 0,
      height: 200,
      background: config.banner_image_url
        ? undefined
        : `linear-gradient(110deg,${primary}f0 0%,${primary} 50%,${primary}cc 100%)`,
      overflow: "hidden" as const,
    },
    overlay: {
      position: "absolute" as const, inset: 0,
      background: "linear-gradient(to bottom, rgba(93,24,48,.72) 0%, rgba(0,0,0,.38) 55%, rgba(0,0,0,.80) 100%)",
    },
    // يسار أعلى — مستخدم + أيقونات
    userStrip: {
      position: "absolute" as const, top: 14, left: 18, zIndex: 3,
      display: "flex", alignItems: "center", gap: 8,
    },
    avatar: {
      width: 34, height: 34, borderRadius: "50%",
      background: primary, border: "2px solid rgba(212,172,79,.6)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--font-heading)", fontSize: 13, fontWeight: 700,
      color: "#e7cd8a", flexShrink: 0, cursor: "pointer",
    },
    iconBtn: {
      width: 32, height: 32, borderRadius: 8,
      background: "rgba(0,0,0,.3)", border: "1px solid rgba(255,255,255,.15)",
      display: "flex", alignItems: "center", justifyContent: "center",
      cursor: "pointer", flexShrink: 0, position: "relative" as const,
    },
    notifDot: {
      position: "absolute" as const, top: 5, left: 5,
      width: 7, height: 7, borderRadius: "50%",
      background: "#f87171", border: "1.5px solid rgba(0,0,0,.4)",
    },
    // يمين — شعار الحملة
    brand: {
      position: "absolute" as const, top: 16, right: 20,
      display: "flex", alignItems: "center", gap: 11, zIndex: 2,
    },
    brandCircle: {
      width: 52, height: 52, borderRadius: "50%",
      background: "rgba(93,24,48,.85)", border: "2px solid #d4ac4f",
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      overflow: "hidden" as const,
    },
    // يسار أسفل — عداد عرفة
    arafaWidget: {
      position: "absolute" as const, bottom: 14, left: 18, zIndex: 2,
      display: "flex", alignItems: "center", gap: 10,
      background: "rgba(0,0,0,.42)", border: "1px solid rgba(212,172,79,.38)",
      borderRadius: 11, padding: "8px 12px", backdropFilter: "blur(6px)",
    },
    abox: {
      background: "rgba(0,0,0,.55)", border: "1px solid rgba(255,255,255,.1)",
      borderRadius: 7, padding: "4px 8px", textAlign: "center" as const, minWidth: 42,
    },
  };

  return (
    <div style={S.banner}>

      {/* صورة الكعبة */}
      {config.banner_image_url && (
        <img src={config.banner_image_url} alt="banner"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: (config as any).banner_position || "center" }} />
      )}

      {/* overlay */}
      <div style={S.overlay} />

      {/* ── يسار أعلى: مستخدم + أيقونات ── */}
      <div style={S.userStrip}>
        {/* 1. إعدادات */}
        <div style={S.iconBtn} onClick={() => setPage("users")}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.85)" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </div>
        {/* 2. ثيم */}
        <div style={{ position:"relative" }}>
          <div style={S.iconBtn} onClick={() => setShowThemes((s: boolean) => !s)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
          </div>
          {showThemes && (
            <div style={{ position:"fixed", top:50, left:14, zIndex:9999, background:"#2a1020", borderRadius:12, boxShadow:"0 8px 32px rgba(0,0,0,0.5)", border:"1px solid rgba(255,255,255,0.1)", minWidth:220, padding:8, maxHeight:"80vh", overflowY:"auto" }}
              onMouseLeave={() => setShowThemes(false)}>
              <ThemeSwitcher />
            </div>
          )}
        </div>
        {/* 3. إشعارات */}
        <NotificationBell />
        {/* فاصل */}
        <div style={{ width: 1, height: 28, background: "rgba(255,255,255,.2)", margin: "0 4px" }} />
        {/* 4. اسم المستخدم */}
        <div style={{ position:"relative" }}>
          <div onClick={() => setShowUserMenu((s: boolean) => !s)} style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer" }}>
            <div style={S.avatar}>{initials}</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", lineHeight: 1 }}>{currentUser.name.split(" ")[0]}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,.55)", marginTop: 1 }}>مدير النظام</div>
            </div>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          {showUserMenu && (
            <div style={{ position:"fixed", top:52, left:14, zIndex:9999, background:"var(--bg-card)", borderRadius:10, boxShadow:"0 8px 24px rgba(0,0,0,0.2)", border:"1px solid var(--border)", minWidth:160, padding:6 }}
              onMouseLeave={() => setShowUserMenu(false)}>
              <button onClick={() => { setShowUserMenu(false); onLogout(); }}
                style={{ width:"100%", padding:"9px 14px", borderRadius:7, border:"none", background:"transparent", color:"#C62828", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"var(--font-body)", display:"flex", alignItems:"center", gap:8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                تسجيل الخروج
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── يمين: شعار الحملة + الاسم ── */}
      <div style={S.brand}>
        <div style={S.brandCircle}>
          {config.logo_url
            ? <img src={config.logo_url} alt="logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            : <svg viewBox="0 0 44 44" fill="none" stroke="#d4ac4f" strokeWidth="1.5" width="28" height="28">
                <path d="M22 3L26.5 8.5L33.5 8L33 15L38.5 19.5L33 24L33.5 31L26.5 30.5L22 36L17.5 30.5L10.5 31L11 24L5.5 19.5L11 15L10.5 8L17.5 8.5Z"/>
                <circle cx="22" cy="19.5" r="4.5"/>
              </svg>
          }
        </div>
        <div>
          <div style={{ fontSize: 10, color: "rgba(212,160,23,.9)", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 3 }}>نظام إدارة الحج</div>
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 900, color: "#fff", lineHeight: 1, marginBottom: 4, textShadow: "0 2px 8px rgba(0,0,0,.5)" }}>{config.name_ar || "حملة الأقصى"}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.6)", lineHeight: 1.4 }}>{config.tagline || "نُدير التفاصيل لتتفرّغوا للعبادة"}</div>
        </div>
      </div>

      {/* ── يسار أسفل: عداد عرفة ── */}
      <div style={S.arafaWidget}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,.65)", lineHeight: 1.5 }}>
          <div style={{ color: "#e7cd8a", fontWeight: 700, fontSize: 11, marginBottom: 1 }}>وقفة عرفات ١٤٤٨</div>
          المتبقي على يوم عرفة
        </div>
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          {/* أيام */}
          <div style={S.abox}>
            <span style={{ display: "block", fontFamily: "var(--font-heading)", fontSize: 17, fontWeight: 700, color: "#fbbf24", lineHeight: 1 }}>{diffDays}</span>
            <span style={{ display: "block", fontSize: 9, color: "rgba(255,255,255,.5)", marginTop: 1 }}>يوم</span>
          </div>
          <span style={{ color: "rgba(255,255,255,.3)", fontSize: 13, alignSelf: "flex-start", marginTop: 3 }}>:</span>
          {/* ساعات */}
          <div style={S.abox}>
            <span style={{ display: "block", fontFamily: "var(--font-heading)", fontSize: 17, fontWeight: 700, color: "#e7cd8a", lineHeight: 1 }}>{pad(diffHrs)}</span>
            <span style={{ display: "block", fontSize: 9, color: "rgba(255,255,255,.5)", marginTop: 1 }}>ساعة</span>
          </div>
          <span style={{ color: "rgba(255,255,255,.3)", fontSize: 13, alignSelf: "flex-start", marginTop: 3 }}>:</span>
          {/* دقائق */}
          <div style={S.abox}>
            <span style={{ display: "block", fontFamily: "var(--font-heading)", fontSize: 17, fontWeight: 700, color: "#e7cd8a", lineHeight: 1 }}>{pad(diffMins)}</span>
            <span style={{ display: "block", fontSize: 9, color: "rgba(255,255,255,.5)", marginTop: 1 }}>دقيقة</span>
          </div>
          <span style={{ color: "rgba(255,255,255,.3)", fontSize: 13, alignSelf: "flex-start", marginTop: 3 }}>:</span>
          {/* ثواني */}
          <div style={S.abox}>
            <span style={{ display: "block", fontFamily: "var(--font-heading)", fontSize: 17, fontWeight: 700, color: "#e7cd8a", lineHeight: 1 }}>{pad(diffSecs)}</span>
            <span style={{ display: "block", fontSize: 9, color: "rgba(255,255,255,.5)", marginTop: 1 }}>ثانية</span>
          </div>
        </div>
      </div>

    </div>
  );
}

export { DashboardBanner };
