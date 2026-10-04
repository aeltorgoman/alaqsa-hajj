#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════
   build-dataset.mjs — the single deterministic source of the Demo data
   ════════════════════════════════════════════════════════════════
   Reads `demo.manifest.json` (the approved contract) and writes
   `data/dataset.json`: every season, resource, person, allocation,
   document intent, receipt, charge, group and announcement the seed
   will create. The SQL seed, the document generator, the Storage loader
   and the fingerprint all read that one file, so no rule is written
   twice in two languages.

   Determinism: no Math.random(), no Date.now(). Every value derives
   from a loop index and DEMO_ANCHOR_DATE. Running this twice yields a
   byte-identical file (`--check` proves it against the committed copy).

   After building, the script recomputes every manifest number from the
   built people and refuses to write if a single one disagrees.

   Usage:
     node supabase/demo/tools/build-dataset.mjs           # write
     node supabase/demo/tools/build-dataset.mjs --check   # verify committed file is current
   100% synthetic. No real person, record or document is used.
   ════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEMO = join(HERE, "..");
const MANIFEST = JSON.parse(readFileSync(join(DEMO, "demo.manifest.json"), "utf8"));
const OUT = join(DEMO, "data", "dataset.json");
const ANCHOR = MANIFEST.demo_anchor_date;

const fail = (m) => { console.error(`✗ build-dataset: ${m}`); process.exit(1); };

/* ── dates ─────────────────────────────────────────────────────── */
const [AY, AM, AD] = ANCHOR.split("-").map(Number);
const dayMs = 86400000;
const anchorUtc = Date.UTC(AY, AM - 1, AD);
const iso = (off) => new Date(anchorUtc + off * dayMs).toISOString().slice(0, 10);
const dmy = (off) => { const [y, m, d] = iso(off).split("-"); return `${d}/${m}/${y}`; };
const ts = (off, hh = "09:00") => `${iso(off)}T${hh}:00+03:00`;

/* ── synthetic name pools (generic given names + generic family names) ── */
const M_FIRST = [["محمد","MOHAMMED"],["أحمد","AHMED"],["عبدالله","ABDULLAH"],["خالد","KHALID"],["علي","ALI"],["حمد","HAMAD"],["ناصر","NASSER"],["سعد","SAAD"],["فهد","FAHAD"],["يوسف","YOUSEF"],["إبراهيم","IBRAHIM"],["عمر","OMAR"],["حسن","HASSAN"],["جاسم","JASSIM"],["سلطان","SULTAN"],["راشد","RASHID"],["ماجد","MAJID"],["طارق","TARIQ"],["عيسى","ISSA"],["مبارك","MUBARAK"],["سالم","SALEM"],["منصور","MANSOUR"],["عادل","ADEL"],["هشام","HISHAM"],["وليد","WALEED"],["زياد","ZIAD"],["بدر","BADER"],["نايف","NAYEF"],["صالح","SALEH"],["حمزة","HAMZA"],["أنس","ANAS"]];
const F_FIRST = [["فاطمة","FATIMA"],["مريم","MARYAM"],["عائشة","AISHA"],["نورة","NOURA"],["هند","HIND"],["سارة","SARA"],["أمل","AMAL"],["لطيفة","LATIFA"],["موزة","MOZA"],["شيخة","SHEIKHA"],["ريم","REEM"],["منى","MONA"],["هدى","HUDA"],["خديجة","KHADIJA"],["زينب","ZAINAB"],["حصة","HESSA"],["أسماء","ASMA"],["دانة","DANA"],["جميلة","JAMILA"],["سلمى","SALMA"],["رقية","RUQAYA"],["بشرى","BUSHRA"],["سميرة","SAMIRA"],["وفاء","WAFA"],["ليلى","LAILA"],["نجلاء","NAJLA"],["عبير","ABEER"],["حنان","HANAN"],["إيمان","IMAN"],["رحاب","REHAB"],["غادة","GHADA"]];
const FAMILY = [["العلي","AL-ALI"],["الحسن","AL-HASSAN"],["الصالح","AL-SALEH"],["العبدالله","AL-ABDULLAH"],["النجار","AL-NAJJAR"],["الخطيب","AL-KHATIB"],["الحداد","AL-HADDAD"],["الشامي","AL-SHAMI"],["البنا","AL-BANNA"],["القاسم","AL-QASIM"],["الزين","AL-ZEIN"],["الطاهر","AL-TAHER"],["الأمين","AL-AMIN"],["الرفاعي","AL-RIFAI"],["الحمادي","AL-HAMMADI"],["الفارس","AL-FARES"],["المنصوري","AL-MANSOURI"],["العبيدي","AL-OBAIDI"],["السعدي","AL-SAADI"],["العثمان","AL-OTHMAN"],["البكر","AL-BAKR"],["الكعبي","AL-KAABI"],["المري","AL-MARRI"],["الهاجري","AL-HAJRI"],["النعيمي","AL-NUAIMI"],["الدوسري","AL-DOSARI"],["السويدي","AL-SUWAIDI"],["الجابر","AL-JABER"],["الغامدي","AL-GHAMDI"],["الحربي","AL-HARBI"],["الشريف","AL-SHARIF"],["الرميحي","AL-RUMAIHI"],["الكبيسي","AL-KUBAISI"],["العمري","AL-OMARI"],["الحمد","AL-HAMAD"],["اليوسف","AL-YOUSEF"],["الراشد","AL-RASHED"]];
const NAT = { "قطري": ["قطري","قطرية","QAT"], "مصري": ["مصري","مصرية","EGY"], "سوري": ["سوري","سورية","SYR"], "أردني": ["أردني","أردنية","JOR"], "فلسطيني": ["فلسطيني","فلسطينية","PLE"], "سوداني": ["سوداني","سودانية","SDN"], "يمني": ["يمني","يمنية","YEM"] };
const pick = (arr, i) => arr[((i % arr.length) + arr.length) % arr.length];

/* ── helpers ───────────────────────────────────────────────────── */
const H = MANIFEST.active_season;
const A = MANIFEST.archived_season;
const assert = (cond, msg) => { if (!cond) fail(msg); };
function take(list, n, pred, label) {
  const out = [];
  for (const x of list) { if (out.length === n) break; if (pred(x)) out.push(x); }
  assert(out.length === n, `cannot select ${n} for ${label} (got ${out.length})`);
  return out;
}
const fromEnd = (list) => [...list].reverse();
/* deterministic interleave of exact counts — no randomness */
function spread(counts, total, step) {
  const flat = []; for (const [v, c] of counts) for (let k = 0; k < c; k++) flat.push(v);
  assert(flat.length === total, `spread total ${flat.length} != ${total}`);
  const out = new Array(total);
  for (let i = 0; i < total; i++) out[(i * step) % total] = flat[i];
  assert(out.every((x) => x !== undefined), `spread step ${step} not coprime with ${total}`);
  return out;
}

/* ════════════════════ ACTIVE SEASON — PEOPLE ════════════════════ */
const hajj = [];
/* families first: sizes 2×5, 3×5, 4×3, 5×1 (members alternate M,F,M…) */
const famSizes = [];
for (const [size, n] of Object.entries(H.passengers.families.size_distribution)) for (let k = 0; k < n; k++) famSizes.push(Number(size));
famSizes.sort((a, b) => a - b);
const famNat = ["قطري","قطري","قطري","مصري","قطري","قطري","سوري","قطري","أردني","قطري","فلسطيني","قطري","قطري","قطري"];
let idx = 0;
famSizes.forEach((size, f) => {
  const famId = `DEMO-FAM-${String(f + 1).padStart(2, "0")}`;
  for (let k = 0; k < size; k++) {
    hajj.push({ i: idx++, family_id: famId, family_size: size, family_index: f, member: k, gender: k % 2 === 0 ? "ذكر" : "أنثى", natBase: famNat[f] });
  }
});
/* singles: alternate to reach 63 M / 57 F overall */
const needM = H.passengers.hajj_by_gender["ذكر"] - hajj.filter((p) => p.gender === "ذكر").length;
const needF = H.passengers.hajj_by_gender["أنثى"] - hajj.filter((p) => p.gender === "أنثى").length;
const singleGenders = spread([["ذكر", needM], ["أنثى", needF]], needM + needF, 7);
for (const g of singleGenders) hajj.push({ i: idx++, family_id: null, family_size: 0, member: 0, gender: g, natBase: null });
assert(hajj.length === H.passengers.by_passenger_type["حاج"], "hajj total");
/* nationality for singles to reach exact base counts */
{
  const want = { ...H.passengers.hajj_by_nationality_base };
  hajj.filter((p) => p.natBase).forEach((p) => { want[p.natBase] -= 1; });
  const singles = hajj.filter((p) => !p.natBase);
  const order = spread(Object.entries(want), singles.length, 11);
  singles.forEach((p, k) => { p.natBase = order[k]; });
}

/* names — family members share the family name */
const famName = {};
hajj.forEach((p) => {
  const fam = p.family_id ? (famName[p.family_id] ??= pick(FAMILY, p.family_index * 3 + 1)) : pick(FAMILY, p.i * 5 + 2);
  const first = p.gender === "ذكر" ? pick(M_FIRST, p.i * 7 + 3) : pick(F_FIRST, p.i * 7 + 5);
  const father = pick(M_FIRST, p.i * 11 + 4);
  const grand = pick(M_FIRST, p.i * 13 + 9);
  p.name_ar = `${first[0]} ${father[0]} ${grand[0]} ${fam[0]}`;
  p.short_ar = `${first[0]} ${fam[0]}`;
  p.name_en = `${first[1]} ${father[1]} ${grand[1]} ${fam[1]}`;
  p.short_en = `${first[1]} ${fam[1]}`;
});

/* portal pilgrims: heads of the first two families of size 3 */
const fam3 = [...new Set(hajj.filter((p) => p.family_size === 3).map((p) => p.family_id))];
const P1 = hajj.find((p) => p.family_id === fam3[0] && p.member === 0);
const P2 = hajj.find((p) => p.family_id === fam3[1] && p.member === 0);
P1.portal = "DEMO-P-001"; P2.portal = "DEMO-P-002";
const isPortal = (p) => !!p.portal;
const isPortalFamily = (p) => p.family_id === fam3[0] || p.family_id === fam3[1];

/* ── hotel_type: families by size, singles fill the remainder ── */
const HT = { ...H.commercial_services_hajj.hotel_type };
const famType = { 2: "ثنائية", 3: "ثلاثية", 4: "رباعية", 5: "رباعية" };
hajj.filter((p) => p.family_id).forEach((p) => { p.hotel_type = famType[p.family_size]; HT[p.hotel_type] -= 1; });
{
  const singles = hajj.filter((p) => !p.family_id);
  const order = spread(Object.entries(HT).filter(([, c]) => c > 0), singles.length, 17);
  singles.forEach((p, k) => { p.hotel_type = order[k]; });
}
const customPrices = [...H.commercial_services_hajj["custom_price_for_خاص"]];
hajj.filter((p) => p.hotel_type === "خاص").forEach((p, k) => { p.custom_price = customPrices[k]; });

/* ── hotel_view ── */
{
  const order = spread([["مطلة", H.commercial_services_hajj.hotel_view["مطلة"]], ["غير مطلة", H.commercial_services_hajj.hotel_view["غير مطلة"]]], 120, 19);
  hajj.forEach((p, k) => { p.hotel_view = order[k]; });
  P1.hotel_view === undefined && fail("view");
}

/* ── registration order: families first, late singles last ── */
const late = fromEnd(hajj); // least complete registrants first
const nonPortal = (p) => !isPortal(p) && !isPortalFamily(p);

/* ── flight service: 8 بدون (late singles), 18 first class ── */
hajj.forEach((p) => { p.flight = "عادي"; });
take(late, H.commercial_services_hajj.flight["بدون"], (p) => !p.family_id, "flight بدون").forEach((p) => { p.flight = "بدون"; });

/* ── bus service ── */
hajj.forEach((p) => { p.bus = "عادي"; });
/* ── camp services ── */
hajj.forEach((p) => { p.camp_mina = "عادي"; p.camp_arafa = "عادي"; });

/* ════════════════════ ROOMS ════════════════════ */
const roomsActive = [];
let floorCounter = 0;
const roomPlans = {
  "فردية":  { cap: 1, hajjRooms: [1,1,1,1,1,1,1,1], staffRooms: [], empty: 2 },
  "ثنائية": { cap: 2, hajjRooms: [2,2,2,2,2,2,2,2,2,2,2,2,1,1], staffRooms: [{ hajj: 0, staff: 2 }], empty: 1 },
  "ثلاثية": { cap: 3, hajjRooms: [3,3,3,3,3,3,3,2,2], staffRooms: [{ hajj: 2, staff: 1 }], empty: 2 },
  "رباعية": { cap: 4, hajjRooms: [4,4,4,4,4,2], staffRooms: [{ hajj: 0, staff: 3 }], empty: 2 },
  "خاص":    { cap: 3, hajjRooms: [3,2], staffRooms: [], empty: 0 },
};
/* room numbering: floor = 1..5, ten rooms per floor */
function nextRoom(type, cap) {
  const n = floorCounter++;
  const floor = String(Math.floor(n / 10) + 1);
  const number = `${floor}${String((n % 10) + 1).padStart(2, "0")}`;
  const r = { ref: `ROOM-${number}`, number, floor, type, capacity: cap, occupants: [] };
  roomsActive.push(r);
  return r;
}
const staff = [];
const roomStaffSlots = [];
for (const [type, plan] of Object.entries(roomPlans)) {
  const pool = hajj.filter((p) => p.hotel_type === type);
  const assignedCount = plan.hajjRooms.reduce((a, b) => a + b, 0) + plan.staffRooms.reduce((a, r) => a + r.hajj, 0);
  const unassignedWanted = H.rooms.hajj_unassigned_by_hotel_type[type];
  assert(pool.length - assignedCount === unassignedWanted, `rooms ${type}: pool ${pool.length} assigned ${assignedCount} unassigned ${unassignedWanted}`);
  /* families first (kept together), then singles sorted by gender; late singles stay unassigned */
  const fam = pool.filter((p) => p.family_id);
  const singles = pool.filter((p) => !p.family_id);
  const singlesKept = singles.slice(0, singles.length - unassignedWanted);
  const ordered = [...fam, ...singlesKept.filter((p) => p.gender === "ذكر"), ...singlesKept.filter((p) => p.gender === "أنثى")];
  let cur = 0;
  for (const n of plan.hajjRooms) { const r = nextRoom(type, plan.cap); for (let k = 0; k < n; k++) r.occupants.push(ordered[cur++]); }
  for (const s of plan.staffRooms) { const r = nextRoom(type, plan.cap); for (let k = 0; k < s.hajj; k++) r.occupants.push(ordered[cur++]); roomStaffSlots.push({ room: r, n: s.staff }); }
  for (let k = 0; k < plan.empty; k++) nextRoom(type, plan.cap);
  assert(cur === ordered.length, `rooms ${type}: placed ${cur} of ${ordered.length}`);
}
nextRoom("مجلس", 0).number; // the single مجلس room (capacity 0)
roomsActive.forEach((r) => r.occupants.forEach((p) => { p.room = r.ref; }));
assert(P1.room && P2.room, "portal pilgrims need rooms");

/* ════════════════════ STAFF (6) ════════════════════ */
const STAFF_DEF = [
  { type: "مرافق", gender: "ذكر" }, { type: "مرافق", gender: "أنثى" }, { type: "مرافق", gender: "أنثى" },
  { type: "مشرف", gender: "ذكر" }, { type: "مشرف", gender: "ذكر" }, { type: "إداري", gender: "ذكر" },
];
STAFF_DEF.forEach((d, k) => {
  const first = d.gender === "ذكر" ? pick(M_FIRST, k * 9 + 20) : pick(F_FIRST, k * 9 + 20);
  const father = pick(M_FIRST, k * 5 + 12), fam = pick(FAMILY, k * 4 + 30);
  staff.push({ i: 200 + k, staffIndex: k, passenger_type: d.type, gender: d.gender, natBase: "قطري", family_id: null,
    name_ar: `${first[0]} ${father[0]} ${fam[0]}`, short_ar: `${first[0]} ${fam[0]}`,
    name_en: `${first[1]} ${father[1]} ${fam[1]}`, short_en: `${first[1]} ${fam[1]}`,
    flight: "عادي", bus: "عادي", camp_mina: "عادي", camp_arafa: "عادي", hotel_view: "غير مطلة" });
});
/* staff rooms: two female مرافق → ثنائية; male مرافق → ثلاثية; مشرف×2 + إداري → رباعية */
{
  const byRoomType = (t) => roomStaffSlots.find((s) => s.room.type === t);
  const put = (slot, people) => { assert(slot.n === people.length, "staff slot size"); people.forEach((p) => { slot.room.occupants.push(p); p.room = slot.room.ref; p.hotel_type = slot.room.type; }); };
  put(byRoomType("ثنائية"), [staff[1], staff[2]]);
  put(byRoomType("ثلاثية"), [staff[0]]);
  put(byRoomType("رباعية"), [staff[3], staff[4], staff[5]]);
}
staff[3].wants_flight = true; staff[4].wants_flight = true;

/* ════════════════════ CAMPS ════════════════════ */
const campsActive = [...H.camps.mina.map((c) => ({ ...c, page_type: "منى" })), ...H.camps.arafat.map((c) => ({ ...c, page_type: "عرفة" }))]
  .map((c) => ({ ref: c.ref, page_type: c.page_type, gender: c.gender, type: c.type, capacity: c.capacity, wantHajj: c.occupancy.hajj, wantStaff: c.occupancy.staff,
                 name: `${c.page_type === "منى" ? "مخيم منى" : "مخيم عرفة"} ${c.type === "خاص" ? "الخاص" : "العام"} — ${c.gender === "ذكر" ? "رجال" : "نساء"}` }));
const camp = (ref) => campsActive.find((c) => c.ref === ref);
function campPlan(page, prefix, unassignedM, unassignedF, svcKey, coherence) {
  for (const g of ["ذكر", "أنثى"]) {
    const gl = g === "ذكر" ? "M" : "F";
    const vip = camp(`${prefix}-${gl}-VIP`), reg = camp(`${prefix}-${gl}-REG`);
    const people = hajj.filter((p) => p.gender === g);
    const payers = people.filter((p) => p[svcKey] === "خاص");
    /* خاص payers: into the VIP camp, then mismatch / unassigned per contract */
    const inVip = payers.slice(0, vip.wantHajj);
    const rest = payers.slice(vip.wantHajj);
    inVip.forEach((p) => { p[page] = vip.ref; });
    const mismatch = g === "ذكر" ? coherence.in_regular_camp_mismatch : 0;
    rest.slice(0, mismatch).forEach((p) => { p[page] = reg.ref; });
    const unPayers = rest.slice(mismatch);
    const unWanted = g === "ذكر" ? unassignedM : unassignedF;
    const others = people.filter((p) => p[svcKey] !== "خاص");
    const unOthers = take(fromEnd(others), unWanted - unPayers.length, (p) => nonPortal(p), `${page} unassigned ${g}`);
    const unSet = new Set([...unPayers, ...unOthers]);
    others.filter((p) => !unSet.has(p)).forEach((p) => { p[page] = reg.ref; });
    const regCount = people.filter((p) => p[page] === reg.ref).length;
    assert(regCount === reg.wantHajj, `${reg.ref}: ${regCount} != ${reg.wantHajj}`);
  }
}
/* Mina خاص payers: M7 (6 VIP + 1 mismatch), F5 (4 VIP + 1 unassigned) */
{
  const minaCoh = H.camps.service_coherence["mina_خاص_payers"];
  const mVip = camp("MINA-M-VIP").wantHajj, fVip = camp("MINA-F-VIP").wantHajj;
  const mPay = take(hajj, mVip + minaCoh.in_regular_camp_mismatch, (p) => p.gender === "ذكر" && p.family_id && nonPortal(p), "mina خاص M");
  const fPay = take(hajj, fVip + minaCoh.unassigned, (p) => p.gender === "أنثى" && p.family_id && nonPortal(p), "mina خاص F");
  [...mPay, ...fPay].forEach((p) => { p.camp_mina = "خاص"; });
  /* the female unassigned payer must be last so slice() leaves her unassigned */
}
campPlan("mina", "MINA", 63 - 50, 57 - 45, "camp_mina", H.camps.service_coherence["mina_خاص_payers"]);
/* Arafat خاص payers ⊂ Mina VIP campers (people who buy خاص buy both) */
{
  const mA = take(hajj, camp("ARAFA-M-VIP").wantHajj, (p) => p.mina === "MINA-M-VIP", "arafa خاص M");
  const fA = take(hajj, camp("ARAFA-F-VIP").wantHajj, (p) => p.mina === "MINA-F-VIP", "arafa خاص F");
  [...mA, ...fA].forEach((p) => { p.camp_arafa = "خاص"; });
}
campPlan("arafa", "ARAFA", 63 - 47, 57 - 43, "camp_arafa", H.camps.service_coherence["arafat_خاص_payers"]);
/* staff in the regular camps of their gender */
staff.forEach((s) => { const gl = s.gender === "ذكر" ? "M" : "F"; s.mina = `MINA-${gl}-REG`; s.arafa = `ARAFA-${gl}-REG`; });

/* ════════════════════ BUSES ════════════════════ */
const busesActive = H.buses.items.map((b, k) => ({ ref: b.ref, name: `باص ${k + 1}${b.type === "VIP" ? " — VIP" : ""}`, type: b.type, capacity: b.capacity, wantHajj: b.occupancy.hajj, wantStaff: b.occupancy.staff }));
{
  const coh = H.buses.service_coherence;
  const vipPayers = take(hajj, H.commercial_services_hajj.bus.VIP, (p) => p.camp_mina === "خاص" || p.hotel_view === "مطلة", "VIP payers");
  vipPayers.forEach((p) => { p.bus = "VIP"; });
  vipPayers.slice(0, coh.vip_payers_on_vip_bus).forEach((p) => { p.busRef = "BUS-1"; });
  vipPayers.slice(coh.vip_payers_on_vip_bus, coh.vip_payers_on_vip_bus + coh.vip_payers_on_regular_bus_mismatch).forEach((p) => { p.busRef = "BUS-2"; });
  const vipUn = vipPayers.slice(coh.vip_payers_on_vip_bus + coh.vip_payers_on_regular_bus_mismatch);
  assert(vipUn.every(nonPortal), "portal VIP unassigned");
  const regular = hajj.filter((p) => p.bus !== "VIP");
  const unWanted = H.buses.hajj_unassigned - vipUn.length;
  const un = new Set(take(fromEnd(regular), unWanted, nonPortal, "bus unassigned"));
  const toPlace = regular.filter((p) => !un.has(p));
  const b2 = busesActive[1].wantHajj - coh.vip_payers_on_regular_bus_mismatch;
  toPlace.forEach((p, k) => { p.busRef = k < b2 ? "BUS-2" : "BUS-3"; });
  hajj.forEach((p) => { p.bus_ref = p.busRef ?? null; delete p.busRef; });
  /* staff: مشرف×2 → VIP bus, إداري → BUS-2, مرافق×3 → BUS-3 */
  staff[3].bus_ref = "BUS-1"; staff[4].bus_ref = "BUS-1"; staff[5].bus_ref = "BUS-2";
  staff[0].bus_ref = "BUS-3"; staff[1].bus_ref = "BUS-3"; staff[2].bus_ref = "BUS-3";
}

/* ════════════════════ FLIGHTS ════════════════════ */
const FL_NAMES = { "OUT-1": "QR 9811", "OUT-2": "SV 9812", "OUT-3": "QR 9813", "RET-1": "QR 9821", "RET-2": "SV 9822", "RET-3": "QR 9823" };
const flightsActive = H.flights.items.map((f) => ({
  ref: f.ref, name: FL_NAMES[f.ref], type: f.type, airline: f.airline, capacity: f.capacity, wantHajj: f.occupancy.hajj, wantStaff: f.occupancy.staff,
  date: iso(f.date_offset_days), time: f.type === "ذهاب" ? ["08:15","10:40","14:20"][Number(f.ref.slice(-1)) - 1] : ["16:30","19:05","22:10"][Number(f.ref.slice(-1)) - 1],
  arrival_date: iso(f.date_offset_days), arrival_time: f.type === "ذهاب" ? ["10:30","12:55","16:35"][Number(f.ref.slice(-1)) - 1] : ["18:40","21:15","00:20"][Number(f.ref.slice(-1)) - 1],
  from_airport: f.type === "ذهاب" ? "DOH" : "JED", to_airport: f.type === "ذهاب" ? "JED" : "DOH",
}));
if (flightsActive[5].arrival_time === "00:20") flightsActive[5].arrival_date = iso(H.flights.items[5].date_offset_days + 1);
{
  const needing = hajj.filter((p) => p.flight !== "بدون");
  const noOut = new Set(take(fromEnd(needing), H.flights.hajj_no_flight_but_needed, nonPortal, "no outbound"));
  const outbound = needing.filter((p) => !noOut.has(p));
  const o1 = flightsActive[0].wantHajj;
  outbound.forEach((p, k) => { p.out_ref = k < o1 ? "OUT-1" : "OUT-2"; });
  /* return: 48 of OUT-1, 26 of OUT-2; the outbound-only ones are the last of each */
  const out1 = outbound.filter((p) => p.out_ref === "OUT-1"), out2 = outbound.filter((p) => p.out_ref === "OUT-2");
  out1.slice(0, flightsActive[3].wantHajj).forEach((p) => { p.ret_ref = "RET-1"; });
  out2.slice(0, flightsActive[4].wantHajj).forEach((p) => { p.ret_ref = "RET-2"; });
  assert(P1.ret_ref && P2.ret_ref, "portal pilgrims need both legs");
  /* first class: 18 of the outbound */
  take(outbound, H.flights.first_class_payers_with_outbound, (p) => p.bus === "VIP" || p.hotel_type === "خاص" || p.hotel_type === "فردية", "first class").forEach((p) => { p.flight = "درجة أولى"; });
  staff[3].out_ref = "OUT-1"; staff[3].ret_ref = "RET-1"; staff[4].out_ref = "OUT-1"; staff[4].ret_ref = "RET-1";
}

/* ════════════════════ DOCUMENTS ════════════════════ */
{
  const st = H.documents.hajj_identity_document_states;
  const states = []; // [missingPhoto, missingPassport, missingId]
  const add = (n, s) => { for (let k = 0; k < n; k++) states.push(s); };
  add(st.missing_all_three, [1,1,1]); add(st.photo_only, [0,1,1]); add(st.missing_photo_and_passport, [1,1,0]);
  add(st.missing_photo_and_national_id, [1,0,1]); add(st.missing_passport_only, [0,1,0]); add(st.missing_national_id_only, [0,0,1]);
  add(st.missing_photo_only, [1,0,0]);
  const incomplete = take(late, states.length, nonPortal, "incomplete docs");
  const map = new Map(incomplete.map((p, k) => [p, states[k]]));
  hajj.forEach((p) => {
    const s = map.get(p) ?? [0,0,0];
    p.docs = [];
    if (!s[0]) p.docs.push("photo");
    if (!s[1]) p.docs.push("passport");
    if (!s[2]) p.docs.push("national_id");
  });
  /* contracts: the first 70 registrants */
  take(hajj, H.documents.hajj_present_per_column.contract_url, () => true, "contracts").forEach((p) => p.docs.push("contract"));
  /* permits: outbound travellers first (portal pilgrims included) */
  const withOut = hajj.filter((p) => p.out_ref);
  const permits = take([P1, P2, ...withOut.filter((p) => !isPortal(p))], H.documents.hajj_present_per_column.hajj_permit_url, () => true, "permits");
  permits.forEach((p) => p.docs.push("hajj_permit"));
  const tickets = take([P1, P2, ...withOut.filter((p) => !isPortal(p) && p.ret_ref)], H.documents.hajj_present_per_column.flight_ticket_url, () => true, "tickets");
  tickets.forEach((p) => p.docs.push("flight_ticket"));
  /* staff */
  staff.forEach((s, k) => {
    s.docs = ["photo", "passport"];
    if (k < 4) s.docs.push("national_id");
    s.docs.push("hajj_permit");
    if (s.out_ref) s.docs.push("flight_ticket");
  });
}

/* ════════════════════ IDENTIFIERS, VALIDITY, PHONES ════════════════════ */
const all = [...hajj, ...staff];
all.forEach((p, k) => {
  p.passport = p.portal === "DEMO-P-001" ? "DX1448001" : p.portal === "DEMO-P-002" ? "DX1448002" : `DX${String(1448100 + k).padStart(7, "0")}`;
  p.national_id = `99${String(28000000000 + k * 7919).padStart(12, "0")}`;
  p.expiry = dmy(900 + (k % 9) * 120);
  p.id_expiry = dmy(700 + (k % 7) * 90);
  p.dob = p.portal === "DEMO-P-001" ? "15/03/1968" : p.portal === "DEMO-P-002" ? "02/11/1972" : dmy(-(365 * 30 + ((k * 397) % (365 * 38))));
  p.phone = `+974000${String(10000 + k).slice(-5)}`;
});
{
  const v = H.validity_states_hajj;
  const cands = take(late, v.passport_expired + v.passport_expiring_within_6_months, nonPortal, "passport validity");
  cands.slice(0, v.passport_expired).forEach((p, k) => { p.expiry = dmy(-30 - k * 25); });
  cands.slice(v.passport_expired).forEach((p, k) => { p.expiry = dmy(60 + k * 10); });
  const idc = take(hajj, v.national_id_expired + v.national_id_expiring_within_6_months, nonPortal, "id validity");
  idc.slice(0, v.national_id_expired).forEach((p, k) => { p.id_expiry = dmy(-40 - k * 30); });
  idc.slice(v.national_id_expired).forEach((p, k) => { p.id_expiry = dmy(70 + k * 12); });
  const ph = H.phones_hajj;
  take(late, ph.missing, (p) => nonPortal(p) && !p.family_id, "missing phone").forEach((p) => { p.phone = null; });
  const dupCands = take(hajj, ph.duplicate_phone_groups, (p) => p.family_size === 2 && p.member === 0 && nonPortal(p), "dup phones");
  dupCands.forEach((p) => { const partner = hajj.find((q) => q.family_id === p.family_id && q !== p); partner.phone = p.phone; });
}
/* nationality spelling, sort order, refs */
hajj.forEach((p, k) => { p.ref = p.portal ?? `DEMO-H-${String(k + 1).padStart(3, "0")}`; p.passenger_type = "حاج"; p.sort_order = (k + 1) * 10; });
staff.forEach((s, k) => { s.ref = `DEMO-S-${String(k + 1).padStart(2, "0")}`; s.sort_order = (k + 1) * 10; s.wants_flight = !!s.wants_flight; });
all.forEach((p) => { p.nat = p.gender === "ذكر" ? NAT[p.natBase][0] : NAT[p.natBase][1]; p.nat_code = NAT[p.natBase][2]; });

/* ════════════════════ FINANCE ════════════════════ */
const LIVE = MANIFEST.pricing.live_amounts;
const LABELS = { package_double: "باقة ثنائي", package_triple: "باقة ثلاثي", package_quad: "باقة رباعي", package_suite: "باقة فردية",
  addon_view: "إضافة مطلة", addon_mina: "خيمة خاصة - منى", addon_arafa: "خيمة خاصة - عرفة", addon_bus_vip: "باص VIP",
  addon_first_class: "طيران درجة أولى", discount_no_ticket: "خصم بدون تذكرة" };
const TYPES = Object.fromEntries(MANIFEST.pricing.keys.map((k) => [k, k.startsWith("package") ? "package" : k.startsWith("addon") ? "addon" : "discount"]));
const pkgKey = { "ثنائية": "package_double", "ثلاثية": "package_triple", "رباعية": "package_quad", "فردية": "package_suite" };
const charges = [];
{
  const f = H.finance.custom_charges;
  const ADD = [["رسوم تأشيرة مستعجلة", 750], ["خدمة عربة متحركة", 1200], ["تغيير موعد الرحلة", 500], ["وجبات خاصة", 900], ["حقيبة إضافية", 400], ["غرفة قريبة من المصعد", 600]];
  const SUB = [["خصم تسجيل مبكر", 1000], ["خصم عائلي", 1500], ["خصم كبار السن", 800]];
  const targets = take(hajj, f.total, (p) => !isPortal(p) && !p.family_id, "charges");
  targets.forEach((p, k) => {
    const isAdd = k < f["إضافة"];
    const [desc, amt] = isAdd ? pick(ADD, k) : pick(SUB, k);
    charges.push({ person: p.ref, description: desc, amount: amt, type: isAdd ? "إضافة" : "خصم", notes: "بيانات عرض تجريبية" });
  });
}
function dueOf(p) {
  let t = p.hotel_type === "خاص" ? Number(p.custom_price) : LIVE[pkgKey[p.hotel_type]];
  if (p.hotel_view === "مطلة") t += LIVE.addon_view;
  if (p.camp_mina === "خاص") t += LIVE.addon_mina;
  if (p.camp_arafa === "خاص") t += LIVE.addon_arafa;
  if (p.bus === "VIP") t += LIVE.addon_bus_vip;
  if (p.flight === "درجة أولى") t += LIVE.addon_first_class;
  if (p.flight === "بدون") t -= LIVE.discount_no_ticket;
  charges.filter((c) => c.person === p.ref).forEach((c) => { t += c.type === "إضافة" ? c.amount : -c.amount; });
  return Math.max(0, t);
}
hajj.forEach((p) => { p.due = dueOf(p); assert(p.due > 0, `due must be > 0 for ${p.ref}`); });

/* financial groups: G1..G4 = 2-member families, G5..G6 = 3-member families (not portal), G7..G8 = 3 colleagues, G9 = 4 colleagues (unpaid) */
const groups = [];
{
  const fams = (size) => [...new Set(hajj.filter((p) => p.family_size === size && !isPortalFamily(p)).map((p) => p.family_id))];
  const f2 = fams(2).filter((id) => !hajj.some((p) => p.family_id === id && (p.phone === null))).slice(0, 4);
  const f3 = fams(3).slice(0, 2);
  assert(f2.length === 4 && f3.length === 2, "family groups");
  [...f2, ...f3].forEach((id, k) => {
    const members = hajj.filter((p) => p.family_id === id);
    groups.push({ ref: `G${k + 1}`, name: `عائلة ${members[0].short_ar.split(" ").slice(1).join(" ")}`, family: id, members: members.map((p) => p.ref) });
  });
  const used = new Set(groups.flatMap((g) => g.members));
  const chargeSet = new Set(charges.map((c) => c.person));
  const colleagues = hajj.filter((p) => !p.family_id && !used.has(p.ref) && !chargeSet.has(p.ref) && p.flight !== "بدون");
  const gm = [colleagues.slice(0, 3), colleagues.slice(3, 6), colleagues.slice(6, 10)];
  ["مجموعة زملاء العمل", "مجموعة أصدقاء الحي", "مجموعة جمعية الحي"].forEach((name, k) => groups.push({ ref: `G${7 + k}`, name, family: null, members: gm[k].map((p) => p.ref) }));
  const sizes = groups.map((g) => g.members.length).join(",");
  assert(sizes === "2,2,2,2,3,3,3,3,4", `group sizes ${sizes}`);
}
const byRef = new Map(all.map((p) => [p.ref, p]));
const groupOf = new Map(groups.flatMap((g) => g.members.map((m) => [m, g])));

/* statuses */
{
  const sc = H.finance.status_counts;
  const g9 = groups[8].members.map((r) => byRef.get(r));
  g9.forEach((p) => { p.fin = "لم يدفع"; });
  const groupPayers = groups.slice(0, 8).flatMap((g) => g.members.map((r) => byRef.get(r)));
  const solo = hajj.filter((p) => !groupOf.has(p.ref));
  take(fromEnd(solo), sc["لم يدفع"] - g9.length, nonPortal, "unpaid").forEach((p) => { p.fin = "لم يدفع"; });
  take(solo, sc["رصيد دائن"], (p) => !p.fin && nonPortal(p), "credit").forEach((p) => { p.fin = "رصيد دائن"; });
  /* group members: groups 1,3,5,7 fully paid; 2,4,6,8 partial */
  groups.slice(0, 8).forEach((g, k) => g.members.forEach((r) => { byRef.get(r).fin = k % 2 === 0 ? "مسدد" : "جزئي"; }));
  const paidSoFar = hajj.filter((p) => p.fin === "مسدد").length;
  take(solo, sc["مسدد"] - paidSoFar, (p) => !p.fin, "paid solo").forEach((p) => { p.fin = "مسدد"; });
  hajj.filter((p) => !p.fin).forEach((p) => { p.fin = "جزئي"; });
  assert(hajj.filter((p) => p.fin === "جزئي").length === sc["جزئي"], "partial count");
  assert(groupPayers.length === H.finance.financial_groups.paying_members, "paying group members");
}
const roundDown = (x, step = 500) => Math.floor(x / step) * step;
const targetPaid = (p, k) => p.fin === "مسدد" ? p.due : p.fin === "رصيد دائن" ? p.due + 500 : p.fin === "جزئي" ? Math.max(500, Math.min(p.due - 500, roundDown(p.due * [0.3, 0.45, 0.5, 0.6, 0.75][k % 5]))) : 0;

/* receipt plan */
const receipts = [];
{
  /* group receipts: G1 2×(2), G2 2×(2), G3 (2)+(1), G4 (2), G5 (3)+(2), G6..G8 (3) */
  const GR = [["G1", [2, 2]], ["G2", [2, 2]], ["G3", [2, 1]], ["G4", [2]], ["G5", [3, 2]], ["G6", [3]], ["G7", [3]], ["G8", [3]]];
  for (const [gref, parts] of GR) {
    const g = groups.find((x) => x.ref === gref);
    const members = g.members.map((r) => byRef.get(r));
    const totals = new Map(members.map((p, k) => [p, targetPaid(p, k + gref.charCodeAt(1))]));
    const remaining = new Map(totals);
    parts.forEach((n, pi) => {
      const last = pi === parts.length - 1;
      const covered = members.slice(0, n);
      const alloc = covered.map((p) => {
        /* a member covered by a later part keeps a share for it */
        const coveredLater = parts.slice(pi + 1).some((m) => members.indexOf(p) < m);
        const amt = coveredLater ? roundDown(remaining.get(p) / 2) || remaining.get(p) : remaining.get(p);
        remaining.set(p, remaining.get(p) - amt);
        return { person: p.ref, amount: amt };
      });
      receipts.push({ kind: "group", group: gref, group_name: g.name, allocations: alloc, installment: pi + 1, last });
    });
    members.forEach((p) => assert(remaining.get(p) === 0, `group remainder ${p.ref}`));
  }
  /* individual receipts: one per solo payer, 13 split into two installments */
  const soloPayers = hajj.filter((p) => !groupOf.has(p.ref) && p.fin !== "لم يدفع");
  assert(soloPayers.length === 76, `solo payers ${soloPayers.length}`);
  const SECOND = 13;
  soloPayers.forEach((p, k) => {
    const total = targetPaid(p, k);
    if (k < SECOND) {
      const first = roundDown(total / 2) || total;
      receipts.push({ kind: "individual", allocations: [{ person: p.ref, amount: first }], installment: 1 });
      receipts.push({ kind: "individual", allocations: [{ person: p.ref, amount: total - first }], installment: 2 });
    } else {
      receipts.push({ kind: "individual", allocations: [{ person: p.ref, amount: total }], installment: 1 });
    }
  });
  /* three cancelled receipts: a wrongly-entered amount, later voided */
  const reasons = ["أُدخل المبلغ خطأً — أُعيد إصدار الإيصال الصحيح", "دفعة مكرّرة سُجّلت مرتين", "الشيك أُعيد من البنك"];
  soloPayers.filter((p) => p.fin === "مسدد").slice(0, 3).forEach((p, k) => {
    receipts.push({ kind: "individual", allocations: [{ person: p.ref, amount: 1000 + k * 250 }], installment: 0, cancel_reason: reasons[k] });
  });
}
/* dates: 30 distinct offsets −90…−3 (step 3); first installments early, second ones later */
{
  const offs = Array.from({ length: H.finance.payment_dates.distinct }, (_, k) => H.finance.payment_dates.offset_range_days[0] + k * 3);
  assert(offs[offs.length - 1] <= H.finance.payment_dates.offset_range_days[1], "date range");
  const firsts = receipts.filter((r) => r.installment !== 2);
  const seconds = receipts.filter((r) => r.installment === 2);
  firsts.forEach((r, k) => { r.date_offset = offs[Math.floor((k * 20) / firsts.length)]; });
  seconds.forEach((r, k) => { r.date_offset = offs[20 + Math.floor((k * 10) / seconds.length)]; });
  /* a group's second part is always after its first */
  receipts.forEach((r) => { if (r.kind === "group" && r.installment === 2) r.date_offset = Math.max(r.date_offset, offs[22]); });
  const used = new Set(receipts.map((r) => r.date_offset));
  /* make sure every one of the 30 dates appears */
  offs.filter((o) => !used.has(o)).forEach((o, k) => { const r = firsts[k * 3 + 1]; r.date_offset = o; });
  receipts.forEach((r) => { r.payment_date = iso(r.date_offset); });
  /* issuance order = chronological */
  receipts.forEach((r, k) => { r.seq = k; });
  receipts.sort((a, b) => a.date_offset - b.date_offset || a.seq - b.seq);
  const methods = spread(Object.entries(H.finance.receipts.by_method), receipts.length, 37);
  receipts.forEach((r, k) => { r.method = methods[k]; r.receipt_number = H.finance.receipts.number_range[0] + k; delete r.seq; delete r.last; });
  receipts.forEach((r) => { r.notes = r.kind === "group" ? null : r.installment === 2 ? "الدفعة الثانية" : null; });
}
/* ensure every person ends at their target status (cancelled lines excluded) */
hajj.forEach((p) => {
  const paid = receipts.filter((r) => !r.cancel_reason).flatMap((r) => r.allocations).filter((a) => a.person === p.ref).reduce((s, a) => s + a.amount, 0);
  const st = p.due <= 0 && paid <= 0 ? "غير مسعّر" : paid > p.due ? "رصيد دائن" : paid >= p.due ? "مسدد" : paid > 0 ? "جزئي" : "لم يدفع";
  assert(st === p.fin, `finance status ${p.ref}: ${st} != ${p.fin}`);
});

/* ════════════════════ ARCHIVED SEASON ════════════════════ */
const ARCH = MANIFEST.pricing.archived_snapshot_amounts;
const archPeople = [];
for (let k = 0; k < A.passengers.total; k++) {
  const g = k < A.passengers.hajj_by_gender["ذكر"] ? "ذكر" : "أنثى";
  const first = g === "ذكر" ? pick(M_FIRST, k * 3 + 1) : pick(F_FIRST, k * 3 + 2);
  const father = pick(M_FIRST, k * 7 + 6), fam = pick(FAMILY, k * 2 + 5);
  archPeople.push({ ref: `DEMO-A-${String(k + 1).padStart(3, "0")}`, passenger_type: "حاج", gender: g, natBase: "قطري",
    nat: g === "ذكر" ? "قطري" : "قطرية", nat_code: "QAT",
    name_ar: `${first[0]} ${father[0]} ${fam[0]}`, short_ar: `${first[0]} ${fam[0]}`, name_en: `${first[1]} ${father[1]} ${fam[1]}`, short_en: `${first[1]} ${fam[1]}`,
    passport: `DX${1447100 + k}`, national_id: `99${String(27000000000 + k * 6007).padStart(12, "0")}`,
    dob: dmy(-(365 * 35 + k * 211)), expiry: dmy(400 + k * 20), id_expiry: dmy(300 + k * 15), phone: `+974000${String(20000 + k).slice(-5)}`,
    family_id: null, sort_order: (k + 1) * 10, flight: "عادي", bus: "عادي", camp_mina: "عادي", camp_arafa: "عادي", hotel_view: "غير مطلة",
    hotel_type: k < 16 ? "رباعية" : "ثنائية", docs: [] });
}
const archRooms = [
  ...[0, 1, 2, 3].map((k) => ({ ref: `A-ROOM-${k + 1}`, number: `A${k + 1}01`, floor: String(k + 1), type: "رباعية", capacity: 4 })),
  { ref: "A-ROOM-5", number: "A501", floor: "5", type: "ثنائية", capacity: 2 },
  { ref: "A-ROOM-6", number: "A502", floor: "5", type: "ثلاثية", capacity: 3 },
];
archPeople.forEach((p, k) => {
  p.room = k < 16 ? `A-ROOM-${Math.floor(k / 4) + 1}` : "A-ROOM-5";
  const male = p.gender === "ذكر";
  p.bus_ref = male ? "A-BUS-1" : "A-BUS-2"; p.mina = male ? "A-MINA-M" : "A-MINA-F"; p.arafa = male ? "A-ARAFA-M" : "A-ARAFA-F";
  p.out_ref = "A-OUT"; p.ret_ref = "A-RET";
  p.due = ARCH[pkgKey[p.hotel_type]];
});
const archReceipts = archPeople.map((p, k) => ({ kind: "individual", allocations: [{ person: p.ref, amount: p.due }], installment: 1,
  date_offset: -300 + k * 5, payment_date: iso(-300 + k * 5), method: ["نقدي", "تحويل بنكي", "شيك"][k % 3], receipt_number: A.finance.receipts.number_range[0] + k, notes: null }));

/* ════════════════════ ANNOUNCEMENTS ════════════════════ */
const announcements = [
  { season: "active", title: "تغيير موعد التجمّع", body: "يرجى التجمّع في صالة المغادرة قبل موعد الرحلة بأربع ساعات. (بيانات عرض تجريبية)", priority: "عاجل", show_offset: -3, expires_offset: 200, target_type: "all", target_refs: [] },
  { season: "active", title: "استلام حقائب الحملة", body: "تُسلَّم حقائب الحملة والبطاقات التعريفية في مقرّ الحملة. (بيانات عرض تجريبية)", priority: "مهم", show_offset: -14, expires_offset: 150, target_type: "all", target_refs: [] },
  { season: "active", title: "تعليمات ركّاب الباص VIP", body: "يتحرّك الباص VIP من الفندق بعد صلاة الفجر مباشرة. (بيانات عرض تجريبية)", priority: "مهم", show_offset: -7, expires_offset: null, target_type: "bus", target_refs: ["BUS-1"] },
  { season: "active", title: "مخيم منى — النساء", body: "تتوفّر مشرفة في المخيم على مدار الساعة. (بيانات عرض تجريبية)", priority: "عام", show_offset: -20, expires_offset: 210, target_type: "camp_mina", target_refs: ["MINA-F-REG"] },
  { season: "active", title: "اجتماع تعريفي للعائلات", body: "اجتماع تعريفي قصير لعائلات الحملة. (بيانات عرض تجريبية)", priority: "عام", show_offset: -30, expires_offset: null, target_type: "custom", target_refs: [P1.ref, P2.ref] },
  { season: "active", title: "موعد استكمال المستندات", body: "انتهت مهلة رفع المستندات الأولى. (بيانات عرض تجريبية — تنبيهٌ منتهٍ)", priority: "عام", show_offset: -60, expires_offset: -30, target_type: "all", target_refs: [] },
  { season: "archive", title: "تنبيه موسم 1447", body: "رسالة إلى حجّاج موسم 1447 — تبقى داخل موسمها. (بيانات عرض تجريبية)", priority: "عام", show_offset: -320, expires_offset: null, target_type: "all", target_refs: [] },
].map((a) => ({ ...a, show_at: ts(a.show_offset), expires_at: a.expires_offset === null ? null : ts(a.expires_offset, "23:59") }));

/* ════════════════════ COMPANY ════════════════════ */
const company = {
  name_ar: "حملة الرواد للحج — نسخة العرض", name_en: "Al-Rowad Hajj — DEMO", tagline: "بيئة عرض تجريبية — بيانات اصطناعية بالكامل",
  color_primary: "#7D1F3C", color_accent: "#D4A017", color_sidebar: "#F9F6F1",
  contact_phone: "+97400009000", contact_email: "demo@example.invalid",
  admin_name: "مسؤول العرض التجريبي", admin_phone: "+97400009001", admin_whatsapp: "+97400009001",
  country: "قطر", city: "الدوحة", commercial_registration: "DEMO-000000",
  bank_name: "بنك العرض التجريبي (غير حقيقي)", bank_account_name: "حملة الرواد — حساب عرض", bank_account_number: "0000-DEMO-0000",
  bank_iban: "QA00DEMO000000000000000000000", bank_swift: "DEMOQAQA",
  portal_welcome_message: "أهلاً بك في بوابة الحاج — هذه بيئة عرض ببيانات اصطناعية.",
  portal_help_message: "للمساعدة تواصل مع مسؤول الحملة. (رقم غير حقيقي — بيئة عرض)",
  portal_settings: { buses: true, rooms: true, flights: true, qr_codes: true, documents: true, lost_card: true, roommates: true, notifications: true, pdf_downloads: true, financial_balance: false },
};
const companyAssets = [
  ...MANIFEST.company.public_asset_keys.map((k) => ({ key: k, bucket: "company-assets", file: `${k}_demo.png`, alt_text: `${k} — DEMO` })),
  ...MANIFEST.company.private_asset_keys.map((k) => ({ key: k, bucket: "company-private", file: `${k}_demo.png`, alt_text: `${k} — DEMO` })),
];
const seasons = {
  archive: { name: "موسم حج 1447", hijri_year: 1447, receipt_start_number: A.finance.receipts.number_range[0],
    hotel_name: "فندق المنارة (عرض) — مكة", hotel_address: "أجياد، مكة المكرمة (عنوان عام)", hotel_url: "https://maps.google.com/?q=Ajyad+Makkah",
    mina_address: "منى (موقع عام)", mina_url: "https://maps.google.com/?q=Mina", arafa_address: "عرفات (موقع عام)", arafa_url: "https://maps.google.com/?q=Arafat" },
  active: { name: "موسم حج 1448", hijri_year: 1448, receipt_start_number: H.finance.receipts.number_range[0],
    hotel_name: "فندق الصفوة (عرض) — مكة", hotel_address: "العزيزية، مكة المكرمة (عنوان عام)", hotel_url: "https://maps.google.com/?q=Aziziyah+Makkah",
    mina_address: "منى — المنطقة العامة (موقع عام)", mina_url: "https://maps.google.com/?q=Mina", arafa_address: "عرفات — المنطقة العامة (موقع عام)", arafa_url: "https://maps.google.com/?q=Arafat" },
};
const archResources = {
  buses: A.buses.map((b, k) => ({ ref: b.ref, name: `باص 1447 — ${k + 1}`, type: b.type, capacity: b.capacity })),
  camps: A.camps.map((c) => ({ ref: c.ref, page_type: c.page_type, gender: c.gender, type: c.type, capacity: c.capacity, name: `${c.page_type === "منى" ? "مخيم منى" : "مخيم عرفة"} 1447 — ${c.gender === "ذكر" ? "رجال" : "نساء"}` })),
  rooms: archRooms,
  flights: [
    { ref: "A-OUT", name: "QR 9711", type: "ذهاب", airline: "Qatar Airways", capacity: 30, date: iso(-150), time: "09:00", arrival_date: iso(-150), arrival_time: "11:15", from_airport: "DOH", to_airport: "JED" },
    { ref: "A-RET", name: "QR 9721", type: "إياب", airline: "Qatar Airways", capacity: 30, date: iso(-130), time: "17:00", arrival_date: iso(-130), arrival_time: "19:10", from_airport: "JED", to_airport: "DOH" },
  ],
};

/* ════════════════════ EMIT ════════════════════ */
const personOut = (p, season) => ({
  ref: p.ref, season, passenger_type: p.passenger_type, gender: p.gender,
  name_ar: p.name_ar, short_ar: p.short_ar, name_en: p.name_en, short_en: p.short_en,
  nat: p.nat, nat_code: p.nat_code, dob: p.dob, passport: p.passport, national_id: p.national_id,
  expiry: p.expiry, id_expiry: p.id_expiry, phone: p.phone, family_id: p.family_id ?? null, sort_order: p.sort_order,
  services: { bus: p.bus, flight: p.flight, hotel_type: p.hotel_type, hotel_view: p.hotel_view, camp_mina: p.camp_mina, camp_arafa: p.camp_arafa, custom_price: p.custom_price ?? 0 },
  wants_flight: p.passenger_type === "حاج" ? false : !!p.wants_flight,
  alloc: { bus: p.bus_ref ?? null, room: p.room ?? null, mina: p.mina ?? null, arafa: p.arafa ?? null, out: p.out_ref ?? null, ret: p.ret_ref ?? null },
  docs: [...(p.docs ?? [])].sort(),
  portal: p.portal ?? null,
});
const strip = (r) => Object.fromEntries(Object.entries(r).filter(([k]) => !["wantHajj", "wantStaff", "occupants"].includes(k)));
const dataset = {
  dataset: "alaqsa-hajj-demo-dataset",
  generated_by: "supabase/demo/tools/build-dataset.mjs",
  manifest_version: MANIFEST.manifest_version,
  demo_anchor_date: ANCHOR,
  synthetic: true,
  created_by_tag: "demo-seed",
  company, company_assets: companyAssets,
  pricing: { labels: LABELS, types: TYPES, archive: ARCH, live: LIVE },
  seasons,
  resources: {
    archive: archResources,
    active: { buses: busesActive.map(strip), camps: campsActive.map(strip), rooms: roomsActive.map(strip), flights: flightsActive.map(strip) },
  },
  people: [...archPeople.map((p) => personOut(p, "archive")), ...hajj.map((p) => personOut(p, "active")), ...staff.map((p) => personOut(p, "active"))],
  financial_groups: groups.map((g) => ({ ref: g.ref, name: g.name, notes: g.family ? "مجموعة عائلية — بيانات عرض" : "مجموعة غير عائلية — بيانات عرض", members: g.members })),
  custom_charges: charges,
  receipts: { archive: archReceipts, active: receipts.map((r) => ({ receipt_number: r.receipt_number, kind: r.kind, group_name: r.group_name ?? null, payment_date: r.payment_date, method: r.method, notes: r.notes, allocations: r.allocations, cancel_reason: r.cancel_reason ?? null })) },
  announcements: announcements.map((a) => ({ season: a.season, title: a.title, body: a.body, priority: a.priority, show_at: a.show_at, expires_at: a.expires_at, target_type: a.target_type, target_refs: a.target_refs })),
  portal: { pilgrim: "DEMO-P-001", rehearsal: "DEMO-P-002" },
  ocr_samples: [
    { file: "ocr-samples/walk-in-passport.png", kind: "passport", name_en: "SAMIR KHALED AL-HADDAD", passport: "DX1449901", dob: "09/07/1975", expiry: iso(1500).split("-").reverse().join("/"), nat_code: "QAT", gender: "ذكر" },
    { file: "ocr-samples/walk-in-national-id.png", kind: "national_id", name_en: "SAMIR KHALED AL-HADDAD", national_id: "99000000099901", dob: "09/07/1975", expiry: iso(1200).split("-").reverse().join("/"), nat_code: "QAT", gender: "ذكر" },
    { file: "ocr-samples/walk-in-hajj-permit.png", kind: "hajj_permit", name_en: "SAMIR KHALED AL-HADDAD", passport: "DX1449901", nat_code: "QAT", gender: "ذكر" },
  ],
};

/* ════════════════════ SELF-CHECK AGAINST THE MANIFEST ════════════════════ */
{
  const act = dataset.people.filter((p) => p.season === "active");
  const hj = act.filter((p) => p.passenger_type === "حاج");
  const st = act.filter((p) => p.passenger_type !== "حاج");
  const cnt = (arr, f) => arr.filter(f).length;
  const eq = (name, a, b) => assert(JSON.stringify(a) === JSON.stringify(b), `${name}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
  eq("active total", act.length, H.passengers.total);
  const dist = (arr, key) => arr.reduce((m, p) => { const v = key(p); m[v] = (m[v] ?? 0) + 1; return m; }, {});
  const sortObj = (o) => Object.fromEntries(Object.entries(o).sort());
  eq("types", sortObj(dist(act, (p) => p.passenger_type)), sortObj(H.passengers.by_passenger_type));
  eq("hajj gender", sortObj(dist(hj, (p) => p.gender)), sortObj(H.passengers.hajj_by_gender));
  eq("staff gender", sortObj(dist(st, (p) => p.gender)), sortObj(H.passengers.staff_by_gender));
  eq("nat", sortObj(dist(hj, (p) => p.nat.replace(/ة$/, "").replace("سوري", "سوري"))), sortObj(Object.fromEntries(Object.entries(H.passengers.hajj_by_nationality_base))));
  eq("families", new Set(hj.filter((p) => p.family_id).map((p) => p.family_id)).size, H.passengers.families.count);
  eq("family members", cnt(hj, (p) => p.family_id), H.passengers.families.members_total);
  eq("staff wants flight", cnt(st, (p) => p.wants_flight), H.passengers.staff_wants_flight);
  for (const k of ["hotel_type", "hotel_view", "bus", "flight", "camp_mina", "camp_arafa"]) eq(`svc ${k}`, sortObj(dist(hj, (p) => p.services[k])), sortObj(H.commercial_services_hajj[k]));
  const docCol = { photo: "photo_url", passport: "passport_url", national_id: "national_id_url", contract: "contract_url", hajj_permit: "hajj_permit_url", flight_ticket: "flight_ticket_url" };
  for (const [d, col] of Object.entries(docCol)) {
    eq(`hajj docs ${d}`, cnt(hj, (p) => p.docs.includes(d)), H.documents.hajj_present_per_column[col]);
    eq(`staff docs ${d}`, cnt(st, (p) => p.docs.includes(d)), H.documents.staff_present_per_column[col]);
  }
  eq("complete trio", cnt(hj, (p) => ["photo", "passport", "national_id"].every((d) => p.docs.includes(d))), H.documents.hajj_identity_document_states.photo_passport_national_id_complete);
  assert(act.every((p) => !p.docs.includes("flight_ticket") || p.alloc.out), "ticket without outbound");
  assert(hj.every((p) => p.services.flight !== "بدون" || (!p.alloc.out && !p.alloc.ret)), "بدون with flight");
  const occ = (key, ref, arr) => cnt(arr, (p) => p.alloc[key] === ref);
  H.buses.items.forEach((b) => { eq(`bus ${b.ref}`, [occ("bus", b.ref, hj), occ("bus", b.ref, st)], [b.occupancy.hajj, b.occupancy.staff]); });
  [...H.camps.mina, ...H.camps.arafat].forEach((c) => {
    const key = c.ref.startsWith("MINA") ? "mina" : "arafa";
    eq(`camp ${c.ref}`, [occ(key, c.ref, hj), occ(key, c.ref, st)], [c.occupancy.hajj, c.occupancy.staff]);
    assert(act.filter((p) => p.alloc[key] === c.ref).every((p) => p.gender === c.gender), `camp gender ${c.ref}`);
  });
  H.flights.items.forEach((f) => { const key = f.type === "ذهاب" ? "out" : "ret"; eq(`flight ${f.ref}`, [occ(key, f.ref, hj), occ(key, f.ref, st)], [f.occupancy.hajj, f.occupancy.staff]); });
  /* rooms */
  const rs = dataset.resources.active.rooms;
  const roomState = { "مكتملة": 0, "قيد التسكين": 0, "جاهزة": 0, "مجلس": 0, "تجاوز": 0, "غير محدّدة": 0 };
  rs.forEach((r) => {
    const o = cnt(act, (p) => p.alloc.room === r.ref);
    if (r.type === "مجلس") { roomState["مجلس"]++; assert(o === 0, "majlis occupied"); return; }
    roomState[o === 0 ? "جاهزة" : o >= r.capacity ? "مكتملة" : "قيد التسكين"]++;
    assert(o <= r.capacity, `room over capacity ${r.ref}`);
    assert(act.filter((p) => p.alloc.room === r.ref && p.passenger_type === "حاج").every((p) => p.services.hotel_type === r.type), `room type mismatch ${r.ref}`);
  });
  eq("rooms count", rs.length, H.rooms.count);
  eq("room states", roomState, H.rooms.status_totals);
  eq("rooms hajj", cnt(hj, (p) => p.alloc.room), H.rooms.hajj_assigned);
  /* operations */
  const O = H.operations_room_expected_hajj_counts;
  const parse = (s) => { const [d, m, y] = s.split("/").map(Number); return Date.UTC(y, m - 1, d); };
  const six = Date.UTC(AY, AM - 1 + 6, AD);
  const expired = (s) => parse(s) < anchorUtc, expiring = (s) => parse(s) >= anchorUtc && parse(s) < six;
  eq("expired passport", cnt(hj, (p) => expired(p.expiry)), O.expired_passport);
  eq("expiring passport", cnt(hj, (p) => expiring(p.expiry)), O.expiring_passport);
  eq("expired id", cnt(hj, (p) => expired(p.id_expiry)), O.expired_id);
  eq("expiring id", cnt(hj, (p) => expiring(p.id_expiry)), O.expiring_id);
  eq("missing phone", cnt(hj, (p) => !p.phone), O.missing_phone);
  const phones = hj.filter((p) => p.phone).map((p) => p.phone);
  eq("dup phone pilgrims", cnt(hj, (p) => p.phone && phones.filter((x) => x === p.phone).length > 1), O.duplicate_phone_pilgrims);
  eq("missing hotel", cnt(hj, (p) => !p.alloc.room), O.missing_hotel);
  eq("missing bus", cnt(hj, (p) => !p.alloc.bus), O.missing_bus);
  eq("missing mina", cnt(hj, (p) => !p.alloc.mina), O.missing_mina);
  eq("missing arafah", cnt(hj, (p) => !p.alloc.arafa), O.missing_arafah);
  eq("missing flight", cnt(hj, (p) => p.services.flight !== "بدون" && !p.alloc.out), O.missing_flight);
  eq("missing return", cnt(hj, (p) => p.services.flight !== "بدون" && !p.alloc.ret), O.missing_return_flight);
  /* finance */
  const fs = H.finance;
  const rc = dataset.receipts.active;
  eq("receipts", rc.length, fs.receipts.total);
  eq("cancelled", cnt(rc, (r) => r.cancel_reason), fs.receipts.cancelled);
  eq("group receipts", cnt(rc, (r) => r.kind === "group"), fs.receipts.group);
  eq("methods", sortObj(dist(rc, (r) => r.method)), sortObj(fs.receipts.by_method));
  eq("lines", rc.reduce((s, r) => s + r.allocations.length, 0), fs.payment_lines.total);
  eq("group lines", rc.filter((r) => r.kind === "group").reduce((s, r) => s + r.allocations.length, 0), fs.payment_lines.group);
  eq("dates", new Set(rc.map((r) => r.payment_date)).size, fs.payment_dates.distinct);
  eq("receipt numbers", [Math.min(...rc.map((r) => r.receipt_number)), Math.max(...rc.map((r) => r.receipt_number))], fs.receipts.number_range);
  eq("charges", charges.length, fs.custom_charges.total);
  eq("groups", groups.length, fs.financial_groups.count);
  eq("memberships", groups.reduce((s, g) => s + g.members.length, 0), fs.financial_groups.memberships);
  eq("statuses", sortObj(dist(hajj, (p) => p.fin)), sortObj(Object.fromEntries(Object.entries(fs.status_counts).filter(([, v]) => v > 0))));
  /* archive */
  eq("archive people", archPeople.length, A.passengers.total);
  eq("archive receipts", archReceipts.length, A.finance.receipts.total);
  /* portal */
  const p1 = act.find((p) => p.portal === "DEMO-P-001");
  eq("portal passport", [p1.passport, p1.dob, p1.gender], [H.portal_demo_pilgrim.passport, H.portal_demo_pilgrim.dob, H.portal_demo_pilgrim.gender]);
  assert(Object.values(p1.alloc).every(Boolean), "portal pilgrim fully allocated");
  assert(["photo", "hajj_permit", "flight_ticket"].every((d) => p1.docs.includes(d)), "portal docs");
  assert(cnt(act, (p) => p.family_id === p1.family_id) >= 3, "portal family");
  assert(cnt(act, (p) => p.alloc.room === p1.alloc.room) >= 2, "portal roommates");
  assert(p1.phone && cnt(act, (p) => p.phone === p1.phone) === 1, "portal phone");
  assert(!expired(p1.expiry) && !expiring(p1.expiry) && !expired(p1.id_expiry) && !expiring(p1.id_expiry), "portal validity");
  /* storage */
  const objs = act.reduce((s, p) => s + p.docs.length, 0);
  eq("passenger objects", objs, MANIFEST.storage.expected_objects["passengers-docs"].total);
  eq("announcements", cnt(dataset.announcements, (a) => a.season === "active"), H.announcements.count);
  /* uniqueness of identifiers */
  const all2 = dataset.people;
  eq("unique passports", new Set(all2.map((p) => p.passport)).size, all2.length);
  eq("unique national ids", new Set(all2.map((p) => p.national_id)).size, all2.length);
  assert(all2.every((p) => /^DX\d{7}$/.test(p.passport)), "passport pattern");
  assert(all2.every((p) => /^99\d{12}$/.test(p.national_id)), "national id pattern");
  assert(all2.every((p) => p.phone === null || /^\+97400\d{6}$/.test(p.phone)), "phone pattern");
}

const text = JSON.stringify(dataset, null, 1) + "\n";
if (process.argv.includes("--check")) {
  if (!existsSync(OUT)) fail("data/dataset.json missing — run build-dataset.mjs");
  if (readFileSync(OUT, "utf8") !== text) fail("data/dataset.json is stale — re-run build-dataset.mjs and review the diff");
  console.log("✓ data/dataset.json is current and matches the manifest");
} else {
  writeFileSync(OUT, text);
  console.log(`✓ wrote ${OUT.replace(process.cwd() + "/", "")} — ${dataset.people.length} people, ${dataset.receipts.active.length + dataset.receipts.archive.length} receipts; every manifest count re-derived and matched`);
}
