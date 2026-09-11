// ============================================================
// دوال وثوابت الحسابات المالية (بدون React ولا JSX)
// ============================================================
import type { Passenger } from "../../types";
import type { PricingMap, CustomCharge, Payment, ChargeSource, PaymentSource, FinanceTotals, FinanceSortKey, FinanceSortDir } from "./finance.types";

export const PRICING_KEYS = [
  { key: "package_double",     label: "باقة ثنائي",        type: "package"  },
  { key: "package_triple",     label: "باقة ثلاثي",        type: "package"  },
  { key: "package_quad",       label: "باقة رباعي",        type: "package"  },
  { key: "package_suite",      label: "باقة فردية",        type: "package"  },
  { key: "addon_view",         label: "إضافة مطلة",        type: "addon"    },
  { key: "addon_mina",         label: "خيمة خاصة - منى",  type: "addon"    },
  { key: "addon_arafa",        label: "خيمة خاصة - عرفة", type: "addon"    },
  { key: "addon_bus_vip",      label: "باص VIP",           type: "addon"    },
  { key: "addon_first_class",  label: "طيران درجة أولى",   type: "addon"    },
  { key: "discount_no_ticket", label: "خصم بدون تذكرة",    type: "discount" },
];

// تهريب الرموز الخاصة قبل إدراج القيم داخل صفحات الطباعة
export function esc(value: unknown): string {
  return String(value ?? "")
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;")
    .split('"').join("&quot;")
    .split("'").join("&#039;");
}

// يعيد null إذا كان نوع الإقامة غير معروف — لا يُفترض سعر تلقائياً
export function getPackageKey(hotel_type: string): string | null {
  if (hotel_type === "ثنائية") return "package_double";
  if (hotel_type === "ثلاثية") return "package_triple";
  if (hotel_type === "رباعية") return "package_quad";
  if (hotel_type === "فردية")  return "package_suite";
  return null;
}

/* الدرجة التجاريّة للطيران — **المصدر الوحيد للتسعير**.
   `services.flight` هي الخدمة المطلوبة/المدفوعة: قرارٌ تجاريّ يتّخذه
   الحاجّ عند التسجيل، ولا يكتبها أيّ مسارٍ تشغيليّ.
   أمّا `passengers.flight_class` فحالةُ حجزٍ مشتقّة: تشتقّها القاعدة
   من المدفوع عند وجود ساق، وتمحوها إذا خلت الساقان. فلا يُبنى عليها
   سعرٌ أبداً — وإلّا تحرّك المال بفعلِ توزيعٍ لا علاقة له به. */
export function paidFlightService(p: Passenger): "عادي" | "درجة أولى" | "بدون" {
  const v = p.services?.flight;
  if (v === "درجة أولى") return "درجة أولى";
  if (v === "بدون")      return "بدون";
  return "عادي";
}

// السعر يدوي لو الإقامة "خاص"، غير كده بياخد سعر الباقة الثابتة
export function getPriceInfo(s: Passenger["services"], pricing: PricingMap): { label: string; amount: number; unpriced?: boolean } {
  if (s.hotel_type === "خاص") {
    return { label: "سعر خاص", amount: Number(s.custom_price) || 0 };
  }
  const key = getPackageKey(s.hotel_type);
  if (!key) return { label: "الباقة غير محددة", amount: 0, unpriced: true };
  return { label: pricing[key]?.label || "الباقة الأساسية", amount: pricing[key]?.amount || 0 };
}

export function chargesFor(passengerId: number, src: ChargeSource): CustomCharge[] {
  return src instanceof Map ? (src.get(passengerId) ?? []) : src.filter(c => c.passenger_id === passengerId);
}

export function paymentsFor(passengerId: number, src: PaymentSource): Payment[] {
  return src instanceof Map ? (src.get(passengerId) ?? []) : src.filter(p => p.passenger_id === passengerId);
}

export function calcTotalDue(p: Passenger, pricing: PricingMap, custom: ChargeSource): number {
  const s = p.services;
  let total = getPriceInfo(s, pricing).amount;
  if (s.hotel_view === "مطلة") total += pricing["addon_view"]?.amount    || 0;
  if (s.camp_mina === "خاص")  total += pricing["addon_mina"]?.amount    || 0;
  if (s.camp_arafa === "خاص") total += pricing["addon_arafa"]?.amount   || 0;
  if (s.bus === "VIP")         total += pricing["addon_bus_vip"]?.amount || 0;
  const flightPaid = paidFlightService(p);
  if (flightPaid === "درجة أولى") total += pricing["addon_first_class"]?.amount  || 0;
  if (flightPaid === "بدون")      total -= pricing["discount_no_ticket"]?.amount || 0;
  chargesFor(p.id, custom).forEach(c => {
    if (c.type === "إضافة") total += c.amount; else total -= c.amount;
  });
  return Math.max(0, total);
}

export function calcTotalPaid(passengerId: number, payments: PaymentSource): number {
  return paymentsFor(passengerId, payments).reduce((s, p) => s + Number(p.amount), 0);
}

export function fmtAmt(n: number): string {
  return n.toLocaleString("ar-QA", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function financeStatus(due: number, paid: number) {
  if (due <= 0 && paid <= 0)  return { label: "غير مسعّر",  color: "var(--text-muted)", bg: "var(--bg-2)"       };
  if (paid > due)             return { label: "رصيد دائن",  color: "var(--info)",       bg: "var(--info-bg)"    };
  if (paid >= due && due > 0) return { label: "مسدد",       color: "var(--success)",    bg: "var(--success-bg)" };
  if (paid > 0)               return { label: "جزئي",       color: "var(--warning)",    bg: "var(--warning-bg)" };
  return                             { label: "لم يدفع",    color: "var(--danger)",     bg: "var(--danger-bg)"  };
}

/* المطلوب والمدفوع والمتبقّي في مرورٍ واحد — فلا تُنادى `calcTotalDue`
   أربع مرّاتٍ لكل صفّ في كل رسمة. الحساب نفسه لا يتغيّر: هي تستدعيه. */
export function totalsFor(p: Passenger, pricing: PricingMap, charges: ChargeSource, payments: PaymentSource): FinanceTotals {
  const due  = calcTotalDue(p, pricing, charges);
  const paid = calcTotalPaid(p.id, payments);
  return { due, paid, balance: due - paid };
}

/* البحث بالاسم والجواز والبطاقة والهاتف — بنهج صفحة الحجاج نفسه
   (`PassengersPage` السطر ٥١٤-٥١٧)، فلا سلوكَ بحثٍ ثانٍ يتعلّمه الموظّف. */
export function matchesFinanceSearch(p: Passenger, term: string): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  const name = `${p.name_ar ?? ""} ${p.name_en ?? ""} ${p.short_ar ?? ""} ${p.short_en ?? ""}`.toLowerCase();
  const docs = `${p.passport ?? ""} ${p.national_id ?? ""} ${p.phone ?? ""}`.toLowerCase();
  return name.includes(q) || docs.includes(q);
}

/* ترتيب صفوف القائمة — `manual` هو الترتيب المعتمَد كما وصل (sort_order
   ثم id)، فلا يُعاد فرزه هنا بل يُعكَس عند الطلب. وبقيّة المفاتيح عرضٌ
   لا تمسّ ترتيباً محفوظاً. و`id` يحسم التعادل فالنتيجة محدَّدة. */
export function sortFinanceRows(
  rows: Passenger[], totals: Map<number, FinanceTotals>, key: FinanceSortKey, dir: FinanceSortDir,
): Passenger[] {
  if (key === "manual") return dir === "asc" ? rows : [...rows].reverse();
  const sign = dir === "asc" ? 1 : -1;
  const amount = (p: Passenger) => {
    const t = totals.get(p.id);
    if (key === "due")  return t?.due  ?? 0;
    if (key === "paid") return t?.paid ?? 0;
    return t?.balance ?? 0;
  };
  return [...rows].sort((a, b) => key === "name"
    ? sign * (a.short_ar || a.name_ar || "").localeCompare(b.short_ar || b.name_ar || "", "ar") || a.id - b.id
    : sign * (amount(a) - amount(b)) || a.id - b.id);
}
