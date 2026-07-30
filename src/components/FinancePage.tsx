import { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import { AlertModal, useAlert, ConfirmModal, useConfirm } from "./AlertModal";
import { supabase } from "../supabase";
import { useConfig } from "../config/ConfigContext";
import type { Passenger, User } from "../types";

import type { PricingMap, Payment, CustomCharge, FinancialGroup, FinancialGroupMember, PrintBrand, FinanceFilterStatus, GroupPayForm } from "./finance/finance.types";
import { PRICING_KEYS, getPackageKey, getPriceInfo, chargesFor, paymentsFor, calcTotalDue, calcTotalPaid, fmtAmt, financeStatus } from "./finance/finance.utils";
import { FinanceListView } from "./finance/FinanceListView";
import { PassengerFinanceView } from "./finance/PassengerFinanceView";
import { FinancialGroupView } from "./finance/FinancialGroupView";
import { printInPage, makeReceiptHTML, makePassengerStatementHTML, makeGroupStatementHTML, printFullReport, printPaymentsReport, printPackagesReport, printAddonsReport, printCashflowReport } from "./finance/finance.print";

// ============================================================
// المكوّن الرئيسي
// ============================================================
export function FinancePage({ passengers, setPassengers, currentUser }: { passengers: Passenger[]; setPassengers?: (updater: (prev: Passenger[]) => Passenger[]) => void; currentUser: User }) {
  const config = useConfig();
  const { alert: alertState, showAlert } = useAlert();
  const canManage = !!currentUser.permissions?.manage_payments;

  const [subView, setSubView]     = useState<"list"|"detail"|"settings"|"reports"|"group">("list");
  const [selectedP, setSelectedP] = useState<Passenger | null>(null);
  const [editingCustomPrice, setEditingCustomPrice] = useState(false);
  const [customPriceInput, setCustomPriceInput]     = useState("");
  const [savingCustomPrice, setSavingCustomPrice]   = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<FinancialGroup | null>(null);

  const [pricing, setPricing]               = useState<PricingMap>({});
  const [payments, setPayments]             = useState<Payment[]>([]);
  const [customCharges, setCustomCharges]   = useState<CustomCharge[]>([]);
  const [groups, setGroups]                 = useState<FinancialGroup[]>([]);
  const [groupMembers, setGroupMembers]     = useState<FinancialGroupMember[]>([]);
  const [loading, setLoading]               = useState(true);
  const [refreshing, setRefreshing]         = useState(false);
  const [lastUpdated, setLastUpdated]       = useState<Date | null>(null);

  // بحث وفلتر
  const [searchTerm, setSearchTerm]       = useState("");
  const [filterStatus, setFilterStatus]   = useState<FinanceFilterStatus>("all");
  const [filterPackage, setFilterPackage] = useState("all");

  // مودال دفعة
  const [showPayModal, setShowPayModal] = useState(false);
  const [payForm, setPayForm]           = useState({ amount:"", payment_date:new Date().toISOString().split("T")[0], method:"نقدي", notes:"" });
  const [savingPay, setSavingPay]       = useState(false);

  // إيصال
  const [receiptPayment, setReceiptPayment] = useState<{ payment: Payment; passengerName: string } | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);

  // مودال بند خاص
  const [showChargeModal, setShowChargeModal] = useState(false);
  const [chargeType, setChargeType]           = useState<"إضافة"|"خصم">("إضافة");
  const [chargeForm, setChargeForm]           = useState({ description:"", amount:"", notes:"" });
  const [chargeErrors, setChargeErrors]       = useState({ description: false, amount: false });

  // مودال التأكيد الموحد (بديل window.confirm)
  const { confirmState, confirmAction: showConfirm, handleConfirm: handleConfirmYes, handleCancel: handleConfirmNo } = useConfirm();
  const [savingCharge, setSavingCharge]       = useState(false);

  // إعدادات أسعار
  const [editPricing, setEditPricing]     = useState<Record<string, string>>({});
  const [savingPricing, setSavingPricing] = useState(false);

  // تقارير
  const [reportType, setReportType] = useState<"full"|"late"|"payments"|"packages"|"addons"|"cashflow">("full");
  const [cashflowFrom, setCashflowFrom] = useState("");
  const [cashflowTo,   setCashflowTo]   = useState("");

  // مجموعات مالية
  const [showAddMemberModal, setShowAddMemberModal]           = useState(false);
  const [showPassengerGroupModal, setShowPassengerGroupModal] = useState(false);
  const [groupModalMode, setGroupModalMode]       = useState<"create"|"addTo">("create");
  const [groupForm, setGroupForm]                 = useState({ name:"", notes:"" });
  const [savingGroup, setSavingGroup]             = useState(false);
  const [addingMemberId, setAddingMemberId]       = useState<number | null>(null);
  const [showGroupPayModal, setShowGroupPayModal] = useState(false);

  /* إغلاق المودالات بمفتاح Escape — مودالات الإدخال تطلب تأكيداً */
  useEffect(() => {
    const h = async (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const askClose = async (msg: string) => showConfirm(msg, { title: "إغلاق النموذج" });
      if (showGroupPayModal) { if (await askClose("هل تريد الإغلاق؟ ستفقد البيانات المدخلة.")) setShowGroupPayModal(false); return; }
      if (showAddMemberModal || showPassengerGroupModal) { if (await askClose("هل تريد الإغلاق؟ ستفقد البيانات المدخلة.")) { setShowAddMemberModal(false); setShowPassengerGroupModal(false); } return; }
      if (showChargeModal)   { if (await askClose("هل تريد الإغلاق؟ ستفقد البيانات المدخلة.")) setShowChargeModal(false); return; }
      if (showPayModal)      { if (await askClose("هل تريد الإغلاق؟ ستفقد البيانات المدخلة.")) setShowPayModal(false); return; }
      if (selectedPayment) { setSelectedPayment(null); return; }
      if (selectedGroup)   { setSelectedGroup(null); return; }
      if (selectedP)       { setSelectedP(null); return; }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [selectedP, selectedGroup, selectedPayment, showPayModal, showChargeModal, showAddMemberModal, showPassengerGroupModal, showGroupPayModal]);
  const [groupPayForm, setGroupPayForm]           = useState<GroupPayForm>({ amount:"", payment_date:new Date().toISOString().split("T")[0], method:"نقدي", notes:"" });
  const [savingGroupPay, setSavingGroupPay]       = useState(false);

  // بيانات الشركة للطباعة
  const primaryColor = config.color_primary || "#6B1F3A";
  const accentColor  = config.color_accent  || "#0C447C";
  const companyName  = config.name_ar       || "حملة الأقصى";
  const tagline      = config.tagline       || "";
  const logoUrl      = config.logo_url      || "";
  const printBrand: PrintBrand = { logoUrl, companyName, tagline, primaryColor, accentColor };

  useEffect(() => { loadFinanceData(); }, []);

  /* تحديث لحظي للبيانات المالية */
  useEffect(() => {
    const channel = supabase
      .channel("finance-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" },                 () => loadFinanceData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "custom_charges" },           () => loadFinanceData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "pricing_settings" },         () => loadFinanceData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "financial_groups" },         () => loadFinanceData(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "financial_group_members" },  () => loadFinanceData(true))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  function requireManage(): boolean {
    if (canManage) return true;
    showAlert("error", "لا تملك صلاحية إجراء عمليات مالية");
    return false;
  }

  async function loadFinanceData(silent = false) {
    if (silent) setRefreshing(true); else setLoading(true);
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
    setLastUpdated(new Date());
    setLoading(false);
    setRefreshing(false);
  }

  /* خرائط مُجهّزة مسبقاً لتفادي تكرار البحث داخل المصفوفات */
  const paymentsByPassenger = useMemo(() => {
    const map = new Map<number, Payment[]>();
    for (const py of payments) {
      const list = map.get(py.passenger_id) ?? [];
      list.push(py);
      map.set(py.passenger_id, list);
    }
    return map;
  }, [payments]);

  const chargesByPassenger = useMemo(() => {
    const map = new Map<number, CustomCharge[]>();
    for (const c of customCharges) {
      const list = map.get(c.passenger_id) ?? [];
      list.push(c);
      map.set(c.passenger_id, list);
    }
    return map;
  }, [customCharges]);

  const groupByPassenger = useMemo(() => {
    const byId = new Map<number, FinancialGroup>();
    for (const g of groups) byId.set(g.id, g);
    const map = new Map<number, FinancialGroup>();
    for (const m of groupMembers) {
      const g = byId.get(m.group_id);
      if (g && !map.has(m.passenger_id)) map.set(m.passenger_id, g);
    }
    return map;
  }, [groups, groupMembers]);

  const groupPassengerIds = useMemo(() => new Set(groupMembers.map(m => m.passenger_id)), [groupMembers]);

  async function savePricing() {
    if (!requireManage()) return;
    const rows: { key:string; label:string; type:string; amount:number; updated_at:string }[] = [];
    for (const key of Object.keys(editPricing)) {
      const amount = Number(editPricing[key]);
      if (!Number.isFinite(amount) || amount < 0) {
        const meta = PRICING_KEYS.find(k => k.key === key);
        showAlert("error", `قيمة غير صالحة في: ${meta?.label || key}`);
        return;
      }
      const meta = PRICING_KEYS.find(k => k.key === key);
      rows.push({
        key,
        label: pricing[key]?.label || meta?.label || key,
        type:  pricing[key]?.type  || meta?.type  || "addon",
        amount,
        updated_at: new Date().toISOString(),
      });
    }
    if (rows.length === 0) return;
    setSavingPricing(true);
    const { error } = await supabase.from("pricing_settings").upsert(rows, { onConflict: "key" });
    setSavingPricing(false);
    if (error) { showAlert("error", "تعذر حفظ الأسعار، لم يتم تطبيق أي تغيير"); return; }
    await loadFinanceData(true);
    showAlert("success","تم حفظ الأسعار بنجاح");
  }

  async function saveCustomPrice() {
    if (!requireManage()) return;
    if (!selectedP) return;
    setSavingCustomPrice(true);
    const amt = Number(customPriceInput);
    if (!Number.isFinite(amt) || amt < 0) {
      showAlert("error", "يرجى إدخال سعر صحيح غير سالب");
      setSavingCustomPrice(false);
      return;
    }
    const newServices = { ...selectedP.services, custom_price: String(amt) };
    const { error } = await supabase.from("passengers").update({ custom_price: amt }).eq("id", selectedP.id);
    if (!error) {
      setSelectedP({ ...selectedP, services: newServices });
      setPassengers?.(prev => prev.map(p => p.id === selectedP.id ? { ...p, services: newServices } as Passenger : p));
      setEditingCustomPrice(false);
      showAlert("success", "تم حفظ السعر الخاص");
    } else {
      showAlert("error", "حدث خطأ أثناء حفظ السعر");
    }
    setSavingCustomPrice(false);
  }

  async function addPayment() {
    if (!requireManage()) return;
    if (!selectedP) return;
    const amount = Number(payForm.amount);
    if (!payForm.amount.trim() || !Number.isFinite(amount) || amount <= 0) {
      showAlert("error", "يرجى إدخال مبلغ صحيح أكبر من صفر");
      return;
    }
    if (!payForm.payment_date || Number.isNaN(new Date(payForm.payment_date).getTime())) {
      showAlert("error", "يرجى تحديد تاريخ صحيح للدفعة");
      return;
    }
    const dueNow  = calcTotalDue(selectedP, pricing, chargesByPassenger);
    const paidNow = calcTotalPaid(selectedP.id, paymentsByPassenger);
    const remaining = dueNow - paidNow;
    if (amount > remaining) {
      const ok = await showConfirm(
        `المبلغ المدخل يتجاوز المتبقي على الحاج (${fmtAmt(remaining)} ر.ق). سيُسجَّل الفارق رصيداً دائناً للحاج. هل تريد المتابعة؟`,
        { title: "مبلغ يتجاوز المتبقي" }
      );
      if (!ok) return;
    }
    setSavingPay(true);
    const rec = { passenger_id:selectedP.id, amount, payment_date:payForm.payment_date, method:payForm.method, notes:payForm.notes, created_by:(currentUser as any).username||"" };
    const { data, error } = await supabase.from("payments").insert(rec).select().single();
    if (error || !data) {
      setSavingPay(false);
      showAlert("error", "تعذر تسجيل الدفعة، يرجى المحاولة مرة أخرى");
      return;
    }
    if (data) {
      setPayments(prev => [data as Payment, ...prev]);
      setShowPayModal(false);
      const pName = selectedP.short_ar || selectedP.name_ar;
      setReceiptPayment({ payment: data as Payment, passengerName: pName });
      setPayForm({ amount:"", payment_date:new Date().toISOString().split("T")[0], method:"نقدي", notes:"" });
    }
    setSavingPay(false);
  }

  async function deletePayment(id: number) {
    if (!requireManage()) return;
    if (!await showConfirm("هل تريد حذف هذه الدفعة؟")) return;
    const { error } = await supabase.from("payments").delete().eq("id",id);
    if (error) { showAlert("error", "تعذر حذف الدفعة، لم يتم تنفيذ الحذف"); return; }
    setPayments(prev => prev.filter(p => p.id !== id));
    showAlert("success", "تم حذف الدفعة");
  }

  async function addCustomCharge() {
    if (!requireManage()) return;
    const amount = Number(chargeForm.amount);
    const badAmount = !chargeForm.amount.trim() || !Number.isFinite(amount) || amount <= 0;
    const errs = { description: !chargeForm.description.trim(), amount: badAmount };
    setChargeErrors(errs);
    if (!selectedP || errs.description || errs.amount) {
      if (badAmount && chargeForm.amount.trim()) showAlert("error", "يرجى إدخال مبلغ صحيح أكبر من صفر");
      return;
    }
    setSavingCharge(true);
    const { data, error } = await supabase.from("custom_charges").insert({ passenger_id:selectedP.id, description:chargeForm.description, amount, type:chargeType, notes:chargeForm.notes, created_by:(currentUser as any).username||"" }).select().single();
    setSavingCharge(false);
    if (error || !data) { showAlert("error", "تعذر حفظ البند، يرجى المحاولة مرة أخرى"); return; }
    setCustomCharges(prev => [...prev, data as CustomCharge]);
    setShowChargeModal(false);
    setChargeForm({ description:"", amount:"", notes:"" });
  }

  async function deleteCustomCharge(id: number) {
    if (!requireManage()) return;
    if (!await showConfirm("هل تريد حذف هذا البند؟")) return;
    const { error } = await supabase.from("custom_charges").delete().eq("id",id);
    if (error) { showAlert("error", "تعذر حذف البند، لم يتم تنفيذ الحذف"); return; }
    setCustomCharges(prev => prev.filter(c => c.id !== id));
    showAlert("success", "تم حذف البند");
  }

  function getPassengerGroup(passengerId: number): FinancialGroup | null {
    return groupByPassenger.get(passengerId) || null;
  }

  function getGroupPassengers(groupId: number): Passenger[] {
    const pids = groupMembers.filter(m => m.group_id === groupId).map(m => m.passenger_id);
    return passengers.filter(p => pids.includes(p.id));
  }

  async function createGroupAndAdd() {
    if (!requireManage()) return;
    if (!selectedP) return;
    if (!groupForm.name.trim()) { showAlert("error", "يرجى إدخال اسم المجموعة"); return; }
    if (groupPassengerIds.has(selectedP.id)) {
      showAlert("error", "هذا الحاج منتمٍ بالفعل إلى مجموعة مالية أخرى");
      return;
    }
    setSavingGroup(true);
    const { data:grp, error:ge } = await supabase.from("financial_groups").insert({ name:groupForm.name.trim(), notes:groupForm.notes, created_by:(currentUser as any).username||"" }).select().single();
    if (ge || !grp) { setSavingGroup(false); showAlert("error", "تعذر إنشاء المجموعة، يرجى المحاولة مرة أخرى"); return; }
    const { data:mem, error:me } = await supabase.from("financial_group_members").insert({ group_id:grp.id, passenger_id:selectedP.id }).select().single();
    setSavingGroup(false);
    if (me || !mem) {
      await supabase.from("financial_groups").delete().eq("id", grp.id);
      showAlert("error", "تعذر إضافة الحاج إلى المجموعة، ولم يتم إنشاؤها");
      return;
    }
    setGroups(prev => [grp as FinancialGroup, ...prev]);
    setGroupMembers(prev => [...prev, mem as FinancialGroupMember]);
    setShowPassengerGroupModal(false);
    setGroupForm({ name:"", notes:"" });
    showAlert("success", `تم إنشاء المجموعة "${grp.name}" بنجاح`);
  }

  async function addMemberToGroup(groupId: number, passengerId: number) {
    if (!requireManage()) return;
    if (addingMemberId === passengerId) return;
    const existing = groupMembers.find(m => m.passenger_id === passengerId);
    if (existing) {
      showAlert("error", existing.group_id === groupId
        ? "هذا الحاج مضاف بالفعل إلى هذه المجموعة"
        : "هذا الحاج منتمٍ بالفعل إلى مجموعة مالية أخرى");
      return;
    }
    setAddingMemberId(passengerId);
    const { data, error } = await supabase.from("financial_group_members").insert({ group_id:groupId, passenger_id:passengerId }).select().single();
    setAddingMemberId(null);
    if (error || !data) { showAlert("error", "تعذر إضافة الحاج إلى المجموعة"); return; }
    setGroupMembers(prev => [...prev, data as FinancialGroupMember]);
    setShowAddMemberModal(false);
    setShowPassengerGroupModal(false);
    showAlert("success","تمت إضافة الحاج إلى المجموعة بنجاح");
  }

  async function removeFromGroup(passengerId: number, groupId: number) {
    if (!requireManage()) return;
    /* المجموعة لا يجوز أن تبقى بلا أعضاء — إزالة آخر عضو تعني حذف المجموعة بالكامل */
    const isLastMember = groupMembers.filter(m => m.group_id === groupId).length <= 1;
    const confirmed = isLastMember
      ? await showConfirm("هذا آخر عضو في المجموعة. عند المتابعة سيتم حذف المجموعة بالكامل. هل تريد الاستمرار؟", { title: "حذف المجموعة" })
      : await showConfirm("هل تريد إزالة هذا الحاج من المجموعة؟", { title: "إزالة من المجموعة" });
    if (!confirmed) return;

    const { error } = await supabase.from("financial_group_members").delete().eq("group_id",groupId).eq("passenger_id",passengerId);
    if (error) { showAlert("error", "تعذر إزالة الحاج من المجموعة"); return; }

    if (isLastMember) {
      /* حذف المجموعة يتم تلقائياً في قاعدة البيانات، والاستدعاء هنا للتأكيد ولا يفشل إن كانت محذوفة */
      const { error: gErr } = await supabase.from("financial_groups").delete().eq("id",groupId);
      if (gErr) {
        showAlert("error", "تمت إزالة الحاج، لكن تعذر حذف المجموعة الفارغة");
        setGroupMembers(prev => prev.filter(m => !(m.group_id===groupId && m.passenger_id===passengerId)));
        return;
      }
      setGroupMembers(prev => prev.filter(m => m.group_id !== groupId));
      setGroups(prev => prev.filter(g => g.id !== groupId));
      if (selectedGroup?.id === groupId) { setSelectedGroup(null); if (subView === "group") setSubView("list"); }
      showAlert("success", "تمت إزالة آخر عضو وحُذفت المجموعة");
      return;
    }

    setGroupMembers(prev => prev.filter(m => !(m.group_id===groupId && m.passenger_id===passengerId)));
    showAlert("success", "تمت إزالة الحاج من المجموعة");
  }

  async function deleteGroup(groupId: number) {
    if (!requireManage()) return;
    if (!await showConfirm("هل تريد حذف هذه المجموعة؟", { title: "حذف مجموعة" })) return;
    const { error } = await supabase.from("financial_groups").delete().eq("id",groupId);
    if (error) { showAlert("error", "تعذر حذف المجموعة، لم يتم تنفيذ الحذف"); return; }
    setGroups(prev => prev.filter(g => g.id !== groupId));
    setGroupMembers(prev => prev.filter(m => m.group_id !== groupId));
    setSubView("list"); setSelectedGroup(null);
  }

  async function addGroupPayment() {
    if (!requireManage()) return;
    if (!selectedGroup) return;
    const total = Number(groupPayForm.amount);
    if (!groupPayForm.amount.trim() || !Number.isFinite(total) || total <= 0) {
      showAlert("error", "يرجى إدخال مبلغ صحيح أكبر من صفر");
      return;
    }
    if (!groupPayForm.payment_date || Number.isNaN(new Date(groupPayForm.payment_date).getTime())) {
      showAlert("error", "يرجى تحديد تاريخ صحيح للدفعة");
      return;
    }
    const members = getGroupPassengers(selectedGroup.id);
    if (members.length === 0) { showAlert("error", "لا يوجد أعضاء في هذه المجموعة"); return; }
    setSavingGroupPay(true);
    /* التوزيع بالسنتات: يُضاف فرق التقريب إلى الأعضاء الأخيرين ليساوي المجموع المبلغ المدخل تماماً */
    const totalUnits = Math.round(total * 100);
    const baseUnits  = Math.floor(totalUnits / members.length);
    const extraUnits = totalUnits - baseUnits * members.length;
    const shares = members.map((_, i) => (baseUnits + (i >= members.length - extraUnits ? 1 : 0)) / 100);
    const inserts = members.map((p, i) => ({ passenger_id:p.id, amount:shares[i], payment_date:groupPayForm.payment_date, method:groupPayForm.method, notes:`${groupPayForm.notes?groupPayForm.notes+" — ":""}دفعة مجموعة: ${selectedGroup.name}`, created_by:(currentUser as any).username||"" }));
    const { data, error } = await supabase.from("payments").insert(inserts).select();
    setSavingGroupPay(false);
    if (error || !data) { showAlert("error", "تعذر توزيع الدفعة، لم يتم تسجيل أي مبلغ"); return; }
    setPayments(prev => [...(data as Payment[]), ...prev]);
    setShowGroupPayModal(false);
    setGroupPayForm({ amount:"", payment_date:new Date().toISOString().split("T")[0], method:"نقدي", notes:"" });
    const minShare = Math.min(...shares), maxShare = Math.max(...shares);
    const shareText = minShare === maxShare ? `${fmtAmt(minShare)} ر.ق للفرد` : `${fmtAmt(minShare)} — ${fmtAmt(maxShare)} ر.ق للفرد`;
    showAlert("success", `تم توزيع ${fmtAmt(total)} ر.ق على ${members.length} من الأعضاء (${shareText})`);
  }

  // ── تصدير التقارير ──
  function exportFullReportXLSX(data:{p:Passenger;due:number;paid:number;balance:number}[], title="تقرير الحجاج المالي الكامل") {
    const headers = ["م", "الاسم", "الباقة", "المطلوب", "المدفوع", "المتبقي", "الحالة"];
    const rows = data.map((r, i) => {
      const st = financeStatus(r.due, r.paid);
      return [
        i + 1,
        r.p.short_ar || r.p.name_ar,
        getPriceInfo(r.p.services, pricing).label.replace("باقة ", ""),
        r.due,
        r.paid,
        r.balance,
        st.label,
      ];
    });
    const tD = data.reduce((s, r) => s + r.due, 0);
    const tP = data.reduce((s, r) => s + r.paid, 0);
    const tB = tD - tP;
    const ws = XLSX.utils.aoa_to_sheet([
      headers,
      ...rows,
      ["", "الإجمالي", "", tD, tP, tB, ""],
    ]);
    ws["!cols"] = [{ wch: 4 }, { wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "التقرير");
    XLSX.writeFile(wb, `${title}.xlsx`);
  }

  // مساعدات التصميم
  const sortedPassengers = [...passengers].filter(p => !p.passenger_type || p.passenger_type === "حاج").sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
  const inputStyle = { width:"100%", padding:"8px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg-input)", fontFamily:"var(--font-body)", fontSize:13, boxSizing:"border-box" as const };
  const thStyle    = { padding:"10px 12px", background:"var(--em8)", color:"#fff", textAlign:"right" as const, fontSize:12, fontWeight:600 };
  const tdStyle    = { padding:"8px 12px", border:"1px solid var(--border)", fontSize:13 };

  const filteredPassengers = sortedPassengers.filter(p => {
    const name = (p.short_ar||p.name_ar||"").toLowerCase();
    if (searchTerm && !name.includes(searchTerm.toLowerCase())) return false;
    if (filterPackage !== "all" && getPackageKey(p.services.hotel_type) !== filterPackage) return false;
    if (filterStatus !== "all") {
      const due=calcTotalDue(p,pricing,chargesByPassenger), paid=calcTotalPaid(p.id,paymentsByPassenger);
      const label = financeStatus(due, paid).label;
      const wanted: Record<string,string> = { paid:"مسدد", partial:"جزئي", unpaid:"لم يدفع", unpriced:"غير مسعّر", credit:"رصيد دائن" };
      if (label !== wanted[filterStatus]) return false;
    }
    return true;
  });

  // ══════════════════════════════════════════════
  // RECEIPT MODAL
  // ══════════════════════════════════════════════
  const ReceiptModal = () => {
    if (!receiptPayment) return null;
    const { payment, passengerName } = receiptPayment;
    const receiptHtml = makeReceiptHTML(passengerName,payment,logoUrl,companyName,tagline,primaryColor,accentColor);
    return (
      <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1500 }}>
        <div style={{ background:"var(--bg-card)", borderRadius:16, padding:24, width:340, boxShadow:"var(--shadow-xl)", textAlign:"center" }}>
          <div style={{ width:48, height:48, borderRadius:"50%", background:"var(--success-bg)", color:"var(--success)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, fontWeight:700, margin:"0 auto 12px" }}>✓</div>
          <div style={{ fontSize:15, fontWeight:700, color:"var(--text)", marginBottom:4 }}>تم تسجيل الدفعة</div>
          <div style={{ fontSize:13, color:"var(--text-muted)", marginBottom:4 }}>{passengerName}</div>
          <div style={{ fontSize:24, fontWeight:900, color:"var(--success)", marginBottom:16 }}>{fmtAmt(Number(payment.amount))} <span style={{ fontSize:13 }}>ر.ق</span></div>
          <div style={{ display:"flex", gap:10, marginBottom:10 }}>
            <button onClick={() => printInPage(receiptHtml)}
              style={{ flex:1, padding:10, background:"var(--em8)", color:"#fff", border:"none", borderRadius:10, fontFamily:"var(--font-body)", fontSize:13, cursor:"pointer", fontWeight:600 }}>
              🖨️ طباعة
            </button>

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
  // PAYMENT DETAIL MODAL
  // ══════════════════════════════════════════════
  const PaymentDetailModal = () => {
    if (!selectedPayment) return null;
    const modalP = selectedP ?? passengers.find(x => x.id === selectedPayment.passenger_id) ?? null;
    const pName = modalP ? (modalP.short_ar || modalP.name_ar) : "—";
    return (
      <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1500 }} onClick={() => setSelectedPayment(null)}>
        <div style={{ background:"var(--bg-card)", borderRadius:16, padding:24, width:360, boxShadow:"var(--shadow-xl)" }} onClick={e => e.stopPropagation()}>
          <div style={{ fontWeight:700, fontSize:16, color:"var(--text)", marginBottom:16, textAlign:"center" }}>تفاصيل الدفعة</div>
          <div style={{ background:"var(--success-bg)", border:"1px solid var(--success)", borderRadius:12, padding:16, marginBottom:16, textAlign:"center" }}>
            <div style={{ fontSize:12, color:"var(--text-muted)", marginBottom:4 }}>المبلغ</div>
            <div style={{ fontSize:32, fontWeight:900, color:"var(--success)" }}>{fmtAmt(Number(selectedPayment.amount))}</div>
            <div style={{ fontSize:12, color:"var(--text-muted)" }}>ر.ق</div>
          </div>
          {[
            { label:"الحاج",         value: pName },
            { label:"التاريخ",       value: selectedPayment.payment_date },
            { label:"طريقة الدفع",   value: selectedPayment.method },
            ...(selectedPayment.notes ? [{ label:"ملاحظات", value: selectedPayment.notes }] : []),
            ...(selectedPayment.created_by ? [{ label:"سجّل بواسطة", value: selectedPayment.created_by }] : []),
          ].map(row => (
            <div key={row.label} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid var(--border)", fontSize:13 }}>
              <span style={{ color:"var(--text-muted)" }}>{row.label}</span>
              <span style={{ fontWeight:600 }}>{row.value}</span>
            </div>
          ))}
          <div style={{ display:"flex", gap:10, marginTop:16 }}>
            <button onClick={() => { printInPage(makeReceiptHTML(pName, selectedPayment, logoUrl, companyName, tagline, primaryColor, accentColor)); }}
              style={{ flex:1, padding:10, background:"var(--em8)", color:"#fff", border:"none", borderRadius:10, fontFamily:"var(--font-body)", fontSize:13, cursor:"pointer", fontWeight:600 }}>
              🖨️ طباعة إيصال
            </button>
            <button onClick={() => setSelectedPayment(null)}
              style={{ flex:1, padding:10, background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:10, fontFamily:"var(--font-body)", fontSize:13, cursor:"pointer" }}>
              إغلاق
            </button>
          </div>
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
      <ConfirmModal state={confirmState} onConfirm={handleConfirmYes} onCancel={handleConfirmNo} />
      <div style={{ maxWidth:560, margin:"0 auto" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
          <button onClick={() => setSubView("list")} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--primary)", fontSize:24 }}>←</button>
          <div style={{ fontFamily:"var(--font-heading)", fontSize:20, fontWeight:600, color:"var(--text)" }}>إعدادات الأسعار</div>
        </div>
        {(["package","addon","discount"] as const).map(type => (
          <div key={type} style={{ background:"var(--bg-card)", borderRadius:12, padding:16, marginBottom:16, boxShadow:"var(--shadow-sm)" }}>
            <div style={{ fontWeight:700, color:"var(--text)", marginBottom:12, fontSize:14, borderBottom:"1px solid var(--border)", paddingBottom:8 }}>
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
    const availableToAdd=passengers.filter(p=>!groupPassengerIds.has(p.id));
    return (
      <div style={{ flex:1, overflowY:"auto", padding:20 }}>
        <AlertModal alert={alertState} onClose={() => showAlert(null)} />
        <ConfirmModal state={confirmState} onConfirm={handleConfirmYes} onCancel={handleConfirmNo} />
        <ReceiptModal />
        <FinancialGroupView
          canManage={canManage}
          group={selectedGroup}
          groupPassengers={gPassengers}
          availableToAdd={availableToAdd}
          pricing={pricing}
          chargesByPassenger={chargesByPassenger}
          paymentsByPassenger={paymentsByPassenger}
          showAddMemberModal={showAddMemberModal}
          showGroupPayModal={showGroupPayModal}
          addingMemberId={addingMemberId}
          groupPayForm={groupPayForm}
          savingGroupPay={savingGroupPay}
          onBack={() => { setSubView("list"); setSelectedGroup(null); }}
          onPrintGroupStatement={()=>printInPage(makeGroupStatementHTML(selectedGroup,gPassengers,pricing,customCharges,payments,logoUrl,companyName,tagline,primaryColor,accentColor))}
          onDeleteGroup={gid => deleteGroup(gid)}
          onSelectPassenger={p => { setSelectedP(p); setSubView("detail"); }}
          onRemoveMember={(pid, gid) => removeFromGroup(pid, gid)}
          onAddMember={(gid, pid) => addMemberToGroup(gid, pid)}
          onOpenAddMemberModal={() => setShowAddMemberModal(true)}
          onCloseAddMemberModal={() => setShowAddMemberModal(false)}
          onOpenGroupPayModal={() => setShowGroupPayModal(true)}
          onCloseGroupPayModal={() => setShowGroupPayModal(false)}
          onGroupPayFormChange={(key, value) => setGroupPayForm(prev => ({ ...prev, [key]: value }))}
          onSubmitGroupPayment={addGroupPayment}
          thStyle={thStyle}
          tdStyle={tdStyle}
          inputStyle={inputStyle}
        />
      </div>
    );
  }

  // ══════════════════════════════════════════════
  // DETAIL VIEW
  // ══════════════════════════════════════════════
  if (subView === "detail" && selectedP) {
    const passengerGroup=getPassengerGroup(selectedP.id);
    return (
      <div style={{ flex:1, overflowY:"auto", padding:20 }}>
        <AlertModal alert={alertState} onClose={()=>showAlert(null)} />
        <ConfirmModal state={confirmState} onConfirm={handleConfirmYes} onCancel={handleConfirmNo} />
        <ReceiptModal />
        <PaymentDetailModal />
        <PassengerFinanceView
          canManage={canManage}
          passenger={selectedP}
          pricing={pricing}
          passengerPayments={paymentsFor(selectedP.id, paymentsByPassenger)}
          passengerCharges={chargesFor(selectedP.id, chargesByPassenger)}
          group={passengerGroup}
          groups={groups}
          editingCustomPrice={editingCustomPrice}
          customPriceInput={customPriceInput}
          savingCustomPrice={savingCustomPrice}
          onBack={()=>{setSubView("list");setSelectedP(null);setSelectedPayment(null);}}
          onPrintStatement={()=>printInPage(makePassengerStatementHTML(selectedP,pricing,customCharges,payments,logoUrl,companyName,tagline,primaryColor,accentColor))}
          onEditCustomPrice={()=>{ setCustomPriceInput(String((selectedP.services as any).custom_price || "")); setEditingCustomPrice(true); }}
          onCustomPriceInputChange={setCustomPriceInput}
          onSaveCustomPrice={saveCustomPrice}
          onCancelEditCustomPrice={()=>setEditingCustomPrice(false)}
          onAddPayment={()=>setShowPayModal(true)}
          onAddCharge={t=>{setChargeType(t);setChargeForm({description:"",amount:"",notes:""});setShowChargeModal(true);}}
          onOpenPayment={py=>setSelectedPayment(py)}
          onDeletePayment={id=>deletePayment(id)}
          onDeleteCharge={id=>deleteCustomCharge(id)}
          onOpenGroup={g=>{setSelectedGroup(g);setSubView("group");}}
          onRemoveFromGroup={gid=>removeFromGroup(selectedP.id,gid)}
          onCreateGroup={()=>{setGroupModalMode("create");setGroupForm({name:"",notes:""});setShowPassengerGroupModal(true);}}
          onAddToExistingGroup={()=>{setGroupModalMode("addTo");setShowPassengerGroupModal(true);}}
          tdStyle={tdStyle}
        />

        {/* مودال: دفعة */}
        {showPayModal&&(
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }}>
            <div style={{ background:"var(--bg-card)", borderRadius:16, padding:24, width:340, boxShadow:"var(--shadow-xl)" }}>
              <div style={{ fontWeight:700, fontSize:16, marginBottom:16, color:"var(--success)" }}>تسجيل دفعة جديدة</div>
              {[{label:"المبلغ",key:"amount",type:"number",ph:"0"},{label:"التاريخ",key:"payment_date",type:"date",ph:""},{label:"ملاحظات (اختياري)",key:"notes",type:"text",ph:"..."}].map(f=>(
                <div key={f.key} style={{ marginBottom:12 }}><div style={{ fontSize:12, color:"var(--text-muted)", marginBottom:4 }}>{f.label}</div><input type={f.type} min={f.type==="number"?0:undefined} placeholder={f.ph} value={(payForm as any)[f.key]} onChange={e=>setPayForm(p=>({...p,[f.key]:e.target.value}))} style={inputStyle}/></div>
              ))}
              <div style={{ marginBottom:16 }}><div style={{ fontSize:12, color:"var(--text-muted)", marginBottom:4 }}>طريقة الدفع</div><select value={payForm.method} onChange={e=>setPayForm(p=>({...p,method:e.target.value}))} style={inputStyle}>{["نقدي","تحويل بنكي","شيك"].map(m=><option key={m}>{m}</option>)}</select></div>
              <div style={{ display:"flex", gap:10 }}>
                <button onClick={addPayment} disabled={savingPay} style={{ flex:1, padding:10, background:"var(--success)", color:"#fff", border:"none", borderRadius:8, fontFamily:"var(--font-body)", cursor:"pointer" }}>{savingPay?"جارٍ الحفظ...":"حفظ"}</button>
                <button onClick={()=>setShowPayModal(false)} style={{ flex:1, padding:10, background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, fontFamily:"var(--font-body)", cursor:"pointer" }}>إلغاء</button>
              </div>
            </div>
          </div>
        )}

        {/* مودال: بند خاص */}
        {showChargeModal&&(
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }}>
            <div style={{ background:"var(--bg-card)", borderRadius:16, padding:24, width:360, boxShadow:"var(--shadow-xl)" }}>
              {/* أيقونة + عنوان */}
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
                <div style={{ width:40, height:40, borderRadius:"50%", background:chargeType==="إضافة"?"var(--warning-bg)":"var(--danger-bg)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, fontWeight:900, color:chargeType==="إضافة"?"var(--warning)":"var(--danger)", flexShrink:0 }}>
                  {chargeType==="إضافة" ? "+" : "−"}
                </div>
                <div>
                  <div style={{ fontWeight:800, fontSize:16, color:chargeType==="إضافة"?"var(--warning)":"var(--danger)" }}>{chargeType==="إضافة"?"إضافة بند خاص":"إضافة خصم"}</div>
                  <div style={{ fontSize:11, color:"var(--text-muted)", marginTop:2 }}>{chargeType==="إضافة"?"مبلغ إضافي على الحاج":"خصم من إجمالي الحاج"}</div>
                </div>
              </div>
              {/* الحقول */}
              {[
                {label:chargeType==="إضافة"?"وصف البند *":"سبب الخصم *",key:"description",ph:chargeType==="إضافة"?"مثال: ليموزين من المطار":"مثال: خصم موظف"},
                {label:"المبلغ *",key:"amount",ph:"0"},
                {label:"ملاحظات (اختياري)",key:"notes",ph:"..."}
              ].map(f=>(
                <div key={f.key} style={{ marginBottom:12 }}>
                  <div style={{ fontSize:12, color:"var(--text-muted)", marginBottom:4 }}>{f.label}</div>
                  <input type={f.key==="amount"?"number":"text"} min={f.key==="amount"?0:undefined} placeholder={f.ph} value={(chargeForm as any)[f.key]}
                    onChange={e=>{ setChargeForm(p=>({...p,[f.key]:e.target.value})); if((chargeErrors as any)[f.key]) setChargeErrors(p=>({...p,[f.key]:false})); }}
                    style={{ ...inputStyle, borderColor:(chargeErrors as any)[f.key]?"var(--danger)":"" }} />
                  {(chargeErrors as any)[f.key] && <div style={{ fontSize:11, color:"var(--danger)", marginTop:3 }}>يرجى إدخال {f.label.replace(" *","")}</div>}
                </div>
              ))}
              <div style={{ display:"flex", gap:10, marginTop:4 }}>
                <button onClick={addCustomCharge} disabled={savingCharge} style={{ flex:1, padding:10, background:chargeType==="إضافة"?"var(--warning)":"var(--danger)", color:"#fff", border:"none", borderRadius:8, fontFamily:"var(--font-body)", cursor:"pointer", fontWeight:600 }}>{savingCharge?"جارٍ الحفظ...":"حفظ"}</button>
                <button onClick={()=>{ setShowChargeModal(false); setChargeErrors({description:false,amount:false}); }} style={{ flex:1, padding:10, background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, fontFamily:"var(--font-body)", cursor:"pointer" }}>إلغاء</button>
              </div>
            </div>
          </div>
        )}


        {/* مودال تأكيد الإجراءات */}
        <ConfirmModal state={confirmState} onConfirm={handleConfirmYes} onCancel={handleConfirmNo} />
        {/* مودال: مجموعة */}
        {showPassengerGroupModal&&(
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }}>
            <div style={{ background:"var(--bg-card)", borderRadius:16, padding:24, width:360, boxShadow:"var(--shadow-xl)", maxHeight:"80vh", overflowY:"auto" }}>
              {groupModalMode==="create"?(
                <>
                  <div style={{ fontWeight:700, fontSize:16, marginBottom:16, color:"var(--text)" }}>إنشاء مجموعة مالية جديدة</div>
                  <div style={{ marginBottom:12 }}><div style={{ fontSize:12, color:"var(--text-muted)", marginBottom:4 }}>اسم المجموعة</div><input type="text" placeholder="مثال: عائلة الأحمدي" value={groupForm.name} onChange={e=>setGroupForm(p=>({...p,name:e.target.value}))} style={inputStyle}/></div>
                  <div style={{ marginBottom:16 }}><div style={{ fontSize:12, color:"var(--text-muted)", marginBottom:4 }}>ملاحظات (اختياري)</div><input type="text" placeholder="..." value={groupForm.notes} onChange={e=>setGroupForm(p=>({...p,notes:e.target.value}))} style={inputStyle}/></div>
                  <div style={{ display:"flex", gap:10 }}>
                    <button onClick={createGroupAndAdd} disabled={savingGroup} style={{ flex:1, padding:10, background:"var(--primary)", color:"#fff", border:"none", borderRadius:8, fontFamily:"var(--font-body)", cursor:"pointer" }}>{savingGroup?"جارٍ الإنشاء...":"إنشاء وإضافة الحاج"}</button>
                    <button onClick={()=>setShowPassengerGroupModal(false)} style={{ flex:1, padding:10, background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, fontFamily:"var(--font-body)", cursor:"pointer" }}>إلغاء</button>
                  </div>
                </>
              ):(
                <>
                  <div style={{ fontWeight:700, fontSize:16, marginBottom:16, color:"var(--text)" }}>إضافة إلى مجموعة موجودة</div>
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
                  <button onClick={()=>setShowPassengerGroupModal(false)} style={{ width:"100%", marginTop:16, padding:10, background:"var(--bg-2)", border:"1px solid var(--border)", borderRadius:8, fontFamily:"var(--font-body)", cursor:"pointer" }}>إغلاق</button>
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
    // مودال تفاصيل الدفعة متاح في التقارير
    const allData=sortedPassengers.map(p=>{const due=calcTotalDue(p,pricing,chargesByPassenger),paid=calcTotalPaid(p.id,paymentsByPassenger);return{p,due,paid,balance:due-paid};});
    const totDue=allData.reduce((s,r)=>s+r.due,0),totPaid=allData.reduce((s,r)=>s+r.paid,0),totBal=totDue-totPaid;
    const filtered=reportType==="late"?allData.filter(r=>r.balance>0):allData;
    const cfPayments = payments.filter(py => {
      const d = py.payment_date;
      return (!cashflowFrom || d >= cashflowFrom) && (!cashflowTo || d <= cashflowTo);
    });
    const cfByDate: Record<string, { total: number; count: number; methods: Record<string, number> }> = {};
    cfPayments.forEach(py => {
      if (!cfByDate[py.payment_date]) cfByDate[py.payment_date] = { total: 0, count: 0, methods: {} };
      cfByDate[py.payment_date].total += Number(py.amount);
      cfByDate[py.payment_date].count += 1;
      cfByDate[py.payment_date].methods[py.method] = (cfByDate[py.payment_date].methods[py.method] || 0) + Number(py.amount);
    });
    const cfDates = Object.keys(cfByDate).sort();
    const cfTotal = cfPayments.reduce((s, p) => s + Number(p.amount), 0);
    const printActions:Record<string,()=>void>={ full:()=>printFullReport(allData,pricing,printBrand), late:()=>printFullReport(allData.filter(r=>r.balance>0),pricing,printBrand,"تقرير المتأخرين"), payments:()=>printPaymentsReport(cfPayments,passengers,printBrand,cashflowFrom,cashflowTo), packages:()=>printPackagesReport(passengers,pricing,printBrand), addons:()=>printAddonsReport(passengers,pricing,printBrand), cashflow:()=>printCashflowReport({ dates:cfDates, byDate:cfByDate, total:cfTotal, from:cashflowFrom, to:cashflowTo, brand:printBrand }) };
    const excelActions:Record<string,(()=>void)|undefined>={ full:()=>exportFullReportXLSX(allData), late:()=>exportFullReportXLSX(allData.filter(r=>r.balance>0),"تقرير المتأخرين") };
    return (
      <div style={{ flex:1, overflowY:"auto", padding:20 }}>
        <AlertModal alert={alertState} onClose={()=>showAlert(null)} />
        <ConfirmModal state={confirmState} onConfirm={handleConfirmYes} onCancel={handleConfirmNo} />
        <PaymentDetailModal />
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
          <button onClick={()=>setSubView("list")} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--primary)", fontSize:24 }}>←</button>
          <div style={{ fontFamily:"var(--font-heading)", fontSize:18, fontWeight:700, color:"var(--text)" }}>التقارير المالية</div>
          {excelActions[reportType] && (
            <button onClick={excelActions[reportType]} style={{ marginRight:"auto", padding:"7px 18px", background:"#1D6F42", color:"#fff", border:"none", borderRadius:8, fontSize:13, cursor:"pointer", fontWeight:600, display:"inline-flex", alignItems:"center", gap:6, fontFamily:"var(--font-body)" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>Excel</button>
          )}
          <button onClick={printActions[reportType]} style={{ padding:"7px 18px", background:"var(--em8)", color:"#fff", border:"none", borderRadius:8, fontSize:13, cursor:"pointer", fontWeight:600, display:"inline-flex", alignItems:"center", gap:6, fontFamily:"var(--font-body)" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>طباعة</button>
        </div>
        <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
          {([{key:"full",label:"تقرير الحجاج الكامل"},{key:"late",label:"المتأخرون"},{key:"payments",label:"سجل الدفعات"},{key:"packages",label:"تقرير الباقات"},{key:"addons",label:"ملخص الإضافات"},{key:"cashflow",label:"التحصيل اليومي"}] as const).map(t=>(
            <button key={t.key} onClick={()=>setReportType(t.key)} style={{ padding:"6px 16px", borderRadius:99, border:"none", fontFamily:"var(--font-body)", fontSize:12, cursor:"pointer", fontWeight:reportType===t.key?700:400, background:reportType===t.key?"var(--em8)":"var(--bg-2)", color:reportType===t.key?"#fff":"var(--text)" }}>{t.label}</button>
          ))}
        </div>
        {/* فلتر التاريخ المشترك بين سجل الدفعات والتحصيل اليومي */}
        {(reportType==="payments"||reportType==="cashflow")&&(
          <div style={{ marginBottom:16 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, background:"var(--bg-card)", borderRadius:12, padding:"12px 16px", boxShadow:"var(--shadow-sm)", flexWrap:"wrap" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--em8)" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <span style={{ fontSize:12, fontWeight:700, color:"var(--text-muted)" }}>من:</span>
              <input type="date" value={cashflowFrom} onChange={e=>setCashflowFrom(e.target.value)} style={{ border:"0.5px solid var(--border)", borderRadius:8, padding:"5px 10px", fontSize:12, fontFamily:"var(--font-body)", background:"var(--bg-2)", color:"var(--text)", outline:"none" }} />
              <span style={{ fontSize:12, fontWeight:700, color:"var(--text-muted)" }}>إلى:</span>
              <input type="date" value={cashflowTo} onChange={e=>setCashflowTo(e.target.value)} style={{ border:"0.5px solid var(--border)", borderRadius:8, padding:"5px 10px", fontSize:12, fontFamily:"var(--font-body)", background:"var(--bg-2)", color:"var(--text)", outline:"none" }} />
              {(cashflowFrom||cashflowTo)&&<button onClick={()=>{setCashflowFrom("");setCashflowTo("");}} style={{ fontSize:11, padding:"4px 10px", borderRadius:8, border:"0.5px solid var(--border)", background:"var(--bg-2)", cursor:"pointer", color:"var(--text-muted)", fontFamily:"var(--font-body)" }}>مسح الفلتر</button>}
            </div>
          </div>
        )}
        {(reportType==="full"||reportType==="late")&&(
          <>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:16 }}>
              {[{label:"إجمالي المطلوب",value:fmtAmt(totDue),color:"var(--text)"},{label:"إجمالي المحصل",value:fmtAmt(totPaid),color:"var(--success)"},{label:"إجمالي المتبقي",value:fmtAmt(totBal),color:"var(--danger)"}].map(c=>(
                <div key={c.label} style={{ background:"var(--bg-card)", borderRadius:10, padding:"12px 16px", textAlign:"center", boxShadow:"var(--shadow-sm)" }}><div style={{ fontSize:11, color:"var(--text-muted)", marginBottom:4 }}>{c.label}</div><div style={{ fontSize:18, fontWeight:700, color:c.color }}>{c.value}</div><div style={{ fontSize:10, color:"var(--text-muted)" }}>ر.ق</div></div>
              ))}
            </div>
            <div style={{ background:"var(--bg-card)", borderRadius:12, overflow:"hidden", boxShadow:"var(--shadow-sm)" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead><tr><th style={{ ...thStyle, textAlign:"center", width:36 }}>م</th><th style={thStyle}>الاسم</th><th style={{ ...thStyle, textAlign:"center" }}>الباقة</th><th style={{ ...thStyle, textAlign:"center" }}>المطلوب</th><th style={{ ...thStyle, textAlign:"center" }}>المدفوع</th><th style={{ ...thStyle, textAlign:"center" }}>المتبقي</th><th style={{ ...thStyle, textAlign:"center" }}>الحالة</th></tr></thead>
                <tbody>
                  {filtered.map(({p,due,paid,balance},i)=>{const st=financeStatus(due,paid);return(<tr key={p.id} onClick={()=>{setSelectedP(p);setSubView("detail");}} style={{ cursor:"pointer", background:i%2===0?"var(--bg-card)":"var(--bg-2)" }}><td style={{ ...tdStyle, textAlign:"center", color:"var(--text-muted)", fontSize:12 }}>{i+1}</td><td style={tdStyle}>{p.short_ar||p.name_ar}</td><td style={{ ...tdStyle, textAlign:"center", fontSize:11, color:"var(--text-muted)" }}>{getPriceInfo(p.services, pricing).label||"—"}</td><td style={{ ...tdStyle, textAlign:"center", color:"var(--text)", fontWeight:600 }}>{fmtAmt(due)}</td><td style={{ ...tdStyle, textAlign:"center", color:"var(--success)", fontWeight:600 }}>{fmtAmt(paid)}</td><td style={{ ...tdStyle, textAlign:"center", color:balance>0?"var(--danger)":"var(--success)", fontWeight:600 }}>{fmtAmt(balance)}</td><td style={{ ...tdStyle, textAlign:"center" }}><span style={{ fontSize:11, padding:"2px 8px", borderRadius:99, background:st.bg, color:st.color, fontWeight:700 }}>{st.label}</span></td></tr>);})}
                  <tr style={{ background:"var(--em8)", color:"#fff", fontWeight:700 }}><td style={{ padding:"10px 12px" }} colSpan={3}>الإجمالي</td><td style={{ padding:"10px 12px", textAlign:"center" }}>{fmtAmt(totDue)}</td><td style={{ padding:"10px 12px", textAlign:"center" }}>{fmtAmt(totPaid)}</td><td style={{ padding:"10px 12px", textAlign:"center" }}>{fmtAmt(totBal)}</td><td style={{ padding:"10px 12px" }}></td></tr>
                </tbody>
              </table>
            </div>
          </>
        )}
        {reportType==="payments"&&cfPayments.length===0&&(
          <div style={{ textAlign:"center", padding:40, color:"var(--text-muted)", fontSize:13 }}>لا توجد دفعات في الفترة المحددة</div>
        )}
        {reportType==="payments"&&cfPayments.length>0&&(
          <div style={{ background:"var(--bg-card)", borderRadius:12, overflow:"hidden", boxShadow:"var(--shadow-sm)" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr><th style={{ ...thStyle, textAlign:"center", width:36 }}>م</th><th style={thStyle}>الحاج</th><th style={{ ...thStyle, textAlign:"center" }}>التاريخ</th><th style={{ ...thStyle, textAlign:"center" }}>طريقة الدفع</th><th style={{ ...thStyle, textAlign:"center" }}>المبلغ</th><th style={thStyle}>ملاحظات</th><th style={{ ...thStyle, width:32 }}></th></tr></thead>
              <tbody>
                {[...cfPayments].sort((a,b)=>new Date(b.payment_date).getTime()-new Date(a.payment_date).getTime()).map((py,i)=>{const p=passengers.find(x=>x.id===py.passenger_id);const pName=p?(p.short_ar||p.name_ar):"—";return(<tr key={py.id} onClick={()=>{ if(p) setSelectedP(p); setSelectedPayment(py); }} style={{ background:i%2===0?"var(--bg-card)":"var(--bg-2)", cursor:"pointer", transition:"background 0.15s" }} onMouseEnter={e=>(e.currentTarget.style.background="var(--primary-light,#f0e8ec)")} onMouseLeave={e=>(e.currentTarget.style.background=i%2===0?"var(--bg-card)":"var(--bg-2)")}><td style={{ ...tdStyle, textAlign:"center", color:"var(--text-muted)", fontSize:12 }}>{i+1}</td><td style={tdStyle}>{pName}</td><td style={{ ...tdStyle, textAlign:"center" }}>{py.payment_date}</td><td style={{ ...tdStyle, textAlign:"center" }}>{py.method}</td><td style={{ ...tdStyle, textAlign:"center", color:"var(--success)", fontWeight:600 }}>{fmtAmt(py.amount)}</td><td style={{ ...tdStyle, color:"var(--text-muted)", fontSize:12 }}>{py.notes||"—"}</td><td style={{ ...tdStyle, textAlign:"center", width:32 }}><span onClick={e=>{e.stopPropagation();printInPage(makeReceiptHTML(pName,py,logoUrl,companyName,tagline,primaryColor,accentColor));}} title="طباعة إيصال" style={{ cursor:"pointer", display:"inline-flex" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg></span></td></tr>);})}
                <tr style={{ background:"var(--em8)", color:"#fff", fontWeight:700 }}><td style={{ padding:"10px 12px" }} colSpan={4}>الإجمالي</td><td style={{ padding:"10px 12px", textAlign:"center" }}>{fmtAmt(cfTotal)}</td><td style={{ padding:"10px 12px" }}></td></tr>
              </tbody>
            </table>
          </div>
        )}
        {reportType==="packages"&&(
          <div style={{ background:"var(--bg-card)", borderRadius:12, overflow:"hidden", boxShadow:"var(--shadow-sm)" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr><th style={thStyle}>الباقة</th><th style={{ ...thStyle, textAlign:"center" }}>عدد الحجاج</th><th style={{ ...thStyle, textAlign:"center" }}>السعر الواحد</th><th style={{ ...thStyle, textAlign:"center" }}>الإجمالي المستحق</th></tr></thead>
              <tbody>{PRICING_KEYS.filter(k=>k.type==="package").map((pk,i)=>{const count=sortedPassengers.filter(p=>getPackageKey(p.services.hotel_type)===pk.key).length,price=pricing[pk.key]?.amount||0;return(<tr key={pk.key} style={{ background:i%2===0?"var(--bg-card)":"var(--bg-2)" }}><td style={tdStyle}>{pk.label}</td><td style={{ ...tdStyle, textAlign:"center", fontWeight:700 }}>{count}</td><td style={{ ...tdStyle, textAlign:"center" }}>{fmtAmt(price)}</td><td style={{ ...tdStyle, textAlign:"center", color:"var(--text)", fontWeight:700 }}>{fmtAmt(count*price)}</td></tr>);})}</tbody>
            </table>
          </div>
        )}
        {reportType==="addons"&&(
          <div style={{ background:"var(--bg-card)", borderRadius:12, overflow:"hidden", boxShadow:"var(--shadow-sm)" }}>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead><tr><th style={thStyle}>الإضافة / الخصم</th><th style={{ ...thStyle, textAlign:"center" }}>عدد الحجاج</th><th style={{ ...thStyle, textAlign:"center" }}>السعر الواحد</th><th style={{ ...thStyle, textAlign:"center" }}>الإجمالي</th></tr></thead>
              <tbody>{[{key:"addon_view",check:(p:Passenger)=>p.services.hotel_view==="مطلة"},{key:"addon_mina",check:(p:Passenger)=>p.services.camp_mina==="خاص"},{key:"addon_arafa",check:(p:Passenger)=>p.services.camp_arafa==="خاص"},{key:"addon_bus_vip",check:(p:Passenger)=>p.services.bus==="VIP"},{key:"addon_first_class",check:(p:Passenger)=>(p as any).flight_class==="درجة أولى"},{key:"discount_no_ticket",check:(p:Passenger)=>(p as any).flight_class==="بدون"}].map((a,i)=>{const count=sortedPassengers.filter(a.check).length,price=pricing[a.key]?.amount||0,isDis=a.key==="discount_no_ticket";return(<tr key={a.key} style={{ background:i%2===0?"var(--bg-card)":"var(--bg-2)" }}><td style={tdStyle}>{pricing[a.key]?.label||a.key}</td><td style={{ ...tdStyle, textAlign:"center", fontWeight:700 }}>{count}</td><td style={{ ...tdStyle, textAlign:"center" }}>{fmtAmt(price)}</td><td style={{ ...tdStyle, textAlign:"center", color:isDis?"var(--danger)":"var(--em8)", fontWeight:700 }}>{isDis?`(${fmtAmt(count*price)})`:fmtAmt(count*price)}</td></tr>);})}</tbody>
            </table>
          </div>
        )}
        {reportType==="cashflow"&&(
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {/* بطاقة الملخص */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
              {[
                { label:"إجمالي التحصيل", value:fmtAmt(cfTotal), color:"var(--success)" },
                { label:"عدد الدفعات",    value:cfPayments.length, color:"var(--text)" },
                { label:"عدد الأيام",     value:cfDates.length,    color:"var(--em8)" },
              ].map(c=>(
                <div key={c.label} style={{ background:"var(--bg-card)", borderRadius:10, padding:"12px 16px", textAlign:"center", boxShadow:"var(--shadow-sm)" }}>
                  <div style={{ fontSize:11, color:"var(--text-muted)", marginBottom:4 }}>{c.label}</div>
                  <div style={{ fontSize:18, fontWeight:700, color:c.color }}>{c.value}</div>
                  {c.label==="إجمالي التحصيل"&&<div style={{ fontSize:10, color:"var(--text-muted)" }}>ر.ق</div>}
                </div>
              ))}
            </div>
            {/* جدول يومي */}
            {cfDates.length===0?(
              <div style={{ textAlign:"center", padding:40, color:"var(--text-muted)", fontSize:13 }}>لا توجد دفعات في الفترة المحددة</div>
            ):(
              <div style={{ background:"var(--bg-card)", borderRadius:12, overflow:"hidden", boxShadow:"var(--shadow-sm)" }}>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle }}>التاريخ</th>
                      <th style={{ ...thStyle, textAlign:"center" }}>عدد الدفعات</th>
                      <th style={{ ...thStyle, textAlign:"center" }}>الإجمالي</th>
                      <th style={{ ...thStyle }}>طرق الدفع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cfDates.map((d,i)=>{
                      const row=cfByDate[d];
                      return(
                        <tr key={d} style={{ background:i%2===0?"var(--bg-card)":"var(--bg-2)" }}>
                          <td style={{ ...tdStyle, fontWeight:600 }}>{d}</td>
                          <td style={{ ...tdStyle, textAlign:"center", color:"var(--text-muted)" }}>{row.count}</td>
                          <td style={{ ...tdStyle, textAlign:"center", color:"var(--success)", fontWeight:700 }}>{fmtAmt(row.total)}</td>
                          <td style={{ ...tdStyle, fontSize:11, color:"var(--text-muted)" }}>
                            {Object.entries(row.methods).map(([m,v])=>(
                              <span key={m} style={{ marginLeft:8 }}>{m}: <b style={{ color:"var(--text)" }}>{fmtAmt(v)}</b></span>
                            ))}
                          </td>
                        </tr>
                      );
                    })}
                    <tr style={{ background:"var(--em8)", color:"#fff", fontWeight:700 }}>
                      <td style={{ padding:"10px 12px" }} colSpan={2}>الإجمالي</td>
                      <td style={{ padding:"10px 12px", textAlign:"center" }}>{fmtAmt(cfTotal)}</td>
                      <td style={{ padding:"10px 12px" }}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════
  // MAIN LIST VIEW
  // ══════════════════════════════════════════════
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      <AlertModal alert={alertState} onClose={()=>showAlert(null)} />
      <ConfirmModal state={confirmState} onConfirm={handleConfirmYes} onCancel={handleConfirmNo} />
      <ReceiptModal />
      <FinanceListView
        canManage={canManage}
        sortedPassengers={sortedPassengers}
        filteredPassengers={filteredPassengers}
        pricing={pricing}
        chargesByPassenger={chargesByPassenger}
        paymentsByPassenger={paymentsByPassenger}
        getPassengerGroup={getPassengerGroup}
        loading={loading}
        refreshing={refreshing}
        lastUpdated={lastUpdated}
        searchTerm={searchTerm}
        filterStatus={filterStatus}
        filterPackage={filterPackage}
        onSearchTermChange={setSearchTerm}
        onFilterStatusChange={setFilterStatus}
        onFilterPackageChange={setFilterPackage}
        onClearFilters={()=>{setSearchTerm("");setFilterStatus("all");setFilterPackage("all");}}
        onRefresh={()=>loadFinanceData(true)}
        onOpenReports={()=>setSubView("reports")}
        onOpenSettings={()=>setSubView("settings")}
        onSelectPassenger={p=>{setSelectedP(p);setSubView("detail");}}
        onSelectGroup={g=>{setSelectedGroup(g);setSubView("group");}}
        thStyle={thStyle}
        tdStyle={tdStyle}
      />
    </div>
  );
}
