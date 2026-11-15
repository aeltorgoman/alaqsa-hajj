// مراجعة v1.3.0 — عزلُ جلسة الحاجّ · حداثةُ الصفحات التالية · مراجعةُ إجابة الاستطلاع (منطقٌ بلا متصفّح)
//   node --experimental-strip-types supabase/verification/portal/portal_session_isolation_unit.mjs
// src/components/portal/portal.announcements.ts · src/components/portal/portal.polls.ts
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const A = await import(path.join(here, "../../../src/components/portal/portal.announcements.ts"));
const V = await import(path.join(here, "../../../src/components/portal/portal.polls.ts"));
let pass = 0, fail = 0;
const eq = (n, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} — ${n}${ok ? "" : ` (got ${JSON.stringify(got)})`}`); };
const ann = (id, o = {}) => ({ id, body: `b${id}`, priority: "عام", show_at: "2026-11-01T00:00:00Z", revision: 1, state: "unread", ...o });

// ── P1: جيلُ الجلسة ──
{
  const g = A.createSessionGate();
  const s = g.snapshot("tokA");
  eq("a request for the unchanged session is current", g.isCurrent(s, "tokA"), true);
  eq("token changed (another pilgrim logged in) → stale", g.isCurrent(s, "tokB"), false);
  eq("token cleared (logout / expiry) → stale", g.isCurrent(s, null), false);
  g.bump();
  eq("generation bumped, same token → stale (expire then re-login as the same pilgrim)", g.isCurrent(s, "tokA"), false);
  const s2 = g.snapshot("tokA");
  eq("a request started after the change is current", g.isCurrent(s2, "tokA"), true);
  eq("no token at snapshot is never current", g.isCurrent(g.snapshot(null), null), false);
  eq("generation counts up", g.gen, 1);
}

// ── P2: دمجُ الصفحات بالمعرّف مع التحديث ──
{
  const first = [ann(1), ann(2)];
  eq("new page appended, first-page ids excluded", A.mergeAnnPage(first, [], [ann(2), ann(3), ann(4)]).map(a => a.id), [3, 4]);
  const prev = [ann(3), ann(4)];
  const merged = A.mergeAnnPage(first, prev, [ann(4, { body: "edited", revision: 2 }), ann(5)]);
  eq("an already-cached id is UPDATED with the fresh copy (not skipped)", merged.map(a => [a.id, a.revision, a.body]), [[3, 1, "b3"], [4, 2, "edited"], [5, 1, "b5"]]);
  eq("an id that moved into the first page leaves the extra list", A.mergeAnnPage([ann(1), ann(3)], prev, []).map(a => a.id), [4]);
  eq("no duplicates when a page repeats ids", A.mergeAnnPage(first, prev, [ann(3), ann(3)]).map(a => a.id), [3, 4]);
}

// ── P2: إعادةُ جلب ما حُمّل بعد الصفحة الأولى ──
{
  const server = (items, size) => { const calls = []; return { calls, fetch: async (o) => { calls.push(o); const p = items.slice(o, o + size); return { items: p, total: items.length, unread: 0, has_more: items.length > o + size }; } }; };
  // 25 تنبيهاً، صفحةٌ أولى 10، وحُمّلت صفحتان (20 تنبيهاً بعد الأولى = 10..29 سابقاً). ثم حُذف 13 و17.
  const live = Array.from({ length: 25 }, (_, i) => ann(i + 1)).filter(a => a.id !== 13 && a.id !== 17);
  const s1 = server(live, 10);
  const r = await A.collectAnnRange(s1.fetch, 10, 15, 10);
  eq("refetch starts after the fresh first page and covers what was shown", s1.calls, [10, 20]);
  eq("deleted announcements are gone from the refetched pages", r.items.some(a => a.id === 13 || a.id === 17), false);
  eq("has_more follows the server", r.has_more, false);
  const s2 = server(live, 10);
  await A.collectAnnRange(s2.fetch, 10, 4, 10);
  eq("one loaded page → exactly one request (no extra round trips)", s2.calls, [10]);
  const s3 = server(Array.from({ length: 200 }, (_, i) => ann(i + 1)), 10);
  await A.collectAnnRange(s3.fetch, 10, 20, 10);
  eq("bounded: never more pages than were loaded", s3.calls.length, 2);
  const failing = await A.collectAnnRange(async () => null, 10, 10, 10);
  eq("a rejected/failed page → null (caller drops the extra pages)", failing, null);
  const shrunk = server([ann(1), ann(2)], 10);
  const r2 = await A.collectAnnRange(shrunk.fetch, 10, 10, 10);
  eq("everything after the first page expired → empty, no more", [r2.items.length, r2.has_more], [0, false]);
}

// ── P2: مراجعةُ إجابة الاستطلاع ──
{
  const p = (rev) => ({ id: 1, my_response: rev ? { revision: rev, option_ids: [11] } : null });
  eq("first answer sends 0", V.expectedRevision("open-unanswered", null, p(0)), 0);
  eq("edit started at rev 2, refresh brought rev 3 → still sends 2", V.expectedRevision("open-answered", 2, p(3)), 2);
  eq("not editing → the recorded revision", V.expectedRevision("open-answered", null, p(3)), 3);
  eq("conflict detected when the recorded revision moved after the edit began", V.changedSinceEdit(2, p(3)), true);
  eq("no conflict when unchanged", V.changedSinceEdit(3, p(3)), false);
  eq("no conflict when not editing", V.changedSinceEdit(null, p(3)), false);
  eq("answer withdrawn elsewhere (rev → 0) is a conflict", V.changedSinceEdit(2, p(0)), true);
  // القاعدةُ تردّ stale عند الإرسال بالرقم القديم: البطاقةُ تعتمد المسجَّلة وتبقى في التعديل
  const o = V.submitOutcome({ status: "stale", revision: 3, option_ids: [12] }, [13]);
  eq("stale → adopt the newer answer and keep editing (never overwritten)", [o.adopt, o.keepEditing], [{ revision: 3, option_ids: [12] }, true]);
}

console.log(`\nresult: ${pass} passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
