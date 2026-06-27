import type { User } from "../types";
import { NAV, NAV_ICONS } from "../utils";

function Sidebar({ page, setPage, count, currentUser, onReportsClick }: { page: string; setPage: (p: string) => void; count: number; currentUser: User; onLogout?: () => void; onReportsClick?: () => void }) {

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

    </div>
  );
}

export { Sidebar };
