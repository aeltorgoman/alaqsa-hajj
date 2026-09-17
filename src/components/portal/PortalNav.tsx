/* ═══ الشريطُ السفليّ ═══
   ثلاثةُ تبويبات ونقطةُ «جديد». ⚠️ والشارةُ على **أكبر مُعرَّفٍ رآه
   الحاجّ** لا على عدد العناصر: العددُ يتناقص وحده حين ينتهي تنبيه،
   فيصير الفرقُ سالباً أو يبتلع جديداً. */
import { Icon, ICONS } from "./PortalIcons";
import { LABEL, LINE, type PortalTheme } from "./portal.theme";
import type { Ann } from "./portal.types";

export type TabId = "trip" | "stay" | "alerts";

type Props = {
  t: PortalTheme;
  tab: TabId;
  setTab: (id: TabId) => void;
  showNotifications: boolean;
  unread: number;
  announcements: Ann[];
  seenAlerts: number;
  setSeenAlerts: (n: number) => void;
};

export function PortalNav({ t, tab, setTab, showNotifications, unread, announcements, seenAlerts, setSeenAlerts }: Props) {
  return (
      <div style={{ position: "fixed", bottom: 0, right: 0, left: 0, background: "#fff", borderTop: `1px solid ${LINE}`, boxShadow: "0 -5px 24px rgba(93,16,41,.1)", display: "flex", padding: "10px 10px calc(10px + env(safe-area-inset-bottom))", zIndex: 50 }}>
        {[
          { id: "trip", label: "رحلتي", icon: ICONS.plane },
          { id: "stay", label: "سكني", icon: ICONS.home },
          { id: "alerts", label: "التنبيهات", icon: ICONS.bell },
        ].filter(item => item.id !== "alerts" || showNotifications).map(item => {
          const on = tab === item.id;
          return (
            <button key={item.id} onClick={() => { setTab(item.id as TabId); if (item.id === "alerts") { const top = announcements.reduce((m, a) => Math.max(m, a.id), seenAlerts); setSeenAlerts(top); localStorage.setItem("portal_seen_alerts", String(top)); } }}
              style={{ flex: 1, border: "none", background: on ? `${t.brand}15` : "none", borderRadius: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, fontFamily: t.fontD, fontSize: 16, fontWeight: on ? 900 : 700, color: on ? t.brand : LABEL, cursor: "pointer", padding: "11px 0 9px", position: "relative", margin: "0 3px", transition: "background .2s,color .2s" }}>
              <Icon d={item.icon} size={26} color={on ? t.brand : LABEL} sw={on ? 2.4 : 1.9} />
              {item.label}
              {item.id === "alerts" && unread > 0 && <span style={{ position: "absolute", top: 7, left: "calc(50% - 24px)", width: 12, height: 12, borderRadius: "50%", background: "#C1121F", border: "2.5px solid #fff" }} />}
            </button>
          );
        })}
      </div>
  );
}
