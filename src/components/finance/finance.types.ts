// ============================================================
// أنواع البيانات المالية المشتركة
// ============================================================
import type { Passenger } from "../../types";

export type PricingMap = Record<string, { label: string; amount: number; type: string }>;
export type Payment = { id: number; passenger_id: number; amount: number; payment_date: string; method: string; notes?: string; created_by?: string; created_at: string };
export type CustomCharge = { id: number; passenger_id: number; description: string; amount: number; type: "إضافة" | "خصم"; notes?: string; created_by?: string; created_at: string };
export type FinancialGroup = { id: number; name: string; notes?: string; created_by?: string; created_at: string };
export type FinancialGroupMember = { id: number; group_id: number; passenger_id: number };

// حالات فلتر القائمة الرئيسية
export type FinanceFilterStatus = "all" | "paid" | "partial" | "unpaid" | "unpriced" | "credit";

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
