// Burst: ~500 distinct pilgrim logins spread over ~60 s, then normal portal activity.
import { sleep } from "k6";
import exec from "k6/execution";
import { ids, LOAD_POOL, loginScreen, login, portal, logout, rand } from "./lib.js";

const LOGINS = Number(__ENV.BURST_LOGINS || 500);
const AFTER_MIN = Number(__ENV.AFTER_MIN || 5);
export const options = {
  scenarios: { burst: { executor: "constant-arrival-rate", rate: LOGINS, timeUnit: "60s", duration: "60s",
    preAllocatedVUs: Math.min(LOGINS + 50, LOAD_POOL), maxVUs: LOAD_POOL, gracefulStop: `${AFTER_MIN * 60 + 60}s` } },
  thresholds: {
    login_ok: ["rate>=0.995"], login_ms: ["p(95)<800", "p(99)<1500"], portal_ms: ["p(95)<600"],
    infra_errors: ["rate<0.005", { threshold: "rate<0.02", abortOnFail: true, delayAbortEval: "30s" }],
    http_429: [{ threshold: "count==0", abortOnFail: true }],
    isolation_ok: [{ threshold: "rate==1", abortOnFail: true }],
  },
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max", "count"],
};

export default function () {
  const n = exec.scenario.iterationInTest;       // 0-based, distinct per login
  if (n >= LOAD_POOL) throw new Error("more logins than distinct pilgrims");
  const me = ids[n];
  loginScreen();
  const { token } = login(me);
  if (!token) return;
  portal(token, me);
  const end = Date.now() + AFTER_MIN * 60000;
  while (Date.now() < end) { sleep(rand(5, 30)); if (Math.random() < 0.6) portal(token, me); }
  if (Math.random() < 0.3) logout(token);
}
