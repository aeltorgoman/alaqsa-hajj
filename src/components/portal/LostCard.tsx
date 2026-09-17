/* ═══ بطاقةُ «أنا تائه» ═══
   شاشةٌ تُعرَض لرجل أمنٍ أو مسؤول: هويّةُ الحاجّ وحملتِه وموضعِه
   ورقمُ الطوارئ. لا تقرأ حمولةً ولا تنادي شيئاً — كلُّ ما تعرضه
   يصلها جاهزاً. منقولةٌ حرفاً بحرف. */
import { Icon, ICONS } from "./PortalIcons";
import { BODY, STAR_PATTERN, type PortalTheme } from "./portal.theme";
import { cardStyle } from "./portal.styles";

type Props = {
  t: PortalTheme;
  logoUrl: string | null;
  nameAr: string;
  country: string | null | undefined;
  nameArPilgrim: string;
  nameEn: string;
  hotelName: string | null | undefined;
  room: { number: string } | null;
  minaName: string;
  minaAddress: string | null | undefined;
  arafaName: string;
  arafaAddress: string | null | undefined;
  adminPhone: string | null | undefined;
  adminName: string | null | undefined;
  onClose: () => void;
};

export function LostCard({
  t, logoUrl, nameAr, country, nameArPilgrim, nameEn,
  hotelName, room, minaName, minaAddress, arafaName, arafaAddress,
  adminPhone, adminName, onClose,
}: Props) {
  return (

      <div dir="rtl" style={{ minHeight: "100dvh", background: "#1c0d12", fontFamily: t.font, padding: 16 }}>
        <button onClick={onClose} style={{ background: "rgba(255,255,255,.13)", border: "none", borderRadius: 13, width: 46, height: 46, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}><Icon d={ICONS.back} size={22} /></button>
        <div style={{ background: `linear-gradient(170deg,${t.brand},${t.brandDeep})`, borderRadius: 24, color: "#fff", padding: "32px 22px", textAlign: "center", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, opacity: .08, backgroundImage: STAR_PATTERN, pointerEvents: "none" }} />
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 8 }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", border: `2.5px solid ${t.goldBright}`, background: "rgba(240,200,74,.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {logoUrl ? <img src={logoUrl} alt="" style={{ width: 34, height: 34, objectFit: "contain" }} /> : <Icon d={ICONS.star} size={26} color={t.goldBright} sw={1.5} />}
              </div>
              <div style={{ fontFamily: t.fontT, fontSize: 30, fontWeight: 700 }}>{nameAr}</div>
            </div>
            <div style={{ fontSize: 13, color: t.goldBright, letterSpacing: 2.5, fontWeight: 700, direction: "ltr" }}>HAJJ GROUP{country ? ` — ${country.toUpperCase()}` : ""}</div>

            <div style={{ fontFamily: t.fontD, fontSize: 36, fontWeight: 900, marginTop: 24, lineHeight: 1.4 }}>{nameArPilgrim}</div>
            <div style={{ fontSize: 17.5, direction: "ltr", color: "#fff", marginTop: 6, fontWeight: 600 }}>{nameEn}</div>

            <div style={{ background: "rgba(240,200,74,.13)", border: `1.5px solid ${t.goldBright}88`, borderRadius: 15, padding: "14px 15px", marginTop: 22, fontSize: 15.5, fontWeight: 700, lineHeight: 2.1, textAlign: "right", color: "#fff" }}>
              {(hotelName || room) && <div>الفندق: {hotelName || ""} {room ? `— غرفة ${room.number}` : ""}</div>}
              {(minaName) && <div>مخيم منى: {minaName}{minaAddress ? ` — ${minaAddress}` : ""}</div>}
              {(arafaName) && <div>مخيم عرفات: {arafaName}{arafaAddress ? ` — ${arafaAddress}` : ""}</div>}
            </div>

            {adminPhone && <>
              <div style={{ fontSize: 14, color: "#fff", fontWeight: 700, marginTop: 22, opacity: .9 }}>رقم الطوارئ · Emergency</div>
              <a href={`tel:${adminPhone}`} style={{ fontFamily: t.fontD, fontSize: 36, fontWeight: 900, color: t.goldBright, direction: "ltr", display: "block", marginTop: 6, letterSpacing: 1, textDecoration: "none" }}>{adminPhone}</a>
              {adminName && <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginTop: 5, opacity: .9 }}>{adminName}</div>}
            </>}
          </div>
        </div>
        <div style={{ ...cardStyle, textAlign: "center", marginTop: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: BODY, lineHeight: 2.1 }}>أظهر هذه الشاشة لأي رجل أمن أو مسؤول<br />وسيتم التواصل مع حملتك فوراً</div>
        </div>
      </div>
  );
}
