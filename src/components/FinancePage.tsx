import { useState, useEffect } from "react";
import { AlertModal, useAlert } from "./AlertModal";
import { supabase } from "../supabase";
import { useConfig } from "../config/ConfigContext";
import { makeHTML, printInPage } from "../utils";
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
  { key: "package_double",     label: "باقة ثنائي",         type: "package"  },
  { key: "package_triple",     label: "باقة ثلاثي",         type: "package"  },
  { key: "package_quad",       label: "باقة رباعي",         type: "package"  },
  { key: "package_suite",      label: "باقة سويت",          type: "package"  },
  { key: "addon_view",         label: "إضافة مطلة",         type: "addon"    },
  { key: "addon_mina",         label: "خيمة خاصة - منى",   type: "addon"    },
  { key: "addon_arafa",        label: "خيمة خاصة - عرفة",  type: "addon"    },
  { key: "addon_bus_vip",      label: "باص VIP",            type: "addon"    },
  { key: "addon_first_class",  label: "طيران درجة أولى",    type: "addon"    },
  { key: "discount_no_ticket", label: "خصم بدون تذكرة",     type: "discount" },
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
  if (s.hotel_view === "مطلة") total += pricing["addon_view"]?.amount || 0;
  if (s.camp_mina === "خاص")  total += pricing["addon_mina"]?.amount || 0;
  if (s.camp_arafa === "خاص") total += pricing["addon_arafa"]?.amount || 0;
  if (s.bus === "VIP")         total += pricing["addon_bus_vip"]?.amount || 0;
  if ((p as any).flight_class === "درجة أولى") total += pricing["addon_first_class"]?.amount || 0;
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

// ============================================================
// دالة الطباعة المشتركة
// ============================================================
function buildPrintTable(headers: string[], rows: string[][], totalsRow?: string[], primaryColor = "#6B1F3A"): string {
  const ths = headers.map(h => `<th>${h}</th>`).join("");
  const trs = rows.map((r, i) =>
    `<tr style="${i % 2 === 1 ? "background:rgba(212,160,23,0.05)" : ""}">${r.map(c => `<td>${c}</td>`).join("")}</tr>`
  ).join("");
  const totals = totalsRow
    ? `<tr style="background:${primaryColor};color:#fff;font-weight:700">${totalsRow.map(c => `<td>${c}</td>`).join("")}</tr>`
    : "";
  return `<table><tr>${ths}</tr>${trs}${totals}</table>`;
}

// ============================================================
// المكوّن الرئيسي
// ============================================================
export function FinancePage({ passengers, currentUser }: { passengers: Passenger[]; currentUser: User }) {
  const config = useConfig();
  const { alert: alertState, showAlert } = useAlert();

  const [subView, setSubView] = useState<"list" | "detail" | "settings" | "reports" | "group">("list");
  const [selectedP, setSelectedP]   = useState<Passenger | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<FinancialGroup | null>(null);

  const [pricing, setPricing]           = useState<PricingMap>({});
  const [payments, setPayments]         = useState<Payment[]>([]);
  const [customCharges, setCustomCharges] = useState<CustomCharge[]>([]);
  const [groups, setGroups]             = useState<FinancialGroup[]>([]);
  const [groupMembers, setGroupMembers] = useState<FinancialGroupMember[]>([]);
  const [loading, setLoading]           = useState(true);

  // بحث وفلتر
  const [searchTerm, setSearchTerm]     = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "paid" | "partial" | "unpaid">("all");
  const [filterPackage, setFilterPackage] = useState("all");

  // مودال دفعة
  const [showPayModal, setShowPayModal] = useState(false);
  const [payForm, setPayForm] = useState({ amount: "", payment_date: new Date().toISOString().split("T")[0], method: "نقدي", notes: "" });
  const [savingPay, setSavingPay] = useState(false);

  // مودال بند خاص
  const [showChargeModal, setShowChargeModal] = useState(false);
  const [chargeType, setChargeType] = useState<"إضافة" | "خصم">("إضافة");
  const [chargeForm, setChargeForm] = useState({ description: "", amount: "", notes: "" });
  const [savingCharge, setSavingCharge] = useState(false);

  // إعدادات الأسعار
  const [editPricing, setEditPricing]   = useState<Record<string, string>>({});
  const [savingPricing, setSavingPricing] = useState(false);

  // تقارير
  const [reportType, setReportType] = useState<"full" | "late" | "payments" | "packages" | "addons">("full");

  // مجموعة مالية
  const [showGroupModal, setShowGroupModal]     = useState(false);
  const [groupModalMode, setGroupModalMode]     = useState<"create" | "addTo">("create");
  const [groupForm, setGroupForm]               = useState({ name: "", notes: "" });
  const [savingGroup, setSavingGroup]           = useState(false);
  const [showGroupPayModal, setShowGroupPayModal] = useState(false);
  const [groupPayForm, setGroupPayForm] = useState({ amount: "", payment_date: new Date().toISOString().split("T")[0], method: "نقدي", notes: "" });
  const [savingGroupPay, setSavingGroupPay]     = useState(false);

  useEffect(() => { loadFinanceData(); }, []);

  async function loadFinanceData() {
    setLoading(true);
    const [pRes, pyRes, ccRes, gRes, gmRes] = await Promise.all([
      supabase.from("pricing_settings").select("*"),
      supabase.from("payments").select("*").order("payment_date", { ascending: false }),
      supabase.from("custom_charges").select("*"),
      supabase.from("financial_groups").select("*").order("created_at", { ascending: false }),
      supabase.from("financial_group_members").select("*"),
    ]);
    if (pRes.data) {
      const map: PricingMap = {};
      const em: Record<string, string> = {};
      pRes.data.forEach((r: any) => {
        map[r.key] = { label: r.label, amount: Number(r.amount), type: r.type };
        em[r.key] = String(r.amount);
      });
      setPricing(map);
      setEditPricing(em);
    }
    if (pyRes.data) setPayments(pyRes.data as Payment[]);
    if (ccRes.data) setCustomCharges(ccRes.data as CustomCharge[]);
    if (gRes.data)  setGroups(gRes.data as FinancialGroup[]);
    if (gmRes.data) setGroupMembers(gmRes.data as FinancialGroupMember[]);
    setLoading(false);
  }

  // ── أسعار ──
  async function savePricing() {
    setSavingPricing(true);
    for (const key of Object.keys(editPricing)) {
      await supabase.from("pricing_settings")
        .update({ amount: Number(editPricing[key]), updated_at: new Date().toISOString() })
        .eq("key", key);
    }
    await loadFinanceData();
    setSavingPricing(false);
    showAlert("success", "تم حفظ الأسعار بنجاح");
  }

  // ── دفعات ──
  async function addPayment() {
    if (!selectedP || !payForm.amount) return;
    setSavingPay(true);
    const { data, error } = await supabase.from("payments").insert({
      passenger_id: selectedP.id,
      amount: Number(payForm.amount),
      payment_date: payForm.payment_date,
      method: payForm.method,
      notes: payForm.notes,
      created_by: (currentUser as any).username || "",
    }).select().single();
    if (!error && data) {
      setPayments(prev => [data as Payment, ...prev]);
      setShowPayModal(false);
      setPayForm({ amount: "", payment_date: new Date().toISOString().split("T")[0], method: "نقدي", notes: "" });
    }
    setSavingPay(false);
  }

  async function deletePayment(id: number) {
    if (!confirm("هل تريد حذف هذه الدفعة؟")) return;
    await supabase.from("payments").delete().eq("id", id);
    setPayments(prev => prev.filter(p => p.id !== id));
  }

  // ── بنود خاصة ──
  async function addCustomCharge() {
    if (!selectedP || !chargeForm.description || !chargeForm.amount) return;
    setSavingCharge(true);
    const { data, error } = await supabase.from("custom_charges").insert({
      passenger_id: selectedP.id,
      description: chargeForm.description,
      amount: Number(chargeForm.amount),
      type: chargeType,
      notes: chargeForm.notes,
      created_by: (currentUser as any).username || "",
    }).select().single();
    if (!error && data) {
      setCustomCharges(prev => [...prev, data as CustomCharge]);
      setShowChargeModal(false);
      setChargeForm({ description: "", amount: "", notes: "" });
    }
    setSavingCharge(false);
  }

  async function deleteCustomCharge(id: number) {
    if (!confirm("هل تريد حذف هذا البند؟")) return;
    await supabase.from("custom_charges").delete().eq("id", id);
    setCustomCharges(prev => prev.filter(c => c.id !== id));
  }

  // ── مجموعات مالية ──
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
    const { data: grp, error: ge } = await supabase.from("financial_groups").insert({
      name: groupForm.name.trim(),
      notes: groupForm.notes,
      created_by: (currentUser as any).username || "",
    }).select().single();
    if (!ge && grp) {
      await supabase.from("financial_group_members").insert({ group_id: grp.id, passenger_id: selectedP.id });
      setGroups(prev => [grp as FinancialGroup, ...prev]);
      setGroupMembers(prev => [...prev, { id: Date.now(), group_id: grp.id, passenger_id: selectedP.id }]);
      setShowGroupModal(false);
      setGroupForm({ name: "", notes: "" });
      showAlert("success", `تم إنشاء المجموعة "${grp.name}" وإضافة الحاج إليها`);
    }
    setSavingGroup(false);
  }

  async function addToExistingGroup(groupId: number) {
    if (!selectedP) return;
    const existing = groupMembers.find(m => m.group_id === groupId && m.passenger_id === selectedP.id);
    if (existing) { showAlert("warning", "الحاج موجود بالفعل في هذه المجموعة"); return; }
    setSavingGroup(true);
    const { error } = await supabase.from("financial_group_members").insert({ group_id: groupId, passenger_id: selectedP.id });
    if (!error) {
      setGroupMembers(prev => [...prev, { id: Date.now(), group_id: groupId, passenger_id: selectedP.id }]);
      setShowGroupModal(false);
      showAlert("success", "تمت إضافة الحاج إلى المجموعة بنجاح");
    }
    setSavingGroup(false);
  }

  async function removeFromGroup(passengerId: number, groupId: number) {
    if (!confirm("هل تريد إزالة هذا الحاج من المجموعة؟")) return;
    await supabase.from("financial_group_members").delete().eq("group_id", groupId).eq("passenger_id", passengerId);
    setGroupMembers(prev => prev.filter(m => !(m.group_id === groupId && m.passenger_id === passengerId)));
  }

  async function deleteGroup(groupId: number) {
    if (!confirm("هل تريد حذف هذه المجموعة؟ سيتم فك ارتباط جميع الأعضاء.")) return;
    await supabase.from("financial_groups").delete().eq("id", groupId);
    setGroups(prev => prev.filter(g => g.id !== groupId));
    setGroupMembers(prev => prev.filter(m => m.group_id !== groupId));
    setSubView("list");
  }

  async function addGroupPayment() {
    if (!selectedGroup || !groupPayForm.amount) return;
    const members = getGroupPassengers(selectedGroup.id);
    if (members.length === 0) return;
    setSavingGroupPay(true);
    const perPerson = Math.round((Number(groupPayForm.amount) / members.length) * 100) / 100;
    const inserts = members.map(p => ({
      passenger_id: p.id,
      amount: perPerson,
      payment_date: groupPayForm.payment_date,
      method: groupPayForm.method,
      notes: `${groupPayForm.notes ? groupPayForm.notes + " — " : ""}دفعة مجموعة: ${selectedGroup.name}`,
      created_by: (currentUser as any).username || "",
    }));
    const { data, error } = await supabase.from("payments").insert(inserts).select();
    if (!error && data) {
      setPayments(prev => [...(data as Payment[]), ...prev]);
      setShowGroupPayModal(false);
      setGroupPayForm({ amount: "", payment_date: new Date().toISOString().split("T")[0], method: "نقدي", notes: "" });
      showAlert("success", `تم توزيع ${fmtAmt(Number(groupPayForm.amount))} ر.ق على ${members.length} أعضاء (${fmtAmt(perPerson)} ر.ق للفرد)`);
    }
    setSavingGroupPay(false);
  }

  // ============================================================
  // دوال الطباعة
  // ============================================================
  const primaryColor = config.color_primary || "#6B1F3A";
  const accentColor  = config.color_accent  || "#0C447C";
  const companyName  = config.name_ar || "حملة الأقصى";
  const tagline      = config.tagline || "";
  const logoUrl      = config.logo_url || "";

  function printPassengerStatement(p: Passenger) {
    const s = p.services;
    const pkgKey = getPackageKey(s.hotel_type);
    const pkgAmt = pricing[pkgKey]?.amount || 0;
    const totalDue  = calcTotalDue(p, pricing, customCharges);
    const totalPaid = calcTotalPaid(p.id, payments);
    const balance   = totalDue - totalPaid;
    const pCustom   = customCharges.filter(c => c.passenger_id === p.id);
    const pPayments = [...payments.filter(py => py.passenger_id === p.id)].sort((a,b) => new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime());

    let rows = `<tr><td>${pricing[pkgKey]?.label || "الباقة الأساسية"}</td><td style="text-align:center;color:#C0392B">${fmtAmt(pkgAmt)}</td><td style="text-align:center">—</td></tr>`;
    if (s.hotel_view === "مطلة") rows  += `<tr><td>إضافة مطلة</td><td style="text-align:center;color:#C0392B">${fmtAmt(pricing["addon_view"]?.amount||0)}</td><td style="text-align:center">—</td></tr>`;
    if (s.camp_mina === "خاص")  rows  += `<tr><td>خيمة خاصة - منى</td><td style="text-align:center;color:#C0392B">${fmtAmt(pricing["addon_mina"]?.amount||0)}</td><td style="text-align:center">—</td></tr>`;
    if (s.camp_arafa === "خاص") rows  += `<tr><td>خيمة خاصة - عرفة</td><td style="text-align:center;color:#C0392B">${fmtAmt(pricing["addon_arafa"]?.amount||0)}</td><td style="text-align:center">—</td></tr>`;
    if (s.bus === "VIP")         rows  += `<tr><td>باص VIP</td><td style="text-align:center;color:#C0392B">${fmtAmt(pricing["addon_bus_vip"]?.amount||0)}</td><td style="text-align:center">—</td></tr>`;
    if ((p as any).flight_class === "درجة أولى") rows += `<tr><td>طيران درجة أولى</td><td style="text-align:center;color:#C0392B">${fmtAmt(pricing["addon_first_class"]?.amount||0)}</td><td style="text-align:center">—</td></tr>`;
    if ((p as any).flight_class === "بدون")      rows += `<tr><td>خصم بدون تذكرة</td><td style="text-align:center;color:#2A9D8F">(${fmtAmt(pricing["discount_no_ticket"]?.amount||0)})</td><td style="text-align:center">—</td></tr>`;
    pCustom.forEach(c => {
      rows += `<tr><td>${c.type === "إضافة" ? "بند خاص: " : "خصم خاص: "}${c.description}</td><td style="text-align:center;color:${c.type==="إضافة"?"#C0392B":"#2A9D8F"}">${c.type==="إضافة"?fmtAmt(c.amount):`(${fmtAmt(c.amount)})`}</td><td style="text-align:center">—</td></tr>`;
    });
    pPayments.forEach(py => {
      rows += `<tr><td>دفعة — ${py.payment_date} (${py.method})${py.notes ? " — " + py.notes : ""}</td><td style="text-align:center">—</td><td style="text-align:center;color:#2A9D8F;font-weight:700">${fmtAmt(py.amount)}</td></tr>`;
    });
    const addonsList = [s.hotel_view === "مطلة" ? "مطلة" : "", s.camp_mina === "خاص" ? "منى خاص" : "", s.camp_arafa === "خاص" ? "عرفة خاص" : "", s.bus === "VIP" ? "VIP" : ""].filter(Boolean).join(" · ");
    const body = `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px;direction:rtl">
        <div style="background:${primaryColor}10;border:1px solid ${primaryColor};border-radius:8px;padding:12px;text-align:center"><div style="font-size:11px;color:#888;margin-bottom:4px">المطلوب</div><div style="font-size:22px;font-weight:700;color:${primaryColor}">${fmtAmt(totalDue)}</div><div style="font-size:10px;color:#888">ر.ق</div></div>
        <div style="background:rgba(42,157,143,0.1);border:1px solid #2A9D8F;border-radius:8px;padding:12px;text-align:center"><div style="font-size:11px;color:#888;margin-bottom:4px">المدفوع</div><div style="font-size:22px;font-weight:700;color:#2A9D8F">${fmtAmt(totalPaid)}</div><div style="font-size:10px;color:#888">ر.ق</div></div>
        <div style="background:rgba(192,57,43,0.1);border:1px solid #C0392B;border-radius:8px;padding:12px;text-align:center"><div style="font-size:11px;color:#888;margin-bottom:4px">المتبقي</div><div style="font-size:22px;font-weight:700;color:${balance>0?"#C0392B":"#2A9D8F"}">${fmtAmt(balance)}</div><div style="font-size:10px;color:#888">ر.ق</div></div>
      </div>
      <div style="margin-bottom:8px;font-size:13px;color:#666">الباقة: <strong>${pricing[pkgKey]?.label||"—"}</strong>${addonsList ? "  |  الإضافات: " + addonsList : ""}</div>
      <table style="font-size:13px">
        <tr><th>البيان</th><th style="width:140px;text-align:center">مدين (مطلوب)</th><th style="width:140px;text-align:center">دائن (مدفوع)</th></tr>
        ${rows}
        <tr style="background:${primaryColor};color:#fff;font-weight:700"><td>الرصيد المتبقي</td><td style="text-align:center">${fmtAmt(totalDue)}</td><td style="text-align:center">${fmtAmt(totalPaid)}</td></tr>
      </table>`;
    printInPage(makeHTML(`كشف حساب — ${p.short_ar || p.name_ar}`, body, false, logoUrl, companyName, tagline, primaryColor, accentColor));
  }

  function printFullReport(data: { p: Passenger; due: number; paid: number; balance: number }[]) {
    const totDue  = data.reduce((s,r) => s+r.due, 0);
    const totPaid = data.reduce((s,r) => s+r.paid, 0);
    const totBal  = totDue - totPaid;
    const rows = data.map((r,i) => {
      const st = financeStatus(r.due, r.paid);
      return [String(i+1), r.p.short_ar||r.p.name_ar, pricing[getPackageKey(r.p.services.hotel_type)]?.label||"—",
        `<span style="color:${primaryColor};font-weight:700">${fmtAmt(r.due)}</span>`,
        `<span style="color:#2A9D8F;font-weight:700">${fmtAmt(r.paid)}</span>`,
        `<span style="color:${r.balance>0?"#C0392B":"#2A9D8F"};font-weight:700">${fmtAmt(r.balance)}</span>`,
        `<span style="padding:2px 8px;border-radius:99px;background:${st.bg};color:${st.color}">${st.label}</span>`];
    });
    const body = buildPrintTable(["م","الاسم","الباقة","المطلوب","المدفوع","المتبقي","الحالة"], rows, ["الإجمالي","","",fmtAmt(totDue),fmtAmt(totPaid),fmtAmt(totBal),""], primaryColor);
    printInPage(makeHTML("تقرير الحجاج المالي الكامل", body, true, logoUrl, companyName, tagline, primaryColor, accentColor));
  }

  function printPaymentsReport() {
    const sorted = [...payments].sort((a,b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime());
    const rows = sorted.map((py,i) => {
      const p = passengers.find(x => x.id === py.passenger_id);
      return [String(i+1), p ? (p.short_ar||p.name_ar) : "—", py.payment_date, py.method, `<strong>${fmtAmt(py.amount)}</strong>`, py.notes||"—"];
    });
    const total = payments.reduce((s,p) => s+Number(p.amount), 0);
    const body = buildPrintTable(["م","الحاج","التاريخ","طريقة الدفع","المبلغ","ملاحظات"], rows, ["الإجمالي","","","",fmtAmt(total),""], primaryColor);
    printInPage(makeHTML("تقرير الدفعات", body, true, logoUrl, companyName, tagline, primaryColor, accentColor));
  }

  function printPackagesReport() {
    const rows = PRICING_KEYS.filter(k => k.type === "package").map(pk => {
      const count = passengers.filter(p => getPackageKey(p.services.hotel_type) === pk.key).length;
      const price = pricing[pk.key]?.amount || 0;
      return [pk.label, String(count), fmtAmt(price), `<strong>${fmtAmt(count*price)}</strong>`];
    });
    const body = buildPrintTable(["الباقة","عدد الحجاج","السعر الواحد","الإجمالي المستحق"], rows, undefined, primaryColor);
    printInPage(makeHTML("تقرير الباقات", body, false, logoUrl, companyName, tagline, primaryColor, accentColor));
  }

  function printAddonsReport() {
    const addonChecks = [
      { key: "addon_view",         check: (p: Passenger) => p.services.hotel_view === "مطلة"        },
      { key: "addon_mina",         check: (p: Passenger) => p.services.camp_mina === "خاص"          },
      { key: "addon_arafa",        check: (p: Passenger) => p.services.camp_arafa === "خاص"         },
      { key: "addon_bus_vip",      check: (p: Passenger) => p.services.bus === "VIP"                },
      { key: "addon_first_class",  check: (p: Passenger) => (p as any).flight_class === "درجة أولى" },
      { key: "discount_no_ticket", check: (p: Passenger) => (p as any).flight_class === "بدون"      },
    ];
    const rows = addonChecks.map(a => {
      const count = passengers.filter(a.check).length;
      const price = pricing[a.key]?.amount || 0;
      const label = pricing[a.key]?.label || a.key;
      const isDis = a.key === "discount_no_ticket";
      return [label, String(count), fmtAmt(price), isDis ? `(${fmtAmt(count*price)})` : `<strong>${fmtAmt(count*price)}</strong>`];
    });
    const body = buildPrintTable(["الإضافة / الخصم","عدد الحجاج","السعر الواحد","الإجمالي"], rows, undefined, primaryColor);
    printInPage(makeHTML("ملخص الإضافات", body, false, logoUrl, companyName, tagline, primaryColor, accentColor));
  }

  // ============================================================
  // مساعدات التصميم
  // ============================================================
  const sortedPassengers = [...passengers].sort((a,b) => (a.sort_order||0) - (b.sort_order||0));

  const inputStyle = { width:"100%", padding:"8px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg-input)", fontFamily:"var(--font-body)", fontSize:13, boxSizing:"border-box" as const };
  const thStyle    = { padding:"10px 12px", background:"var(--em8)", color:"#fff", textAlign:"right" as const, fontSize:12, fontWeight:600 };
  const tdStyle    = { padding:"8px 12px", border:"1px solid var(--border)", fontSize:13 };

  // فلتر القايمة الرئيسية
  const filteredPassengers = sortedPassengers.filter(p => {
    const name = (p.short_ar || p.name_ar || "").toLowerCase();
    const search = searchTerm.toLowerCase();
    if (search && !name.includes(search)) return false;
    if (filterPackage !== "all" && getPackageKey(p.services.hotel_type) !== filterPackage) return false;
    if (filterStatus !== "all") {
      const due = calcTotalDue(p, pricing, customCharges);
      const paid = calcTotalPaid(p.id, payments);
      if (filterStatus === "paid"    && !(paid >= due && due > 0)) return false;
      if (filterStatus === "partial" && !(paid > 0 && paid < due)) return false;
      if (filterStatus === "unpaid"  && paid > 0) return false;
    }
    return true;
  });

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
              {type === "package" ? "الباقات الأساسية" : type === "addon" ? "الإضافات" : "الخصومات"}
            </div>
            {PRICING_KEYS.filter(k => k.type === type).map(k => (
              <div key={k.key} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                <div style={{ flex:1, fontSize:13 }}>{k.label}</div>
                <input type="number" min="0" value={editPricing[k.key]||"0"}
                  onChange={e => setEditPricing(prev => ({ ...prev, [k.key]: e.target.value }))}
                  style={{ width:130, padding:"6px 10px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg-input)", textAlign:"center", fontSize:13 }} />
                <span style={{ fontSize:12, color:"var(--text-muted)", width:24 }}>ر.ق</span>
              </div>
            ))}
          </div>
        ))}
        <button onClick={savePricing} disabled={savingPricing}
          style={{ width:"100%", padding:12, background:"var(--primary)", color:"#fff", border:"none", borderRadius:10, fontFamily:"var(--font-body)", fontSize:14, cursor:"pointer", fontWeight:600 }}>
          {savingPricing ? "جارٍ الحفظ..." : "حفظ الأسعار"}
        </button>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════
  // GROUP VIEW
  // ══════════════════════════════════════════════
  if (subView === "group" && selectedGroup) {
    const gPassengers = getGroupPassengers(selectedGroup.id);
    const gTotDue  = gPassengers.reduce((s,p) => s + calcTotalDue(p, pricing, customCharges), 0);
    const gTotPaid = gPassengers.reduce((s,p) => s + calcTotalPaid(p.id, payments), 0);
    const gTotBal  = gTotDue - gTotPaid;
    const gSt = financeStatus(gTotDue, gTotPaid);
    const otherPassengers = passengers.filter(p => !gPassengers.find(gp => gp.id === p.id));

    return (
      <div style={{ flex:1, overflowY:"auto", padding:20 }}>
        <AlertModal alert={alertState} onClose={() => showAlert(null)} />
        <div style={{ maxWidth:720, margin:"0 auto" }}>
          {/* رأس الصفحة */}
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
            <button onClick={() => { setSubView("list"); setSelectedGroup(null); }} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--primary)", fontSize:24 }}>←</button>
            <div>
              <div style={{ fontFamily:"var(--font-heading)", fontSize:18, fontWeight:700, color:"var(--em8)" }}>{selectedGroup.name}</div>
              <div style={{ fontSize:11, color:"var(--text-muted)" }}>{gPassengers.length} أعضاء</div>
            </div>
            <span style={{ marginRight:"auto", fontSize:12, padding:"4px 14px", borderRadius:99, background:gSt.bg, color:gSt.color, fontWeight:700 }}>{gSt.label}</span>
            <button onClick={() => deleteGroup(selectedGroup.id)} style={{ padding:"6px 12px", background:"var(--danger-bg)", color:"var(--danger)", border:"1px solid var(--danger)", borderRadius:8, fontSize:12, cursor:"pointer" }}>حذف المجموعة</button>
          </div>

          {/* بطاقات الملخص */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:20 }}>
            {[
              { label:"إجمالي المطلوب", value:fmtAmt(gTotDue),  color:"var(--em8)"    },
              { label:"إجمالي المدفوع", value:fmtAmt(gTotPaid), color:"#2A9D8F"        },
              { label:"إجمالي المتبقي", value:fmtAmt(gTotBal),  color:gTotBal>0?"#C0392B":"#2A9D8F" },
            ].map(card => (
              <div key={card.label} style={{ background:"var(--bg-card)", borderRadius:12, padding:"14px 16px", textAlign:"center", boxShadow:"var(--shadow-sm)" }}>
                <div style={{ fontSize:11, color:"var(--text-muted)", marginBottom:4 }}>{card.label}</div>
                <div style={{ fontSize:20, fontWeight:700, color:card.color }}>{card.value}</div>
                <div style={{ fontSize:10, color:"var(--text-muted)" }}>ر.ق</div>
              </div>
            ))}
          </div>

          {/* أزرار */}
          <div style={{ display:"flex", gap:10, marginBottom:16 }}>
            <button onClick={() => setShowGroupPayModal(true)}
              style={{ flex:1, padding:10, background:"#2A9D8F", color:"#fff", border:"none", borderRadius:10, fontFamily:"var(--font-body)", fontSize:13, cursor:"pointer", fontWeight:600 }}>
              + دفعة مشتركة (تُوزَّع على الأعضاء)
            </button>
            <button onClick={() => { setGroupModalMode("addTo"); setShowGroupModal(true); }}
              style={{ flex:1, padding:10, background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:10, fontFamily:"var(--font-body)", fontSize:13, cursor:"pointer" }}>
              + إضافة عضو
            </button>
          </div>

          {/* الأعضاء */}
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
                {gPassengers.map((p, i) => {
                  const due  = calcTotalDue(p, pricing, customCharges);
                  const paid = calcTotalPaid(p.id, payments);
                  const bal  = due - paid;
                  const st   = financeStatus(due, paid);
                  return (
                    <tr key={p.id} style={{ background: i%2===0?"white":"var(--bg-2)" }}>
                      <td style={tdStyle}>
                        <span style={{ cursor:"pointer", color:"var(--em8)", fontWeight:600 }}
                          onClick={() => { setSelectedP(p); setSubView("detail"); }}>
                          {p.short_ar || p.name_ar}
                        </span>
                        <span style={{ fontSize:10, padding:"1px 6px", borderRadius:99, background:st.bg, color:st.color, marginRight:6 }}>{st.label}</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign:"center", color:"var(--em8)", fontWeight:600 }}>{fmtAmt(due)}</td>
                      <td style={{ ...tdStyle, textAlign:"center", color:"#2A9D8F", fontWeight:600 }}>{fmtAmt(paid)}</td>
                      <td style={{ ...tdStyle, textAlign:"center", color:bal>0?"#C0392B":"#2A9D8F", fontWeight:600 }}>{fmtAmt(bal)}</td>
                      <td style={{ ...tdStyle, textAlign:"center" }}>
                        <button onClick={() => removeFromGroup(p.id, selectedGroup.id)}
                          style={{ background:"none", border:"none", cursor:"pointer", color:"var(--danger)", fontSize:12 }}>إزالة</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* مودال: إضافة عضو */}
          {showGroupModal && groupModalMode === "addTo" && (
            <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }}>
              <div style={{ background:"var(--bg-card)", borderRadius:16, padding:24, width:360, boxShadow:"var(--shadow-xl)", maxHeight:"80vh", overflowY:"auto" }}>
                <div style={{ fontWeight:700, fontSize:16, marginBottom:16, color:"var(--em8)" }}>إضافة عضو إلى المجموعة</div>
                {otherPassengers.filter(p => !groupMembers.find(m => m.group_id === selectedGroup.id && m.passenger_id === p.id)).map(p => (
                  <div key={p.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid var(--border)" }}>
                    <span style={{ fontSize:13 }}>{p.short_ar || p.name_ar}</span>
                    <button onClick={async () => { await addToExistingGroup(selectedGroup.id); }}
                      style={{ padding:"4px 12px", background:"var(--primary)", color:"#fff", border:"none", borderRadius:6, fontSize:12, cursor:"pointer" }}>إضافة</button>
                  </div>
                ))}
                <button onClick={() => setShowGroupModal(false)} style={{ width:"100%", marginTop:16, padding:10, background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, fontFamily:"var(--font-body)", fontSize:13, cursor:"pointer" }}>إغلاق</button>
              </div>
            </div>
          )}

          {/* مودال: دفعة مشتركة */}
          {showGroupPayModal && (
            <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }}>
              <div style={{ background:"var(--bg-card)", borderRadius:16, padding:24, width:340, boxShadow:"var(--shadow-xl)" }}>
                <div style={{ fontWeight:700, fontSize:16, marginBottom:4, color:"#2A9D8F" }}>دفعة مشتركة</div>
                <div style={{ fontSize:11, color:"var(--text-muted)", marginBottom:16 }}>ستُوزَّع على {gPassengers.length} أعضاء ({groupPayForm.amount ? fmtAmt(Number(groupPayForm.amount)/gPassengers.length) : "0"} ر.ق للفرد)</div>
                {[
                  { label:"المبلغ الإجمالي", key:"amount", type:"number", placeholder:"0" },
                  { label:"التاريخ", key:"payment_date", type:"date", placeholder:"" },
                  { label:"ملاحظات (اختياري)", key:"notes", type:"text", placeholder:"..." },
                ].map(f => (
                  <div key={f.key} style={{ marginBottom:12 }}>
                    <div style={{ fontSize:12, color:"var(--text-muted)", marginBottom:4 }}>{f.label}</div>
                    <input type={f.type} placeholder={f.placeholder} value={(groupPayForm as any)[f.key]}
                      onChange={e => setGroupPayForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle} />
                  </div>
                ))}
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:12, color:"var(--text-muted)", marginBottom:4 }}>طريقة الدفع</div>
                  <select value={groupPayForm.method} onChange={e => setGroupPayForm(p => ({ ...p, method:e.target.value }))} style={inputStyle}>
                    {["نقدي","تحويل بنكي","شيك"].map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div style={{ display:"flex", gap:10 }}>
                  <button onClick={addGroupPayment} disabled={savingGroupPay}
                    style={{ flex:1, padding:10, background:"#2A9D8F", color:"#fff", border:"none", borderRadius:8, fontFamily:"var(--font-body)", cursor:"pointer" }}>
                    {savingGroupPay ? "جارٍ الحفظ..." : "توزيع الدفعة"}
                  </button>
                  <button onClick={() => setShowGroupPayModal(false)}
                    style={{ flex:1, padding:10, background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, fontFamily:"var(--font-body)", cursor:"pointer" }}>إلغاء</button>
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
    const s = selectedP.services;
    const pkgKey    = getPackageKey(s.hotel_type);
    const pkgAmt    = pricing[pkgKey]?.amount || 0;
    const pPayments = [...payments.filter(p => p.passenger_id === selectedP.id)].sort((a,b) => new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime());
    const pCustom   = customCharges.filter(c => c.passenger_id === selectedP.id);
    const totalDue  = calcTotalDue(selectedP, pricing, customCharges);
    const totalPaid = calcTotalPaid(selectedP.id, payments);
    const balance   = totalDue - totalPaid;
    const st        = financeStatus(totalDue, totalPaid);
    const passengerGroup = getPassengerGroup(selectedP.id);

    type AddonRow = { label: string; amount: number; isDiscount?: boolean };
    const addonRows: AddonRow[] = [];
    if (s.hotel_view === "مطلة") addonRows.push({ label:"إضافة مطلة",         amount:pricing["addon_view"]?.amount||0 });
    if (s.camp_mina === "خاص")  addonRows.push({ label:"خيمة خاصة - منى",   amount:pricing["addon_mina"]?.amount||0 });
    if (s.camp_arafa === "خاص") addonRows.push({ label:"خيمة خاصة - عرفة",  amount:pricing["addon_arafa"]?.amount||0 });
    if (s.bus === "VIP")         addonRows.push({ label:"باص VIP",            amount:pricing["addon_bus_vip"]?.amount||0 });
    if ((selectedP as any).flight_class === "درجة أولى") addonRows.push({ label:"طيران درجة أولى", amount:pricing["addon_first_class"]?.amount||0 });
    if ((selectedP as any).flight_class === "بدون")      addonRows.push({ label:"خصم بدون تذكرة", amount:pricing["discount_no_ticket"]?.amount||0, isDiscount:true });

    return (
      <div style={{ flex:1, overflowY:"auto", padding:20 }}>
        <AlertModal alert={alertState} onClose={() => showAlert(null)} />
        <div style={{ maxWidth:720, margin:"0 auto" }}>
          {/* رأس */}
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
            <button onClick={() => { setSubView("list"); setSelectedP(null); }} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--primary)", fontSize:24 }}>←</button>
            <div>
              <div style={{ fontFamily:"var(--font-heading)", fontSize:18, fontWeight:700, color:"var(--em8)" }}>{selectedP.short_ar||selectedP.name_ar}</div>
              <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:2 }}>{pricing[pkgKey]?.label}{addonRows.filter(a=>!a.isDiscount).map(a=>` · ${a.label}`).join("")}</div>
            </div>
            <span style={{ marginRight:"auto", fontSize:12, padding:"4px 14px", borderRadius:99, background:st.bg, color:st.color, fontWeight:700 }}>{st.label}</span>
            <button onClick={() => printPassengerStatement(selectedP)}
              style={{ padding:"6px 14px", background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, fontSize:12, cursor:"pointer" }}>🖨️ طباعة</button>
          </div>

          {/* بطاقات الملخص */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:20 }}>
            {[
              { label:"المطلوب", value:fmtAmt(totalDue),  color:"var(--em8)"                             },
              { label:"المدفوع", value:fmtAmt(totalPaid), color:"#2A9D8F"                                 },
              { label:"المتبقي", value:fmtAmt(balance),   color:balance>0?"#C0392B":"#2A9D8F"            },
            ].map(card => (
              <div key={card.label} style={{ background:"var(--bg-card)", borderRadius:12, padding:"14px 16px", textAlign:"center", boxShadow:"var(--shadow-sm)" }}>
                <div style={{ fontSize:11, color:"var(--text-muted)", marginBottom:4 }}>{card.label}</div>
                <div style={{ fontSize:20, fontWeight:700, color:card.color }}>{card.value}</div>
                <div style={{ fontSize:10, color:"var(--text-muted)" }}>ر.ق</div>
              </div>
            ))}
          </div>

          {/* كشف الحساب */}
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
                <tr>
                  <td style={tdStyle}>{pricing[pkgKey]?.label||"الباقة الأساسية"}</td>
                  <td style={{ ...tdStyle, textAlign:"center", color:"#C0392B", fontWeight:600 }}>{fmtAmt(pkgAmt)}</td>
                  <td style={{ ...tdStyle, textAlign:"center", color:"var(--text-muted)" }}>—</td>
                  <td style={tdStyle}></td>
                </tr>
                {addonRows.map((a, i) => (
                  <tr key={i} style={{ background:"var(--bg-2)" }}>
                    <td style={tdStyle}>{a.label}{a.isDiscount && <span style={{ fontSize:10, color:"#2A9D8F", background:"rgba(42,157,143,0.1)", padding:"1px 6px", borderRadius:99, marginRight:6 }}>خصم</span>}</td>
                    <td style={{ ...tdStyle, textAlign:"center", color:a.isDiscount?"#2A9D8F":"#C0392B", fontWeight:600 }}>{a.isDiscount?`(${fmtAmt(a.amount)})`:fmtAmt(a.amount)}</td>
                    <td style={{ ...tdStyle, textAlign:"center", color:"var(--text-muted)" }}>—</td>
                    <td style={tdStyle}></td>
                  </tr>
                ))}
                {pCustom.map(c => (
                  <tr key={`cc-${c.id}`}>
                    <td style={tdStyle}>
                      <span style={{ fontSize:10, padding:"1px 6px", borderRadius:99, marginLeft:6, background:c.type==="إضافة"?"rgba(232,149,26,0.1)":"rgba(42,157,143,0.1)", color:c.type==="إضافة"?"#E8951A":"#2A9D8F" }}>
                        {c.type==="إضافة"?"بند خاص":"خصم خاص"}
                      </span>
                      {c.description}
                      {c.notes && <span style={{ fontSize:10, color:"var(--text-muted)", marginRight:6 }}>({c.notes})</span>}
                    </td>
                    <td style={{ ...tdStyle, textAlign:"center", color:c.type==="إضافة"?"#C0392B":"#2A9D8F", fontWeight:600 }}>{c.type==="إضافة"?fmtAmt(c.amount):`(${fmtAmt(c.amount)})`}</td>
                    <td style={{ ...tdStyle, textAlign:"center", color:"var(--text-muted)" }}>—</td>
                    <td style={{ ...tdStyle, textAlign:"center" }}>
                      <button onClick={() => deleteCustomCharge(c.id)} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--danger)", fontSize:14 }}>✕</button>
                    </td>
                  </tr>
                ))}
                {pPayments.map((py, i) => (
                  <tr key={`py-${py.id}`} style={{ background:i%2===0?"rgba(42,157,143,0.04)":"white" }}>
                    <td style={tdStyle}>دفعة — {py.payment_date} <span style={{ fontSize:10, color:"var(--text-muted)", marginRight:6 }}>({py.method})</span>{py.notes&&<span style={{ fontSize:10, color:"var(--text-muted)" }}>— {py.notes}</span>}</td>
                    <td style={{ ...tdStyle, textAlign:"center", color:"var(--text-muted)" }}>—</td>
                    <td style={{ ...tdStyle, textAlign:"center", color:"#2A9D8F", fontWeight:600 }}>{fmtAmt(py.amount)}</td>
                    <td style={{ ...tdStyle, textAlign:"center" }}>
                      <button onClick={() => deletePayment(py.id)} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--danger)", fontSize:14 }}>✕</button>
                    </td>
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

          {/* أزرار */}
          <div style={{ display:"flex", gap:10, marginBottom:16 }}>
            <button onClick={() => setShowPayModal(true)}
              style={{ flex:1, padding:10, background:"#2A9D8F", color:"#fff", border:"none", borderRadius:10, fontFamily:"var(--font-body)", fontSize:13, cursor:"pointer", fontWeight:600 }}>
              + تسجيل دفعة
            </button>
            <button onClick={() => { setChargeType("إضافة"); setChargeForm({ description:"", amount:"", notes:"" }); setShowChargeModal(true); }}
              style={{ flex:1, padding:10, background:"#E8951A", color:"#fff", border:"none", borderRadius:10, fontFamily:"var(--font-body)", fontSize:13, cursor:"pointer", fontWeight:600 }}>
              + بند خاص
            </button>
            <button onClick={() => { setChargeType("خصم"); setChargeForm({ description:"", amount:"", notes:"" }); setShowChargeModal(true); }}
              style={{ flex:1, padding:10, background:"#C0392B", color:"#fff", border:"none", borderRadius:10, fontFamily:"var(--font-body)", fontSize:13, cursor:"pointer", fontWeight:600 }}>
              + خصم خاص
            </button>
          </div>

          {/* المجموعة المالية */}
          <div style={{ background:"var(--bg-card)", borderRadius:12, padding:16, boxShadow:"var(--shadow-sm)" }}>
            <div style={{ fontWeight:700, fontSize:13, color:"var(--em8)", marginBottom:12 }}>المجموعة المالية</div>
            {passengerGroup ? (
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:12, padding:"4px 12px", borderRadius:99, background:"rgba(125,31,60,0.08)", color:"var(--em8)", fontWeight:600 }}>
                  {passengerGroup.name}
                </span>
                <button onClick={() => { setSelectedGroup(passengerGroup); setSubView("group"); }}
                  style={{ padding:"4px 12px", background:"var(--em8)", color:"#fff", border:"none", borderRadius:6, fontSize:12, cursor:"pointer" }}>
                  عرض حساب المجموعة
                </button>
                <button onClick={() => removeFromGroup(selectedP.id, passengerGroup.id)}
                  style={{ padding:"4px 12px", background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:6, fontSize:12, cursor:"pointer", color:"var(--danger)", marginRight:"auto" }}>
                  إزالة من المجموعة
                </button>
              </div>
            ) : (
              <div style={{ display:"flex", gap:10 }}>
                <button onClick={() => { setGroupModalMode("create"); setGroupForm({ name:"", notes:"" }); setShowGroupModal(true); }}
                  style={{ padding:"6px 14px", background:"var(--primary)", color:"#fff", border:"none", borderRadius:8, fontSize:12, cursor:"pointer" }}>
                  + إنشاء مجموعة جديدة
                </button>
                {groups.length > 0 && (
                  <button onClick={() => { setGroupModalMode("addTo"); setShowGroupModal(true); }}
                    style={{ padding:"6px 14px", background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, fontSize:12, cursor:"pointer" }}>
                    إضافة إلى مجموعة موجودة
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* مودال: دفعة */}
        {showPayModal && (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }}>
            <div style={{ background:"var(--bg-card)", borderRadius:16, padding:24, width:340, boxShadow:"var(--shadow-xl)" }}>
              <div style={{ fontWeight:700, fontSize:16, marginBottom:16, color:"#2A9D8F" }}>تسجيل دفعة جديدة</div>
              {[
                { label:"المبلغ", key:"amount", type:"number", placeholder:"0" },
                { label:"التاريخ", key:"payment_date", type:"date", placeholder:"" },
                { label:"ملاحظات (اختياري)", key:"notes", type:"text", placeholder:"..." },
              ].map(f => (
                <div key={f.key} style={{ marginBottom:12 }}>
                  <div style={{ fontSize:12, color:"var(--text-muted)", marginBottom:4 }}>{f.label}</div>
                  <input type={f.type} placeholder={f.placeholder} value={(payForm as any)[f.key]}
                    onChange={e => setPayForm(p => ({ ...p, [f.key]: e.target.value }))} style={inputStyle} />
                </div>
              ))}
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:12, color:"var(--text-muted)", marginBottom:4 }}>طريقة الدفع</div>
                <select value={payForm.method} onChange={e => setPayForm(p => ({ ...p, method:e.target.value }))} style={inputStyle}>
                  {["نقدي","تحويل بنكي","شيك"].map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div style={{ display:"flex", gap:10 }}>
                <button onClick={addPayment} disabled={savingPay}
                  style={{ flex:1, padding:10, background:"#2A9D8F", color:"#fff", border:"none", borderRadius:8, fontFamily:"var(--font-body)", cursor:"pointer" }}>
                  {savingPay?"جارٍ الحفظ...":"حفظ"}
                </button>
                <button onClick={() => setShowPayModal(false)}
                  style={{ flex:1, padding:10, background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, fontFamily:"var(--font-body)", cursor:"pointer" }}>إلغاء</button>
              </div>
            </div>
          </div>
        )}

        {/* مودال: بند خاص */}
        {showChargeModal && (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }}>
            <div style={{ background:"var(--bg-card)", borderRadius:16, padding:24, width:340, boxShadow:"var(--shadow-xl)" }}>
              <div style={{ fontWeight:700, fontSize:16, marginBottom:16, color:chargeType==="إضافة"?"#E8951A":"#C0392B" }}>
                {chargeType==="إضافة"?"إضافة بند خاص":"إضافة خصم خاص"}
              </div>
              {[
                { label:"الوصف", key:"description", placeholder:"مثال: ليموزين من المطار" },
                { label:"المبلغ", key:"amount", placeholder:"0" },
                { label:"ملاحظات (اختياري)", key:"notes", placeholder:"..." },
              ].map(f => (
                <div key={f.key} style={{ marginBottom:12 }}>
                  <div style={{ fontSize:12, color:"var(--text-muted)", marginBottom:4 }}>{f.label}</div>
                  <input type={f.key==="amount"?"number":"text"} placeholder={f.placeholder}
                    value={(chargeForm as any)[f.key]} onChange={e => setChargeForm(p => ({ ...p, [f.key]:e.target.value }))} style={inputStyle} />
                </div>
              ))}
              <div style={{ display:"flex", gap:10 }}>
                <button onClick={addCustomCharge} disabled={savingCharge}
                  style={{ flex:1, padding:10, background:chargeType==="إضافة"?"#E8951A":"#C0392B", color:"#fff", border:"none", borderRadius:8, fontFamily:"var(--font-body)", cursor:"pointer" }}>
                  {savingCharge?"جارٍ الحفظ...":"حفظ"}
                </button>
                <button onClick={() => setShowChargeModal(false)}
                  style={{ flex:1, padding:10, background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, fontFamily:"var(--font-body)", cursor:"pointer" }}>إلغاء</button>
              </div>
            </div>
          </div>
        )}

        {/* مودال: إنشاء مجموعة / إضافة لموجودة */}
        {showGroupModal && (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }}>
            <div style={{ background:"var(--bg-card)", borderRadius:16, padding:24, width:360, boxShadow:"var(--shadow-xl)", maxHeight:"80vh", overflowY:"auto" }}>
              {groupModalMode === "create" ? (
                <>
                  <div style={{ fontWeight:700, fontSize:16, marginBottom:16, color:"var(--em8)" }}>إنشاء مجموعة مالية جديدة</div>
                  <div style={{ marginBottom:12 }}>
                    <div style={{ fontSize:12, color:"var(--text-muted)", marginBottom:4 }}>اسم المجموعة</div>
                    <input type="text" placeholder="مثال: عائلة الأحمدي" value={groupForm.name}
                      onChange={e => setGroupForm(p => ({ ...p, name:e.target.value }))} style={inputStyle} />
                  </div>
                  <div style={{ marginBottom:16 }}>
                    <div style={{ fontSize:12, color:"var(--text-muted)", marginBottom:4 }}>ملاحظات (اختياري)</div>
                    <input type="text" placeholder="..." value={groupForm.notes}
                      onChange={e => setGroupForm(p => ({ ...p, notes:e.target.value }))} style={inputStyle} />
                  </div>
                  <div style={{ display:"flex", gap:10 }}>
                    <button onClick={createGroupAndAdd} disabled={savingGroup}
                      style={{ flex:1, padding:10, background:"var(--primary)", color:"#fff", border:"none", borderRadius:8, fontFamily:"var(--font-body)", cursor:"pointer" }}>
                      {savingGroup?"جارٍ الإنشاء...":"إنشاء وإضافة الحاج"}
                    </button>
                    <button onClick={() => setShowGroupModal(false)}
                      style={{ flex:1, padding:10, background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, fontFamily:"var(--font-body)", cursor:"pointer" }}>إلغاء</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontWeight:700, fontSize:16, marginBottom:16, color:"var(--em8)" }}>إضافة إلى مجموعة موجودة</div>
                  {groups.map(g => (
                    <div key={g.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px solid var(--border)" }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600 }}>{g.name}</div>
                        <div style={{ fontSize:11, color:"var(--text-muted)" }}>{groupMembers.filter(m => m.group_id === g.id).length} أعضاء</div>
                      </div>
                      <button onClick={() => addToExistingGroup(g.id)}
                        style={{ padding:"4px 14px", background:"var(--primary)", color:"#fff", border:"none", borderRadius:6, fontSize:12, cursor:"pointer" }}>إضافة</button>
                    </div>
                  ))}
                  <button onClick={() => setShowGroupModal(false)} style={{ width:"100%", marginTop:16, padding:10, background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, fontFamily:"var(--font-body)", cursor:"pointer" }}>إغلاق</button>
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
    const allData = sortedPassengers.map(p => {
      const due  = calcTotalDue(p, pricing, customCharges);
      const paid = calcTotalPaid(p.id, payments);
      return { p, due, paid, balance: due - paid };
    });
    const totDue  = allData.reduce((s,r) => s+r.due, 0);
    const totPaid = allData.reduce((s,r) => s+r.paid, 0);
    const totBal  = totDue - totPaid;
    const filtered = reportType === "late" ? allData.filter(r => r.balance > 0) : allData;

    const printButtons: Record<string, () => void> = {
      full:     () => printFullReport(allData),
      late:     () => printFullReport(allData.filter(r => r.balance > 0)),
      payments: () => printPaymentsReport(),
      packages: () => printPackagesReport(),
      addons:   () => printAddonsReport(),
    };

    return (
      <div style={{ flex:1, overflowY:"auto", padding:20 }}>
        <AlertModal alert={alertState} onClose={() => showAlert(null)} />
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
          <button onClick={() => setSubView("list")} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--primary)", fontSize:24 }}>←</button>
          <div style={{ fontFamily:"var(--font-heading)", fontSize:18, fontWeight:700, color:"var(--em8)" }}>التقارير المالية</div>
          <button onClick={printButtons[reportType]}
            style={{ marginRight:"auto", padding:"7px 18px", background:"var(--em8)", color:"#fff", border:"none", borderRadius:8, fontSize:13, cursor:"pointer", fontWeight:600 }}>
            🖨️ طباعة
          </button>
        </div>

        {/* تبويبات */}
        <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
          {([
            { key:"full",     label:"تقرير الحجاج الكامل" },
            { key:"late",     label:"المتأخرون"            },
            { key:"payments", label:"تقرير الدفعات"        },
            { key:"packages", label:"تقرير الباقات"        },
            { key:"addons",   label:"ملخص الإضافات"        },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setReportType(t.key)}
              style={{ padding:"6px 16px", borderRadius:99, border:"none", fontFamily:"var(--font-body)", fontSize:12, cursor:"pointer",
                fontWeight: reportType===t.key ? 700 : 400,
                background: reportType===t.key ? "var(--em8)" : "var(--bg-2)",
                color:      reportType===t.key ? "#fff"       : "var(--text)" }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* تقرير الحجاج الكامل / المتأخرون */}
        {(reportType === "full" || reportType === "late") && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:16 }}>
              {[
                { label:"إجمالي المطلوب", value:fmtAmt(totDue),  color:"var(--em8)"  },
                { label:"إجمالي المحصل",  value:fmtAmt(totPaid), color:"#2A9D8F"      },
                { label:"إجمالي المتبقي", value:fmtAmt(totBal),  color:"#C0392B"      },
              ].map(c => (
                <div key={c.label} style={{ background:"var(--bg-card)", borderRadius:10, padding:"12px 16px", textAlign:"center", boxShadow:"var(--shadow-sm)" }}>
                  <div style={{ fontSize:11, color:"var(--text-muted)", marginBottom:4 }}>{c.label}</div>
                  <div style={{ fontSize:18, fontWeight:700, color:c.color }}>{c.value}</div>
                  <div style={{ fontSize:10, color:"var(--text-muted)" }}>ر.ق</div>
                </div>
              ))}
            </div>
            <div style={{ background:"var(--bg-card)", borderRadius:12, overflow:"hidden", boxShadow:"var(--shadow-sm)" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead><tr>
                  <th style={{ ...thStyle, textAlign:"center", width:36 }}>م</th>
                  <th style={thStyle}>الاسم</th>
                  <th style={{ ...thStyle, textAlign:"center" }}>الباقة</th>
                  <th style={{ ...thStyle, textAlign:"center" }}>المطلوب</th>
                  <th style={{ ...thStyle, textAlign:"center" }}>المدفوع</th>
                  <th style={{ ...thStyle, textAlign:"center" }}>المتبقي</th>
                  <th style={{ ...thStyle, textAlign:"center" }}>الحالة</th>
                </tr></thead>
                <tbody>
                  {filtered.map(({ p, due, paid, balance }, i) => {
                    const st = financeStatus(due, paid);
                    return (
                      <tr key={p.id} onClick={() => { setSelectedP(p); setSubView("detail"); }} style={{ cursor:"pointer", background:i%2===0?"white":"var(--bg-2)" }}>
                        <td style={{ ...tdStyle, textAlign:"center", color:"var(--text-muted)", fontSize:12 }}>{i+1}</td>
                        <td style={tdStyle}>{p.short_ar||p.name_ar}</td>
                        <td style={{ ...tdStyle, textAlign:"center", fontSize:11, color:"var(--text-muted)" }}>{pricing[getPackageKey(p.services.hotel_type)]?.label||"—"}</td>
                        <td style={{ ...tdStyle, textAlign:"center", color:"var(--em8)", fontWeight:600 }}>{fmtAmt(due)}</td>
                        <td style={{ ...tdStyle, textAlign:"center", color:"#2A9D8F", fontWeight:600 }}>{fmtAmt(paid)}</td>
                        <td style={{ ...tdStyle, textAlign:"center", color:balance>0?"#C0392B":"#2A9D8F", fontWeight:600 }}>{fmtAmt(balance)}</td>
                        <td style={{ ...tdStyle, textAlign:"center" }}><span style={{ fontSize:11, padding:"2px 8px", borderRadius:99, background:st.bg, color:st.color, fontWeight:700 }}>{st.label}</span></td>
                      </tr>
                    );
                  })}
                  <tr style={{ background:"var(--em8)", color:"#fff", fontWeight:700 }}>
                    <td style={{ padding:"10px 12px" }} colSpan={3}>الإجمالي</td>
                    <td style={{ padding:"10px 12px", textAlign:"center" }}>{fmtAmt(totDue)}</td>
                    <td style={{ padding:"10px 12px", textAlign:"center" }}>{fmtAmt(totPaid)}</td>
                    <td style={{ padding:"10px 12px", textAlign:"center" }}>{fmtAmt(totBal)}</td>
                    <td style={{ padding:"10px 12px" }}></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* تقرير الدفعات */}
        {reportType === "payments" && (
          <div style={{ background:"var(--bg-card)", borderRadius:12, overflow:"hidden", boxShadow:"var(--shadow-sm)" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>
                <th style={{ ...thStyle, textAlign:"center", width:36 }}>م</th>
                <th style={thStyle}>الحاج</th>
                <th style={{ ...thStyle, textAlign:"center" }}>التاريخ</th>
                <th style={{ ...thStyle, textAlign:"center" }}>طريقة الدفع</th>
                <th style={{ ...thStyle, textAlign:"center" }}>المبلغ</th>
                <th style={thStyle}>ملاحظات</th>
              </tr></thead>
              <tbody>
                {[...payments].sort((a,b) => new Date(b.payment_date).getTime()-new Date(a.payment_date).getTime()).map((py,i) => {
                  const p = passengers.find(x => x.id === py.passenger_id);
                  return (
                    <tr key={py.id} style={{ background:i%2===0?"white":"var(--bg-2)" }}>
                      <td style={{ ...tdStyle, textAlign:"center", color:"var(--text-muted)", fontSize:12 }}>{i+1}</td>
                      <td style={tdStyle}>{p?(p.short_ar||p.name_ar):"—"}</td>
                      <td style={{ ...tdStyle, textAlign:"center" }}>{py.payment_date}</td>
                      <td style={{ ...tdStyle, textAlign:"center" }}>{py.method}</td>
                      <td style={{ ...tdStyle, textAlign:"center", color:"#2A9D8F", fontWeight:600 }}>{fmtAmt(py.amount)}</td>
                      <td style={{ ...tdStyle, color:"var(--text-muted)", fontSize:12 }}>{py.notes||"—"}</td>
                    </tr>
                  );
                })}
                <tr style={{ background:"var(--em8)", color:"#fff", fontWeight:700 }}>
                  <td style={{ padding:"10px 12px" }} colSpan={4}>الإجمالي</td>
                  <td style={{ padding:"10px 12px", textAlign:"center" }}>{fmtAmt(payments.reduce((s,p) => s+Number(p.amount), 0))}</td>
                  <td style={{ padding:"10px 12px" }}></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* تقرير الباقات */}
        {reportType === "packages" && (
          <div style={{ background:"var(--bg-card)", borderRadius:12, overflow:"hidden", boxShadow:"var(--shadow-sm)" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>
                <th style={thStyle}>الباقة</th>
                <th style={{ ...thStyle, textAlign:"center" }}>عدد الحجاج</th>
                <th style={{ ...thStyle, textAlign:"center" }}>السعر الواحد</th>
                <th style={{ ...thStyle, textAlign:"center" }}>الإجمالي المستحق</th>
              </tr></thead>
              <tbody>
                {PRICING_KEYS.filter(k => k.type === "package").map((pk,i) => {
                  const count = sortedPassengers.filter(p => getPackageKey(p.services.hotel_type) === pk.key).length;
                  const price = pricing[pk.key]?.amount || 0;
                  return (
                    <tr key={pk.key} style={{ background:i%2===0?"white":"var(--bg-2)" }}>
                      <td style={tdStyle}>{pk.label}</td>
                      <td style={{ ...tdStyle, textAlign:"center", fontWeight:700 }}>{count}</td>
                      <td style={{ ...tdStyle, textAlign:"center" }}>{fmtAmt(price)}</td>
                      <td style={{ ...tdStyle, textAlign:"center", color:"var(--em8)", fontWeight:700 }}>{fmtAmt(count*price)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ملخص الإضافات */}
        {reportType === "addons" && (
          <div style={{ background:"var(--bg-card)", borderRadius:12, overflow:"hidden", boxShadow:"var(--shadow-sm)" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr>
                <th style={thStyle}>الإضافة / الخصم</th>
                <th style={{ ...thStyle, textAlign:"center" }}>عدد الحجاج</th>
                <th style={{ ...thStyle, textAlign:"center" }}>السعر الواحد</th>
                <th style={{ ...thStyle, textAlign:"center" }}>الإجمالي</th>
              </tr></thead>
              <tbody>
                {[
                  { key:"addon_view",         check:(p:Passenger) => p.services.hotel_view==="مطلة"        },
                  { key:"addon_mina",         check:(p:Passenger) => p.services.camp_mina==="خاص"          },
                  { key:"addon_arafa",        check:(p:Passenger) => p.services.camp_arafa==="خاص"         },
                  { key:"addon_bus_vip",      check:(p:Passenger) => p.services.bus==="VIP"                },
                  { key:"addon_first_class",  check:(p:Passenger) => (p as any).flight_class==="درجة أولى" },
                  { key:"discount_no_ticket", check:(p:Passenger) => (p as any).flight_class==="بدون"      },
                ].map((a,i) => {
                  const count = sortedPassengers.filter(a.check).length;
                  const price = pricing[a.key]?.amount || 0;
                  const label = pricing[a.key]?.label || a.key;
                  const isDis = a.key === "discount_no_ticket";
                  return (
                    <tr key={a.key} style={{ background:i%2===0?"white":"var(--bg-2)" }}>
                      <td style={tdStyle}>{label}</td>
                      <td style={{ ...tdStyle, textAlign:"center", fontWeight:700 }}>{count}</td>
                      <td style={{ ...tdStyle, textAlign:"center" }}>{fmtAmt(price)}</td>
                      <td style={{ ...tdStyle, textAlign:"center", color:isDis?"#C0392B":"var(--em8)", fontWeight:700 }}>
                        {isDis?`(${fmtAmt(count*price)})`:fmtAmt(count*price)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════
  // MAIN LIST VIEW
  // ══════════════════════════════════════════════
  const totDueAll  = sortedPassengers.reduce((s,p) => s + calcTotalDue(p, pricing, customCharges), 0);
  const totPaidAll = sortedPassengers.reduce((s,p) => s + calcTotalPaid(p.id, payments), 0);
  const totBalAll  = totDueAll - totPaidAll;
  const lateCount  = sortedPassengers.filter(p => calcTotalDue(p, pricing, customCharges) > calcTotalPaid(p.id, payments)).length;

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      <AlertModal alert={alertState} onClose={() => showAlert(null)} />

      {/* شريط العنوان */}
      <div style={{ padding:"12px 20px", background:"var(--bg-card)", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
        <div style={{ fontFamily:"var(--font-heading)", fontSize:18, fontWeight:700, color:"var(--em8)" }}>الحسابات المالية</div>
        <div style={{ marginRight:"auto", display:"flex", gap:8 }}>
          <button onClick={() => setSubView("reports")}
            style={{ padding:"6px 14px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg-2)", fontFamily:"var(--font-body)", fontSize:12, cursor:"pointer" }}>
            التقارير
          </button>
          <button onClick={() => setSubView("settings")}
            style={{ padding:"6px 14px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg-2)", fontFamily:"var(--font-body)", fontSize:12, cursor:"pointer" }}>
            إعدادات الأسعار
          </button>
        </div>
      </div>

      {/* بطاقات الملخص */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, padding:"12px 20px", flexShrink:0 }}>
        {[
          { label:"إجمالي المطلوب", value:fmtAmt(totDueAll),  color:"var(--em8)", unit:"ر.ق"  },
          { label:"إجمالي المحصل",  value:fmtAmt(totPaidAll), color:"#2A9D8F",    unit:"ر.ق"  },
          { label:"إجمالي المتبقي", value:fmtAmt(totBalAll),  color:"#C0392B",    unit:"ر.ق"  },
          { label:"عدد المتأخرين",  value:String(lateCount),  color:"#E8951A",    unit:"حاج"  },
        ].map(card => (
          <div key={card.label} style={{ background:"var(--bg-card)", borderRadius:12, padding:"14px 16px", textAlign:"center", boxShadow:"var(--shadow-sm)" }}>
            <div style={{ fontSize:11, color:"var(--text-muted)", marginBottom:4 }}>{card.label}</div>
            <div style={{ fontSize:22, fontWeight:700, color:card.color }}>{card.value}</div>
            <div style={{ fontSize:10, color:"var(--text-muted)" }}>{card.unit}</div>
          </div>
        ))}
      </div>

      {/* شريط البحث والفلتر */}
      <div style={{ padding:"0 20px 12px", display:"flex", gap:10, flexShrink:0 }}>
        <input
          type="text"
          placeholder="🔍 بحث عن حاج..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ flex:1, padding:"8px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg-input)", fontFamily:"var(--font-body)", fontSize:13 }}
        />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}
          style={{ padding:"8px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg-input)", fontFamily:"var(--font-body)", fontSize:13, minWidth:120 }}>
          <option value="all">كل الحالات</option>
          <option value="paid">مسدد</option>
          <option value="partial">جزئي</option>
          <option value="unpaid">لم يدفع</option>
        </select>
        <select value={filterPackage} onChange={e => setFilterPackage(e.target.value)}
          style={{ padding:"8px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg-input)", fontFamily:"var(--font-body)", fontSize:13, minWidth:130 }}>
          <option value="all">كل الباقات</option>
          {PRICING_KEYS.filter(k => k.type === "package").map(pk => (
            <option key={pk.key} value={pk.key}>{pk.label}</option>
          ))}
        </select>
        {(searchTerm || filterStatus !== "all" || filterPackage !== "all") && (
          <button onClick={() => { setSearchTerm(""); setFilterStatus("all"); setFilterPackage("all"); }}
            style={{ padding:"8px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg-2)", fontFamily:"var(--font-body)", fontSize:12, cursor:"pointer", color:"var(--danger)", whiteSpace:"nowrap" }}>
            ✕ مسح
          </button>
        )}
      </div>

      {/* الجدول الرئيسي */}
      {loading ? (
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", color:"var(--text-muted)" }}>جارٍ التحميل...</div>
      ) : (
        <div style={{ flex:1, overflowY:"auto", padding:"0 20px 20px" }}>
          {filteredPassengers.length === 0 ? (
            <div style={{ textAlign:"center", padding:40, color:"var(--text-muted)", fontSize:14 }}>لا توجد نتائج مطابقة للبحث</div>
          ) : (
            <div style={{ background:"var(--bg-card)", borderRadius:12, overflow:"hidden", boxShadow:"var(--shadow-sm)" }}>
              <div style={{ padding:"8px 16px", background:"var(--bg-2)", borderBottom:"1px solid var(--border)", fontSize:11, color:"var(--text-muted)" }}>
                عرض {filteredPassengers.length} من {sortedPassengers.length} حاج
              </div>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead style={{ position:"sticky", top:0, zIndex:10 }}>
                  <tr>
                    {["م","الاسم","الباقة","الإضافات","المطلوب","المدفوع","المتبقي","الحالة"].map(h => (
                      <th key={h} style={{ ...thStyle, textAlign:h==="م"?"center":"right" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredPassengers.map((p, i) => {
                    const due  = calcTotalDue(p, pricing, customCharges);
                    const paid = calcTotalPaid(p.id, payments);
                    const bal  = due - paid;
                    const st   = financeStatus(due, paid);
                    const s    = p.services;
                    const badges: string[] = [];
                    if (s.hotel_view === "مطلة")  badges.push("مطلة");
                    if (s.camp_mina === "خاص")   badges.push("منى خاص");
                    if (s.camp_arafa === "خاص")  badges.push("عرفة خاص");
                    if (s.bus === "VIP")          badges.push("VIP");
                    if ((p as any).flight_class === "درجة أولى") badges.push("درجة أولى");
                    if ((p as any).flight_class === "بدون")      badges.push("بدون تذكرة");
                    const pGroup = getPassengerGroup(p.id);
                    return (
                      <tr key={p.id} onClick={() => { setSelectedP(p); setSubView("detail"); }}
                        style={{ cursor:"pointer", background:i%2===0?"white":"var(--bg-2)" }}>
                        <td style={{ ...tdStyle, textAlign:"center", color:"var(--text-muted)", fontSize:12 }}>{i+1}</td>
                        <td style={tdStyle}>
                          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                            {p.short_ar||p.name_ar}
                            {pGroup && (
                              <span style={{ fontSize:10, padding:"1px 6px", borderRadius:99, background:"rgba(125,31,60,0.1)", color:"var(--em8)" }}
                                onClick={e => { e.stopPropagation(); setSelectedGroup(pGroup); setSubView("group"); }}>
                                {pGroup.name}
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ ...tdStyle, fontSize:11, color:"var(--text-muted)" }}>{pricing[getPackageKey(s.hotel_type)]?.label||"—"}</td>
                        <td style={tdStyle}>
                          <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                            {badges.map(b => <span key={b} style={{ fontSize:10, padding:"1px 6px", borderRadius:99, background:"rgba(232,149,26,0.1)", color:"#E8951A" }}>{b}</span>)}
                          </div>
                        </td>
                        <td style={{ ...tdStyle, textAlign:"center", color:"var(--em8)",    fontWeight:700 }}>{fmtAmt(due)}</td>
                        <td style={{ ...tdStyle, textAlign:"center", color:"#2A9D8F",        fontWeight:700 }}>{fmtAmt(paid)}</td>
                        <td style={{ ...tdStyle, textAlign:"center", color:bal>0?"#C0392B":"#2A9D8F", fontWeight:700 }}>{fmtAmt(bal)}</td>
                        <td style={{ ...tdStyle, textAlign:"center" }}>
                          <span style={{ fontSize:11, padding:"2px 10px", borderRadius:99, background:st.bg, color:st.color, fontWeight:700 }}>{st.label}</span>
                        </td>
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
