/* ═══ شاشةُ الدخول ═══
   مسؤوليّةٌ واحدة: أخذُ الوثيقة والميلاد وتسليمُهما. لا تعرف
   الجلسةَ ولا تنادي القاعدة — `onSubmit` يفعل ذلك في الأب، فتبقى
   معماريّةُ الجلسة حيث هي (§٨.١ / الثابت أ١٢).

   ⚠️ منقولةٌ حرفاً بحرف من المرحلة الأولى: كلُّ نصٍّ عربيّ وكلُّ
   نمطٍ ورقمٍ كما كان. */
import type { CSSProperties } from "react";
import { Icon, ICONS } from "./PortalIcons";
import { MONTHS_AR, STAR_PATTERN, type PortalTheme } from "./portal.theme";

type Props = {
  t: PortalTheme;
  logoUrl: string | null;
  nameAr: string;
  seasonLabel: string | null | undefined;
  adminPhone: string | null | undefined;
  doc: string; setDoc: (v: string) => void;
  dobMode: "select" | "type"; setDobMode: (v: "select" | "type") => void;
  day: string; setDay: (v: string) => void;
  month: string; setMonth: (v: string) => void;
  year: string; setYear: (v: string) => void;
  loading: boolean;
  loginError: string;
  onSubmit: () => void;
};

export function PortalLogin({
  t, logoUrl, nameAr, seasonLabel, adminPhone,
  doc, setDoc, dobMode, setDobMode, day, setDay, month, setMonth, year, setYear,
  loading, loginError, onSubmit,
}: Props) {
  const inpStyle: CSSProperties = { padding: "16px 8px", borderRadius: 14, border: "1.5px solid rgba(255,255,255,.32)", background: "rgba(255,255,255,.12)", color: "#fff", fontSize: 17, fontWeight: 700, fontFamily: t.font, outline: "none", textAlign: "center", boxSizing: "border-box" };
  const yearNow = new Date().getFullYear();
  return (

      <div dir="rtl" style={{ minHeight: "100dvh", background: `linear-gradient(168deg,${t.brand} 0%,${t.brandDeep} 85%)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: t.font, color: "#fff", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, opacity: .06, backgroundImage: STAR_PATTERN, pointerEvents: "none" }} />
        <div style={{ width: "100%", maxWidth: 410, position: "relative" }}>
          <div style={{ textAlign: "center", marginBottom: 30 }}>
            <div style={{ width: 110, height: 110, borderRadius: "50%", border: `3px solid ${t.goldBright}`, background: "rgba(255,255,255,.08)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px", boxShadow: "0 0 0 10px rgba(240,200,74,.08)" }}>
              {logoUrl
                ? <img src={logoUrl} alt="" style={{ width: 70, height: 70, objectFit: "contain" }} />
                : <Icon d={ICONS.star} size={54} color={t.goldBright} sw={1.3} />}
            </div>
            <div style={{ fontFamily: t.fontT, fontSize: 32, fontWeight: 700 }}>{nameAr}</div>
            <div style={{ fontSize: 15.5, color: t.goldBright, marginTop: 8, fontWeight: 700 }}>بوابة الحاج {seasonLabel ? `— ${seasonLabel}` : ""}</div>
          </div>

          <label style={{ display: "block", fontSize: 15, color: t.goldBright, fontWeight: 800, marginBottom: 9 }}>رقم جواز السفر أو البطاقة الشخصية</label>
          <input value={doc} onChange={e => setDoc(e.target.value)} placeholder="A12345678"
            style={{ ...inpStyle, width: "100%", direction: "ltr", textAlign: "left", letterSpacing: 1.5, padding: "16px 16px" }} />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "20px 0 9px" }}>
            <label style={{ fontSize: 15, color: t.goldBright, fontWeight: 800 }}>تاريخ الميلاد</label>
            <div style={{ display: "flex", background: "rgba(255,255,255,.12)", borderRadius: 99, padding: 3, border: "1px solid rgba(255,255,255,.25)" }}>
              {[{ id: "select", l: "اختيار" }, { id: "type", l: "كتابة" }].map(o => (
                <button key={o.id} onClick={() => setDobMode(o.id as typeof dobMode)}
                  style={{ border: "none", borderRadius: 99, padding: "6px 18px", fontFamily: t.fontD, fontWeight: 800, fontSize: 13.5, cursor: "pointer", background: dobMode === o.id ? t.goldBright : "transparent", color: dobMode === o.id ? t.brandDeep : "rgba(255,255,255,.85)", transition: "background .2s" }}>
                  {o.l}
                </button>
              ))}
            </div>
          </div>

          {dobMode === "select" ? (
            <div style={{ display: "flex", gap: 9 }}>
              {[
                { v: day, set: setDay, ph: "اليوم", opts: Array.from({ length: 31 }, (_, i) => ({ v: String(i + 1), t: String(i + 1) })) },
                { v: month, set: setMonth, ph: "الشهر", opts: MONTHS_AR.map((m, i) => ({ v: String(i + 1), t: m })) },
                { v: year, set: setYear, ph: "السنة", opts: Array.from({ length: 100 }, (_, i) => ({ v: String(yearNow - 18 - i), t: String(yearNow - 18 - i) })) },
              ].map((f, i) => (
                <select key={i} value={f.v} onChange={e => f.set(e.target.value)}
                  style={{ ...inpStyle, flex: i === 1 ? 1.4 : 1, appearance: "none", color: f.v ? "#fff" : "rgba(255,255,255,.6)" }}>
                  <option value="" disabled style={{ color: "#333" }}>{f.ph}</option>
                  {f.opts.map(o => <option key={o.v} value={o.v} style={{ color: "#333" }}>{o.t}</option>)}
                </select>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", gap: 9 }}>
              {[
                { v: day, set: setDay, ph: "اليوم", max: 2 },
                { v: month, set: setMonth, ph: "الشهر", max: 2 },
                { v: year, set: setYear, ph: "السنة", max: 4 },
              ].map((f, i) => (
                <div key={i} style={{ flex: i === 2 ? 1.4 : 1 }}>
                  <input inputMode="numeric" pattern="[0-9]*" value={f.v} maxLength={f.max}
                    onChange={e => f.set(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder={f.ph}
                    style={{ ...inpStyle, width: "100%", direction: "ltr", letterSpacing: 2 }} />
                </div>
              ))}
            </div>
          )}
          {dobMode === "type" && <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.7)", fontWeight: 600, marginTop: 8, textAlign: "center" }}>مثال: اليوم 14 — الشهر 6 — السنة 1975</div>}

          {loginError && <div style={{ marginTop: 16, fontSize: 14.5, fontWeight: 700, background: "rgba(255,80,80,.18)", border: "1.5px solid rgba(255,130,130,.5)", borderRadius: 12, padding: "13px 15px", lineHeight: 1.9 }}>{loginError}</div>}

          <button onClick={onSubmit} disabled={loading}
            style={{ width: "100%", marginTop: 24, padding: 18, border: "none", borderRadius: 15, background: t.goldBright, color: t.brandDeep, fontFamily: t.fontD, fontWeight: 900, fontSize: 19, cursor: "pointer", opacity: loading ? .6 : 1, boxShadow: "0 8px 24px rgba(240,200,74,.35)" }}>
            {loading ? "جارٍ التحقق..." : "دخول إلى رحلتي"}
          </button>

          <div style={{ textAlign: "center", fontSize: 13.5, color: "rgba(255,255,255,.8)", fontWeight: 600, marginTop: 24, lineHeight: 2.1 }}>
            تدخل مرة واحدة وتبقى بوابتك مفتوحة طوال الموسم
            {adminPhone && <><br />للمساعدة: <a href={`tel:${adminPhone}`} style={{ direction: "ltr", display: "inline-block", color: t.goldBright, fontWeight: 800, textDecoration: "none" }}>{adminPhone}</a></>}
          </div>
        </div>
      </div>
  );
}
