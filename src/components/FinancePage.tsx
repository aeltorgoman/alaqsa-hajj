import { useState, useEffect } from "react";
import { AlertModal, useAlert } from "./AlertModal";
import { supabase } from "../supabase";
import { useConfig } from "../config/ConfigContext";
import type { Passenger, User } from "../types";

// ============================================================
// أنواع البيانات
// ============================================================
type PricingMap = Record<string, { label: string; amount: number; type: string }>;
type Payment = { id: number; passenger_id: number; amount: number; payment_date: string; method: string; notes?: string; created_by?: string; created_at: string };
type CustomCharge = { id: number; passenger_id: number; description: string; amount: number; type: "إضافة" | "خصم"; notes?: string; created_by?: string; created_at: string };
type FinancialGroup = { id: number; name: string; notes?: string; created_by?: string; created_at: string };
type FinancialGroupMember = { id: number; group_id: number; passenger_id: number };

const PRICING_KEYS = [
  { key: "package_double",     label: "باقة ثنائي",        type: "package"  },
  { key: "package_triple",     label: "باقة ثلاثي",        type: "package"  },
  { key: "package_quad",       label: "باقة رباعي",        type: "package"  },
  { key: "package_suite",      label: "باقة سويت",         type: "package"  },
  { key: "addon_view",         label: "إضافة مطلة",        type: "addon"    },
  { key: "addon_mina",         label: "خيمة خاصة - منى",  type: "addon"    },
  { key: "addon_arafa",        label: "خيمة خاصة - عرفة", type: "addon"    },
  { key: "addon_bus_vip",      label: "باص VIP",           type: "addon"    },
  { key: "addon_first_class",  label: "طيران درجة أولى",   type: "addon"    },
  { key: "discount_no_ticket", label: "خصم بدون تذكرة",    type: "discount" },
];

function getPackageKey(hotel_type: string): string {
  if (hotel_type === "ثنائية") return "package_double";
  if (hotel_type === "ثلاثية") return "package_triple";
  if (hotel_type === "رباعية") return "package_quad";
  if (hotel_type === "سويت")   return "package_suite";
  return "package_double";
}

function calcTotalDue(p: Passenger, pricing: PricingMap, custom: CustomCharge[]): number {
  const s = p.services;
  let total = pricing[getPackageKey(s.hotel_type)]?.amount || 0;
  if (s.hotel_view === "مطلة") total += pricing["addon_view"]?.amount    || 0;
  if (s.camp_mina === "خاص")  total += pricing["addon_mina"]?.amount    || 0;
  if (s.camp_arafa === "خاص") total += pricing["addon_arafa"]?.amount   || 0;
  if (s.bus === "VIP")         total += pricing["addon_bus_vip"]?.amount || 0;
  if ((p as any).flight_class === "درجة أولى") total += pricing["addon_first_class"]?.amount  || 0;
  if ((p as any).flight_class === "بدون")      total -= pricing["discount_no_ticket"]?.amount || 0;
  custom.filter(c => c.passenger_id === p.id).forEach(c => {
    if (c.type === "إضافة") total += c.amount; else total -= c.amount;
  });
  return Math.max(0, total);
}

function calcTotalPaid(passengerId: number, payments: Payment[]): number {
  return payments.filter(p => p.passenger_id === passengerId).reduce((s, p) => s + Number(p.amount), 0);
}

function fmtAmt(n: number): string {
  return n.toLocaleString("ar-QA", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function financeStatus(due: number, paid: number) {
  if (paid >= due && due > 0) return { label: "مسدد",    color: "#2A9D8F", bg: "rgba(42,157,143,0.1)"  };
  if (paid > 0)               return { label: "جزئي",    color: "#E8951A", bg: "rgba(232,149,26,0.1)"  };
  return                             { label: "لم يدفع", color: "#C0392B", bg: "rgba(192,57,43,0.1)"   };
}

function printInPage(html: string) {
  const existing = document.getElementById("__print_frame__");
  if (existing) existing.remove();
  const iframe = document.createElement("iframe");
  iframe.id = "__print_frame__";
  iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:210mm;height:297mm;border:none;";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) return;
  doc.open(); doc.write(html); doc.close();
  setTimeout(() => { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); }, 600);
}

function downloadAsPDF(html: string, filename: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ============================================================
// HTML نظيف للتقارير المالية (بدون نقوش)
// ============================================================
function makeFinanceHTML(
  title: string, body: string, landscape = false,
  logoUrl = "", companyName = "حملة الأقصى", tagline = "",
  primaryColor = "#6B1F3A", accentColor = "#0C447C"
): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString("ar-EG", { year:"numeric", month:"long", day:"numeric" });
  const timeStr = now.toLocaleTimeString("ar-EG", { hour:"2-digit", minute:"2-digit" });
  const logoHtml = logoUrl ? `<img src="${logoUrl}" alt="logo" />` : `<span>${(companyName||"ح").trim().charAt(0)}</span>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  @page { size: A4 ${landscape?"landscape":"portrait"}; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Tajawal','Arial',sans-serif; direction: rtl; margin: 0; padding: 0; font-size: 13px; color: #1c1c1c; background: #fff; }
  .doc-header { display:flex; align-items:center; justify-content:space-between; padding-bottom:12px; border-bottom:3px solid ${primaryColor}; margin-bottom:6px; }
  .logo-box { width:72px; height:72px; border-radius:10px; overflow:hidden; display:flex; align-items:center; justify-content:center; background:${primaryColor}; color:#fff; font-size:28px; font-weight:700; flex-shrink:0; }
  .logo-box img { width:100%; height:100%; object-fit:contain; background:#fff; }
  .company-name { font-size:17px; font-weight:700; color:${primaryColor}; }
  .tagline { font-size:11px; color:#888; margin-top:2px; }
  .doc-title-bar { background:linear-gradient(135deg,${primaryColor},${accentColor}); color:#fff; text-align:center; padding:10px; border-radius:8px; font-size:18px; font-weight:700; margin:12px 0 16px; }
  table { width:100%; border-collapse:collapse; margin-bottom:16px; }
  th { background:${primaryColor}; color:#fff; padding:9px 12px; text-align:right; font-size:12px; font-weight:600; }
  td { border:0.5px solid rgba(0,0,0,0.1); padding:7px 12px; text-align:right; font-size:12px; }
  tr:nth-child(even) td { background:rgba(0,0,0,0.02); }
  .footer { text-align:center; color:#bbb; font-size:10px; margin-top:20px; border-top:0.5px solid #eee; padding-top:8px; }
  @media print { * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; } }
</style></head><body>
<div class="doc-header">
  <div style="display:flex;align-items:center;gap:12px">
    <div class="logo-box">${logoHtml}</div>
    <div><div class="company-name">${companyName}</div>${tagline?`<div class="tagline">${tagline}</div>`:""}</div>
  </div>
  <div style="text-align:left;font-size:10px;color:#999;line-height:1.8">
    <div>تاريخ الإصدار: ${dateStr}</div><div>الساعة: ${timeStr}</div>
  </div>
</div>
<div class="doc-title-bar">${title}</div>
${body}
<div class="footer">${companyName}${tagline?" — "+tagline:""} · ${title}</div>
</body></html>`;
}

// ============================================================
// HTML إيصال الدفعة
// ============================================================
function makeReceiptHTML(
  passengerName: string, payment: Payment,
  logoUrl = "", companyName = "حملة الأقصى", tagline = "",
  primaryColor = "#6B1F3A", accentColor = "#0C447C"
): string {
  const logoHtml = logoUrl ? `<img src="${logoUrl}" alt="logo" />` : `<span>${(companyName||"ح").trim().charAt(0)}</span>`;
  const receiptNo = String(payment.id).padStart(5, "0");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>إيصال استلام دفعة</title>
<style>
  @page { size: A5 portrait; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family:'Tajawal','Arial',sans-serif; direction:rtl; margin:0; padding:0; color:#1c1c1c; background:#fff; }
  .receipt { border:2px solid ${primaryColor}; border-radius:12px; overflow:hidden; }
  .receipt-header { background:linear-gradient(135deg,${primaryColor},${accentColor}); color:#fff; padding:16px 20px; display:flex; align-items:center; gap:14px; }
  .logo-box { width:54px; height:54px; border-radius:8px; overflow:hidden; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.15); color:#fff; font-size:22px; font-weight:800; flex-shrink:0; }
  .logo-box img { width:100%; height:100%; object-fit:contain; }
  .receipt-title { font-size:11px; color:rgba(255,255,255,0.8); margin-bottom:2px; }
  .receipt-subtitle { font-size:17px; font-weight:700; }
  .receipt-body { padding:20px; }
  .passenger-name { font-size:22px; font-weight:800; color:${primaryColor}; text-align:center; margin-bottom:16px; padding-bottom:12px; border-bottom:1.5px dashed #ddd; }
  .amount-box { background:${primaryColor}10; border:2px solid ${primaryColor}; border-radius:10px; padding:16px; text-align:center; margin-bottom:16px; }
  .amount-label { font-size:11px; color:#888; margin-bottom:4px; }
  .amount-value { font-size:36px; font-weight:900; color:${primaryColor}; line-height:1; }
  .amount-currency { font-size:14px; color:#888; margin-top:4px; }
  .details-grid { display:grid; grid-template-columns:auto 1fr; gap:6px 12px; font-size:13px; margin-bottom:16px; }
  .detail-label { color:#888; white-space:nowrap; }
  .detail-value { font-weight:600; }
  .receipt-footer { border-top:1.5px dashed #ddd; padding-top:14px; display:grid; grid-template-columns:1fr 1fr; gap:20px; }
  .stamp-area { text-align:center; }
  .stamp-label { font-size:10px; color:#aaa; margin-bottom:6px; }
  .stamp-box { border:1px dashed #ccc; border-radius:8px; height:70px; display:flex; align-items:center; justify-content:center; }
  .receipt-no { text-align:center; font-size:10px; color:#bbb; margin-top:12px; }
  @media print { * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; } }
</style></head><body>
<div class="receipt">
  <div class="receipt-header">
    <div class="logo-box">${logoHtml}</div>
    <div>
      <div class="receipt-title">${companyName}${tagline?" · "+tagline:""}</div>
      <div class="receipt-subtitle">إيصال استلام دفعة</div>
    </div>
  </div>
  <div class="receipt-body">
    <div class="passenger-name">${passengerName}</div>
    <div class="amount-box">
      <div class="amount-label">المبلغ المستلم</div>
      <div class="amount-value">${fmtAmt(Number(payment.amount))}</div>
      <div class="amount-currency">ريال قطري</div>
    </div>
    <div class="details-grid">
      <div class="detail-label">التاريخ:</div>
      <div class="detail-value">${payment.payment_date}</div>
      <div class="detail-label">طريقة الدفع:</div>
      <div class="detail-value">${payment.method}</div>
      ${payment.notes ? `<div class="detail-label">ملاحظات:</div><div class="detail-value">${payment.notes}</div>` : ""}
    </div>
    <div class="receipt-footer">
      <div class="stamp-area">
        <div class="stamp-label">الختم</div>
        <div class="stamp-box"><span style="color:#ddd;font-size:11px">الختم</span></div>
      </div>
      <div class="stamp-area">
        <div class="stamp-label">التوقيع</div>
        <div class="stamp-box"><span style="color:#ddd;font-size:11px">التوقيع</span></div>
      </div>
    </div>
    <div class="receipt-no">رقم الإيصال: #${receiptNo}</div>
  </div>
</div>
</body></html>`;
}

// ============================================================
// كشف حساب الحاج الفردي - تصميم كبير للطباعة
// ============================================================
function makePassengerStatementHTML(
  p: Passenger, pricing: PricingMap, customCharges: CustomCharge[], payments: Payment[],
  logoUrl = "", companyName = "حملة الأقصى", tagline = "",
  primaryColor = "#6B1F3A", accentColor = "#0C447C"
): string {
  const s = p.services;
  const pkgKey = getPackageKey(s.hotel_type);
  const pkgAmt = pricing[pkgKey]?.amount || 0;
  const pCustom   = customCharges.filter(c => c.passenger_id === p.id);
  const pPayments = [...payments.filter(py => py.passenger_id === p.id)].sort((a, b) => new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime());
  const totalDue  = calcTotalDue(p, pricing, customCharges);
  const totalPaid = calcTotalPaid(p.id, payments);
  const balance   = totalDue - totalPaid;
  const logoHtml  = logoUrl ? `<img src="${logoUrl}" alt="logo" />` : `<span>${(companyName||"ح").trim().charAt(0)}</span>`;
  const now = new Date();
  const dateStr = now.toLocaleDateString("ar-EG", { year:"numeric", month:"long", day:"numeric" });

  let rows = `<tr><td class="bayan">${pricing[pkgKey]?.label||"الباقة الأساسية"}</td><td class="debit">${fmtAmt(pkgAmt)}</td><td class="credit">—</td></tr>`;
  if (s.hotel_view==="مطلة") rows+=`<tr class="alt"><td class="bayan">إضافة مطلة</td><td class="debit">${fmtAmt(pricing["addon_view"]?.amount||0)}</td><td class="credit">—</td></tr>`;
  if (s.camp_mina==="خاص")  rows+=`<tr><td class="bayan">خيمة خاصة - منى</td><td class="debit">${fmtAmt(pricing["addon_mina"]?.amount||0)}</td><td class="credit">—</td></tr>`;
  if (s.camp_arafa==="خاص") rows+=`<tr class="alt"><td class="bayan">خيمة خاصة - عرفة</td><td class="debit">${fmtAmt(pricing["addon_arafa"]?.amount||0)}</td><td class="credit">—</td></tr>`;
  if (s.bus==="VIP")         rows+=`<tr><td class="bayan">باص VIP</td><td class="debit">${fmtAmt(pricing["addon_bus_vip"]?.amount||0)}</td><td class="credit">—</td></tr>`;
  if ((p as any).flight_class==="درجة أولى") rows+=`<tr class="alt"><td class="bayan">طيران درجة أولى</td><td class="debit">${fmtAmt(pricing["addon_first_class"]?.amount||0)}</td><td class="credit">—</td></tr>`;
  if ((p as any).flight_class==="بدون")      rows+=`<tr><td class="bayan">خصم بدون تذكرة <span class="badge-disc">خصم</span></td><td class="debit disc">(${fmtAmt(pricing["discount_no_ticket"]?.amount||0)})</td><td class="credit">—</td></tr>`;
  pCustom.forEach((c, i) => { rows+=`<tr${i%2===0?" class='alt'":""}><td class="bayan"><span class="badge-${c.type==="إضافة"?"add":"disc"}">${c.type==="إضافة"?"بند خاص":"خصم خاص"}</span> ${c.description}${c.notes?` <span class="note">(${c.notes})</span>`:""}</td><td class="${c.type==="إضافة"?"debit":"debit disc"}">${c.type==="إضافة"?fmtAmt(c.amount):`(${fmtAmt(c.amount)})`}</td><td class="credit">—</td></tr>`; });
  pPayments.forEach((py, i) => { rows+=`<tr class="pay-row${i%2===0?" alt":""}"><td class="bayan">دفعة — ${py.payment_date} <span class="method">(${py.method})</span>${py.notes?` — <span class="note">${py.notes}</span>`:""}</td><td class="debit">—</td><td class="credit paid">${fmtAmt(py.amount)}</td></tr>`; });

  const addonsList = [s.hotel_view==="مطلة"?"مطلة":"", s.camp_mina==="خاص"?"منى خاص":"", s.camp_arafa==="خاص"?"عرفة خاص":"", s.bus==="VIP"?"VIP":"", (p as any).flight_class==="درجة أولى"?"درجة أولى":"", (p as any).flight_class==="بدون"?"بدون تذكرة":""].filter(Boolean).join(" · ");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>كشف حساب — ${p.short_ar||p.name_ar}</title>
<style>
  @page { size: A4 portrait; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family:'Tajawal','Arial',sans-serif; direction:rtl; margin:0; padding:0; color:#1c1c1c; background:#fff; font-size:15px; }
  .header { display:flex; align-items:center; justify-content:space-between; padding-bottom:14px; border-bottom:3px solid ${primaryColor}; margin-bottom:10px; }
  .logo-box { width:80px; height:80px; border-radius:12px; overflow:hidden; display:flex; align-items:center; justify-content:center; background:${primaryColor}; color:#fff; font-size:32px; font-weight:800; flex-shrink:0; }
  .logo-box img { width:100%; height:100%; object-fit:contain; background:#fff; }
  .company-name { font-size:20px; font-weight:800; color:${primaryColor}; }
  .tagline { font-size:12px; color:#888; margin-top:3px; }
  .title-bar { background:linear-gradient(135deg,${primaryColor},${accentColor}); color:#fff; text-align:center; padding:12px; border-radius:10px; font-size:20px; font-weight:800; margin:12px 0; }
  .passenger-name { text-align:center; font-size:26px; font-weight:900; color:${primaryColor}; margin:6px 0 4px; }
  .passenger-sub { text-align:center; font-size:13px; color:#666; margin-bottom:14px; }
  .summary { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-bottom:18px; }
  .sum-card { border-radius:10px; padding:14px; text-align:center; border:1.5px solid; }
  .sum-label { font-size:12px; color:#888; margin-bottom:6px; }
  .sum-val { font-size:28px; font-weight:900; line-height:1; }
  .sum-cur { font-size:12px; color:#888; margin-top:4px; }
  .card-due  { background:${primaryColor}08; border-color:${primaryColor}; }
  .card-paid { background:#2A9D8F10; border-color:#2A9D8F; }
  .card-bal  { border:2px solid; }
  table { width:100%; border-collapse:collapse; margin-bottom:14px; }
  th { background:${primaryColor}; color:#fff; padding:12px 16px; text-align:right; font-size:15px; font-weight:700; }
  td { padding:11px 16px; border:1px solid #e8e8e8; font-size:15px; }
  tr.alt td { background:#f9f7f4; }
  tr.pay-row td { background:#f0faf8; }
  tr.pay-row.alt td { background:#e8f5f2; }
  .bayan { font-size:15px; }
  .debit { text-align:center; color:#C0392B; font-weight:700; font-size:15px; min-width:120px; }
  .credit { text-align:center; color:#2A9D8F; font-weight:700; font-size:15px; min-width:120px; }
  .disc { color:#2A9D8F !important; }
  .paid { font-size:16px; }
  .method { font-size:13px; color:#888; }
  .note { font-size:12px; color:#999; }
  .badge-add { display:inline-block; font-size:11px; padding:1px 8px; border-radius:99px; background:#E8951A20; color:#E8951A; margin-left:6px; }
  .badge-disc { display:inline-block; font-size:11px; padding:1px 8px; border-radius:99px; background:#2A9D8F20; color:#2A9D8F; margin-left:6px; }
  .total-row td { background:${primaryColor}; color:#fff; font-weight:800; font-size:16px; padding:13px 16px; text-align:center; }
  .total-row td:first-child { text-align:right; }
  .footer { text-align:center; font-size:11px; color:#bbb; margin-top:16px; border-top:1px solid #eee; padding-top:10px; }
  @media print { * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; } }
</style></head><body>
<div class="header">
  <div style="display:flex;align-items:center;gap:14px">
    <div class="logo-box">${logoHtml}</div>
    <div><div class="company-name">${companyName}</div>${tagline?`<div class="tagline">${tagline}</div>`:""}</div>
  </div>
  <div style="text-align:left;font-size:12px;color:#999;line-height:1.8">
    <div>تاريخ الإصدار: ${dateStr}</div>
  </div>
</div>
<div class="title-bar">كشف حساب</div>
<div class="passenger-name">${p.short_ar||p.name_ar}</div>
<div class="passenger-sub">${pricing[pkgKey]?.label||""}${addonsList?" &nbsp;·&nbsp; "+addonsList:""}</div>
<div class="summary">
  <div class="sum-card card-due"><div class="sum-label">المطلوب</div><div class="sum-val" style="color:${primaryColor}">${fmtAmt(totalDue)}</div><div class="sum-cur">ر.ق</div></div>
  <div class="sum-card card-paid"><div class="sum-label">المدفوع</div><div class="sum-val" style="color:#2A9D8F">${fmtAmt(totalPaid)}</div><div class="sum-cur">ر.ق</div></div>
  <div class="sum-card card-bal" style="background:${balance>0?"#C0392B10":"#2A9D8F10"};border-color:${balance>0?"#C0392B":"#2A9D8F"}"><div class="sum-label">المتبقي</div><div class="sum-val" style="color:${balance>0?"#C0392B":"#2A9D8F"}">${fmtAmt(balance)}</div><div class="sum-cur">ر.ق</div></div>
</div>
<table>
  <tr><th>البيان</th><th style="width:140px;text-align:center">مدين (مطلوب)</th><th style="width:140px;text-align:center">دائن (مدفوع)</th></tr>
  ${rows}
  <tr class="total-row"><td>الرصيد المتبقي</td><td>${fmtAmt(totalDue)}</td><td>${fmtAmt(totalPaid)}</td></tr>
</table>
<div class="footer">${companyName}${tagline?" — "+tagline:""} · كشف حساب</div>
</body></html>`;
}

// ============================================================
// كشف حساب المجموعة المالية
// ============================================================
function makeGroupStatementHTML(
  group: FinancialGroup, gPassengers: Passenger[], pricing: PricingMap,
  customCharges: CustomCharge[], payments: Payment[],
  logoUrl = "", companyName = "حملة الأقصى", tagline = "",
  primaryColor = "#6B1F3A", accentColor = "#0C447C"
): string {
  const logoHtml  = logoUrl ? `<img src="${logoUrl}" alt="logo" />` : `<span>${(companyName||"ح").trim().charAt(0)}</span>`;
  const now = new Date();
  const dateStr = now.toLocaleDateString("ar-EG", { year:"numeric", month:"long", day:"numeric" });
  const gTotDue  = gPassengers.reduce((s,p) => s+calcTotalDue(p,pricing,customCharges), 0);
  const gTotPaid = gPassengers.reduce((s,p) => s+calcTotalPaid(p.id,payments), 0);
  const gTotBal  = gTotDue - gTotPaid;

  const memberRows = gPassengers.map((p, i) => {
    const due  = calcTotalDue(p,pricing,customCharges);
    const paid = calcTotalPaid(p.id,payments);
    const bal  = due - paid;
    const pPays = [...payments.filter(py=>py.passenger_id===p.id)].sort((a,b)=>new Date(a.payment_date).getTime()-new Date(b.payment_date).getTime());
    const pkgKey = getPackageKey(p.services.hotel_type);
    const payRows = pPays.map(py => `<tr style="background:#f0faf8"><td style="padding:8px 16px;border:1px solid #e8e8e8;font-size:13px;padding-right:32px">دفعة — ${py.payment_date} <span style="color:#888;font-size:12px">(${py.method})</span>${py.notes?` — ${py.notes}`:""}</td><td style="text-align:center;border:1px solid #e8e8e8;color:#888;font-size:13px">—</td><td style="text-align:center;border:1px solid #e8e8e8;color:#2A9D8F;font-weight:700;font-size:14px">${fmtAmt(py.amount)}</td></tr>`).join("");
    return `
    <div style="margin-bottom:20px;border:1.5px solid ${primaryColor}30;border-radius:10px;overflow:hidden;">
      <div style="background:${primaryColor}12;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid ${primaryColor}20">
        <div style="font-size:17px;font-weight:800;color:${primaryColor}">${i+1}. ${p.short_ar||p.name_ar}</div>
        <div style="font-size:13px;color:#666">${pricing[pkgKey]?.label||""}</div>
        <div style="display:flex;gap:16px;font-size:13px">
          <span>مطلوب: <strong style="color:${primaryColor}">${fmtAmt(due)}</strong></span>
          <span>مدفوع: <strong style="color:#2A9D8F">${fmtAmt(paid)}</strong></span>
          <span>متبقي: <strong style="color:${bal>0?"#C0392B":"#2A9D8F"}">${fmtAmt(bal)}</strong></span>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <tr style="background:${primaryColor}08"><td style="padding:8px 16px;border:1px solid #e8e8e8;font-size:14px">${pricing[pkgKey]?.label||"الباقة الأساسية"}</td><td style="text-align:center;border:1px solid #e8e8e8;color:#C0392B;font-weight:700;font-size:14px;width:130px">${fmtAmt(pricing[pkgKey]?.amount||0)}</td><td style="text-align:center;border:1px solid #e8e8e8;color:#888;width:130px">—</td></tr>
        ${payRows}
        <tr style="background:${primaryColor};color:#fff"><td style="padding:10px 16px;font-weight:700">الرصيد</td><td style="text-align:center;font-weight:800">${fmtAmt(due)}</td><td style="text-align:center;font-weight:800">${fmtAmt(paid)}</td></tr>
      </table>
    </div>`;
  }).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>كشف حساب مجموعة — ${group.name}</title>
<style>
  @page { size: A4 portrait; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family:'Tajawal','Arial',sans-serif; direction:rtl; margin:0; padding:0; color:#1c1c1c; background:#fff; font-size:15px; }
  .header { display:flex; align-items:center; justify-content:space-between; padding-bottom:14px; border-bottom:3px solid ${primaryColor}; margin-bottom:10px; }
  .logo-box { width:80px; height:80px; border-radius:12px; overflow:hidden; display:flex; align-items:center; justify-content:center; background:${primaryColor}; color:#fff; font-size:32px; font-weight:800; flex-shrink:0; }
  .logo-box img { width:100%; height:100%; object-fit:contain; background:#fff; }
  .title-bar { background:linear-gradient(135deg,${primaryColor},${accentColor}); color:#fff; text-align:center; padding:12px; border-radius:10px; font-size:20px; font-weight:800; margin:12px 0; }
  .summary { display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:10px; margin-bottom:18px; }
  .sum-card { border-radius:10px; padding:12px; text-align:center; border:1.5px solid; }
  .sum-label { font-size:11px; color:#888; margin-bottom:4px; }
  .sum-val { font-size:22px; font-weight:900; line-height:1; }
  .sum-cur { font-size:11px; color:#888; margin-top:3px; }
  .footer { text-align:center; font-size:11px; color:#bbb; margin-top:16px; border-top:1px solid #eee; padding-top:10px; }
  @media print { * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; } }
</style></head><body>
<div class="header">
  <div style="display:flex;align-items:center;gap:14px">
    <div class="logo-box">${logoHtml}</div>
    <div><div style="font-size:20px;font-weight:800;color:${primaryColor}">${companyName}</div>${tagline?`<div style="font-size:12px;color:#888;margin-top:3px">${tagline}</div>`:""}</div>
  </div>
  <div style="text-align:left;font-size:12px;color:#999">تاريخ الإصدار: ${dateStr}</div>
</div>
<div class="title-bar">كشف حساب مجموعة</div>
<div style="text-align:center;font-size:24px;font-weight:900;color:${primaryColor};margin:6px 0 4px">${group.name}</div>
<div style="text-align:center;font-size:13px;color:#888;margin-bottom:14px">${gPassengers.length} أعضاء</div>
<div class="summary">
  <div class="sum-card" style="background:${primaryColor}08;border-color:${primaryColor}"><div class="sum-label">إجمالي المطلوب</div><div class="sum-val" style="color:${primaryColor}">${fmtAmt(gTotDue)}</div><div class="sum-cur">ر.ق</div></div>
  <div class="sum-card" style="background:#2A9D8F10;border-color:#2A9D8F"><div class="sum-label">إجمالي المدفوع</div><div class="sum-val" style="color:#2A9D8F">${fmtAmt(gTotPaid)}</div><div class="sum-cur">ر.ق</div></div>
  <div class="sum-card" style="background:${gTotBal>0?"#C0392B10":"#2A9D8F10"};border-color:${gTotBal>0?"#C0392B":"#2A9D8F"}"><div class="sum-label">إجمالي المتبقي</div><div class="sum-val" style="color:${gTotBal>0?"#C0392B":"#2A9D8F"}">${fmtAmt(gTotBal)}</div><div class="sum-cur">ر.ق</div></div>
  <div class="sum-card" style="background:#E8951A10;border-color:#E8951A"><div class="sum-label">عدد الأعضاء</div><div class="sum-val" style="color:#E8951A">${gPassengers.length}</div><div class="sum-cur">حاج</div></div>
</div>
${memberRows}
<div class="footer">${companyName}${tagline?" — "+tagline:""} · كشف حساب مجموعة — ${group.name}</div>
</body></html>`;
}

// ============================================================
// نصوص واتساب
// ============================================================
function waPassengerText(p: Passenger, pricing: PricingMap, customCharges: CustomCharge[], payments: Payment[], companyName: string): string {
  const totalDue  = calcTotalDue(p, pricing, customCharges);
  const totalPaid = calcTotalPaid(p.id, payments);
  const balance   = totalDue - totalPaid;
  const pkgLabel  = pricing[getPackageKey(p.services.hotel_type)]?.label || "";
  const pPays = [...payments.filter(py=>py.passenger_id===p.id)].sort((a,b)=>new Date(a.payment_date).getTime()-new Date(b.payment_date).getTime());
  const paysText = pPays.map(py=>`  • ${fmtAmt(py.amount)} ر.ق — ${py.payment_date} (${py.method})`).join("\n");
  return encodeURIComponent(
    `كشف حساب\n${companyName}\n\nالحاج/ة: ${p.short_ar||p.name_ar}\nالباقة: ${pkgLabel}\n\nالمطلوب:  ${fmtAmt(totalDue)} ر.ق\nالمدفوع:  ${fmtAmt(totalPaid)} ر.ق\nالمتبقي:  ${fmtAmt(balance)} ر.ق\n${paysText?"\nالدفعات:\n"+paysText:""}\n\nشكراً لثقتكم 🤝`
  );
}

function waGroupText(group: FinancialGroup, gPassengers: Passenger[], pricing: PricingMap, customCharges: CustomCharge[], payments: Payment[], companyName: string): string {
  const gTotDue  = gPassengers.reduce((s,p)=>s+calcTotalDue(p,pricing,customCharges),0);
  const gTotPaid = gPassengers.reduce((s,p)=>s+calcTotalPaid(p.id,payments),0);
  const gTotBal  = gTotDue - gTotPaid;
  const membersText = gPassengers.map(p=>{const due=calcTotalDue(p,pricing,customCharges),paid=calcTotalPaid(p.id,payments),bal=due-paid;return`  • ${p.short_ar||p.name_ar}: مطلوب ${fmtAmt(due)} — مدفوع ${fmtAmt(paid)} — متبقي ${fmtAmt(bal)}`}).join("\n");
  return encodeURIComponent(
    `كشف حساب مجموعة\n${companyName}\n\nالمجموعة: ${group.name}\nعدد الأعضاء: ${gPassengers.length}\n\nإجمالي المطلوب:  ${fmtAmt(gTotDue)} ر.ق\nإجمالي المدفوع:  ${fmtAmt(gTotPaid)} ر.ق\nإجمالي المتبقي:  ${fmtAmt(gTotBal)} ر.ق\n\nالأعضاء:\n${membersText}\n\nشكراً لثقتكم 🤝`
  );
}

// ============================================================
// المكوّن الرئيسي
// ============================================================
export function FinancePage({ passengers, currentUser }: { passengers: Passenger[]; currentUser: User }) {
  const config = useConfig();
  const { alert: alertState, showAlert } = useAlert();

  const [subView, setSubView]     = useState<"list"|"detail"|"settings"|"reports"|"group">("list");
  const [selectedP, setSelectedP] = useState<Passenger | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<FinancialGroup | null>(null);

  const [pricing, setPricing]               = useState<PricingMap>({});
  const [payments, setPayments]             = useState<Payment[]>([]);
  const [customCharges, setCustomCharges]   = useState<CustomCharge[]>([]);
  const [groups, setGroups]                 = useState<FinancialGroup[]>([]);
  const [groupMembers, setGroupMembers]     = useState<FinancialGroupMember[]>([]);
  const [loading, setLoading]               = useState(true);

  // بحث وفلتر
  const [searchTerm, setSearchTerm]       = useState("");
  const [filterStatus, setFilterStatus]   = useState<"all"|"paid"|"partial"|"unpaid">("all");
  const [filterPackage, setFilterPackage] = useState("all");

  // مودال دفعة
  const [showPayModal, setShowPayModal] = useState(false);
  const [payForm, setPayForm]           = useState({ amount:"", payment_date:new Date().toISOString().split("T")[0], method:"نقدي", notes:"" });
  const [savingPay, setSavingPay]       = useState(false);

  // إيصال
  const [receiptPayment, setReceiptPayment] = useState<{ payment: Payment; passengerName: string } | null>(null);

  // مودال بند خاص
  const [showChargeModal, setShowChargeModal] = useState(false);
  const [chargeType, setChargeType]           = useState<"إضافة"|"خصم">("إضافة");
  const [chargeForm, setChargeForm]           = useState({ description:"", amount:"", notes:"" });
  const [savingCharge, setSavingCharge]       = useState(false);

  // إعدادات أسعار
  const [editPricing, setEditPricing]     = useState<Record<string, string>>({});
  const [savingPricing, setSavingPricing] = useState(false);

  // تقارير
  const [reportType, setReportType] = useState<"full"|"late"|"payments"|"packages"|"addons">("full");

  // مجموعات مالية
  const [showGroupModal, setShowGroupModal]       = useState(false);
  const [groupModalMode, setGroupModalMode]       = useState<"create"|"addTo">("create");
  const [groupForm, setGroupForm]                 = useState({ name:"", notes:"" });
  const [savingGroup, setSavingGroup]             = useState(false);
  const [addingMemberId, setAddingMemberId]       = useState<number | null>(null);
  const [showGroupPayModal, setShowGroupPayModal] = useState(false);
  const [groupPayForm, setGroupPayForm]           = useState({ amount:"", payment_date:new Date().toISOString().split("T")[0], method:"نقدي", notes:"" });
  const [savingGroupPay, setSavingGroupPay]       = useState(false);

  // بيانات الشركة للطباعة
  const primaryColor = config.color_primary || "#6B1F3A";
  const accentColor  = config.color_accent  || "#0C447C";
  const companyName  = config.name_ar       || "حملة الأقصى";
  const tagline      = config.tagline       || "";
  const logoUrl      = config.logo_url      || "";

  useEffect(() => { loadFinanceData(); }, []);

  async function loadFinanceData() {
    setLoading(true);
    const [pRes, pyRes, ccRes, gRes, gmRes] = await Promise.all([
      supabase.from("pricing_settings").select("*"),
      supabase.from("payments").select("*").order("payment_date", { ascending:false }),
      supabase.from("custom_charges").select("*"),
      supabase.from("financial_groups").select("*").order("created_at", { ascending:false }),
      supabase.from("financial_group_members").select("*"),
    ]);
    if (pRes.data) {
      const map: PricingMap = {};
      const em: Record<string,string> = {};
      pRes.data.forEach((r:any) => { map[r.key]={label:r.label,amount:Number(r.amount),type:r.type}; em[r.key]=String(r.amount); });
      setPricing(map); setEditPricing(em);
    }
    if (pyRes.data) setPayments(pyRes.data as Payment[]);
    if (ccRes.data) setCustomCharges(ccRes.data as CustomCharge[]);
    if (gRes.data)  setGroups(gRes.data as FinancialGroup[]);
    if (gmRes.data) setGroupMembers(gmRes.data as FinancialGroupMember[]);
    setLoading(false);
  }

  async function savePricing() {
    setSavingPricing(true);
    for (const key of Object.keys(editPricing)) {
      await supabase.from("pricing_settings").update({ amount:Number(editPricing[key]), updated_at:new Date().toISOString() }).eq("key",key);
    }
    await loadFinanceData();
    setSavingPricing(false);
    showAlert("success","تم حفظ الأسعار بنجاح");
  }

  async function addPayment() {
    if (!selectedP || !payForm.amount) return;
    setSavingPay(true);
    const rec = { passenger_id:selectedP.id, amount:Number(payForm.amount), payment_date:payForm.payment_date, method:payForm.method, notes:payForm.notes, created_by:(currentUser as any).username||"" };
    const { data, error } = await supabase.from("payments").insert(rec).select().single();
    if (!error && data) {
      setPayments(prev => [data as Payment, ...prev]);
      setShowPayModal(false);
      const pName = selectedP.short_ar || selectedP.name_ar;
      setReceiptPayment({ payment: data as Payment, passengerName: pName });
      setPayForm({ amount:"", payment_date:new Date().toISOString().split("T")[0], method:"نقدي", notes:"" });
    }
    setSavingPay(false);
  }

  async function deletePayment(id: number) {
    if (!confirm("هل تريد حذف هذه الدفعة؟")) return;
    await supabase.from("payments").delete().eq("id",id);
    setPayments(prev => prev.filter(p => p.id !== id));
  }

  async function addCustomCharge() {
    if (!selectedP || !chargeForm.description || !chargeForm.amount) return;
    setSavingCharge(true);
    const { data, error } = await supabase.from("custom_charges").insert({ passenger_id:selectedP.id, description:chargeForm.description, amount:Number(chargeForm.amount), type:chargeType, notes:chargeForm.notes, created_by:(currentUser as any).username||"" }).select().single();
    if (!error && data) { setCustomCharges(prev => [...prev, data as CustomCharge]); setShowChargeModal(false); setChargeForm({ description:"", amount:"", notes:"" }); }
    setSavingCharge(false);
  }

  async function deleteCustomCharge(id: number) {
    if (!confirm("هل تريد حذف هذا البند؟")) return;
    await supabase.from("custom_charges").delete().eq("id",id);
    setCustomCharges(prev => prev.filter(c => c.id !== id));
  }

  function getPassengerGroup(passengerId: number): FinancialGroup | null {
    const mem = groupMembers.find(m => m.passenger_id === passengerId);
    if (!mem) return null;
    return groups.find(g => g.id === mem.group_id) || null;
  }

  function getGroupPassengers(groupId: number): Passenger[] {
    const pids = groupMembers.filter(m => m.group_id === groupId).map(m => m.passenger_id);
    return passengers.filter(p => pids.includes(p.id));
  }

  async function createGroupAndAdd() {
    if (!selectedP || !groupForm.name.trim()) return;
    setSavingGroup(true);
    const { data:grp, error:ge } = await supabase.from("financial_groups").insert({ name:groupForm.name.trim(), notes:groupForm.notes, created_by:(currentUser as any).username||"" }).select().single();
    if (!ge && grp) {
      await supabase.from("financial_group_members").insert({ group_id:grp.id, passenger_id:selectedP.id });
      setGroups(prev => [grp as FinancialGroup, ...prev]);
      setGroupMembers(prev => [...prev, { id:Date.now(), group_id:grp.id, passenger_id:selectedP.id }]);
      setShowGroupModal(false);
      setGroupForm({ name:"", notes:"" });
      showAlert("success", `تم إنشاء المجموعة "${grp.name}" بنجاح`);
    }
    setSavingGroup(false);
  }

  async function addMemberToGroup(groupId: number, passengerId: number) {
    if (addingMemberId === passengerId) return;
    const existing = groupMembers.find(m => m.group_id === groupId && m.passenger_id === passengerId);
    if (existing) return;
    setAddingMemberId(passengerId);
    const { error } = await supabase.from("financial_group_members").insert({ group_id:groupId, passenger_id:passengerId });
    if (!error) {
      setGroupMembers(prev => [...prev, { id:Date.now(), group_id:groupId, passenger_id:passengerId }]);
      setShowGroupModal(false);
      showAlert("success","تمت إضافة الحاج إلى المجموعة بنجاح");
    }
    setAddingMemberId(null);
  }

  async function removeFromGroup(passengerId: number, groupId: number) {
    if (!confirm("هل تريد إزالة هذا الحاج من المجموعة؟")) return;
    await supabase.from("financial_group_members").delete().eq("group_id",groupId).eq("passenger_id",passengerId);
    setGroupMembers(prev => prev.filter(m => !(m.group_id===groupId && m.passenger_id===passengerId)));
  }

  async function deleteGroup(groupId: number) {
    if (!confirm("هل تريد حذف هذه المجموعة؟")) return;
    await supabase.from("financial_groups").delete().eq("id",groupId);
    setGroups(prev => prev.filter(g => g.id !== groupId));
    setGroupMembers(prev => prev.filter(m => m.group_id !== groupId));
    setSubView("list"); setSelectedGroup(null);
  }

  async function addGroupPayment() {
    if (!selectedGroup || !groupPayForm.amount) return;
    const members = getGroupPassengers(selectedGroup.id);
    if (members.length === 0) return;
    setSavingGroupPay(true);
    const perPerson = Math.round((Number(groupPayForm.amount) / members.length) * 100) / 100;
    const inserts = members.map(p => ({ passenger_id:p.id, amount:perPerson, payment_date:groupPayForm.payment_date, method:groupPayForm.method, notes:`${groupPayForm.notes?groupPayForm.notes+" — ":""}دفعة مجموعة: ${selectedGroup.name}`, created_by:(currentUser as any).username||"" }));
    const { data, error } = await supabase.from("payments").insert(inserts).select();
    if (!error && data) {
      setPayments(prev => [...(data as Payment[]), ...prev]);
      setShowGroupPayModal(false);
      setGroupPayForm({ amount:"", payment_date:new Date().toISOString().split("T")[0], method:"نقدي", notes:"" });
      showAlert("success", `تم توزيع ${fmtAmt(Number(groupPayForm.amount))} ر.ق على ${members.length} أعضاء (${fmtAmt(perPerson)} ر.ق للفرد)`);
    }
    setSavingGroupPay(false);
  }

  // ── دوال الطباعة ──
  function printTable(headers: string[], rows: string[][], totals?: string[]): string {
    const ths = headers.map(h=>`<th>${h}</th>`).join("");
    const trs = rows.map((r,i)=>`<tr style="${i%2===1?"background:rgba(0,0,0,0.02)":""}">${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("");
    const tot = totals ? `<tr style="background:${primaryColor};color:#fff;font-weight:700">${totals.map(c=>`<td>${c}</td>`).join("")}</tr>` : "";
    return `<table><tr>${ths}</tr>${trs}${tot}</table>`;
  }


  function printFullReport(data:{p:Passenger;due:number;paid:number;balance:number}[], title="تقرير الحجاج المالي الكامل") {
    const tD=data.reduce((s,r)=>s+r.due,0), tP=data.reduce((s,r)=>s+r.paid,0), tB=tD-tP;
    const rows=data.map((r,i)=>{const st=financeStatus(r.due,r.paid);return[String(i+1),r.p.short_ar||r.p.name_ar,pricing[getPackageKey(r.p.services.hotel_type)]?.label||"—",`<span style="color:${primaryColor};font-weight:700">${fmtAmt(r.due)}</span>`,`<span style="color:#2A9D8F;font-weight:700">${fmtAmt(r.paid)}</span>`,`<span style="color:${r.balance>0?"#C0392B":"#2A9D8F"};font-weight:700">${fmtAmt(r.balance)}</span>`,`<span style="padding:2px 8px;border-radius:99px;background:${st.bg};color:${st.color}">${st.label}</span>`];});
    const body=printTable(["م","الاسم","الباقة","المطلوب","المدفوع","المتبقي","الحالة"],rows,["الإجمالي","","",fmtAmt(tD),fmtAmt(tP),fmtAmt(tB),""]);
    printInPage(makeFinanceHTML(title,body,true,logoUrl,companyName,tagline,primaryColor,accentColor));
  }

  function printPaymentsReport() {
    const sorted=[...payments].sort((a,b)=>new Date(b.payment_date).getTime()-new Date(a.payment_date).getTime());
    const rows=sorted.map((py,i)=>{const p=passengers.find(x=>x.id===py.passenger_id);return[String(i+1),p?(p.short_ar||p.name_ar):"—",py.payment_date,py.method,`<strong>${fmtAmt(py.amount)}</strong>`,py.notes||"—"];});
    const total=payments.reduce((s,p)=>s+Number(p.amount),0);
    const body=printTable(["م","الحاج","التاريخ","طريقة الدفع","المبلغ","ملاحظات"],rows,["الإجمالي","","","",fmtAmt(total),""]);
    printInPage(makeFinanceHTML("تقرير الدفعات",body,true,logoUrl,companyName,tagline,primaryColor,accentColor));
  }

  function printPackagesReport() {
    const rows=PRICING_KEYS.filter(k=>k.type==="package").map(pk=>{const count=passengers.filter(p=>getPackageKey(p.services.hotel_type)===pk.key).length;const price=pricing[pk.key]?.amount||0;return[pk.label,String(count),fmtAmt(price),`<strong>${fmtAmt(count*price)}</strong>`];});
    printInPage(makeFinanceHTML("تقرير الباقات",printTable(["الباقة","عدد الحجاج","السعر الواحد","الإجمالي المستحق"],rows),false,logoUrl,companyName,tagline,primaryColor,accentColor));
  }

  function printAddonsReport() {
    const checks=[{key:"addon_view",check:(p:Passenger)=>p.services.hotel_view==="مطلة"},{key:"addon_mina",check:(p:Passenger)=>p.services.camp_mina==="خاص"},{key:"addon_arafa",check:(p:Passenger)=>p.services.camp_arafa==="خاص"},{key:"addon_bus_vip",check:(p:Passenger)=>p.services.bus==="VIP"},{key:"addon_first_class",check:(p:Passenger)=>(p as any).flight_class==="درجة أولى"},{key:"discount_no_ticket",check:(p:Passenger)=>(p as any).flight_class==="بدون"}];
    const rows=checks.map(a=>{const count=passengers.filter(a.check).length;const price=pricing[a.key]?.amount||0;const isDis=a.key==="discount_no_ticket";return[pricing[a.key]?.label||a.key,String(count),fmtAmt(price),isDis?`(${fmtAmt(count*price)})`:fmtAmt(count*price)];});
    printInPage(makeFinanceHTML("ملخص الإضافات",printTable(["الإضافة / الخصم","عدد الحجاج","السعر الواحد","الإجمالي"],rows),false,logoUrl,companyName,tagline,primaryColor,accentColor));
  }

  // مساعدات التصميم
  const sortedPassengers = [...passengers].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
  const inputStyle = { width:"100%", padding:"8px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg-input)", fontFamily:"var(--font-body)", fontSize:13, boxSizing:"border-box" as const };
  const thStyle    = { padding:"10px 12px", background:"var(--em8)", color:"#fff", textAlign:"right" as const, fontSize:12, fontWeight:600 };
  const tdStyle    = { padding:"8px 12px", border:"1px solid var(--border)", fontSize:13 };

  const filteredPassengers = sortedPassengers.filter(p => {
    const name = (p.short_ar||p.name_ar||"").toLowerCase();
    if (searchTerm && !name.includes(searchTerm.toLowerCase())) return false;
    if (filterPackage !== "all" && getPackageKey(p.services.hotel_type) !== filterPackage) return false;
    if (filterStatus !== "all") {
      const due=calcTotalDue(p,pricing,customCharges), paid=calcTotalPaid(p.id,payments);
      if (filterStatus==="paid"    && !(paid>=due&&due>0)) return false;
      if (filterStatus==="partial" && !(paid>0&&paid<due)) return false;
      if (filterStatus==="unpaid"  && paid>0)              return false;
    }
    return true;
  });

  // ══════════════════════════════════════════════
  // RECEIPT MODAL
  // ══════════════════════════════════════════════
  const ReceiptModal = () => {
    if (!receiptPayment) return null;
    const { payment, passengerName } = receiptPayment;
    const waText = encodeURIComponent(
      `إيصال استلام دفعة\n${companyName}\n\nالحاج: ${passengerName}\nالمبلغ: ${fmtAmt(Number(payment.amount))} ر.ق\nالتاريخ: ${payment.payment_date}\nطريقة الدفع: ${payment.method}${payment.notes?"\nملاحظات: "+payment.notes:""}\n\nشكراً لثقتكم 🤝`
    );
    return (
      <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1500 }}>
        <div style={{ background:"var(--bg-card)", borderRadius:16, padding:24, width:340, boxShadow:"var(--shadow-xl)", textAlign:"center" }}>
          <div style={{ width:48, height:48, borderRadius:"50%", background:"rgba(42,157,143,0.1)", color:"#2A9D8F", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, fontWeight:700, margin:"0 auto 12px" }}>✓</div>
          <div style={{ fontSize:15, fontWeight:700, color:"var(--em8)", marginBottom:4 }}>تم تسجيل الدفعة</div>
          <div style={{ fontSize:13, color:"var(--text-muted)", marginBottom:4 }}>{passengerName}</div>
          <div style={{ fontSize:24, fontWeight:900, color:"#2A9D8F", marginBottom:16 }}>{fmtAmt(Number(payment.amount))} <span style={{ fontSize:13 }}>ر.ق</span></div>
          <div style={{ display:"flex", gap:10, marginBottom:10 }}>
            <button onClick={() => printInPage(makeReceiptHTML(passengerName,payment,logoUrl,companyName,tagline,primaryColor,accentColor))}
              style={{ flex:1, padding:10, background:"var(--em8)", color:"#fff", border:"none", borderRadius:10, fontFamily:"var(--font-body)", fontSize:13, cursor:"pointer", fontWeight:600 }}>
              🖨️ طباعة
            </button>
            <button onClick={() => downloadAsPDF(makeReceiptHTML(passengerName,payment,logoUrl,companyName,tagline,primaryColor,accentColor),`إيصال-${passengerName}-${payment.payment_date}.html`)}
              style={{ flex:1, padding:10, background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:10, fontFamily:"var(--font-body)", fontSize:13, cursor:"pointer" }}>
              📄 PDF
            </button>
          </div>
          <div style={{ marginBottom:10 }}>
            <a href={`https://wa.me/?text=${waText}`} target="_blank" rel="noreferrer"
              style={{ display:"block", width:"100%", padding:10, background:"#25D366", color:"#fff", border:"none", borderRadius:10, fontFamily:"var(--font-body)", fontSize:13, cursor:"pointer", fontWeight:600, textDecoration:"none", textAlign:"center" }}>
              واتساب
            </a>
          </div>
          <button onClick={() => setReceiptPayment(null)}
            style={{ width:"100%", padding:8, background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, fontFamily:"var(--font-body)", fontSize:13, cursor:"pointer" }}>
            إغلاق
          </button>
        </div>
      </div>
    );
  };

  // ══════════════════════════════════════════════
  // SETTINGS VIEW
  // ══════════════════════════════════════════════
  if (subView === "settings") return (
    <div style={{ flex:1, overflowY:"auto", padding:20 }}>
      <AlertModal alert={alertState} onClose={() => showAlert(null)} />
      <div style={{ maxWidth:560, margin:"0 auto" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
          <button onClick={() => setSubView("list")} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--primary)", fontSize:24 }}>←</button>
          <div style={{ fontFamily:"var(--font-heading)", fontSize:20, fontWeight:600, color:"var(--em8)" }}>إعدادات الأسعار</div>
        </div>
        {(["package","addon","discount"] as const).map(type => (
          <div key={type} style={{ background:"var(--bg-card)", borderRadius:12, padding:16, marginBottom:16, boxShadow:"var(--shadow-sm)" }}>
            <div style={{ fontWeight:700, color:"var(--em8)", marginBottom:12, fontSize:14, borderBottom:"1px solid var(--border)", paddingBottom:8 }}>
              {type==="package"?"الباقات الأساسية":type==="addon"?"الإضافات":"الخصومات"}
            </div>
            {PRICING_KEYS.filter(k=>k.type===type).map(k => (
              <div key={k.key} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                <div style={{ flex:1, fontSize:13 }}>{k.label}</div>
                <input type="number" min="0" value={editPricing[k.key]||"0"} onChange={e=>setEditPricing(prev=>({...prev,[k.key]:e.target.value}))} style={{ width:130, padding:"6px 10px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg-input)", textAlign:"center", fontSize:13 }} />
                <span style={{ fontSize:12, color:"var(--text-muted)", width:24 }}>ر.ق</span>
              </div>
            ))}
          </div>
        ))}
        <button onClick={savePricing} disabled={savingPricing} style={{ width:"100%", padding:12, background:"var(--primary)", color:"#fff", border:"none", borderRadius:10, fontFamily:"var(--font-body)", fontSize:14, cursor:"pointer", fontWeight:600 }}>
          {savingPricing?"جارٍ الحفظ...":"حفظ الأسعار"}
        </button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════
  // GROUP VIEW
  // ══════════════════════════════════════════════
  if (subView === "group" && selectedGroup) {
    const gPassengers = getGroupPassengers(selectedGroup.id);
    const gTotDue=gPassengers.reduce((s,p)=>s+calcTotalDue(p,pricing,customCharges),0);
    const gTotPaid=gPassengers.reduce((s,p)=>s+calcTotalPaid(p.id,payments),0);
    const gTotBal=gTotDue-gTotPaid;
    const gSt=financeStatus(gTotDue,gTotPaid);
    const availableToAdd=passengers.filter(p=>!groupMembers.find(m=>m.group_id===selectedGroup.id&&m.passenger_id===p.id));
    return (
      <div style={{ flex:1, overflowY:"auto", padding:20 }}>
        <AlertModal alert={alertState} onClose={() => showAlert(null)} />
        <ReceiptModal />
        <div style={{ maxWidth:720, margin:"0 auto" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
            <button onClick={() => { setSubView("list"); setSelectedGroup(null); }} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--primary)", fontSize:24 }}>←</button>
            <div>
              <div style={{ fontFamily:"var(--font-heading)", fontSize:18, fontWeight:700, color:"var(--em8)" }}>{selectedGroup.name}</div>
              <div style={{ fontSize:11, color:"var(--text-muted)" }}>{gPassengers.length} أعضاء</div>
            </div>
            <span style={{ marginRight:"auto", fontSize:12, padding:"4px 14px", borderRadius:99, background:gSt.bg, color:gSt.color, fontWeight:700 }}>{gSt.label}</span>
            <button onClick={() => deleteGroup(selectedGroup.id)} style={{ padding:"6px 12px", background:"rgba(192,57,43,0.1)", color:"#C0392B", border:"1px solid #C0392B", borderRadius:8, fontSize:12, cursor:"pointer" }}>حذف المجموعة</button>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:20 }}>
            {[{label:"إجمالي المطلوب",value:fmtAmt(gTotDue),color:"var(--em8)"},{label:"إجمالي المدفوع",value:fmtAmt(gTotPaid),color:"#2A9D8F"},{label:"إجمالي المتبقي",value:fmtAmt(gTotBal),color:gTotBal>0?"#C0392B":"#2A9D8F"}].map(card=>(
              <div key={card.label} style={{ background:"var(--bg-card)", borderRadius:12, padding:"14px 16px", textAlign:"center", boxShadow:"var(--shadow-sm)" }}>
                <div style={{ fontSize:11, color:"var(--text-muted)", marginBottom:4 }}>{card.label}</div>
                <div style={{ fontSize:20, fontWeight:700, color:card.color }}>{card.value}</div>
                <div style={{ fontSize:10, color:"var(--text-muted)" }}>ر.ق</div>
              </div>
            ))}
          </div>
          <div style={{ display:"flex", gap:10, marginBottom:16 }}>
            <button onClick={() => setShowGroupPayModal(true)} style={{ flex:1, padding:10, background:"#2A9D8F", color:"#fff", border:"none", borderRadius:10, fontFamily:"var(--font-body)", fontSize:13, cursor:"pointer", fontWeight:600 }}>+ دفعة مشتركة تُوزَّع على الأعضاء</button>
            <button onClick={() => setShowGroupModal(true)} style={{ flex:1, padding:10, background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:10, fontFamily:"var(--font-body)", fontSize:13, cursor:"pointer" }}>+ إضافة عضو</button>
          </div>
          <div style={{ display:"flex", gap:10, marginBottom:16 }}>
            <button onClick={()=>printInPage(makeGroupStatementHTML(selectedGroup,gPassengers,pricing,customCharges,payments,logoUrl,companyName,tagline,primaryColor,accentColor))} style={{ flex:1, padding:"8px", background:"var(--em8)", color:"#fff", border:"none", borderRadius:8, fontFamily:"var(--font-body)", fontSize:13, cursor:"pointer", fontWeight:600 }}>🖨️ كشف حساب المجموعة</button>
            <button onClick={()=>downloadAsPDF(makeGroupStatementHTML(selectedGroup,gPassengers,pricing,customCharges,payments,logoUrl,companyName,tagline,primaryColor,accentColor),`كشف-مجموعة-${selectedGroup.name}.html`)} style={{ flex:1, padding:"8px", background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, fontFamily:"var(--font-body)", fontSize:13, cursor:"pointer" }}>📄 PDF</button>
            <a href={`https://wa.me/?text=${waGroupText(selectedGroup,gPassengers,pricing,customCharges,payments,companyName)}`} target="_blank" rel="noreferrer" style={{ flex:1, padding:"8px", background:"#25D366", color:"#fff", border:"none", borderRadius:8, fontFamily:"var(--font-body)", fontSize:13, cursor:"pointer", textDecoration:"none", display:"flex", alignItems:"center", justifyContent:"center" }}>واتساب</a>
          </div>
          <div style={{ background:"var(--bg-card)", borderRadius:12, overflow:"hidden", boxShadow:"var(--shadow-sm)" }}>
            <div style={{ background:"var(--em8)", color:"#fff", padding:"10px 16px", fontWeight:700, fontSize:14 }}>أعضاء المجموعة</div>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>
                <th style={thStyle}>الاسم</th>
                <th style={{ ...thStyle, textAlign:"center" }}>المطلوب</th>
                <th style={{ ...thStyle, textAlign:"center" }}>المدفوع</th>
                <th style={{ ...thStyle, textAlign:"center" }}>المتبقي</th>
                <th style={{ ...thStyle, textAlign:"center", width:80 }}>إجراء</th>
              </tr></thead>
              <tbody>
                {gPassengers.map((p,i) => {
                  const due=calcTotalDue(p,pricing,customCharges),paid=calcTotalPaid(p.id,payments),bal=due-paid,st=financeStatus(due,paid);
                  return (
                    <tr key={p.id} style={{ background:i%2===0?"white":"var(--bg-2)" }}>
                      <td style={tdStyle}><span style={{ cursor:"pointer", color:"var(--em8)", fontWeight:600 }} onClick={()=>{setSelectedP(p);setSubView("detail");}}>{p.short_ar||p.name_ar}</span><span style={{ fontSize:10, padding:"1px 6px", borderRadius:99, background:st.bg, color:st.color, marginRight:6 }}>{st.label}</span></td>
                      <td style={{ ...tdStyle, textAlign:"center", color:"var(--em8)", fontWeight:600 }}>{fmtAmt(due)}</td>
                      <td style={{ ...tdStyle, textAlign:"center", color:"#2A9D8F", fontWeight:600 }}>{fmtAmt(paid)}</td>
                      <td style={{ ...tdStyle, textAlign:"center", color:bal>0?"#C0392B":"#2A9D8F", fontWeight:600 }}>{fmtAmt(bal)}</td>
                      <td style={{ ...tdStyle, textAlign:"center" }}><button onClick={()=>removeFromGroup(p.id,selectedGroup.id)} style={{ background:"none", border:"none", cursor:"pointer", color:"#C0392B", fontSize:12 }}>إزالة</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* مودال: إضافة عضو للمجموعة */}
          {showGroupModal && (
            <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }}>
              <div style={{ background:"var(--bg-card)", borderRadius:16, padding:24, width:360, boxShadow:"var(--shadow-xl)", maxHeight:"80vh", overflowY:"auto" }}>
                <div style={{ fontWeight:700, fontSize:16, marginBottom:16, color:"var(--em8)" }}>إضافة عضو إلى المجموعة</div>
                {availableToAdd.length === 0
                  ? <div style={{ textAlign:"center", padding:20, color:"var(--text-muted)", fontSize:13 }}>لا يوجد حجاج متاحون للإضافة</div>
                  : availableToAdd.map(p => (
                    <div key={p.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid var(--border)" }}>
                      <span style={{ fontSize:13 }}>{p.short_ar||p.name_ar}</span>
                      <button
                        disabled={addingMemberId === p.id}
                        onClick={() => addMemberToGroup(selectedGroup.id, p.id)}
                        style={{ padding:"4px 14px", background:addingMemberId===p.id?"var(--bg-2)":"var(--primary)", color:addingMemberId===p.id?"var(--text-muted)":"#fff", border:"none", borderRadius:6, fontSize:12, cursor:addingMemberId===p.id?"not-allowed":"pointer" }}>
                        {addingMemberId===p.id?"جارٍ...":"إضافة"}
                      </button>
                    </div>
                  ))
                }
                <button onClick={()=>setShowGroupModal(false)} style={{ width:"100%", marginTop:16, padding:10, background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, fontFamily:"var(--font-body)", fontSize:13, cursor:"pointer" }}>إغلاق</button>
              </div>
            </div>
          )}

          {/* مودال: دفعة مشتركة */}
          {showGroupPayModal && (
            <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }}>
              <div style={{ background:"var(--bg-card)", borderRadius:16, padding:24, width:340, boxShadow:"var(--shadow-xl)" }}>
                <div style={{ fontWeight:700, fontSize:16, marginBottom:4, color:"#2A9D8F" }}>دفعة مشتركة</div>
                <div style={{ fontSize:11, color:"var(--text-muted)", marginBottom:16 }}>ستُوزَّع على {gPassengers.length} أعضاء ({groupPayForm.amount?fmtAmt(Number(groupPayForm.amount)/gPassengers.length):"0"} ر.ق للفرد)</div>
                {[{label:"المبلغ الإجمالي",key:"amount",type:"number",ph:"0"},{label:"التاريخ",key:"payment_date",type:"date",ph:""},{label:"ملاحظات (اختياري)",key:"notes",type:"text",ph:"..."}].map(f=>(
                  <div key={f.key} style={{ marginBottom:12 }}>
                    <div style={{ fontSize:12, color:"var(--text-muted)", marginBottom:4 }}>{f.label}</div>
                    <input type={f.type} placeholder={f.ph} value={(groupPayForm as any)[f.key]} onChange={e=>setGroupPayForm(p=>({...p,[f.key]:e.target.value}))} style={inputStyle} />
                  </div>
                ))}
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:12, color:"var(--text-muted)", marginBottom:4 }}>طريقة الدفع</div>
                  <select value={groupPayForm.method} onChange={e=>setGroupPayForm(p=>({...p,method:e.target.value}))} style={inputStyle}>
                    {["نقدي","تحويل بنكي","شيك"].map(m=><option key={m}>{m}</option>)}
                  </select>
                </div>
                <div style={{ display:"flex", gap:10 }}>
                  <button onClick={addGroupPayment} disabled={savingGroupPay} style={{ flex:1, padding:10, background:"#2A9D8F", color:"#fff", border:"none", borderRadius:8, fontFamily:"var(--font-body)", cursor:"pointer" }}>{savingGroupPay?"جارٍ الحفظ...":"توزيع الدفعة"}</button>
                  <button onClick={()=>setShowGroupPayModal(false)} style={{ flex:1, padding:10, background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, fontFamily:"var(--font-body)", cursor:"pointer" }}>إلغاء</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════
  // DETAIL VIEW
  // ══════════════════════════════════════════════
  if (subView === "detail" && selectedP) {
    const s=selectedP.services;
    const pkgKey=getPackageKey(s.hotel_type), pkgAmt=pricing[pkgKey]?.amount||0;
    const pPayments=[...payments.filter(p=>p.passenger_id===selectedP.id)].sort((a,b)=>new Date(a.payment_date).getTime()-new Date(b.payment_date).getTime());
    const pCustom=customCharges.filter(c=>c.passenger_id===selectedP.id);
    const totalDue=calcTotalDue(selectedP,pricing,customCharges), totalPaid=calcTotalPaid(selectedP.id,payments), balance=totalDue-totalPaid;
    const st=financeStatus(totalDue,totalPaid);
    const passengerGroup=getPassengerGroup(selectedP.id);
    type AR={label:string;amount:number;isDiscount?:boolean};
    const addonRows:AR[]=[];
    if (s.hotel_view==="مطلة") addonRows.push({label:"إضافة مطلة",amount:pricing["addon_view"]?.amount||0});
    if (s.camp_mina==="خاص")  addonRows.push({label:"خيمة خاصة - منى",amount:pricing["addon_mina"]?.amount||0});
    if (s.camp_arafa==="خاص") addonRows.push({label:"خيمة خاصة - عرفة",amount:pricing["addon_arafa"]?.amount||0});
    if (s.bus==="VIP")         addonRows.push({label:"باص VIP",amount:pricing["addon_bus_vip"]?.amount||0});
    if ((selectedP as any).flight_class==="درجة أولى") addonRows.push({label:"طيران درجة أولى",amount:pricing["addon_first_class"]?.amount||0});
    if ((selectedP as any).flight_class==="بدون")      addonRows.push({label:"خصم بدون تذكرة",amount:pricing["discount_no_ticket"]?.amount||0,isDiscount:true});
    return (
      <div style={{ flex:1, overflowY:"auto", padding:20 }}>
        <AlertModal alert={alertState} onClose={()=>showAlert(null)} />
        <ReceiptModal />
        <div style={{ maxWidth:720, margin:"0 auto" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
            <button onClick={()=>{setSubView("list");setSelectedP(null);}} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--primary)", fontSize:24 }}>←</button>
            <div>
              <div style={{ fontFamily:"var(--font-heading)", fontSize:18, fontWeight:700, color:"var(--em8)" }}>{selectedP.short_ar||selectedP.name_ar}</div>
              <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:2 }}>{pricing[pkgKey]?.label}{addonRows.filter(a=>!a.isDiscount).map(a=>` · ${a.label}`).join("")}</div>
            </div>
            <span style={{ marginRight:"auto", fontSize:12, padding:"4px 14px", borderRadius:99, background:st.bg, color:st.color, fontWeight:700 }}>{st.label}</span>
            <button onClick={()=>printInPage(makePassengerStatementHTML(selectedP,pricing,customCharges,payments,logoUrl,companyName,tagline,primaryColor,accentColor))} style={{ padding:"6px 12px", background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, fontSize:12, cursor:"pointer" }}>🖨️ طباعة</button>
            <button onClick={()=>downloadAsPDF(makePassengerStatementHTML(selectedP,pricing,customCharges,payments,logoUrl,companyName,tagline,primaryColor,accentColor),`كشف-حساب-${selectedP.short_ar||selectedP.name_ar}.html`)} style={{ padding:"6px 12px", background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, fontSize:12, cursor:"pointer" }}>📄 PDF</button>
            <a href={`https://wa.me/?text=${waPassengerText(selectedP,pricing,customCharges,payments,companyName)}`} target="_blank" rel="noreferrer" style={{ padding:"6px 12px", background:"#25D366", color:"#fff", border:"none", borderRadius:8, fontSize:12, cursor:"pointer", textDecoration:"none", display:"flex", alignItems:"center" }}>واتساب</a>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:20 }}>
            {[{label:"المطلوب",value:fmtAmt(totalDue),color:"var(--em8)"},{label:"المدفوع",value:fmtAmt(totalPaid),color:"#2A9D8F"},{label:"المتبقي",value:fmtAmt(balance),color:balance>0?"#C0392B":"#2A9D8F"}].map(card=>(
              <div key={card.label} style={{ background:"var(--bg-card)", borderRadius:12, padding:"14px 16px", textAlign:"center", boxShadow:"var(--shadow-sm)" }}>
                <div style={{ fontSize:11, color:"var(--text-muted)", marginBottom:4 }}>{card.label}</div>
                <div style={{ fontSize:20, fontWeight:700, color:card.color }}>{card.value}</div>
                <div style={{ fontSize:10, color:"var(--text-muted)" }}>ر.ق</div>
              </div>
            ))}
          </div>
          <div style={{ background:"var(--bg-card)", borderRadius:12, overflow:"hidden", boxShadow:"var(--shadow-sm)", marginBottom:16 }}>
            <div style={{ background:"var(--em8)", color:"#fff", padding:"10px 16px", fontWeight:700, fontSize:14 }}>كشف الحساب</div>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ background:"var(--bg-2)" }}>
                  <th style={{ ...tdStyle, fontWeight:700, border:"1px solid var(--border)" }}>البيان</th>
                  <th style={{ ...tdStyle, fontWeight:700, border:"1px solid var(--border)", textAlign:"center", color:"#C0392B", width:130 }}>مدين (مطلوب)</th>
                  <th style={{ ...tdStyle, fontWeight:700, border:"1px solid var(--border)", textAlign:"center", color:"#2A9D8F", width:130 }}>دائن (مدفوع)</th>
                  <th style={{ ...tdStyle, fontWeight:700, border:"1px solid var(--border)", textAlign:"center", width:50 }}></th>
                </tr>
              </thead>
              <tbody>
                <tr><td style={tdStyle}>{pricing[pkgKey]?.label||"الباقة الأساسية"}</td><td style={{ ...tdStyle, textAlign:"center", color:"#C0392B", fontWeight:600 }}>{fmtAmt(pkgAmt)}</td><td style={{ ...tdStyle, textAlign:"center", color:"var(--text-muted)" }}>—</td><td style={tdStyle}></td></tr>
                {addonRows.map((a,i)=>(
                  <tr key={i} style={{ background:"var(--bg-2)" }}>
                    <td style={tdStyle}>{a.label}{a.isDiscount&&<span style={{ fontSize:10, color:"#2A9D8F", background:"rgba(42,157,143,0.1)", padding:"1px 6px", borderRadius:99, marginRight:6 }}>خصم</span>}</td>
                    <td style={{ ...tdStyle, textAlign:"center", color:a.isDiscount?"#2A9D8F":"#C0392B", fontWeight:600 }}>{a.isDiscount?`(${fmtAmt(a.amount)})`:fmtAmt(a.amount)}</td>
                    <td style={{ ...tdStyle, textAlign:"center", color:"var(--text-muted)" }}>—</td>
                    <td style={tdStyle}></td>
                  </tr>
                ))}
                {pCustom.map(c=>(
                  <tr key={`cc-${c.id}`}>
                    <td style={tdStyle}><span style={{ fontSize:10, padding:"1px 6px", borderRadius:99, marginLeft:6, background:c.type==="إضافة"?"rgba(232,149,26,0.1)":"rgba(42,157,143,0.1)", color:c.type==="إضافة"?"#E8951A":"#2A9D8F" }}>{c.type==="إضافة"?"بند خاص":"خصم خاص"}</span>{c.description}{c.notes&&<span style={{ fontSize:10, color:"var(--text-muted)", marginRight:6 }}>({c.notes})</span>}</td>
                    <td style={{ ...tdStyle, textAlign:"center", color:c.type==="إضافة"?"#C0392B":"#2A9D8F", fontWeight:600 }}>{c.type==="إضافة"?fmtAmt(c.amount):`(${fmtAmt(c.amount)})`}</td>
                    <td style={{ ...tdStyle, textAlign:"center", color:"var(--text-muted)" }}>—</td>
                    <td style={{ ...tdStyle, textAlign:"center" }}><button onClick={()=>deleteCustomCharge(c.id)} style={{ background:"none", border:"none", cursor:"pointer", color:"#C0392B", fontSize:14 }}>✕</button></td>
                  </tr>
                ))}
                {pPayments.map((py,i)=>(
                  <tr key={`py-${py.id}`} style={{ background:i%2===0?"rgba(42,157,143,0.04)":"white" }}>
                    <td style={tdStyle}>دفعة — {py.payment_date} <span style={{ fontSize:10, color:"var(--text-muted)", marginRight:6 }}>({py.method})</span>{py.notes&&<span style={{ fontSize:10, color:"var(--text-muted)" }}>— {py.notes}</span>}</td>
                    <td style={{ ...tdStyle, textAlign:"center", color:"var(--text-muted)" }}>—</td>
                    <td style={{ ...tdStyle, textAlign:"center", color:"#2A9D8F", fontWeight:600 }}>{fmtAmt(py.amount)}</td>
                    <td style={{ ...tdStyle, textAlign:"center" }}><button onClick={()=>deletePayment(py.id)} style={{ background:"none", border:"none", cursor:"pointer", color:"#C0392B", fontSize:14 }}>✕</button></td>
                  </tr>
                ))}
                <tr style={{ background:"var(--em8)", color:"#fff", fontWeight:700 }}>
                  <td style={{ padding:"10px 12px" }}>الرصيد المتبقي</td>
                  <td style={{ padding:"10px 12px", textAlign:"center" }}>{fmtAmt(totalDue)}</td>
                  <td style={{ padding:"10px 12px", textAlign:"center" }}>{fmtAmt(totalPaid)}</td>
                  <td style={{ padding:"10px 12px" }}></td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ display:"flex", gap:10, marginBottom:16 }}>
            <button onClick={()=>setShowPayModal(true)} style={{ flex:1, padding:10, background:"#2A9D8F", color:"#fff", border:"none", borderRadius:10, fontFamily:"var(--font-body)", fontSize:13, cursor:"pointer", fontWeight:600 }}>+ تسجيل دفعة</button>
            <button onClick={()=>{setChargeType("إضافة");setChargeForm({description:"",amount:"",notes:""});setShowChargeModal(true);}} style={{ flex:1, padding:10, background:"#E8951A", color:"#fff", border:"none", borderRadius:10, fontFamily:"var(--font-body)", fontSize:13, cursor:"pointer", fontWeight:600 }}>+ بند خاص</button>
            <button onClick={()=>{setChargeType("خصم");setChargeForm({description:"",amount:"",notes:""});setShowChargeModal(true);}} style={{ flex:1, padding:10, background:"#C0392B", color:"#fff", border:"none", borderRadius:10, fontFamily:"var(--font-body)", fontSize:13, cursor:"pointer", fontWeight:600 }}>+ خصم خاص</button>
          </div>
          <div style={{ background:"var(--bg-card)", borderRadius:12, padding:16, boxShadow:"var(--shadow-sm)" }}>
            <div style={{ fontWeight:700, fontSize:13, color:"var(--em8)", marginBottom:12 }}>المجموعة المالية</div>
            {passengerGroup ? (
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:12, padding:"4px 12px", borderRadius:99, background:"rgba(125,31,60,0.08)", color:"var(--em8)", fontWeight:600 }}>{passengerGroup.name}</span>
                <button onClick={()=>{setSelectedGroup(passengerGroup);setSubView("group");}} style={{ padding:"4px 12px", background:"var(--em8)", color:"#fff", border:"none", borderRadius:6, fontSize:12, cursor:"pointer" }}>عرض حساب المجموعة</button>
                <button onClick={()=>removeFromGroup(selectedP.id,passengerGroup.id)} style={{ padding:"4px 12px", background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:6, fontSize:12, cursor:"pointer", color:"#C0392B", marginRight:"auto" }}>إزالة من المجموعة</button>
              </div>
            ) : (
              <div style={{ display:"flex", gap:10 }}>
                <button onClick={()=>{setGroupModalMode("create");setGroupForm({name:"",notes:""});setShowGroupModal(true);}} style={{ padding:"6px 14px", background:"var(--primary)", color:"#fff", border:"none", borderRadius:8, fontSize:12, cursor:"pointer" }}>+ إنشاء مجموعة جديدة</button>
                {groups.length>0&&<button onClick={()=>{setGroupModalMode("addTo");setShowGroupModal(true);}} style={{ padding:"6px 14px", background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, fontSize:12, cursor:"pointer" }}>إضافة إلى مجموعة موجودة</button>}
              </div>
            )}
          </div>
        </div>

        {/* مودال: دفعة */}
        {showPayModal&&(
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }}>
            <div style={{ background:"var(--bg-card)", borderRadius:16, padding:24, width:340, boxShadow:"var(--shadow-xl)" }}>
              <div style={{ fontWeight:700, fontSize:16, marginBottom:16, color:"#2A9D8F" }}>تسجيل دفعة جديدة</div>
              {[{label:"المبلغ",key:"amount",type:"number",ph:"0"},{label:"التاريخ",key:"payment_date",type:"date",ph:""},{label:"ملاحظات (اختياري)",key:"notes",type:"text",ph:"..."}].map(f=>(
                <div key={f.key} style={{ marginBottom:12 }}><div style={{ fontSize:12, color:"var(--text-muted)", marginBottom:4 }}>{f.label}</div><input type={f.type} placeholder={f.ph} value={(payForm as any)[f.key]} onChange={e=>setPayForm(p=>({...p,[f.key]:e.target.value}))} style={inputStyle}/></div>
              ))}
              <div style={{ marginBottom:16 }}><div style={{ fontSize:12, color:"var(--text-muted)", marginBottom:4 }}>طريقة الدفع</div><select value={payForm.method} onChange={e=>setPayForm(p=>({...p,method:e.target.value}))} style={inputStyle}>{["نقدي","تحويل بنكي","شيك"].map(m=><option key={m}>{m}</option>)}</select></div>
              <div style={{ display:"flex", gap:10 }}>
                <button onClick={addPayment} disabled={savingPay} style={{ flex:1, padding:10, background:"#2A9D8F", color:"#fff", border:"none", borderRadius:8, fontFamily:"var(--font-body)", cursor:"pointer" }}>{savingPay?"جارٍ الحفظ...":"حفظ"}</button>
                <button onClick={()=>setShowPayModal(false)} style={{ flex:1, padding:10, background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, fontFamily:"var(--font-body)", cursor:"pointer" }}>إلغاء</button>
              </div>
            </div>
          </div>
        )}

        {/* مودال: بند خاص */}
        {showChargeModal&&(
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }}>
            <div style={{ background:"var(--bg-card)", borderRadius:16, padding:24, width:340, boxShadow:"var(--shadow-xl)" }}>
              <div style={{ fontWeight:700, fontSize:16, marginBottom:16, color:chargeType==="إضافة"?"#E8951A":"#C0392B" }}>{chargeType==="إضافة"?"إضافة بند خاص":"إضافة خصم خاص"}</div>
              {[{label:"الوصف",key:"description",ph:"مثال: ليموزين من المطار"},{label:"المبلغ",key:"amount",ph:"0"},{label:"ملاحظات (اختياري)",key:"notes",ph:"..."}].map(f=>(
                <div key={f.key} style={{ marginBottom:12 }}><div style={{ fontSize:12, color:"var(--text-muted)", marginBottom:4 }}>{f.label}</div><input type={f.key==="amount"?"number":"text"} placeholder={f.ph} value={(chargeForm as any)[f.key]} onChange={e=>setChargeForm(p=>({...p,[f.key]:e.target.value}))} style={inputStyle}/></div>
              ))}
              <div style={{ display:"flex", gap:10 }}>
                <button onClick={addCustomCharge} disabled={savingCharge} style={{ flex:1, padding:10, background:chargeType==="إضافة"?"#E8951A":"#C0392B", color:"#fff", border:"none", borderRadius:8, fontFamily:"var(--font-body)", cursor:"pointer" }}>{savingCharge?"جارٍ الحفظ...":"حفظ"}</button>
                <button onClick={()=>setShowChargeModal(false)} style={{ flex:1, padding:10, background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, fontFamily:"var(--font-body)", cursor:"pointer" }}>إلغاء</button>
              </div>
            </div>
          </div>
        )}

        {/* مودال: مجموعة */}
        {showGroupModal&&(
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }}>
            <div style={{ background:"var(--bg-card)", borderRadius:16, padding:24, width:360, boxShadow:"var(--shadow-xl)", maxHeight:"80vh", overflowY:"auto" }}>
              {groupModalMode==="create"?(
                <>
                  <div style={{ fontWeight:700, fontSize:16, marginBottom:16, color:"var(--em8)" }}>إنشاء مجموعة مالية جديدة</div>
                  <div style={{ marginBottom:12 }}><div style={{ fontSize:12, color:"var(--text-muted)", marginBottom:4 }}>اسم المجموعة</div><input type="text" placeholder="مثال: عائلة الأحمدي" value={groupForm.name} onChange={e=>setGroupForm(p=>({...p,name:e.target.value}))} style={inputStyle}/></div>
                  <div style={{ marginBottom:16 }}><div style={{ fontSize:12, color:"var(--text-muted)", marginBottom:4 }}>ملاحظات (اختياري)</div><input type="text" placeholder="..." value={groupForm.notes} onChange={e=>setGroupForm(p=>({...p,notes:e.target.value}))} style={inputStyle}/></div>
                  <div style={{ display:"flex", gap:10 }}>
                    <button onClick={createGroupAndAdd} disabled={savingGroup} style={{ flex:1, padding:10, background:"var(--primary)", color:"#fff", border:"none", borderRadius:8, fontFamily:"var(--font-body)", cursor:"pointer" }}>{savingGroup?"جارٍ الإنشاء...":"إنشاء وإضافة الحاج"}</button>
                    <button onClick={()=>setShowGroupModal(false)} style={{ flex:1, padding:10, background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, fontFamily:"var(--font-body)", cursor:"pointer" }}>إلغاء</button>
                  </div>
                </>
              ):(
                <>
                  <div style={{ fontWeight:700, fontSize:16, marginBottom:16, color:"var(--em8)" }}>إضافة إلى مجموعة موجودة</div>
                  {groups.map(g=>(
                    <div key={g.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px solid var(--border)" }}>
                      <div><div style={{ fontSize:13, fontWeight:600 }}>{g.name}</div><div style={{ fontSize:11, color:"var(--text-muted)" }}>{groupMembers.filter(m=>m.group_id===g.id).length} أعضاء</div></div>
                      <button
                        disabled={addingMemberId===selectedP.id}
                        onClick={()=>addMemberToGroup(g.id,selectedP.id)}
                        style={{ padding:"4px 14px", background:addingMemberId===selectedP.id?"var(--bg-2)":"var(--primary)", color:addingMemberId===selectedP.id?"var(--text-muted)":"#fff", border:"none", borderRadius:6, fontSize:12, cursor:addingMemberId===selectedP.id?"not-allowed":"pointer" }}>
                        {addingMemberId===selectedP.id?"جارٍ...":"إضافة"}
                      </button>
                    </div>
                  ))}
                  <button onClick={()=>setShowGroupModal(false)} style={{ width:"100%", marginTop:16, padding:10, background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, fontFamily:"var(--font-body)", cursor:"pointer" }}>إغلاق</button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════
  // REPORTS VIEW
  // ══════════════════════════════════════════════
  if (subView === "reports") {
    const allData=sortedPassengers.map(p=>{const due=calcTotalDue(p,pricing,customCharges),paid=calcTotalPaid(p.id,payments);return{p,due,paid,balance:due-paid};});
    const totDue=allData.reduce((s,r)=>s+r.due,0),totPaid=allData.reduce((s,r)=>s+r.paid,0),totBal=totDue-totPaid;
    const filtered=reportType==="late"?allData.filter(r=>r.balance>0):allData;
    const printActions:Record<string,()=>void>={ full:()=>printFullReport(allData), late:()=>printFullReport(allData.filter(r=>r.balance>0),"تقرير المتأخرين"), payments:printPaymentsReport, packages:printPackagesReport, addons:printAddonsReport };
    return (
      <div style={{ flex:1, overflowY:"auto", padding:20 }}>
        <AlertModal alert={alertState} onClose={()=>showAlert(null)} />
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
          <button onClick={()=>setSubView("list")} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--primary)", fontSize:24 }}>←</button>
          <div style={{ fontFamily:"var(--font-heading)", fontSize:18, fontWeight:700, color:"var(--em8)" }}>التقارير المالية</div>
          <button onClick={printActions[reportType]} style={{ marginRight:"auto", padding:"7px 18px", background:"var(--em8)", color:"#fff", border:"none", borderRadius:8, fontSize:13, cursor:"pointer", fontWeight:600 }}>🖨️ طباعة</button>
        </div>
        <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
          {([{key:"full",label:"تقرير الحجاج الكامل"},{key:"late",label:"المتأخرون"},{key:"payments",label:"تقرير الدفعات"},{key:"packages",label:"تقرير الباقات"},{key:"addons",label:"ملخص الإضافات"}] as const).map(t=>(
            <button key={t.key} onClick={()=>setReportType(t.key)} style={{ padding:"6px 16px", borderRadius:99, border:"none", fontFamily:"var(--font-body)", fontSize:12, cursor:"pointer", fontWeight:reportType===t.key?700:400, background:reportType===t.key?"var(--em8)":"var(--bg-2)", color:reportType===t.key?"#fff":"var(--text)" }}>{t.label}</button>
          ))}
        </div>
        {(reportType==="full"||reportType==="late")&&(
          <>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:16 }}>
              {[{label:"إجمالي المطلوب",value:fmtAmt(totDue),color:"var(--em8)"},{label:"إجمالي المحصل",value:fmtAmt(totPaid),color:"#2A9D8F"},{label:"إجمالي المتبقي",value:fmtAmt(totBal),color:"#C0392B"}].map(c=>(
                <div key={c.label} style={{ background:"var(--bg-card)", borderRadius:10, padding:"12px 16px", textAlign:"center", boxShadow:"var(--shadow-sm)" }}><div style={{ fontSize:11, color:"var(--text-muted)", marginBottom:4 }}>{c.label}</div><div style={{ fontSize:18, fontWeight:700, color:c.color }}>{c.value}</div><div style={{ fontSize:10, color:"var(--text-muted)" }}>ر.ق</div></div>
              ))}
            </div>
            <div style={{ background:"var(--bg-card)", borderRadius:12, overflow:"hidden", boxShadow:"var(--shadow-sm)" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead><tr><th style={{ ...thStyle, textAlign:"center", width:36 }}>م</th><th style={thStyle}>الاسم</th><th style={{ ...thStyle, textAlign:"center" }}>الباقة</th><th style={{ ...thStyle, textAlign:"center" }}>المطلوب</th><th style={{ ...thStyle, textAlign:"center" }}>المدفوع</th><th style={{ ...thStyle, textAlign:"center" }}>المتبقي</th><th style={{ ...thStyle, textAlign:"center" }}>الحالة</th></tr></thead>
                <tbody>
                  {filtered.map(({p,due,paid,balance},i)=>{const st=financeStatus(due,paid);return(<tr key={p.id} onClick={()=>{setSelectedP(p);setSubView("detail");}} style={{ cursor:"pointer", background:i%2===0?"white":"var(--bg-2)" }}><td style={{ ...tdStyle, textAlign:"center", color:"var(--text-muted)", fontSize:12 }}>{i+1}</td><td style={tdStyle}>{p.short_ar||p.name_ar}</td><td style={{ ...tdStyle, textAlign:"center", fontSize:11, color:"var(--text-muted)" }}>{pricing[getPackageKey(p.services.hotel_type)]?.label||"—"}</td><td style={{ ...tdStyle, textAlign:"center", color:"var(--em8)", fontWeight:600 }}>{fmtAmt(due)}</td><td style={{ ...tdStyle, textAlign:"center", color:"#2A9D8F", fontWeight:600 }}>{fmtAmt(paid)}</td><td style={{ ...tdStyle, textAlign:"center", color:balance>0?"#C0392B":"#2A9D8F", fontWeight:600 }}>{fmtAmt(balance)}</td><td style={{ ...tdStyle, textAlign:"center" }}><span style={{ fontSize:11, padding:"2px 8px", borderRadius:99, background:st.bg, color:st.color, fontWeight:700 }}>{st.label}</span></td></tr>);})}
                  <tr style={{ background:"var(--em8)", color:"#fff", fontWeight:700 }}><td style={{ padding:"10px 12px" }} colSpan={3}>الإجمالي</td><td style={{ padding:"10px 12px", textAlign:"center" }}>{fmtAmt(totDue)}</td><td style={{ padding:"10px 12px", textAlign:"center" }}>{fmtAmt(totPaid)}</td><td style={{ padding:"10px 12px", textAlign:"center" }}>{fmtAmt(totBal)}</td><td style={{ padding:"10px 12px" }}></td></tr>
                </tbody>
              </table>
            </div>
          </>
        )}
        {reportType==="payments"&&(
          <div style={{ background:"var(--bg-card)", borderRadius:12, overflow:"hidden", boxShadow:"var(--shadow-sm)" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr><th style={{ ...thStyle, textAlign:"center", width:36 }}>م</th><th style={thStyle}>الحاج</th><th style={{ ...thStyle, textAlign:"center" }}>التاريخ</th><th style={{ ...thStyle, textAlign:"center" }}>طريقة الدفع</th><th style={{ ...thStyle, textAlign:"center" }}>المبلغ</th><th style={thStyle}>ملاحظات</th></tr></thead>
              <tbody>
                {[...payments].sort((a,b)=>new Date(b.payment_date).getTime()-new Date(a.payment_date).getTime()).map((py,i)=>{const p=passengers.find(x=>x.id===py.passenger_id);return(<tr key={py.id} style={{ background:i%2===0?"white":"var(--bg-2)" }}><td style={{ ...tdStyle, textAlign:"center", color:"var(--text-muted)", fontSize:12 }}>{i+1}</td><td style={tdStyle}>{p?(p.short_ar||p.name_ar):"—"}</td><td style={{ ...tdStyle, textAlign:"center" }}>{py.payment_date}</td><td style={{ ...tdStyle, textAlign:"center" }}>{py.method}</td><td style={{ ...tdStyle, textAlign:"center", color:"#2A9D8F", fontWeight:600 }}>{fmtAmt(py.amount)}</td><td style={{ ...tdStyle, color:"var(--text-muted)", fontSize:12 }}>{py.notes||"—"}</td></tr>);})}
                <tr style={{ background:"var(--em8)", color:"#fff", fontWeight:700 }}><td style={{ padding:"10px 12px" }} colSpan={4}>الإجمالي</td><td style={{ padding:"10px 12px", textAlign:"center" }}>{fmtAmt(payments.reduce((s,p)=>s+Number(p.amount),0))}</td><td style={{ padding:"10px 12px" }}></td></tr>
              </tbody>
            </table>
          </div>
        )}
        {reportType==="packages"&&(
          <div style={{ background:"var(--bg-card)", borderRadius:12, overflow:"hidden", boxShadow:"var(--shadow-sm)" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr><th style={thStyle}>الباقة</th><th style={{ ...thStyle, textAlign:"center" }}>عدد الحجاج</th><th style={{ ...thStyle, textAlign:"center" }}>السعر الواحد</th><th style={{ ...thStyle, textAlign:"center" }}>الإجمالي المستحق</th></tr></thead>
              <tbody>{PRICING_KEYS.filter(k=>k.type==="package").map((pk,i)=>{const count=sortedPassengers.filter(p=>getPackageKey(p.services.hotel_type)===pk.key).length,price=pricing[pk.key]?.amount||0;return(<tr key={pk.key} style={{ background:i%2===0?"white":"var(--bg-2)" }}><td style={tdStyle}>{pk.label}</td><td style={{ ...tdStyle, textAlign:"center", fontWeight:700 }}>{count}</td><td style={{ ...tdStyle, textAlign:"center" }}>{fmtAmt(price)}</td><td style={{ ...tdStyle, textAlign:"center", color:"var(--em8)", fontWeight:700 }}>{fmtAmt(count*price)}</td></tr>);})}</tbody>
            </table>
          </div>
        )}
        {reportType==="addons"&&(
          <div style={{ background:"var(--bg-card)", borderRadius:12, overflow:"hidden", boxShadow:"var(--shadow-sm)" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr><th style={thStyle}>الإضافة / الخصم</th><th style={{ ...thStyle, textAlign:"center" }}>عدد الحجاج</th><th style={{ ...thStyle, textAlign:"center" }}>السعر الواحد</th><th style={{ ...thStyle, textAlign:"center" }}>الإجمالي</th></tr></thead>
              <tbody>{[{key:"addon_view",check:(p:Passenger)=>p.services.hotel_view==="مطلة"},{key:"addon_mina",check:(p:Passenger)=>p.services.camp_mina==="خاص"},{key:"addon_arafa",check:(p:Passenger)=>p.services.camp_arafa==="خاص"},{key:"addon_bus_vip",check:(p:Passenger)=>p.services.bus==="VIP"},{key:"addon_first_class",check:(p:Passenger)=>(p as any).flight_class==="درجة أولى"},{key:"discount_no_ticket",check:(p:Passenger)=>(p as any).flight_class==="بدون"}].map((a,i)=>{const count=sortedPassengers.filter(a.check).length,price=pricing[a.key]?.amount||0,isDis=a.key==="discount_no_ticket";return(<tr key={a.key} style={{ background:i%2===0?"white":"var(--bg-2)" }}><td style={tdStyle}>{pricing[a.key]?.label||a.key}</td><td style={{ ...tdStyle, textAlign:"center", fontWeight:700 }}>{count}</td><td style={{ ...tdStyle, textAlign:"center" }}>{fmtAmt(price)}</td><td style={{ ...tdStyle, textAlign:"center", color:isDis?"#C0392B":"var(--em8)", fontWeight:700 }}>{isDis?`(${fmtAmt(count*price)})`:fmtAmt(count*price)}</td></tr>);})}</tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════
  // MAIN LIST VIEW
  // ══════════════════════════════════════════════
  const totDueAll=sortedPassengers.reduce((s,p)=>s+calcTotalDue(p,pricing,customCharges),0);
  const totPaidAll=sortedPassengers.reduce((s,p)=>s+calcTotalPaid(p.id,payments),0);
  const lateCount=sortedPassengers.filter(p=>calcTotalDue(p,pricing,customCharges)>calcTotalPaid(p.id,payments)).length;
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      <AlertModal alert={alertState} onClose={()=>showAlert(null)} />
      <ReceiptModal />
      <div style={{ padding:"12px 20px", background:"var(--bg-card)", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
        <div style={{ fontFamily:"var(--font-heading)", fontSize:18, fontWeight:700, color:"var(--em8)" }}>الحسابات المالية</div>
        <div style={{ marginRight:"auto", display:"flex", gap:8 }}>
          <button onClick={()=>setSubView("reports")} style={{ padding:"6px 14px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg-2)", fontFamily:"var(--font-body)", fontSize:12, cursor:"pointer" }}>التقارير</button>
          <button onClick={()=>setSubView("settings")} style={{ padding:"6px 14px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg-2)", fontFamily:"var(--font-body)", fontSize:12, cursor:"pointer" }}>إعدادات الأسعار</button>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, padding:"12px 20px", flexShrink:0 }}>
        {[{label:"إجمالي المطلوب",value:fmtAmt(totDueAll),color:"var(--em8)",unit:"ر.ق"},{label:"إجمالي المحصل",value:fmtAmt(totPaidAll),color:"#2A9D8F",unit:"ر.ق"},{label:"إجمالي المتبقي",value:fmtAmt(totDueAll-totPaidAll),color:"#C0392B",unit:"ر.ق"},{label:"عدد المتأخرين",value:String(lateCount),color:"#E8951A",unit:"حاج"}].map(card=>(
          <div key={card.label} style={{ background:"var(--bg-card)", borderRadius:12, padding:"14px 16px", textAlign:"center", boxShadow:"var(--shadow-sm)" }}><div style={{ fontSize:11, color:"var(--text-muted)", marginBottom:4 }}>{card.label}</div><div style={{ fontSize:22, fontWeight:700, color:card.color }}>{card.value}</div><div style={{ fontSize:10, color:"var(--text-muted)" }}>{card.unit}</div></div>
        ))}
      </div>
      <div style={{ padding:"0 20px 12px", display:"flex", gap:10, flexShrink:0 }}>
        <input type="text" placeholder="🔍 بحث عن حاج..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} style={{ flex:1, padding:"8px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg-input)", fontFamily:"var(--font-body)", fontSize:13 }} />
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value as any)} style={{ padding:"8px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg-input)", fontFamily:"var(--font-body)", fontSize:13, minWidth:120 }}>
          <option value="all">كل الحالات</option><option value="paid">مسدد</option><option value="partial">جزئي</option><option value="unpaid">لم يدفع</option>
        </select>
        <select value={filterPackage} onChange={e=>setFilterPackage(e.target.value)} style={{ padding:"8px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg-input)", fontFamily:"var(--font-body)", fontSize:13, minWidth:130 }}>
          <option value="all">كل الباقات</option>
          {PRICING_KEYS.filter(k=>k.type==="package").map(pk=><option key={pk.key} value={pk.key}>{pk.label}</option>)}
        </select>
        {(searchTerm||filterStatus!=="all"||filterPackage!=="all")&&<button onClick={()=>{setSearchTerm("");setFilterStatus("all");setFilterPackage("all");}} style={{ padding:"8px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg-2)", fontFamily:"var(--font-body)", fontSize:12, cursor:"pointer", color:"#C0392B", whiteSpace:"nowrap" }}>✕ مسح</button>}
      </div>
      {loading?(
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", color:"var(--text-muted)" }}>جارٍ التحميل...</div>
      ):(
        <div style={{ flex:1, overflowY:"auto", padding:"0 20px 20px" }}>
          {filteredPassengers.length===0?(
            <div style={{ textAlign:"center", padding:40, color:"var(--text-muted)", fontSize:14 }}>لا توجد نتائج مطابقة للبحث</div>
          ):(
            <div style={{ background:"var(--bg-card)", borderRadius:12, overflow:"hidden", boxShadow:"var(--shadow-sm)" }}>
              <div style={{ padding:"8px 16px", background:"var(--bg-2)", borderBottom:"1px solid var(--border)", fontSize:11, color:"var(--text-muted)" }}>عرض {filteredPassengers.length} من {sortedPassengers.length} حاج</div>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead style={{ position:"sticky", top:0, zIndex:10 }}>
                  <tr>{["م","الاسم","الباقة","الإضافات","المطلوب","المدفوع","المتبقي","الحالة"].map(h=><th key={h} style={{ ...thStyle, textAlign:h==="م"?"center":"right" }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {filteredPassengers.map((p,i)=>{
                    const due=calcTotalDue(p,pricing,customCharges),paid=calcTotalPaid(p.id,payments),bal=due-paid,st=financeStatus(due,paid),s=p.services;
                    const badges:string[]=[];
                    if(s.hotel_view==="مطلة") badges.push("مطلة");
                    if(s.camp_mina==="خاص")  badges.push("منى خاص");
                    if(s.camp_arafa==="خاص") badges.push("عرفة خاص");
                    if(s.bus==="VIP")         badges.push("VIP");
                    if((p as any).flight_class==="درجة أولى") badges.push("درجة أولى");
                    if((p as any).flight_class==="بدون")      badges.push("بدون تذكرة");
                    const pGroup=getPassengerGroup(p.id);
                    return(
                      <tr key={p.id} onClick={()=>{setSelectedP(p);setSubView("detail");}} style={{ cursor:"pointer", background:i%2===0?"white":"var(--bg-2)" }}>
                        <td style={{ ...tdStyle, textAlign:"center", color:"var(--text-muted)", fontSize:12 }}>{i+1}</td>
                        <td style={tdStyle}><div style={{ display:"flex", alignItems:"center", gap:6 }}>{p.short_ar||p.name_ar}{pGroup&&<span style={{ fontSize:10, padding:"1px 6px", borderRadius:99, background:"rgba(125,31,60,0.1)", color:"var(--em8)", cursor:"pointer" }} onClick={e=>{e.stopPropagation();setSelectedGroup(pGroup);setSubView("group");}}>{pGroup.name}</span>}</div></td>
                        <td style={{ ...tdStyle, fontSize:11, color:"var(--text-muted)" }}>{pricing[getPackageKey(s.hotel_type)]?.label||"—"}</td>
                        <td style={tdStyle}><div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>{badges.map(b=><span key={b} style={{ fontSize:10, padding:"1px 6px", borderRadius:99, background:"rgba(232,149,26,0.1)", color:"#E8951A" }}>{b}</span>)}</div></td>
                        <td style={{ ...tdStyle, textAlign:"center", color:"var(--em8)", fontWeight:700 }}>{fmtAmt(due)}</td>
                        <td style={{ ...tdStyle, textAlign:"center", color:"#2A9D8F", fontWeight:700 }}>{fmtAmt(paid)}</td>
                        <td style={{ ...tdStyle, textAlign:"center", color:bal>0?"#C0392B":"#2A9D8F", fontWeight:700 }}>{fmtAmt(bal)}</td>
                        <td style={{ ...tdStyle, textAlign:"center" }}><span style={{ fontSize:11, padding:"2px 10px", borderRadius:99, background:st.bg, color:st.color, fontWeight:700 }}>{st.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
