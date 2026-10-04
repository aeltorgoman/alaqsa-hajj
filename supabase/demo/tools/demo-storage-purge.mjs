#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════
   demo-storage-purge.mjs — empty the three Demo buckets (destructive)
   ════════════════════════════════════════════════════════════════
   Removes EVERY object in passengers-docs, company-assets and
   company-private of the Demo project — the seeded objects and anything
   a presenter uploaded during a demonstration — so a reset can never
   leave an orphan behind. Runs before the database cleanup.
   Requires the full Demo guard with the destructive confirmation.
   ════════════════════════════════════════════════════════════════ */
import { guard, storageList, storageRemove, BUCKETS } from "./demo-common.mjs";

guard("--destructive");
let total = 0;
for (const b of BUCKETS) {
  const objs = await storageList(b);
  if (objs.length) await storageRemove(b, objs.map((o) => o.path));
  const left = await storageList(b);
  if (left.length) { console.error(`✗ ${b}: ${left.length} objects remain after purge`); process.exit(1); }
  console.log(`  purged ${b}: ${objs.length} objects`);
  total += objs.length;
}
console.log(`✓ Demo Storage empty (${total} objects removed).`);
