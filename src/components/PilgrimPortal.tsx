import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";

/* ═══════════════════════════════════════════════════════════════
   بوابة الحاج — واجهة عامة للحاج (قراءة فقط)
   الدخول: رقم الجواز أو البطاقة + تاريخ الميلاد (قوائم منسدلة)
   عبر الدالة الآمنة get_pilgrim_portal
   ═══════════════════════════════════════════════════════════════ */

type PortalData = {
  pilgrim: { name_ar: string; name_en: string; gender: string; photo_url: string | null; hajj_permit_url: string | null; flight_ticket_url: string | null; hotel_type: string | null; hotel_view: string | null; camp_mina: string | null; camp_arafa: string | null; phone: string | null };
  bus: { name: string; type: string } | null;
  room: { number: string; floor: string; type: string } | null;
  roommates: { name: string; is_family: boolean }[];
  flight_go: { name: string; airline: string; from_airport: string; to_airport: string; date: string; time: string; arrival_time: string; arrival_date: string; class: string } | null;
  flight_back: { name: string; airline: string; from_airport: string; to_airport: string; date: string; time: string; arrival_time: string; arrival_date: string; class: string } | null;
  config: { name_ar: string; logo_url: string | null; tagline: string | null; color_primary: string | null; color_accent: string | null; season_label: string | null; admin_name: string | null; admin_phone: string | null; admin_whatsapp: string | null; features: Record<string, boolean> | null } | null;
  announcements: { id: number; body: string; priority: string; show_at: string }[];
};

/* ─── حساب تاريخ يوم عرفة (٩ ذو الحجة) ميلادياً ─── */
function getArafaDate(): Date {
  try {
    const fmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { year: "numeric", month: "numeric", day: "numeric" });
    const now = new Date();
    const base = new Date(now);
    base.setDate(base.getDate() - 60);
    for (let i = 0; i < 420; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      const parts = fmt.formatToParts(d);
      const m = parseInt(parts.find(p => p.type === "month")!.value);
      const dd = parseInt(parts.find(p => p.type === "day")!.value);
      if (m === 12 && dd === 9 && d.getTime() >= now.getTime() - 86400000 * 40) return d;
    }
  } catch { /* المتصفحات القديمة */ }
  return new Date(Date.now() + 30 * 86400000);
}

const ICONS = {
  plane: '<path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  bus: '<path d="M8 6v6M15 6v6M2 12h19.6M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.6 6.8 19.7 6 18.6 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><circle cx="16" cy="18" r="2"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  wa: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/>',
  tent: '<path d="M3.5 21 14 3M20.5 21 10 3M15.5 21 12 15l-3.5 6M2 21h20"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  back: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
};

function Icon({ d, size = 16, color = "currentColor", sw = 2 }: { d: string; size?: number; color?: string; sw?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />;
}

const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

function PilgrimPortal() {
  const [data, setData] = useState<PortalData | null>(() => {
    try { const s = sessionStorage.getItem("portal_data"); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [doc, setDoc] = useState("");
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [tab, setTab] = useState<"trip" | "stay" | "alerts">("trip");
  const [lostOpen, setLostOpen] = useState(false);
  const [docView, setDocView] = useState<{ title: string; url: string } | null>(null);
  const [seenAlerts, setSeenAlerts] = useState<number>(() => Number(sessionStorage.getItem("portal_seen_alerts") || 0));
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  /* تحديث التنبيهات دورياً بعد الدخول */
  useEffect(() => {
    if (!data) return;
    const refresh = async () => {
      const { data: anns } = await supabase
        .from("announcements").select("id,body,priority,show_at")
        .lte("show_at", new Date().toISOString())
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order("show_at", { ascending: false });
      if (anns) setData(d => d ? { ...d, announcements: anns.sort((a, b) => (b.priority === "عاجل" ? 1 : 0) - (a.priority === "عاجل" ? 1 : 0)) } : d);
    };
    const t = setInterval(refresh, 60000);
    return () => clearInterval(t);
  }, [!!data]);

  const cfg = data?.config;
  const brand = cfg?.color_primary || "#7D1F3C";
  const gold = cfg?.color_accent || "#D4A017";
  const features = cfg?.features || {};
  const showRoommates = features.portal_roommates !== false;
  const showLost = features.portal_lost_card !== false;
  const showDocs = features.portal_documents !== false;

  const arafa = useMemo(() => getArafaDate(), []);
  const afterArafa = now > arafa.getTime() + 86400000; // بعد يوم عرفة بيوم: تظهر العودة
  const activeFlight = afterArafa && data?.flight_back ? data.flight_back : data?.flight_go;
  const flightLabel = afterArafa && data?.flight_back ? "رحلة العودة" : "رحلة الذهاب";

  const diff = Math.max(0, arafa.getTime() - now);
  const cd = { d: Math.floor(diff / 86400000), h: Math.floor(diff / 3600000) % 24, m: Math.floor(diff / 60000) % 60, s: Math.floor(diff / 1000) % 60 };

  const unread = (data?.announcements?.length || 0) - seenAlerts;

  async function login() {
    setLoginError("");
    if (!doc.trim()) { setLoginError("يرجى إدخال رقم الجواز أو البطاقة."); return; }
    if (!day || !month || !year) { setLoginError("يرجى اختيار تاريخ الميلاد كاملاً."); return; }
    setLoading(true);
    try {
      const { data: res, error } = await supabase.rpc("get_pilgrim_portal", {
        p_doc: doc.trim(), p_day: Number(day), p_month: Number(month), p_year: Number(year),
      });
      if (error || !res) {
        setLoginError("البيانات غير صحيحة. تأكد من رقم الجواز أو البطاقة وتاريخ الميلاد.");
      } else {
        setData(res as PortalData);
        sessionStorage.setItem("portal_data", JSON.stringify(res));
      }
    } catch {
      setLoginError("تعذر الاتصال، يرجى المحاولة مرة أخرى.");
    }
    setLoading(false);
  }

  function logout() {
    sessionStorage.removeItem("portal_data");
    setData(null); setDoc(""); setDay(""); setMonth(""); setYear("");
  }

  const font = "'IBM Plex Sans Arabic','Cairo',sans-serif";
  const fontD = "'Cairo',sans-serif";

  /* ═══════════ شاشة الدخول ═══════════ */
  if (!data) {
    const yearNow = new Date().getFullYear();
    return (
      <div dir="rtl" style={{ minHeight: "100dvh", background: `linear-gradient(168deg,${brand} 0%,#3d0f1f 85%)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: font, color: "#fff" }}>
        <div style={{ width: "100%", maxWidth: 400 }}>
          <div style={{ textAlign: "center", marginBottom: 30 }}>
            <div style={{ width: 88, height: 88, borderRadius: "50%", border: `2px solid ${gold}`, background: "rgba(255,255,255,.06)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              {cfg?.logo_url ? <img src={cfg.logo_url} alt="" style={{ width: 56, height: 56, objectFit: "contain" }} /> :
                <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke={gold} strokeWidth="1.4"><path d="M12 2l2.4 4.8L19.5 8l-3.5 4 .7 5.5L12 15l-4.7 2.5.7-5.5-3.5-4 5.1-1.2z" /></svg>}
            </div>
            <div style={{ fontFamily: fontD, fontSize: 25, fontWeight: 900 }}>{cfg?.name_ar || "بوابة الحاج"}</div>
            <div style={{ fontSize: 12, color: gold, marginTop: 5, fontWeight: 600 }}>بوابة الحاج {cfg?.season_label ? `— ${cfg.season_label}` : ""}</div>
          </div>

          <label style={{ display: "block", fontSize: 11.5, color: gold, fontWeight: 700, marginBottom: 6 }}>رقم جواز السفر أو البطاقة الشخصية</label>
          <input value={doc} onChange={e => setDoc(e.target.value)} placeholder="A12345678"
            style={{ width: "100%", padding: "13px 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,.28)", background: "rgba(255,255,255,.1)", color: "#fff", fontSize: 15, fontFamily: font, direction: "ltr", textAlign: "left", letterSpacing: 1, outline: "none", boxSizing: "border-box" }} />

          <label style={{ display: "block", fontSize: 11.5, color: gold, fontWeight: 700, margin: "16px 0 6px" }}>تاريخ الميلاد</label>
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { v: day, set: setDay, ph: "اليوم", opts: Array.from({ length: 31 }, (_, i) => ({ v: String(i + 1), t: String(i + 1) })) },
              { v: month, set: setMonth, ph: "الشهر", opts: MONTHS_AR.map((m, i) => ({ v: String(i + 1), t: m })) },
              { v: year, set: setYear, ph: "السنة", opts: Array.from({ length: 100 }, (_, i) => ({ v: String(yearNow - 18 - i), t: String(yearNow - 18 - i) })) },
            ].map((f, i) => (
              <select key={i} value={f.v} onChange={e => f.set(e.target.value)}
                style={{ flex: i === 1 ? 1.4 : 1, padding: "13px 8px", borderRadius: 12, border: "1px solid rgba(255,255,255,.28)", background: "rgba(255,255,255,.1)", color: f.v ? "#fff" : "rgba(255,255,255,.5)", fontSize: 13.5, fontFamily: font, outline: "none", appearance: "none", textAlign: "center" }}>
                <option value="" disabled style={{ color: "#333" }}>{f.ph}</option>
                {f.opts.map(o => <option key={o.v} value={o.v} style={{ color: "#333" }}>{o.t}</option>)}
              </select>
            ))}
          </div>

          {loginError && <div style={{ marginTop: 14, fontSize: 12, background: "rgba(255,80,80,.15)", border: "1px solid rgba(255,120,120,.4)", borderRadius: 10, padding: "10px 12px", lineHeight: 1.8 }}>{loginError}</div>}

          <button onClick={login} disabled={loading}
            style={{ width: "100%", marginTop: 20, padding: 15, border: "none", borderRadius: 12, background: gold, color: "#3d0f1f", fontFamily: fontD, fontWeight: 900, fontSize: 15.5, cursor: "pointer", opacity: loading ? .6 : 1 }}>
            {loading ? "جارٍ التحقق..." : "دخول إلى رحلتي"}
          </button>

          <div style={{ textAlign: "center", fontSize: 10.5, color: "rgba(255,255,255,.55)", marginTop: 20, lineHeight: 2 }}>
            بياناتك محمية ولا تظهر إلا لك ولإدارة الحملة
            {cfg?.admin_phone && <><br />للمساعدة: <span style={{ direction: "ltr", display: "inline-block" }}>{cfg.admin_phone}</span></>}
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════ مكونات مشتركة ═══════════ */
  const p = data.pilgrim;
  const card: React.CSSProperties = { background: "#fff", border: "1px solid #EAD9C9", borderRadius: 16, padding: 16, marginBottom: 12, boxShadow: "0 3px 14px rgba(93,16,41,.06)" };
  const cardH = (icon: string, title: string, sub?: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
      <div style={{ width: 32, height: 32, borderRadius: 9, background: "#F8F2E4", display: "flex", alignItems: "center", justifyContent: "center", color: brand, flexShrink: 0 }}><Icon d={icon} /></div>
      <div><div style={{ fontFamily: fontD, fontWeight: 800, fontSize: 13.5, color: "#2B1B20" }}>{title}</div>{sub && <div style={{ fontSize: 10, color: "#8A7580", marginTop: 1 }}>{sub}</div>}</div>
    </div>
  );
  const row = (k: string, v: string, goldV = false) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 2px", fontSize: 12.5, borderBottom: "1px dashed #EAD9C9" }}>
      <span style={{ color: "#8A7580" }}>{k}</span>
      <span style={{ fontWeight: goldV ? 900 : 700, color: goldV ? gold : "#2B1B20", fontFamily: goldV ? fontD : font }}>{v}</span>
    </div>
  );

  /* ═══════════ عرض مستند ═══════════ */
  if (docView) {
    const isPdf = docView.url.toLowerCase().includes(".pdf");
    return (
      <div dir="rtl" style={{ minHeight: "100dvh", background: "#241318", fontFamily: font, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, color: "#fff" }}>
          <button onClick={() => setDocView(null)} style={{ background: "rgba(255,255,255,.1)", border: "none", borderRadius: 10, width: 36, height: 36, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon d={ICONS.back} /></button>
          <div style={{ fontFamily: fontD, fontWeight: 800, fontSize: 15, flex: 1 }}>{docView.title}</div>
          <a href={docView.url} download target="_blank" rel="noreferrer" style={{ background: gold, borderRadius: 10, padding: "8px 14px", color: "#3d0f1f", fontSize: 12, fontWeight: 800, textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}><Icon d={ICONS.download} size={14} />تنزيل</a>
        </div>
        <div style={{ flex: 1, padding: "0 10px 10px" }}>
          {isPdf
            ? <iframe src={docView.url} title={docView.title} style={{ width: "100%", height: "100%", minHeight: "80dvh", border: "none", borderRadius: 12, background: "#fff" }} />
            : <img src={docView.url} alt={docView.title} style={{ width: "100%", borderRadius: 12 }} />}
        </div>
      </div>
    );
  }

  /* ═══════════ كارت أنا تائه ═══════════ */
  if (lostOpen) {
    return (
      <div dir="rtl" style={{ minHeight: "100dvh", background: "#241318", fontFamily: font, padding: 16 }}>
        <button onClick={() => setLostOpen(false)} style={{ background: "rgba(255,255,255,.1)", border: "none", borderRadius: 10, width: 36, height: 36, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}><Icon d={ICONS.back} /></button>
        <div style={{ background: `linear-gradient(170deg,${brand},#3d0f1f)`, borderRadius: 20, color: "#fff", padding: "30px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: gold, letterSpacing: 2, fontWeight: 600, direction: "ltr" }}>I AM WITH {cfg?.name_ar ? "" : "HAJJ GROUP"}</div>
          <div style={{ fontFamily: fontD, fontSize: 21, fontWeight: 800, margin: "8px 0 2px" }}>أنا مع {cfg?.name_ar || "الحملة"}</div>
          <div style={{ fontFamily: fontD, fontSize: 26, fontWeight: 900, marginTop: 18 }}>{p.name_ar}</div>
          <div style={{ fontSize: 14, direction: "ltr", color: "rgba(255,255,255,.85)", marginTop: 4, fontWeight: 500 }}>{p.name_en}</div>
          <div style={{ background: "rgba(212,160,23,.15)", border: `1px solid ${gold}66`, borderRadius: 12, padding: 12, marginTop: 18, fontSize: 12.5, lineHeight: 2.1 }}>
            {p.camp_mina && <>مخيم منى: {p.camp_mina}<br /></>}
            {p.camp_arafa && <>مخيم عرفات: {p.camp_arafa}<br /></>}
            {data.room && <>الغرفة: {data.room.number} — الدور {data.room.floor}</>}
          </div>
          {cfg?.admin_phone && <>
            <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.7)", marginTop: 18 }}>رقم الطوارئ · Emergency</div>
            <a href={`tel:${cfg.admin_phone}`} style={{ fontFamily: fontD, fontSize: 27, fontWeight: 900, color: gold, direction: "ltr", display: "block", marginTop: 6, letterSpacing: 1, textDecoration: "none" }}>{cfg.admin_phone}</a>
          </>}
        </div>
        <div style={{ ...card, textAlign: "center", marginTop: 14 }}>
          <div style={{ fontSize: 11.5, color: "#8A7580", lineHeight: 2 }}>أظهر هذه الشاشة لأي رجل أمن أو مسؤول<br />وسيتم التواصل مع حملتك فوراً</div>
        </div>
      </div>
    );
  }

  /* ═══════════ الواجهة الرئيسية ═══════════ */
  return (
    <div dir="rtl" style={{ minHeight: "100dvh", background: "#F8F2E4", fontFamily: font, paddingBottom: 84 }}>
      {/* الهيدر */}
      <div style={{ background: `linear-gradient(160deg,${brand},#3d0f1f)`, color: "#fff", padding: "18px 18px 52px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {p.photo_url
            ? <img src={p.photo_url} alt="" style={{ width: 50, height: 50, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(255,255,255,.4)" }} />
            : <div style={{ width: 50, height: 50, borderRadius: "50%", background: gold, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fontD, fontWeight: 900, fontSize: 19, color: "#3d0f1f", border: "2px solid rgba(255,255,255,.4)" }}>{p.name_ar?.charAt(0)}</div>}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, color: gold, fontWeight: 600 }}>{p.gender === "أنثى" ? "حياك الله يا حاجة" : "حياك الله يا حاج"}</div>
            <div style={{ fontFamily: fontD, fontSize: 16.5, fontWeight: 800, marginTop: 1 }}>{p.name_ar}</div>
          </div>
          <button onClick={logout} style={{ background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.2)", color: "rgba(255,255,255,.8)", borderRadius: 99, fontSize: 10, padding: "5px 12px", cursor: "pointer", fontFamily: font, fontWeight: 600 }}>خروج</button>
        </div>
        {/* العداد */}
        {diff > 0 && (
          <div style={{ marginTop: 16, background: "rgba(255,255,255,.09)", border: "1px solid rgba(255,255,255,.18)", borderRadius: 16, padding: "13px 15px", backdropFilter: "blur(8px)" }}>
            <div style={{ fontSize: 10.5, color: gold, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}><Icon d={ICONS.clock} size={12} />المتبقي على الوقوف بعرفات</div>
            <div style={{ display: "flex", gap: 8, marginTop: 9 }}>
              {[[cd.d, "يوم"], [cd.h, "ساعة"], [cd.m, "دقيقة"], [cd.s, "ثانية"]].map(([v, l], i) => (
                <div key={i} style={{ flex: 1, textAlign: "center", background: "rgba(0,0,0,.18)", borderRadius: 10, padding: "7px 0" }}>
                  <div style={{ fontFamily: fontD, fontSize: 20, fontWeight: 900 }}>{String(v).padStart(2, "0")}</div>
                  <div style={{ fontSize: 8.5, color: "rgba(255,255,255,.6)", fontWeight: 600 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: "0 15px", marginTop: -32 }}>
        {/* ══ تاب رحلتي ══ */}
        {tab === "trip" && <>
          {/* أزرار التواصل */}
          <div style={{ display: "flex", gap: 9, marginBottom: 12 }}>
            {cfg?.admin_phone && <a href={`tel:${cfg.admin_phone}`} style={{ flex: 1, borderRadius: 14, padding: "12px 6px", background: brand, color: "#fff", fontFamily: fontD, fontWeight: 800, fontSize: 11.5, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, textDecoration: "none" }}><Icon d={ICONS.phone} />إداري الحملة</a>}
            {cfg?.admin_whatsapp && <a href={`https://wa.me/${cfg.admin_whatsapp.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer" style={{ flex: 1, borderRadius: 14, padding: "12px 6px", background: "#1F7A4D", color: "#fff", fontFamily: fontD, fontWeight: 800, fontSize: 11.5, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, textDecoration: "none" }}><Icon d={ICONS.wa} />واتساب</a>}
            {showLost && <button onClick={() => setLostOpen(true)} style={{ flex: 1, border: "none", borderRadius: 14, padding: "12px 6px", background: gold, color: "#3d0f1f", fontFamily: fontD, fontWeight: 800, fontSize: 11.5, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, cursor: "pointer" }}><Icon d={ICONS.help} />أنا تائه</button>}
          </div>

          {/* بطاقة الطيران */}
          {activeFlight ? (
            <div style={{ background: "#fff", border: "1px solid #EAD9C9", borderRadius: 16, overflow: "hidden", marginBottom: 12, boxShadow: "0 3px 14px rgba(93,16,41,.06)" }}>
              <div style={{ background: `linear-gradient(90deg,${brand},#3d0f1f)`, color: "#fff", padding: "10px 15px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontFamily: fontD, fontWeight: 800, fontSize: 12, display: "flex", alignItems: "center", gap: 7 }}><Icon d={ICONS.plane} size={14} />{flightLabel}{activeFlight.airline ? ` — ${activeFlight.airline}` : ""}</div>
                {activeFlight.class && <div style={{ fontSize: 9.5, background: gold, color: "#3d0f1f", padding: "3px 10px", borderRadius: 99, fontWeight: 800 }}>{activeFlight.class}</div>}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px 6px" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: fontD, fontWeight: 900, fontSize: 23, color: brand }}>{activeFlight.from_airport || "—"}</div>
                  <div style={{ fontSize: 11.5, color: "#2B1B20", fontWeight: 700, marginTop: 3 }}>{activeFlight.time || ""}</div>
                </div>
                <div style={{ flex: 1, display: "flex", alignItems: "center", margin: "0 10px", color: gold }}>
                  <div style={{ flex: 1, borderTop: "2px dotted #EAD9C9" }} />
                  <div style={{ margin: "0 6px", transform: "scaleX(-1)" }}><Icon d={ICONS.plane} size={17} color={gold} /></div>
                  <div style={{ flex: 1, borderTop: "2px dotted #EAD9C9" }} />
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: fontD, fontWeight: 900, fontSize: 23, color: brand }}>{activeFlight.to_airport || "—"}</div>
                  <div style={{ fontSize: 11.5, color: "#2B1B20", fontWeight: 700, marginTop: 3 }}>{activeFlight.arrival_time || ""}</div>
                </div>
              </div>
              <div style={{ borderTop: "2px dashed #EAD9C9", margin: "8px 0 0", position: "relative" }}>
                <div style={{ position: "absolute", top: -9, right: -10, width: 18, height: 18, borderRadius: "50%", background: "#F8F2E4" }} />
                <div style={{ position: "absolute", top: -9, left: -10, width: 18, height: 18, borderRadius: "50%", background: "#F8F2E4" }} />
              </div>
              <div style={{ display: "flex", padding: "11px 18px 13px" }}>
                <div style={{ flex: 1, textAlign: "center" }}><div style={{ fontSize: 9, color: "#8A7580", fontWeight: 600 }}>الرحلة</div><div style={{ fontFamily: fontD, fontSize: 13, fontWeight: 800, color: "#2B1B20" }}>{activeFlight.name || "—"}</div></div>
                <div style={{ flex: 1, textAlign: "center" }}><div style={{ fontSize: 9, color: "#8A7580", fontWeight: 600 }}>التاريخ</div><div style={{ fontFamily: fontD, fontSize: 13, fontWeight: 800, color: "#2B1B20" }}>{activeFlight.date || "—"}</div></div>
              </div>
            </div>
          ) : (
            <div style={card}><div style={{ fontSize: 12, color: "#8A7580", textAlign: "center", padding: 8 }}>لم يتم تسجيل رحلة طيران بعد</div></div>
          )}

          {/* أوتوبيسي */}
          <div style={card}>
            {cardH(ICONS.bus, "أوتوبيسي", "التنقل بين المشاعر")}
            {data.bus ? <>
              {row("رقم الأوتوبيس", data.bus.name || "—", true)}
              {data.bus.type ? row("النوع", data.bus.type) : null}
            </> : <div style={{ fontSize: 12, color: "#8A7580", textAlign: "center", padding: 4 }}>لم يتم تحديد الأوتوبيس بعد</div>}
          </div>

          {/* مستنداتي */}
          {showDocs && (
            <div style={card}>
              {cardH(ICONS.doc, "مستنداتي", "للإبراز في المطار والمنافذ")}
              {[["تصريح الحج", p.hajj_permit_url], ["تذكرة الطيران", p.flight_ticket_url]].map(([t, url], i) => (
                <div key={i} onClick={() => url && setDocView({ title: t as string, url: url as string })}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 2px", borderBottom: i === 0 ? "1px dashed #EAD9C9" : "none", cursor: url ? "pointer" : "default" }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: "#2B1B20" }}>{t}</span>
                  {url
                    ? <span style={{ fontSize: 10.5, background: `${gold}22`, color: "#8a6a10", border: `1px solid ${gold}66`, padding: "4px 12px", borderRadius: 99, fontWeight: 800 }}>عرض</span>
                    : <span style={{ fontSize: 10.5, color: "#B9A8B0", fontWeight: 600 }}>لم يُرفع بعد</span>}
                </div>
              ))}
            </div>
          )}
        </>}

        {/* ══ تاب سكني ══ */}
        {tab === "stay" && <>
          <div style={card}>
            {cardH(ICONS.home, "سكني في مكة", [p.hotel_type, p.hotel_view].filter(Boolean).join(" — ") || undefined)}
            {data.room ? <>
              {row("الغرفة", data.room.number || "—", true)}
              {data.room.floor ? row("الدور", data.room.floor) : null}
              {data.room.type ? row("النوع", data.room.type) : null}
            </> : <div style={{ fontSize: 12, color: "#8A7580", textAlign: "center", padding: 4 }}>لم يتم تسكينك بعد</div>}
          </div>
          {showRoommates && data.roommates?.length > 0 && (
            <div style={card}>
              {cardH(ICONS.users, "رفقاء الغرفة", `${data.roommates.length} معك`)}
              {data.roommates.map((m, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 2px", borderBottom: i < data.roommates.length - 1 ? "1px dashed #EAD9C9" : "none" }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#F8F2E4", color: brand, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fontD, fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{m.name?.charAt(0)}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "#2B1B20", flex: 1 }}>{m.name}</div>
                  {m.is_family && <span style={{ fontSize: 8.5, background: `${gold}22`, color: "#8a6a10", border: `1px solid ${gold}88`, padding: "2px 8px", borderRadius: 99, fontWeight: 800 }}>عائلتك</span>}
                </div>
              ))}
            </div>
          )}
          <div style={card}>
            {cardH(ICONS.tent, "مخيماتي", "منى وعرفات")}
            {row("مخيم منى", p.camp_mina || "لم يُحدد بعد")}
            {row("مخيم عرفات", p.camp_arafa || "لم يُحدد بعد")}
          </div>
        </>}

        {/* ══ تاب التنبيهات ══ */}
        {tab === "alerts" && <>
          {data.announcements.length === 0 && (
            <div style={{ ...card, textAlign: "center", padding: 28 }}>
              <div style={{ color: "#C9B4BE", marginBottom: 8 }}><Icon d={ICONS.bell} size={30} color="#C9B4BE" sw={1.5} /></div>
              <div style={{ fontSize: 12.5, color: "#8A7580" }}>لا توجد تنبيهات حالياً</div>
            </div>
          )}
          {data.announcements.map(a => (
            <div key={a.id} style={{ ...card, borderRight: `3px solid ${a.priority === "عاجل" ? brand : a.priority === "مهم" ? gold : "#C9B4BE"}`, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 9.5, color: "#8A7580", fontWeight: 600 }}>{new Date(a.show_at).toLocaleString("ar-EG", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })}</span>
                {a.priority !== "عام" && <span style={{ fontSize: 8.5, background: a.priority === "عاجل" ? brand : gold, color: a.priority === "عاجل" ? "#fff" : "#3d0f1f", padding: "2px 9px", borderRadius: 99, fontWeight: 800 }}>{a.priority}</span>}
              </div>
              <div style={{ fontSize: 12.5, color: "#2B1B20", fontWeight: 600, marginTop: 6, lineHeight: 1.9 }}>{a.body}</div>
            </div>
          ))}
        </>}
      </div>

      {/* ══ الشريط السفلي ══ */}
      <div style={{ position: "fixed", bottom: 0, right: 0, left: 0, background: "#fff", borderTop: "1px solid #EAD9C9", display: "flex", padding: "7px 8px calc(7px + env(safe-area-inset-bottom))", zIndex: 50 }}>
        {[
          { id: "trip", label: "رحلتي", icon: ICONS.plane },
          { id: "stay", label: "سكني", icon: ICONS.home },
          { id: "alerts", label: "التنبيهات", icon: ICONS.bell },
        ].map(t => (
          <button key={t.id} onClick={() => { setTab(t.id as typeof tab); if (t.id === "alerts") { setSeenAlerts(data.announcements.length); sessionStorage.setItem("portal_seen_alerts", String(data.announcements.length)); } }}
            style={{ flex: 1, border: "none", background: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, fontFamily: font, fontSize: 9.5, fontWeight: 700, color: tab === t.id ? brand : "#8A7580", cursor: "pointer", padding: "5px 0", position: "relative" }}>
            <Icon d={t.icon} size={19} color={tab === t.id ? brand : "#8A7580"} />
            {t.label}
            {t.id === "alerts" && unread > 0 && <span style={{ position: "absolute", top: 2, left: "calc(50% - 16px)", width: 8, height: 8, borderRadius: "50%", background: brand }} />}
          </button>
        ))}
      </div>
    </div>
  );
}

export { PilgrimPortal };
