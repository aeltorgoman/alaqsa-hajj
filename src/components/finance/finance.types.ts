// ============================================================
// أنواع البيانات المالية المشتركة
// ============================================================
import type { Passenger } from "../../types";

export type PricingMap = Record<string, { label: string; amount: number; type: string }>;
/* ═══ الإيصالُ أبٌ وسطورُ الدفعِ توزيعُه ═══
   إيصالٌ فرديّ → سطرٌ واحد · إيصالُ مجموعة → سطورٌ عدّة برقمٍ واحد.
   و`total_amount` مبلغٌ تاريخيٌّ **لا يُحسَب** من السطورِ الباقية. */
export type ReceiptStatus = "valid" | "cancelled";
export type PaymentReceipt = {
  id: number; season_id: number; season_name: string; receipt_number: number;
  issued_at: string; issued_by?: string | null; group_name?: string | null;
  total_amount: number; payer_name: string; method: string; payment_date: string;
  notes?: string | null; status: ReceiptStatus;
  cancel_reason?: string | null; cancelled_at?: string | null; cancelled_by?: string | null;
};

/* `receipt` يأتي مُضمَّناً من PostgREST في نفسِ استعلامِ الدفعات، فلا
   ربطَ يدويٌّ ولا تمريرَ خريطةٍ إلى كلِّ دالّةِ حساب. ويكون `null`
   للدفعاتِ السابقةِ لهذه المرحلة — وهي صالحةٌ كما هي. */
export type Payment = { id: number; passenger_id: number; amount: number; payment_date: string; method: string; notes?: string; created_by?: string; created_at: string; receipt_id?: number | null; receipt?: PaymentReceipt | null };
export type CustomCharge = { id: number; passenger_id: number; description: string; amount: number; type: "إضافة" | "خصم"; notes?: string; created_by?: string; created_at: string };
export type FinancialGroup = { id: number; name: string; notes?: string; created_by?: string; created_at: string };
export type FinancialGroupMember = { id: number; group_id: number; passenger_id: number };

// حالات فلتر القائمة الرئيسية
export type FinanceFilterStatus = "all" | "paid" | "partial" | "unpaid" | "unpriced" | "credit";

// ترتيب القائمة الرئيسية — العمود واتّجاهه
export type FinanceSortKey = "manual" | "name" | "due" | "paid" | "balance";
export type FinanceSortDir = "asc" | "desc";

// نموذج الدفعة المشتركة على أعضاء المجموعة
export type GroupPayForm = { amount: string; payment_date: string; method: string; notes: string };

// نموذج تسجيل دفعة فردية
export type PayForm = { amount: string; payment_date: string; method: string; notes: string };

// نموذج البند الخاص / الخصم، وأخطاء التحقق المقابلة له
export type ChargeForm = { description: string; amount: string; notes: string };
export type ChargeErrors = { description: boolean; amount: boolean };

// صف واحد كما يرد من جدول pricing_settings
export type PricingRow = { key: string; label: string; amount: number | string; type: string };

// نتيجة create_financial_group_with_member — المجموعة وأول عضو معاً
export type CreatedGroupWithMember = { group: FinancialGroup; member: FinancialGroupMember };

// مصادر البيانات تقبل مصفوفة أو خريطة مُجهّزة مسبقاً لتسريع الحساب
export type ChargeSource  = CustomCharge[] | Map<number, CustomCharge[]>;
export type PaymentSource = Payment[]      | Map<number, Payment[]>;

// بيانات هوية الشركة المستخدمة في صفحات الطباعة
export type PrintBrand = {
  logoUrl: string;
  companyName: string;
  tagline: string;
  primaryColor: string;
  accentColor: string;
};

// صف واحد في التقارير المالية المجمّعة
export type FinanceRow = { p: Passenger; due: number; paid: number; balance: number };

// تجميع التدفق النقدي حسب التاريخ
export type CashflowByDate = Record<string, { total: number; count: number; methods: Record<string, number> }>;

// المطلوب والمدفوع والمتبقّي لحاجٍّ واحد (يحسبها `totalsFor`)
export type FinanceTotals = { due: number; paid: number; balance: number };

/* تصنيفُ الكيان المُسنَد (id → type) للباص والمخيّم والغرفة — يُجلب
   `id,type` وحدهما، ولا يدخل أيّ حساب. */
export type AllocTypeMaps = {
  bus:  Map<number, string>;
  camp: Map<number, string>;
  room: Map<number, string>;
};
