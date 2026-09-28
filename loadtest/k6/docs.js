// Document cohort (LD000001..LD000020) — SEPARATE phase, never mixed into the core capacity result.
// Also the pilgrim-doc 2000/h per-source finding scenario (measured later, not a confirmed failure).
import { sleep, check } from "k6";
import exec from "k6/execution";
import { docIds, login, pilgrimDoc, rand } from "./lib.js";

export const options = {
  scenarios: { docs: { executor: "per-vu-iterations", vus: Number(__ENV.DOC_VUS || 20), iterations: Number(__ENV.DOC_ITERS || 3), maxDuration: "15m" } },
  thresholds: { http_429: ["count==0"], infra_errors: ["rate<0.005"] },
};
export default function () {
  const me = docIds[(exec.vu.idInTest - 1) % docIds.length];
  const { token } = login(me);
  if (!token) return;
  for (const t of ["photo", "hajj_permit", "flight_ticket"]) {
    const r = pilgrimDoc(token, t);
    let j = null; try { j = r.json(); } catch (_) { /* */ }
    check(r, { "doc signed": (x) => x.status === 200 && j && j.url, "doc is own": () => !!(j && j.url && j.url.includes(me.doc)) });
    sleep(rand(5, 15));
  }
}
