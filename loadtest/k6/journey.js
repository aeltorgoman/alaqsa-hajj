// Sustained-concurrency journey: Stage A/B/C/D (and a 2-VU "smoke" profile for validation).
// One VU = one distinct synthetic pilgrim. Think time 5–30 s. Tab switches send nothing.
import { sleep } from "k6";
import exec from "k6/execution";
import { ids, LOAD_POOL, loginScreen, login, portal, markRead, logout, rand } from "./lib.js";

const PROFILES = {
  smoke: { stages: [{ duration: "20s", target: 2 }, { duration: "1m", target: 2 }, { duration: "10s", target: 0 }] },
  A: { stages: [{ duration: "2m", target: 50 },  { duration: "10m", target: 50 },  { duration: "1m", target: 0 }] },
  B: { stages: [{ duration: "2m", target: 100 }, { duration: "10m", target: 100 }, { duration: "1m", target: 0 }] },
  C: { stages: [{ duration: "3m", target: 250 }, { duration: "10m", target: 250 }, { duration: "2m", target: 0 }] },
  D: { stages: [{ duration: "5m", target: 500 }, { duration: "10m", target: 500 }, { duration: "2m", target: 0 }] },
};
const STAGE = __ENV.STAGE || "smoke";
if (!PROFILES[STAGE]) throw new Error(`unknown STAGE ${STAGE}`);
// session length per pilgrim; the smoke profile shortens it so a dry run completes
const SESSION_MIN = Number(__ENV.SESSION_MIN || (STAGE === "smoke" ? 0.5 : 5));
const SESSION_MAX = Number(__ENV.SESSION_MAX || (STAGE === "smoke" ? 1 : 15));
const THINK_MIN = Number(__ENV.THINK_MIN || 5), THINK_MAX = Number(__ENV.THINK_MAX || 30);
const TIMER_S = 180; // PilgrimPortal background refresh

export const options = {
  scenarios: { journey: { executor: "ramping-vus", startVUs: 0, stages: PROFILES[STAGE].stages, gracefulRampDown: "30s", gracefulStop: "30s" } },
  thresholds: {
    login_ok: ["rate>=0.995"],
    login_ms: ["p(95)<800", "p(99)<1500", { threshold: "p(95)<3000", abortOnFail: true, delayAbortEval: "2m" }],
    portal_ms: ["p(95)<600", { threshold: "p(95)<3000", abortOnFail: true, delayAbortEval: "2m" }],
    infra_errors: ["rate<0.005", { threshold: "rate<0.02", abortOnFail: true, delayAbortEval: "1m" }],
    http_429: [{ threshold: "count==0", abortOnFail: true }],
    isolation_ok: [{ threshold: "rate==1", abortOnFail: true }],
  },
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max", "count"],
};

export default function () {
  if (exec.vu.idInTest > LOAD_POOL) throw new Error("more VUs than distinct pilgrims");
  const me = ids[exec.vu.idInTest - 1];          // distinct pilgrim per VU
  loginScreen();
  const { token } = login(me);
  if (!token) { sleep(rand(THINK_MIN, THINK_MAX)); return; }
  const first = portal(token, me);                 // single initial fetch (no duplicate)
  const annIds = first && first.announcements ? first.announcements.map((a) => a.id) : [];
  let alertsSeen = false;

  const end = Date.now() + rand(SESSION_MIN, SESSION_MAX) * 60000;
  let nextTimer = Date.now() + TIMER_S * 1000;
  while (Date.now() < end) {
    sleep(rand(THINK_MIN, THINK_MAX));
    if (Date.now() >= nextTimer) { portal(token, me); nextTimer = Date.now() + TIMER_S * 1000; }
    const r = Math.random();
    if (r < 0.60) {                                 // reopen/reload the app → one portal fetch
      portal(token, me); nextTimer = Date.now() + TIMER_S * 1000;
    } else if (r < 0.85) {
      /* رحلتي ↔ سكني: no backend request */
    } else if (r < 0.95) {                          // open Alerts: marks read once per announcement
      if (!alertsSeen) { markRead(token, annIds); alertsSeen = true; }
    } else {                                        // logout and log back in
      logout(token);
      return;
    }
  }
  if (Math.random() < 0.3) logout(token);
}
