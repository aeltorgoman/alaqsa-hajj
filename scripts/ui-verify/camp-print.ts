// قوائمُ المخيّمات المطبوعة — المخيّمُ الخاصّ «رجال ونساء» والعاديّ بجنسه (منى وعرفة)
//   node camp-print.cjs <outDir>
import { writeFileSync } from "node:fs";
import { campReportDocument, campsReportDocument } from "../../src/print";

const [, , OUT] = process.argv;
type Any = Record<string, unknown>;
const brand = { companyName: "حملة الاختبار", tagline: "", primaryColor: "#5d2222", accentColor: "#B08D3C", logoUrl: "", stampUrl: "", signatureUrl: "" };
const camps = [
  { id: 1, name: "خاص أول", gender: null, type: "خاص" }, // بلا جنس (20261107160000)
  { id: 4, name: "خاص قديم", gender: "أنثى", type: "خاص" }, // خاصٌّ بجنسٍ قديم — لا أثر له
  { id: 2, name: "عادي رجال", gender: "ذكر", type: "عادي" },
  { id: 3, name: "عادي نساء", gender: "أنثى", type: "عادي" },
] as Any[];
for (const [page, key] of [["منى", "camp_mina_id"], ["عرفة", "camp_arafa_id"]] as const) {
  const pax = [
    { id: 1, name_ar: "رجل في الخاص", short_ar: "رجل في الخاص", gender: "ذكر", [key]: 1 },
    { id: 2, name_ar: "امرأة في الخاص", short_ar: "امرأة في الخاص", gender: "أنثى", [key]: 1 },
    { id: 3, name_ar: "رجل عادي", short_ar: "رجل عادي", gender: "ذكر", [key]: 2 },
    { id: 4, name_ar: "امرأة عادية", short_ar: "امرأة عادية", gender: "أنثى", [key]: 3 },
  ].map((p, i) => ({ passenger_type: "حاج", sort_order: i + 1, services: {}, ...p })) as Any[];
  const tag = page === "منى" ? "mina" : "arafa";
  for (const c of camps) writeFileSync(`${OUT}/${tag}-camp-${c.id}.html`, campReportDocument(c as never, pax as never, page, brand as never));
  writeFileSync(`${OUT}/${tag}-all.html`, campsReportDocument(camps as never, pax as never, page, brand as never));
}
