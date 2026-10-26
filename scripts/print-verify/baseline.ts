// ============================================================
// خطُّ الأساس — المطبوعُ بخياراته الافتراضيّة، بواجهاتٍ موجودةٍ قبل هذا التغيير
// ============================================================
/* يُحزَم مرّتين: من `main` ومن الفرع، ويُقارَن الناتجُ بايتاً ببايت.
   فلا يستعمل إلا ما كان قائماً قبل الختم والتوقيع — ليُبنى على الفرعين. */
import { writeFileSync } from "node:fs";
import { busesReportDocument, campsReportDocument, flightsReportDocument, hotelReportDocument, makeHTML,
         chromeFromOptions, initialPrintOptions, type PrintReportKey } from "../../src/print";
import { makePassengerStatementHTML, makeGroupStatementHTML, printFullReport, printPaymentsReport } from "../../src/components/finance/finance.print";

const [, , OUT] = process.argv;
const FIXED = new Date("2026-05-01T09:30:00Z").getTime();
const RealDate = Date;
class FixedDate extends RealDate {
  constructor(...a: ConstructorParameters<typeof Date>) { super(...((a.length ? a : [FIXED]) as [number])); }
  static now() { return FIXED; }
}
(globalThis as { Date: DateConstructor }).Date = FixedDate as unknown as DateConstructor;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const brand = { companyName: "حملة الاختبار للحج", tagline: "معاينة", primaryColor: "#6B1F3A", accentColor: "#085041" };
const season = { name: "موسم ١٤٤٨" };
const nm = (i: number) => `حاج تجريبي رقم ${i}`;
const pax = (n: number, extra: (i: number) => Any, start = 1): Any[] => Array.from({ length: n }, (_, k) => ({ id: start + k, name_ar: nm(start + k),
  short_ar: nm(start + k), passenger_type: "حاج", bus_sort_order: k, camp_arafa_sort_order: k, services: { hotel_type: "عادي", flight: "اقتصادية" }, ...extra(start + k) }));
const ch = (k: PrintReportKey) => chromeFromOptions(k, initialPrintOptions(k), { season });
const printed = (globalThis as { __printed?: string[] }).__printed ??= [];
const capture = (fn: () => void) => { printed.length = 0; fn(); return printed[printed.length - 1]; };
const put = (n: string, h: string) => writeFileSync(`${OUT}/${n}.html`, h);

put("bus-multi", busesReportDocument([{ id: 1, name: "١" } as Any, { id: 2, name: "٢" } as Any], pax(70, i => ({ bus_id: i % 2 + 1 })), brand, ch("bus")));
put("camp-arafa", campsReportDocument([{ id: 1, name: "أ", gender: "ذكر" } as Any], pax(40, () => ({ camp_arafa_id: 1 })), "عرفة", brand, ch("arafa")));
put("flights-multi", flightsReportDocument([{ id: 1, name: "QR1", date: "2026-05-20" } as Any, { id: 2, name: "QR2", date: "2026-05-21" } as Any],
  pax(50, i => ({ flight_id: i % 2 + 1 })), brand, ch("flights")));
for (const landscape of [false, true]) put(`hotel-${landscape ? "l" : "p"}`, hotelReportDocument(
  Array.from({ length: 20 }, (_, i) => ({ id: i + 1, number: String(101 + i), type: "خاص", capacity: 8, floor: "1" })) as Any,
  pax(160, i => ({ room_id: ((i - 1) % 20) + 1 })), brand, { landscape, chrome: ch("hotel") }));
put("pilgrims", makeHTML("كشف الحجاج", "<table><tr><td>١</td></tr></table>", brand, { chrome: ch("pilgrims") }));
put("plain", makeHTML("كشف الإداريين", "<table><tr><td>١</td></tr></table>", brand, { landscape: true }));
put("finance-full", capture(() => printFullReport(pax(40, () => ({})).map(p => ({ p, due: 100, paid: 50, balance: 50 })) as Any, {} as Any, brand, "ت", ch("finance"))));
put("finance-payments", capture(() => printPaymentsReport([{ key: "a", receiptNo: "1", name: "x", date: "2026-04-01", method: "نقدي", amount: 1, cancelled: false, notes: "" }] as Any,
  brand, "", "", ch("finance"))));
put("statement", makePassengerStatementHTML(pax(1, () => ({}))[0], {} as Any, {} as Any, [], [],
  [{ id: 1, passenger_id: 1, amount: 5, payment_date: "2026-01-01", method: "نقدي", notes: "" }] as Any, brand));
put("group-statement", makeGroupStatementHTML({ id: 1, name: "م" } as Any, pax(2, () => ({})), {} as Any, {} as Any, [], [], [], brand));
console.log("baseline written");
