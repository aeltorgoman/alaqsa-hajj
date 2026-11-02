// الإيصالُ (٢١٠ × ١٧٠مم أعلى A4 طوليّة) — سيناريوهاتٌ اصطناعيّة من بانيه الحقيقيّ، يطبعها `receipt-layout.mjs`
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
/* المتوقَّع مستقلٌّ عن البانيّ: الصحيحُ بلا كسور، والكسرُ بقيمته (قرشان) */
const AMT: Record<number, string> = { 1000: "1,000", 17500: "17,500", 125750: "125,750", 125750.5: "125,750.50", 5000: "5,000", 12500: "12,500",
  987654.32: "987,654.32", 40000: "40,000", 30000: "30,000", 20000: "20,000", 10000: "10,000", 50000: "50,000", 99999.99: "99,999.99", 3999999.99: "3,999,999.99", 24999.99: "24,999.99", 25000: "25,000", 1250: "1,250", 500: "500" };
const VERY_LONG = Array.from({ length: 6 }, () => LONG_AR).join("\n");
const grp = (n: number, each: number, long = false) => Array.from({ length: n }, (_, i) =>
  ({ name: long ? `${LONG_NAME} (${i + 1})` : `حاج ${i + 1} من العائلة`, amount: each }));
type Scen = { name: string; r: Any; seals?: "both" | "stamp" | "signature" | "none"; alloc?: { name: string; amount: number }[]; kind?: "standard" | "appendix" | "exceptional"; twoLineWords?: boolean };
const scen: Scen[] = [
  { name: "amount-1000", r: { total_amount: 1000 } },
  { name: "amount-17500", r: { total_amount: 17500, method: "تحويل بنكي" } },
  { name: "amount-125750", r: { total_amount: 125750, method: "شيك" } },
  { name: "amount-125750.50", r: { total_amount: 125750.5, method: "شيك" } },
  { name: "long-name", r: { payer_name: LONG_NAME, total_amount: 5000 } },
  { name: "longest-words", r: { total_amount: 3999999.99, method: "تحويل بنكي", notes: MIXED } },
  /* اصطناعيّ: يُضاعَف المبلغُ كتابةً في المتصفّح ليبلغ سطرين — أطولُ ما تُخرجه الدالّةُ يسعه سطرٌ واحد */
  { name: "two-line-words", r: { total_amount: 987654.32, method: "تحويل بنكي", notes: LONG_AR }, twoLineWords: true },
  { name: "empty-details", r: { notes: null, total_amount: 12500 } },
  { name: "long-arabic-details", r: { notes: LONG_AR, total_amount: 12500 } },
  { name: "mixed-details", r: { notes: MIXED, total_amount: 987654.32, method: "تحويل بنكي" } },
  { name: "assets-both", r: { notes: "دفعة نقدية" } },
  { name: "stamp-only", r: {}, seals: "stamp" },
  { name: "signature-only", r: {}, seals: "signature" },
  { name: "no-seals", r: { notes: "دفعة نقدية" }, seals: "none" },
  { name: "method-cash", r: { method: "نقدي" } },
  { name: "cancelled", r: { status: "cancelled", cancel_reason: "إدخالٌ مكرَّر" } },
  { name: "group-1", r: { group_name: "عائلة الهاجري", total_amount: 10000 }, alloc: grp(1, 10000) },
  { name: "group-2", r: { group_name: "عائلة الهاجري", total_amount: 20000, notes: LONG_AR }, alloc: grp(2, 10000) },
  { name: "group-3", r: { group_name: "عائلة الهاجري", total_amount: 30000, method: "تحويل بنكي" }, alloc: grp(3, 10000) },
  { name: "group-4", r: { group_name: "عائلة الهاجري", total_amount: 40000 }, alloc: grp(4, 10000) },
  /* أسوأُ الممكن في المقاس القياسيّ: ٤ حجّاجٍ بأسماء طويلة، ودافعٌ طويل، ومبلغٌ كتابتُه سطران، وتفاصيلُ ٣ أسطر */
  { name: "group-4-worst", r: { group_name: "عائلة الهاجري", payer_name: LONG_NAME, total_amount: 99999.99, method: "تحويل بنكي", notes: LONG_AR + "\n" + MIXED },
    alloc: [24999.99, 25000, 25000, 25000].map((amount, i) => ({ name: `${LONG_NAME} (${i + 1})`, amount })) },
  { name: "group-5", r: { group_name: "عائلة الهاجري", total_amount: 50000 }, alloc: grp(5, 10000), kind: "appendix" },
  { name: "group-24", r: { group_name: "مجموعة كبيرة", total_amount: 30000 }, alloc: grp(24, 1250), kind: "appendix" },
  { name: "group-60-long-names", r: { group_name: "مجموعة كبيرة", total_amount: 30000 }, alloc: grp(60, 500, true), kind: "appendix" },
  /* استثنائيّ: تفاصيلُ لا تسعها ١٧٠مم — يطول الصندوق ولا يُقصّ شيء */
  { name: "exceptional-details", r: { notes: VERY_LONG, total_amount: 17500 }, kind: "exceptional" },
];
const meta: Record<string, Any> = {};
for (const s of scen) {
  const which = s.seals ?? "both";
  const seals = which === "none" ? {} : which === "stamp" ? { stamp: seal("stamp") } : which === "signature" ? { signature: seal("signature") }
    : { stamp: seal("stamp"), signature: seal("signature") };
  const r = { ...base, ...s.r } as never;
  writeFileSync(`${OUT}/${s.name}.html`, makeReceiptHTML(r, brand, s.alloc ?? [], { seals }));
  const total = Number((s.r.total_amount as number) ?? base.total_amount);
  meta[s.name] = { expectWords: amountInArabicWords(total), expectAmount: AMT[total], seals: which, method: (s.r.method as string) ?? base.method,
    notes: ((s.r.notes as string) ?? "").trim() || null, payer: (s.r.payer_name as string) ?? base.payer_name,
    alloc: s.alloc ? s.alloc.length : 0, allocAmounts: (s.alloc ?? []).map(a => AMT[a.amount] ?? null), kind: s.kind ?? "standard", twoLineWords: !!s.twoLineWords };
}
writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta));
