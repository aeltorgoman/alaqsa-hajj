// «تفاصيل الدفعة» في نموذجَي تسجيل الدفعة (الفرديّة والمشتركة) — حقلُ `notes` نفسُه
// بلا عمودٍ جديد: `issue_payment_receipt` تجمّده في `payment_receipts.notes` ويُطبع في
// الإيصال تحت المبلغ وطريقة الدفع. نصٌّ متعدّد الأسطر، عربيٌّ أو إنجليزيٌّ (`dir="auto"`).
import type { CSSProperties } from "react";

export const PAYMENT_DETAILS_LABEL = "تفاصيل الدفعة (اختياري)";

export function PaymentDetailsField({ value, onChange, style }: { value: string; onChange: (v: string) => void; style: CSSProperties }) {
  return (
    <label style={{ display: "block", marginBottom: 16 }}>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>{PAYMENT_DETAILS_LABEL}</div>
      <textarea
        rows={3}
        dir="auto"
        name="payment-details"
        placeholder="مثال: الدفعة الثانية من قيمة الباقة — تحويل رقم ..."
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ ...style, minHeight: 72, resize: "vertical", lineHeight: 1.6, fontFamily: "var(--font-body)", unicodeBidi: "plaintext" }}
      />
    </label>
  );
}
