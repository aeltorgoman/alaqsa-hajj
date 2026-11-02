// الإيصالُ (نصفُ A4 بالعرض) — سيناريوهاتٌ اصطناعيّة من بانيه الحقيقيّ، يطبعها `receipt-layout.mjs`
//   node receipt-layout.cjs <outDir> <sealsJSON>
import { writeFileSync } from "node:fs";
import { makeReceiptHTML } from "../../src/components/finance/finance.print";
import { amountInArabicWords } from "../../src/components/finance/amountInWords";

const [, , OUT, SEALS_JSON] = process.argv;
const S = JSON.parse(SEALS_JSON);
const seal = (n: "stamp" | "signature") => ({ url: `https://seal.test/${n}.png`, width: S[n].w, height: S[n].h });
const brand = { companyName: "حملة الأقصى", tagline: "لخدمات الحج والعمرة", primaryColor: "#5d2222", accentColor: "#7e73a5",
  logoUrl: "https://seal.test/logo.png", stampUrl: "", signatureUrl: "" };
type Any = Record<string, unknown>;
const base = { id: 1, season_id: 1, season_name: "موسم الحج ١٤٤٧هـ", receipt_number: 1001, issued_at: "2026-04-01T10:00:00Z",
  issued_by: "collector@test.local", group_name: null, total_amount: 1000, payer_name: "محمد علي سالم الهاجري",
  method: "نقدي", payment_date: "2026-04-01", notes: null, status: "active", cancel_reason: null, cancelled_at: null, cancelled_by: null };
const LONG_NAME = "عبد الرحمن بن محمد بن عبد الله بن إبراهيم آل ثاني الهاجري القحطاني";
const LONG_AR = "الدفعة الثانية من قيمة باقة الحج الاقتصادية لموسم ١٤٤٧هـ، وتشمل رسوم السكن في مكة المكرمة والمدينة المنورة والنقل الداخلي بين المشاعر، على أن يُسدَّد المتبقي قبل نهاية شهر شوال.";
const MIXED = "تحويل بنكي من QNB — Ref: TRX-2026-04-118 — دفعة مقدّمة للباقة VIP (Room 1201) حسب الاتفاق.";
const scen: { name: string; r: Any; seals?: "both" | "stamp" | "signature" | "none"; alloc?: { name: string; amount: number }[]; expect: string }[] = [
  { name: "amount-1000", r: { total_amount: 1000 }, expect: amountInArabicWords(1000) },
  { name: "amount-17500", r: { total_amount: 17500, method: "تحويل بنكي" }, expect: amountInArabicWords(17500) },
  { name: "amount-125750.50", r: { total_amount: 125750.5, method: "شيك" }, expect: amountInArabicWords(125750.5) },
  { name: "long-name", r: { payer_name: LONG_NAME, total_amount: 5000 }, expect: amountInArabicWords(5000) },
  { name: "long-arabic-details", r: { notes: LONG_AR, total_amount: 12500 }, expect: amountInArabicWords(12500) },
  { name: "mixed-details", r: { notes: MIXED, total_amount: 987654.32, method: "تحويل بنكي" }, expect: amountInArabicWords(987654.32) },
  { name: "no-seals", r: { notes: "دفعة نقدية" }, seals: "none", expect: amountInArabicWords(1000) },
  { name: "stamp-only", r: {}, seals: "stamp", expect: amountInArabicWords(1000) },
  { name: "signature-only", r: {}, seals: "signature", expect: amountInArabicWords(1000) },
  { name: "method-cash", r: { method: "نقدي" }, expect: amountInArabicWords(1000) },
  { name: "method-transfer", r: { method: "تحويل بنكي" }, expect: amountInArabicWords(1000) },
  { name: "method-cheque", r: { method: "شيك" }, expect: amountInArabicWords(1000) },
  { name: "cancelled", r: { status: "cancelled", cancel_reason: "إدخالٌ مكرَّر" }, expect: amountInArabicWords(1000) },
  { name: "group-5", r: { group_name: "عائلة الهاجري", total_amount: 50000 }, alloc: Array.from({ length: 5 }, (_, i) => ({ name: `حاج ${i + 1} من العائلة`, amount: 10000 })), expect: amountInArabicWords(50000) },
  { name: "group-24", r: { group_name: "مجموعة كبيرة", total_amount: 30000 }, alloc: Array.from({ length: 24 }, (_, i) => ({ name: `حاج تجريبي ${i + 1}`, amount: 1250 })), expect: amountInArabicWords(30000) },
];
const meta: Record<string, Any> = {};
for (const s of scen) {
  const which = s.seals ?? "both";
  const seals = which === "none" ? {} : which === "stamp" ? { stamp: seal("stamp") } : which === "signature" ? { signature: seal("signature") }
    : { stamp: seal("stamp"), signature: seal("signature") };
  const r = { ...base, ...s.r } as never;
  writeFileSync(`${OUT}/${s.name}.html`, makeReceiptHTML(r, brand, s.alloc ?? [], { seals }));
  meta[s.name] = { expectWords: s.expect, seals: which, method: (s.r.method as string) ?? base.method, notes: (s.r.notes as string) ?? null,
    payer: (s.r.payer_name as string) ?? base.payer_name, group: !!s.alloc };
}
writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta));
