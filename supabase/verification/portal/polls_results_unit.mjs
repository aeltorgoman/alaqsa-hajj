// Polls Phase 4 — حسابُ النتائج والتوزيع والتصدير (src/components/polls/results.ts)
//   node --experimental-strip-types supabase/verification/portal/polls_results_unit.mjs
// الشاشةُ وExcel وPDF تقرأ كلُّها من هذه الدوالّ — فما يُختبر هنا هو ما يراه المدير وما يُصدَّر.
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const R = await import(path.join(here, "../../../src/components/polls/results.ts"));
let pass = 0, fail = 0;
const eq = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} — ${n}${ok ? "" : ` (got ${JSON.stringify(got)})`}`); };

/* go: رحلة الذهاب (flight_id) · back: رحلة العودة (return_flight_id) */
const row = (id, name, bus, mina, go, back, opts, rev = opts.length ? 1 : null) => ({ passenger_id: id, name_ar: name, passenger_type: "حاج", bus, camp_mina: mina, flight_go: go, flight_back: back,
  responded: opts.length > 0, revision: rev, option_ids: opts });
const FI = { 31: { airline: "القطرية", date: "2027-05-01", time: "08:00", from_airport: "DOH", to_airport: "JED", type: "ذهاب" },
             32: { airline: "القطرية", date: "2027-05-02", time: "09:00", from_airport: "DOH", to_airport: "MED", type: "ذهاب" },
             41: { airline: "القطرية", date: "2027-06-10", time: "12:00", from_airport: "JED", to_airport: "DOH", type: "إياب" } };
const base = (kind, rows, extra = {}) => ({ poll_id: 1, status: "published", kind, max_choices: null, source: "live", as_of: "2026-11-12T10:00:00Z",
  options: [{ id: 11, label: "صباحاً", sort_order: 1 }, { id: 12, label: "مساءً", sort_order: 2 }, { id: 13, label: "ليلاً", sort_order: 3 }],
  labels: { bus: { 1: "باص ١", 2: "باص ٢" }, camp_mina: { 7: "منى أ" }, flight_go: { 31: "QR1", 32: "QR3", 41: "QR2" }, flight_back: { 31: "QR1", 32: "QR3", 41: "QR2" } },
  flight_info: FI, rows, ...extra });
/* ٥ مستهدفين، ٣ مجيبين، و«أحمد» غيّر إجابته (مراجعة ٣) فصفُّه واحدٌ بإجابته الحاليّة */
const single = base("single", [row(1, "أحمد", 1, 7, 31, 41, [12], 3), row(2, "بلال", 1, null, 31, null, [11]), row(3, "جابر", 2, 7, 32, 41, [12]), row(4, "داود", null, null, null, null, []), row(5, "هشام", 2, null, 31, 41, [])]);

const s = R.summarize(single);
eq("overall: targeted/respondents/nonrespondents/participation", [s.audience, s.respondents, s.nonrespondents, s.participation], [5, 3, 2, 60]);
eq("overall: counts, % of respondents and % of targeted (edited answer counted once)", s.options.map(o => [o.label, o.count, o.pct, o.pctTargeted]), [["صباحاً", 1, 33.3, 20], ["مساءً", 2, 66.7, 40], ["ليلاً", 0, 0, 0]]);
eq("drill-down: names behind «مساءً»", s.options[1].rows.map(r => r.name_ar), ["أحمد", "جابر"]);

/* ١ — النسبتان في التوزيع */
const gb = R.groupBy(single, "bus");
eq("bus groups: named first, «غير مُسنَد» last, with targeted/respondents/nonrespondents", gb.map(g => [g.label, g.audience, g.respondents, g.nonrespondents]), [["باص ١", 2, 2, 0], ["باص ٢", 2, 1, 1], ["غير مُسنَد", 1, 0, 1]]);
eq("bus 2: «مساءً» = 1 → 50% of targeted (primary), 100% of respondents (secondary)", [gb[1].options[1].count, gb[1].options[1].pctTargeted, gb[1].options[1].pct], [1, 50, 100]);
eq("cell text puts the targeted % first", R.cellText(gb[1].options[1], gb[1]), "1 · 50٪ من المستهدفين · 100٪ من المجيبين");
eq("zero respondents in a group: 0% of respondents, 0% of targeted (no division by zero)", [gb[2].options.map(o => [o.pctTargeted, o.pct]), gb[2].participation], [[[0, 0], [0, 0], [0, 0]], 0]);
eq("empty audience: 0/0 → 0%", [R.fmtPct(0, 0), R.summarize(base("single", [])).participation], ["0٪", 0]);

/* المتعدّد: لا يُفترض أن المجموع ١٠٠٪ */
const multi = base("multiple", [row(1, "أحمد", 1, 7, 31, 41, [11, 12]), row(2, "بلال", 1, 7, 31, 41, [11]), row(3, "جابر", 1, null, 31, null, [])], { max_choices: 2 });
const mg = R.groupBy(multi, "bus")[0];
eq("multiple: bus 1 — % of targeted (3): 66.7/33.3; % of respondents (2): 100/50", mg.options.slice(0, 2).map(o => [o.count, o.pctTargeted, o.pct]), [[2, 66.7, 100], [1, 33.3, 50]]);
eq("multiple: % of respondents sum to 150% (> 100%, not normalised)", mg.options.reduce((x, o) => x + o.pct, 0), 150);

/* ٢ — الرحلات: الذهابُ والعودةُ بُعدان منفصلان، وغيرُ المُسنَد صريح، ولا عدَّ مزدوج */
const go = R.groupBy(single, "flight_go"), back = R.groupBy(single, "flight_back");
eq("outbound groups: QR1 (3) · QR3 (1) · غير مُسنَد (1)", go.map(g => [g.label, g.audience]), [["QR1", 3], ["QR3", 1], ["غير مُسنَد", 1]]);
eq("return groups: QR2 (3) · غير مُسنَد (2)", back.map(g => [g.label, g.audience]), [["QR2", 3], ["غير مُسنَد", 2]]);
eq("no double counting: each dimension partitions the audience exactly once", [go.reduce((x, g) => x + g.audience, 0), back.reduce((x, g) => x + g.audience, 0), new Set(go.flatMap(g => g.rows.map(r => r.passenger_id))).size], [5, 5, 5]);
const noIso = (t) => t.replace(/[\u2066\u2069]/g, "");
eq("flight details for a live poll (airline · date time · route)", noIso(go[0].detail), "القطرية · 2027-05-01 08:00 · من DOH إلى JED");
eq("flight details: Latin date/time and airports are bidi-isolated (LRI…PDI) for RTL", go[0].detail, "القطرية · \u20662027-05-01 08:00\u2069 · من \u2066DOH\u2069 إلى \u2066JED\u2069");
eq("unassigned flight group has no details", go[2].detail, "");
eq("outbound QR1 «صباحاً»: 1 → 33.3% of targeted, 50% of respondents", [go[0].options[0].count, go[0].options[0].pctTargeted, go[0].options[0].pct], [1, 33.3, 50]);
eq("flight drill-down names (outbound QR1 «مساءً»)", go[0].options[1].rows.map(r => r.name_ar), ["أحمد"]);

/* المغلق: الإسنادُ من اللقطة، ولا تفاصيلَ مخترَعة */
const snap = { poll_id: 9, closed_at: "2026-11-11T10:00:00Z", options: single.options, labels: { bus: { 1: "باص ١" }, camp_mina: {}, flight_go: { 31: "QR1 (عند الإغلاق)" }, flight_back: { 41: "QR2" }, camp_arafa: { 3: "عرفة" } },
  rows: [{ passenger_id: 2, name_ar: "ب", bus: 1, camp_mina: null, flight_go: 31, flight_back: 41, camp_arafa: 3, hotel: 5, responded: true, revision: 2, option_ids: [11] }, { passenger_id: 1, name_ar: "أ", bus: null, responded: false, option_ids: [] }] };
const ds = R.detailsFromSnapshot(snap, "single", null);
eq("snapshot: closed, ordered rows, four dimension labels only", [ds.status, ds.source, ds.rows.map(r => r.passenger_id), Object.keys(ds.labels)], ["closed", "snapshot", [1, 2], ["bus", "camp_mina", "flight_go", "flight_back"]]);
eq("snapshot: flight assignment and name as captured at closure", [ds.rows[1].flight_go, ds.rows[1].flight_back, R.labelOf(ds, "flight_go", 31)], [31, 41, "QR1 (عند الإغلاق)"]);
eq("snapshot: no flight details (not captured → not reconstructed)", [R.groupBy(ds, "flight_go")[0].detail, JSON.stringify(ds.flight_info)], ["", "{}"]);
eq("snapshot: Arafat/hotel fields dropped from rows", Object.keys(ds.rows[1]).some(k => k === "camp_arafa" || k === "hotel"), false);
const nd = R.normalizeDetails({ ...single, labels: { bus: single.labels.bus } });
eq("normalizeDetails tolerates a server without flight labels/fields", [Object.keys(nd.labels).length, R.labelOf(nd, "flight_go", 31)], [4, "#31"]);

/* التصفية والترتيب */
eq("filter: unassigned bus (null)", R.filterRows(single.rows, { bus: null }).map(r => r.passenger_id), [4]);
eq("filter: Mina 7 answered", R.filterRows(single.rows, { mina: 7, status: "answered" }).map(r => r.passenger_id), [1, 3]);
eq("sort by name (Arabic)", R.sortRows(single, single.rows, "name").map(r => r.name_ar), ["أحمد", "بلال", "جابر", "داود", "هشام"]);

/* التصدير: Excel وPDF بالأرقام نفسها */
const meta = { title: "متى تفضّل الزيارة؟", body: null, kind: "single", max_choices: null, status: "published", published_at: "2026-11-10T08:00:00Z", closed_at: null, close_reason: null, allow_answer_changes: true };
const x = R.exportSheets(single, meta);
eq("Excel: sheets incl. outbound and return flights", Object.keys(x), ["summary", "answers", "bus", "camp_mina", "flight_go", "flight_back", "nonrespondents"]);
const kv = Object.fromEntries(x.summary.filter(r => r.length === 2).map(r => [r[0], r[1]]));
eq("Excel summary totals match the screen", [kv["المستهدفون"], kv["المجيبون"], kv["لم يجيبوا"], kv["نسبة المشاركة"]], [5, 3, 2, "60٪"]);
eq("Excel bus header: nonrespondents + both % per option", x.bus[0].slice(0, 8), ["الباص", "المستهدفون", "المجيبون", "لم يجيبوا", "نسبة المشاركة", "صباحاً (عدد)", "صباحاً (٪ من المستهدفين)", "صباحاً (٪ من المجيبين)"]);
eq("Excel bus 2 row: «مساءً» 1 · 50% of targeted · 100% of respondents", x.bus[2].slice(0, 11), ["باص ٢", 2, 1, 1, "50٪", 0, "0٪", "0٪", 1, "50٪", "100٪"]);
eq("Excel outbound sheet: flight details column + same numbers as the screen", x.flight_go.slice(1).map(r => r.slice(0, 6)),
  go.map(g => [g.label, g.detail, g.audience, g.respondents, g.nonrespondents, R.fmtPct(g.respondents, g.audience)]));
eq("Excel return sheet incl. unassigned", x.flight_back.slice(1).map(r => [r[0], r[2]]), [["QR2", 3], ["غير مُسنَد", 2]]);
eq("Excel answers carry both flights per pilgrim", x.answers.slice(1).map(r => `${r[1]}|${r[5]}|${r[6]}|${r[7]}`), ["أحمد|QR1|QR2|مساءً", "بلال|QR1|غير مُسنَد|صباحاً", "جابر|QR3|QR2|مساءً"]);
eq("Excel closed: flight details marked as not captured", R.exportSheets(ds, { ...meta, status: "closed" }).flight_go.slice(1).map(r => r[1]), ["غير محفوظة في لقطة الإغلاق", ""]);
eq("Excel multiple: explanatory note included", R.exportSheets(multi, { ...meta, kind: "multiple" }).summary.some(r => r[0] === R.MULTI_NOTE), true);

const html = R.reportBody(single, { ...meta, title: "<img src=x onerror=alert(1)>" });
eq("PDF escapes the question", [html.includes("<img src=x"), html.includes("&lt;img src=x onerror=alert(1)&gt;")], [false, true]);
eq("PDF has all four dimensions and unassigned", ["الباصات", "مخيمات منى", "رحلات الذهاب", "رحلات العودة", "غير مُسنَد", "QR1", "من DOH إلى JED"].every(t => noIso(html).includes(t)), true);
eq("PDF shows both percentages consistent with Excel (bus 2 «مساءً»: 50٪ / 100٪ من المجيبين)", html.includes("<b>1</b> · <b>50٪</b><div style=\"font-size:7pt;color:#777\">100٪ من المجيبين</div>"), true);
eq("PDF has nonrespondents column and the two-denominator note", html.includes("<th>لم يجيبوا</th>") && html.includes(R.DIST_NOTE), true);
eq("PDF has no Arafat/hotel sections", ["عرفة", "الفندق"].some(t => html.includes(t)), false);
eq("PDF closed: flight snapshot limitation stated", R.reportBody(ds, { ...meta, status: "closed" }).includes(R.FLIGHT_SNAPSHOT_NOTE), true);

console.log(`\nresult: ${pass} passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
