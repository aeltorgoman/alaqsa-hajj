import type { User } from "../types";
import { NAV, NAV_ICONS } from "../utils";

function Sidebar({ page, setPage, count, currentUser, onLogout, onReportsClick }: { page: string; setPage: (p: string) => void; count: number; currentUser: User; onLogout: () => void; onReportsClick?: () => void }) {

  return (
    <div style={{ width: "var(--sidebar-width)", background: "var(--bg-sidebar)", borderLeft: "0.5px solid var(--border-sidebar)", display: "flex", flexDirection: "column", flexShrink: 0, height: "100%", overflow: "hidden", position: "relative" }}>
      <div className="sidebar-pattern" />
      <div style={{ position: "relative", zIndex: 2, flex: 1, overflowY: "auto", padding: "10px 12px" }}>
        {NAV.map(({ section, items }) => {
          const allowed = items.filter(it => !it.perm || currentUser.permissions?.[it.perm]);
          if (allowed.length === 0) return null;
          return (
            <div key={section}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-sidebar-muted)", letterSpacing: "1px", padding: "10px 8px 4px", textTransform: "uppercase" }}>{section}</div>
              {allowed.map(({ id, label }) => (
                <div key={id} onClick={() => { setPage(id); if (id === "reports") onReportsClick?.(); }} style={{ display: "flex", alignItems: "center", gap: 11, padding: "7px 12px", borderRadius: "var(--radius-md)", fontSize: 13, fontWeight: 500, color: page === id ? "var(--text-inverse)" : "var(--text-sidebar)", cursor: "pointer", marginBottom: 1, position: "relative", background: page === id ? "linear-gradient(90deg,rgba(200,162,75,0.22),rgba(200,162,75,0.05))" : "transparent", transition: "var(--transition)" }}
                  onMouseEnter={e => { if (page !== id) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.06)"; }}
                  onMouseLeave={e => { if (page !== id) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}>
                  {page === id && <div style={{ position: "absolute", right: 0, top: "20%", bottom: "20%", width: 3, background: "var(--accent)", borderRadius: "0 3px 3px 0" }} />}
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

      </div>
      <div style={{ position: "relative", zIndex: 2, padding: "10px 12px", borderTop: "0.5px solid var(--border-sidebar)", flexShrink: 0 }}>
        <button onClick={onLogout} style={{ width: "100%", background: "rgba(228,108,108,0.14)", color: "rgba(255,200,200,0.9)", border: "none", padding: "7px 0", borderRadius: "var(--radius-sm)", fontSize: 12, fontFamily: "var(--font-body)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "var(--transition)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          تسجيل خروج
        </button>
      </div>
    </div>
  );
}

export { Sidebar };
