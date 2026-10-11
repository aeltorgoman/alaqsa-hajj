// ============================================================
// دوال وثوابت الحسابات المالية (بدون React ولا JSX)
// ============================================================
import type { Passenger } from "../../types";
import type { PricingMap, HotelPackagePrices, HotelPackagePriceRow, FinanceHotel, CustomCharge, Payment, ChargeSource, PaymentSource, FinanceTotals, FinanceSortKey, FinanceSortDir } from "./finance.types";

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

/* MOD-001: ما يُسعَّر لكلّ فندقٍ في `hotel_package_prices` — الباقاتُ الأربع
   ورسمُ الإطلالة (M5). وبقيّةُ الإضافات والخصمُ عامّةٌ في `pricing_settings`. */
export const HOTEL_PRICE_KEYS = [
  ...PRICING_KEYS.filter(k => k.type === "package"),
  { key: "addon_view", label: "رسم الإطلالة (مطلة)", type: "addon" },
];

/* تهريبُ الرموز الخاصّة — تطبيقٌ واحدٌ في النظام.
   كان هنا تطبيقٌ ثانٍ بـ`split/join` يطابق المشتركَ حرفاً، فصار
   إعادةَ تصديرٍ فلا تطبيقان يفترقان يوماً بإصلاحٍ في أحدهما. */
export { esc } from "../../print";

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

export function hotelPricesFromRows(rows: HotelPackagePriceRow[]): HotelPackagePrices {
  const m: HotelPackagePrices = new Map();
  for (const r of rows) {
    const byKey = m.get(r.hotel_id) ?? {};
    byKey[r.package_key] = Number(r.amount);
    m.set(r.hotel_id, byKey);
  }
  return m;
}

/* سعرُ الباقة الأساسيّ — MOD-001 PR 8.
   «خاص» سعرُه يدويّ كما كان. وغيرُه = سعرُ نوع الباقة في **الفندق المطلوب**
   (`requested_hotel_id`) من `hotel_package_prices`:
     · لا فندقٌ مطلوب، أو لا صفَّ للباقة في فندقه ← صفر، بلا رجوعٍ إلى
       `pricing_settings` ولا إلى فندقٍ آخر (D6). والصفرُ الصريحُ صحيح.
     · الغرفةُ المُسنَدة وفندقُها لا يدخلان السعرَ أبداً: النقلُ لا يحرّك مالاً.
   والتسميةُ تسميةُ الباقة من إعداد الشركة كما كانت. */
/** تسميةُ باقة الحاجّ وحدها (بلا مبلغ) — للجداول والتقارير التي تعرض الاسم. */
export function packageLabel(p: Passenger, pricing: PricingMap): string {
  if (p.services.hotel_type === "خاص") return "سعر خاص";
  const key = getPackageKey(p.services.hotel_type);
  if (!key) return "الباقة غير محددة";
  return pricing[key]?.label || PRICING_KEYS.find(k => k.key === key)?.label || "الباقة الأساسية";
}

/** اسمُ الفندق المطلوب للعرض في الحسابات — أساسُ السعر. */
export function requestedHotelName(p: Passenger, hotels: FinanceHotel[]): string | null {
  const id = p.requested_hotel_id ?? null;
  if (id == null) return null;
  return hotels.find(h => h.id === id)?.name ?? `فندق #${id}`;
}

export function getPriceInfo(p: Passenger, pricing: PricingMap, hotelPrices: HotelPackagePrices): { label: string; amount: number; unpriced?: boolean; noHotel?: boolean; missingPrice?: boolean } {
  const s = p.services;
  const label = packageLabel(p, pricing);
  if (s.hotel_type === "خاص") {
    return { label, amount: Number(s.custom_price) || 0 };
  }
  const key = getPackageKey(s.hotel_type);
  if (!key) return { label, amount: 0, unpriced: true };
  const hotelId = p.requested_hotel_id ?? null;
  if (hotelId == null) return { label, amount: 0, noHotel: true };
  const amount = hotelPrices.get(hotelId)?.[key];
  if (amount === undefined) return { label, amount: 0, missingPrice: true };
  return { label, amount };
}

/* رسمُ الإطلالة — MOD-001 M5: «مطلة» تُضيف رسمَ **الفندق المطلوب**
   (`hotel_package_prices.addon_view`)، و«غير مطلة» صفر. لا فندقٌ مطلوب أو
   لا صفّ ← صفر بلا رجوعٍ إلى السعر العامّ، والصفرُ الصريحُ صحيح. والغرفةُ
   المُسنَدة لا تدخل: النقلُ لا يحرّك مالاً. */
export const VIEW_KEY = "addon_view";
export function viewSurcharge(p: Passenger, hotelPrices: HotelPackagePrices): number {
  if (p.services.hotel_view !== "مطلة") return 0;
  const hotelId = p.requested_hotel_id ?? null;
  if (hotelId == null) return 0;
  return hotelPrices.get(hotelId)?.[VIEW_KEY] ?? 0;
}

/* ملخّص الإضافات: صفٌّ لكلّ إضافةٍ بسعرها العامّ، والإطلالةُ صفٌّ لكلّ فندقٍ
   مطلوب برسمه — مصدرٌ واحدٌ للشاشة والطباعة، والمجموعُ من الصفوف نفسها. */
export type AddonReportRow = { key: string; label: string; count: number; price: number; total: number; isDiscount: boolean };
export function addonReportRows(passengers: Passenger[], pricing: PricingMap, hotelPrices: HotelPackagePrices, hotels: FinanceHotel[]): AddonReportRow[] {
  const rows: AddonReportRow[] = [];
  for (const a of SERVICE_FILTERS) {
    const ps = passengers.filter(a.check);
    const isDiscount = a.key === "discount_no_ticket";
    if (a.key !== VIEW_KEY) {
      const price = pricing[a.key]?.amount || 0;
      rows.push({ key: a.key, label: serviceLabel(a.key, pricing), count: ps.length, price, total: ps.length * price, isDiscount });
      continue;
    }
    const groups = new Map<number | null, Passenger[]>();
    ps.forEach(p => { const h = p.requested_hotel_id ?? null; groups.set(h, [...(groups.get(h) ?? []), p]); });
    const order = (id: number | null) => { const i = hotels.findIndex(h => h.id === id); return id == null ? Number.MAX_SAFE_INTEGER : i < 0 ? hotels.length : i; };
    const keys = [...groups.keys()].sort((x, y) => order(x) - order(y));
    if (keys.length === 0) keys.push(null);
    for (const h of keys) {
      const g = groups.get(h) ?? [];
      const price = h == null ? 0 : (hotelPrices.get(h)?.[VIEW_KEY] ?? 0);
      const name = h == null ? "بلا فندق مطلوب" : (hotels.find(x => x.id === h)?.name ?? `فندق #${h}`);
      rows.push({ key: `${VIEW_KEY}:${h ?? "none"}`, label: `${serviceLabel(VIEW_KEY, pricing)} · ${name}`, count: g.length, price, total: g.length * price, isDiscount });
    }
  }
  return rows;
}

/* تقرير الباقات: صفٌّ لكلّ (باقة × فندقٍ مطلوب) بسعره الواحد، و«خاص»
   مجموعُ أسعاره اليدويّة — مصدرٌ واحدٌ للشاشة والطباعة، والإجماليُّ
   يُجمَع من الصفوف نفسها فيطابق `calcTotalDue` في الأساس. */
export type PackageReportRow = { key: string; label: string; count: number; price: number | null; total: number };
export function packageReportRows(passengers: Passenger[], pricing: PricingMap, hotelPrices: HotelPackagePrices, hotels: FinanceHotel[]): PackageReportRow[] {
  const hotelName = (id: number | null) => id == null ? "بلا فندق مطلوب" : (hotels.find(h => h.id === id)?.name ?? `فندق #${id}`);
  const hotelOrder = (id: number | null) => { const i = hotels.findIndex(h => h.id === id); return id == null ? Number.MAX_SAFE_INTEGER : i < 0 ? hotels.length : i; };
  const rows: PackageReportRow[] = [];
  PRICING_KEYS.filter(k => k.type === "package").forEach(pk => {
    const groups = new Map<number | null, Passenger[]>();
    passengers.filter(p => !isSpecialPackage(p) && getPackageKey(p.services.hotel_type) === pk.key).forEach(p => {
      const h = p.requested_hotel_id ?? null;
      groups.set(h, [...(groups.get(h) ?? []), p]);
    });
    [...groups.keys()].sort((a, b) => hotelOrder(a) - hotelOrder(b)).forEach(h => {
      const ps = groups.get(h)!;
      const price = getPriceInfo(ps[0], pricing, hotelPrices).amount;
      rows.push({ key: `${pk.key}:${h ?? "none"}`, label: `${pricing[pk.key]?.label || pk.label} · ${hotelName(h)}`, count: ps.length, price, total: ps.length * price });
    });
  });
  const special = passengers.filter(isSpecialPackage);
  if (special.length > 0) {
    rows.push({ key: "special", label: SPECIAL_PACKAGE_LABEL, count: special.length, price: null, total: special.reduce((s, p) => s + (Number(p.services.custom_price) || 0), 0) });
  }
  return rows;
}

export function chargesFor(passengerId: number, src: ChargeSource): CustomCharge[] {
  return src instanceof Map ? (src.get(passengerId) ?? []) : src.filter(c => c.passenger_id === passengerId);
}

export function paymentsFor(passengerId: number, src: PaymentSource): Payment[] {
  return src instanceof Map ? (src.get(passengerId) ?? []) : src.filter(p => p.passenger_id === passengerId);
}

export function calcTotalDue(p: Passenger, pricing: PricingMap, hotelPrices: HotelPackagePrices, custom: ChargeSource): number {
  const s = p.services;
  let total = getPriceInfo(p, pricing, hotelPrices).amount;
  total += viewSurcharge(p, hotelPrices);
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

/* ⚠️ سطرُ التوزيعِ التابعُ لإيصالٍ **ملغىً** لا يُحتسَب مدفوعاً — وهو
   باقٍ في القاعدةِ ولم يُحذف، فالأثرُ محفوظٌ والرقمُ مشغول. وحالةُ
   الأبِ تأتي مُضمَّنةً مع الصفّ، فلا استعلامَ ثانيَ هنا.
   والدفعاتُ السابقةُ لهذه المرحلة بلا إيصالٍ فتُحتسَب كما كانت. */
export function isPaymentCounted(p: Payment): boolean {
  return p.receipt?.status !== "cancelled";
}

export function calcTotalPaid(passengerId: number, payments: PaymentSource): number {
  return paymentsFor(passengerId, payments)
    .filter(isPaymentCounted)
    .reduce((s, p) => s + Number(p.amount), 0);
}

/* ═══ تاريخُ اليومِ بتقويمِ الجهاز، لا بـUTC ═══
   كان الافتراضيُّ `new Date().toISOString().split("T")[0]` — و`toISOString`
   **UTC دائماً**. فالإيصال #1001 صدر عند ٠١:٢٠ بتوقيتِ قطر يومَ ٢٧، أي
   ٢٢:٢٠ UTC يومَ ٢٦، فخرج مؤرَّخاً بالأمس. وكلُّ دفعةٍ بين منتصفِ الليلِ
   والثالثةِ فجراً بتوقيتِ قطر (UTC+3) كانت تُؤرَّخ باليومِ السابق.

   والإيصالُ وثيقةٌ ماليّة: تاريخُه يومُ الصندوقِ حيث يقف المُحصِّل، فيُبنى
   من مكوّناتِ التاريخِ المحلّيّة. والعمودُ `date` بلا منطقةٍ زمنيّة،
   فيُحفَظ النصُّ كما هو ولا يتحوّل في القاعدة. */
export function localDateISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
export function totalsFor(p: Passenger, pricing: PricingMap, hotelPrices: HotelPackagePrices, charges: ChargeSource, payments: PaymentSource): FinanceTotals {
  const due  = calcTotalDue(p, pricing, hotelPrices, charges);
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

/* ═══ الخدمات المطلوبة — مصدرٌ واحد للفلتر وللتقارير ═══
   المفاتيح مفاتيحُ `pricing_settings` نفسها، والتسميةُ تُقرأ منها حيّةً
   فلا تنحرف عن إعداد الشركة. والشروط هي شروطُ `calcTotalDue` حرفياً:
   خدمةٌ مطلوبة (`services`) لا إسنادٌ فعليّ. */
export const SERVICE_FILTERS: { key: string; check: (p: Passenger) => boolean }[] = [
  { key: "addon_view",         check: p => p.services.hotel_view === "مطلة" },
  { key: "addon_mina",         check: p => p.services.camp_mina  === "خاص"  },
  { key: "addon_arafa",        check: p => p.services.camp_arafa === "خاص"  },
  { key: "addon_bus_vip",      check: p => p.services.bus        === "VIP"  },
  { key: "addon_first_class",  check: p => paidFlightService(p)  === "درجة أولى" },
  { key: "discount_no_ticket", check: p => paidFlightService(p)  === "بدون" },
];

/** تسمية الخدمة كما في إعداد الشركة، وإلّا فالتسمية المعيارية. */
export function serviceLabel(key: string, pricing: PricingMap): string {
  return pricing[key]?.label || PRICING_KEYS.find(k => k.key === key)?.label || key;
}

export function matchesServiceFilter(p: Passenger, value: string): boolean {
  if (value === "all") return true;
  return SERVICE_FILTERS.find(f => f.key === value)?.check(p) ?? true;
}

/* الإقامة «خاص» ليست مفتاحَ باقةٍ في `pricing_settings` — سعرُها يدويّ
   في `services.custom_price`، ولهذا تُرجِع `getPackageKey` لها `null`.
   فلها قيمةُ فلترٍ خاصّةٌ بها لا مفتاحٌ مُختَرعٌ في القاعدة. */
export const SPECIAL_PACKAGE_VALUE = "special";
export const SPECIAL_PACKAGE_LABEL = "سعر خاص";

export function isSpecialPackage(p: Passenger): boolean {
  return p.services.hotel_type === "خاص";
}

export function matchesPackageFilter(p: Passenger, value: string): boolean {
  if (value === "all") return true;
  if (value === SPECIAL_PACKAGE_VALUE) return isSpecialPackage(p);
  return getPackageKey(p.services.hotel_type) === value;
}
