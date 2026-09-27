import { useState, useEffect, useRef } from "react";
import { useCompanyBranding } from "../company/CompanyContext";
import { ThemeSwitcher } from "../config/ThemeContext";
import { NotificationBell } from "./NotificationBell";
import type { User } from "../types";
import { NAV_PAGES, canAccessPage, pageMeta, type PageId } from "../navigation/nav";

/* قائمةُ ⚙ — وجهاتٌ من مصدر التنقّل، مُصفّاةٌ بالصلاحية */
const QUICK_PAGES: PageId[] = ["users", "finance", "admins"];


function TopBar({ page, setPage, currentUser, onLogout, onOpenNav }: {
  page: string;
  setPage: (p: string) => void;
  currentUser: User;
  onLogout: () => void;
  /** على العرض الضيّق: زرُّ فتح درج التنقّل */
  onOpenNav?: () => void;
}) {
  const primary = useCompanyBranding().primaryColor;
  const meta    = pageMeta(page);
  const quickPages = QUICK_PAGES.filter(id => canAccessPage(currentUser, id)).map(id => NAV_PAGES[id]);
  const initials = currentUser.name.trim().split(" ").map((w: string) => w[0]).slice(0, 2).join("");

  const [showThemes,   setShowThemes]   = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [themePos, setThemePos] = useState({ top: 0, left: 0 });
  const [userPos,  setUserPos]  = useState({ top: 0, left: 0 });
  const themeRef = useRef<HTMLDivElement>(null);
  const userRef  = useRef<HTMLDivElement>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [settingsPos, setSettingsPos] = useState({ top: 0, left: 0 });
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) setShowThemes(false);
      if (userRef.current  && !userRef.current.contains(e.target as Node))  setShowUserMenu(false);
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setShowSettings(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  /* ── نفس iconBtn بالظبط من DashboardBanner ── */
  const iconBtn: React.CSSProperties = {
    width: 32, height: 32, borderRadius: 8,
    background: "rgba(0,0,0,.3)", border: "1px solid rgba(255,255,255,.15)",
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", flexShrink: 0, position: "relative",
  };

  return (
    <>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 16px", height: 46, flexShrink: 0,
        background: "linear-gradient(135deg,var(--primary),var(--em8))",
        boxShadow: "0 2px 12px rgba(0,0,0,.2)",
        /* إزالة overflow:hidden لكي تظهر القوائم المنسدلة فوق محتوى الصفحة */
        position: "relative", zIndex: 50,
      }}>
        {/* pattern خلفية خفيف */}
        <div style={{ position:"absolute", inset:0, background:"repeating-linear-gradient(45deg,rgba(255,255,255,.03) 0px,rgba(255,255,255,.03) 1px,transparent 1px,transparent 8px)", pointerEvents:"none" }} />

        {/* اسم الصفحة */}
        <div style={{ display:"flex", alignItems:"center", gap:10, position:"relative", zIndex:1, minWidth:0 }}>
          {onOpenNav && (
            <button type="button" className="nav-menu-btn" onClick={onOpenNav} aria-label="فتح القائمة" style={{ ...iconBtn, color:"white" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
          )}
          {meta.icon && (
            <div style={{ ...iconBtn, background:"rgba(255,255,255,.15)", border:"none" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="1.8" strokeLinecap="round" dangerouslySetInnerHTML={{ __html: meta.icon }} />
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 18, fontWeight: 800, color: "white", lineHeight: 1 }}>{meta.label}</div>
            {meta.sub && <div style={{ fontSize: 10, color: "rgba(255,255,255,.55)", paddingTop: 1 }}>{meta.sub}</div>}
          </div>
        </div>

        {/* الأيقونات — نفس الـ userStrip في DashboardBanner */}
        <div style={{ display:"flex", alignItems:"center", gap:4, position:"relative", zIndex:1 }}>

          {/* 1. إعدادات — تختفي إن لم يبقَ فيها وجهةٌ مسموحة */}
          {quickPages.length > 0 && (
          <div ref={settingsRef} style={{ position: "relative", flexShrink: 0 }}>
            <div style={iconBtn} onClick={() => {
              if (!showSettings && settingsRef.current) {
                const r = settingsRef.current.getBoundingClientRect();
                setSettingsPos({ top: r.bottom + 8, left: Math.max(8, r.left - 160 + r.width) });
              }
              setShowSettings(s => !s);
              setShowThemes(false);
              setShowUserMenu(false);
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.85)" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </div>
            {showSettings && (
              <div style={{ position: "fixed", top: settingsPos.top, left: settingsPos.left, zIndex: 9999, background: "var(--bg-card)", borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,.25)", border: "1px solid var(--border)", minWidth: 200, overflow: "hidden" }}>
                <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--line)", fontSize: 10, fontWeight: 800, color: "var(--muted)", letterSpacing: ".5px" }}>الإعدادات</div>
                <div style={{ padding: 6 }}>
                  {quickPages.map(item => (
                    <button key={item.id} onClick={() => { setShowSettings(false); setPage(item.id); }}
                      style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "none", background: "transparent", color: "var(--ink)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)", display: "flex", alignItems: "center", gap: 8, textAlign: "right" }}
                      onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = "var(--ivory)"}
                      onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = "transparent"}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.7" strokeLinecap="round" dangerouslySetInnerHTML={{ __html: item.icon }} />
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          )}

          {/* 2. ثيم */}
          <div ref={themeRef} style={{ position:"relative", flexShrink:0 }}>
            <div style={iconBtn} onClick={() => {
              if (!showThemes && themeRef.current) {
                const r = themeRef.current.getBoundingClientRect();
                setThemePos({ top: r.bottom + 8, left: Math.max(8, r.left - 100 + r.width) });
              }
              setShowThemes(s => !s);
              setShowUserMenu(false);
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
              </svg>
            </div>
            {showThemes && (
              <div style={{ position:"fixed", top:themePos.top, left:themePos.left, zIndex:9999, background:"var(--bg-card)", borderRadius:12, boxShadow:"var(--shadow-xl)", border:"1px solid var(--border)", minWidth:220, padding:8, maxHeight:"80vh", overflowY:"auto" }}>
                <ThemeSwitcher />
              </div>
            )}
          </div>

          {/* 3. إشعارات */}
          <NotificationBell />

          {/* فاصل */}
          <div style={{ width:1, height:28, background:"rgba(255,255,255,.2)", margin:"0 4px" }} />

          {/* 4. المستخدم */}
          <div ref={userRef} style={{ position:"relative", flexShrink:0 }}>
            <div onClick={() => {
              if (!showUserMenu && userRef.current) {
                const r = userRef.current.getBoundingClientRect();
                setUserPos({ top: r.bottom + 8, left: Math.max(8, r.left - 160 + r.width) });
              }
              setShowUserMenu(s => !s);
              setShowThemes(false);
            }} style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", padding:"4px 8px", borderRadius:8, background:"rgba(0,0,0,.2)", border:"1px solid rgba(255,255,255,.15)" }}>
              <div style={{ width:28, height:28, borderRadius:"50%", background:primary, border:"2px solid rgba(212,172,79,.6)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"var(--font-heading)", fontSize:11, fontWeight:700, color:"#e7cd8a", flexShrink:0 }}>
                {initials}
              </div>
              <div style={{ fontSize:12, fontWeight:700, color:"#fff", lineHeight:1 }}>{currentUser.name.split(" ")[0]}</div>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="2" style={{ transition:"transform .2s", transform: showUserMenu ? "rotate(180deg)" : "rotate(0)" }}><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            {showUserMenu && (
              <div style={{ position:"fixed", top:userPos.top, left:userPos.left, zIndex:9999, background:"var(--bg-card)", borderRadius:12, boxShadow:"0 8px 32px rgba(0,0,0,0.25)", border:"1px solid var(--border)", minWidth:200, overflow:"hidden" }}>
                <div style={{ padding:"12px 14px", borderBottom:"1px solid var(--line)", display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:36, height:36, borderRadius:"50%", background:`linear-gradient(135deg,${primary},${primary}99)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:800, color:"#fff", flexShrink:0 }}>{initials}</div>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:"var(--ink)" }}>{currentUser.name.split(" ").slice(0,2).join(" ")}</div>
                    <div style={{ fontSize:10, color:"var(--muted)", marginTop:1 }}>@{currentUser.email}</div>
                  </div>
                </div>
                <div style={{ padding:6 }}>
                  <button onClick={() => { setShowUserMenu(false); onLogout(); }}
                    style={{ width:"100%", padding:"9px 12px", borderRadius:8, border:"none", background:"transparent", color:"#C62828", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"var(--font-body)", display:"flex", alignItems:"center", gap:8 }}
                    onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background="rgba(198,40,40,0.08)"}
                    onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background="transparent"}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    تسجيل الخروج
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export { TopBar };
