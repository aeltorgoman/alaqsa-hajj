import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  portalDocUrl, usePortalDoc, clearPortalDocCache, PORTAL_SESSION_KEY,
  type PortalDocType, type PortalSession,
} from "../utils";
import { portalSupabase } from "../portalSupabase";
import {
  getPushState, enablePush, disablePush, markNotificationRead,
  registerServiceWorker, resubscribeIfNeeded,
  logoutDevice, finishPendingLogout, claimDevicePushAfterLogin, retryPendingClaim,
  type PushState,
} from "../utils/pushClient";
import { normalizeCompanyAssetUrl, normalizeCompanyColor } from "../company/safety";
import { effectivePortalSettings, photoVisibleFor } from "../company/portalSettings";
import { PORTAL_LOGIN_MESSAGES, normalizeDoc, isValidDoc, isValidDob } from "./portal/portal.login";
import { setupPortalManifest } from "../utils/portalManifest";
import type { PortalData, PortalAccommodation } from "./portal/portal.types";
import { buildTheme, IVORY, INK, BODY } from "./portal/portal.theme";
import { getSeasonArafa, civilDate } from "./portal/portal.dates";
import { readSession, clearPortalLocalState } from "./portal/portal.session";
import { usePortalRoute } from "./portal/portal.route";
import { cardStyle } from "./portal/portal.styles";
import { PortalLogin } from "./portal/PortalLogin";
import { UrgentBanner } from "./portal/UrgentBanner";
import { PortalHeader } from "./portal/PortalHeader";
import { DocumentViewer } from "./portal/DocumentViewer";
import { LostCard } from "./portal/LostCard";
import { TripTab } from "./portal/TripTab";
import { StayTab } from "./portal/StayTab";
import { AlertsTab } from "./portal/AlertsTab";
import { PortalNav } from "./portal/PortalNav";

/* ═══════════════════════════════════════════════════════════════
   بوابة الحاج — المنسِّق

   المرحلةُ الثانية نقلت العرضَ إلى `./portal/*` وأبقت هنا **ما لا
   يُقسَّم بلا ضرر**: الجلسةُ والحمولةُ والمؤقّتُ ومستمعُ عامل
   الخدمة والتنقّلُ بين التبويبات وأفعالُ الدخول والخروج والدفع
   وفتحِ المستند، ثمّ الاشتقاقاتُ التي تقرؤها أكثرُ من بطاقة
   (الرحلةُ المعروضة، وجاهزيّةُ التجهيز، وشارةُ الجديد).

   ولا ميزةَ تغيّرت ولا نصَّ ولا نمط: هذا التزامُ المرحلة.
   ═══════════════════════════════════════════════════════════════ */

function PilgrimPortal() {
  /* تحميل الخطوط */
  useEffect(() => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Cairo:wght@500;700;800;900&family=El+Messiri:wght@600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap";
    document.head.appendChild(l);
    return () => { document.head.removeChild(l); };
  }, []);

  /* الجلسة تُقرأ أولاً: بلا جلسة لا بوابة، والملفّ المخزَّن أثرٌ لا
     اعتماد فيُمسح — كي لا تُعرض شاشة تبدو داخلة وهي ليست كذلك */
  const [session, setSession] = useState<string | null>(() => {
    /* أ١٢ — أثر ما قبل س٧ يُمحى دائماً ولا يُقرأ أبداً. وليست هذه
       هجرة صامتة: قيمته لا تتحوّل إلى جلسة، بل تُمسح فقط. والحاجّ
       يدخل مرّة واحدة من جديد، وهو القرار المعتمد (ق٣) */
    localStorage.removeItem("portal_creds");
    const t = readSession();
    if (!t) clearPortalLocalState();
    return t;
  });
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
  /* الشاشةُ من العنوان لا من حالةٍ داخليّة — فتصمد أمام التحديث */
  const { tab, navigate, resetToRoot } = usePortalRoute();
  const [lostOpen, setLostOpen] = useState(false);
  const [docView, setDocView] = useState<{ title: string; url: string; isPdf: boolean } | null>(null);
  const [docBusy, setDocBusy] = useState<PortalDocType | null>(null);
  /* الإخفاقُ يُعلَن: كان `portalDocUrl` يرجع null فلا يقع شيءٌ أصلاً
     — ضغطةٌ بلا أثرٍ ولا سبب. */
  const [docError, setDocError] = useState<PortalDocType | null>(null);
  const [seenAlerts, setSeenAlerts] = useState<number>(() => Number(localStorage.getItem("portal_seen_alerts") || 0));
  const [ackedUrgent, setAckedUrgent] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem("portal_acked_urgent") || "[]"); } catch { return []; }
  });
  const [now, setNow] = useState(() => Date.now());
  const [pushState, setPushState] = useState<PushState>("unsupported");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushNote, setPushNote] = useState("");
  const [pushDismissed, setPushDismissed] = useState(() => localStorage.getItem("portal_push_dismissed") === "1");
  /* ⚠️ ارتفاعُ بانر العاجل **يُقاس ولا يُقدَّر**. كان المحجوز رقماً
     ثابتاً (١٣٠px) بينما البانر بنصٍّ من سطرين يبلغ ١٧٦px عند
     ٣٦٠px — فيغطّي اسمَ الحملة بثلاثين بكسلاً. والنصّ من الإدارة،
     فطولُه غيرُ معلومٍ سلفاً أصلاً: لا رقمَ ثابتٌ يصحّ هنا. */
  /* الارتفاعُ يُقاس في البانر ويُحجَز هنا: الغلافُ هو مَن يحجز. */
  const [bannerH, setBannerH] = useState(0);
  /* ⚠️ نبضةُ الثانية: العدّادُ يعتمد عليها، وكذلك `todayCivil` الذي
     يقرّر اكتمالَ رحلة الذهاب. حُذفت سهواً مع نقل البانر في هذه
     المرحلة فجمّدت العدّاد — وأمسكها البناء، فأُعيدت كما كانت. */
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const refreshPortal = useCallback(async () => {
    const token = readSession();
    if (!token) return;

    const { data: res, error } = await portalSupabase.rpc(
      "get_pilgrim_portal_by_session", { p_token: token });

    if (!error && res) {
      setData(res as unknown as PortalData);
      localStorage.setItem("portal_data", JSON.stringify(res));
      /* H4 — حكمُ جهازٍ تعذّر عند الدخول يُعاد ما دامت الجلسةُ صالحة */
      void retryPendingClaim(token);
      return;
    }
    if (!error) {
      /* رفضٌ صريح لا عطل شبكة: الجلسة انتهت أو أُبطلت أو أُقفل
         موسمها أو حُذف الحاجّ. لا نُبقي شاشة تبدو داخلة. */
      clearPortalLocalState();
      setSession(null);
      setData(null);
      /* العنوانُ يعود إلى الجذر: لا يبقى رابطٌ عميقٌ لجلسةٍ انتهت */
      resetToRoot();
      return;
    }
    /* عطلٌ عابر: تبقى الجلسة والملفُّ المحفوظ كما هما. ولا إسقاطَ إلى
       تنبيهاتٍ بلا جلسة (H3): التنبيهاتُ من مسار الجلسة وحده، بجمهورها. */
  }, [resetToRoot]);

  /* H4 — خروجٌ صريحٌ سابقٌ لم يكتمل على الخادم (انقطاع شبكة): يُتمّ بصمت */
  useEffect(() => { void finishPendingLogout(); }, []);

  /* الدخولُ جلب الملفّ لتوّه — فلا يُعاد جلبه فوراً حين تتغيّر الجلسة */
  const skipNextRefresh = useRef(false);

  /* ─── تحديث تلقائي كامل عند كل فتح + كل ٣ دقائق (دخول مرة واحدة) ─── */
  useEffect(() => {
    if (!data || !session) return;
    const justLoggedIn = skipNextRefresh.current;
    skipNextRefresh.current = false;
    /* جلبٌ أوّليّ متعمَّد: غير متزامن، وتحديث الحالة يقع بعد عودة
       الشبكة لا داخل العرض. صار مرئياً للقاعدة لأن الدالة خرجت من
       جوف الأثر لتُشارَك مع مستمع عامل الخدمة. */
    if (!justLoggedIn) refreshPortal();
    const t = setInterval(refreshPortal, 180000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, !!data]);

  /* ═══ M1 — مزامنةُ الإعدادات مع بوابةٍ مفتوحة ═══
     بصمةُ الإعدادات (`portal_settings_stamp`) تُسأل كلَّ ٢٠ ثانية ما دامت
     الصفحةُ ظاهرةً والجهازُ متّصلاً — سؤالٌ خفيفٌ لا يمسّ الجلسة. فإن خالفت
     بصمةَ الملفّ المعروض جُلب الملفُّ كلُّه: الخادمُ هو من يحجب. وعند عودة
     الاتّصال أو ظهور الصفحة يُسأل فوراً. وخادمٌ بلا الدالّة: يبقى التحديثُ
     الدوريّ وحده كما كان. والغايةُ وصولُ التغيير خلال ٣٠ ثانية: ٢٠ للدورة
     وما بقي هامشٌ للشبكة. */
  const shownStamp = useRef<string | null | undefined>(undefined);
  const dataStamp = data?.config?.settings_stamp;
  useEffect(() => { shownStamp.current = dataStamp; }, [dataStamp]);
  useEffect(() => {
    if (!session) return;
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== "visible" || !navigator.onLine) return;
      busy = true;
      try {
        const { data: stamp, error } = await portalSupabase.rpc("portal_settings_stamp");
        if (!error && typeof stamp === "string" && stamp !== shownStamp.current) await refreshPortal();
        /* خادمٌ بلا الدالّة بعد (PGRST202): الملفُّ كلُّه بالإيقاع نفسه، فلا يتأخّر
           إعدادٌ عن الثلاثين ثانية في نافذة النشر */
        else if (error?.code === "PGRST202") await refreshPortal();
      } catch { /* الشبكة: المحاولةُ التالية */ }
      busy = false;
    };
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    const onOnline = () => { void check(); };
    const id = setInterval(check, 20000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [session, refreshPortal]);

  /* ─── فتحُ التنبيهات من عامل الخدمة — **بلا شرط الدخول** ───
     ضغطةُ التنبيه على نافذةٍ مفتوحةٍ لم يدخل صاحبُها بعدُ كانت تضيع:
     مستمعُ الرسائل كان داخل أثرٍ يبدأ بـ `if (!data) return`، فلا
     يُسجَّل أصلاً قبل الدخول. فتبقى الشاشةُ على `/hajj`، ويهبط
     الحاجُّ بعد الدخول على «رحلتي» لا «التنبيهات».
     والعنوانُ هو ما يحمل القصد عبر الدخول، فيُضبط الآن ويُقرأ بعده. */
  useEffect(() => {
    const onOpenAlerts = (e: MessageEvent) => {
      if (e.data?.type !== "OPEN_ALERTS") return;
      navigate("alerts");
      /* بلا جلسةٍ تعود فوراً — والدخولُ يجلب الملفّ بنفسه */
      void refreshPortal();
    };
    navigator.serviceWorker?.addEventListener("message", onOpenAlerts);
    navigator.serviceWorker?.startMessages?.();
    return () => navigator.serviceWorker?.removeEventListener("message", onOpenAlerts);
  }, [navigate, refreshPortal]);

  /* ─── تهيئة التنبيهات: عامل الخدمة وملف تعريف التطبيق ─── */
  useEffect(() => {
    if (!data) return;
    let alive = true;

    (async () => {
      await setupPortalManifest({
        name: data.config?.name_ar || "بوابة الحاج",
        logoUrl: data.config?.assets?.logo || null,
        themeColor: data.config?.color_primary || "#1D9E75",
      });
      await registerServiceWorker();
      const st = await getPushState();
      if (alive) setPushState(st);
    })();

    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "RESUBSCRIBE") resubscribeIfNeeded();
      /* وصل تنبيه والبوابة مفتوحة: **نجلب من المصدر** ولا نبني
         الإعلان من حمولة الدفع. الحمولة ليست مصدر حقيقة — والدالة
         وحدها ترشّح بالوقت والانتهاء وترتّب العاجل أولاً. فلا نظام
         تنبيهات ثانٍ، بل الطبقة القائمة تُخبَر فتعمل عملها. */
      if (e.data?.type === "NEW_ANNOUNCEMENT") void refreshPortal();
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    /* تدفّق الرسائل من العامل إلى الصفحة يبدأ ضمنياً بعد تحميل
       المستند، ويبدأ صراحةً بهذه. استدعاؤها لا يضرّ إن كان التدفّق
       جارياً، ويحسم الشكّ إن لم يكن. */
    navigator.serviceWorker?.startMessages?.();

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

  /* هويّةُ الحملة قبل الدخول — من المسار العامّ المعتمد وحده:
     عرضُ `company_profile_public` (اسمٌ وألوان) وصفُّ `logo` من
     `company_assets`. أعمدةٌ مسمّاةٌ صراحةً، وعميلُ البوابة المجهول. */
  const [publicBrand, setPublicBrand] = useState<{ name_ar: string | null; color_primary: string | null; color_accent: string | null; logo: string | null } | null>(null);
  const hasData = !!data;
  useEffect(() => {
    if (hasData) return;
    let alive = true;
    (async () => {
      const [prof, logo] = await Promise.all([
        portalSupabase.from("company_profile_public").select("name_ar,color_primary,color_accent").eq("id", 1).maybeSingle(),
        portalSupabase.from("company_assets").select("asset_url").eq("asset_key", "logo").maybeSingle(),
      ]);
      if (!alive) return;
      const p = prof.data as { name_ar?: unknown; color_primary?: unknown; color_accent?: unknown } | null;
      setPublicBrand({
        name_ar: typeof p?.name_ar === "string" && p.name_ar.trim() ? p.name_ar.trim() : null,
        color_primary: p ? normalizeCompanyColor(p.color_primary, "") || null : null,
        color_accent: p ? normalizeCompanyColor(p.color_accent, "") || null : null,
        logo: normalizeCompanyAssetUrl((logo.data as { asset_url?: unknown } | null)?.asset_url),
      });
    })().catch(() => {});
    return () => { alive = false; };
  }, [hasData]);

  const cfg = data?.config;
  /* موسمُ الحاجّ — اسمُه وأماكنُه من صفّ موسمه هو، لا من إعدادات
     الحملة العالميّة. فالحاجُّ يرى فندقَ موسمه دائماً. */
  const season = data?.season;
  const t = buildTheme(cfg);
  const portalLogo = cfg?.assets?.logo || null;
  /* M1 — الإعداداتُ الثمانية بافتراضاتها. الخادمُ يرسلها كذلك ويحجب الحسّاسَ
     بنفسه (المستندات، والصورة، وأسماء رفقاء الغرفة)؛ وهنا العرضُ وحده.
     ⚠️ لا ناقضَ من `features`: المرجعُ `portal_settings` وحدها. والتنبيهاتُ
     ليست إعداداً: تبويبُها ظاهرٌ دائماً، مستقلّاً عن تفعيل الدفع. */
  const portalSettings = effectivePortalSettings(cfg?.portal_settings);
  const showFlights = portalSettings.flights;
  const showRooms = portalSettings.rooms;
  const showBuses = portalSettings.buses;
  const showRoommates = portalSettings.roommates;
  const showLost = portalSettings.lost_card;
  const showDocs = portalSettings.documents;

  /* صورة الحاجّ: رابط موقّع قصير العمر يُطلب عند العرض — والخطّاف
     قبل أي عودة مبكّرة كي لا يتغيّر ترتيب الخطّافات بين عرض وآخر */
  /* M1 — والإعدادُ شرطٌ هنا أيضاً لا `has_photo` وحده: خادمٌ لم تُطبَّق عليه
     ترحيلةُ M1 يرسل has_photo = true مهما اختارت الإدارة، فكانت «إخفاء الكل»
     لا تُخفي شيئاً. والرابطُ لا يُطلب أصلاً لصورةٍ مخفيّة. */
  const showPhoto = data?.pilgrim?.has_photo === true && photoVisibleFor(portalSettings, data?.pilgrim?.gender);
  const photoUrl = usePortalDoc(session, "photo", showPhoto);

  /* ═══ الرحلةُ المعروضة — واحدةٌ تخصّ المرحلة، لا رحلتان ═══
     المفهومُ المعتمَد باقٍ بحرفه. المتغيّرُ هو **ما الذي يقلبه**:
     كان يومَ عرفة (تاريخٌ من تقويم الجهاز لا علاقة له بالطيران)،
     فصار **رحلةَ الذهاب نفسها**. والبيانةُ كانت في الحمولة أصلاً
     ولا تُقرأ: `arrival_date` لم تكن تُستعمَل في قلبٍ ولا عرض.

     وثلاثةُ عيوبٍ تسقط بهذا التحويل:
       • كان القلبُ يقع بعد عرفة بيومٍ لا بعد الوصول، فتبقى رحلةُ
         ذهابٍ منتهيةٌ صدرَ الشاشة أسابيع.
       • وكانت نافذةُ الأربعين يوماً تنزلق، فيعود بعد اليوم الحادي
         والأربعين إلى **رحلة الذهاب** من جديد. والآن: ماضٍ يبقى ماضياً.
       • ومن له رحلةُ عودةٍ وحدها كان يُقال له «لا رحلة». */
  const todayCivil = useMemo(() => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); }, [now]);
  const go = data?.flight_go ?? null;
  const back = data?.flight_back ?? null;
  /* الوصولُ أدقُّ من المغادرة، والمغادرةُ أسلمُ من لا شيء */
  const goEnd = civilDate(go?.arrival_date || go?.date || null);
  const outboundDone = !!goEnd && todayCivil > goEnd.getTime();
  const activeFlight = (outboundDone && back) ? back : (go ?? back);
  const flightLabel = activeFlight && activeFlight === back ? "رحلة العودة" : "رحلة الذهاب";

  /* ما الذي صار جاهزاً من ترتيبات الرحلة؟ — لا نسبةَ ولا قائمةَ
     نواقص: مجرّد «هل بقي ما لم يُعتمَد بعد» لرسالةٍ واحدة هادئة. */
  const anyDoc = !!(data?.pilgrim?.has_hajj_permit || data?.pilgrim?.has_flight_ticket);
  const hasMina = !!(data?.pilgrim?.camp_mina_name || data?.pilgrim?.camp_mina);
  const hasArafa = !!(data?.pilgrim?.camp_arafa_name || data?.pilgrim?.camp_arafa);
  /* ⚠️ الترتيباتُ وحدها، ولا مستندات. كانت `anyDoc` سادسةَ الخانات،
     فيرى الحاجُّ رحلتَه وفندقَه وباصَه على الشاشة ثم يُقال له تحتها
     «رحلتك قيد التجهيز… وستظهر تفاصيل السكن والتنقل والطيران فور
     اعتمادها» — وهي ظاهرةٌ فوقها. والناقصُ الحقيقيُّ كان التصريحَ
     والتذكرة، وهما لا يُذكران في الجملة أصلاً.
     ولهما لغتُهما الصادقةُ في بطاقة المستندات: «سيظهر هنا فور
     جاهزيته»، سطراً لكلّ مستند. فبقيت لهما، وخرجا من هذه.
     وهذه الخمسُ ما تعتمده الحملةُ للحاجّ — وهي بعينها ما تَعِد به
     الجملة، فصار النصُّ يصف شرطَه. */
  const arrangements = [!!data?.room, !!data?.bus, hasMina, hasArafa, !!activeFlight];
  /* البطاقةُ تظهر ما دام ترتيبٌ لم يُعتمَد — وتختفي وحدها حين تكتمل،
     بلا تبديلِ أطوارٍ ولا محرّكِ مراحل. و`some` لا عدداً: العتبةُ
     الرقميّةُ تنحرف عن القائمة متى زِيدت خانةٌ أو نقصت. */
  const prepping = !!data && arrangements.some(ready => !ready);

  async function openDoc(type: PortalDocType, title: string) {
    if (docBusy) return;
    setDocBusy(type); setDocError(null);
    const res = await portalDocUrl(session, type);
    setDocBusy(null);
    if (res) setDocView({ title, url: res.url, isPdf: res.is_pdf });
    else setDocError(type);
  }

  /* ═══ العدّاد — زينةٌ لا حُكم ═══
     لم يعد يختار رحلةً. فإن جهل الجهازُ يومَ عرفة اختفى العدّاد
     وحدَه ولم يتعطّل شيءٌ غيره. */
  const arafa = useMemo(() => getSeasonArafa(), []);
  const postHajj = !!arafa && now > arafa.getTime() + 86400000;
  const diff = arafa ? Math.max(0, arafa.getTime() - now) : 0;
  /* M1 — والإدارةُ تخفيه (الافتراضُ ظاهر): لا يُعرض ولا يحجز مكاناً */
  const showCountdown = portalSettings.arafat_countdown && !!arafa && diff > 0;
  const cd = { d: Math.floor(diff / 86400000), h: Math.floor(diff / 3600000) % 24, m: Math.floor(diff / 60000) % 60, s: Math.floor(diff / 1000) % 60 };

  /* ⚠️ الشارةُ كانت `العدد − المقروء`. والعددُ يتناقص وحدَه حين
     ينتهي تنبيه، فيصير الفرقُ سالباً أو يبتلع جديداً. فصارت على
     **أكبر مُعرَّفٍ رآه الحاجّ**: المعرّفاتُ تتزايد ولا تُعاد، فما
     جاوز آخرَ ما رُئي جديدٌ يقيناً — وكلّه من بيانات الواجهة. */
  const unread = (data?.announcements || []).filter(a => a.id > seenAlerts).length;
  const urgentUnacked = (data?.announcements || []).filter(a => a.priority === "عاجل" && !ackedUrgent.includes(a.id));

  /* ═══ اسمُ الفندق — لا تُكرَّر كلمةُ «فندق» ═══
     المخزَّن يكتبه الموظّف كاملاً في الغالب («فندق دار الإيمان»)،
     وكان العرضُ يسبقه بكلمةٍ ثابتة فيخرج «فندق فندق دار الإيمان».
     فنسبق فقط إن لم يبدأ الاسمُ بها — ولا تُمسّ القيمةُ المخزَّنة. */
  /* ⚠️ ولا `\b` هنا: حدُّ الكلمة في JS مبنيٌّ على [A-Za-z0-9_]،
     فالحرفُ العربيّ غيرُ كلمةٍ عنده ولا يقع بعده حدّ — فكان
     الشرطُ يفشل دائماً وتُضاف «فندق» ولو كانت موجودة. فالفصلُ
     بفراغٍ صريحٍ أو نهايةِ النصّ. */
  const hotelTitleOf = (name: string | null | undefined) => {
    const n = (name || "").trim();
    return n ? (/^(فندق|نزل|برج|دار)(\s|$)/.test(n) ? n : `فندق ${n}`) : "";
  };
  /* ═══ السكن — MOD-001: من `accommodation` وحده ═══
     لا رجوعَ إلى `season.hotel_*`. الفندقُ الفعليُّ (اسمٌ وعنوانٌ ورابط)
     لا يُعرض إلا حين تكون الغرفةُ في فندقٍ مربوط (`assigned`). والمطلوبُ
     اسمٌ موسومٌ «مطلوباً» بلا عنوانٍ ولا خريطة. وخادمٌ أقدمُ لا يرسل
     `accommodation`: تُعرض الغرفةُ وحدها بلا فندق — فلا يُوهَم بسكنٍ مؤكَّد. */
  const accommodation: PortalAccommodation = data?.accommodation ?? {
    status: data?.room ? "assigned_unlinked" : "none", hotel: null, room: data?.room ?? null, requested_hotel: null,
  };
  const actualHotelName = accommodation.status === "assigned" ? (accommodation.hotel?.name || "").trim() : "";
  const minaName = (data?.pilgrim?.camp_mina_name || data?.pilgrim?.camp_mina || "").trim();
  const arafaName = (data?.pilgrim?.camp_arafa_name || data?.pilgrim?.camp_arafa || "").trim();


  /* M3 — الإرسالُ مرّةً واحدة: «دخول» وزرُّ Go قد يصلان معاً قبل أن تُعرض
     حالةُ التحميل، فالحارسُ مرجعٌ لا حالة. */
  const loggingIn = useRef(false);

  async function login() {
    if (loggingIn.current) return;
    setLoginError("");
    if (!doc.trim()) { setLoginError("يرجى إدخال رقم الجواز أو البطاقة."); return; }
    if (!day || !month || !year || !isValidDob(day, month, year)) {
      setLoginError("يرجى إدخال تاريخ الميلاد كاملاً وبشكل صحيح."); return;
    }
    /* M2 — الوثيقةُ بالصيغة التي تقارنها القاعدة. والشكلُ الفاسدُ لا يطابق
       أحداً: يُردّ بالرسالة نفسِها بلا شبكة. */
    const docN = normalizeDoc(doc);
    if (!isValidDoc(docN)) { setLoginError(PORTAL_LOGIN_MESSAGES.invalid); return; }
    const dNum = Number(day), mNum = Number(month), yNum = Number(year);
    loggingIn.current = true;
    setLoading(true);
    try {
      /* H4 — خروجُ من سبق على هذا الجهاز يُتمّ أوّلاً: لا يتجاوزه دخولٌ جديد */
      await finishPendingLogout();
      /* خطوة ١ — إثبات الهوية **مرّة واحدة**. ما يُدخله الحاجّ
         يُرسل ولا يُحفظ: هذه هي الدالة الوحيدة في النظام كلّه التي
         تقبل «وثيقة + ميلاد» (§٨.١) */
      const { data: issued, error } = await portalSupabase.rpc("create_pilgrim_session", {
        p_doc: docN, p_day: dNum, p_month: mNum, p_year: yNum,
      });
      const s = issued as unknown as (PortalSession & { rate_limited?: boolean }) | null;

      /* M3 — خطأُ الطلب عطلٌ لا رفض: الرفضُ ردٌّ ناجحٌ فارغ (null) لكلّ
         سبب، فلا يُعرف منه هل الوثيقةُ موجودة. */
      if (error) {
        setLoginError(PORTAL_LOGIN_MESSAGES.network);
      } else if (!s) {
        setLoginError(PORTAL_LOGIN_MESSAGES.invalid);
      } else if (s.rate_limited) {
        setLoginError("تجاوزت عدد المحاولات المسموح. يرجى المحاولة بعد قليل.");
      } else {
        /* خطوة ٢ — الملفّ بالجلسة. ولا يُرسل الاعتماد الثابت بعد
           هذه اللحظة أبداً، ولا يُكتب على الجهاز */
        clearPortalDocCache();
        localStorage.setItem(PORTAL_SESSION_KEY, JSON.stringify(s));
        const { data: res } = await portalSupabase.rpc(
          "get_pilgrim_portal_by_session", { p_token: s.token });
        if (!res) {
          localStorage.removeItem(PORTAL_SESSION_KEY);
          setLoginError(PORTAL_LOGIN_MESSAGES.network);
        } else {
          /* H4 — هذا الجهاز لهذا الحاجّ؟ وإلّا فُكَّ عن سابقه وأُلغي اشتراكُه،
             فيفعّل الداخلُ تنبيهاتِه بنفسه. قبل أن يُقرأ حالُ التنبيهات. */
          await claimDevicePushAfterLogin(s.token);
          skipNextRefresh.current = true;
          setSession(s.token);
          setData(res as unknown as PortalData);
          localStorage.setItem("portal_data", JSON.stringify(res));
          /* ما أُدخل لا يبقى في ذاكرة الشاشة أيضاً */
          setDoc(""); setDay(""); setMonth(""); setYear("");
        }
      }
    } catch { setLoginError(PORTAL_LOGIN_MESSAGES.network); }
    setLoading(false);
    loggingIn.current = false;
  }

  async function logout() {
    /* الإبطال في الخادم أولاً ما دامت الشبكة تسمح — فالخروج قبل س٧
       كان مسحاً محلّياً بلا أثر، والرمز يبقى صالحاً لمن يقرأ التخزين.
       H4: ومعه فكُّ **هذا الجهاز وحده** من التنبيهات قبل الإبطال، وما تعذّر
       يُتمّ عند الفتح التالي (`logoutDevice`). ثم التنظيف المحلّي **دائماً**،
       نجح ما على الخادم أو فشل: لا يُترك جهازٌ يبدو داخلاً. */
    const token = session;
    if (token) await logoutDevice(token);
    clearPortalLocalState();
    /* الداخلُ التالي على هذا الجهاز يرى عرضَ التفعيل من جديد */
    localStorage.removeItem("portal_push_dismissed");
    setPushDismissed(false); setPushState("available");
    setData(null); setDoc(""); setDay(""); setMonth(""); setYear(""); setAckedUrgent([]); setSeenAlerts(0);
    setSession(null); setDocView(null);
    /* والعنوانُ إلى الجذر بلا إدخالٍ في التاريخ — كي لا يعيد زرُّ
       الرجوع شاشةَ من خرج */
    resetToRoot();
  }

  function ackUrgent(id: number) {
    const next = [...ackedUrgent, id];
    setAckedUrgent(next);
    localStorage.setItem("portal_acked_urgent", JSON.stringify(next));
  }

  /* ═══ التركيب ═══ */
  const banner = (
    <UrgentBanner t={t} urgentUnacked={urgentUnacked} onAck={ackUrgent} onHeight={setBannerH} />
  );

  if (!data) {
    return (
      <PortalLogin
        t={buildTheme({ color_primary: publicBrand?.color_primary, color_accent: publicBrand?.color_accent } as typeof cfg)}
        logoUrl={publicBrand?.logo ?? null}
        nameAr={publicBrand?.name_ar || "بوابة الحاج"}
        seasonName={season?.name}
        adminPhone={cfg?.admin_phone}
        doc={doc} setDoc={setDoc}
        dobMode={dobMode} setDobMode={setDobMode}
        day={day} setDay={setDay}
        month={month} setMonth={setMonth}
        year={year} setYear={setYear}
        loading={loading} loginError={loginError}
        onSubmit={login}
      />
    );
  }

  const p = data.pilgrim;

  /* إعدادٌ تغيّر والشاشةُ مفتوحةٌ على ما أُخفي: لا تُعرض */
  if (docView && showDocs) {
    return (
      <DocumentViewer
        t={t} doc={docView} showDownload={showDocs}
        bannerH={bannerH} banner={banner} onClose={() => setDocView(null)}
      />
    );
  }

  if (lostOpen && showLost) {
    return (
      <LostCard
        t={t}
        logoUrl={portalLogo}
        nameAr={cfg?.name_ar || "الحملة"}
        country={cfg?.country}
        nameArPilgrim={p.name_ar}
        nameEn={p.name_en}
        hotelName={actualHotelName ? hotelTitleOf(actualHotelName) : null}
        room={accommodation.room}
        minaName={minaName}
        minaAddress={season?.mina_address}
        arafaName={arafaName}
        arafaAddress={season?.arafa_address}
        adminPhone={cfg?.admin_phone}
        adminName={cfg?.admin_name}
        onClose={() => setLostOpen(false)}
      />
    );
  }

  return (
    <div dir="rtl" style={{ minHeight: "100dvh", background: IVORY, fontFamily: t.font, paddingBottom: 104, paddingTop: bannerH }}>
      {banner}
      <PortalHeader
        t={t}
        logoUrl={portalLogo}
        nameAr={cfg?.name_ar || "بوابة الحاج"}
        seasonName={season?.name}
        hasPhoto={showPhoto}
        photoUrl={photoUrl}
        gender={p.gender}
        displayName={p.short_ar || p.name_ar}
        postHajj={postHajj}
        showCountdown={showCountdown}
        cd={cd}
        onLogout={logout}
      />

      <div style={{ padding: "0 15px", marginTop: -36, position: "relative" }}>
        {cfg?.portal_welcome_message && <div style={cardStyle}><div style={{ fontSize: 17, fontWeight: 700, color: INK, lineHeight: 2 }}>{cfg.portal_welcome_message}</div></div>}
        {cfg?.portal_help_message && <div style={cardStyle}><div style={{ fontSize: 15, fontWeight: 600, color: BODY, lineHeight: 2 }}>{cfg.portal_help_message}</div></div>}
        {tab === "trip" && (
          <TripTab
            t={t}
            adminPhone={cfg?.admin_phone}
            adminWhatsapp={cfg?.admin_whatsapp}
            showLost={showLost} onLost={() => setLostOpen(true)}
            showFlights={showFlights} activeFlight={activeFlight ?? null} flightLabel={flightLabel}
            showBuses={showBuses} bus={data.bus}
            showDocs={showDocs} anyDoc={anyDoc} outboundDone={outboundDone}
            hasPermit={p.has_hajj_permit} hasTicket={p.has_flight_ticket}
            docBusy={docBusy} docError={docError} onOpenDoc={openDoc}
            prepping={prepping}
          />
        )}
        {tab === "stay" && (
          <StayTab
            t={t}
            showRooms={showRooms} showRoommates={showRoommates}
            accommodation={accommodation} hotelTitleOf={hotelTitleOf}
            hotelType={p.hotel_type} hotelView={p.hotel_view}
            minaName={minaName} camp_mina_address={season?.mina_address} camp_mina_url={season?.mina_url}
            arafaName={arafaName} camp_arafa_address={season?.arafa_address} camp_arafa_url={season?.arafa_url}
            family={data.family} roommates={data.roommates}
          />
        )}
        {tab === "alerts" && (
          <AlertsTab
            t={t}
            pushState={pushState} pushBusy={pushBusy} pushNote={pushNote} pushDismissed={pushDismissed}
            onPushOn={turnPushOn} onPushOff={turnPushOff} onDismissPush={dismissPush}
            announcements={data.announcements}
          />
        )}
      </div>

      <PortalNav
        t={t} tab={tab} setTab={navigate}
        unread={unread}
        announcements={data.announcements}
        seenAlerts={seenAlerts} setSeenAlerts={setSeenAlerts}
      />
    </div>
  );
}

export { PilgrimPortal };
