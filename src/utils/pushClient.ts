/* ══════════════════════════════════════════════════════════════
   تنبيهات بوابة الحاج — منطق التسجيل في جهاز الحاج
   ══════════════════════════════════════════════════════════════ */

import { supabase } from "../supabase";

const VAPID_PUBLIC_KEY: string = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";
const SW_PATH = "/sw-push.js";

/* بيانات دخول الحاج المحفوظة في المتصفح */
type Creds = { p_doc: string; p_day: number; p_month: number; p_year: number };

export function getPortalCreds(): Creds | null {
  try {
    const raw = localStorage.getItem("portal_creds");
    return raw ? (JSON.parse(raw) as Creds) : null;
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
  | { ok: false; reason: "unsupported" | "denied" | "no-creds" | "failed" };

export async function enablePush(): Promise<EnableResult> {
  if (!supportsPush() || !VAPID_PUBLIC_KEY) return { ok: false, reason: "unsupported" };

  const creds = getPortalCreds();
  if (!creds) return { ok: false, reason: "no-creds" };

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

    const { data, error } = await supabase.rpc("register_pilgrim_push", {
      ...creds,
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
    if (endpoint) {
      await supabase.rpc("unregister_pilgrim_push", { p_endpoint: endpoint });
    }
    localStorage.removeItem("portal_push_endpoint");
    return true;
  } catch {
    return false;
  }
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
  const creds = getPortalCreds();
  if (!creds) return;
  try {
    await supabase.rpc("mark_pilgrim_notification_read", {
      ...creds,
      p_announcement_id: announcementId,
    });
  } catch {
    /* تسجيل القراءة ليس حرجاً، فنتجاهل الفشل بهدوء */
  }
}
