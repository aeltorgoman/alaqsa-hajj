import type { User } from "../types";
import { NAV_LAYOUT, NAV_PAGES, NAV_ICON, canAccessPage, type PageId } from "../navigation/nav";
import { useSeason } from "../season/useSeason";

type Props = {
  page: string;
  setPage: (p: string) => void;
  count: number;
  currentUser: User;
  onReportsClick?: () => void;
  /** وضعُ الأيقونات (سطح المكتب) — يختاره المستخدم ولا يتغيّر بتغيّر الصفحة */
  compact: boolean;
  onToggleCompact?: () => void;
  /** درجُ الجوّال: يُغلَق بعد اختيار وجهة */
  drawer?: boolean;
  onNavigate?: () => void;
};

function Svg({ html, size = 19, active }: { html: string; size?: number; active?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"
      stroke={active ? "var(--accent-light)" : "var(--text-sidebar)"} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, opacity: active ? 1 : 0.85 }} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

/* سياقُ الموسم — معلومةٌ أوّلاً. يُظهر الموسمَ المعروض، ويقول بهدوءٍ إنه
   النشط، أو بوضوحٍ إنه مؤرشَفٌ للعرض فقط. ينقل إلى «إدارة المواسم» لمن
   يملك صلاحيتَها وحدَه؛ ولغيره يبقى نصّاً. لا مُبدِّلَ مواسم هنا — التبديلُ
   مكانُه صفحةُ إدارة المواسم، والعودةُ للنشط في شريط الموسم أعلى الصفحة. */
function SeasonContextCard({ compact, canOpen, onOpen }: { compact: boolean; canOpen: boolean; onOpen: () => void }) {
  const { viewedSeason, readOnly } = useSeason();
  const status = readOnly ? "موسم مؤرشَف — للعرض فقط" : "الموسم النشط";
  const full = `${viewedSeason.name} · ${status}`;
  const dot = readOnly ? "var(--warning, #E8951A)" : "var(--success, #2A9D8F)";

  const body = compact ? (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <Svg html={NAV_ICON.calendar} />
      <span style={{ position: "absolute", top: -2, left: -3, width: 8, height: 8, borderRadius: 99, background: dot, boxShadow: "0 0 0 2px var(--bg-sidebar)" }} />
    </span>
  ) : (
    <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3, minWidth: 0, textAlign: "start" }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-sidebar-muted)", letterSpacing: ".5px" }}>الموسم</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-inverse)", overflowWrap: "anywhere", lineHeight: 1.35 }}>{viewedSeason.name}</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: readOnly ? 700 : 500, color: readOnly ? "var(--accent-light)" : "var(--text-sidebar-muted)" }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: dot, flexShrink: 0 }} />
        {status}
      </span>
    </span>
  );

  const style: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: compact ? "center" : "flex-start", width: "100%",
    padding: compact ? "8px 0" : "9px 11px", marginBottom: 6, borderRadius: "var(--radius-md)",
    background: readOnly ? "rgba(232,149,26,0.14)" : "rgba(255,255,255,0.05)",
    border: `1px solid ${readOnly ? "rgba(232,149,26,0.45)" : "rgba(255,255,255,0.08)"}`,
    color: "inherit", fontFamily: "inherit", boxSizing: "border-box",
  };

  return canOpen ? (
    <button type="button" className="nav-focus" onClick={onOpen} title={compact ? full : "إدارة المواسم"}
      aria-label={`${full} — فتح إدارة المواسم`} style={{ ...style, cursor: "pointer" }}>
      {body}
    </button>
  ) : (
    <div role="status" title={compact ? full : undefined} aria-label={full} style={style}>{body}</div>
  );
}

function Sidebar({ page, setPage, count, currentUser, onReportsClick, compact, onToggleCompact, drawer, onNavigate }: Props) {
  const go = (id: PageId) => {
    setPage(id);
    if (id === "reports") onReportsClick?.();
    onNavigate?.();
  };

  return (
    <div style={{ width: drawer ? "min(280px, 86vw)" : compact ? 56 : "var(--sidebar-width)", background: "var(--bg-sidebar)", borderLeft: "0.5px solid var(--border-sidebar)", display: "flex", flexDirection: "column", flexShrink: 0, height: "100%", overflow: "hidden", position: "relative", transition: "width .2s ease" }}>
      <div className="sidebar-pattern" />
      <nav aria-label="التنقّل الرئيسي" style={{ position: "relative", zIndex: 2, flex: 1, overflowY: "auto", overflowX: "hidden", padding: compact ? "10px 6px" : "10px 12px" }}>
        <SeasonContextCard compact={compact} canOpen={canAccessPage(currentUser, "archive")} onOpen={() => go("archive")} />
        {NAV_LAYOUT.map(({ section, items }, gi) => {
          const allowed = items.filter(id => canAccessPage(currentUser, id));
          if (allowed.length === 0) return null;
          return (
            <div key={section ?? `g${gi}`} role="group" aria-label={section}>
              {section && !compact && <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-sidebar-muted)", letterSpacing: "1px", padding: "12px 8px 4px", textAlign: "start" }}>{section}</div>}
              {(section || gi > 0) && compact && <div aria-hidden="true" style={{ height: 1, margin: "6px 8px", background: "rgba(255,255,255,0.1)" }} />}
              {!section && gi > 0 && !compact && <div aria-hidden="true" style={{ height: 1, margin: "8px 8px", background: "rgba(255,255,255,0.08)" }} />}
              {allowed.map(id => {
                const { label, icon } = NAV_PAGES[id];
                const active = page === id;
                const badge = id === "passengers" && count > 0;
                return (
                  <button type="button" key={id} className="nav-item" onClick={() => go(id)}
                    aria-current={active ? "page" : undefined}
                    aria-label={badge ? `${label} (${count})` : label}
                    title={compact ? label : undefined}
                    style={{ display: "flex", alignItems: "center", width: "100%", gap: compact ? 0 : 11, padding: compact ? "8px 0" : "7px 12px", border: "none", borderRadius: "var(--radius-md)", fontFamily: "inherit", fontSize: 13, fontWeight: 500, textAlign: "start", color: active ? "var(--text-inverse)" : "var(--text-sidebar)", cursor: "pointer", marginBottom: 1, position: "relative", background: active ? "linear-gradient(90deg,rgba(200,162,75,0.22),rgba(200,162,75,0.05))" : "transparent", transition: "var(--transition)", justifyContent: compact ? "center" : "flex-start" }}>
                    {active && <span aria-hidden="true" style={{ position: "absolute", right: 0, top: "20%", bottom: "20%", width: 3, background: "var(--accent)", borderRadius: "0 3px 3px 0" }} />}
                    <Svg html={icon} active={active} />
                    {!compact && <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>}
                    {!compact && badge && (
                      <span style={{ marginInlineStart: "auto", background: "rgba(212,172,79,0.2)", color: "var(--accent-light)", fontSize: 11, fontWeight: 700, padding: "1px 9px", borderRadius: 99 }}>{count}</span>
                    )}
                    {compact && badge && (
                      <span style={{ position: "absolute", top: 2, left: 2, background: "var(--accent)", color: "white", fontSize: 9, fontWeight: 700, padding: "0 4px", borderRadius: 99, minWidth: 16, textAlign: "center" }}>{count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>
      {onToggleCompact && (
        <div style={{ position: "relative", zIndex: 2, padding: compact ? "8px 6px" : "8px 12px", borderTop: "0.5px solid var(--border-sidebar)" }}>
          <button type="button" className="nav-item" onClick={onToggleCompact}
            aria-label={compact ? "توسيع القائمة الجانبية" : "طيّ القائمة الجانبية"} aria-expanded={!compact}
            title={compact ? "توسيع القائمة" : undefined}
            style={{ display: "flex", alignItems: "center", justifyContent: compact ? "center" : "flex-start", gap: 10, width: "100%", padding: compact ? "8px 0" : "7px 12px", border: "none", borderRadius: "var(--radius-md)", background: "transparent", color: "var(--text-sidebar-muted)", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            {/* RTL: القائمةُ على اليمين — السهمُ يشير إلى اليمين للطيّ، وإلى اليسار للتوسيع */}
            <Svg size={17} html={compact ? '<polyline points="15 18 9 12 15 6"/>' : '<polyline points="9 18 15 12 9 6"/>'} />
            {!compact && "طيّ القائمة"}
          </button>
        </div>
      )}
    </div>
  );
}

export { Sidebar };
