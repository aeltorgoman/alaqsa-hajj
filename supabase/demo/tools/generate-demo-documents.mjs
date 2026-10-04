#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════
   generate-demo-documents.mjs — synthetic Demo documents, no deps
   ════════════════════════════════════════════════════════════════
   Writes PNG/PDF files to supabase/demo/.generated/ (git-ignored):
     people/<ref>/{photo,passport,national_id,hajj_permit,flight_ticket}.png
     people/<ref>/contract.pdf
     company/<asset_key>_demo.png
     ocr-samples/walk-in-{passport,national-id,hajj-permit}.png
   Only the documents each person's `docs` list names are produced.

   Every document is visibly stamped "DEMO — NOT A REAL DOCUMENT" (a
   banner plus a repeated diagonal watermark). Personal photos are
   deterministic geometric avatars — never a face, real or generated.
   Passports use the ICAO specimen state code UTO and deliberately wrong
   MRZ check digits; IDs, permits and tickets are fictitious layouts.
   Nothing is copied from, or derived from, any real document or person.

   Pure Node (zlib only): PNG encoder, 5×7 bitmap font, minimal PDF.
   Output is byte-for-byte deterministic for a given dataset.json.
   Generating writes nothing outside .generated/ and touches no database.
   ════════════════════════════════════════════════════════════════ */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DEMO = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.DEMO_GENERATED_DIR || join(DEMO, ".generated");
const ds = JSON.parse(readFileSync(join(DEMO, "data", "dataset.json"), "utf8"));
const WATERMARK = "DEMO — NOT A REAL DOCUMENT";

/* ── PNG ───────────────────────────────────────────────────────── */
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(cv) {
  const raw = Buffer.alloc((cv.w * 3 + 1) * cv.h);
  for (let y = 0; y < cv.h; y++) { raw[y * (cv.w * 3 + 1)] = 0; cv.px.copy(raw, y * (cv.w * 3 + 1) + 1, y * cv.w * 3, (y + 1) * cv.w * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(cv.w, 0); ihdr.writeUInt32BE(cv.h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

/* ── 5×7 bitmap font (ASCII subset) ───────────────────────────── */
const G = {
  A: ["01110","10001","10001","11111","10001","10001","10001"], B: ["11110","10001","10001","11110","10001","10001","11110"],
  C: ["01110","10001","10000","10000","10000","10001","01110"], D: ["11110","10001","10001","10001","10001","10001","11110"],
  E: ["11111","10000","10000","11110","10000","10000","11111"], F: ["11111","10000","10000","11110","10000","10000","10000"],
  G: ["01110","10001","10000","10111","10001","10001","01111"], H: ["10001","10001","10001","11111","10001","10001","10001"],
  I: ["01110","00100","00100","00100","00100","00100","01110"], J: ["00111","00010","00010","00010","00010","10010","01100"],
  K: ["10001","10010","10100","11000","10100","10010","10001"], L: ["10000","10000","10000","10000","10000","10000","11111"],
  M: ["10001","11011","10101","10101","10001","10001","10001"], N: ["10001","11001","10101","10011","10001","10001","10001"],
  O: ["01110","10001","10001","10001","10001","10001","01110"], P: ["11110","10001","10001","11110","10000","10000","10000"],
  Q: ["01110","10001","10001","10001","10101","10010","01101"], R: ["11110","10001","10001","11110","10100","10010","10001"],
  S: ["01111","10000","10000","01110","00001","00001","11110"], T: ["11111","00100","00100","00100","00100","00100","00100"],
  U: ["10001","10001","10001","10001","10001","10001","01110"], V: ["10001","10001","10001","10001","10001","01010","00100"],
  W: ["10001","10001","10001","10101","10101","10101","01010"], X: ["10001","10001","01010","00100","01010","10001","10001"],
  Y: ["10001","10001","01010","00100","00100","00100","00100"], Z: ["11111","00001","00010","00100","01000","10000","11111"],
  "0": ["01110","10001","10011","10101","11001","10001","01110"], "1": ["00100","01100","00100","00100","00100","00100","01110"],
  "2": ["01110","10001","00001","00010","00100","01000","11111"], "3": ["11111","00010","00100","00010","00001","10001","01110"],
  "4": ["00010","00110","01010","10010","11111","00010","00010"], "5": ["11111","10000","11110","00001","00001","10001","01110"],
  "6": ["00110","01000","10000","11110","10001","10001","01110"], "7": ["11111","00001","00010","00100","01000","01000","01000"],
  "8": ["01110","10001","10001","01110","10001","10001","01110"], "9": ["01110","10001","10001","01111","00001","00010","01100"],
  " ": ["00000","00000","00000","00000","00000","00000","00000"], "-": ["00000","00000","00000","11111","00000","00000","00000"],
  "—": ["00000","00000","00000","11111","00000","00000","00000"], ".": ["00000","00000","00000","00000","00000","01100","01100"],
  "/": ["00001","00010","00010","00100","01000","01000","10000"], ":": ["00000","01100","01100","00000","01100","01100","00000"],
  "<": ["00010","00100","01000","10000","01000","00100","00010"], ">": ["01000","00100","00010","00001","00010","00100","01000"],
  ",": ["00000","00000","00000","00000","01100","00100","01000"], "(": ["00010","00100","01000","01000","01000","00100","00010"],
  ")": ["01000","00100","00010","00010","00010","00100","01000"], "#": ["01010","01010","11111","01010","11111","01010","01010"],
  "+": ["00000","00100","00100","11111","00100","00100","00000"], "'": ["01100","00100","01000","00000","00000","00000","00000"],
  "&": ["01100","10010","10100","01000","10101","10010","01101"], "!": ["00100","00100","00100","00100","00100","00000","00100"],
};
const glyph = (ch) => G[ch] ?? G[ch.toUpperCase()] ?? G["#"];

/* ── canvas ───────────────────────────────────────────────────── */
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function canvas(w, h, bg = "#ffffff") {
  const px = Buffer.alloc(w * h * 3); const [r, g, b] = hex(bg);
  for (let i = 0; i < w * h; i++) { px[i * 3] = r; px[i * 3 + 1] = g; px[i * 3 + 2] = b; }
  const cv = { w, h, px };
  cv.set = (x, y, c, a = 1) => {
    x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 3;
    for (let k = 0; k < 3; k++) px[i + k] = Math.round(px[i + k] * (1 - a) + c[k] * a);
  };
  cv.rect = (x, y, rw, rh, color, a = 1) => { const c = hex(color); for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) cv.set(i, j, c, a); };
  cv.frame = (x, y, rw, rh, color, t = 2) => { cv.rect(x, y, rw, t, color); cv.rect(x, y + rh - t, rw, t, color); cv.rect(x, y, t, rh, color); cv.rect(x + rw - t, y, t, rh, color); };
  cv.disc = (cx, cy, r, color, a = 1) => { const c = hex(color); for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r) cv.set(cx + i, cy + j, c, a); };
  cv.ring = (cx, cy, r, t, color) => { const c = hex(color); for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const d = i * i + j * j; if (d <= r * r && d >= (r - t) * (r - t)) cv.set(cx + i, cy + j, c); } };
  cv.line = (x0, y0, x1, y1, color, t = 2) => { const c = hex(color); const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0)); for (let s = 0; s <= n; s++) { const x = x0 + (x1 - x0) * s / n, y = y0 + (y1 - y0) * s / n; for (let j = -t; j <= t; j++) for (let i = -t; i <= t; i++) if (i * i + j * j <= t * t) cv.set(x + i, y + j, c); } };
  cv.text = (x, y, str, s, color, a = 1) => {
    const c = hex(color); let cx = x;
    for (const ch of String(str)) {
      const gl = glyph(ch);
      for (let r = 0; r < 7; r++) for (let q = 0; q < 5; q++) if (gl[r][q] === "1") for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) cv.set(cx + q * s + i, y + r * s + j, c, a);
      cx += 6 * s;
    }
    return cx;
  };
  cv.textW = (str, s) => String(str).length * 6 * s - s;
  cv.textC = (cx, y, str, s, color, a = 1) => cv.text(Math.round(cx - cv.textW(str, s) / 2), y, str, s, color, a);
  /* rotated text for the diagonal watermark */
  cv.textRot = (cx, cy, str, s, color, ang, a) => {
    const c = hex(color); const cos = Math.cos(ang), sin = Math.sin(ang); const W = cv.textW(str, s), H = 7 * s;
    let ox = 0;
    for (const ch of String(str)) {
      const gl = glyph(ch);
      for (let r = 0; r < 7; r++) for (let q = 0; q < 5; q++) if (gl[r][q] === "1")
        for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
          const lx = ox + q * s + i - W / 2, ly = r * s + j - H / 2;
          cv.set(cx + lx * cos - ly * sin, cy + lx * sin + ly * cos, c, a);
        }
      ox += 6 * s;
    }
  };
  return cv;
}
function watermark(cv) {
  const s = Math.max(2, Math.round(Math.min(cv.w, cv.h) / 160));
  const step = 7 * s * 5;
  for (let k = -cv.h; k < cv.w + cv.h; k += step * 2)
    cv.textRot(k, cv.h / 2 + (k % (step * 4)) / 4, WATERMARK, s, "#C0392B", -Math.PI / 7, 0.22);
}
function banner(cv, y) {
  const s = Math.max(2, Math.round(cv.w / 300));
  cv.rect(0, y, cv.w, 7 * s + 2 * s * 2, "#C0392B");
  cv.textC(cv.w / 2, y + 2 * s, WATERMARK, s, "#FFFFFF");
}

/* ── deterministic colour from a string ───────────────────────── */
const fnv = (str) => { let h = 0x811c9dc5; for (const ch of str) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h; };
const hsl = (h, s, l) => { s /= 100; l /= 100; const k = (n) => (n + h / 30) % 12; const a = s * Math.min(l, 1 - l); const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return "#" + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join(""); };

/* geometric avatar — concentric shapes and initials; never a face */
function avatar(cv, x, y, w, h, seed, initials) {
  const v = fnv(seed);
  const hue = v % 360, hue2 = (hue + 40 + (v >> 9) % 120) % 360;
  cv.rect(x, y, w, h, hsl(hue, 45, 88));
  const cx = x + w / 2, cy = y + h / 2 - h * 0.05, R = Math.min(w, h) * 0.36;
  const shape = (v >> 3) % 3;
  for (let k = 0; k < 4; k++) {
    const r = Math.round(R * (1 - k * 0.2)); const col = hsl(k % 2 ? hue2 : hue, 50, 40 + k * 10);
    if (shape === 0) cv.disc(Math.round(cx), Math.round(cy), r, col);
    else if (shape === 1) cv.rect(Math.round(cx - r), Math.round(cy - r), 2 * r, 2 * r, col);
    else for (let j = -r; j <= r; j++) { const half = r - Math.abs(j); cv.rect(Math.round(cx - half), Math.round(cy + j), 2 * half + 1, 1, col); }
  }
  const s = Math.max(2, Math.round(w / 40));
  cv.textC(cx, Math.round(cy - 3.5 * s), initials, s, "#FFFFFF");
  const ls = Math.max(1, Math.round(w / 110));
  cv.rect(x, y + h - 9 * ls - 4, w, 9 * ls + 4, "#C0392B");
  cv.textC(cx, y + h - 8 * ls - 2, "DEMO AVATAR", ls, "#FFFFFF");
}
const initials = (name) => name.split(/\s+/).filter((t) => t && !t.startsWith("AL-")).map((t) => t[0]).slice(0, 2).join("") || "D";

/* ── document layouts ─────────────────────────────────────────── */
function field(cv, x, y, label, value, s = 2) { cv.text(x, y, label, Math.max(1, s - 1), "#6B6B6B"); cv.text(x, y + 9 * Math.max(1, s - 1), value, s, "#1B1B1B"); }
const mrzName = (n) => { const parts = n.toUpperCase().split(" "); const sur = parts[parts.length - 1].replace(/-/g, "<"); return `${sur}<<${parts.slice(0, -1).join("<")}`.replace(/[^A-Z<]/g, "<"); };
const pad = (s, n) => (s + "<".repeat(n)).slice(0, n);
const dmy2yymmdd = (d) => { const [dd, mm, yy] = d.split("/"); return yy.slice(2) + mm + dd; };

function passportPng(p) {
  const cv = canvas(1000, 680, "#F3EFE6");
  watermark(cv);
  cv.rect(0, 0, 1000, 70, "#1F3A5F");
  cv.text(30, 22, "UTOPIA  SPECIMEN PASSPORT", 4, "#FFFFFF");
  banner(cv, 70);
  avatar(cv, 40, 130, 230, 290, p.ref, initials(p.name_en));
  const parts = p.name_en.split(" ");
  field(cv, 310, 130, "TYPE / CODE", "P   UTO", 3);
  field(cv, 560, 130, "PASSPORT NO.", p.passport, 3);
  field(cv, 310, 190, "SURNAME", parts[parts.length - 1], 3);
  field(cv, 310, 250, "GIVEN NAMES", parts.slice(0, -1).join(" "), 3);
  field(cv, 310, 310, "NATIONALITY", p.nat_code, 3);
  field(cv, 560, 310, "SEX", p.gender === "ذكر" ? "M" : "F", 3);
  field(cv, 310, 370, "DATE OF BIRTH", p.dob, 3);
  field(cv, 560, 370, "DATE OF EXPIRY", p.expiry, 3);
  cv.text(310, 430, "ISSUING AUTHORITY: NONE — SYNTHETIC SPECIMEN", 2, "#C0392B");
  /* MRZ — check digits deliberately set to '<' / wrong: unusable */
  const l1 = pad(`P<UTO${mrzName(p.name_en)}`, 44);
  const l2 = pad(`${pad(p.passport, 9)}<UTO${dmy2yymmdd(p.dob)}<${p.gender === "ذكر" ? "M" : "F"}${dmy2yymmdd(p.expiry)}<DEMO<NOT<VALID`, 44);
  cv.rect(0, 520, 1000, 160, "#FFFFFF");
  cv.text(30, 545, l1, 3, "#111111");
  cv.text(30, 600, l2, 3, "#111111");
  banner(cv, 650);
  return png(cv);
}
function idPng(p) {
  const cv = canvas(856, 540, "#E8F1EC");
  watermark(cv);
  cv.rect(0, 0, 856, 64, "#2A6B4F");
  cv.text(24, 20, "DEMO IDENTITY CARD — SPECIMEN", 4, "#FFFFFF");
  banner(cv, 64);
  avatar(cv, 30, 120, 200, 250, p.ref + "#id", initials(p.name_en));
  field(cv, 260, 120, "ID NUMBER", p.national_id, 3);
  field(cv, 260, 180, "NAME", p.name_en.length > 26 ? p.short_en : p.name_en, 3);
  field(cv, 260, 240, "NATIONALITY", p.nat_code, 3);
  field(cv, 520, 240, "SEX", p.gender === "ذكر" ? "M" : "F", 3);
  field(cv, 260, 300, "DATE OF BIRTH", p.dob, 3);
  field(cv, 520, 300, "EXPIRY", p.id_expiry ?? p.expiry, 3);
  cv.text(260, 370, "NOT ISSUED BY ANY AUTHORITY", 2, "#C0392B");
  banner(cv, 500);
  return png(cv);
}
function pseudoCode(cv, x, y, size, seed) {
  /* a decorative block grid — deliberately NOT a scannable QR code */
  const n = 21, cell = Math.floor(size / n); let v = fnv(seed);
  cv.rect(x, y, cell * n, cell * n, "#FFFFFF");
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { v = Math.imul(v ^ (v >>> 13), 0x5bd1e995) >>> 0; if (v & 1) cv.rect(x + i * cell, y + j * cell, cell, cell, "#222222"); }
  cv.frame(x - 4, y - 4, cell * n + 8, cell * n + 8, "#222222", 3);
}
function permitPng(p, seasonYear, campaign) {
  const cv = canvas(800, 1100, "#FBF7EC");
  watermark(cv);
  cv.rect(0, 0, 800, 90, "#5C7C2E");
  cv.textC(400, 22, "HAJJ PERMIT", 5, "#FFFFFF");
  cv.textC(400, 64, "SPECIMEN — SYNTHETIC", 2, "#FFFFFF");
  banner(cv, 90);
  avatar(cv, 280, 150, 240, 290, p.ref + "#permit", initials(p.name_en));
  const y0 = 470;
  field(cv, 60, y0, "PERMIT NO.", `DEMO-PRM-${p.passport.slice(2)}`, 3);
  field(cv, 60, y0 + 70, "PILGRIM", p.name_en.length > 30 ? p.short_en : p.name_en, 3);
  field(cv, 60, y0 + 140, "PASSPORT NO.", p.passport, 3);
  field(cv, 420, y0 + 140, "NATIONALITY", p.nat_code, 3);
  field(cv, 60, y0 + 210, "SEASON", `${seasonYear} AH`, 3);
  field(cv, 420, y0 + 210, "CAMPAIGN", campaign, 2);
  pseudoCode(cv, 280, y0 + 300, 240, p.ref);
  banner(cv, 1050);
  return png(cv);
}
function ticketPng(p, out, ret) {
  const cv = canvas(1100, 460, "#EEF3F8");
  watermark(cv);
  cv.rect(0, 0, 1100, 70, "#0C447C");
  cv.text(30, 22, "DEMO E-TICKET SPECIMEN - NO REAL CARRIER", 4, "#FFFFFF");
  banner(cv, 70);
  field(cv, 40, 130, "PASSENGER", p.name_en.length > 30 ? p.short_en : p.name_en, 3);
  field(cv, 40, 195, "BOOKING REF", `DEMO${(fnv(p.ref) % 90000 + 10000)}`, 3);
  field(cv, 380, 195, "CLASS", p.services.flight === "درجة أولى" ? "FIRST" : "ECONOMY", 3);
  const leg = (y, f, label) => {
    cv.text(40, y, label, 2, "#6B6B6B");
    cv.text(40, y + 18, `${f.name}   ${f.from_airport} > ${f.to_airport}   ${f.date}  ${f.time}`, 3, "#1B1B1B");
  };
  leg(265, out, "OUTBOUND");
  if (ret) leg(325, ret, "RETURN");
  pseudoCode(cv, 860, 130, 190, p.ref + "#ticket");
  banner(cv, 420);
  return png(cv);
}
function photoPng(p) { const cv = canvas(400, 500); avatar(cv, 0, 0, 400, 500, p.ref, initials(p.name_en)); return png(cv); }

/* ── minimal PDF (contract) ───────────────────────────────────── */
function pdfEsc(s) { return String(s).replace(/[\\()]/g, (m) => "\\" + m).replace(/[^\x20-\x7e]/g, "-"); }
function contractPdf(p, company, seasonYear) {
  const lines = [
    [18, "PILGRIMAGE SERVICE AGREEMENT"], [11, "DEMO - NOT A REAL DOCUMENT - SYNTHETIC SPECIMEN"], [11, ""],
    [11, `Campaign: ${company}`], [11, `Season: ${seasonYear} AH`], [11, `Pilgrim: ${p.name_en}`], [11, `Passport: ${p.passport}`],
    [11, `Package: ${{ "فردية": "SINGLE", "ثنائية": "DOUBLE", "ثلاثية": "TRIPLE", "رباعية": "QUAD", "خاص": "SPECIAL" }[p.services.hotel_type] ?? "-"}`],
    [11, ""], [11, "1. This page exists only to demonstrate document storage and preview."],
    [11, "2. It has no legal effect and names no real person or company."],
    [11, "3. All names, numbers and terms are generated synthetically."], [11, ""],
    [11, "Signature: ______________________  (DEMO)"],
  ];
  let y = 770; let body = "BT /F1 11 Tf 0 0 0 rg\n";
  for (const [size, t] of lines) { body += `/F1 ${size} Tf 1 0 0 1 60 ${y} Tm (${pdfEsc(t)}) Tj\n`; y -= size + 10; }
  body += "ET\n";
  body += "q 0.75 0.22 0.17 rg BT /F1 40 Tf 0.819 0.573 -0.573 0.819 90 260 Tm (DEMO - NOT A REAL DOCUMENT) Tj ET Q\n";
  body += "q 0.75 0.22 0.17 rg 0 0 595 28 re f BT 1 1 1 rg /F1 12 Tf 1 0 0 1 170 10 Tm (DEMO - NOT A REAL DOCUMENT) Tj ET Q\n";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(body)} >>\nstream\n${body}endstream`,
  ];
  let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"; const offs = [];
  const parts = [Buffer.from("%PDF-1.4\n%DEMO\n", "latin1")]; let pos = parts[0].length;
  objs.forEach((o, i) => { offs.push(pos); const b = Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`, "latin1"); parts.push(b); pos += b.length; });
  const xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  parts.push(Buffer.from(`${xref}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`, "latin1"));
  void out;
  return Buffer.concat(parts);
}

/* ── company assets ───────────────────────────────────────────── */
function emblem(cv, cx, cy, r) {
  cv.disc(cx, cy, r, "#7D1F3C"); cv.ring(cx, cy, r, Math.max(2, r / 10), "#D4A017");
  for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; cv.line(cx, cy, cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.7, "#D4A017", Math.max(1, r / 25)); }
  cv.disc(cx, cy, Math.round(r * 0.32), "#F9F6F1");
}
function companyPng(key) {
  if (key === "favicon") { const cv = canvas(64, 64, "#7D1F3C"); emblem(cv, 32, 32, 28); cv.text(26, 26, "D", 2, "#7D1F3C"); return png(cv); }
  if (key === "logo") { const cv = canvas(512, 512, "#F9F6F1"); emblem(cv, 256, 220, 160); cv.textC(256, 410, "AL-ROWAD", 6, "#7D1F3C"); cv.textC(256, 465, "DEMO LOGO — NOT REAL", 3, "#C0392B"); return png(cv); }
  if (key === "portal_banner" || key === "dashboard_banner") {
    const w = key === "portal_banner" ? 1200 : 1600; const cv = canvas(w, 400, "#7D1F3C");
    for (let k = 0; k < w; k += 40) cv.line(k, 400, k + 200, 0, "#8E2A4A", 6);
    emblem(cv, 200, 200, 130); cv.text(380, 140, "AL-ROWAD HAJJ", 9, "#FFFFFF"); cv.text(384, 230, "DEMO ENVIRONMENT — SYNTHETIC DATA", 4, "#D4A017");
    banner(cv, 340); return png(cv);
  }
  if (key === "company_stamp") {
    const cv = canvas(400, 400, "#FFFFFF"); cv.ring(200, 200, 180, 12, "#1F3A8A"); cv.ring(200, 200, 140, 5, "#1F3A8A");
    cv.textC(200, 150, "AL-ROWAD", 5, "#1F3A8A"); cv.textC(200, 200, "DEMO STAMP", 4, "#1F3A8A"); cv.textC(200, 240, "NOT VALID", 4, "#C0392B"); return png(cv);
  }
  if (key === "manager_signature") {
    const cv = canvas(600, 200, "#FFFFFF"); let px = 40, py = 120;
    for (let k = 1; k <= 40; k++) { const nx = 40 + k * 12, ny = 110 + Math.round(Math.sin(k * 0.9) * 35 + Math.cos(k * 0.37) * 20); cv.line(px, py, nx, ny, "#1B2A6B", 2); px = nx; py = ny; }
    cv.text(380, 170, "DEMO SIGNATURE", 2, "#C0392B"); return png(cv);
  }
  throw new Error(`unknown company asset ${key}`);
}

/* ── run ──────────────────────────────────────────────────────── */
rmSync(OUT, { recursive: true, force: true });
const flights = Object.fromEntries(ds.resources.active.flights.map((f) => [f.ref, f]));
const campaign = "AL-ROWAD (DEMO)";
let count = 0;
const write = (rel, bytes) => { const f = join(OUT, rel); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, bytes); count++; };
for (const p of ds.people) {
  if (!p.docs.length) continue;
  const year = ds.seasons[p.season].hijri_year;
  for (const d of p.docs) {
    const rel = `people/${p.ref}/${d}.${d === "contract" ? "pdf" : "png"}`;
    if (d === "photo") write(rel, photoPng(p));
    else if (d === "passport") write(rel, passportPng(p));
    else if (d === "national_id") write(rel, idPng(p));
    else if (d === "hajj_permit") write(rel, permitPng(p, year, campaign));
    else if (d === "flight_ticket") write(rel, ticketPng(p, flights[p.alloc.out], p.alloc.ret ? flights[p.alloc.ret] : null));
    else if (d === "contract") write(rel, contractPdf(p, campaign, year));
    else throw new Error(`unknown doc ${d}`);
  }
}
for (const a of ds.company_assets) write(`company/${a.file}`, companyPng(a.key));
for (const s of ds.ocr_samples) {
  const p = { ref: `OCR-${s.kind}`, name_en: s.name_en, short_en: s.name_en, passport: s.passport ?? "DX1449901", national_id: s.national_id ?? "99000000099901",
    nat_code: s.nat_code, gender: s.gender, dob: s.dob ?? "09/07/1975", expiry: s.expiry ?? "01/01/2031", id_expiry: s.expiry, services: { flight: "عادي" } };
  write(s.file, s.kind === "passport" ? passportPng(p) : s.kind === "national_id" ? idPng(p) : permitPng(p, ds.seasons.active.hijri_year, campaign));
}
console.log(`✓ generated ${count} synthetic files in ${OUT.replace(process.cwd() + "/", "")}`);
