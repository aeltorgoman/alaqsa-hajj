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
const PENDING_CLAIM_KEY = "portal_pending_claim";
/* ⚠️ بصمةُ الرمز وحدها، لا الرمز: الخروجُ المعلَّق يبقى على الجهاز حتى يُتمّ،
   والبصمةُ لا تفتح البوابة — فلا يجد من يستعمل الجهازَ بعده جلسةً صالحة. */
type PendingLogout = { token_hash: string; endpoint?: string };

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
    return reg ? await reg.pushManager.getSubscription() : null;
  } catch {
    return null;
  }
}

async function sha256Hex(s: string): Promise<string | null> {
  try {
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

/* ok: نفّذ · rejected: ردّ بالرفض — لا فائدة من الإعادة · failed: لم يصل الردّ
   أو عطلٌ في الخادم — يُعاد لاحقاً · missing: الخادمُ بلا الدالّة بعد (M-51) */
type Outcome = "ok" | "rejected" | "failed" | "missing";
async function call(fn: "release_pilgrim_session" | "unregister_pilgrim_push" | "revoke_pilgrim_session",
                    args: Record<string, string>): Promise<Outcome> {
  try {
    const { data, error } = await (portalSupabase.rpc as unknown as
      (f: string, a: Record<string, string>) => Promise<{ data: unknown; error: { code?: string } | null }>)(fn, args);
    if (error) return error.code === "PGRST202" ? "missing" : "failed";
    return data === true ? "ok" : "rejected";
  } catch {
    return "failed";
  }
}

const release = (p: PendingLogout) =>
  call("release_pilgrim_session", { p_token_hash: p.token_hash, p_endpoint: p.endpoint ?? "" });

/* خادمٌ لم تُطبَّق عليه `release_pilgrim_session` بعد: الطريقُ القديم بالرمز
   الذي ما زال في الذاكرة الآن — فكُّ الجهاز (يحتاج الجلسة) ثمّ الإبطال. */
async function legacyLogout(token: string, endpoint?: string): Promise<boolean> {
  if (endpoint && await call("unregister_pilgrim_push", { p_token: token, p_endpoint: endpoint }) === "failed") return false;
  return await call("revoke_pilgrim_session", { p_token: token }) !== "failed";
}

function savePending(p: PendingLogout | null) {
  try {
    if (p) localStorage.setItem(PENDING_LOGOUT_KEY, JSON.stringify(p));
    else localStorage.removeItem(PENDING_LOGOUT_KEY);
  } catch { /* التخزين غير متاح */ }
}

/** الخروجُ الصريح: المتصفّحُ أوّلاً (فلا يعرض الجهازُ بعدها تنبيهاً)، ثمّ على
 *  الخادم في معاملةٍ واحدة: إبطالُ الجلسة وفكُّ هذا الجهاز وحده. وما تعذّر لانقطاع
 *  الشبكة يُحفظ **ببصمة الرمز** ويُتمّ عند الفتح التالي أو قبل الدخول التالي — لا
 *  يُترك لتنظيف 410 وحده. لا ترمي أبداً: التنظيفُ المحلّيّ بعدها لا ينتظر نجاحها. */
export async function logoutDevice(token: string): Promise<void> {
  const sub = await currentSubscription();
  const endpoint = sub?.endpoint || localStorage.getItem("portal_push_endpoint") || undefined;
  if (sub) await sub.unsubscribe().catch(() => undefined);
  localStorage.removeItem("portal_push_endpoint");
  localStorage.removeItem(PENDING_CLAIM_KEY);
  const token_hash = await sha256Hex(token);
  let r: Outcome = token_hash ? await release({ token_hash, endpoint }) : "missing";
  if (r === "missing") r = await legacyLogout(token, endpoint) ? "ok" : "failed";
  savePending(r === "failed" && token_hash ? { token_hash, endpoint } : null);
}

/** خروجٌ صريحٌ سابقٌ لم يكتمل على الخادم — يُتمّ بصمت عند فتح البوابة، و**قبل**
 *  كلّ دخولٍ جديد فلا يتجاوزه داخلٌ آخر. وما ليس بصمةً سليمةً يُحذف ولا يُستعمل. */
export async function finishPendingLogout(): Promise<void> {
  let p: PendingLogout | null;
  try { p = JSON.parse(localStorage.getItem(PENDING_LOGOUT_KEY) || "null"); } catch { p = null; }
  if (!p || typeof p.token_hash !== "string" || !/^[0-9a-f]{64}$/.test(p.token_hash)) { savePending(null); return; }
  const r = await release({ token_hash: p.token_hash, endpoint: typeof p.endpoint === "string" ? p.endpoint : undefined });
  if (r === "ok" || r === "rejected") savePending(null);
}

/** بعد كلّ دخولٍ ناجح: لمن هذا الجهاز؟ لحاجّ هذه الجلسة نفسِه (عاد بعد انتهاء
 *  جلسته) ← يبقى كما هو. وإلّا ← يُفكّ صفُّ الحاجّ السابق لهذا الجهاز وحده
 *  على الخادم، ويُلغى اشتراكُ المتصفّح، فيفعّل الداخلُ تنبيهاتِه بنفسه.
 *  وعند تعذّر الحكم مرّتين (شبكة، أو خادمٌ أقدم بلا الدالّة) يُلغى اشتراكُ
 *  المتصفّح أيضاً. وإن تعذّر الحكمُ **وتعذّر** إلغاءُ المتصفّح معاً — فقد يبقى
 *  الجهازُ حيّاً لغيره — يُعلَّق الحكمُ ويُعاد عند كلّ تحديثٍ ناجحٍ للبوابة. */
export async function claimDevicePushAfterLogin(token: string): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) {
    localStorage.removeItem("portal_push_endpoint");
    localStorage.removeItem(PENDING_CLAIM_KEY);
    return;
  }
  let verdict: string | null = null;
  for (let attempt = 0; attempt < 2 && verdict === null; attempt++) {
    try {
      const { data, error } = await portalSupabase.rpc("claim_pilgrim_push_device", {
        p_token: token, p_endpoint: sub.endpoint,
      });
      if (!error && typeof data === "string") verdict = data;
    } catch { verdict = null; }
  }
  if (verdict === "own") {
    localStorage.setItem("portal_push_endpoint", sub.endpoint);
    localStorage.removeItem(PENDING_CLAIM_KEY);
    return;
  }
  let dropped = true;
  await sub.unsubscribe().catch(() => { dropped = false; });
  localStorage.removeItem("portal_push_endpoint");
  if (verdict === null && !dropped) localStorage.setItem(PENDING_CLAIM_KEY, "1");
  else localStorage.removeItem(PENDING_CLAIM_KEY);
}

/** حكمُ جهازٍ معلَّقٌ من دخولٍ سابق (انظر أعلاه) — يُعاد بجلسة البوابة الحاليّة. */
export async function retryPendingClaim(token: string): Promise<void> {
  if (localStorage.getItem(PENDING_CLAIM_KEY) === "1") await claimDevicePushAfterLogin(token);
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
