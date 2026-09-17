/* ═══ تبويبُ «رحلتي» ═══
   يجمع ما يخصّ الحركةَ والوثائق: وسائلُ الاتّصال، والرحلة، والباص،
   والمستندات، وبطاقةُ التجهيز حين لا يكتمل شيء. تركيبٌ لا منطق:
   كلُّ شرطٍ يصل محسوباً من الأب. */
import { Icon, ICONS } from "./PortalIcons";
import { INK, BODY, LABEL, LINE, mix, type PortalTheme } from "./portal.theme";
import { CardHeader, InfoUnit, InfoUnits } from "./PortalPrimitives";
import { cardStyle } from "./portal.styles";
import { FlightCard } from "./FlightCard";
import type { PortalDocType } from "../../utils";
import type { FlightInfo } from "./portal.types";

type Props = {
  t: PortalTheme;
  adminPhone: string | null | undefined;
  adminWhatsapp: string | null | undefined;
  showLost: boolean; onLost: () => void;
  showFlights: boolean; activeFlight: FlightInfo | null; flightLabel: string;
  showBuses: boolean; bus: { name: string; type: string } | null;
  showDocs: boolean; anyDoc: boolean; outboundDone: boolean;
  hasPermit: boolean; hasTicket: boolean;
  docBusy: PortalDocType | null; docError: PortalDocType | null;
  onOpenDoc: (type: PortalDocType, title: string) => void;
  prepping: boolean;
};

export function TripTab({
  t, adminPhone, adminWhatsapp, showLost, onLost,
  showFlights, activeFlight, flightLabel, showBuses, bus,
  showDocs, anyDoc, outboundDone, hasPermit, hasTicket,
  docBusy, docError, onOpenDoc, prepping,
}: Props) {
  return (
    <>

          {/* ═══ الأفعالُ الثلاثة — حاضرةٌ لا مُهيمنة ═══
             كانت ثلاثَ كتلٍ مشبَعةٍ (أحمر · أخضر · ذهبيّ) بظلالٍ
             ملوّنة، فتسبق العينُ إليها قبل الرحلة والسكن — وهي
             وسائلُ اتّصالٍ لا محتوى الرحلة. فصارت **نبرةً لا كتلة**:
             أرضيّةٌ فاتحةٌ من لون كلٍّ، وحدٌّ خفيف، والأيقونةُ
             والنصُّ بلونه الغامق. ⚠️ والأرضيّةُ **عتيمةٌ لا شفّافة**:
             الصفُّ يجلس على حدّ الترويسة والورقيّ معاً (الكتلةُ
             مرفوعةٌ بـ`marginTop:-36`)، والشفّافُ يبهت على المارون. تبقى مميَّزةً بلونها ومعناها
             (والواتساب أخضرُ واتساب)، ويبقى هدفُ اللمس ٤٤px فأكثر. */}
          <div style={{ display: "flex", gap: 9, marginBottom: 14 }}>
            {adminPhone && (
              <a href={`tel:${adminPhone}`} style={{
                flex: 1, minHeight: 56, borderRadius: 15, padding: "9px 4px",
                background: mix(t.brand, "#ffffff", 0.93), border: `1.5px solid ${t.brand}33`, color: t.brandDeep,
                fontFamily: t.fontD, fontWeight: 800, fontSize: 13.5,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: 5, textDecoration: "none",
              }}><Icon d={ICONS.phone} size={20} color={t.brand} />إداري الحملة</a>
            )}
            {adminWhatsapp && (
              <a href={`https://wa.me/${adminWhatsapp.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer" style={{
                flex: 1, minHeight: 56, borderRadius: 15, padding: "9px 4px",
                background: mix("#1F7A4D", "#ffffff", 0.93), border: "1.5px solid #1F7A4D33", color: "#145736",
                fontFamily: t.fontD, fontWeight: 800, fontSize: 13.5,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: 5, textDecoration: "none",
              }}><Icon d={ICONS.wa} size={20} color="#1F7A4D" />واتساب</a>
            )}
            {showLost && (
              <button onClick={onLost} style={{
                flex: 1, minHeight: 56, borderRadius: 15, padding: "9px 4px",
                background: t.goldTint, border: `1.5px solid ${t.gold}66`, color: t.goldDark,
                fontFamily: t.fontD, fontWeight: 800, fontSize: 13.5,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: 5, cursor: "pointer",
              }}><Icon d={ICONS.help} size={20} color={t.goldDark} />أنا تائه</button>
            )}
          </div>

{showFlights && activeFlight && <FlightCard t={t} f={activeFlight} label={flightLabel} />}
          {showBuses && bus && <div style={cardStyle}>
            <CardHeader t={t} icon={ICONS.bus} title="أوتوبيسي" sub="التنقل بين المشاعر" />
            <InfoUnits>
              <InfoUnit t={t} k="رقم الأوتوبيس" v={bus.name || "—"} big />
              {bus.type ? <InfoUnit t={t} k="النوع" v={bus.type} /> : null}
            </InfoUnits>
          </div>}

          {showDocs && (anyDoc || outboundDone || !!activeFlight) && (
            <div style={cardStyle}>
              <CardHeader t={t} icon={ICONS.doc} title="مستنداتي" sub="للإبراز في المطار والمنافذ" />
              {/* الوجود من القاعدة، والرابط لا يُطلب إلا عند الضغط:
                  توقيع عند الحاجة لا عند فتح الشاشة */}
              {([
                { t: "تصريح الحج", type: "hajj_permit" as PortalDocType, has: hasPermit },
                { t: "تذكرة الطيران", type: "flight_ticket" as PortalDocType, has: hasTicket },
              ]).map((d, i) => {
                const busy = docBusy === d.type;
                const failed = docError === d.type;
                return (
                <div key={d.type} style={{ padding: "12px 2px", borderBottom: i === 0 ? `1px dashed ${LINE}` : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <span style={{ fontSize: 19, fontWeight: 700, color: INK, minWidth: 0, overflowWrap: "anywhere" }}>{d.t}</span>
                    {d.has ? (
                      <button type="button" onClick={() => onOpenDoc(d.type, d.t)} disabled={busy}
                        style={{ flexShrink: 0, minHeight: 44, border: "none", fontSize: 16.5, background: failed ? t.goldBright : t.brand, color: failed ? t.brandDeep : "#fff", padding: "0 24px", borderRadius: 99, fontWeight: 800, fontFamily: t.fontD, cursor: busy ? "default" : "pointer", opacity: busy ? .7 : 1 }}>
                        {busy ? "جارٍ الفتح…" : failed ? "إعادة المحاولة" : "عرض"}
                      </button>
                    ) : (
                      /* غيابٌ في وقت التجهيز ليس خطأً — ولهذا لغةٌ هادئة */
                      <span style={{ flexShrink: 0, fontSize: 14.5, color: LABEL, fontWeight: 600 }}>سيظهر هنا فور جاهزيته</span>
                    )}
                  </div>
                  {failed && (
                    <div style={{ marginTop: 9, fontSize: 14, fontWeight: 700, color: INK, background: `${t.gold}1e`, border: `1px solid ${t.gold}55`, borderRadius: 11, padding: "9px 12px", lineHeight: 1.85 }}>
                      تعذّر فتح المستند. تأكّد من الاتصال بالإنترنت ثم أعد المحاولة.
                    </div>
                  )}
                </div>
              );})}
            </div>
          )}

          {/* ══ بطاقةُ التجهيز — واحدةٌ هادئة بدل جدارٍ من النفي ══ */}
          {prepping && (
            <div style={{ ...cardStyle, border: `1.5px solid ${t.gold}77`, background: "#fff" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: `${t.gold}1e`, border: `1.5px solid ${t.gold}55`, display: "flex", alignItems: "center", justifyContent: "center", color: t.goldDark, flexShrink: 0 }}>
                  <Icon d={ICONS.kaaba} size={25} sw={1.7} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: t.fontD, fontWeight: 800, fontSize: 21, color: INK }}>رحلتك قيد التجهيز</div>
                </div>
              </div>
              <div style={{ fontSize: 15.5, fontWeight: 600, color: BODY, lineHeight: 2.05, marginTop: 12 }}>
                جاري استكمال ترتيبات رحلتك، وستظهر تفاصيل السكن والتنقل والطيران هنا فور اعتمادها.
              </div>
            </div>
          )}
    </>
  );
}
