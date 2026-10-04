#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════
   demo-portal-smoke.mjs — exercise the Pilgrim Portal like a browser
   ════════════════════════════════════════════════════════════════
   With the PUBLIC (anon/publishable) key only — exactly what the portal
   page holds — it:
     1. confirms a wrong date of birth is refused;
     2. logs in with create_pilgrim_session (the normal path; no session
        is ever pre-seeded);
     3. reads get_pilgrim_portal_by_session and checks every section the
        demo relies on;
     4. opens photo, Hajj permit and flight ticket through the real
        `pilgrim-doc` Edge Function and checks the returned bytes;
     5. revokes the session.
   Default pilgrim: the rehearsal credential DEMO-P-002, so the
   presenter's DEMO-P-001 is never used up by rehearsals.
   Writes only what a real login writes (a session row, rate-limit
   counters). Guarded like every other Demo tool.
     DEMO_ANON_KEY=… node demo-portal-smoke.mjs [--pilgrim DEMO-P-001]
   ════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import { guard, env, die, DATASET_PATH } from "./demo-common.mjs";

const ref = process.argv.includes("--pilgrim") ? process.argv[process.argv.indexOf("--pilgrim") + 1] : "DEMO-P-002";
const ds = JSON.parse(readFileSync(DATASET_PATH, "utf8"));
const p = ds.people.find((x) => x.portal === ref) ?? die(`no portal pilgrim ${ref}`);
const API = env("DEMO_SUPABASE_URL").replace(/\/+$/, "");
const ANON = env("DEMO_ANON_KEY");
const FN = (process.env.DEMO_FUNCTIONS_URL || `${API}/functions/v1`).replace(/\/+$/, "");
const H = { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" };
const rpc = async (fn, body) => { const r = await fetch(`${API}/rest/v1/rpc/${fn}`, { method: "POST", headers: H, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; };
const fails = [];
const ok = (name, cond) => { console.log(`  ${cond ? "✓" : "✗"} ${name}`); if (!cond) fails.push(name); };

guard();
const [d, m, y] = p.dob.split("/").map(Number);

const wrong = await rpc("create_pilgrim_session", { p_doc: p.passport, p_day: d === 1 ? 2 : 1, p_month: m, p_year: y });
ok("wrong date of birth is refused", !wrong.body || !wrong.body.token);

const login = await rpc("create_pilgrim_session", { p_doc: p.passport, p_day: d, p_month: m, p_year: y });
const token = login.body?.token;
ok("login with passport + date of birth issues a session", !!token);
if (!token) die("login failed — cannot continue");

const view = (await rpc("get_pilgrim_portal_by_session", { p_token: token })).body;
ok("portal data returned", !!view);
const pg = view?.pilgrim ?? {};
ok("pilgrim name", pg.name_ar === p.name_ar);
ok("photo / permit / ticket flagged present", pg.has_photo && pg.has_hajj_permit && pg.has_flight_ticket);
ok("bus", !!view.bus?.name);
ok("room", !!view.room?.number);
ok("roommates", Array.isArray(view.roommates) && view.roommates.length >= 1);
ok("family", Array.isArray(view.family) && view.family.length >= 2);
ok("Mina and Arafat camps", !!pg.camp_mina_name && !!pg.camp_arafa_name);
ok("outbound and return flights", !!view.flight_go?.name && !!view.flight_back?.name);
ok("season locations", !!view.season?.hotel_name && !!view.season?.mina_url);
ok("company identity + assets", !!view.config?.name_ar && ["logo", "portal_banner", "favicon"].every((k) => view.config?.assets?.[k]));
const manifest = JSON.parse(readFileSync(new URL("../demo.manifest.json", import.meta.url), "utf8"));
ok(`announcements visible (${manifest.active_season.announcements.visible_in_portal})`, view.announcements?.length === manifest.active_season.announcements.visible_in_portal);
ok("urgent announcement first", view.announcements?.[0]?.priority === "عاجل");

for (const doc of ["photo", "hajj_permit", "flight_ticket"]) {
  const r = await fetch(`${FN}/pilgrim-doc`, { method: "POST", headers: H, body: JSON.stringify({ token, doc_type: doc }) });
  const j = await r.json().catch(() => ({}));
  let good = false;
  if (r.ok && j.url) {
    const f = await fetch(j.url);
    const b = new Uint8Array(await f.arrayBuffer());
    good = f.ok && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  }
  ok(`pilgrim-doc opens ${doc} (HTTP ${r.status})`, good);
}

await rpc("revoke_pilgrim_session", { p_token: token });
const after = await rpc("get_pilgrim_portal_by_session", { p_token: token });
ok("revoked session no longer reads the portal", !after.body);

console.log(fails.length ? `\n✗ portal smoke: ${fails.length} failed` : `\n✓ portal smoke: ${ref} — login, data, documents, revoke all work`);
process.exit(fails.length ? 1 : 0);
