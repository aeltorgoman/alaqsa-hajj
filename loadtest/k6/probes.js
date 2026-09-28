// Security / isolation probes — ONE VU, sequential, low volume. Uses reserved LT000591..LT000600 only.
// Counter effects (probe 4/5) are verified by the workflow with loadtest/sql/fingerprint.sql before/after.
import { check, fail } from "k6";
import http from "k6/http";
import { ids, login, portal, logout, pilgrimDoc, PRODUCTION_REF } from "./lib.js";

export const options = { vus: 1, iterations: 1, thresholds: { checks: ["rate==1"] } };
const R = (n) => ids[n - 1];                      // reserved identities
const A = R(591), B = R(592), C = R(593);

export default function () {
  // 7. production unreachable: the library refused at init if targeted; assert the configured base too
  check(null, { "7 base is not production": () => !(__ENV.BASE_URL || "").includes(PRODUCTION_REF) });

  // 1. isolation: each token returns only its own pilgrim
  const a = login(A).token, b = login(B).token;
  if (!a || !b) fail("probe logins failed");
  const pa = portal(a, A), pb = portal(b, B);
  check(null, {
    "1 token A → A": () => pa && pa.pilgrim.name_ar === A.name,
    "1 token B → B": () => pb && pb.pilgrim.name_ar === B.name,
    "1 token A never → B": () => pa && pa.pilgrim.name_ar !== B.name,
  });

  // 2. invalid / malformed / revoked token rejected
  const nullBody = (t) => { const j = portal(t, null); return j === null; };
  check(null, { "2 random token rejected": () => nullBody("x".repeat(43)), "2 empty token rejected": () => nullBody("") });
  const c = login(C).token;
  logout(c);
  check(null, { "2 revoked token rejected": () => nullBody(c) });

  // 3. wrong credentials fail uniformly (identical response); 4. each failure counts (checked in SQL)
  const wrongDob = login({ ...R(594), day: (R(594).day % 28) + 1 }, false);
  const wrongDoc = login({ ...R(595), doc: "LX999999" }, false);
  const wrongBoth = login({ doc: "LX999998", day: 1, month: 1, year: 1900 }, false);
  const bodies = [wrongDob, wrongDoc, wrongBoth].map((r) => `${r.res.status}|${r.res.body}`);
  check(null, {
    "3 wrong DOB rejected": () => !wrongDob.token,
    "3 wrong document rejected": () => !wrongDoc.token,
    "3 uniform failure response": () => bodies.every((x) => x === bodies[0]),
  });

  // 5. successful logins do not increment failure counters (checked in SQL: only 3 src + 3 doc hits)

  // 6. document access cannot cross pilgrim identity: A (main cohort, no documents) gets nothing,
  //    an invalid token gets the same generic answer. (Signed-URL ownership is probed in the document phase.)
  if (__ENV.LOCAL_DRY_RUN === "1") { logout(a); logout(b); return; } // no Edge runtime locally: never fake-pass probe 6
  for (const t of ["photo", "hajj_permit", "flight_ticket"]) {
    const r = pilgrimDoc(a, t);
    check(r, { [`6 ${t}: token A gets no foreign document`]: (x) => x.status === 404 });
  }
  const inv = pilgrimDoc("y".repeat(43), "hajj_permit");
  check(inv, { "6 invalid token → 404": (x) => x.status === 404 });
  logout(a); logout(b);
}
