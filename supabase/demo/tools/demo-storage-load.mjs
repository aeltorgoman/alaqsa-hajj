#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════
   demo-storage-load.mjs — upload the synthetic documents, then reference them
   ════════════════════════════════════════════════════════════════
   Storage truthfulness, enforced by construction:
     1. upload every generated object;
     2. list the buckets and keep only what really exists, with the
        expected size and type;
     3. ONLY THEN write the database references, in one transaction —
        so a non-null reference can never point at a missing object.
   Passenger ids are resolved from the deterministic passport numbers
   (no identity override, no sequence surgery). Keys follow the app's own
   convention: passengers-docs `<passenger_id>/<doc_type>_demo.<ext>`
   (object key stored); company-assets full public URL stored;
   company-private object key stored.
   Re-runnable: uploads upsert and the references are rewritten.
   ════════════════════════════════════════════════════════════════ */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { guard, die, sqlJson, sqlExec, storageUpload, storageList, publicUrl, DATASET_PATH, GENERATED } from "./demo-common.mjs";

const COL = { photo: "photo_url", passport: "passport_url", national_id: "national_id_url", contract: "contract_url", hajj_permit: "hajj_permit_url", flight_ticket: "flight_ticket_url" };
const ds = JSON.parse(readFileSync(DATASET_PATH, "utf8"));

console.log("── guard ──"); guard();
if (!existsSync(join(GENERATED, "people"))) die("no generated documents — run tools/generate-demo-documents.mjs first");

/* 1. resolve passenger ids by passport (seeded rows only) */
const ids = sqlJson(`select coalesce(json_object_agg(passport, id), '{}') from public.passengers where created_by = 'demo-seed'`);
const plan = [];
for (const p of ds.people) for (const d of p.docs) {
  const id = ids[p.passport];
  if (!id) die(`passenger ${p.ref} not found — run demo-seed.sh first`);
  const ext = d === "contract" ? "pdf" : "png";
  const file = join(GENERATED, "people", p.ref, `${d}.${ext}`);
  if (!existsSync(file)) die(`missing generated file for ${p.ref}/${d}`);
  plan.push({ ref: p.ref, passport: p.passport, doc: d, key: `${id}/${d}_demo.${ext}`, file, type: ext === "pdf" ? "application/pdf" : "image/png" });
}
console.log(`── upload ${plan.length} passenger objects + ${ds.company_assets.length} company assets ──`);
let n = 0;
for (const o of plan) { await storageUpload("passengers-docs", o.key, readFileSync(o.file), o.type); if (++n % 100 === 0) console.log(`  ${n}/${plan.length}`); }
for (const a of ds.company_assets) await storageUpload(a.bucket, a.file, readFileSync(join(GENERATED, "company", a.file)), "image/png");

/* 2. what really exists */
console.log("── confirm objects exist ──");
const listed = new Map((await storageList("passengers-docs")).map((o) => [o.path, o]));
const missing = plan.filter((o) => !listed.has(o.key) || Number(listed.get(o.key).size) !== readFileSync(o.file).length);
if (missing.length) die(`${missing.length} uploaded objects are not present with the expected size — no reference written`);
for (const b of ["company-assets", "company-private"]) {
  const have = new Set((await storageList(b)).map((o) => o.path));
  for (const a of ds.company_assets.filter((x) => x.bucket === b)) if (!have.has(a.file)) die(`${b}/${a.file} missing — no reference written`);
}

/* 3. references — one transaction, guard re-run first */
console.log("── write references (guard first) ──"); guard("--no-api");
const rows = plan.map((o) => ({ passport: o.passport, col: COL[o.doc], key: o.key }));
const assets = ds.company_assets.map((a) => ({ key: a.key, url: a.bucket === "company-assets" ? publicUrl(a.bucket, a.file) : a.file, alt: a.alt_text }));
sqlExec(`
\\set ON_ERROR_STOP on
begin;
create temp table demo_refs (passport text, col text, key text) on commit drop;
insert into demo_refs select x->>'passport', x->>'col', x->>'key' from jsonb_array_elements(:'rows'::jsonb) x;
do $$
declare c text;
begin
  if exists (select 1 from demo_refs r left join public.passengers p on p.passport = r.passport where p.id is null) then
    raise exception 'reference for an unknown passenger';
  end if;
  foreach c in array array['photo_url','passport_url','national_id_url','contract_url','hajj_permit_url','flight_ticket_url'] loop
    execute format('update public.passengers p set %1$I = r.key from demo_refs r where r.passport = p.passport and r.col = %2$L', c, c);
  end loop;
end $$;
insert into public.company_assets (asset_key, asset_url, alt_text, metadata)
select x->>'key', x->>'url', x->>'alt', jsonb_build_object('demo', true, 'synthetic', true)
  from jsonb_array_elements(:'assets'::jsonb) x
on conflict (asset_key) do update set asset_url = excluded.asset_url, alt_text = excluded.alt_text, metadata = excluded.metadata, updated_at = now();
commit;
`, { rows: JSON.stringify(rows), assets: JSON.stringify(assets) });
console.log(`✓ ${plan.length} passenger documents and ${assets.length} company assets loaded and referenced.`);
