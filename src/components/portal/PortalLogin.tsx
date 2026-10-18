/* ═══ شاشةُ الدخول ═══
   مسؤوليّةٌ واحدة: أخذُ الوثيقة والميلاد وتسليمُهما. لا تعرف
   الجلسةَ ولا تنادي القاعدة — `onSubmit` يفعل ذلك في الأب، فتبقى
   معماريّةُ الجلسة حيث هي (§٨.١ / الثابت أ١٢).

   ⚠️ منقولةٌ حرفاً بحرف من المرحلة الأولى: كلُّ نصٍّ عربيّ وكلُّ
   نمطٍ ورقمٍ كما كان. */
import { useRef, type CSSProperties } from "react";
import { Icon, ICONS } from "./PortalIcons";
import { MONTHS_AR, STAR_PATTERN, type PortalTheme } from "./portal.theme";
import { dobDigits, isValidDay, isValidMonth } from "./portal.login";

type Props = {
  t: PortalTheme;
  logoUrl: string | null;
  nameAr: string;
  seasonName: string | null | undefined;
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
  t, logoUrl, nameAr, seasonName, adminPhone,
  doc, setDoc, dobMode, setDobMode, day, setDay, month, setMonth, year, setYear,
  loading, loginError, onSubmit,
}: Props) {
  const inpStyle: CSSProperties = { padding: "16px 8px", borderRadius: 14, border: "1.5px solid rgba(255,255,255,.32)", background: "rgba(255,255,255,.12)", color: "#fff", fontSize: 17, fontWeight: 700, fontFamily: t.font, outline: "none", textAlign: "center", boxSizing: "border-box" };
  const yearNow = new Date().getFullYear();
  /* M2 — الكتابةُ: رقمان صالحان في اليوم أو الشهر ينقلان إلى الحقل التالي،
     والفاسدُ لا ينقل؛ ورقمٌ واحدٌ يُقبل عند مغادرة الحقل (٥ ← 05)؛ و«دخول»
     أو Go في حقل السنة يُرسل — والأبُ يمنع الإرسالَ المزدوج. */
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);
  return (

      <div dir="rtl" style={{ minHeight: "100dvh", background: `linear-gradient(168deg,${t.brand} 0%,${t.brandDeep} 85%)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: t.font, color: "#fff", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, opacity: .06, backgroundImage: STAR_PATTERN, pointerEvents: "none" }} />
        <div style={{ width: "100%", maxWidth: 410, position: "relative" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            {/* الشعارُ الحقيقيّ كثيراً ما يحمل خلفيّتَه البيضاء — فيُقدَّم على
                لوحٍ أبيضَ مستديرِ الزوايا يحتويه كاملاً (contain)، فيبدو
                مقصوداً لا صورةً ملصقةً داخل دائرة. والمرتدُّ يبقى النجمة. */}
            {logoUrl
              ? <div style={{ width: 116, height: 116, borderRadius: 28, background: "#fff", border: `2px solid ${t.goldBright}`, boxShadow: "0 6px 18px rgba(0,0,0,.18)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", padding: 12, boxSizing: "border-box", overflow: "hidden" }}>
                  <img src={logoUrl} alt="" style={{ display: "block", maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto", objectFit: "contain" }} />
                </div>
              : <div style={{ width: 110, height: 110, borderRadius: "50%", border: `3px solid ${t.goldBright}`, background: "rgba(255,255,255,.08)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", boxShadow: "0 0 0 10px rgba(240,200,74,.08)" }}>
                  <Icon d={ICONS.star} size={54} color={t.goldBright} sw={1.3} />
                </div>}
            <div style={{ fontFamily: t.fontT, fontSize: "clamp(20px, 5.6vw, 26px)", fontWeight: 700, lineHeight: 1.35, maxWidth: "100%", overflowWrap: "anywhere", padding: "0 8px" }}>{nameAr}</div>
            <div style={{ fontSize: 16, color: t.goldBright, marginTop: 6, fontWeight: 800, letterSpacing: .3 }}>بوابة الحاج {seasonName ? `— ${seasonName}` : ""}</div>
          </div>

          <label style={{ display: "block", fontSize: 15, color: t.goldBright, fontWeight: 800, marginBottom: 8 }}>رقم جواز السفر أو البطاقة الشخصية</label>
          <input value={doc} onChange={e => setDoc(e.target.value)} placeholder="A12345678"
            style={{ ...inpStyle, width: "100%", direction: "ltr", textAlign: "left", letterSpacing: 1.5, padding: "16px 16px" }} />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "18px 0 8px", gap: 12 }}>
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
                { v: day, set: setDay, ph: "اليوم", max: 2, valid: isValidDay, next: monthRef, ref: undefined },
                { v: month, set: setMonth, ph: "الشهر", max: 2, valid: isValidMonth, next: yearRef, ref: monthRef },
                { v: year, set: setYear, ph: "السنة", max: 4, valid: null, next: null, ref: yearRef },
              ].map((f, i) => (
                <div key={i} style={{ flex: i === 2 ? 1.4 : 1 }}>
                  <input ref={f.ref} inputMode="numeric" pattern="[0-9]*" value={f.v} maxLength={f.max}
                    enterKeyHint={f.next ? "next" : "go"}
                    onChange={e => {
                      const v = dobDigits(e.target.value, f.max);
                      f.set(v);
                      if (f.next && v.length === 2 && f.valid?.(v)) f.next.current?.focus();
                    }}
                    /* قيمةُ الحقل نفسُه لا الحالة: الانتقالُ من `onChange` يُطلق المغادرةَ
                       قبل أن تُعرض القيمةُ الجديدة، فالحالةُ هنا ما زالت الرقمَ الأوّل */
                    onBlur={e => { const v = dobDigits(e.currentTarget.value, f.max); if (f.valid && v.length === 1 && f.valid(v)) f.set(`0${v}`); }}
                    onKeyDown={e => {
                      if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                      e.preventDefault();
                      if (f.next) { if (f.valid?.(f.v)) f.next.current?.focus(); }
                      else onSubmit();
                    }}
                    placeholder={f.ph}
                    style={{ ...inpStyle, width: "100%", direction: "ltr", letterSpacing: 2 }} />
                </div>
              ))}
            </div>
          )}
          {dobMode === "type" && <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.7)", fontWeight: 600, marginTop: 8, textAlign: "center" }}>مثال: اليوم 14 — الشهر 6 — السنة 1975</div>}

          {loginError && <div style={{ marginTop: 16, fontSize: 14.5, fontWeight: 700, background: "rgba(255,80,80,.18)", border: "1.5px solid rgba(255,130,130,.5)", borderRadius: 12, padding: "13px 15px", lineHeight: 1.9 }}>{loginError}</div>}

          <button onClick={onSubmit} disabled={loading}
            style={{ width: "100%", marginTop: 22, padding: 18, border: "none", borderRadius: 15, background: t.goldBright, color: t.brandDeep, fontFamily: t.fontD, fontWeight: 900, fontSize: 19, cursor: "pointer", opacity: loading ? .6 : 1, boxShadow: "0 4px 14px rgba(240,200,74,.22)" }}>
            {loading ? "جارٍ التحقق..." : "دخول إلى رحلتي"}
          </button>

          <div style={{ textAlign: "center", fontSize: 13.5, color: "rgba(255,255,255,.8)", fontWeight: 600, marginTop: 20, lineHeight: 2.1 }}>
            تدخل مرة واحدة وتبقى بوابتك مفتوحة طوال الموسم
            {adminPhone && <><br />للمساعدة: <a href={`tel:${adminPhone}`} style={{ direction: "ltr", display: "inline-block", color: t.goldBright, fontWeight: 800, textDecoration: "none" }}>{adminPhone}</a></>}
          </div>
        </div>
      </div>
  );
}
