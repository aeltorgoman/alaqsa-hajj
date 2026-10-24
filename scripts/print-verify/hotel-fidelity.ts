// ============================================================
// أمانةُ كرت الغرفة المطبوع — بياناتٌ اصطناعيّة واقعيّة
// ============================================================
/* يُحزَم من الفرع ومن `main` معاً (لا يستعمل إلا ما في الاثنين) ويكتب:
   مطبوعَ الفندق طوليّاً وعرضيّاً (والختمُ مشعَلاً في الفرع)، وبياناتِه
   (data.json) ليحسب `hotel-expected.ts` ما يعرضه كرتُ الشاشة.
   node hotel-fidelity.mjs <outDir> [seals] */
import { writeFileSync } from "node:fs";
import { hotelReportDocument, chromeFromOptions, initialPrintOptions } from "../../src/print";

const [, , OUT, SEALS] = process.argv;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const brand = { companyName: "حملة الاختبار للحج", tagline: "معاينة", primaryColor: "#6B1F3A", accentColor: "#085041" };
/* أسماءٌ عربيّةٌ طويلة كما في الجوازات، وبعضُها بمختصرٍ محفوظٍ طويلٍ أيضاً */
const FULL = [
  "عبد الرحمن بن محمد بن عبد العزيز آل عبد اللطيف", "محمد بن عبد الله بن سلطان بن خليفة آل ثاني",
  "عبد الله بن جاسم بن محمد بن حمد المريخي", "خليفة بن عبد العزيز بن ناصر بن علي الكواري",
  "إبراهيم بن عبد الرحيم بن يوسف بن إسماعيل الأنصاري", "سلطان بن فهد بن عبد المحسن بن مبارك الهاجري",
  "عبد العزيز بن أحمد بن عبد الرحمن بن صالح العبد الله", "يوسف بن محمد بن إبراهيم بن عبد الكريم المهندي",
  "ناصر بن حمد بن عبد الهادي بن مسفر القحطاني", "مبارك بن سعيد بن عبد الله بن راشد المري",
];
const SHORT = ["", "محمد عبد الله سلطان آل ثاني", "", "خليفة عبد العزيز الكواري", "", "سلطان فهد عبد المحسن الهاجري", "", "", "ناصر حمد القحطاني", ""];
/* الغرف: رباعيّةٌ بإشغال ١ و٢ و٣ و٤، وثلاثيّةٌ وثنائيّةٌ وفرديّة — دورٌ واحد،
   عشرون غرفة (ورقتان طوليّاً وعرضيّاً) */
const OCC = [4, 3, 2, 1, 4, 4, 3, 2, 4, 1, 3, 4, 2, 4, 4, 3, 1, 4, 2, 4];
const TYPE = (n: number, i: number) => (i % 7 === 3 ? (n <= 1 ? "فردية" : n === 2 ? "ثنائية" : "ثلاثية") : "رباعية");
const rooms = OCC.map((n, i) => ({ id: i + 1, number: String(101 + i), type: TYPE(n, i), capacity: null, floor: "1", hotel_id: 1 }));
const passengers: Any[] = [];
let id = 1;
OCC.forEach((n, i) => {
  for (let k = 0; k < n; k++) {
    const j = (i * 3 + k) % FULL.length;
    /* ترتيبُ الكرت (room_sort_order) معكوسٌ عن ترتيب القائمة — كموظّفٍ رتّبهم بالسحب */
    passengers.push({ id: id++, name_ar: FULL[j], short_ar: SHORT[j] || undefined, passenger_type: "حاج", room_id: i + 1,
      room_sort_order: (n - k) * 10, services: { hotel_type: "عادي" } });
  }
});
/* القائمةُ بترتيبٍ ثالث (بالاسم) — كما قد تصل من القاعدة */
passengers.sort((a, b) => a.name_ar.localeCompare(b.name_ar, "ar") || a.id - b.id);
writeFileSync(`${OUT}/data.json`, JSON.stringify({ rooms, passengers }));
const seal = (name: string, w: number, h: number) => ({ url: `https://seal.test/${name}.png`, width: w, height: h });
const seals = SEALS ? { stamp: seal("stamp", 1182, 1182), signature: seal("signature", 1180, 515) } : undefined;
for (const landscape of [false, true]) {
  const chrome = chromeFromOptions("hotel", { ...initialPrintOptions("hotel"), stamp: !!seals, signature: !!seals }, { seals } as Any);
  writeFileSync(`${OUT}/hotel-${landscape ? "landscape" : "portrait"}.html`,
    hotelReportDocument(rooms as Any, passengers, brand, { landscape, chrome }));
}
console.log("ok");
