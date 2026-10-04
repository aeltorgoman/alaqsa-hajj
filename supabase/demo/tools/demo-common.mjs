/* Shared helpers for the Node Demo tools (no npm dependencies).
   Every write-capable entry point calls guard() before touching anything. */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const TOOLS = dirname(fileURLToPath(import.meta.url));
export const DEMO = join(TOOLS, "..");
export const DATASET_PATH = join(DEMO, "data", "dataset.json");
export const GENERATED = process.env.DEMO_GENERATED_DIR || join(DEMO, ".generated");
export const BUCKETS = ["passengers-docs", "company-assets", "company-private"];

/* DEMO_ENV_FILE: KEY=VALUE lines, never committed (see demo.env.example) */
if (process.env.DEMO_ENV_FILE) {
  const f = process.env.DEMO_ENV_FILE;
  if (!existsSync(f)) { console.error("✗ DEMO_ENV_FILE not found"); process.exit(1); }
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

export const env = (k) => {
  const v = (process.env[k] || "").trim();
  if (!v) { console.error(`✗ ${k} is required`); process.exit(1); }
  return v;
};
export const die = (m) => { console.error(`✗ ${m}`); process.exit(1); };

/** The full shell guard — re-run before every write-capable stage. */
export function guard(...flags) {
  const r = spawnSync("bash", [join(TOOLS, "assert-demo-target.sh"), ...flags], { stdio: "inherit", env: process.env });
  if (r.status !== 0) process.exit(1);
}

/** psql query returning parsed JSON (query must yield one json value). */
export function sqlJson(query) {
  const r = spawnSync("psql", [env("DEMO_DB_URL"), "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", query], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) die(`query failed: ${r.stderr.split("\n")[0]}`);
  return JSON.parse(r.stdout.trim() || "null");
}
/** psql statement(s) from stdin. Large values travel through temp files
    (a single argv entry is capped at 128 KB on Linux), loaded with \\set. */
export function sqlExec(script, vars = {}) {
  const dir = mkdtempSync(join(tmpdir(), "demo-sql-"));
  try {
    const args = [env("DEMO_DB_URL"), "-X", "-q", "-v", "ON_ERROR_STOP=1"];
    let pre = "";
    for (const [k, v] of Object.entries(vars)) {
      const f = join(dir, k); writeFileSync(f, String(v));
      args.push("-v", `${k}_path=${f}`); pre += `\\set ${k} \`cat :'${k}_path'\`\n`;
    }
    const r = spawnSync("psql", args, { input: pre + script, encoding: "utf8" });
    if (r.status !== 0) die(`statement failed: ${(r.stderr || "").split("\n")[0]}`);
    return r.stdout;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

/* ── Storage REST API ─────────────────────────────────────────── */
const api = () => env("DEMO_SUPABASE_URL").replace(/\/+$/, "");
const headers = (extra = {}) => { const k = env("DEMO_SERVICE_ROLE_KEY"); return { apikey: k, Authorization: `Bearer ${k}`, ...extra }; };
const enc = (p) => p.split("/").map(encodeURIComponent).join("/");

export async function storageList(bucket, prefix = "") {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${api()}/storage/v1/object/list/${bucket}`, {
      method: "POST", headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!r.ok) die(`list ${bucket}/${prefix}: HTTP ${r.status}`);
    const page = await r.json();
    for (const e of page) {
      const path = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.id === null) out.push(...(await storageList(bucket, path)));   // folder
      else out.push({ path, size: e.metadata?.size ?? null, mimetype: e.metadata?.mimetype ?? null });
    }
    if (page.length < 1000) break;
  }
  return out;
}
export async function storageUpload(bucket, path, bytes, contentType) {
  const r = await fetch(`${api()}/storage/v1/object/${bucket}/${enc(path)}`, {
    method: "POST", headers: headers({ "Content-Type": contentType, "x-upsert": "true", "cache-control": "3600" }), body: bytes,
  });
  if (!r.ok) die(`upload ${bucket}/${path}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
}
export async function storageRemove(bucket, paths) {
  for (let i = 0; i < paths.length; i += 500) {
    const r = await fetch(`${api()}/storage/v1/object/${bucket}`, {
      method: "DELETE", headers: headers({ "Content-Type": "application/json" }), body: JSON.stringify({ prefixes: paths.slice(i, i + 500) }),
    });
    if (!r.ok) die(`remove from ${bucket}: HTTP ${r.status}`);
  }
}
export async function storageDownload(bucket, path) {
  const r = await fetch(`${api()}/storage/v1/object/${bucket}/${enc(path)}`, { headers: headers() });
  if (!r.ok) return null;
  return new Uint8Array(await r.arrayBuffer());
}
export const publicUrl = (bucket, path) => `${api()}/storage/v1/object/public/${bucket}/${enc(path)}`;
