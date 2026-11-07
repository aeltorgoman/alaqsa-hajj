/* ═══ بطاقةُ الرحلة ═══
   عرضُ الرحلة المعروضة وحدَها. **لا تختار أيَّ رحلةٍ تُعرض** —
   الأبُ يختار (الذهابُ حتى يكتمل، ثمّ العودة) وتُمرَّر هنا جاهزة،
   فيبقى منطقُ الاختيار في موضعٍ واحد.

   ⚠️ والوصولُ في اليوم التالي يُعلَن صراحةً: كان يُعرض وقتُ وصولٍ
   بلا يومه، فتُقرأ ٠٢:٣٠ على أنّها اليوم نفسه.

   الهويّةُ المرئيّة من بطاقة صفحة الرحلات نفسِها (`flights/flightVisuals`):
   شعارُ الشركة من الملفّات المحلّيّة (وإلا الطائرةُ العامّة)، والطائرةُ تتقدّم
   على خطّ المسار من المغادرة (يميناً) إلى الوصول (يساراً)، وتسكن مع
   `prefers-reduced-motion`. ومتغيّراتُ لونها تُمرَّر من سمة البوّابة. */
import type { CSSProperties } from "react";
import { AirlineMark, RoutePlane, ROUTE_CSS } from "../flights/flightVisuals";
import { INK, LABEL, LINE, IVORY, type PortalTheme } from "./portal.theme";
import { fmtDateAr, dayGap } from "./portal.dates";
import type { FlightInfo } from "./portal.types";

export function FlightCard(
  { t, f, label }: { t: PortalTheme; f: FlightInfo; label: string },
) {
  /* الوصولُ في اليوم التالي يُعلَن صراحةً */
  const overnight = dayGap(f.date, f.arrival_date);
  /* ألوانُ المسار المشترك من سمة البوّابة — لا متغيّراتِ سمة التطبيق */
  const routeVars = { "--accent": t.gold, "--line": LINE, "--primary": t.brand } as CSSProperties;
  return (

            <div data-portal-flight-card style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 20, overflow: "hidden", marginBottom: 14, boxShadow: "0 5px 20px rgba(93,16,41,.08)", ...routeVars }}>
              <style>{ROUTE_CSS}</style>
              <div style={{ background: `linear-gradient(90deg,${t.brand},${t.brandDeep})`, color: "#fff", padding: "11px 15px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <div style={{ width: 46, height: 46, borderRadius: 12, background: "#fff", border: `2px solid ${t.gold}`, boxShadow: "0 2px 10px rgba(0,0,0,.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden", padding: 4, color: t.brand }}>
                    <AirlineMark airline={f.airline} size={22} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: t.fontD, fontWeight: 800, fontSize: 16, overflowWrap: "anywhere" }}>{label}</div>
                    {f.airline && <div style={{ fontSize: 12.5, fontWeight: 700, opacity: .9, marginTop: 1, overflowWrap: "anywhere" }}>{f.airline}</div>}
                  </div>
                </div>
                {f.class && <div style={{ fontSize: 13, background: t.goldBright, color: t.brandDeep, padding: "5px 15px", borderRadius: 99, fontWeight: 900, fontFamily: t.fontD, flexShrink: 0 }}>{f.class}</div>}
              </div>
              <div dir="rtl" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "20px 18px 8px" }}>
                <div style={{ textAlign: "center", minWidth: 0 }}>
                  <div style={{ fontFamily: t.fontD, fontWeight: 900, fontSize: 31, color: t.brand, letterSpacing: 1 }}>{f.from_airport || "—"}</div>
                  <div style={{ fontFamily: t.fontD, fontSize: 18, color: INK, fontWeight: 900, marginTop: 3, direction: "ltr" }}>{f.time || ""}</div>
                  <div style={{ fontSize: 12.5, color: LABEL, fontWeight: 700, marginTop: 3 }}>مغادرة</div>
                </div>
                {/* المسار — الطائرة من المغادرة (يميناً) إلى الوصول (يساراً) */}
                <div style={{ flex: 1, minWidth: 40, display: "flex", alignItems: "center", margin: "20px 10px 0" }}>
                  <RoutePlane urgent={false} />
                </div>
                <div style={{ textAlign: "center", minWidth: 0 }}>
                  <div style={{ fontFamily: t.fontD, fontWeight: 900, fontSize: 31, color: t.brand, letterSpacing: 1 }}>{f.to_airport || "—"}</div>
                  <div style={{ fontFamily: t.fontD, fontSize: 18, color: INK, fontWeight: 900, marginTop: 3, direction: "ltr", display: "flex", alignItems: "baseline", justifyContent: "center", gap: 3 }}>
                    {f.arrival_time || ""}
                    {overnight > 0 && <sup style={{ fontSize: 12, fontWeight: 900, color: t.goldDark }}>+{overnight}</sup>}
                  </div>
                  <div style={{ fontSize: 12.5, color: LABEL, fontWeight: 700, marginTop: 3 }}>وصول</div>
                </div>
              </div>
              {overnight > 0 && (
                <div style={{ margin: "0 18px 4px", background: `${t.gold}1e`, border: `1px solid ${t.gold}55`, borderRadius: 11, padding: "8px 12px", fontSize: 13.5, fontWeight: 700, color: INK, textAlign: "center", lineHeight: 1.8 }}>
                  الوصول في اليوم التالي — {fmtDateAr(f.arrival_date)}
                </div>
              )}
              <div style={{ borderTop: `2.5px dashed ${LINE}`, margin: "10px 0 0", position: "relative" }}>
                <div style={{ position: "absolute", top: -11, right: -12, width: 22, height: 22, borderRadius: "50%", background: IVORY, border: `1px solid ${LINE}` }} />
                <div style={{ position: "absolute", top: -11, left: -12, width: 22, height: 22, borderRadius: "50%", background: IVORY, border: `1px solid ${LINE}` }} />
              </div>
              <div style={{ display: "flex", padding: "14px 18px 16px", gap: 10 }}>
                <div style={{ flex: 1, textAlign: "center", minWidth: 0 }}><div style={{ fontSize: 13, color: LABEL, fontWeight: 700 }}>الرحلة</div><div style={{ fontFamily: t.fontD, fontSize: 19, fontWeight: 900, color: t.goldDark, marginTop: 2, direction: "ltr" }}>{f.name || "—"}</div></div>
                <div style={{ width: 1.5, background: LINE, flexShrink: 0 }} />
                <div style={{ flex: 1.4, textAlign: "center", minWidth: 0 }}><div style={{ fontSize: 13, color: LABEL, fontWeight: 700 }}>تاريخ المغادرة</div><div style={{ fontFamily: t.fontD, fontSize: 16.5, fontWeight: 900, color: t.goldDark, marginTop: 2, lineHeight: 1.6 }}>{fmtDateAr(f.date) || "—"}</div></div>
              </div>
            </div>
  );
}
