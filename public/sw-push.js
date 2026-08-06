/* ══════════════════════════════════════════════════════════════
   عامل الخدمة — تنبيهات بوابة الحاج
   يستقبل التنبيه من المتصفح ويعرضه على شاشة الجهاز،
   ويفتح البوابة عند الضغط عليه.
   ══════════════════════════════════════════════════════════════ */

const PORTAL_PATH = "/hajj";

/* التفعيل الفوري دون انتظار إغلاق النوافذ المفتوحة */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/* استقبال التنبيه */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "بوابة الحاج";
  const body = payload.body || "لديك تنبيه جديد من الحملة.";
  const urgent = payload.priority === "عاجل";

  const options = {
    body: body,
    dir: "rtl",
    lang: "ar",
    icon: payload.icon || "/icon-192.png",
    badge: "/badge-72.png",
    tag: payload.id ? "ann-" + payload.id : "ann",
    renotify: true,
    requireInteraction: urgent,
    vibrate: urgent ? [200, 100, 200, 100, 200] : [150, 80, 150],
    timestamp: Date.now(),
    data: {
      url: payload.url || PORTAL_PATH,
      id: payload.id || null,
    },
    actions: [{ action: "open", title: "عرض التفاصيل" }],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/* الضغط على التنبيه */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = (event.notification.data && event.notification.data.url) || PORTAL_PATH;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      /* إن كانت البوابة مفتوحة بالفعل، ننتقل إليها بدل فتح نافذة جديدة */
      for (const client of list) {
        if (client.url.indexOf(PORTAL_PATH) !== -1 && "focus" in client) {
          client.postMessage({ type: "OPEN_ALERTS" });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(target);
      }
      return undefined;
    })
  );
});

/* تجديد الاشتراك تلقائياً عند انتهاء صلاحيته */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        client.postMessage({ type: "RESUBSCRIBE" });
      }
    })
  );
});
