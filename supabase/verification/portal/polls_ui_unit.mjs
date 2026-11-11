// Polls Phase 3 — منطقُ الواجهة بلا متصفّح (src/components/polls/polls.ts · src/components/portal/portal.polls.ts)
//   node --experimental-strip-types supabase/verification/portal/polls_ui_unit.mjs
// الحمولةُ التي تُرسلها الإدارة هي ما تتحقّق منه القاعدة (`_poll_validate` · `_announcement_audience_check`)،
// وترجمةُ الردود تغطّي كلَّ ما يردّه `submit_pilgrim_poll_response` في Phase 2.
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const P = await import(path.join(here, "../../../src/components/polls/polls.ts"));
const V = await import(path.join(here, "../../../src/components/portal/portal.polls.ts"));
let pass = 0, fail = 0;
const eq = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} — ${n}${ok ? "" : ` (got ${JSON.stringify(got)})`}`); };
const NOW = Date.parse("2026-11-12T10:00:00Z");
const local = (ms) => P.toLocalInput(new Date(ms));
const base = (o = {}) => ({ ...P.emptyForm(NOW), title: "  ما رأيك؟ ", options: ["نعم", "لا"], ...o });

// ── الإدارة: التحقّقُ والحمولة ──
const ok = P.validateForm(base(), NOW);
eq("valid single-choice draft → payload exactly as create_poll takes it", ok.payload, {
  p_title: "ما رأيك؟", p_body: null, p_kind: "single", p_max_choices: null, p_audience: { all: true },
  p_options: ["نعم", "لا"], p_closes_at: null, p_allow_answer_changes: true });
eq("allow_answer_changes defaults to true", P.emptyForm(NOW).allowChanges, true);
eq("empty question rejected", Object.keys(P.validateForm(base({ title: "  " }), NOW).errors), ["title"]);
eq("one option rejected", P.validateForm(base({ options: ["نعم"] }), NOW).errors.options, "يحتاج الاستطلاع خيارين على الأقل.");
eq("blank option rejected", !!P.validateForm(base({ options: ["نعم", " "] }), NOW).errors.options, true);
eq("duplicate options (after trim) rejected", P.validateForm(base({ options: ["نعم", " نعم "] }), NOW).errors.options, "خياران متطابقان — يجب أن تختلف الخيارات.");
eq("21 options rejected", !!P.validateForm(base({ options: Array.from({ length: 21 }, (_, i) => `خيار ${i}`) }), NOW).errors.options, true);
eq("single-choice never sends max_choices", P.validateForm(base({ maxChoices: "2" }), NOW).payload.p_max_choices, null);
eq("multiple: max above option count rejected", !!P.validateForm(base({ kind: "multiple", maxChoices: "3" }), NOW).errors.maxChoices, true);
eq("multiple: max 0 rejected", !!P.validateForm(base({ kind: "multiple", maxChoices: "0" }), NOW).errors.maxChoices, true);
eq("multiple: valid max sent", P.validateForm(base({ kind: "multiple", maxChoices: "2", options: ["أ", "ب", "ج"] }), NOW).payload.p_max_choices, 2);
eq("multiple: no max → null (no limit)", P.validateForm(base({ kind: "multiple" }), NOW).payload.p_max_choices, null);
eq("empty audience rejected", !!P.validateForm(base({ audience: { all: false } }), NOW).errors.audience, true);
eq("audience cleaned: hotel only, no all", P.validateForm(base({ audience: { all: false, hotel: [4, 4] } }), NOW).payload.p_audience, { hotel: [4] });
eq("allow_answer_changes false is sent", P.validateForm(base({ allowChanges: false }), NOW).payload.p_allow_answer_changes, false);
eq("closing date in the past rejected", !!P.validateForm(base({ hasClose: true, closesAt: local(NOW - 60000) }), NOW).errors.closesAt, true);
eq("closing date sent as ISO", P.validateForm(base({ hasClose: true, closesAt: local(NOW + 86400000) }), NOW).payload.p_closes_at, new Date(local(NOW + 86400000)).toISOString());
eq("scheduled: past time rejected", !!P.validateForm(base({ mode: "scheduled", publishAt: local(NOW - 60000) }), NOW).errors.publishAt, true);
eq("scheduled: closing before publishing rejected", P.validateForm(base({ mode: "scheduled", publishAt: local(NOW + 7200000), hasClose: true, closesAt: local(NOW + 3600000) }), NOW).errors.closesAt, "موعد الإغلاق يجب أن يكون بعد موعد النشر.");
eq("scheduled: publish time returned as ISO", P.validateForm(base({ mode: "scheduled", publishAt: local(NOW + 7200000) }), NOW).publishAt, new Date(local(NOW + 7200000)).toISOString());
eq("no payload while any error exists", P.validateForm(base({ title: "", options: ["x"] }), NOW).payload, null);

// ── الأفعالُ بحسب الحال: لا يُعرض ما ترفضه القاعدة ──
eq("draft: edit · publish · schedule · delete", P.actionsFor("draft"), { edit: true, publish: true, schedule: true, unschedule: false, close: false, remove: true });
eq("scheduled: edit · unschedule · delete (no direct publish-now)", P.actionsFor("scheduled"), { edit: true, publish: false, schedule: false, unschedule: true, close: false, remove: true });
eq("published: close only (immutable)", P.actionsFor("published"), { edit: false, publish: false, schedule: false, unschedule: false, close: true, remove: false });
eq("closed: nothing", Object.values(P.actionsFor("closed")).some(Boolean), false);

// ── أخطاءُ القاعدة ──
eq("42501 → permission message", P.rpcErrorText({ code: "42501", message: "x" }, "f"), "لا تملك صلاحية إدارة بوابة الحاج.");
eq("22023 → database's Arabic message", P.rpcErrorText({ code: "22023", message: "نُشر الاستطلاع" }, "f"), "نُشر الاستطلاع");
eq("unknown error → fallback (no raw message)", P.rpcErrorText({ code: "XX000", message: "internal" }, "f"), "f");
eq("participation", P.participation({ audience: 8, respondents: 6, options: [] }), "6 من 8 (75٪)");

// ── البوابة: كلُّ ردٍّ موثَّق ──
const o = (s, x = {}) => V.submitOutcome({ status: s, ...x }, [5]);
eq("ok → success, adopt server revision", [o("ok", { revision: 1, option_ids: [5] }).tone, o("ok", { revision: 1, option_ids: [5] }).adopt], ["success", { revision: 1, option_ids: [5] }]);
eq("unchanged → info", o("unchanged", { revision: 2, option_ids: [5] }).tone, "info");
eq("stale → adopt the newer answer, keep editing (never overwrite)", [o("stale", { revision: 3, option_ids: [7] }).adopt, o("stale", { revision: 3, option_ids: [7] }).keepEditing], [{ revision: 3, option_ids: [7] }, true]);
eq("final → show the recorded final answer", [o("final", { revision: 1, option_ids: [9] }).tone, o("final", { revision: 1, option_ids: [9] }).adopt], ["warning", { revision: 1, option_ids: [9] }]);
eq("closed → error + refresh, nothing adopted", [o("closed").tone, o("closed").refresh, o("closed").adopt], ["error", true, undefined]);
eq("not_found → error + refresh", [o("not_found").tone, o("not_found").refresh], ["error", true]);
eq("rate_limited → error, no refresh", [o("rate_limited").tone, o("rate_limited").refresh], ["error", undefined]);
eq("null → session expired", V.submitOutcome(null, [1]).expired, true);
const poll = (x = {}) => ({ id: 1, title: "س", body: null, kind: "single", max_choices: null, allow_answer_changes: true, state: "open", published_at: null, closes_at: null, options: [], my_response: null, ...x });
eq("phases", [V.pollPhase(poll()), V.pollPhase(poll({ my_response: { revision: 1, option_ids: [1] } })), V.pollPhase(poll({ allow_answer_changes: false, my_response: { revision: 1, option_ids: [1] } })), V.pollPhase(poll({ state: "closed" }))],
   ["open-unanswered", "open-answered", "open-final", "closed"]);
eq("passed closing time shown as closed", V.pollPhase(poll({ closes_at: "2026-11-12T09:59:00Z" }), NOW), "closed");
eq("selection: none / two on single / over max", [V.selectionError(poll(), []), V.selectionError(poll(), [1, 2]), V.selectionError(poll({ kind: "multiple", max_choices: 2 }), [1, 2, 3])],
   ["اختر إجابة واحدة.", "اختر إجابة واحدة فقط.", "يمكنك اختيار 2 على الأكثر."]);
eq("selection within max ok", V.selectionError(poll({ kind: "multiple", max_choices: 2 }), [1, 2]), null);
console.log(`\nresult: ${pass} passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
