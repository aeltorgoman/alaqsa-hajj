// ============================================================
// مطبوعاتُ التحقّق — من بُناة المطبوعات الحقيقيّة، ببياناتٍ اصطناعيّة
// ============================================================
/* يُحزَم بـ`run.mjs` (rolldown) ويُشغَّل في Node. لا قاعدةَ ولا شبكةَ ولا
   أصلَ خاصّاً: الختمُ والتوقيعُ صورتان اصطناعيّتان تُرسمان وقتَ التشغيل
   وتُخدَمان من `https://seal.test/` داخل المتصفّح المُختبِر وحده.

   node fixtures.cjs <outDir> <mode>
     mode = off      — كلُّ الخيارات الجديدة مطفأة (مقارنةُ «المطبوع كما كان»)
            on       — الختمُ والتوقيع (والبنكُ لكشف الحساب)
            ghost    — كـ on بصورٍ شفّافةٍ بالمقاسات نفسها (قناعُ موضع الصورتين)
            stamp    — الختمُ وحده          · signature — التوقيعُ وحده
   ويطبع في الآخر نتائجَ فحوصِ المنطق (JSON) على stdout. */
import { writeFileSync } from "node:fs";
import {
  busesReportDocument, busReportDocument, campsReportDocument, flightsReportDocument, hotelReportDocument, makeHTML,
  chromeFromOptions, initialPrintOptions, effectiveOptions, requestedSeals, PRINT_SPECS, bankLinesFrom, bankBlockHTML,
  sealSizeMm, sealBottomMarginMm, STAMP_BOX_MM, SIGNATURE_BOX_MM, type PrintSeals, type PrintOptionsState, type PrintReportKey,
} from "../../src/print";
import { makeReceiptHTML, makePassengerStatementHTML, printFullReport, printPaymentsReport } from "../../src/components/finance/finance.print";
import { loadPrintSeals, sealUnavailability } from "../../src/company/printSeals";

const [, , OUT, MODE = "off"] = process.argv;
/* تاريخُ الإصدار ثابتٌ — فمخرجا الفرعين يُقارَنان بايتاً ببايت */
const FIXED = new Date("2026-05-01T09:30:00Z").getTime();
const RealDate = Date;
class FixedDate extends RealDate {
  constructor(...a: ConstructorParameters<typeof Date>) { super(...((a.length ? a : [FIXED]) as [number])); }
  static now() { return FIXED; }
}
(globalThis as { Date: DateConstructor }).Date = FixedDate as unknown as DateConstructor;

/* مقاساتُ الصورتين الاصطناعيّتين كأصلَي الحملة الحقيقيّين (metadata) */
export const STAMP_PX = { w: 1503, h: 1600 }, SIGNATURE_PX = { w: 1600, h: 1376 };
const img = (name: string, px: { w: number; h: number }) => ({ url: `https://seal.test/${MODE === "ghost" ? "ghost-" : ""}${name}.png`, width: px.w, height: px.h });
const SEALS: PrintSeals = MODE === "off" ? {}
  : MODE === "stamp" ? { stamp: img("stamp", STAMP_PX) }
  : MODE === "signature" ? { signature: img("signature", SIGNATURE_PX) }
  : { stamp: img("stamp", STAMP_PX), signature: img("signature", SIGNATURE_PX) };
const on = MODE !== "off";
const opts = (k: PrintReportKey, extra: Partial<PrintOptionsState> = {}) =>
  ({ ...initialPrintOptions(k), stamp: on && MODE !== "signature", signature: on && MODE !== "stamp", ...extra });

const brand = { companyName: "حملة الاختبار للحج", tagline: "معاينةٌ ببياناتٍ اصطناعيّة", primaryColor: "#6B1F3A", accentColor: "#085041" };
const season = { name: "موسم ١٤٤٨" };
const nm = (i: number) => `حاج تجريبي رقم ${i} بن عبد الله الفلاني`;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const pax = (n: number, extra: (i: number) => Any, start = 1): Any[] => Array.from({ length: n }, (_, k) => {
  const i = start + k;
  return { id: i, name_ar: nm(i), short_ar: nm(i), name_en: `Test Pilgrim ${i}`, passenger_type: "حاج", gender: "ذكر", nat: "قطر",
    passport: `P${900000 + i}`, phone: `5550${1000 + i}`, bus_sort_order: i, camp_mina_sort_order: i, camp_arafa_sort_order: i,
    services: { hotel_type: "عادي", hotel_view: "", camp_mina: "", camp_arafa: "", bus: "", flight: "اقتصادية" }, ...extra(i) };
});

const docs: Record<string, string> = {};
const put = (name: string, html: string) => { docs[name] = html; writeFileSync(`${OUT}/${name}.html`, html); };
/* المطبوعاتُ التي تطبع بنفسها (`printInPage`) تُلتقَط من البديل المحقون */
const printed = (globalThis as { __printed?: string[] }).__printed ??= [];
const capture = (fn: () => void) => { printed.length = 0; fn(); return printed[printed.length - 1]; };

// ── الكشوفُ التشغيليّة
const bus = (id: number, name: string) => ({ id, name, type: "عادي" } as Any);
put("bus-single", busReportDocument(bus(1, "١"), pax(20, () => ({ bus_id: 1 })), brand, chromeFromOptions("bus", opts("bus"), { season, seals: SEALS })));
put("bus-multi", busesReportDocument([bus(1, "١"), bus(2, "٢"), bus(3, "٣")],
  [...pax(40, () => ({ bus_id: 1 })), ...pax(62, () => ({ bus_id: 2 }), 41), ...pax(12, () => ({ bus_id: 3 }), 103)], brand,
  chromeFromOptions("bus", opts("bus"), { season, seals: SEALS })));
const camp = (id: number, name: string) => ({ id, name, gender: "ذكر", sort_order: id } as Any);
put("camp-mina", campsReportDocument([camp(1, "أ"), camp(2, "ب")], [...pax(30, () => ({ camp_mina_id: 1 })), ...pax(55, () => ({ camp_mina_id: 2 }), 31)],
  "منى", brand, chromeFromOptions("mina", opts("mina"), { season, seals: SEALS })));
put("camp-arafa", campsReportDocument([camp(1, "أ")], pax(62, () => ({ camp_arafa_id: 1 })),
  "عرفة", brand, chromeFromOptions("arafa", opts("arafa"), { season, seals: SEALS })));
const flight = (id: number, name: string, date: string) => ({ id, name, type: "ذهاب", airline: "الخطوط القطرية", date, time: "10:00",
  from_airport: "DOH", to_airport: "JED" } as Any);
put("flights-multi", flightsReportDocument([flight(1, "QR1182", "2026-05-20"), flight(2, "QR1186", "2026-05-21")],
  [...pax(60, () => ({ flight_id: 1 })), ...pax(25, () => ({ flight_id: 2 }), 61)], brand,
  chromeFromOptions("flights", opts("flights"), { season, seals: SEALS })));

// ── الفندق: أسرّةٌ ٤ و٦ و٨، طوليّاً وعرضيّاً
for (const cap of [4, 6, 8]) for (const landscape of [false, true]) {
  const rooms = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, number: String(101 + i), type: cap === 4 ? "رباعية" : "خاص", capacity: cap, floor: "1" }));
  put(`hotel-${cap}bed-${landscape ? "landscape" : "portrait"}`, hotelReportDocument(rooms as Any, pax(20 * cap, i => ({ room_id: ((i - 1) % 20) + 1 })), brand,
    { landscape, chrome: chromeFromOptions("hotel", opts("hotel"), { season, seals: SEALS }) }));
}

// ── الكشوفُ المتدفّقة
const rows = Array.from({ length: 120 }, (_, i) => `<tr><td>${i + 1}</td><td>${nm(i + 1)}</td><td>P${900001 + i}</td><td>قطر</td><td>5550${1001 + i}</td></tr>`).join("");
put("pilgrims-list", makeHTML("كشف الحجاج", `<table><tr><th>م</th><th>الاسم</th><th>الجواز</th><th>الجنسية</th><th>الهاتف</th></tr>${rows}</table>`, brand,
  { chrome: chromeFromOptions("pilgrims", opts("pilgrims"), { season, scope: "كل الحجاج", seals: SEALS }) }));
put("admins-list", makeHTML("كشف الإداريين", `<table><tr><th>م</th><th>الاسم</th><th>الجواز</th></tr>${rows.slice(0, 4000)}</table>`, brand,
  { landscape: true, chrome: chromeFromOptions("lists", opts("lists"), { seals: SEALS }) }));

// ── المالية
const fin = pax(75, () => ({})).map((p, i) => ({ p, due: 30000, paid: (i * 1700) % 30000, balance: 30000 - (i * 1700) % 30000 }));
put("finance-full", capture(() => printFullReport(fin as Any, {} as Any, brand, "تقرير الحجاج المالي الكامل",
  chromeFromOptions("finance", opts("finance"), { season, seals: SEALS }))));
const payRows = Array.from({ length: 70 }, (_, i) => ({ key: `r${i}`, receiptNo: String(1001 + i), name: nm(i + 1), date: `2026-04-${String(1 + (i % 28)).padStart(2, "0")}`,
  method: i % 3 ? "نقدي" : "تحويل بنكي", amount: 1500 + (i % 5) * 250, cancelled: i % 17 === 0, notes: "" }));
put("finance-payments", capture(() => printPaymentsReport(payRows as Any, brand, "2026-04-01", "2026-04-30",
  chromeFromOptions("finance", opts("finance"), { season, seals: SEALS }))));

// ── كشفُ حساب الحاجّ — بالبنك وبدونه
const bankSrc = { bankName: "بنك قطر الوطني", accountName: "حملة الاختبار للحج والعمرة", accountNumber: "0123-456789-001",
  iban: "QA58QNBA000000000123456789001", swift: "QNBAQAQA", commercialRegistration: "CR-123456" };
const person = pax(1, () => ({}))[0];
const pays = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i, passenger_id: 1, amount: 500 + (i % 4) * 250,
  payment_date: `2026-0${1 + (i % 4)}-${String(1 + i).padStart(2, "0")}`, method: i % 2 ? "نقدي" : "تحويل بنكي", notes: "" }));
const pricing = { pkg_standard: { amount: 30000 } } as Any;
for (const [name, n, withBank] of [["statement-short", 3, false], ["statement-short-bank", 3, true], ["statement-long-bank", 34, true]] as const) {
  put(name, makePassengerStatementHTML(person, pricing, {} as Any, [], [], pays(n) as Any, brand,
    chromeFromOptions("statement", opts("statement", { bank: withBank }), { seals: SEALS, bank: bankLinesFrom(bankSrc) })));
}

// ── الإيصالُ A5 — عاديّ، ملغى، ومجموعةٌ طويلة
const receipt = { receipt_number: 1001, status: "active", total_amount: 1500, payer_name: nm(1), payment_date: "2026-05-01",
  method: "نقدي", season_name: "موسم ١٤٤٨", issued_by: "موظف المالية", notes: "", group_name: null } as Any;
const rBrand = { ...brand, stampUrl: SEALS.stamp?.url ?? "", signatureUrl: SEALS.signature?.url ?? "" };
put("receipt", makeReceiptHTML(receipt, rBrand, [], { seals: SEALS }));
put("receipt-cancelled", makeReceiptHTML({ ...receipt, receipt_number: 1002, status: "cancelled", cancel_reason: "إدخالٌ مكرَّر" }, rBrand, [], { seals: SEALS }));
put("receipt-group-long", makeReceiptHTML({ ...receipt, receipt_number: 1003, total_amount: 30000, group_name: "مجموعة العائلة" }, rBrand,
  Array.from({ length: 24 }, (_, i) => ({ name: nm(i + 1), amount: 1250 })), { seals: SEALS }));

// ── فحوصُ المنطق (لا متصفّح)
const checks: { name: string; ok: boolean; detail?: string }[] = [];
const check = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
for (const k of Object.keys(PRINT_SPECS) as PrintReportKey[]) {
  const d = initialPrintOptions(k);
  const av = PRINT_SPECS[k].available as readonly string[];
  if (k === "receipt") check(`defaults: receipt stamp+signature ON (behaviour kept)`, d.stamp && d.signature && !d.bank);
  else check(`defaults: ${k} stamp/signature/bank OFF`, !d.stamp && !d.signature && !d.bank);
  if (k === "documents") check("documents: no stamp/signature option", !av.includes("stamp") && !av.includes("signature"));
  if (k !== "statement") check(`bank only on statement: ${k}`, !av.includes("bank"));
}
const both = { stamp: img("stamp", STAMP_PX), signature: img("signature", SIGNATURE_PX) };
const c1 = chromeFromOptions("bus", { ...initialPrintOptions("bus"), stamp: true }, { seals: both });
check("toggle: stamp only → signature not drawn", !!c1.seals?.stamp && !c1.seals?.signature);
const c2 = chromeFromOptions("bus", { ...initialPrintOptions("bus"), signature: true }, { seals: both });
check("toggle: signature only → stamp not drawn", !c2.seals?.stamp && !!c2.seals?.signature);
check("toggle: both off → no seals", chromeFromOptions("bus", initialPrintOptions("bus"), { seals: both }).seals === null);
check("documents never carry seals", chromeFromOptions("documents", { ...initialPrintOptions("documents"), stamp: true, signature: true }, { seals: both }).seals === null);
check("bank never on non-statement", chromeFromOptions("finance", { ...initialPrintOptions("finance"), bank: true }, { bank: bankLinesFrom(bankSrc) }).bank === null);
check("disabled option is effectively off", requestedSeals("receipt", effectiveOptions(initialPrintOptions("receipt"), { stamp: "x" })).stamp === false);
check("missing bank: all empty → no lines", bankLinesFrom({ bankName: "", accountName: " ", accountNumber: "", iban: "", swift: "", commercialRegistration: "" }).length === 0);
check("missing bank: empty block renders nothing", bankBlockHTML([], "#000") === "");
const partial = bankLinesFrom({ ...bankSrc, accountNumber: "", swift: "  " });
check("partial bank: only populated, CR included", partial.length === 4 && partial.some(l => l.label === "رقم السجل التجاري"), partial.map(l => l.label).join(","));
check("bank identifiers isolated LTR", bankBlockHTML(bankLinesFrom(bankSrc), "#000").includes(`<bdi dir="ltr">QA58QNBA000000000123456789001</bdi>`));
const sm = sealSizeMm(both.stamp, STAMP_BOX_MM), gm = sealSizeMm(both.signature, SIGNATURE_BOX_MM);
check("stamp keeps its proportions", Math.abs(sm.w / sm.h - 1503 / 1600) < 0.01, `${sm.w}×${sm.h}mm`);
check("signature keeps its proportions", Math.abs(gm.w / gm.h - 1600 / 1376) < 0.01, `${gm.w}×${gm.h}mm`);
check("independent realistic sizes", sm.h !== gm.h && sm.h >= 28 && gm.h <= 22, `stamp ${sm.h}mm · signature ${gm.h}mm`);
check("margin is the minimum that fits", sealBottomMarginMm(both, 14) < 14 + 30, `${sealBottomMarginMm(both, 14)}mm`);
const assets = { company_stamp: { url: "company_stamp_1.png" }, manager_signature: { url: "manager_signature_1.png" } } as Any;
const okDeps = { sign: async (k: string) => `https://seal.test/${k}`, load: async (u: string) => ({ url: u, width: 10, height: 10 }) };
const results = await Promise.all([
  loadPrintSeals({} as Any, { stamp: true, signature: false }, okDeps),
  loadPrintSeals(assets, { stamp: true, signature: true }, { ...okDeps, sign: async () => "" }),
  loadPrintSeals(assets, { stamp: false, signature: true }, { ...okDeps, load: async () => null }),
  loadPrintSeals(assets, { stamp: true, signature: true }, okDeps),
  loadPrintSeals(assets, { stamp: false, signature: false }, { sign: async () => { throw new Error("must not sign"); }, load: okDeps.load }),
]);
check("missing stamp asset → refused with message", !results[0].ok && /لم يُرفع ختم الشركة/.test((results[0] as { message: string }).message));
check("signing denied (no permission) → refused", !results[1].ok && /صلاحية/.test((results[1] as { message: string }).message));
check("image load failure → refused", !results[2].ok && /تعذّر تحميل صورة التوقيع/.test((results[2] as { message: string }).message));
check("both available → both loaded", results[3].ok && !!(results[3] as { seals: PrintSeals }).seals.stamp && !!(results[3] as { seals: PrintSeals }).seals.signature);
check("nothing requested → nothing signed", results[4].ok);
check("unavailability names the missing asset", JSON.stringify(sealUnavailability({} as Any)).includes("ختمُ الشركة"));
check("message never contains a signed URL", results.every(r => r.ok || !/https?:/.test((r as { message: string }).message)));

console.log(JSON.stringify({ mode: MODE, docs: Object.keys(docs), checks }));
