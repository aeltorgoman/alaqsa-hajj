import { useState } from "react";
import { useConfig } from "../config/ConfigContext";
import { ThemeSwitcher } from "../config/ThemeContext";
import type { User } from "../types";
import { NAV } from "../utils";

function Sidebar({ page, setPage, count, currentUser, onLogout, onReportsClick }: { page: string; setPage: (p: string) => void; count: number; currentUser: User; onLogout: () => void; onReportsClick?: () => void }) {
  const config = useConfig();
  const [showThemes, setShowThemes] = useState(false);

  const NAV_ICONS: Record<string, string> = {
    dash: `<path d="M3 11l9-8 9 8M5 10v10h14V10"/>`,
    passengers: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
    buses: `<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="15" cy="18" r="2"/>`,
    flights: `<path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>`,
    mina: `<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>`,
    arafa: `<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>`,
    hotel: `<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>`,
    reports: `<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>`,
    archive: `<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v11h14V9M10 13h4"/>`,
    users: `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`,
    scan: `<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/>`,
    admins: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 11v6"/><path d="M19 14h6"/>`,
  };

  return (
    <div style={{ width: "var(--sidebar-width)", background: "var(--bg-sidebar)", borderLeft: "0.5px solid var(--border-sidebar)", display: "flex", flexDirection: "column", flexShrink: 0, height: "100%", overflow: "hidden", position: "relative" }}>
      {/* ===== البانر العلوي مع اللوجو المتداخل ===== */}
      <div style={{ position: "relative", flexShrink: 0, height: 160, overflow: "hidden" }}>
        {/* صورة الكعبة / البانر */}
        {config.banner_image_url ? (
          <img src={config.banner_image_url} alt="banner" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", background: `linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 100%)` }} />
        )}
        {/* overlay تدرج سفلي */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.55) 100%)" }} />
        {/* نقوش */}
        <div className="sidebar-pattern" style={{ position: "absolute", inset: 0, opacity: 0.4 }} />
        {/* اللوجو متداخل فوق الصورة */}
        <div style={{ position: "absolute", bottom: 14, right: 0, left: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, zIndex: 3 }}>
          {config.logo_url ? (
            <img src={config.logo_url} alt={config.name_ar} style={{ width: 60, height: 60, borderRadius: "50%", objectFit: "cover", border: "2.5px solid rgba(212,160,23,0.7)", boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }} />
          ) : (
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(255,255,255,0.12)", border: "2px solid rgba(212,160,23,0.6)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }}>
              <svg width="28" height="28" viewBox="0 0 44 44" fill="none" stroke="var(--accent)" strokeWidth="1.6"><path d="M22 3 L26.5 8.5 L33.5 8 L33 15 L38.5 19.5 L33 24 L33.5 31 L26.5 30.5 L22 36 L17.5 30.5 L10.5 31 L11 24 L5.5 19.5 L11 15 L10.5 8 L17.5 8.5 Z"/><circle cx="22" cy="19.5" r="4.5" fill="var(--accent)" stroke="none"/></svg>
            </div>
          )}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 15, color: "#fff", lineHeight: 1.2, textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>{config.name_ar}</div>
            <div style={{ fontSize: 10, color: "rgba(212,172,79,0.9)", marginTop: 2, textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>{config.tagline}</div>
          </div>
        </div>
      </div>
      <div style={{ position: "relative", zIndex: 2, flex: 1, overflowY: "auto", padding: "10px 12px" }}>
        {NAV.map(({ section, items }) => {
          const allowed = items.filter(it => !it.perm || currentUser.permissions?.[it.perm]);
          if (allowed.length === 0) return null;
          return (
            <div key={section}>
              <div style={{ fontSize: 11, color: "var(--text-sidebar-muted)", padding: "8px 10px 4px", letterSpacing: "0.08em" }}>{section}</div>
              {allowed.map(({ id, label }) => (
                <div key={id} onClick={() => { setPage(id); if (id === "reports") onReportsClick?.(); }} style={{ display: "flex", alignItems: "center", gap: 11, padding: "7px 12px", borderRadius: "var(--radius-md)", fontSize: 13, fontWeight: 500, color: page === id ? "var(--text-inverse)" : "var(--text-sidebar)", cursor: "pointer", marginBottom: 1, position: "relative", background: page === id ? "linear-gradient(90deg,rgba(200,162,75,0.22),rgba(200,162,75,0.05))" : "transparent", transition: "var(--transition)" }}>
                  {page === id && <div style={{ position: "absolute", insetInlineStart: 0, top: "18%", bottom: "18%", width: 3, borderRadius: 99, background: "var(--accent)" }} />}
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={page === id ? "var(--accent-light)" : "var(--text-sidebar)"} strokeWidth="1.7" style={{ flexShrink: 0, opacity: page === id ? 1 : 0.85 }} dangerouslySetInnerHTML={{ __html: NAV_ICONS[id] || NAV_ICONS.dash }} />
                  {label}
                  {id === "passengers" && count > 0 && (
                    <span style={{ marginInlineStart: "auto", background: "rgba(212,172,79,0.2)", color: "var(--accent-light)", fontSize: 11, fontWeight: 700, padding: "1px 9px", borderRadius: 99 }}>{count}</span>
                  )}
                </div>
              ))}
            </div>
          );
        })}
        <div style={{ borderTop: "1px solid var(--border-sidebar)", marginTop: 8 }}>
          <div onClick={() => setShowThemes(!showThemes)} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: "var(--radius-md)", fontSize: 14, color: "var(--text-sidebar-muted)", cursor: "pointer", transition: "var(--transition)", marginTop: 4 }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18"/><path d="M3 12h18"/></svg>
            المظهر
            <span style={{ marginInlineStart: "auto", fontSize: 10 }}>{showThemes ? "▲" : "▼"}</span>
          </div>
          {showThemes && <ThemeSwitcher />}
        </div>
      </div>
      <div style={{ padding: "10px 12px", borderTop: "1px solid var(--border-sidebar)", flexShrink: 0 }}>
        <button onClick={onLogout} style={{ width: "100%", background: "rgba(228,108,108,0.14)", color: "rgba(255,200,200,0.9)", border: "none", padding: "7px 0", borderRadius: "var(--radius-sm)", fontSize: 12, fontFamily: "var(--font-body)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "var(--transition)" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          تسجيل خروج
        </button>
      </div>
    </div>
  );
}

export { Sidebar };
