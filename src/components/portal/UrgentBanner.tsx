/* ═══ بانرُ التنبيه العاجل ═══
   مسؤوليّتان متلازمتان لا تُفصلان: عرضُ أعجلِ تنبيهٍ لم يُؤكَّد،
   و**إعلانُ ارتفاعه الحقيقيّ** لمن يحجز له مكاناً.

   ⚠️ الارتفاعُ يُقاس ولا يُقدَّر. كان المحجوز رقماً ثابتاً (١٣٠px)
   والبانرُ بسطرين يبلغ ١٧٦px عند ٣٦٠px فيغطّي اسمَ الحملة. والنصُّ
   من الإدارة فطولُه غيرُ معلومٍ سلفاً: لا رقمَ ثابتٌ يصحّ هنا.
   فالمرجعُ بدالّة و`ResizeObserver` — منقولان كما هما. */
import { useCallback, useRef } from "react";
import { Icon, ICONS } from "./PortalIcons";
import type { PortalTheme } from "./portal.theme";
import type { Ann } from "./portal.types";

type Props = {
  t: PortalTheme;
  urgentUnacked: Ann[];
  onAck: (id: number) => void;
  onHeight: (h: number) => void;
};

export function UrgentBanner({ t, urgentUnacked, onAck, onHeight }: Props) {
  const ro = useRef<ResizeObserver | null>(null);
  /* مرجعٌ بدالّة لا أثرٌ بلا تبعيّات: القياسُ يقع عند تعليق العنصر
     وعند كلّ تغيّرِ مقاسٍ بعده (نصٌّ أطول، دورانُ الشاشة، تنبيهٌ
     جديد) — و`ResizeObserver` يغطّي تغيّر عرض النافذة أصلاً. */
  const bannerRef = useCallback((el: HTMLDivElement | null) => {
    ro.current?.disconnect();
    ro.current = null;
    if (!el) { onHeight(0); return; }
    const measure = () => onHeight(el.getBoundingClientRect().height);
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    ro.current = obs;
  }, [onHeight]);

  if (!urgentUnacked.length) return null;
  const a = urgentUnacked[0];
  return (
    <div ref={bannerRef} style={{ position: "fixed", top: 0, right: 0, left: 0, zIndex: 100, background: `linear-gradient(135deg,#A31212,#7A0D0D)`, color: "#fff", padding: "16px 16px calc(16px + env(safe-area-inset-top))", boxShadow: "0 8px 30px rgba(0,0,0,.4)", borderBottom: `3px solid ${t.goldBright}`, maxHeight: "72dvh", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, maxWidth: 560, margin: "0 auto" }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(255,255,255,.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon d={ICONS.warn} size={24} color={t.goldBright} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: t.fontD, fontSize: 15, fontWeight: 900, color: t.goldBright, marginBottom: 4 }}>تنبيه عاجل من إدارة الحملة</div>
          <div style={{ fontSize: 15.5, fontWeight: 700, lineHeight: 1.9 }}>{a.body}</div>
          <button onClick={() => onAck(a.id)}
            style={{ marginTop: 12, border: "none", background: t.goldBright, color: "#5a0a0a", fontFamily: t.fontD, fontWeight: 900, fontSize: 18, padding: "13px 40px", borderRadius: 12, cursor: "pointer" }}>
            فهمت
          </button>
          {urgentUnacked.length > 1 && <span style={{ fontSize: 12, fontWeight: 700, marginInlineStart: 12, color: "rgba(255,255,255,.8)" }}>+{urgentUnacked.length - 1} تنبيه عاجل آخر</span>}
        </div>
      </div>
    </div>
  );
}
