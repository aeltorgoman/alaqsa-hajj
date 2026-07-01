import { useState, useRef, useEffect } from "react";
import { useConfig } from "../config/ConfigContext";
import { ThemeSwitcher } from "../config/ThemeContext";
import { NotificationBell } from "./NotificationBell";
import type { User } from "../types";

const PAGE_META: Record<string, { label: string; icon: string; sub: string }> = {
  passengers: { label: "الحجاج",          sub: "إدارة بيانات الحجاج",               icon: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>` },
  buses:      { label: "الباصات",          sub: "توزيع الحجاج على الحافلات",         icon: `<rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 4v4h-7V8z"/>` },
  flights:    { label: "الطيران",          sub: "رحلات وتذاكر الحجاج",              icon: `<path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>` },
  mina:       { label: "مخيمات منى",       sub: "توزيع الحجاج في منى",              icon: `<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>` },
  arafa:      { label: "مخيمات عرفة",      sub: "توزيع الحجاج في عرفة",            icon: `<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>` },
  hotel:      { label: "الفندق",           sub: "غرف وإقامة الحجاج",               icon: `<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M10 6h4"/><path d="M10 10h4"/>` },
  reports:    { label: "التقارير",         sub: "تقارير وإحصاءات الحملة",           icon: `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>` },
  archive:    { label: "الأرشيف",          sub: "سجلات المواسم السابقة",            icon: `<rect x="2" y="3" width="20" height="4" rx="2"/><path d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7"/><path d="M10 12h4"/>` },
  users:      { label: "الإعدادات",        sub: "إعدادات وبيانات الحملة",           icon: `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>` },
  finance:    { label: "الحسابات المالية", sub: "مدفوعات وحسابات الحجاج",          icon: `<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>` },
  admins:     { label: "الإداريون",        sub: "إدارة فريق الحملة",               icon: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/>` },
  scan:       { label: "مسح مستند",        sub: "استخراج بيانات جواز السفر",        icon: `<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>` },
};

function TopBar({ page, setPage, currentUser, onLogout }: {
  page: string;
  setPage: (p: string) => void;
  currentUser: User;
  onLogout: () => void;
}) {
  const config  = useConfig();
  const primary = config.color_primary || "#7D1F3C";
  const meta    = PAGE_META[page] || { label: page, sub: "", icon: "" };
  const initials = currentUser.name.trim().split(" ").map((w: string) => w[0]).slice(0, 2).join("");

  const [showThemes, setShowThemes]     = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const themeRef = useRef<HTMLDivElement>(null);
  const userRef  = useRef<HTMLDivElement>(null);
  const [themePos, setThemePos] = useState({ top: 0, left: 0 });
  const [userPos,  setUserPos]  = useState({ top: 0, left: 0 });

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) setShowThemes(false);
      if (userRef.current  && !userRef.current.contains(e.target as Node))  setShowUserMenu(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const openTheme = () => {
    if (themeRef.current) {
      const r = themeRef.current.getBoundingClientRect();
      setThemePos({ top: r.bottom + 6, left: r.right - 220 });
    }
    setShowThemes(s => !s);
    setShowUserMenu(false);
  };

  const openUser = () => {
    if (userRef.current) {
      const r = userRef.current.getBoundingClientRect();
      setUserPos({ top: r.bottom + 6, left: r.right - 200 });
    }
    setShowUserMenu(s => !s);
    setShowThemes(false);
  };

  const btnStyle: React.CSSProperties = {
    width: 32, height: 32, borderRadius: 8,
    background: "rgba(255,255,255,.15)", border: "none",
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
    color: "rgba(255,255,255,.9)", flexShrink: 0, transition: "background .15s",
  };

  return (
    <>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 16px",
        height: 44,
        background: `linear-gradient(135deg,${primary},${primary}cc)`,
        flexShrink: 0,
        boxShadow: `0 2px 12px ${primary}44`,
        position: "relative", overflow: "hidden",
        zIndex: 10,
      }}>
        {/* خلفية pattern خفيفة */}
        <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(45deg,rgba(255,255,255,.03) 0px,rgba(255,255,255,.03) 1px,transparent 1px,transparent 8px)", pointerEvents: "none" }} />

        {/* اسم الصفحة + أيقونة */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative", zIndex: 1 }}>
          {meta.icon && (
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(255,255,255,.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" dangerouslySetInnerHTML={{ __html: meta.icon }} />
            </div>
          )}
          <div>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 15, fontWeight: 700, color: "white", lineHeight: 1.1 }}>{meta.label}</div>
            {meta.sub && <div style={{ fontSize: 9, color: "rgba(255,255,255,.6)", marginTop: 1 }}>{meta.sub}</div>}
          </div>
        </div>

        {/* الأيقونات على اليسار */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, position: "relative", zIndex: 1 }}>
          {/* الجرس */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <NotificationBell />
          </div>

          {/* تغيير الثيم */}
          <div ref={themeRef} style={{ position: "relative", flexShrink: 0 }}>
            <button style={btnStyle} onClick={openTheme}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,.25)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,.15)")}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
              </svg>
            </button>
          </div>

          {/* الإعدادات */}
          <button style={btnStyle} onClick={() => setPage("users")}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,.25)")}
            onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,.15)")}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>

          {/* المستخدم */}
          <div ref={userRef} style={{ position: "relative", flexShrink: 0 }}>
            <div onClick={openUser} style={{ display: "flex", alignItems: "center", gap: 7, padding: "3px 8px 3px 6px", background: "rgba(255,255,255,.15)", borderRadius: 8, cursor: "pointer", border: "1px solid rgba(255,255,255,.2)", transition: "background .15s" }}
              onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,.25)"}
              onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,.15)"}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: "linear-gradient(135deg,#c8a24b,#8a6a22)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: "white", flexShrink: 0 }}>
                {initials}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "white", lineHeight: 1 }}>{currentUser.name.split(" ")[0]}</div>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth="2" style={{ transform: showUserMenu ? "rotate(180deg)" : "none", transition: "transform .2s" }}><polyline points="6 9 12 15 18 9"/></svg>
            </div>
          </div>
        </div>
      </div>

      {/* قائمة الثيمات */}
      {showThemes && (
        <div style={{ position: "fixed", top: themePos.top, left: themePos.left, zIndex: 9999, background: "var(--bg-card)", borderRadius: 12, boxShadow: "var(--shadow-xl)", border: "1px solid var(--border)", minWidth: 220, padding: 8, maxHeight: "80vh", overflowY: "auto" }}>
          <ThemeSwitcher />
        </div>
      )}

      {/* قائمة المستخدم */}
      {showUserMenu && (
        <div style={{ position: "fixed", top: userPos.top, left: userPos.left, zIndex: 9999, background: "var(--bg-card)", borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.25)", border: "1px solid var(--border)", minWidth: 200, overflow: "hidden" }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: `linear-gradient(135deg,${primary},${primary}99)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#fff", flexShrink: 0 }}>{initials}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{currentUser.name.split(" ").slice(0, 2).join(" ")}</div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 1 }}>@{currentUser.username}</div>
            </div>
          </div>
          <button onClick={() => { setShowUserMenu(false); onLogout(); }}
            style={{ width: "100%", padding: "11px 14px", display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", color: "#C62828", fontSize: 12, fontWeight: 600, fontFamily: "var(--font-body)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            تسجيل الخروج
          </button>
        </div>
      )}
    </>
  );
}

export { TopBar };
