/* ══════════════════════════════════════════════════════════════
   تنبيهات بوابة الحاج — منطق التسجيل في جهاز الحاج
   ══════════════════════════════════════════════════════════════ */

import { portalSupabase } from "../portalSupabase";
import { PORTAL_SESSION_KEY, type PortalSession } from "./index";

const VAPID_PUBLIC_KEY: string = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";
const SW_PATH = "/sw-push.js";

/* س٧ — رمز جلسة البوابة المحفوظ في المتصفح.
   ولا يُحفظ رقم وثيقة ولا تاريخ ميلاد (الثابت أ١٢). */
export function getPortalSession(): string | null {
  try {
    const raw = localStorage.getItem(PORTAL_SESSION_KEY);
    if (!raw) return null;
    const token = (JSON.parse(raw) as PortalSession)?.token;
    return typeof token === "string" && token ? token : null;
  } catch {
    return null;
  }
}

/* ─── التعرّف على نظام التشغيل ─── */

export function isIOS(): boolean {
  const ua = navigator.userAgent;
  const iOSDevice = /iPad|iPhone|iPod/.test(ua);
  /* أجهزة آيباد الحديثة تُعرّف نفسها كحاسوب، فنكشفها بخاصية اللمس */
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iOSDevice || iPadOS;
}

/* هل تعمل البوابة كتطبيق مثبّت على الشاشة الرئيسية؟ */
export function isStandalone(): boolean {
  const iosStandalone = (navigator as any).standalone === true;
  const displayMode = window.matchMedia?.("(display-mode: standalone)").matches === true;
  return iosStandalone || displayMode;
}

export function getPlatform(): string {
  if (isIOS()) return "ios";
  if (/Android/i.test(navigator.userAgent)) return "android";
  return "web";
}

/* ─── حالة التنبيهات ─── */

export type PushState =
  | "unsupported"      /* المتصفح لا يدعم التنبيهات */
  | "ios-needs-install" /* آيفون: يجب إضافة البوابة للشاشة الرئيسية أولاً */
  | "denied"           /* الحاج رفض الإذن سابقاً */
  | "enabled"          /* التنبيهات مفعّلة */
  | "available";       /* يمكن التفعيل الآن */

export function supportsPush(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function getPushState(): Promise<PushState> {
  if (!supportsPush() || !VAPID_PUBLIC_KEY) {
    /* على آيفون قد يكون السبب أن البوابة تُفتح من المتصفح لا من الأيقونة */
    if (isIOS() && !isStandalone()) return "ios-needs-install";
    return "unsupported";
  }
  if (isIOS() && !isStandalone()) return "ios-needs-install";
  if (Notification.permission === "denied") return "denied";

  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub && Notification.permission === "granted") return "enabled";
  } catch {
    /* نتجاهل ونعتبرها قابلة للتفعيل */
  }
  return "available";
}

/* ─── أدوات مساعدة ─── */

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return window.btoa(binary);
}

/* ─── تسجيل عامل الخدمة ─── */

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(SW_PATH, { scope: "/" });
  } catch {
    return null;
  }
}

/* ─── تفعيل التنبيهات ─── */

export type EnableResult =
  | { ok: true }
  | { ok: false; reason: "unsupported" | "denied" | "no-session" | "failed" };

export async function enablePush(): Promise<EnableResult> {
  if (!supportsPush() || !VAPID_PUBLIC_KEY) return { ok: false, reason: "unsupported" };

  const token = getPortalSession();
  if (!token) return { ok: false, reason: "no-session" };

  /* الإذن يجب أن يُطلب استجابةً لضغطة الحاج نفسه */
  let permission = Notification.permission;
  if (permission === "default") {
    try {
      permission = await Notification.requestPermission();
    } catch {
      return { ok: false, reason: "failed" };
    }
  }
  if (permission !== "granted") return { ok: false, reason: "denied" };

  try {
    const reg = await registerServiceWorker();
    if (!reg) return { ok: false, reason: "failed" };
    await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
      });
    }

    const p256dh = arrayBufferToBase64(sub.getKey("p256dh"));
    const auth = arrayBufferToBase64(sub.getKey("auth"));
    if (!p256dh || !auth) return { ok: false, reason: "failed" };

    const { data, error } = await portalSupabase.rpc("register_pilgrim_push", {
      p_token: token,
      p_endpoint: sub.endpoint,
      p_p256dh: p256dh,
      p_auth: auth,
      p_platform: getPlatform(),
      p_user_agent: navigator.userAgent.slice(0, 300),
    });

    if (error || data === false) {
      await sub.unsubscribe().catch(() => undefined);
      return { ok: false, reason: "failed" };
    }

    localStorage.setItem("portal_push_endpoint", sub.endpoint);
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/* ─── إيقاف التنبيهات ─── */

export async function disablePush(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    const endpoint = sub?.endpoint || localStorage.getItem("portal_push_endpoint");

    if (sub) await sub.unsubscribe().catch(() => undefined);
    /* س٧: الإلغاء صار مربوطاً بالهوية — يحذف اشتراك حاجّ الجلسة
       وحده، فلا يُلغي مَن عرف عنواناً اشتراكَ غيره (ف٥) */
    const token = getPortalSession();
    if (endpoint && token) {
      await portalSupabase.rpc("unregister_pilgrim_push", {
        p_token: token,
        p_endpoint: endpoint,
      });
    }
    localStorage.removeItem("portal_push_endpoint");
    return true;
  } catch {
    return false;
  }
}

/* ═══ H4 — الجهازُ عند الخروج الصريح وعند الدخول ═══
   الاشتراكُ مربوطٌ بالجهاز (endpoint) لا بالجلسة. فالخروجُ الصريحُ يفكّ
   **هذا الجهاز وحده** قبل إبطال الجلسة، والدخولُ لا ينقل اشتراكَ غيره
   إلى الداخل. وانتهاءُ الجلسة طبيعيّاً وإغلاقُ المتصفّح لا يمسّان شيئاً. */

const PENDING_LOGOUT_KEY = "portal_pending_logout";
type PendingLogout = { token: string; endpoint?: string };

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
    return reg ? await reg.pushManager.getSubscription() : null;
  } catch {
    return null;
  }
}

/* ok: نفّذ · rejected: ردّ الخادم بالرفض (الجلسةُ لم تعد صالحة) — لا فائدة
   من الإعادة · failed: لم يصل الردّ أو عطلٌ في الخادم — يُعاد لاحقاً */
async function portalCall(fn: "unregister_pilgrim_push" | "revoke_pilgrim_session",
                          args: { p_token: string; p_endpoint?: string }): Promise<"ok" | "rejected" | "failed"> {
  try {
    const { data, error } = fn === "unregister_pilgrim_push"
      ? await portalSupabase.rpc(fn, { p_token: args.p_token, p_endpoint: args.p_endpoint ?? "" })
      : await portalSupabase.rpc(fn, { p_token: args.p_token });
    if (error) return "failed";
    return data === true ? "ok" : "rejected";
  } catch {
    return "failed";
  }
}

/* الخطوتان على الخادم بترتيبهما: فكُّ الجهاز ما دامت الجلسةُ صالحة (فهو
   يحتاجها)، ثمّ إبطالُها. وما تعذّر يبقى معلَّقاً ليُتمَّ لاحقاً. */
async function settleLogout(p: PendingLogout): Promise<PendingLogout | null> {
  if (p.endpoint) {
    const r = await portalCall("unregister_pilgrim_push", { p_token: p.token, p_endpoint: p.endpoint });
    if (r === "failed") return p;
  }
  const r = await portalCall("revoke_pilgrim_session", { p_token: p.token });
  return r === "failed" ? { token: p.token } : null;
}

/** الخروجُ الصريح: المتصفّحُ أوّلاً (فلا يعرض الجهازُ بعدها تنبيهاً)، ثمّ فكُّ
 *  صفِّ هذا الجهاز وحده على الخادم، ثمّ إبطالُ الجلسة. وما تعذّر لانقطاع
 *  الشبكة يُحفظ ويُتمّ عند فتح البوابة التالي — لا يُترك لتنظيف 410 وحده.
 *  لا ترمي أبداً: التنظيفُ المحلّيّ بعدها لا ينتظر نجاحها. */
export async function logoutDevice(token: string): Promise<void> {
  const sub = await currentSubscription();
  const endpoint = sub?.endpoint || localStorage.getItem("portal_push_endpoint") || undefined;
  if (sub) await sub.unsubscribe().catch(() => undefined);
  localStorage.removeItem("portal_push_endpoint");
  const left = await settleLogout({ token, endpoint });
  try {
    if (left) localStorage.setItem(PENDING_LOGOUT_KEY, JSON.stringify(left));
    else localStorage.removeItem(PENDING_LOGOUT_KEY);
  } catch { /* التخزين غير متاح */ }
}

/** خروجٌ لم يكتمل على الخادم في مرّةٍ سابقة — يُتمّ بصمت عند فتح البوابة. */
export async function finishPendingLogout(): Promise<void> {
  let p: PendingLogout | null;
  try { p = JSON.parse(localStorage.getItem(PENDING_LOGOUT_KEY) || "null"); } catch { p = null; }
  if (!p || typeof p.token !== "string" || !p.token) { localStorage.removeItem(PENDING_LOGOUT_KEY); return; }
  const left = await settleLogout(p);
  if (left) localStorage.setItem(PENDING_LOGOUT_KEY, JSON.stringify(left));
  else localStorage.removeItem(PENDING_LOGOUT_KEY);
}

/** بعد كلّ دخولٍ ناجح: لمن هذا الجهاز؟ لحاجّ هذه الجلسة نفسِه (عاد بعد انتهاء
 *  جلسته) ← يبقى كما هو. وإلّا ← يُفكّ صفُّ الحاجّ السابق لهذا الجهاز وحده
 *  على الخادم، ويُلغى اشتراكُ المتصفّح، فيفعّل الداخلُ تنبيهاتِه بنفسه.
 *  وعند تعذّر الحكم (شبكة، أو خادمٌ أقدم بلا الدالّة) يُلغى اشتراكُ المتصفّح
 *  أيضاً: لا تنبيهاتِ غيره على شاشته في أيّ حال. */
export async function claimDevicePushAfterLogin(token: string): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) { localStorage.removeItem("portal_push_endpoint"); return; }
  let verdict: string | null = null;
  try {
    const { data, error } = await portalSupabase.rpc("claim_pilgrim_push_device", {
      p_token: token, p_endpoint: sub.endpoint,
    });
    if (!error && typeof data === "string") verdict = data;
  } catch { verdict = null; }
  if (verdict === "own") {
    localStorage.setItem("portal_push_endpoint", sub.endpoint);
    return;
  }
  await sub.unsubscribe().catch(() => undefined);
  localStorage.removeItem("portal_push_endpoint");
}

/* ─── إعادة التسجيل عند انتهاء صلاحية الاشتراك ─── */

export async function resubscribeIfNeeded(): Promise<void> {
  const state = await getPushState();
  if (state !== "enabled" && Notification.permission === "granted") {
    await enablePush();
  }
}

/* ─── تسجيل قراءة التنبيه ─── */

export async function markNotificationRead(announcementId: number): Promise<void> {
  const token = getPortalSession();
  if (!token) return;
  try {
    await portalSupabase.rpc("mark_pilgrim_notification_read", {
      p_token: token,
      p_announcement_id: announcementId,
    });
  } catch {
    /* تسجيل القراءة ليس حرجاً، فنتجاهل الفشل بهدوء */
  }
}
