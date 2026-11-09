// ════════════════════════════════════════════════════════════
// عنوانُ التنبيه المدفوع — لا هويّةَ حملةٍ مكتوبةً في الشيفرة
//
//   node --experimental-strip-types supabase/verification/portal/push_title_fallback_unit.mjs
//
//   بلا قاعدةٍ ولا شبكة. يفحص:
//     · الحمولةَ بقاعدتها الواحدة (`buildPayload` في push-dispatch/deliver.ts):
//         عنوانُ التنبيه ← وإلّا اسمُ الشركة من company_config ← وإلّا العنوانُ المحايد
//     · أنّ send-pilgrim-push (الإرسالُ اليدويّ) يبني حمولتَه بالقاعدة نفسها،
//       ويقرأ اسمَ الشركة من company_config، ولا يحمل عنواناً ثابتاً بديلاً
//     · أنّ لا اسمَ حملةٍ مكتوباً في شيفرة التنبيهات كلّها
// ════════════════════════════════════════════════════════════
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url));
const functions = path.join(here, "../../functions");
const repo = path.join(here, "../../..");
const D = await import(path.join(functions, "push-dispatch/deliver.ts"));

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`PASS — ${name}`); } else { fail++; console.log(`FAIL — ${name}${detail ? ` (${detail})` : ""}`); }
};
const titleOf = (ann, company) => JSON.parse(D.buildPayload(ann, company)).title;
const ann = { id: 9001, title: null, body: "نصّ التنبيه", priority: "عام", expires_at: null };

console.log("═══ قاعدةُ العنوان ═══");
check("explicit title → the announcement's own title, whatever the company name",
  titleOf({ ...ann, title: "موعد الحافلة" }, "شركة الاختبار") === "موعد الحافلة"
  && titleOf({ ...ann, title: "موعد الحافلة" }, null) === "موعد الحافلة");
check("no title + configured company name → that company's name (trimmed)",
  titleOf(ann, "شركة الاختبار") === "شركة الاختبار" && titleOf({ ...ann, title: "" }, "  شركة الاختبار  ") === "شركة الاختبار");
check("no title + no company name (null / empty / blank / read failure) → the neutral title",
  [null, undefined, "", "   "].every((n) => titleOf(ann, n) === D.NEUTRAL_TITLE));
check("the neutral title carries no campaign identity",
  typeof D.NEUTRAL_TITLE === "string" && D.NEUTRAL_TITLE.trim() !== "" && !/أقصى|اقصى|الأقصى|alaqsa/i.test(D.NEUTRAL_TITLE));
check("two installations never share a title: each payload reflects only the name it was given",
  titleOf(ann, "شركة أ") === "شركة أ" && titleOf(ann, "شركة ب") === "شركة ب");
check("payload keys and order unchanged: id, title, body, priority, url",
  Object.keys(JSON.parse(D.buildPayload(ann, "شركة"))).join(",") === "id,title,body,priority,url"
  && JSON.parse(D.buildPayload(ann, "شركة")).url === "/hajj/alerts");

console.log("═══ send-pilgrim-push (الإرسالُ اليدويّ) ═══");
const spp = fs.readFileSync(path.join(functions, "send-pilgrim-push/index.ts"), "utf8");
check("imports the shared payload builder from push-dispatch/deliver.ts",
  /import \{ buildPayload \} from "\.\.\/push-dispatch\/deliver\.ts";/.test(spp));
check("builds its payload with buildPayload(ann, companyName) — no hand-built payload",
  /const payload = buildPayload\(ann, companyName\);/.test(spp) && !/JSON\.stringify\(\{\s*id: ann\.id/.test(spp));
check("reads the company name from company_config.name_ar (same query as push-dispatch)",
  spp.includes('.from("company_config").select("name_ar").order("id").limit(1).maybeSingle()')
  && /const companyName: string \| null = await admin\s*\.from\("company_config"\)/.test(spp));
check("a failed company-name read (error or rejection) falls back to null (neutral title), never blocks delivery",
  /\(\{ data, error \}\) => \(error \? null : /.test(spp) && /,\s*\(\) => null,\s*\);/.test(spp));
check("no string-literal title fallback (`title || \"…\"`) anywhere in the function",
  !/title\s*\|\|\s*["'`]/.test(spp));
check("authorization, rate limit and M6 delivery are still in place",
  spp.includes('const REQUIRED_PERMISSION = "manage_portal";')
  && spp.includes("await authorize(req, REQUIRED_PERMISSION)")
  && spp.includes("LIMITS.push.scope")
  && spp.includes('"push_prepare_announcement"') && spp.includes("await runDelivery({"));

console.log("═══ لا اسمَ حملةٍ في شيفرة التنبيهات ═══");
const files = [
  "supabase/functions/send-pilgrim-push/index.ts",
  "supabase/functions/send-pilgrim-push/delivery.ts",
  "supabase/functions/push-dispatch/index.ts",
  "supabase/functions/push-dispatch/handler.ts",
  "supabase/functions/push-dispatch/deliver.ts",
  "supabase/functions/_shared/authorize.ts",
  "supabase/functions/_shared/http.ts",
  "supabase/functions/_shared/rateLimit.ts",
  "public/sw-push.js",
  "src/utils/pushClient.ts",
  "src/components/PortalPage.tsx",
  "src/components/DeliveryReportModal.tsx",
  "src/components/portal/AlertsTab.tsx",
  "src/components/portal/UrgentBanner.tsx",
];
const IDENTITY = /حملة الأقصى|الأقصى|الاقصى|alaqsa/i;
const hits = files.flatMap((f) => fs.readFileSync(path.join(repo, f), "utf8").split("\n")
  .map((line, i) => (IDENTITY.test(line) ? `${f}:${i + 1}` : null)).filter(Boolean));
check("no hardcoded campaign identity in any notification source file", hits.length === 0, hits.join(", "));

console.log(`\nالنتيجة: ${pass} نجح · ${fail} أخفق`);
process.exit(fail ? 1 : 0);
