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

/* ══════════════════════════════════════════════════════════════
   🔬 تشخيص مؤقّت — **يُحذف قبل الدمج**
   ══════════════════════════════════════════════════════════════
   الأثر يُكتب في Cache Storage لا عبر الرسائل: الصفحة والعامل
   كلاهما يقرأ Cache، **وقناة الرسائل نفسها هي المشتبه به** فلا
   يجوز أن يمرّ التشخيص من خلالها.

   ولا يُسجَّل فيه رمز جلسة ولا رقم وثيقة ولا تاريخ ميلاد ولا معرّف
   حاجّ ولا نصّ تنبيه — مساراتُ صفحات وأعدادٌ وحدها. */
const DIAG_CACHE = "s7-diag";
const DIAG_KEY = "/__s7diag";

/* مسلسَلة كذلك — انظر تعليق الصفحة */
let diagChain = Promise.resolve();

function diag(hop, info) {
  diagChain = diagChain.then(() => writeDiag(hop, info)).catch(() => undefined);
  return diagChain;
}

function writeDiag(hop, info) {
  return caches.open(DIAG_CACHE)
    .then((cache) =>
      cache.match(DIAG_KEY)
        .then((prev) => (prev ? prev.json() : []))
        .then((list) => {
          list.push(Object.assign({ t: new Date().toISOString(), at: "sw", hop: hop }, info || {}));
          return cache.put(DIAG_KEY, new Response(JSON.stringify(list.slice(-80)), {
            headers: { "Content-Type": "application/json" },
          }));
        }))
    .catch(() => undefined); /* التشخيص لا يكسر التنبيه أبداً */
}

/* إبلاغ البوابة المفتوحة أن تنبيهاً وصل.
   لا تُمرَّر حمولة الدفع: ليست مصدر حقيقة، والبوابة تجلب القائمة
   من دالتها المعتادة فترشَّح بالوقت والانتهاء ويُرتَّب العاجل أولاً.
   ولا تحمل هذه الرسالةُ معرّفاً ولا رمزاً ولا أي بيانات حاجّ. */
function notifyOpenPortals() {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true })
    .then((list) => {
      const paths = list.map((c) => {
        try { return new URL(c.url).pathname; } catch (e) { return "?"; }
      });
      const portalsByPath = paths.filter((p) => p.indexOf(PORTAL_PATH) !== -1).length;

      return diag("C", { windows: list.length, portalsByPath: portalsByPath, paths: paths })
        .then(() => {
          /* 🔬 تجربة مضبوطة: نُرسل إلى **كل** نافذة لا إلى ما يطابق
             `/hajj` وحده. الرسالة بلا حمولة، وصفحات الموظّفين تتجاهل
             نوعاً لا تعرفه. فإن وصلت الآن وكان portalsByPath = 0، ثبت
             أن المرشِّح هو العلّة — وإن لم تصل، بَرِئ المرشِّح ودلّ
             الأثر على الخطوة التالية. الفرضيتان تتمايزان بالنتيجة. */
          for (const client of list) {
            try { client.postMessage({ type: "NEW_ANNOUNCEMENT" }); } catch (e) { /* نافذة أُغلقت */ }
          }
          return diag("D", { posted: list.length });
        });
    })
    .catch((e) => diag("C-err", { message: String(e && e.message) }));
}

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

  /* العرض على الشاشة أولاً، ثم إخبار البوابة إن كانت مفتوحة — فلا
     يبقى الحاجّ ينظر إلى قائمة قديمة وقد وصله التنبيه على جهازه */
  event.waitUntil(
    diag("A", { hasData: !!event.data })
      .then(() => self.registration.showNotification(title, options))
      .then(() => diag("B", {}))
      .then(() => notifyOpenPortals())
  );
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
