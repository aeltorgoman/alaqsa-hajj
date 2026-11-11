// Phase 1 — أدواتُ جمهور التنبيه في الإدارة (src/components/announcements/audience.ts)
//   node --experimental-strip-types supabase/verification/portal/announcements_audience_unit.mjs
// الشكلُ الذي تُرسله الإدارة هو ما تتحقّق منه القاعدة (_announcement_audience_check).
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const A = await import(path.join(here, "../../../src/components/announcements/audience.ts"));
let pass = 0, fail = 0;
const eq = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} — ${n}${ok ? "" : ` (got ${JSON.stringify(got)})`}`); };
eq("all only", A.cleanAudience({ all: true }), { all: true });
eq("default types (pilgrims only) are not sent", A.cleanAudience({ all: true, types: ["حاج"] }), { all: true });
eq("extra types kept, unknown dropped", A.cleanAudience({ all: true, types: ["حاج", "مرافق", "زائر"] }), { all: true, types: ["حاج", "مرافق"] });
eq("ids deduplicated, invalid dropped, empty keys omitted", A.cleanAudience({ bus: [3, 3, 0, -1, 1.5, 4], hotel: [], pilgrim: [9] }), { bus: [3, 4], pilgrim: [9] });
eq("combined categories survive together", A.cleanAudience({ bus: [1], camp_mina: [2], camp_arafa: [3], hotel: [4], flight: [5, 6], pilgrim: [7] }),
   { bus: [1], camp_mina: [2], camp_arafa: [3], hotel: [4], flight: [5, 6], pilgrim: [7] });
eq("empty audience detected", [A.audienceIsEmpty({}), A.audienceIsEmpty({ all: false, bus: [] }), A.audienceIsEmpty({ flight: [1] })], [true, true, false]);
eq("describe: new audience", A.describeAudience({ bus: [1, 2], pilgrim: [5, 6], types: ["حاج", "مشرف"] }, {}, { bus: { 1: "باص ١", 2: "باص ٢" } }),
   "باص: باص ١، باص ٢ · 2 حاج محدد · يشمل: مشرف");
eq("describe: legacy rows", [A.describeAudience(null, { type: "all" }, {}), A.describeAudience(null, { type: "bus", ids: [1, 2] }, {})], ["جميع الحجاج", "باصات (2)"]);
eq("describe: more than three shown as +n", A.describeAudience({ hotel: [1, 2, 3, 4, 5] }, {}, {}), "فندق: #1، #2، #3 +2");
// «جميع الحجاج» (الافتراض) وعنصرٌ محدّد لا يجتمعان — وُجد في قبول بيئة الاختبار: اختيارُ فندقٍ
// مع بقاء «الجميع» كان يُرسل إلى كلّ الحجّاج
eq("picking an item turns «all» off (default {all:true} + hotel → hotel only)", A.toggleAudienceItem({ all: true }, "hotel", 4), { all: false, hotel: [4] });
eq("…and the result reaches only that hotel once cleaned", A.cleanAudience(A.toggleAudienceItem({ all: true }, "hotel", 4)), { hotel: [4] });
eq("unpicking an item leaves «all» as it was", A.toggleAudienceItem({ all: false, hotel: [4, 5] }, "hotel", 4), { all: false, hotel: [5] });
eq("turning «all» on clears specific items, keeps the type filter", A.toggleAudienceAll({ bus: [1], pilgrim: [7], types: ["حاج", "مرافق"] }), { all: true, types: ["حاج", "مرافق"] });
eq("turning «all» off keeps nothing selected (send blocked as empty)", A.audienceIsEmpty(A.toggleAudienceAll({ all: true })), true);
console.log(`\nresult: ${pass} passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
