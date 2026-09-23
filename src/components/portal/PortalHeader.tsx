/* ═══ ترويسةُ البوابة ═══
   هويّةُ الحملة، وتحيّةُ الحاجّ باسمه، وزرُّ الخروج، ثمّ العدّادُ
   أو دعاءُ ما بعد الحجّ. مسؤوليّةُ عرضٍ خالصة: لا تحسب موعداً ولا
   تُنهي جلسة — الأبُ يحسب ويمرّر، و`onLogout` يفعل.

   ⚠️ والعدّادُ **يختفي** إن لم يُعرف يومُ عرفة (`showCountdown`)
   ولا يُختلَق له تاريخ. منقولةٌ حرفاً بحرف. */
import { Icon, ICONS } from "./PortalIcons";
import { STAR_PATTERN, type PortalTheme } from "./portal.theme";

type Props = {
  t: PortalTheme;
  logoUrl: string | null;
  nameAr: string;
  seasonName: string | null | undefined;
  hasPhoto: boolean;
  photoUrl: string;
  gender: string;
  displayName: string;
  postHajj: boolean;
  showCountdown: boolean;
  cd: { d: number; h: number; m: number; s: number };
  onLogout: () => void;
};

export function PortalHeader({
  t, logoUrl, nameAr, seasonName, hasPhoto, photoUrl, gender, displayName,
  postHajj, showCountdown, cd, onLogout,
}: Props) {
  return (
      <div style={{ background: `linear-gradient(160deg,${t.brand},${t.brandDeep})`, color: "#fff", padding: "0 18px 56px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, opacity: .06, backgroundImage: STAR_PATTERN, pointerEvents: "none" }} />
        <div style={{ position: "relative" }}>
          
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, padding: "16px 16px 14px" }}>
      <div style={{ width: 74, height: 74, borderRadius: "50%", border: `3px solid ${t.goldBright}`, overflow: "hidden", flexShrink: 0, boxShadow: "0 0 0 8px rgba(240,200,74,.07)" }}>
        {logoUrl
          ? <img src={logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <div style={{ width: "100%", height: "100%", background: "rgba(240,200,74,.1)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon d={ICONS.star} size={44} color={t.goldBright} sw={1.4} /></div>}
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontFamily: t.fontT, fontSize: 27, fontWeight: 700, color: "#fff", lineHeight: 1.25 }}>{nameAr}</div>
        <div style={{ fontFamily: t.font, fontSize: 13.5, fontWeight: 700, color: t.goldBright, marginTop: 3 }}>
          بوابة الحاج{seasonName ? ` — ${seasonName}` : ""}
        </div>
      </div>
    </div>
          <div style={{ height: 1.5, background: `linear-gradient(90deg,transparent,${t.goldBright}88,transparent)`, margin: "0 -4px 16px" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {hasPhoto && photoUrl
              ? <img src={photoUrl} alt="" style={{ width: 60, height: 60, borderRadius: "50%", objectFit: "cover", border: "3px solid rgba(255,255,255,.55)" }} />
              : <div style={{ width: 60, height: 60, borderRadius: "50%", background: t.goldBright, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: t.fontD, fontWeight: 900, fontSize: 25, color: t.brandDeep, border: "3px solid rgba(255,255,255,.55)" }}>{displayName?.charAt(0)}</div>}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, color: t.goldBright, fontWeight: 800 }}>{gender === "أنثى" ? "حياك الله يا حاجة" : "حياك الله يا حاج"}</div>
              <div style={{ fontFamily: t.fontD, fontSize: 25, fontWeight: 900, marginTop: 2, lineHeight: 1.4, color: "#fff", overflowWrap: "anywhere" }}>{displayName}</div>
            </div>
            <button onClick={onLogout} aria-label="تسجيل الخروج" title="تسجيل الخروج"
              style={{ background: "rgba(255,255,255,.10)", border: "1.5px solid rgba(255,255,255,.28)", color: "rgba(255,255,255,.85)", borderRadius: 99, fontSize: 13, minWidth: 44, minHeight: 44, padding: "0 14px", cursor: "pointer", fontFamily: t.fontD, fontWeight: 700, flexShrink: 0 }}>خروج</button>
          </div>

          {postHajj ? (
            <div style={{ marginTop: 18, background: "rgba(240,200,74,.14)", border: `2px solid ${t.goldBright}77`, borderRadius: 20, padding: "19px 16px", textAlign: "center" }}>
              <Icon d={ICONS.kaaba} size={30} color={t.goldBright} sw={1.6} />
              <div style={{ fontFamily: t.fontT, fontSize: 24, fontWeight: 700, color: "#fff", marginTop: 9 }}>تقبل الله حجكم وسعيكم</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: t.goldBright, marginTop: 5 }}>حجاً مبروراً وسعياً مشكوراً وذنباً مغفوراً</div>
            </div>
          ) : showCountdown && (
            <div style={{ marginTop: 18, background: "rgba(0,0,0,.22)", border: `1.5px solid ${t.goldBright}44`, borderRadius: 20, padding: "16px 16px" }}>
              <div style={{ fontSize: 14.5, color: t.goldBright, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}><Icon d={ICONS.clock} size={17} />المتبقي على الوقوف بعرفات</div>
              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                {[[cd.d, "يوم"], [cd.h, "ساعة"], [cd.m, "دقيقة"], [cd.s, "ثانية"]].map(([v, l], i) => (
                  <div key={i} style={{ flex: 1, textAlign: "center", background: "rgba(0,0,0,.38)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 14, padding: "12px 0" }}>
                    <div style={{ fontFamily: t.fontD, fontSize: 27, fontWeight: 900, color: "#fff", lineHeight: 1.1 }}>{String(v).padStart(2, "0")}</div>
                    <div style={{ fontSize: 13, color: t.goldBright, fontWeight: 800, marginTop: 3 }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
  );
}
