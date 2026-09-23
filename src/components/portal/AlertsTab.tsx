/* ═══ تبويبُ التنبيهات ═══
   بطاقةُ تفعيل التنبيهات بحالاتها الأربع، ثمّ قائمةُ تنبيهات
   الموسم. لا تشترك في الدفع ولا تُلغيه — الأفعالُ تصل من الأب،
   فتبقى معماريّةُ الدفع كما هي. */
import { Icon, ICONS } from "./PortalIcons";
import { INK, BODY, LABEL, MUTED, LINE, type PortalTheme } from "./portal.theme";
import { cardStyle } from "./portal.styles";
import type { PushState } from "../../utils/pushClient";
import type { Ann } from "./portal.types";

type Props = {
  t: PortalTheme;
  pushState: PushState; pushBusy: boolean; pushNote: string; pushDismissed: boolean;
  onPushOn: () => void; onPushOff: () => void; onDismissPush: () => void;
  announcements: Ann[];
};

export function AlertsTab({
  t, pushState, pushBusy, pushNote, pushDismissed,
  onPushOn, onPushOff, onDismissPush, announcements,
}: Props) {
  return (
    <>

          {/* ── بطاقة تفعيل التنبيهات ── */}
          {pushState === "enabled" ? (
            <div style={{ ...cardStyle, padding: "15px 17px", display: "flex", alignItems: "center", gap: 13 }}>
              <div style={{ width: 44, height: 44, borderRadius: 14, background: "#e6f4ec", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon d={ICONS.bell} size={24} color="#1c6b45" sw={2} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: INK }}>التنبيهات مفعّلة</div>
                <div style={{ fontSize: 14, color: BODY, marginTop: 3 }}>سيصلك كل جديد عن رحلتك على هذا الجهاز.</div>
              </div>
              <button onClick={onPushOff} disabled={pushBusy}
                style={{ background: "none", border: `1.5px solid ${LINE}`, color: BODY, borderRadius: 99, fontSize: 14, fontWeight: 700, padding: "0 16px", minHeight: 44, cursor: "pointer", fontFamily: t.fontD, flexShrink: 0 }}>
                إيقاف
              </button>
            </div>
          ) : pushState === "denied" ? (
            <div style={{ ...cardStyle, padding: "17px 19px", borderRight: `5px solid ${t.gold}` }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: INK }}>التنبيهات موقوفة من إعدادات الجهاز</div>
              <div style={{ fontSize: 15, color: BODY, marginTop: 8, lineHeight: 2 }}>
                لإعادة تفعيلها: افتح إعدادات المتصفح، ثم إعدادات الموقع، ثم فعّل الإشعارات لهذه الصفحة.
              </div>
            </div>
          ) : pushState === "ios-needs-install" && !pushDismissed ? (
            <div style={{ ...cardStyle, padding: "19px 19px 17px", border: `2px solid ${t.gold}` }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: INK, marginBottom: 4 }}>فعّل تنبيهات الحملة</div>
              <div style={{ fontSize: 15, color: BODY, lineHeight: 2, marginBottom: 15 }}>
                لتصلك التنبيهات على هذا الجهاز، اتبع الخطوات الثلاث مرة واحدة:
              </div>
              {[
                "اضغط زر المشاركة في أسفل المتصفح.",
                "اختر «إضافة إلى الشاشة الرئيسية».",
                "افتح البوابة من الأيقونة الجديدة، ثم فعّل التنبيهات.",
              ].map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 11 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: t.goldBright, color: t.brandDeep, fontWeight: 900, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: t.fontD }}>{i + 1}</div>
                  <div style={{ fontSize: 15.5, color: INK, lineHeight: 1.9, paddingTop: 4 }}>{s}</div>
                </div>
              ))}
              <div style={{ fontSize: 14, color: LABEL, marginTop: 13, lineHeight: 1.9 }}>
                يمكنك طلب المساعدة من موظف الحملة لإتمام هذه الخطوات.
              </div>
              <button onClick={onDismissPush}
                style={{ background: "none", border: "none", color: BODY, fontSize: 14, fontWeight: 700, marginTop: 12, cursor: "pointer", fontFamily: t.fontD, textDecoration: "underline", padding: "8px 4px", minHeight: 44 }}>
                إخفاء هذه الرسالة
              </button>
            </div>
          ) : pushState === "available" && !pushDismissed ? (
            <div style={{ ...cardStyle, padding: "22px 19px", textAlign: "center", border: `2px solid ${t.gold}` }}>
              <div style={{ width: 66, height: 66, borderRadius: "50%", background: t.brand, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 13px" }}>
                <Icon d={ICONS.bell} size={32} color={t.goldBright} sw={1.8} />
              </div>
              <div style={{ fontSize: 21, fontWeight: 800, color: INK, marginBottom: 8 }}>تنبيهات الحملة</div>
              <div style={{ fontSize: 15.5, color: BODY, lineHeight: 2 }}>
                فعّل التنبيهات ليصلك كل جديد عن رحلتك أولاً بأول: موعد الطيران، رقم غرفتك، باصك، ومخيمك.
              </div>
              <button onClick={onPushOn} disabled={pushBusy}
                style={{ width: "100%", marginTop: 17, background: t.brand, color: "#fff", border: "none", borderRadius: 16, padding: "16px", fontSize: 18, fontWeight: 900, cursor: pushBusy ? "default" : "pointer", fontFamily: t.fontD, opacity: pushBusy ? 0.6 : 1 }}>
                {pushBusy ? "جارٍ التفعيل..." : "تفعيل التنبيهات"}
              </button>
              <button onClick={onDismissPush}
                style={{ background: "none", border: "none", color: BODY, fontSize: 14.5, fontWeight: 700, marginTop: 12, cursor: "pointer", fontFamily: t.fontD, textDecoration: "underline", padding: "8px 4px", minHeight: 44 }}>
                ليس الآن
              </button>
              <div style={{ fontSize: 13.5, color: LABEL, marginTop: 14, lineHeight: 1.8 }}>
                لن تصلك أي رسائل إعلانية — تنبيهات الحملة فقط.
              </div>
            </div>
          ) : null}

          {pushNote && (
            <div style={{ ...cardStyle, padding: "13px 16px", fontSize: 15, fontWeight: 700, color: INK }}>{pushNote}</div>
          )}

          {announcements.length === 0 && (
            <div style={{ ...cardStyle, textAlign: "center", padding: 34 }}>
              <Icon d={ICONS.bell} size={40} color={MUTED} sw={1.5} />
              <div style={{ fontSize: 16, fontWeight: 700, color: BODY, marginTop: 12 }}>لا توجد تنبيهات حالياً</div>
            </div>
          )}
          {announcements.map(a => (
            <div key={a.id} style={{ ...cardStyle, borderRight: `5px solid ${a.priority === "عاجل" ? t.brand : a.priority === "مهم" ? t.gold : LINE}`, padding: "15px 17px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: LABEL, fontWeight: 700 }}>{new Date(a.show_at).toLocaleString("ar-EG", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })}</span>
                {a.priority !== "عام" && <span style={{ fontSize: 13, fontFamily: t.fontD, background: a.priority === "عاجل" ? t.brand : t.goldBright, color: a.priority === "عاجل" ? "#fff" : t.brandDeep, padding: "4px 15px", borderRadius: 99, fontWeight: 900 }}>{a.priority}</span>}
              </div>
              <div style={{ fontSize: 19, color: INK, fontWeight: 700, marginTop: 9, lineHeight: 2 }}>{a.body}</div>
            </div>
          ))}
    </>
  );
}
