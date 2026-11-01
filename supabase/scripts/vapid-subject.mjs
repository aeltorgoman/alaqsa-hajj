#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   التحقّق من `vapid_subject` قبل أيّ تغيير في نشر العميل.

   لماذا: `send-pilgrim-push` و`push-dispatch` يستدعيان
   `webpush.setVapidDetails(subject, …)` من web-push@3.6.7، وهي ترمي
   «Vapid subject is not a valid URL» لأيّ قيمةٍ ليست رابطاً بمخطّط
   `mailto:` أو `https:`. فبريدٌ مجرّد (it@customer.com) يُخزَّن سرّاً
   بلا اعتراض، ثم يُسقط **كلَّ** دفعٍ فوريّ ومجدوَل — وفحصُ الطريق في
   نهاية الإعداد لا يلمس web-push فلا يكشفه.

   القرار: **رفضٌ صريح لا تصحيحٌ صامت.** البريدُ المجرّد يُرفض برسالةٍ
   تذكر الصيغةَ الصحيحة بعينها (mailto:<البريد>)، فيقرّر المشغّل ما
   يُخزَّن. ولا يُغيَّر في القيمة إلا الفراغُ المحيط بها، كما تفعل
   الدالّتان نفسُهما (`.trim()`).

   المقبول (مجموعةٌ جزئيّة ممّا تقبله web-push، أضيقُ عمداً):
     · mailto:<محلّي>@<نطاق>.<امتداد>   عنوانٌ واحد، بلا استعلام ولا وسم
     · https://<مضيف>.<امتداد>[/مسار]  بلا اسم مستخدم ولا كلمة مرور،
                                        ولا localhost (خادمُ Apple يرفضه)

   CLI: يقرأ VAPID_SUBJECT_INPUT ويطبع القيمةَ المعتمدة، أو
   `::error::vapid_subject: …` على stderr ويخرج بـ1.
     VAPID_SUBJECT_INPUT='mailto:it@customer.com' node supabase/scripts/vapid-subject.mjs
   ═══════════════════════════════════════════════════════════════ */

import path from "node:path";
import { fileURLToPath } from "node:url";

const MAX_LENGTH = 255;
const EMAIL = /^[^\s@,;:<>()[\]"\\]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const EXAMPLE = "e.g. mailto:it@customer.com or https://customer.com";

/** Returns { ok: true, value } with the accepted value, or { ok: false, error }. */
export function validateVapidSubject(raw) {
  const value = String(raw ?? "").trim();
  const reject = (error) => ({ ok: false, error });

  if (!value) return reject(`required: the customer's push contact, ${EXAMPLE}.`);
  if (value.length > MAX_LENGTH) return reject(`must be at most ${MAX_LENGTH} characters.`);
  if (/[\s\p{Cc}]/u.test(value)) return reject("must not contain spaces, line breaks or control characters.");

  // The mistake seen in a real deployment: a bare email address. Say exactly what to enter.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    if (EMAIL.test(value)) {
      return reject(`"${value}" is an email address without a scheme. Enter it as mailto:${value} — web push rejects a bare email.`);
    }
    return reject(`must start with mailto: or https://, ${EXAMPLE}.`);
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    return reject(`is not a valid URL, ${EXAMPLE}.`);
  }

  if (url.protocol === "mailto:") {
    let address;
    try {
      address = decodeURIComponent(url.pathname);
    } catch {
      return reject(`"${value}" is not mailto: followed by one valid email address, e.g. mailto:it@customer.com.`);
    }
    if (url.search || url.hash) return reject("mailto: must be a single address without ?subject= or other parameters.");
    if (!EMAIL.test(address)) return reject(`"${value}" is not mailto: followed by one valid email address, e.g. mailto:it@customer.com.`);
    return { ok: true, value };
  }

  if (url.protocol === "https:") {
    if (!/^https:\/\//i.test(value)) return reject(`must be written https://host, ${EXAMPLE}.`);
    if (url.username || url.password) return reject("https:// must not contain a user name or password.");
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || !host.includes(".") || host.endsWith(".")) {
      return reject(`"${url.hostname}" is not a public host name; Apple's push service rejects it.`);
    }
    return { ok: true, value };
  }

  return reject(`must start with mailto: or https:// (got ${url.protocol}), ${EXAMPLE}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = validateVapidSubject(process.env.VAPID_SUBJECT_INPUT);
  if (!r.ok) {
    process.stderr.write(`::error::vapid_subject: ${r.error}\n`);
    process.exit(1);
  }
  process.stdout.write(r.value);
}
