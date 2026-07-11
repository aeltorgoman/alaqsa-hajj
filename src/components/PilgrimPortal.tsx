import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabase";

/* ═══════════════════════════════════════════════════════════════
   بوابة الحاج — النسخة الاحترافية
   نظام ألوان وخطوط منضبط من أربعة مستويات:
   ١) عناوين وأسماء: Cairo عريض جداً بلون الحبر الغامق
   ٢) قيم مهمة: Cairo أسود الوزن بالبوردو أو الذهبي الغامق — الأكبر في كل بطاقة
   ٣) نص عادي: IBM Plex متوسط 14+ بلون غامق كامل
   ٤) تسميات صغيرة: مقروءة وليست شاحبة
   الذهبي الفاتح للخلفيات الداكنة فقط، والذهبي الغامق للفاتحة
   ═══════════════════════════════════════════════════════════════ */

type PortalData = {
  pilgrim: { name_ar: string; name_en: string; gender: string; photo_url: string | null; hajj_permit_url: string | null; flight_ticket_url: string | null; hotel_type: string | null; hotel_view: string | null; camp_mina: string | null; camp_arafa: string | null; phone: string | null };
  bus: { name: string; type: string } | null;
  room: { number: string; floor: string; type: string } | null;
  roommates: { name: string; is_family: boolean }[];
  flight_go: FlightInfo | null;
  flight_back: FlightInfo | null;
  config: PortalConfig | null;
  announcements: { id: number; body: string; priority: string; show_at: string }[];
};
type FlightInfo = { name: string; airline: string; from_airport: string; to_airport: string; date: string; time: string; arrival_time: string; arrival_date: string; class: string };
type PortalConfig = { name_ar: string; logo_url: string | null; tagline: string | null; color_primary: string | null; color_accent: string | null; season_label: string | null; admin_name: string | null; admin_phone: string | null; admin_whatsapp: string | null; features: Record<string, boolean> | null; country: string | null; city: string | null; hotel_name: string | null; hotel_address: string | null; camp_mina_address: string | null; camp_arafa_address: string | null };

/* ─── أقرب يوم عرفة: القادم، أو الفائت خلال ٤٠ يوماً (فترة ما بعد الحج) ─── */
function getSeasonArafa(): Date {
  try {
    const fmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { year: "numeric", month: "numeric", day: "numeric" });
    const start = new Date();
    start.setDate(start.getDate() - 40);
    for (let i = 0; i < 420; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const parts = fmt.formatToParts(d);
      const m = parseInt(parts.find(p => p.type === "month")!.value);
      const dd = parseInt(parts.find(p => p.type === "day")!.value);
      if (m === 12 && dd === 9) { d.setHours(0, 0, 0, 0); return d; }
    }
  } catch { /* متصفحات قديمة */ }
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
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  star: '<path d="M12 2l2.4 4.8L19.5 8l-3.5 4 .7 5.5L12 15l-4.7 2.5.7-5.5-3.5-4 5.1-1.2z"/>',
  kaaba: '<path d="M4 7l8-4 8 4v10l-8 4-8-4z"/><path d="M4 7l8 4 8-4M12 11v10"/>',
};

function Icon({ d, size = 18, color = "currentColor", sw = 2 }: { d: string; size?: number; color?: string; sw?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} dangerouslySetInnerHTML={{ __html: d }} />;
}

/* نقش النجمة الثمانية للخلفيات الداكنة */
const STAR_PATTERN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='84' height='84' viewBox='0 0 84 84'%3E%3Cg fill='none' stroke='%23D4A017' stroke-width='1'%3E%3Cpath d='M42 10l8 16 17 3.5-11.5 13.5 2.5 18-16-8-16 8 2.5-18L17 29.5 34 26z'/%3E%3C/g%3E%3C/svg%3E")`;

const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

/* ─── نظام الألوان الثابت للنصوص ─── */
const INK = "#241318";        // العناوين والقيم على الفاتح
const BODY = "#3E2B33";       // النص العادي على الفاتح
const LABEL = "#7A6570";      // التسميات الصغيرة (مقروءة)
const GOLD_DARK = "#8a6a10";  // الذهبي على الخلفيات الفاتحة
const LINE = "#E8D5C4";
const IVORY = "#F8F2E4";

function PilgrimPortal() {
  /* تحميل الخطوط */
  useEffect(() => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Cairo:wght@500;700;800;900&family=El+Messiri:wght@600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap";
    document.head.appendChild(l);
    return () => { document.head.removeChild(l); };
  }, []);

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

  /* تحديث التنبيهات دورياً */
  useEffect(() => {
    if (!data) return;
    const refresh = async () => {
      const { data: anns } = await supabase
        .from("announcements").select("id,body,priority,show_at")
        .lte("show_at", new Date().toISOString())
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order("show_at", { ascending: false });
      if (anns) setData(d => d ? { ...d, announcements: [...anns].sort((a, b) => (b.priority === "عاجل" ? 1 : 0) - (a.priority === "عاجل" ? 1 : 0)) } : d);
    };
    const t = setInterval(refresh, 60000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!data]);

  const cfg = data?.config;
  const brand = cfg?.color_primary || "#7D1F3C";
  const brandDeep = "#3d0f1f";
  const gold = cfg?.color_accent || "#D4A017";
  const features = cfg?.features || {};
  const showRoommates = features.portal_roommates !== false;
  const showLost = features.portal_lost_card !== false;
  const showDocs = features.portal_documents !== false;

  const arafa = useMemo(() => getSeasonArafa(), []);
  const postHajj = now > arafa.getTime() + 86400000;          // بعد عرفة بيوم: العودة + التهنئة
  const activeFlight = postHajj && data?.flight_back ? data.flight_back : data?.flight_go;
  const flightLabel = postHajj && data?.flight_back ? "رحلة العودة" : "رحلة الذهاب";

  const diff = Math.max(0, arafa.getTime() - now);
  const cd = { d: Math.floor(diff / 86400000), h: Math.floor(diff / 3600000) % 24, m: Math.floor(diff / 60000) % 60, s: Math.floor(diff / 1000) % 60 };

  const unread = (data?.announcements?.length || 0) - seenAlerts;

  const font = "'IBM Plex Sans Arabic','Cairo',sans-serif";
  const fontD = "'Cairo',sans-serif";
  const fontT = "'El Messiri','Cairo',sans-serif";

  async function login() {
    setLoginError("");
    if (!doc.trim()) { setLoginError("يرجى إدخال رقم الجواز أو البطاقة."); return; }
    if (!day || !month || !year) { setLoginError("يرجى اختيار تاريخ الميلاد كاملاً."); return; }
    setLoading(true);
    try {
      const { data: res, error } = await supabase.rpc("get_pilgrim_portal", {
        p_doc: doc.trim(), p_day: Number(day), p_month: Number(month), p_year: Number(year),
      });
      if (error || !res) setLoginError("البيانات غير صحيحة. تأكد من رقم الجواز أو البطاقة وتاريخ الميلاد.");
      else { setData(res as unknown as PortalData); sessionStorage.setItem("portal_data", JSON.stringify(res)); }
    } catch { setLoginError("تعذر الاتصال، يرجى المحاولة مرة أخرى."); }
    setLoading(false);
  }

  function logout() {
    sessionStorage.removeItem("portal_data");
    setData(null); setDoc(""); setDay(""); setMonth(""); setYear("");
  }

  /* ═══ شريط هوية الحملة — ثابت في كل الشاشات ═══ */
  const BrandBar = ({ dark = true }: { dark?: boolean }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "14px 16px 12px", background: dark ? "transparent" : "#fff", borderBottom: dark ? "none" : `1px solid ${LINE}` }}>
      <div style={{ width: 46, height: 46, borderRadius: "50%", border: `2px solid ${gold}`, background: dark ? "rgba(212,160,23,.1)" : IVORY, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {cfg?.logo_url
          ? <img src={cfg.logo_url} alt="" style={{ width: 30, height: 30, objectFit: "contain" }} />
          : <Icon d={ICONS.star} size={24} color={gold} sw={1.5} />}
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontFamily: fontT, fontSize: 20, fontWeight: 700, color: dark ? "#fff" : INK, lineHeight: 1.2 }}>{cfg?.name_ar || "بوابة الحاج"}</div>
        <div style={{ fontFamily: font, fontSize: 12, fontWeight: 600, color: dark ? gold : GOLD_DARK, marginTop: 2 }}>
          بوابة الحاج{cfg?.season_label ? ` — ${cfg.season_label}` : ""}
        </div>
      </div>
    </div>
  );

  /* ═══════════ شاشة الدخول ═══════════ */
  if (!data) {
    const yearNow = new Date().getFullYear();
    return (
      <div dir="rtl" style={{ minHeight: "100dvh", background: `linear-gradient(168deg,${brand} 0%,${brandDeep} 85%)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: font, color: "#fff", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, opacity: .07, backgroundImage: STAR_PATTERN, pointerEvents: "none" }} />
        <div style={{ width: "100%", maxWidth: 400, position: "relative" }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ width: 100, height: 100, borderRadius: "50%", border: `2.5px solid ${gold}`, background: "rgba(255,255,255,.07)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px", boxShadow: `0 0 0 8px rgba(212,160,23,.08)` }}>
              {cfg?.logo_url
                ? <img src={cfg.logo_url} alt="" style={{ width: 62, height: 62, objectFit: "contain" }} />
                : <Icon d={ICONS.star} size={48} color={gold} sw={1.3} />}
            </div>
            <div style={{ fontFamily: fontT, fontSize: 30, fontWeight: 700 }}>{cfg?.name_ar || "بوابة الحاج"}</div>
            <div style={{ fontSize: 14, color: gold, marginTop: 7, fontWeight: 700 }}>بوابة الحاج {cfg?.season_label ? `— ${cfg.season_label}` : ""}</div>
          </div>

          <label style={{ display: "block", fontSize: 13.5, color: gold, fontWeight: 700, marginBottom: 8 }}>رقم جواز السفر أو البطاقة الشخصية</label>
          <input value={doc} onChange={e => setDoc(e.target.value)} placeholder="A12345678"
            style={{ width: "100%", padding: "15px 16px", borderRadius: 14, border: "1.5px solid rgba(255,255,255,.3)", background: "rgba(255,255,255,.11)", color: "#fff", fontSize: 17, fontWeight: 600, fontFamily: font, direction: "ltr", textAlign: "left", letterSpacing: 1.5, outline: "none", boxSizing: "border-box" }} />

          <label style={{ display: "block", fontSize: 13.5, color: gold, fontWeight: 700, margin: "18px 0 8px" }}>تاريخ الميلاد</label>
          <div style={{ display: "flex", gap: 9 }}>
            {[
              { v: day, set: setDay, ph: "اليوم", opts: Array.from({ length: 31 }, (_, i) => ({ v: String(i + 1), t: String(i + 1) })) },
              { v: month, set: setMonth, ph: "الشهر", opts: MONTHS_AR.map((m, i) => ({ v: String(i + 1), t: m })) },
              { v: year, set: setYear, ph: "السنة", opts: Array.from({ length: 100 }, (_, i) => ({ v: String(yearNow - 18 - i), t: String(yearNow - 18 - i) })) },
            ].map((f, i) => (
              <select key={i} value={f.v} onChange={e => f.set(e.target.value)}
                style={{ flex: i === 1 ? 1.4 : 1, padding: "15px 8px", borderRadius: 14, border: "1.5px solid rgba(255,255,255,.3)", background: "rgba(255,255,255,.11)", color: f.v ? "#fff" : "rgba(255,255,255,.6)", fontSize: 15, fontWeight: 600, fontFamily: font, outline: "none", appearance: "none", textAlign: "center" }}>
                <option value="" disabled style={{ color: "#333" }}>{f.ph}</option>
                {f.opts.map(o => <option key={o.v} value={o.v} style={{ color: "#333" }}>{o.t}</option>)}
              </select>
            ))}
          </div>

          {loginError && <div style={{ marginTop: 16, fontSize: 13.5, fontWeight: 600, background: "rgba(255,80,80,.16)", border: "1px solid rgba(255,130,130,.45)", borderRadius: 12, padding: "12px 14px", lineHeight: 1.9 }}>{loginError}</div>}

          <button onClick={login} disabled={loading}
            style={{ width: "100%", marginTop: 24, padding: 17, border: "none", borderRadius: 14, background: gold, color: brandDeep, fontFamily: fontD, fontWeight: 900, fontSize: 17.5, cursor: "pointer", opacity: loading ? .6 : 1, boxShadow: "0 6px 20px rgba(212,160,23,.35)" }}>
            {loading ? "جارٍ التحقق..." : "دخول إلى رحلتي"}
          </button>

          <div style={{ textAlign: "center", fontSize: 12.5, color: "rgba(255,255,255,.75)", fontWeight: 500, marginTop: 24, lineHeight: 2.1 }}>
            بياناتك محمية ولا تظهر إلا لك ولإدارة الحملة
            {cfg?.admin_phone && <><br />للمساعدة: <span style={{ direction: "ltr", display: "inline-block", color: gold, fontWeight: 700 }}>{cfg.admin_phone}</span></>}
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════ مكونات مشتركة ═══════════ */
  const p = data.pilgrim;
  const card: React.CSSProperties = { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 18, padding: 18, marginBottom: 13, boxShadow: "0 4px 18px rgba(93,16,41,.07)" };
  const cardH = (icon: string, title: string, sub?: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 13 }}>
      <div style={{ width: 40, height: 40, borderRadius: 11, background: IVORY, border: `1px solid ${LINE}`, display: "flex", alignItems: "center", justifyContent: "center", color: brand, flexShrink: 0 }}><Icon d={icon} size={20} /></div>
      <div>
        <div style={{ fontFamily: fontD, fontWeight: 800, fontSize: 16.5, color: INK }}>{title}</div>
        {sub && <div style={{ fontSize: 12.5, fontWeight: 600, color: LABEL, marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
  const row = (k: string, v: string, big = false) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 2px", borderBottom: `1px dashed ${LINE}` }}>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: LABEL }}>{k}</span>
      <span style={{ fontFamily: big ? fontD : font, fontWeight: big ? 900 : 700, fontSize: big ? 19 : 14.5, color: big ? brand : BODY }}>{v}</span>
    </div>
  );

  /* ═══════════ عرض مستند ═══════════ */
  if (docView) {
    const isPdf = docView.url.toLowerCase().includes(".pdf");
    return (
      <div dir="rtl" style={{ minHeight: "100dvh", background: "#1c0d12", fontFamily: font, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, color: "#fff" }}>
          <button onClick={() => setDocView(null)} style={{ background: "rgba(255,255,255,.12)", border: "none", borderRadius: 12, width: 42, height: 42, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon d={ICONS.back} size={20} /></button>
          <div style={{ fontFamily: fontD, fontWeight: 800, fontSize: 17.5, flex: 1 }}>{docView.title}</div>
          <a href={docView.url} download target="_blank" rel="noreferrer" style={{ background: gold, borderRadius: 12, padding: "10px 18px", color: brandDeep, fontSize: 14, fontWeight: 800, textDecoration: "none", display: "flex", alignItems: "center", gap: 7, fontFamily: fontD }}><Icon d={ICONS.download} size={16} />تنزيل</a>
        </div>
        <div style={{ flex: 1, padding: "0 12px 12px" }}>
          {isPdf
            ? <iframe src={docView.url} title={docView.title} style={{ width: "100%", height: "100%", minHeight: "82dvh", border: "none", borderRadius: 14, background: "#fff" }} />
            : <img src={docView.url} alt={docView.title} style={{ width: "100%", borderRadius: 14 }} />}
        </div>
      </div>
    );
  }

  /* ═══════════ كارت أنا تائه ═══════════ */
  if (lostOpen) {
    return (
      <div dir="rtl" style={{ minHeight: "100dvh", background: "#1c0d12", fontFamily: font, padding: 16 }}>
        <button onClick={() => setLostOpen(false)} style={{ background: "rgba(255,255,255,.12)", border: "none", borderRadius: 12, width: 42, height: 42, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}><Icon d={ICONS.back} size={20} /></button>
        <div style={{ background: `linear-gradient(170deg,${brand},${brandDeep})`, borderRadius: 22, color: "#fff", padding: "30px 22px", textAlign: "center", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, opacity: .08, backgroundImage: STAR_PATTERN, pointerEvents: "none" }} />
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 6 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", border: `2px solid ${gold}`, background: "rgba(212,160,23,.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {cfg?.logo_url ? <img src={cfg.logo_url} alt="" style={{ width: 26, height: 26, objectFit: "contain" }} /> : <Icon d={ICONS.star} size={20} color={gold} sw={1.5} />}
              </div>
              <div style={{ fontFamily: fontT, fontSize: 22, fontWeight: 700 }}>{cfg?.name_ar || "الحملة"}</div>
            </div>
            <div style={{ fontSize: 12, color: gold, letterSpacing: 2.5, fontWeight: 700, direction: "ltr" }}>HAJJ GROUP{cfg?.country ? ` — ${cfg.country.toUpperCase()}` : ""}</div>

            <div style={{ fontFamily: fontD, fontSize: 30, fontWeight: 900, marginTop: 22, lineHeight: 1.4 }}>{p.name_ar}</div>
            <div style={{ fontSize: 16, direction: "ltr", color: "#fff", marginTop: 5, fontWeight: 600, opacity: .95 }}>{p.name_en}</div>

            <div style={{ background: "rgba(212,160,23,.14)", border: `1.5px solid ${gold}77`, borderRadius: 14, padding: "13px 14px", marginTop: 20, fontSize: 14.5, fontWeight: 600, lineHeight: 2.1, textAlign: "right" }}>
              {(cfg?.hotel_name || data.room) && <div>الفندق: {cfg?.hotel_name || ""} {data.room ? `— غرفة ${data.room.number}` : ""}</div>}
              {p.camp_mina && <div>مخيم منى: {p.camp_mina}{cfg?.camp_mina_address ? ` — ${cfg.camp_mina_address}` : ""}</div>}
              {p.camp_arafa && <div>مخيم عرفات: {p.camp_arafa}{cfg?.camp_arafa_address ? ` — ${cfg.camp_arafa_address}` : ""}</div>}
            </div>

            {cfg?.admin_phone && <>
              <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.85)", fontWeight: 600, marginTop: 20 }}>رقم الطوارئ · Emergency</div>
              <a href={`tel:${cfg.admin_phone}`} style={{ fontFamily: fontD, fontSize: 32, fontWeight: 900, color: gold, direction: "ltr", display: "block", marginTop: 6, letterSpacing: 1, textDecoration: "none" }}>{cfg.admin_phone}</a>
              {cfg.admin_name && <div style={{ fontSize: 13.5, fontWeight: 600, color: "rgba(255,255,255,.85)", marginTop: 4 }}>{cfg.admin_name}</div>}
            </>}
          </div>
        </div>
        <div style={{ ...card, textAlign: "center", marginTop: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: BODY, lineHeight: 2.1 }}>أظهر هذه الشاشة لأي رجل أمن أو مسؤول<br />وسيتم التواصل مع حملتك فوراً</div>
        </div>
      </div>
    );
  }

  /* ═══════════ الواجهة الرئيسية ═══════════ */
  return (
    <div dir="rtl" style={{ minHeight: "100dvh", background: IVORY, fontFamily: font, paddingBottom: 96 }}>
      {/* الهيدر: هوية الحملة → ترحيب الحاج → العداد */}
      <div style={{ background: `linear-gradient(160deg,${brand},${brandDeep})`, color: "#fff", padding: "0 18px 54px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, opacity: .07, backgroundImage: STAR_PATTERN, pointerEvents: "none" }} />
        <div style={{ position: "relative" }}>
          <BrandBar />
          <div style={{ height: 1, background: `linear-gradient(90deg,transparent,${gold}66,transparent)`, margin: "0 -4px 14px" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            {p.photo_url
              ? <img src={p.photo_url} alt="" style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", border: "2.5px solid rgba(255,255,255,.5)" }} />
              : <div style={{ width: 56, height: 56, borderRadius: "50%", background: gold, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fontD, fontWeight: 900, fontSize: 22, color: brandDeep, border: "2.5px solid rgba(255,255,255,.5)" }}>{p.name_ar?.charAt(0)}</div>}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: gold, fontWeight: 700 }}>{p.gender === "أنثى" ? "حياك الله يا حاجة" : "حياك الله يا حاج"}</div>
              <div style={{ fontFamily: fontD, fontSize: 20, fontWeight: 900, marginTop: 2, lineHeight: 1.4 }}>{p.name_ar}</div>
            </div>
            <button onClick={logout} style={{ background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.3)", color: "#fff", borderRadius: 99, fontSize: 12.5, padding: "7px 15px", cursor: "pointer", fontFamily: font, fontWeight: 700 }}>خروج</button>
          </div>

          {postHajj ? (
            <div style={{ marginTop: 17, background: "rgba(212,160,23,.14)", border: `1.5px solid ${gold}66`, borderRadius: 18, padding: "17px 16px", textAlign: "center" }}>
              <Icon d={ICONS.kaaba} size={26} color={gold} sw={1.6} />
              <div style={{ fontFamily: fontT, fontSize: 21, fontWeight: 700, color: "#fff", marginTop: 8 }}>تقبل الله حجكم وسعيكم</div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: gold, marginTop: 4 }}>حجاً مبروراً وسعياً مشكوراً وذنباً مغفوراً</div>
            </div>
          ) : diff > 0 && (
            <div style={{ marginTop: 17, background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.22)", borderRadius: 18, padding: "15px 16px", backdropFilter: "blur(8px)" }}>
              <div style={{ fontSize: 13, color: gold, fontWeight: 800, display: "flex", alignItems: "center", gap: 7 }}><Icon d={ICONS.clock} size={15} />المتبقي على الوقوف بعرفات</div>
              <div style={{ display: "flex", gap: 9, marginTop: 11 }}>
                {[[cd.d, "يوم"], [cd.h, "ساعة"], [cd.m, "دقيقة"], [cd.s, "ثانية"]].map(([v, l], i) => (
                  <div key={i} style={{ flex: 1, textAlign: "center", background: "rgba(0,0,0,.22)", borderRadius: 12, padding: "10px 0" }}>
                    <div style={{ fontFamily: fontD, fontSize: 26, fontWeight: 900, color: "#fff" }}>{String(v).padStart(2, "0")}</div>
                    <div style={{ fontSize: 11, color: gold, fontWeight: 700, marginTop: 1 }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: "0 15px", marginTop: -34, position: "relative" }}>
        {/* ══ تاب رحلتي ══ */}
        {tab === "trip" && <>
          <div style={{ display: "flex", gap: 10, marginBottom: 13 }}>
            {cfg?.admin_phone && <a href={`tel:${cfg.admin_phone}`} style={{ flex: 1, borderRadius: 16, padding: "14px 6px", background: brand, color: "#fff", fontFamily: fontD, fontWeight: 800, fontSize: 13.5, display: "flex", flexDirection: "column", alignItems: "center", gap: 7, textDecoration: "none", boxShadow: "0 4px 14px rgba(125,31,60,.3)" }}><Icon d={ICONS.phone} size={21} />إداري الحملة</a>}
            {cfg?.admin_whatsapp && <a href={`https://wa.me/${cfg.admin_whatsapp.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer" style={{ flex: 1, borderRadius: 16, padding: "14px 6px", background: "#1F7A4D", color: "#fff", fontFamily: fontD, fontWeight: 800, fontSize: 13.5, display: "flex", flexDirection: "column", alignItems: "center", gap: 7, textDecoration: "none", boxShadow: "0 4px 14px rgba(31,122,77,.3)" }}><Icon d={ICONS.wa} size={21} />واتساب</a>}
            {showLost && <button onClick={() => setLostOpen(true)} style={{ flex: 1, border: "none", borderRadius: 16, padding: "14px 6px", background: gold, color: brandDeep, fontFamily: fontD, fontWeight: 800, fontSize: 13.5, display: "flex", flexDirection: "column", alignItems: "center", gap: 7, cursor: "pointer", boxShadow: "0 4px 14px rgba(212,160,23,.35)" }}><Icon d={ICONS.help} size={21} />أنا تائه</button>}
          </div>

          {/* بطاقة الطيران */}
          {activeFlight ? (
            <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 18, overflow: "hidden", marginBottom: 13, boxShadow: "0 4px 18px rgba(93,16,41,.07)" }}>
              <div style={{ background: `linear-gradient(90deg,${brand},${brandDeep})`, color: "#fff", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontFamily: fontD, fontWeight: 800, fontSize: 14.5, display: "flex", alignItems: "center", gap: 8 }}><Icon d={ICONS.plane} size={17} />{flightLabel}{activeFlight.airline ? ` — ${activeFlight.airline}` : ""}</div>
                {activeFlight.class && <div style={{ fontSize: 11.5, background: gold, color: brandDeep, padding: "4px 13px", borderRadius: 99, fontWeight: 800, fontFamily: fontD }}>{activeFlight.class}</div>}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px 8px" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: fontD, fontWeight: 900, fontSize: 30, color: brand, letterSpacing: 1 }}>{activeFlight.from_airport || "—"}</div>
                  <div style={{ fontFamily: fontD, fontSize: 16, color: INK, fontWeight: 800, marginTop: 3, direction: "ltr" }}>{activeFlight.time || ""}</div>
                </div>
                <div style={{ flex: 1, display: "flex", alignItems: "center", margin: "0 12px" }}>
                  <div style={{ flex: 1, borderTop: `2px dotted ${LINE}` }} />
                  <div style={{ margin: "0 8px", transform: "scaleX(-1)" }}><Icon d={ICONS.plane} size={20} color={GOLD_DARK} /></div>
                  <div style={{ flex: 1, borderTop: `2px dotted ${LINE}` }} />
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: fontD, fontWeight: 900, fontSize: 30, color: brand, letterSpacing: 1 }}>{activeFlight.to_airport || "—"}</div>
                  <div style={{ fontFamily: fontD, fontSize: 16, color: INK, fontWeight: 800, marginTop: 3, direction: "ltr" }}>{activeFlight.arrival_time || ""}</div>
                </div>
              </div>
              <div style={{ borderTop: `2px dashed ${LINE}`, margin: "10px 0 0", position: "relative" }}>
                <div style={{ position: "absolute", top: -10, right: -11, width: 20, height: 20, borderRadius: "50%", background: IVORY, border: `1px solid ${LINE}` }} />
                <div style={{ position: "absolute", top: -10, left: -11, width: 20, height: 20, borderRadius: "50%", background: IVORY, border: `1px solid ${LINE}` }} />
              </div>
              <div style={{ display: "flex", padding: "13px 18px 15px" }}>
                <div style={{ flex: 1, textAlign: "center" }}><div style={{ fontSize: 11.5, color: LABEL, fontWeight: 700 }}>الرحلة</div><div style={{ fontFamily: fontD, fontSize: 17, fontWeight: 900, color: INK, marginTop: 2, direction: "ltr" }}>{activeFlight.name || "—"}</div></div>
                <div style={{ width: 1, background: LINE }} />
                <div style={{ flex: 1, textAlign: "center" }}><div style={{ fontSize: 11.5, color: LABEL, fontWeight: 700 }}>التاريخ</div><div style={{ fontFamily: fontD, fontSize: 17, fontWeight: 900, color: INK, marginTop: 2, direction: "ltr" }}>{activeFlight.date || "—"}</div></div>
              </div>
            </div>
          ) : (
            <div style={card}><div style={{ fontSize: 14, fontWeight: 600, color: LABEL, textAlign: "center", padding: 10 }}>لم يتم تسجيل رحلة طيران بعد</div></div>
          )}

          <div style={card}>
            {cardH(ICONS.bus, "أوتوبيسي", "التنقل بين المشاعر")}
            {data.bus ? <>
              {row("رقم الأوتوبيس", data.bus.name || "—", true)}
              {data.bus.type ? row("النوع", data.bus.type) : null}
            </> : <div style={{ fontSize: 14, fontWeight: 600, color: LABEL, textAlign: "center", padding: 6 }}>لم يتم تحديد الأوتوبيس بعد</div>}
          </div>

          {showDocs && (
            <div style={card}>
              {cardH(ICONS.doc, "مستنداتي", "للإبراز في المطار والمنافذ")}
              {[["تصريح الحج", p.hajj_permit_url], ["تذكرة الطيران", p.flight_ticket_url]].map(([t, url], i) => (
                <div key={i} onClick={() => url && setDocView({ title: t as string, url: url as string })}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 2px", borderBottom: i === 0 ? `1px dashed ${LINE}` : "none", cursor: url ? "pointer" : "default" }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: INK }}>{t}</span>
                  {url
                    ? <span style={{ fontSize: 13, background: brand, color: "#fff", padding: "6px 18px", borderRadius: 99, fontWeight: 800, fontFamily: fontD }}>عرض</span>
                    : <span style={{ fontSize: 13, color: LABEL, fontWeight: 600 }}>لم يُرفع بعد</span>}
                </div>
              ))}
            </div>
          )}
        </>}

        {/* ══ تاب سكني ══ */}
        {tab === "stay" && <>
          <div style={card}>
            {cardH(ICONS.home, cfg?.hotel_name ? `فندق ${cfg.hotel_name}` : "سكني في مكة", [p.hotel_type, p.hotel_view].filter(Boolean).join(" — ") || undefined)}
            {data.room ? <>
              {row("الغرفة", data.room.number || "—", true)}
              {data.room.floor ? row("الدور", data.room.floor) : null}
              {data.room.type ? row("النوع", data.room.type) : null}
            </> : <div style={{ fontSize: 14, fontWeight: 600, color: LABEL, textAlign: "center", padding: 6 }}>لم يتم تسكينك بعد</div>}
            {cfg?.hotel_address && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 11, background: IVORY, border: `1px solid ${LINE}`, borderRadius: 12, padding: "10px 12px" }}>
                <Icon d={ICONS.pin} size={17} color={GOLD_DARK} />
                <span style={{ fontSize: 13.5, fontWeight: 600, color: BODY, lineHeight: 1.9 }}>{cfg.hotel_address}</span>
              </div>
            )}
          </div>

          {showRoommates && data.roommates?.length > 0 && (
            <div style={card}>
              {cardH(ICONS.users, "رفقاء الغرفة", `${data.roommates.length} معك في الغرفة`)}
              {data.roommates.map((m, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 2px", borderBottom: i < data.roommates.length - 1 ? `1px dashed ${LINE}` : "none" }}>
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: IVORY, border: `1px solid ${LINE}`, color: brand, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fontD, fontWeight: 800, fontSize: 15, flexShrink: 0 }}>{m.name?.charAt(0)}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: INK, flex: 1 }}>{m.name}</div>
                  {m.is_family && <span style={{ fontSize: 11, background: gold, color: brandDeep, padding: "3px 12px", borderRadius: 99, fontWeight: 800, fontFamily: fontD }}>عائلتك</span>}
                </div>
              ))}
            </div>
          )}

          <div style={card}>
            {cardH(ICONS.tent, "مخيماتي", "منى وعرفات")}
            <div style={{ padding: "10px 2px", borderBottom: `1px dashed ${LINE}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: LABEL }}>مخيم منى</span>
                <span style={{ fontFamily: fontD, fontWeight: 900, fontSize: 16.5, color: brand }}>{p.camp_mina || "لم يُحدد بعد"}</span>
              </div>
              {cfg?.camp_mina_address && <div style={{ fontSize: 13, fontWeight: 600, color: BODY, marginTop: 5, display: "flex", gap: 6, alignItems: "flex-start", lineHeight: 1.8 }}><Icon d={ICONS.pin} size={15} color={GOLD_DARK} />{cfg.camp_mina_address}</div>}
            </div>
            <div style={{ padding: "10px 2px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: LABEL }}>مخيم عرفات</span>
                <span style={{ fontFamily: fontD, fontWeight: 900, fontSize: 16.5, color: brand }}>{p.camp_arafa || "لم يُحدد بعد"}</span>
              </div>
              {cfg?.camp_arafa_address && <div style={{ fontSize: 13, fontWeight: 600, color: BODY, marginTop: 5, display: "flex", gap: 6, alignItems: "flex-start", lineHeight: 1.8 }}><Icon d={ICONS.pin} size={15} color={GOLD_DARK} />{cfg.camp_arafa_address}</div>}
            </div>
          </div>
        </>}

        {/* ══ تاب التنبيهات ══ */}
        {tab === "alerts" && <>
          {data.announcements.length === 0 && (
            <div style={{ ...card, textAlign: "center", padding: 32 }}>
              <Icon d={ICONS.bell} size={36} color={LABEL} sw={1.5} />
              <div style={{ fontSize: 14.5, fontWeight: 600, color: LABEL, marginTop: 10 }}>لا توجد تنبيهات حالياً</div>
            </div>
          )}
          {data.announcements.map(a => (
            <div key={a.id} style={{ ...card, borderRight: `4px solid ${a.priority === "عاجل" ? brand : a.priority === "مهم" ? gold : LINE}`, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: LABEL, fontWeight: 700 }}>{new Date(a.show_at).toLocaleString("ar-EG", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })}</span>
                {a.priority !== "عام" && <span style={{ fontSize: 11.5, fontFamily: fontD, background: a.priority === "عاجل" ? brand : gold, color: a.priority === "عاجل" ? "#fff" : brandDeep, padding: "3px 13px", borderRadius: 99, fontWeight: 800 }}>{a.priority}</span>}
              </div>
              <div style={{ fontSize: 15, color: INK, fontWeight: 600, marginTop: 8, lineHeight: 2 }}>{a.body}</div>
            </div>
          ))}
        </>}
      </div>

      {/* ══ الشريط السفلي — كبير وواضح ══ */}
      <div style={{ position: "fixed", bottom: 0, right: 0, left: 0, background: "#fff", borderTop: `1px solid ${LINE}`, boxShadow: "0 -4px 20px rgba(93,16,41,.08)", display: "flex", padding: "9px 10px calc(9px + env(safe-area-inset-bottom))", zIndex: 50 }}>
        {[
          { id: "trip", label: "رحلتي", icon: ICONS.plane },
          { id: "stay", label: "سكني", icon: ICONS.home },
          { id: "alerts", label: "التنبيهات", icon: ICONS.bell },
        ].map(t => {
          const on = tab === t.id;
          return (
            <button key={t.id} onClick={() => { setTab(t.id as typeof tab); if (t.id === "alerts") { setSeenAlerts(data.announcements.length); sessionStorage.setItem("portal_seen_alerts", String(data.announcements.length)); } }}
              style={{ flex: 1, border: "none", background: on ? `${brand}14` : "none", borderRadius: 14, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, fontFamily: fontD, fontSize: 13.5, fontWeight: 800, color: on ? brand : LABEL, cursor: "pointer", padding: "9px 0 7px", position: "relative", margin: "0 3px", transition: "background .2s,color .2s" }}>
              <Icon d={t.icon} size={26} color={on ? brand : LABEL} sw={on ? 2.2 : 1.9} />
              {t.label}
              {t.id === "alerts" && unread > 0 && <span style={{ position: "absolute", top: 6, left: "calc(50% - 20px)", width: 10, height: 10, borderRadius: "50%", background: brand, border: "2px solid #fff" }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { PilgrimPortal };
