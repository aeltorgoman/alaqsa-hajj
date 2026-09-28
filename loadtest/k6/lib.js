// Shared k6 library for the Pilgrim Portal load test.
// Calls exactly what src/components/PilgrimPortal.tsx calls, through the same PostgREST / Edge paths.
import http from "k6/http";
import { check, fail } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import { SharedArray } from "k6/data";

export const PRODUCTION_REF = "zkucwcnclbfvukhdqhgc"; // hard-blocked, never an input
const BASE = (__ENV.BASE_URL || "").replace(/\/+$/, "");
const REF = __ENV.LT_REF || "";
const KEY = __ENV.ANON_KEY || "";
const LOCAL = __ENV.LOCAL_DRY_RUN === "1"; // local PostgREST dry run only

// ── target guard: evaluated at init, before any request ──
if (!BASE || !KEY) fail("BASE_URL and ANON_KEY are required");
if (BASE.includes(PRODUCTION_REF) || KEY.includes(PRODUCTION_REF) || REF === PRODUCTION_REF) fail("REFUSING: production target");
if (!LOCAL) {
  if (!/^[a-z]{20}$/.test(REF)) fail("LT_REF must be the load-test project ref");
  if (BASE !== `https://${REF}.supabase.co`) fail("REFUSING: BASE_URL is not the load-test project");
} else if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(BASE)) fail("LOCAL_DRY_RUN only targets 127.0.0.1");
const REST = LOCAL ? BASE : `${BASE}/rest/v1`;
const FN = `${BASE}/functions/v1`;

export const ids = new SharedArray("ids", () => JSON.parse(open("./identities.json")).main);
export const docIds = new SharedArray("docIds", () => JSON.parse(open("./identities.json")).docs);
// LT000591..LT000600 are reserved for security probes and never used by load scenarios.
export const LOAD_POOL = 590;

export const loginMs = new Trend("login_ms", true);
export const portalMs = new Trend("portal_ms", true);
export const loginOk = new Rate("login_ok");
export const portalOk = new Rate("portal_ok");
export const isolationOk = new Rate("isolation_ok");
export const infraErr = new Rate("infra_errors");   // network (status 0) or 5xx
export const http429 = new Counter("http_429");
export const http5xx = new Counter("http_5xx");
export const netErr = new Counter("net_errors");

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const P = { headers: H, timeout: "30s" };

function account(res, ep) {
  const bad = res.status === 0 || res.status >= 500;
  infraErr.add(bad, { ep });
  if (res.status === 0) netErr.add(1, { ep });
  if (res.status >= 500) http5xx.add(1, { ep });
  if (res.status === 429) http429.add(1, { ep });
  return res;
}
const rpc = (fn, body, ep) =>
  account(http.post(`${REST}/rpc/${fn}`, JSON.stringify(body), { ...P, tags: { ep, name: `rpc:${fn}` } }), ep);

/** The two anonymous branding reads the branded login screen makes. */
export function loginScreen() {
  account(http.get(`${REST}/company_profile_public?select=name_ar,color_primary,color_accent&id=eq.1`, { ...P, tags: { ep: "brand", name: "brand:profile" } }), "brand");
  account(http.get(`${REST}/company_assets?select=asset_url&asset_key=eq.logo`, { ...P, tags: { ep: "brand", name: "brand:logo" } }), "brand");
}

/** create_pilgrim_session → token or null. Counts toward login thresholds only when expectOk. */
export function login(p, expectOk = true) {
  const res = rpc("create_pilgrim_session", { p_doc: p.doc, p_day: p.day, p_month: p.month, p_year: p.year }, "login");
  let body = null;
  try { body = res.json(); } catch (_) { /* null body */ }
  const token = body && body.token ? body.token : null;
  if (expectOk) {
    loginMs.add(res.timings.duration);
    const ok = res.status === 200 && !!token && !(body && body.rate_limited);
    loginOk.add(ok);
    check(res, { "login ok": () => ok });
  }
  return { res, body, token };
}

/** get_pilgrim_portal_by_session; asserts the data belongs to `p` (cross-pilgrim isolation). */
export function portal(token, p) {
  const res = rpc("get_pilgrim_portal_by_session", { p_token: token }, "portal");
  portalMs.add(res.timings.duration);
  let j = null;
  try { j = res.json(); } catch (_) { /* */ }
  const ok = res.status === 200 && j && j.pilgrim;
  portalOk.add(!!ok);
  if (ok && p) {
    const mine = j.pilgrim.name_ar === p.name && j.pilgrim.has_photo === false;
    isolationOk.add(mine);
    check(j, { "portal is own pilgrim": () => mine });
  }
  return j;
}

export function markRead(token, annIds) {
  for (const id of annIds) rpc("mark_pilgrim_notification_read", { p_token: token, p_announcement_id: id }, "alerts");
}

export function logout(token) {
  return rpc("revoke_pilgrim_session", { p_token: token }, "logout");
}

export function pilgrimDoc(token, docType) {
  return account(http.post(`${FN}/pilgrim-doc`, JSON.stringify({ token, doc_type: docType }),
    { ...P, tags: { ep: "doc", name: "fn:pilgrim-doc" } }), "doc");
}

export const rand = (a, b) => a + Math.random() * (b - a);
