// Polls Phase 4 — حسابُ النتائج والتوزيع والتصدير (src/components/polls/results.ts)
//   node --experimental-strip-types supabase/verification/portal/polls_results_unit.mjs
// الشاشةُ وExcel وPDF تقرأ كلُّها من هذه الدوالّ — فما يُختبر هنا هو ما يراه المدير وما يُصدَّر.
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const R = await import(path.join(here, "../../../src/components/polls/results.ts"));
let pass = 0, fail = 0;
const eq = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} — ${n}${ok ? "" : ` (got ${JSON.stringify(got)})`}`); };

const row = (id, name, bus, mina, opts, rev = opts.length ? 1 : null) => ({ passenger_id: id, name_ar: name, passenger_type: "حاج", bus, camp_mina: mina, responded: opts.length > 0, revision: rev, option_ids: opts });
const base = (kind, rows, extra = {}) => ({ poll_id: 1, status: "published", kind, max_choices: null, source: "live", as_of: "2026-11-12T10:00:00Z",
  options: [{ id: 11, label: "صباحاً", sort_order: 1 }, { id: 12, label: "مساءً", sort_order: 2 }, { id: 13, label: "ليلاً", sort_order: 3 }],
  labels: { bus: { 1: "باص ١", 2: "باص ٢" }, camp_mina: { 7: "منى أ" } }, rows, ...extra });
/* اختيارٌ واحد: ٥ مستهدفين، ٣ مجيبين، و«أحمد» غيّر إجابته (مراجعة ٣) فصفُّه واحدٌ بإجابته الحاليّة */
const single = base("single", [row(1, "أحمد", 1, 7, [12], 3), row(2, "بلال", 1, null, [11]), row(3, "جابر", 2, 7, [12]), row(4, "داود", null, null, []), row(5, "هشام", 2, null, [])]);

const s = R.summarize(single);
eq("single: targeted/respondents/nonrespondents/participation", [s.audience, s.respondents, s.nonrespondents, s.participation], [5, 3, 2, 60]);
eq("single: counts and % of respondents (changed answer counted once, at its current option)", s.options.map(o => [o.label, o.count, o.pct]), [["صباحاً", 1, 33.3], ["مساءً", 2, 66.7], ["ليلاً", 0, 0]]);
eq("single: option totals equal respondents", s.optionTotal, 3);
eq("drill-down: names behind «مساءً»", s.options[1].rows.map(r => r.name_ar), ["أحمد", "جابر"]);

const multi = base("multiple", [row(1, "أحمد", 1, 7, [11, 12]), row(2, "بلال", 1, 7, [11]), row(3, "جابر", 2, null, [])], { max_choices: 2 });
const m = R.summarize(multi);
eq("multiple: % uses respondents as denominator (sum may exceed 100%)", m.options.map(o => [o.count, o.pct]), [[2, 100], [1, 50], [0, 0]]);
eq("multiple: flagged, total selections 3 > respondents 2", [m.multiple, m.optionTotal, m.respondents], [true, 3, 2]);

const zero = R.summarize(base("single", [row(1, "أ", 1, 7, []), row(2, "ب", null, null, [])]));
eq("zero responses: 0% everywhere, no division by zero", [zero.respondents, zero.participation, ...zero.options.map(o => o.pct)], [0, 0, 0, 0, 0]);
eq("empty audience: 0 / 0%", [R.summarize(base("single", [])).audience, R.summarize(base("single", [])).participation], [0, 0]);
eq("fmtPct", [R.fmtPct(1, 3), R.fmtPct(0, 0), R.fmtPct(2, 2)], ["33.3٪", "0٪", "100٪"]);

/* التوزيع: الباصاتُ ومنى، وغيرُ المُسنَد صريحٌ وأخير */
const gb = R.groupBy(single, "bus");
eq("bus groups: named first, «غير مُسنَد» last", gb.map(g => [g.label, g.audience, g.respondents]), [["باص ١", 2, 2], ["باص ٢", 2, 1], ["غير مُسنَد", 1, 0]]);
eq("bus 1: per-option counts and % of the group's respondents", gb[0].options.map(o => [o.count, o.pct]), [[1, 50], [1, 50], [0, 0]]);
eq("bus groups add up to the whole (nobody dropped)", gb.reduce((x, g) => x + g.audience, 0), 5);
const gm = R.groupBy(single, "camp_mina");
eq("Mina groups incl. unassigned", gm.map(g => [g.label, g.audience]), [["منى أ", 2], ["غير مُسنَد", 3]]);
eq("unknown id label falls back to #id (deleted bus)", R.labelOf(single, "bus", 99), "#99");

/* التصفية والترتيب */
eq("filter: bus 1 + not answered → none", R.filterRows(single.rows, { bus: 1, status: "not" }).length, 0);
eq("filter: unassigned bus (null)", R.filterRows(single.rows, { bus: null }).map(r => r.passenger_id), [4]);
eq("filter: Mina 7 answered", R.filterRows(single.rows, { mina: 7, status: "answered" }).map(r => r.passenger_id), [1, 3]);
eq("search by name", R.filterRows(single.rows, { q: "جاب" }).map(r => r.name_ar), ["جابر"]);
eq("sort by name (Arabic)", R.sortRows(single, single.rows, "name").map(r => r.name_ar), ["أحمد", "بلال", "جابر", "داود", "هشام"]);
eq("sort by status: answered first", R.sortRows(single, single.rows, "status").map(r => r.responded), [true, true, true, false, false]);

/* التصدير */
const meta = { title: "متى تفضّل الزيارة؟", body: null, kind: "single", max_choices: null, status: "published", published_at: "2026-11-10T08:00:00Z", closed_at: null, close_reason: null, allow_answer_changes: true };
const x = R.exportSheets(single, meta);
const kv = Object.fromEntries(x.summary.filter(r => r.length === 2).map(r => [r[0], r[1]]));
eq("Excel summary: totals match the screen", [kv["المستهدفون"], kv["المجيبون"], kv["لم يجيبوا"], kv["نسبة المشاركة"]], [5, 3, 2, "60٪"]);
eq("Excel summary: option rows", x.summary.filter(r => r.length === 3 && typeof r[1] === "number").map(r => r.join("|")), ["صباحاً|1|33.3٪", "مساءً|2|66.7٪", "ليلاً|0|0٪"]);
eq("Excel answers: one row per respondent with names, assignment and answer", x.answers.slice(1).map(r => `${r[1]}|${r[3]}|${r[4]}|${r[5]}|${r[6]}`), ["أحمد|باص ١|منى أ|مساءً|3", "بلال|باص ١|غير مُسنَد|صباحاً|1", "جابر|باص ٢|منى أ|مساءً|1"]);
eq("Excel nonrespondents", x.nonrespondents.slice(1).map(r => `${r[1]}|${r[3]}`), ["داود|غير مُسنَد", "هشام|باص ٢"]);
eq("Excel bus sheet header and rows", [x.bus[0].slice(0, 5), x.bus.slice(1).map(r => r.slice(0, 6).join("|"))],
  [["الباص", "المستهدفون", "المجيبون", "نسبة المشاركة", "صباحاً (عدد)"], ["باص ١|2|2|100٪|1|50٪", "باص ٢|2|1|50٪|0|0٪", "غير مُسنَد|1|0|0٪|0|0٪"]]);
eq("Excel Mina sheet first column", x.mina.slice(1).map(r => r[0]), ["منى أ", "غير مُسنَد"]);
eq("Excel multiple: explanatory note included", R.exportSheets(multi, { ...meta, kind: "multiple" }).summary.some(r => r[0] === R.MULTI_NOTE), true);

/* PDF: الجسمُ مُهرَّب ويحمل الأرقام نفسها */
const evil = { ...meta, title: "<img src=x onerror=alert(1)>" };
const html = R.reportBody(single, evil);
eq("PDF body escapes the question (no raw HTML)", [html.includes("<img src=x"), html.includes("&lt;img src=x onerror=alert(1)&gt;")], [false, true]);
eq("PDF body carries totals, both dimensions and unassigned", ["60٪", "باص ١", "منى أ", "غير مُسنَد", "الباصات", "مخيمات منى"].every(t => html.includes(t)), true);
eq("PDF body has no Arafat/hotel/flight sections", ["عرفة", "الفندق", "الرحلة"].some(t => html.includes(t)), false);

/* المغلق قبل ترحيلة Phase 4: من شكل اللقطة */
const snap = { poll_id: 9, closed_at: "2026-11-11T10:00:00Z", options: single.options, labels: { bus: { 1: "باص ١" }, camp_mina: {}, camp_arafa: { 3: "عرفة" } },
  rows: [{ passenger_id: 2, name_ar: "ب", bus: 1, camp_mina: null, camp_arafa: 3, hotel: 5, responded: true, revision: 2, option_ids: [11] }, { passenger_id: 1, name_ar: "أ", bus: null, responded: false, option_ids: [] }] };
const ds = R.detailsFromSnapshot(snap, "single", null);
eq("snapshot adapter: closed, snapshot source, rows ordered, only bus/Mina labels", [ds.status, ds.source, ds.rows.map(r => r.passenger_id), Object.keys(ds.labels)], ["closed", "snapshot", [1, 2], ["bus", "camp_mina"]]);
eq("snapshot adapter: drops Arafat/hotel fields from rows", Object.keys(ds.rows[1]).includes("camp_arafa") || Object.keys(ds.rows[1]).includes("hotel"), false);
eq("source note distinguishes closure snapshot from live", [R.sourceNote(ds).startsWith("لقطة الإغلاق"), R.sourceNote(single).startsWith("نتائج حيّة")], [true, true]);

console.log(`\nresult: ${pass} passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
