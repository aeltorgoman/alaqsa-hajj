import { useEffect, useMemo, useState } from "react";
import { portalDocUrl, usePortalDoc, type PortalCreds, type PortalDocType } from "../utils";
import { portalSupabase } from "../portalSupabase";
import {
  getPushState, enablePush, disablePush, markNotificationRead,
  registerServiceWorker, resubscribeIfNeeded,
  type PushState,
} from "../utils/pushClient";
import { setupPortalManifest } from "../utils/portalManifest";

/* ═══════════════════════════════════════════════════════════════
   بوابة الحاج — النسخة الثالثة
   • أحجام كبيرة وواضحة (كبار السن أولاً)
   • ثلاثة ألوان مستخدمة بجرأة: بوردو، ذهبي ساطع، عاجي — بتباين حقيقي
   • دخول مرة واحدة (localStorage) مع تحديث تلقائي للبيانات عند كل فتح
   • تاريخ الميلاد: قوائم منسدلة أو كتابة مباشرة
   • عناوين تفتح الخريطة بضغطة واحدة على أي جهاز
   • بانر التنبيه العاجل فوق كل التبويبات حتى يضغط الحاج "فهمت"
   ═══════════════════════════════════════════════════════════════ */

type PortalData = {
  /* ق٦ — العميل يستلم وجود المستند لا مفتاحه، والرابط من `pilgrim-doc` */
  pilgrim: { name_ar: string; name_en: string; short_ar?: string | null; gender: string; has_photo: boolean; has_hajj_permit: boolean; has_flight_ticket: boolean; hotel_type: string | null; hotel_view: string | null; camp_mina: string | null; camp_arafa: string | null; camp_mina_name?: string | null; camp_arafa_name?: string | null; phone: string | null };
  bus: { name: string; type: string } | null;
  room: { number: string; floor: string; type: string } | null;
  roommates: { name: string; is_family: boolean }[];
  family: { name: string; short_ar?: string | null; gender: string; room_number: string | null; room_floor: string | null; bus_name: string | null; camp_mina_name: string | null; camp_arafa_name: string | null }[];
  flight_go: FlightInfo | null;
  flight_back: FlightInfo | null;
  config: PortalConfig | null;
  announcements: Ann[];
};
type Ann = { id: number; body: string; priority: string; show_at: string };
type FlightInfo = { name: string; airline: string; from_airport: string; to_airport: string; date: string; time: string; arrival_time: string; arrival_date: string; class: string };
type PortalConfig = { name_ar: string; logo_url: string | null; tagline: string | null; color_primary: string | null; color_accent: string | null; season_label: string | null; admin_name: string | null; admin_phone: string | null; admin_whatsapp: string | null; features: Record<string, boolean> | null; portal_settings?: Record<string, boolean> | null; portal_welcome_message?: string | null; portal_help_message?: string | null; assets?: Record<string, string> | null; country: string | null; city: string | null; hotel_name: string | null; hotel_address: string | null; hotel_url: string | null; camp_mina_address: string | null; camp_mina_url: string | null; camp_arafa_address: string | null; camp_arafa_url: string | null };

/* أقرب يوم عرفة: القادم، أو الفائت خلال ٤٠ يوماً (فترة ما بعد الحج) */
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
  tent: '<path d="M12 3L2 21h20L12 3z"/><path d="M12 13l-4 8M12 13l4 8"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  back: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  star: '<path d="M12 2l2.4 4.8L19.5 8l-3.5 4 .7 5.5L12 15l-4.7 2.5.7-5.5-3.5-4 5.1-1.2z"/>',
  kaaba: '<path d="M4 7l8-4 8 4v10l-8 4-8-4z"/><path d="M4 7l8 4 8-4M12 11v10"/>',
  warn: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
};

function Icon({ d, size = 18, color = "currentColor", sw = 2 }: { d: string; size?: number; color?: string; sw?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} dangerouslySetInnerHTML={{ __html: d }} />;
}

const STAR_PATTERN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='84' height='84' viewBox='0 0 84 84'%3E%3Cg fill='none' stroke='%23F0C84A' stroke-width='1'%3E%3Cpath d='M42 10l8 16 17 3.5-11.5 13.5 2.5 18-16-8-16 8 2.5-18L17 29.5 34 26z'/%3E%3C/g%3E%3C/svg%3E")`;

const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

/* ─── نظام الألوان الصارم ─── */
const INK = "#241318";          // العناوين والقيم على الفاتح
const BODY = "#4A3540";         // النص العادي على الفاتح — غامق كامل
const LABEL = "#7A6570";        // التسميات — مقروءة
const LINE = "#E8D5C4";
const IVORY = "#F8F2E4";

const mapsUrl = (q: string) => `https://maps.google.com/maps?q=${encodeURIComponent(q)}`;

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
    try { const s = localStorage.getItem("portal_data"); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [doc, setDoc] = useState("");
  const [dobMode, setDobMode] = useState<"select" | "type">("select");
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [tab, setTab] = useState<"trip" | "stay" | "alerts">("trip");
  const [lostOpen, setLostOpen] = useState(false);
  const [docView, setDocView] = useState<{ title: string; url: string; isPdf: boolean } | null>(null);
  const [docBusy, setDocBusy] = useState<PortalDocType | null>(null);
  /* بيانات الإثبات محفوظة كما كانت للدخول مرّة واحدة، وهي الآن أيضاً
     ما تُطلَب به روابط المستندات — لا مفتاح يُخزَّن في الجهاز */
  const [creds, setCreds] = useState<PortalCreds | null>(() => {
    try { return JSON.parse(localStorage.getItem("portal_creds") || "null"); } catch { return null; }
  });
  const [seenAlerts, setSeenAlerts] = useState<number>(() => Number(localStorage.getItem("portal_seen_alerts") || 0));
  const [ackedUrgent, setAckedUrgent] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem("portal_acked_urgent") || "[]"); } catch { return []; }
  });
  const [now, setNow] = useState(() => Date.now());
  const [pushState, setPushState] = useState<PushState>("unsupported");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushNote, setPushNote] = useState("");
  const [pushDismissed, setPushDismissed] = useState(() => localStorage.getItem("portal_push_dismissed") === "1");

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  /* ─── تحديث تلقائي كامل عند كل فتح + كل ٣ دقائق (دخول مرة واحدة) ─── */
  useEffect(() => {
    if (!data) return;
    const creds = (() => { try { return JSON.parse(localStorage.getItem("portal_creds") || "null"); } catch { return null; } })();
    const refreshAll = async () => {
      if (creds) {
        const { data: res } = await portalSupabase.rpc("get_pilgrim_portal", creds);
        if (res) { setData(res as unknown as PortalData); localStorage.setItem("portal_data", JSON.stringify(res)); return; }
      }
      /* الحاج anon، فلا يقرأ الجدول مباشرةً: إسقاط مضبوط خلف دالة
         SECURITY DEFINER — نفس نمط get_pilgrim_portal (س٤ / §٣.٦).
         الدالة ترشّح بالوقت والانتهاء وترتّب العاجل أولاً. */
      const { data: anns } = await portalSupabase.rpc("get_portal_announcements");
      if (anns) setData(d => d ? { ...d, announcements: anns as unknown as Ann[] } : d);
    };
    refreshAll();
    const t = setInterval(refreshAll, 180000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!data]);

  /* ─── تهيئة التنبيهات: عامل الخدمة وملف تعريف التطبيق ─── */
  useEffect(() => {
    if (!data) return;
    let alive = true;

    (async () => {
      await setupPortalManifest({
        name: data.config?.name_ar || "بوابة الحاج",
        logoUrl: data.config?.assets?.logo || data.config?.logo_url || null,
        themeColor: data.config?.color_primary || "#1D9E75",
      });
      await registerServiceWorker();
      const st = await getPushState();
      if (alive) setPushState(st);
    })();

    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "OPEN_ALERTS") setTab("alerts");
      if (e.data?.type === "RESUBSCRIBE") resubscribeIfNeeded();
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);

    return () => {
      alive = false;
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!data]);

  /* ─── تسجيل قراءة التنبيهات عند فتح تبويبها ─── */
  useEffect(() => {
    if (tab !== "alerts" || !data?.announcements?.length) return;
    data.announcements.forEach(a => markNotificationRead(a.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, data?.announcements?.length]);

  async function turnPushOn() {
    setPushBusy(true);
    setPushNote("");
    const res = await enablePush();
    setPushBusy(false);
    if (res.ok) {
      setPushState("enabled");
      setPushNote("تم تفعيل التنبيهات بنجاح.");
    } else if (res.reason === "denied") {
      setPushState("denied");
    } else {
      setPushNote("تعذّر التفعيل، يرجى المحاولة مرة أخرى.");
    }
  }

  async function turnPushOff() {
    setPushBusy(true);
    await disablePush();
    setPushBusy(false);
    setPushState("available");
    setPushNote("تم إيقاف التنبيهات.");
  }

  function dismissPush() {
    setPushDismissed(true);
    localStorage.setItem("portal_push_dismissed", "1");
  }

  const cfg = data?.config;
  const brand = cfg?.color_primary || "#1D9E75";
  const gold = cfg?.color_accent || "#085041";
  const darken = (hex: string, factor: number) => {
    const value = hex.replace("#", "");
    if (!/^[0-9a-f]{6}$/i.test(value)) return hex;
    return `#${[0, 2, 4].map(i => Math.round(parseInt(value.slice(i, i + 2), 16) * factor).toString(16).padStart(2, "0")).join("")}`;
  };
  const brandDeep = darken(brand, 0.55);
  const goldBright = gold;
  const goldDark = darken(gold, 0.7);
  const portalLogo = cfg?.assets?.logo || cfg?.logo_url || null;
  const features = cfg?.features || {};
  const portalSettings = cfg?.portal_settings || {};
  const showFlights = portalSettings.flights !== false;
  const showRooms = portalSettings.rooms !== false;
  const showBuses = portalSettings.buses !== false;
  const showNotifications = portalSettings.notifications !== false;
  const showPdfDownloads = portalSettings.pdf_downloads !== false;
  const showRoommates = portalSettings.roommates !== false && features.portal_roommates !== false;
  const showLost = portalSettings.lost_card !== false && features.portal_lost_card !== false;
  const showDocs = portalSettings.documents !== false && features.portal_documents !== false;

  useEffect(() => {
    if (!showNotifications && tab === "alerts") setTab("trip");
  }, [showNotifications, tab]);

  /* صورة الحاجّ: رابط موقّع قصير العمر يُطلب عند العرض — والخطّاف
     قبل أي عودة مبكّرة كي لا يتغيّر ترتيب الخطّافات بين عرض وآخر */
  const photoUrl = usePortalDoc(creds, "photo", data?.pilgrim?.has_photo === true);

  const arafa = useMemo(() => getSeasonArafa(), []);
  const postHajj = now > arafa.getTime() + 86400000;
  const activeFlight = postHajj && data?.flight_back ? data.flight_back : data?.flight_go;
  const flightLabel = postHajj && data?.flight_back ? "رحلة العودة" : "رحلة الذهاب";

  const diff = Math.max(0, arafa.getTime() - now);
  const cd = { d: Math.floor(diff / 86400000), h: Math.floor(diff / 3600000) % 24, m: Math.floor(diff / 60000) % 60, s: Math.floor(diff / 1000) % 60 };

  const unread = (data?.announcements?.length || 0) - seenAlerts;
  const urgentUnacked = (data?.announcements || []).filter(a => a.priority === "عاجل" && !ackedUrgent.includes(a.id));

  const font = "'IBM Plex Sans Arabic','Cairo',sans-serif";
  const fontD = "'Cairo',sans-serif";
  const fontT = "'El Messiri','Cairo',sans-serif";

  async function login() {
    setLoginError("");
    if (!doc.trim()) { setLoginError("يرجى إدخال رقم الجواز أو البطاقة."); return; }
    const dNum = Number(day), mNum = Number(month), yNum = Number(year);
    if (!day || !month || !year || dNum < 1 || dNum > 31 || mNum < 1 || mNum > 12 || yNum < 1900 || yNum > new Date().getFullYear()) {
      setLoginError("يرجى إدخال تاريخ الميلاد كاملاً وبشكل صحيح."); return;
    }
    setLoading(true);
    try {
      const creds = { p_doc: doc.trim(), p_day: dNum, p_month: mNum, p_year: yNum };
      const { data: res, error } = await portalSupabase.rpc("get_pilgrim_portal", creds);
      if (error || !res) setLoginError("البيانات غير صحيحة. تأكد من رقم الجواز أو البطاقة وتاريخ الميلاد.");
      else {
        setData(res as unknown as PortalData);
        localStorage.setItem("portal_data", JSON.stringify(res));
        localStorage.setItem("portal_creds", JSON.stringify(creds));
        setCreds(creds);
      }
    } catch { setLoginError("تعذر الاتصال، يرجى المحاولة مرة أخرى."); }
    setLoading(false);
  }

  function logout() {
    localStorage.removeItem("portal_data");
    localStorage.removeItem("portal_creds");
    localStorage.removeItem("portal_seen_alerts");
    localStorage.removeItem("portal_acked_urgent");
    setData(null); setDoc(""); setDay(""); setMonth(""); setYear(""); setAckedUrgent([]); setSeenAlerts(0);
    setCreds(null); setDocView(null);
  }

  function ackUrgent(id: number) {
    const next = [...ackedUrgent, id];
    setAckedUrgent(next);
    localStorage.setItem("portal_acked_urgent", JSON.stringify(next));
  }

  /* ═══ شريط هوية الحملة ═══ */
  const brandBar = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, padding: "16px 16px 14px" }}>
      <div style={{ width: 100, height: 100, borderRadius: "50%", border: `3px solid ${goldBright}`, overflow: "hidden", flexShrink: 0, boxShadow: "0 0 0 8px rgba(240,200,74,.07)" }}>
        {portalLogo
          ? <img src={portalLogo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <div style={{ width: "100%", height: "100%", background: "rgba(240,200,74,.1)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon d={ICONS.star} size={44} color={goldBright} sw={1.4} /></div>}
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontFamily: fontT, fontSize: 36, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>{cfg?.name_ar || "بوابة الحاج"}</div>
        <div style={{ fontFamily: font, fontSize: 16, fontWeight: 700, color: goldBright, marginTop: 4 }}>
          بوابة الحاج{cfg?.season_label ? ` — ${cfg.season_label}` : ""}
        </div>
      </div>
    </div>
  );

  /* ═══ بانر التنبيه العاجل — فوق كل شيء حتى يضغط "فهمت" ═══ */
  const urgentBanner = (() => {
    if (!urgentUnacked.length) return null;
    const a = urgentUnacked[0];
    return (
      <div style={{ position: "fixed", top: 0, right: 0, left: 0, zIndex: 100, background: `linear-gradient(135deg,#A31212,#7A0D0D)`, color: "#fff", padding: "16px 16px calc(16px)", boxShadow: "0 8px 30px rgba(0,0,0,.4)", borderBottom: `3px solid ${goldBright}` }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, maxWidth: 560, margin: "0 auto" }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(255,255,255,.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon d={ICONS.warn} size={24} color={goldBright} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: fontD, fontSize: 15, fontWeight: 900, color: goldBright, marginBottom: 4 }}>تنبيه عاجل من إدارة الحملة</div>
            <div style={{ fontSize: 15.5, fontWeight: 700, lineHeight: 1.9 }}>{a.body}</div>
            <button onClick={() => ackUrgent(a.id)}
              style={{ marginTop: 12, border: "none", background: goldBright, color: "#5a0a0a", fontFamily: fontD, fontWeight: 900, fontSize: 18, padding: "13px 40px", borderRadius: 12, cursor: "pointer" }}>
              فهمت
            </button>
            {urgentUnacked.length > 1 && <span style={{ fontSize: 12, fontWeight: 700, marginInlineStart: 12, color: "rgba(255,255,255,.8)" }}>+{urgentUnacked.length - 1} تنبيه عاجل آخر</span>}
          </div>
        </div>
      </div>
    );
  })();

  /* ═══════════ شاشة الدخول ═══════════ */
  if (!data) {
    const inpStyle: React.CSSProperties = { padding: "16px 8px", borderRadius: 14, border: "1.5px solid rgba(255,255,255,.32)", background: "rgba(255,255,255,.12)", color: "#fff", fontSize: 17, fontWeight: 700, fontFamily: font, outline: "none", textAlign: "center", boxSizing: "border-box" };
    const yearNow = new Date().getFullYear();
    return (
      <div dir="rtl" style={{ minHeight: "100dvh", background: `linear-gradient(168deg,${brand} 0%,${brandDeep} 85%)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: font, color: "#fff", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, opacity: .06, backgroundImage: STAR_PATTERN, pointerEvents: "none" }} />
        <div style={{ width: "100%", maxWidth: 410, position: "relative" }}>
          <div style={{ textAlign: "center", marginBottom: 30 }}>
            <div style={{ width: 110, height: 110, borderRadius: "50%", border: `3px solid ${goldBright}`, background: "rgba(255,255,255,.08)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px", boxShadow: "0 0 0 10px rgba(240,200,74,.08)" }}>
              {portalLogo
                ? <img src={portalLogo} alt="" style={{ width: 70, height: 70, objectFit: "contain" }} />
                : <Icon d={ICONS.star} size={54} color={goldBright} sw={1.3} />}
            </div>
            <div style={{ fontFamily: fontT, fontSize: 32, fontWeight: 700 }}>{cfg?.name_ar || "بوابة الحاج"}</div>
            <div style={{ fontSize: 15.5, color: goldBright, marginTop: 8, fontWeight: 700 }}>بوابة الحاج {cfg?.season_label ? `— ${cfg.season_label}` : ""}</div>
          </div>

          <label style={{ display: "block", fontSize: 15, color: goldBright, fontWeight: 800, marginBottom: 9 }}>رقم جواز السفر أو البطاقة الشخصية</label>
          <input value={doc} onChange={e => setDoc(e.target.value)} placeholder="A12345678"
            style={{ ...inpStyle, width: "100%", direction: "ltr", textAlign: "left", letterSpacing: 1.5, padding: "16px 16px" }} />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "20px 0 9px" }}>
            <label style={{ fontSize: 15, color: goldBright, fontWeight: 800 }}>تاريخ الميلاد</label>
            <div style={{ display: "flex", background: "rgba(255,255,255,.12)", borderRadius: 99, padding: 3, border: "1px solid rgba(255,255,255,.25)" }}>
              {[{ id: "select", l: "اختيار" }, { id: "type", l: "كتابة" }].map(o => (
                <button key={o.id} onClick={() => setDobMode(o.id as typeof dobMode)}
                  style={{ border: "none", borderRadius: 99, padding: "6px 18px", fontFamily: fontD, fontWeight: 800, fontSize: 13.5, cursor: "pointer", background: dobMode === o.id ? goldBright : "transparent", color: dobMode === o.id ? brandDeep : "rgba(255,255,255,.85)", transition: "background .2s" }}>
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

          <button onClick={login} disabled={loading}
            style={{ width: "100%", marginTop: 24, padding: 18, border: "none", borderRadius: 15, background: goldBright, color: brandDeep, fontFamily: fontD, fontWeight: 900, fontSize: 19, cursor: "pointer", opacity: loading ? .6 : 1, boxShadow: "0 8px 24px rgba(240,200,74,.35)" }}>
            {loading ? "جارٍ التحقق..." : "دخول إلى رحلتي"}
          </button>

          <div style={{ textAlign: "center", fontSize: 13.5, color: "rgba(255,255,255,.8)", fontWeight: 600, marginTop: 24, lineHeight: 2.1 }}>
            تدخل مرة واحدة فقط وتبقى بوابتك مفتوحة دائماً
            {cfg?.admin_phone && <><br />للمساعدة: <a href={`tel:${cfg.admin_phone}`} style={{ direction: "ltr", display: "inline-block", color: goldBright, fontWeight: 800, textDecoration: "none" }}>{cfg.admin_phone}</a></>}
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════ مكونات مشتركة ═══════════ */
  const p = data.pilgrim;
  const card: React.CSSProperties = { background: "#fff", border: `1px solid ${LINE}`, borderRadius: 20, padding: 19, marginBottom: 14, boxShadow: "0 5px 20px rgba(93,16,41,.08)" };
  const cardH = (icon: string, title: string, sub?: string, bigTitle = false) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
      <div style={{ width: 46, height: 46, borderRadius: 13, background: `${gold}1e`, border: `1.5px solid ${gold}55`, display: "flex", alignItems: "center", justifyContent: "center", color: goldDark, flexShrink: 0 }}><Icon d={icon} size={23} /></div>
      <div>
        <div style={{ fontFamily: fontD, fontWeight: 800, fontSize: bigTitle ? 26 : 22, color: INK }}>{title}</div>
        {sub && <div style={{ fontSize: 16, fontWeight: 600, color: LABEL, marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
  const row = (k: string, v: string, big = false) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 2px", borderBottom: `1px dashed ${LINE}` }}>
      <span style={{ fontSize: 18, fontWeight: 700, color: LABEL }}>{k}</span>
      <span style={{ fontFamily: big ? fontD : font, fontWeight: big ? 900 : 700, fontSize: big ? 28 : 20, color: big ? brand : INK }}>{v}</span>
    </div>
  );
  const addressLink = (address: string, url?: string | null) => (
    <a href={url || mapsUrl(address)} target="_blank" rel="noreferrer"
      style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 12, background: `${gold}18`, border: `1.5px solid ${gold}66`, borderRadius: 13, padding: "12px 14px", textDecoration: "none" }}>
      <div style={{ width: 32, height: 32, borderRadius: 9, background: gold, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon d={ICONS.pin} size={18} color="#fff" />
      </div>
      <span style={{ flex: 1, fontSize: 17, fontWeight: 700, color: INK, lineHeight: 1.8 }}>{address}</span>
      <span style={{ fontSize: 15, fontWeight: 800, color: goldDark, fontFamily: fontD, whiteSpace: "nowrap" }}>افتح الخريطة</span>
    </a>
  );

  /* ═══════════ عرض مستند ═══════════ */
  if (docView) {
    /* نوع العرض يأتي من الخادم: الرابط الموقّع لا يُقرأ منه امتداد */
    const isPdf = docView.isPdf;
    return (
      <div dir="rtl" style={{ minHeight: "100dvh", background: "#1c0d12", fontFamily: font, display: "flex", flexDirection: "column" }}>
        {urgentBanner}
        <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, color: "#fff" }}>
          <button onClick={() => setDocView(null)} style={{ background: "rgba(255,255,255,.13)", border: "none", borderRadius: 13, width: 46, height: 46, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon d={ICONS.back} size={22} /></button>
          <div style={{ fontFamily: fontD, fontWeight: 800, fontSize: 19, flex: 1 }}>{docView.title}</div>
          {showPdfDownloads && <a href={docView.url} download target="_blank" rel="noreferrer" style={{ background: goldBright, borderRadius: 13, padding: "11px 20px", color: brandDeep, fontSize: 15, fontWeight: 800, textDecoration: "none", display: "flex", alignItems: "center", gap: 8, fontFamily: fontD }}><Icon d={ICONS.download} size={17} />تنزيل</a>}
        </div>
        <div style={{ flex: 1, padding: "0 12px 12px" }}>
          {isPdf
            ? <iframe src={docView.url} title={docView.title} style={{ width: "100%", height: "100%", minHeight: "82dvh", border: "none", borderRadius: 15, background: "#fff" }} />
            : <img src={docView.url} alt={docView.title} style={{ width: "100%", borderRadius: 15 }} />}
        </div>
      </div>
    );
  }

  /* ═══════════ كارت أنا تائه ═══════════ */
  if (lostOpen) {
    return (
      <div dir="rtl" style={{ minHeight: "100dvh", background: "#1c0d12", fontFamily: font, padding: 16 }}>
        <button onClick={() => setLostOpen(false)} style={{ background: "rgba(255,255,255,.13)", border: "none", borderRadius: 13, width: 46, height: 46, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}><Icon d={ICONS.back} size={22} /></button>
        <div style={{ background: `linear-gradient(170deg,${brand},${brandDeep})`, borderRadius: 24, color: "#fff", padding: "32px 22px", textAlign: "center", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, opacity: .08, backgroundImage: STAR_PATTERN, pointerEvents: "none" }} />
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 8 }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", border: `2.5px solid ${goldBright}`, background: "rgba(240,200,74,.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {portalLogo ? <img src={portalLogo} alt="" style={{ width: 34, height: 34, objectFit: "contain" }} /> : <Icon d={ICONS.star} size={26} color={goldBright} sw={1.5} />}
              </div>
              <div style={{ fontFamily: fontT, fontSize: 30, fontWeight: 700 }}>{cfg?.name_ar || "الحملة"}</div>
            </div>
            <div style={{ fontSize: 13, color: goldBright, letterSpacing: 2.5, fontWeight: 700, direction: "ltr" }}>HAJJ GROUP{cfg?.country ? ` — ${cfg.country.toUpperCase()}` : ""}</div>

            <div style={{ fontFamily: fontD, fontSize: 36, fontWeight: 900, marginTop: 24, lineHeight: 1.4 }}>{p.name_ar}</div>
            <div style={{ fontSize: 17.5, direction: "ltr", color: "#fff", marginTop: 6, fontWeight: 600 }}>{p.name_en}</div>

            <div style={{ background: "rgba(240,200,74,.13)", border: `1.5px solid ${goldBright}88`, borderRadius: 15, padding: "14px 15px", marginTop: 22, fontSize: 15.5, fontWeight: 700, lineHeight: 2.1, textAlign: "right", color: "#fff" }}>
              {(cfg?.hotel_name || data.room) && <div>الفندق: {cfg?.hotel_name || ""} {data.room ? `— غرفة ${data.room.number}` : ""}</div>}
              {(p.camp_mina_name || p.camp_mina) && <div>مخيم منى: {p.camp_mina_name || p.camp_mina}{cfg?.camp_mina_address ? ` — ${cfg.camp_mina_address}` : ""}</div>}
              {(p.camp_arafa_name || p.camp_arafa) && <div>مخيم عرفات: {p.camp_arafa_name || p.camp_arafa}{cfg?.camp_arafa_address ? ` — ${cfg.camp_arafa_address}` : ""}</div>}
            </div>

            {cfg?.admin_phone && <>
              <div style={{ fontSize: 14, color: "#fff", fontWeight: 700, marginTop: 22, opacity: .9 }}>رقم الطوارئ · Emergency</div>
              <a href={`tel:${cfg.admin_phone}`} style={{ fontFamily: fontD, fontSize: 36, fontWeight: 900, color: goldBright, direction: "ltr", display: "block", marginTop: 6, letterSpacing: 1, textDecoration: "none" }}>{cfg.admin_phone}</a>
              {cfg.admin_name && <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginTop: 5, opacity: .9 }}>{cfg.admin_name}</div>}
            </>}
          </div>
        </div>
        <div style={{ ...card, textAlign: "center", marginTop: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: BODY, lineHeight: 2.1 }}>أظهر هذه الشاشة لأي رجل أمن أو مسؤول<br />وسيتم التواصل مع حملتك فوراً</div>
        </div>
      </div>
    );
  }

  /* ═══════════ الواجهة الرئيسية ═══════════ */
  return (
    <div dir="rtl" style={{ minHeight: "100dvh", background: IVORY, fontFamily: font, paddingBottom: 104, paddingTop: urgentUnacked.length ? 130 : 0 }}>
      {urgentBanner}
      <div style={{ background: `linear-gradient(160deg,${brand},${brandDeep})`, color: "#fff", padding: "0 18px 56px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, opacity: .06, backgroundImage: STAR_PATTERN, pointerEvents: "none" }} />
        <div style={{ position: "relative" }}>
          {brandBar}
          <div style={{ height: 1.5, background: `linear-gradient(90deg,transparent,${goldBright}88,transparent)`, margin: "0 -4px 16px" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {p.has_photo && photoUrl
              ? <img src={photoUrl} alt="" style={{ width: 60, height: 60, borderRadius: "50%", objectFit: "cover", border: "3px solid rgba(255,255,255,.55)" }} />
              : <div style={{ width: 60, height: 60, borderRadius: "50%", background: goldBright, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fontD, fontWeight: 900, fontSize: 25, color: brandDeep, border: "3px solid rgba(255,255,255,.55)" }}>{(p.short_ar || p.name_ar)?.charAt(0)}</div>}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, color: goldBright, fontWeight: 800 }}>{p.gender === "أنثى" ? "حياك الله يا حاجة" : "حياك الله يا حاج"}</div>
              <div style={{ fontFamily: fontD, fontSize: 28, fontWeight: 900, marginTop: 2, lineHeight: 1.4, color: "#fff" }}>{p.short_ar || p.name_ar}</div>
            </div>
            <button onClick={logout} style={{ background: "rgba(255,255,255,.13)", border: "1.5px solid rgba(255,255,255,.35)", color: "#fff", borderRadius: 99, fontSize: 13.5, padding: "8px 17px", cursor: "pointer", fontFamily: fontD, fontWeight: 800 }}>خروج</button>
          </div>

          {postHajj ? (
            <div style={{ marginTop: 18, background: "rgba(240,200,74,.14)", border: `2px solid ${goldBright}77`, borderRadius: 20, padding: "19px 16px", textAlign: "center" }}>
              <Icon d={ICONS.kaaba} size={30} color={goldBright} sw={1.6} />
              <div style={{ fontFamily: fontT, fontSize: 24, fontWeight: 700, color: "#fff", marginTop: 9 }}>تقبل الله حجكم وسعيكم</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: goldBright, marginTop: 5 }}>حجاً مبروراً وسعياً مشكوراً وذنباً مغفوراً</div>
            </div>
          ) : diff > 0 && (
            <div style={{ marginTop: 18, background: "rgba(0,0,0,.22)", border: `1.5px solid ${goldBright}44`, borderRadius: 20, padding: "16px 16px" }}>
              <div style={{ fontSize: 14.5, color: goldBright, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}><Icon d={ICONS.clock} size={17} />المتبقي على الوقوف بعرفات</div>
              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                {[[cd.d, "يوم"], [cd.h, "ساعة"], [cd.m, "دقيقة"], [cd.s, "ثانية"]].map(([v, l], i) => (
                  <div key={i} style={{ flex: 1, textAlign: "center", background: "rgba(0,0,0,.38)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 14, padding: "12px 0" }}>
                    <div style={{ fontFamily: fontD, fontSize: 34, fontWeight: 900, color: "#fff", lineHeight: 1.1 }}>{String(v).padStart(2, "0")}</div>
                    <div style={{ fontSize: 13, color: goldBright, fontWeight: 800, marginTop: 3 }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: "0 15px", marginTop: -36, position: "relative" }}>
        {cfg?.portal_welcome_message && <div style={card}><div style={{ fontSize: 17, fontWeight: 700, color: INK, lineHeight: 2 }}>{cfg.portal_welcome_message}</div></div>}
        {cfg?.portal_help_message && <div style={card}><div style={{ fontSize: 15, fontWeight: 600, color: LABEL, lineHeight: 2 }}>{cfg.portal_help_message}</div></div>}
        {/* ══ تاب رحلتي ══ */}
        {tab === "trip" && <>
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            {cfg?.admin_phone && <a href={`tel:${cfg.admin_phone}`} style={{ flex: 1, borderRadius: 17, padding: "15px 6px", background: brand, color: "#fff", fontFamily: fontD, fontWeight: 800, fontSize: 14.5, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textDecoration: "none", boxShadow: "0 5px 16px rgba(125,31,60,.35)" }}><Icon d={ICONS.phone} size={23} />إداري الحملة</a>}
            {cfg?.admin_whatsapp && <a href={`https://wa.me/${cfg.admin_whatsapp.replace(/[^0-9]/g, "")}`} target="_blank" rel="noreferrer" style={{ flex: 1, borderRadius: 17, padding: "15px 6px", background: "#1F7A4D", color: "#fff", fontFamily: fontD, fontWeight: 800, fontSize: 14.5, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textDecoration: "none", boxShadow: "0 5px 16px rgba(31,122,77,.35)" }}><Icon d={ICONS.wa} size={23} />واتساب</a>}
            {showLost && <button onClick={() => setLostOpen(true)} style={{ flex: 1, border: "none", borderRadius: 17, padding: "15px 6px", background: goldBright, color: brandDeep, fontFamily: fontD, fontWeight: 900, fontSize: 14.5, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, cursor: "pointer", boxShadow: "0 5px 16px rgba(240,200,74,.4)" }}><Icon d={ICONS.help} size={23} />أنا تائه</button>}
          </div>

          {showFlights && (activeFlight ? (
            <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 20, overflow: "hidden", marginBottom: 14, boxShadow: "0 5px 20px rgba(93,16,41,.08)" }}>
              <div style={{ background: `linear-gradient(90deg,${brand},${brandDeep})`, color: "#fff", padding: "13px 17px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontFamily: fontD, fontWeight: 800, fontSize: 16, display: "flex", alignItems: "center", gap: 9 }}><Icon d={ICONS.plane} size={19} />{flightLabel}{activeFlight.airline ? ` — ${activeFlight.airline}` : ""}</div>
                {activeFlight.class && <div style={{ fontSize: 13, background: goldBright, color: brandDeep, padding: "5px 15px", borderRadius: 99, fontWeight: 900, fontFamily: fontD }}>{activeFlight.class}</div>}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 20px 8px" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: fontD, fontWeight: 900, fontSize: 33, color: brand, letterSpacing: 1 }}>{activeFlight.from_airport || "—"}</div>
                  <div style={{ fontFamily: fontD, fontSize: 18, color: INK, fontWeight: 900, marginTop: 3, direction: "ltr" }}>{activeFlight.time || ""}</div>
                </div>
                <div style={{ flex: 1, display: "flex", alignItems: "center", margin: "0 12px" }}>
                  <div style={{ flex: 1, borderTop: `2.5px dotted ${gold}88` }} />
                  <div style={{ margin: "0 8px", transform: "scaleX(-1)" }}><Icon d={ICONS.plane} size={22} color={goldDark} /></div>
                  <div style={{ flex: 1, borderTop: `2.5px dotted ${gold}88` }} />
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: fontD, fontWeight: 900, fontSize: 33, color: brand, letterSpacing: 1 }}>{activeFlight.to_airport || "—"}</div>
                  <div style={{ fontFamily: fontD, fontSize: 18, color: INK, fontWeight: 900, marginTop: 3, direction: "ltr" }}>{activeFlight.arrival_time || ""}</div>
                </div>
              </div>
              <div style={{ borderTop: `2.5px dashed ${LINE}`, margin: "10px 0 0", position: "relative" }}>
                <div style={{ position: "absolute", top: -11, right: -12, width: 22, height: 22, borderRadius: "50%", background: IVORY, border: `1px solid ${LINE}` }} />
                <div style={{ position: "absolute", top: -11, left: -12, width: 22, height: 22, borderRadius: "50%", background: IVORY, border: `1px solid ${LINE}` }} />
              </div>
              <div style={{ display: "flex", padding: "14px 18px 16px" }}>
                <div style={{ flex: 1, textAlign: "center" }}><div style={{ fontSize: 13, color: LABEL, fontWeight: 700 }}>الرحلة</div><div style={{ fontFamily: fontD, fontSize: 19, fontWeight: 900, color: goldDark, marginTop: 2, direction: "ltr" }}>{activeFlight.name || "—"}</div></div>
                <div style={{ width: 1.5, background: LINE }} />
                <div style={{ flex: 1, textAlign: "center" }}><div style={{ fontSize: 13, color: LABEL, fontWeight: 700 }}>التاريخ</div><div style={{ fontFamily: fontD, fontSize: 19, fontWeight: 900, color: goldDark, marginTop: 2, direction: "ltr" }}>{activeFlight.date || "—"}</div></div>
              </div>
            </div>
          ) : (
            <div style={card}><div style={{ fontSize: 15, fontWeight: 700, color: LABEL, textAlign: "center", padding: 10 }}>لم يتم تسجيل رحلة طيران بعد</div></div>
          ))}

          {showBuses && <div style={card}>
            {cardH(ICONS.bus, "أوتوبيسي", "التنقل بين المشاعر")}
            {data.bus ? <>
              {row("رقم الأوتوبيس", data.bus.name || "—", true)}
              {data.bus.type ? row("النوع", data.bus.type) : null}
            </> : <div style={{ fontSize: 15, fontWeight: 700, color: LABEL, textAlign: "center", padding: 6 }}>لم يتم تحديد الأوتوبيس بعد</div>}
          </div>}

          {showDocs && (
            <div style={card}>
              {cardH(ICONS.doc, "مستنداتي", "للإبراز في المطار والمنافذ")}
              {/* الوجود من القاعدة، والرابط لا يُطلب إلا عند الضغط:
                  توقيع عند الحاجة لا عند فتح الشاشة */}
              {([
                { t: "تصريح الحج", type: "hajj_permit" as PortalDocType, has: p.has_hajj_permit },
                { t: "تذكرة الطيران", type: "flight_ticket" as PortalDocType, has: p.has_flight_ticket },
              ]).map((d, i) => (
                <div key={d.type} onClick={async () => {
                  if (!d.has || docBusy) return;
                  setDocBusy(d.type);
                  const res = await portalDocUrl(creds, d.type);
                  setDocBusy(null);
                  if (res) setDocView({ title: d.t, url: res.url, isPdf: res.is_pdf });
                }}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 2px", borderBottom: i === 0 ? `1px dashed ${LINE}` : "none", cursor: d.has ? "pointer" : "default" }}>
                  <span style={{ fontSize: 20, fontWeight: 700, color: INK }}>{d.t}</span>
                  {d.has
                    ? <span style={{ fontSize: 17, background: brand, color: "#fff", padding: "9px 26px", borderRadius: 99, fontWeight: 800, fontFamily: fontD }}>{docBusy === d.type ? "جارٍ الفتح…" : "عرض"}</span>
                    : <span style={{ fontSize: 17, color: LABEL, fontWeight: 600 }}>لم يُرفع بعد</span>}
                </div>
              ))}
            </div>
          )}
        </>}

        {/* ══ تاب سكني ══ */}
        {tab === "stay" && <>
          {showRooms && <div style={card}>
            {cardH(ICONS.home, cfg?.hotel_name ? `فندق ${cfg.hotel_name}` : "سكني في مكة", [p.hotel_type, p.hotel_view].filter(Boolean).join(" — ") || undefined)}
            {data.room ? <>
              {row("الغرفة", data.room.number || "—", true)}
              {data.room.floor ? row("الدور", data.room.floor) : null}
              {data.room.type ? row("النوع", data.room.type) : null}
            </> : <div style={{ fontSize: 15, fontWeight: 700, color: LABEL, textAlign: "center", padding: 6 }}>لم يتم تسكينك بعد</div>}
            {cfg?.hotel_address && addressLink(cfg.hotel_address, cfg.hotel_url)}
          </div>}

          <div style={card}>
            {cardH(ICONS.tent, "مخيماتي", "منى وعرفات")}
            <div style={{ padding: "11px 2px", borderBottom: `1px dashed ${LINE}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: LABEL }}>مخيم منى</span>
                <span style={{ fontFamily: fontD, fontWeight: 900, fontSize: 26, color: brand }}>{p.camp_mina_name || p.camp_mina || "لم يُحدد بعد"}</span>
              </div>
              {cfg?.camp_mina_address && addressLink(cfg.camp_mina_address, cfg.camp_mina_url)}
            </div>
            <div style={{ padding: "11px 2px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: LABEL }}>مخيم عرفات</span>
                <span style={{ fontFamily: fontD, fontWeight: 900, fontSize: 26, color: brand }}>{p.camp_arafa_name || p.camp_arafa || "لم يُحدد بعد"}</span>
              </div>
              {cfg?.camp_arafa_address && addressLink(cfg.camp_arafa_address, cfg.camp_arafa_url)}
            </div>
          </div>

          {data.family?.length > 0 && (
            <div style={{ ...card, border: `2px solid ${gold}88` }}>
              {cardH(ICONS.users, "أفراد الأسرة", `${data.family.length} من عائلتك`)}
              {data.family.map((m, i) => (
                <div key={i} style={{ padding: "12px 2px", borderBottom: i < data.family.length - 1 ? `1px dashed ${LINE}` : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 42, height: 42, borderRadius: "50%", background: `${gold}22`, border: `1.5px solid ${gold}66`, color: goldDark, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fontD, fontWeight: 900, fontSize: 17, flexShrink: 0 }}>{(m.short_ar || m.name)?.charAt(0)}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 21, fontWeight: 700, color: INK }}>{m.short_ar || m.name}</div>
                      <div style={{ fontSize: 15, color: LABEL, fontWeight: 600, marginTop: 3, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {m.room_number && <span>غرفة {m.room_number}{m.room_floor ? ` — الدور ${m.room_floor}` : ""}</span>}
                        {m.bus_name && <span>باص {m.bus_name}</span>}
                        {m.camp_mina_name && <span>منى {m.camp_mina_name}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showRoommates && data.roommates?.length > 0 && (
            <div style={card}>
              {cardH(ICONS.users, "رفقاء الغرفة", `${data.roommates.length} معك في الغرفة`)}
              {data.roommates.map((m, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 2px", borderBottom: i < data.roommates.length - 1 ? `1px dashed ${LINE}` : "none" }}>
                  <div style={{ width: 42, height: 42, borderRadius: "50%", background: `${gold}22`, border: `1.5px solid ${gold}66`, color: goldDark, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fontD, fontWeight: 900, fontSize: 17, flexShrink: 0 }}>{m.name?.charAt(0)}</div>
                  <div style={{ fontSize: 21, fontWeight: 700, color: INK, flex: 1 }}>{m.name}</div>
                  {m.is_family && <span style={{ fontSize: 12.5, background: goldBright, color: brandDeep, padding: "4px 14px", borderRadius: 99, fontWeight: 900, fontFamily: fontD }}>عائلتك</span>}
                </div>
              ))}
            </div>
          )}
        </>}

        {/* ══ تاب التنبيهات ══ */}
        {tab === "alerts" && <>
          {/* ── بطاقة تفعيل التنبيهات ── */}
          {pushState === "enabled" ? (
            <div style={{ ...card, padding: "15px 17px", display: "flex", alignItems: "center", gap: 13 }}>
              <div style={{ width: 44, height: 44, borderRadius: 14, background: "#e6f4ec", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon d={ICONS.bell} size={24} color="#1c6b45" sw={2} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: INK }}>التنبيهات مفعّلة</div>
                <div style={{ fontSize: 14, color: LABEL, marginTop: 3 }}>سيصلك كل جديد عن رحلتك على هذا الجهاز.</div>
              </div>
              <button onClick={turnPushOff} disabled={pushBusy}
                style={{ background: "none", border: `1.5px solid ${LINE}`, color: LABEL, borderRadius: 99, fontSize: 14, fontWeight: 700, padding: "8px 15px", cursor: "pointer", fontFamily: fontD, flexShrink: 0 }}>
                إيقاف
              </button>
            </div>
          ) : pushState === "denied" ? (
            <div style={{ ...card, padding: "17px 19px", borderRight: `5px solid ${gold}` }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: INK }}>التنبيهات موقوفة من إعدادات الجهاز</div>
              <div style={{ fontSize: 15, color: LABEL, marginTop: 8, lineHeight: 2 }}>
                لإعادة تفعيلها: افتح إعدادات المتصفح، ثم إعدادات الموقع، ثم فعّل الإشعارات لهذه الصفحة.
              </div>
            </div>
          ) : pushState === "ios-needs-install" && !pushDismissed ? (
            <div style={{ ...card, padding: "19px 19px 17px", border: `2px solid ${gold}` }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: INK, marginBottom: 4 }}>فعّل تنبيهات الحملة</div>
              <div style={{ fontSize: 15, color: LABEL, lineHeight: 2, marginBottom: 15 }}>
                لتصلك التنبيهات على هذا الجهاز، اتبع الخطوات الثلاث مرة واحدة:
              </div>
              {[
                "اضغط زر المشاركة في أسفل المتصفح.",
                "اختر «إضافة إلى الشاشة الرئيسية».",
                "افتح البوابة من الأيقونة الجديدة، ثم فعّل التنبيهات.",
              ].map((s, i) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 11 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: goldBright, color: brandDeep, fontWeight: 900, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: fontD }}>{i + 1}</div>
                  <div style={{ fontSize: 15.5, color: INK, lineHeight: 1.9, paddingTop: 4 }}>{s}</div>
                </div>
              ))}
              <div style={{ fontSize: 14, color: LABEL, marginTop: 13, lineHeight: 1.9 }}>
                يمكنك طلب المساعدة من موظف الحملة لإتمام هذه الخطوات.
              </div>
              <button onClick={dismissPush}
                style={{ background: "none", border: "none", color: LABEL, fontSize: 14, fontWeight: 700, marginTop: 12, cursor: "pointer", fontFamily: fontD, textDecoration: "underline", padding: 0 }}>
                إخفاء هذه الرسالة
              </button>
            </div>
          ) : pushState === "available" && !pushDismissed ? (
            <div style={{ ...card, padding: "22px 19px", textAlign: "center", border: `2px solid ${gold}` }}>
              <div style={{ width: 66, height: 66, borderRadius: "50%", background: brand, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 13px" }}>
                <Icon d={ICONS.bell} size={32} color={goldBright} sw={1.8} />
              </div>
              <div style={{ fontSize: 21, fontWeight: 800, color: INK, marginBottom: 8 }}>تنبيهات الحملة</div>
              <div style={{ fontSize: 15.5, color: LABEL, lineHeight: 2 }}>
                فعّل التنبيهات ليصلك كل جديد عن رحلتك أولاً بأول: موعد الطيران، رقم غرفتك، باصك، ومخيمك.
              </div>
              <button onClick={turnPushOn} disabled={pushBusy}
                style={{ width: "100%", marginTop: 17, background: brand, color: "#fff", border: "none", borderRadius: 16, padding: "16px", fontSize: 18, fontWeight: 900, cursor: pushBusy ? "default" : "pointer", fontFamily: fontD, opacity: pushBusy ? 0.6 : 1 }}>
                {pushBusy ? "جارٍ التفعيل..." : "تفعيل التنبيهات"}
              </button>
              <button onClick={dismissPush}
                style={{ background: "none", border: "none", color: LABEL, fontSize: 14.5, fontWeight: 700, marginTop: 12, cursor: "pointer", fontFamily: fontD, textDecoration: "underline" }}>
                ليس الآن
              </button>
              <div style={{ fontSize: 13.5, color: LABEL, marginTop: 14, lineHeight: 1.8 }}>
                لن تصلك أي رسائل إعلانية — تنبيهات الحملة فقط.
              </div>
            </div>
          ) : null}

          {pushNote && (
            <div style={{ ...card, padding: "13px 16px", fontSize: 15, fontWeight: 700, color: INK }}>{pushNote}</div>
          )}

          {data.announcements.length === 0 && (
            <div style={{ ...card, textAlign: "center", padding: 34 }}>
              <Icon d={ICONS.bell} size={40} color={LABEL} sw={1.5} />
              <div style={{ fontSize: 16, fontWeight: 700, color: LABEL, marginTop: 12 }}>لا توجد تنبيهات حالياً</div>
            </div>
          )}
          {data.announcements.map(a => (
            <div key={a.id} style={{ ...card, borderRight: `5px solid ${a.priority === "عاجل" ? brand : a.priority === "مهم" ? gold : LINE}`, padding: "15px 17px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: LABEL, fontWeight: 700 }}>{new Date(a.show_at).toLocaleString("ar-EG", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })}</span>
                {a.priority !== "عام" && <span style={{ fontSize: 13, fontFamily: fontD, background: a.priority === "عاجل" ? brand : goldBright, color: a.priority === "عاجل" ? "#fff" : brandDeep, padding: "4px 15px", borderRadius: 99, fontWeight: 900 }}>{a.priority}</span>}
              </div>
              <div style={{ fontSize: 19, color: INK, fontWeight: 700, marginTop: 9, lineHeight: 2 }}>{a.body}</div>
            </div>
          ))}
        </>}
      </div>

      {/* ══ الشريط السفلي ══ */}
      <div style={{ position: "fixed", bottom: 0, right: 0, left: 0, background: "#fff", borderTop: `1px solid ${LINE}`, boxShadow: "0 -5px 24px rgba(93,16,41,.1)", display: "flex", padding: "10px 10px calc(10px + env(safe-area-inset-bottom))", zIndex: 50 }}>
        {[
          { id: "trip", label: "رحلتي", icon: ICONS.plane },
          { id: "stay", label: "سكني", icon: ICONS.home },
          { id: "alerts", label: "التنبيهات", icon: ICONS.bell },
        ].filter(t => t.id !== "alerts" || showNotifications).map(t => {
          const on = tab === t.id;
          return (
            <button key={t.id} onClick={() => { setTab(t.id as typeof tab); if (t.id === "alerts") { setSeenAlerts(data.announcements.length); localStorage.setItem("portal_seen_alerts", String(data.announcements.length)); } }}
              style={{ flex: 1, border: "none", background: on ? `${brand}15` : "none", borderRadius: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, fontFamily: fontD, fontSize: 17, fontWeight: 900, color: on ? brand : LABEL, cursor: "pointer", padding: "11px 0 9px", position: "relative", margin: "0 3px", transition: "background .2s,color .2s" }}>
              <Icon d={t.icon} size={28} color={on ? brand : LABEL} sw={on ? 2.3 : 2} />
              {t.label}
              {t.id === "alerts" && unread > 0 && <span style={{ position: "absolute", top: 7, left: "calc(50% - 24px)", width: 12, height: 12, borderRadius: "50%", background: "#C1121F", border: "2.5px solid #fff" }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { PilgrimPortal };
