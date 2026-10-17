import { useState, useEffect, useMemo, useCallback } from "react";
import { isHajj, orderHajjThenAdmins } from "../utils/passenger";
import type { Dispatch, SetStateAction } from "react";
import { supabase } from "../supabase";
import type { Passenger, Flight } from "../types";
import { Modal } from "./Modal";
import { AlertModal, useAlert, ConfirmModal, useConfirm } from "./AlertModal";
import { StatsRow, type StatCardData } from "./StatCard";
import { useReportBranding } from "../company/CompanyContext";
import { inp, btnP, btnS, printInPage } from "../utils";
import { flightPassengers, flightReportDocument, flightsReportDocument,
         initialPrintOptions, chromeFromOptions } from "../print";
import { PrintOptionsMenu } from "./PrintOptionsMenu";
import { useSeasonWrite } from "../season/useSeasonWrite";
import { useSeason } from "../season/useSeason";
import {
  AllocationDialog, AllocationSearch, AllocationStates, AssignedRow, CapacityBar,
  DialogAction, PassengerPicker, RosterHeader, type PickerItem,
} from "./allocation/AllocationUI";
import { allocWriteError, matchesPassenger, useAllocationWrites } from "./allocation/useAllocation";
import { AirlineMark, RoutePlane, ROUTE_CSS } from "./flights/flightVisuals";
import { AIRLINE_OPTIONS, AIRLINE_OTHER, airlineOption } from "./flights/flightAirlines";
import { deleteContainer, deleteFeedback, updateContainer, updateFeedback, useInFlight, type Feedback } from "./allocation/containerWrites";

/* الاتجاه والعمود — رحلة الذهاب تسكن `flight_id`، والإياب
   `return_flight_id`. والقاعدة تحرس المطابقة الآن فلا تبقى اتفاقاً
   في هذا السطر وحده. */
type FlightLeg = "flight_id" | "return_flight_id";
const legOf = (type?: string): FlightLeg => type === "إياب" ? "return_flight_id" : "flight_id";
const oppositeType = (type: string) => type === "إياب" ? "ذهاب" : "إياب";

// ===== استخراج كود المطار والمدينة من النص =====
const extractIATA = (airport: string) => {
  const m = airport.match(/\b([A-Z]{3})\b/);
  return m ? m[1] : airport.slice(0, 3).toUpperCase();
};
const extractCity = (airport: string) => airport.replace(/\b[A-Z]{3}\b/, "").trim() || airport;

const PlaneIcon = ({ size = 16, flip = false, animation }: { size?: number; flip?: boolean; animation?: string }) => (
  <span style={{ fontSize: size, lineHeight: 1, display: "block", transform: flip ? "scaleX(-1)" : undefined, animation }}>✈</span>
);

/* السعة عددٌ صحيحٌ موجبٌ بالأرقام وحدها — لا «12.5» ولا «1e2» ولا سالب.
   كان `parseInt` يقبل «12.5» فيحفظ 12، و«1e2» فيحفظ 1. */
const parseCapacity = (raw: string): number | null => {
  const t = raw.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
};

/* البحث في الصفحة عن مسافر: اسمه العربيّ (كما في المنتقي) أو الإنجليزيّ
   أو رقم جوازه — والمنتقي نفسه لا يتغيّر */
const matchesFlightSearch = (p: Passenger, q: string) => {
  const t = q.trim();
  if (!t) return true;
  if (matchesPassenger(p, t)) return true;
  const low = t.toLowerCase();
  return (p.name_en || "").toLowerCase().includes(low) || (p.passport || "").toLowerCase().includes(low);
};

const paxLabel = (n: number) => n === 1 ? "مسافر واحد" : n === 2 ? "مسافران" : n <= 10 ? `${n} مسافرين` : `${n} مسافراً`;
const seatsLabel = (n: number) => n === 1 ? "مقعد واحد متبقٍ" : n === 2 ? "مقعدان متبقيان" : n <= 10 ? `${n} مقاعد متبقية` : `${n} مقعداً متبقياً`;

/* الدرجة المدفوعة — مصدرها `services.flight` وحده. والدرجة المحجوزة
   (`flight_class`) تتبعها ولا تخالفها، والقاعدة تحرس المطابقة. */
const paidClass = (p: Passenger) => p.services?.flight === "درجة أولى" ? "درجة أولى" : "عادي";

/* «بدون طيران» استبعادٌ تجاريّ صلب لا تعارضٌ طريّ: قيمة التذكرة
   تُخصم ممّا على الحاجّ، وهو خارج كشف الحجز — فلا تُبنى له تذكرة
   بحال. لا تأكيدَ يتجاوزه ولا «وزّع على أي حال». */
const optedOut = (p: Passenger) => isHajj(p) && p.services?.flight === "بدون";

/* من يجوز حجز تذكرة له أصلاً: الحاجّ ما لم يعتذر، والإداري إن طلبت
   له الحملة تذكرة. */
const ticketEligible = (p: Passenger) => isHajj(p) ? !optedOut(p) : !!p.wants_flight;

// ===== ملخص صفحة الطيران =====
function FlightsStats({ flights, passengers }: { flights: Flight[]; passengers: Passenger[] }) {
  const s = useMemo(() => {
    const hajj = passengers.filter(p => isHajj(p));
    const total = hajj.length;
    const optOut = hajj.filter(p => p.services?.flight === "بدون").length;
    const needs = total - optOut;
    /* المكتمل ساقان لا ساق: من حُجزت له رحلة الذهاب بلا عودة نصفُ
       محجوزٍ لا مكتمل. */
    const bothLegs = hajj.filter(p => p.services?.flight !== "بدون" && p.flight_id != null && p.return_flight_id != null).length;
    const firstClass = hajj.filter(p => p.services?.flight === "درجة أولى").length;
    return { total, optOut, needs, bothLegs, firstClass };
  }, [passengers]);

  /* المقاعد المخصَّصة للحملة — والرحلة بلا عدد محدَّد لا تُحتسب، وإلا
     صار «٤٠ مقعداً متاحاً» كذباً. */
  const withCap = flights.filter(f => f.capacity != null);
  const seats = withCap.reduce((n, f) => n + (f.capacity || 0), 0);
  const taken = withCap.reduce((n, f) =>
    n + passengers.filter(p => p[legOf(f.type)] === f.id).length, 0);

  const pct = s.needs ? Math.round(s.bothLegs / s.needs * 100) : 0;
  const cards: StatCardData[] = [
    { label: "إجمالي الحجاج", num: s.total, sub: "الموسم الحالي", tone: "brand" },
    { label: "درجة أولى", num: s.firstClass, sub: `${s.total ? Math.round(s.firstClass / s.total * 100) : 0}٪ من الإجمالي`, tone: "warning" },
    { label: "بدون تذكرة", num: s.optOut, sub: "حسب طلب الحاج", tone: s.optOut > 0 ? "female" : "muted" },
    { label: "مقاعد الحملة المتاحة", num: Math.max(0, seats - taken), sub: withCap.length === flights.length ? `من ${seats} مقعد` : `${flights.length - withCap.length} رحلة بلا عدد محدَّد`, tone: "info" },
    { label: "الذهاب والعودة", num: `${pct}٪`, sub: `${s.bothLegs} من ${s.needs} حاج`, tone: pct === 100 ? "success" : "brand", featured: true },
  ];
  return <StatsRow cards={cards} />;
}

// ═══════════════════════════════════════════════════════════════
// صفحة الطيران
// ═══════════════════════════════════════════════════════════════
function FlightsPage({ passengers, setPassengers }: { passengers: Passenger[]; setPassengers: Dispatch<SetStateAction<Passenger[]>> }) {
  const branding = useReportBranding();
  const { alert: alertState, showAlert } = useAlert();
  const { confirmState, confirmAction, handleConfirm, handleCancel } = useConfirm();
  const { assertWritable, readOnly } = useSeasonWrite(showAlert);
  const { viewedSeason } = useSeason();

  /* التعطيل البصري لمداخل الكتابة — طبقة تجربة لا حماية. */
  const roOff = readOnly ? { opacity: 0.4, pointerEvents: "none" as const } : null;
  const [flights, setFlights] = useState<Flight[]>([]);
  const [flightsLoading, setFlightsLoading] = useState(true);
  const [flightsError, setFlightsError] = useState(false);
  const [editFlightModal, setEditFlightModal] = useState<Flight | null>(null);
  const [editForm, setEditForm] = useState({ name: "", type: "ذهاب" as "ذهاب" | "إياب", airline: "", date: "", time: "", arrival_time: "", arrival_date: "", from_airport: "", to_airport: "", capacity: "" });
  const [activeTab, setActiveTab] = useState<"ذهاب" | "إياب" | "الكل">("ذهاب");
  /* البحث عن مسافر في الصفحة: يشمل الذهاب والإياب معاً أيّاً كان التبويب،
     وتفريغُه يعيد التبويب كما كان */
  const [flightSearch, setFlightSearch] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", type: "ذهاب" as "ذهاب" | "إياب", airline: "", date: "", time: "", arrival_time: "", arrival_date: "", from_airport: "", to_airport: "", capacity: "" });
  const [formError, setFormError] = useState("");

  const [openFlightId, setOpenFlightId] = useState<number | null>(null);
  const [pSearch, setPSearch] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [editingCap, setEditingCap] = useState(false);
  const [capDraft, setCapDraft] = useState("");
  /* «إضافة من رحلة مرتبطة» — مراجعةٌ قبل الكتابة لا إسنادٌ تلقائيّ */
  const [linkSourceId, setLinkSourceId] = useState<number | null>(null);
  const [showLink, setShowLink] = useState(false);

  const openFlight = flights.find(f => f.id === openFlightId) || null;

  useEffect(() => {
    /* م٧ — الرحلات مملوكة للموسم: الصفحة تعرض رحلات الموسم المعروض
       وحده، ويُعاد الجلب عند تبديله. */
    const load = async () => {
      setFlightsLoading(true);
      const { data, error } = await supabase.from("flights").select("*").eq("season_id", viewedSeason.id).order("date").order("time").order("id");
      if (error || !data) { console.error("تعذر تحميل الرحلات", error); setFlightsError(true); }
      else { setFlights(data as Flight[]); setFlightsError(false); }
      setFlightsLoading(false);
    };
    load();
  }, [viewedSeason.id]);

  /* الترتيب المعتمَد للكشوف: الحجّاج بترتيبهم اليدويّ
     (`passengers.sort_order`) ثم الإداريون بترتيبهم. مصدرٌ واحد
     يستعمله العرض والطباعة — لا ترتيبَ ثانٍ للطيران. */
  /* قائمةُ الرحلة من الكشف المشترك — `orderHajjThenAdmins` كما أُقرّ
     في #114، والمصدرُ نفسه الذي تطبع منه صفحةُ التقارير. */
  const onFlight = (f: Flight) => flightPassengers(f, passengers);
  const occOf = (f: Flight) => passengers.filter(p => p[legOf(f.type)] === f.id).length;
  const remainingOf = (f: Flight) => f.capacity == null ? null : Math.max(0, f.capacity - occOf(f));

  const closeDialog = useCallback(() => { setOpenFlightId(null); setPSearch(""); setPicked(new Set()); setEditingCap(false); setShowLink(false); setLinkSourceId(null); }, []);
  const openFlightDialog = (id: number) => { setOpenFlightId(id); setPSearch(""); setPicked(new Set()); setEditingCap(false); };

  // ══════════════════════════════════════════════════════════
  // قواعد الطيران — هنا، ظاهرةً
  // ══════════════════════════════════════════════════════════

  /* حدٌّ صلب: المقاعد المخصَّصة للحملة. القاعدة ترفضه أيضاً، وهذا
     يشرح قبل أن تُرسَل كتابةٌ محكومٌ عليها. */
  const seatBlock = (f: Flight, wanted: number): string | null => {
    if (f.capacity == null) return `الرحلة «${f.name}» بلا مقاعد محدَّدة للحملة — حدّد عددها قبل الإسناد.`;
    const left = remainingOf(f) ?? 0;
    if (left <= 0) return `الرحلة «${f.name}» مكتملة (${occOf(f)}/${f.capacity} من مقاعد الحملة) — لا تتّسع لمسافرٍ آخر.`;
    if (wanted > left) return `الرحلة «${f.name}» فيها ${seatsLabel(left)} فقط، وقد حدّدت ${paxLabel(wanted)}. قلّل التحديد أو وزّع على رحلةٍ أخرى.`;
    return null;
  };

  /* استبعاد «بدون» — صلبٌ كذلك، ولا تأكيد يتجاوزه */
  const optOutBlock = (chosen: Passenger[]): string | null => {
    const bad = chosen.filter(p => optedOut(p));
    if (!bad.length) return null;
    const names = bad.slice(0, 3).map(p => p.short_ar || p.name_ar).join(" · ");
    return `${names}${bad.length > 3 ? ` و${bad.length - 3} غيرهم` : ""} طلبوا «بدون طيران» — لا تُحجَز لهم تذاكر ولا يُسنَدون إلى رحلة.`;
  };

  /* تفريق الأسرة — تحذيرٌ وتأكيد لا منع. والقرابة من `family_id`
     وحده، ولا تُختَرع صلاتٌ (زوج/ابن) لا يحفظها النظام. */
  const familySplit = (f: Flight, chosen: Passenger[]): string | null => {
    const leg = legOf(f.type);
    const sameDir = flights.filter(x => x.type === f.type && x.id !== f.id).map(x => x.id);
    const hits: string[] = [];
    for (const fam of new Set(chosen.map(p => p.family_id).filter(Boolean))) {
      const elsewhere = passengers.filter(p => p.family_id === fam && sameDir.includes(p[leg] as number));
      if (elsewhere.length) {
        const other = flights.find(x => x.id === elsewhere[0][leg]);
        hits.push(`${elsewhere.length === 1 ? "فردٌ" : `${elsewhere.length} أفراد`} من أسرةٍ واحدة على رحلة «${other?.name ?? "أخرى"}»`);
      }
    }
    return hits.length ? hits.slice(0, 3).join(" · ") : null;
  };

  const confirmFamily = async (f: Flight, chosen: Passenger[]): Promise<boolean> => {
    const split = familySplit(f, chosen);
    if (!split) return true;
    return confirmAction(
      `${split}.\n\nإضافتهم إلى «${f.name}» تفرّق الأسرة على رحلتَي ${f.type} مختلفتين. هل تريد المتابعة؟`,
      { title: "تفريق أسرة على رحلتين", confirmLabel: "متابعة", cancelLabel: "إلغاء" },
    );
  };

  const writesGo = useAllocationWrites({ column: "flight_id", orderColumn: "sort_order", setPassengers, readOnly, showAlert, onBlocked: () => assertWritable() });
  const writesRet = useAllocationWrites({ column: "return_flight_id", orderColumn: "sort_order", setPassengers, readOnly, showAlert, onBlocked: () => assertWritable() });
  const writesFor = (f: Flight) => legOf(f.type) === "return_flight_id" ? writesRet : writesGo;

  // ══════════════════════════════════════════════════════════
  // مسارات الكتابة — كلّها تمرّ بالحدود الصلبة ثم تحذير الأسرة
  // ══════════════════════════════════════════════════════════
  /* الحدود الصلبة ثم تحذير الأسرة — قبل أي كتابة */
  const precheck = async (f: Flight, chosen: Passenger[]): Promise<boolean> => {
    const opt = optOutBlock(chosen);
    if (opt) { showAlert("warning", opt); return false; }
    const blocked = seatBlock(f, chosen.length);
    if (blocked) { showAlert("warning", blocked); return false; }
    return confirmFamily(f, chosen);
  };

  /* الدرجة المحجوزة تتبع المدفوعة — والقاعدة ترفض غير ذلك */
  const markClass = (ids: Set<number>) =>
    setPassengers(prev => prev.map(x => ids.has(x.id) ? { ...x, flight_class: paidClass(x) } : x));

  /* الإضافة لمن لا رحلة له في هذا الاتجاه وحده، شرطاً في الطلب نفسه: من
     حُجز على رحلةٍ أخرى من مكانٍ آخر في الأثناء لا يُنقل صامتاً */
  const assignMany = async (f: Flight, chosen: Passenger[]) => {
    if (!chosen.length) return 0;
    if (!await precheck(f, chosen)) return 0;
    const done = await writesFor(f).assignMany(chosen.map(p => p.id), f.id, "تعذر إضافة بعض المسافرين إلى الرحلة", null);
    if (done) markClass(new Set(chosen.slice(0, done).map(p => p.id)));
    return done;
  };

  const addOne = async (f: Flight, pId: number) => {
    const p = passengers.find(x => x.id === pId);
    if (!p || !await precheck(f, [p])) return;
    const r = await writesFor(f).move(p.id, null, f.id, "تعذر إضافة المسافر إلى الرحلة");
    if (r === "ok") markClass(new Set([p.id]));
    else if (r === "stale") showAlert("warning", `«${p.short_ar || p.name_ar}» حُجز على رحلة ${f.type} أخرى من مكانٍ آخر — لم يُضَف، وحُدِّثت البيانات.`);
  };

  const addPicked = async (f: Flight) => {
    /* من حُجز في الأثناء (إضافةٌ فرديّة أو تحديثٌ لحظيّ) يبقى في التحديد وقد
       خرج من القائمة — لا يُرسَل، وإلا ردّه الشرط فأوقف إضافة الباقين */
    const leg = legOf(f.type);
    const chosen = passengers.filter(p => picked.has(p.id) && p[leg] == null);
    const done = await assignMany(f, chosen);
    if (done === chosen.length) setPicked(new Set());
    else setPicked(new Set(chosen.slice(done).map(p => p.id)));
  };

  const moveP = async (from: Flight, p: Passenger, toId: string) => {
    if (!toId) return;
    const target = flights.find(f => f.id === parseInt(toId, 10));
    if (!target || target.type !== from.type) return;
    const opt = optOutBlock([p]);
    if (opt) { showAlert("warning", opt); return; }
    const blocked = seatBlock(target, 1);
    if (blocked) { showAlert("warning", blocked); return; }
    if (!await confirmFamily(target, [p])) return;
    /* نقلٌ مشروطٌ بالرحلة المعروضة — لا كتابةَ فوق نقلٍ أجراه غيرُك في الأثناء */
    const r = await writesFor(target).move(p.id, from.id, target.id, "تعذر نقل المسافر إلى الرحلة الأخرى");
    if (r === "stale") staleOn(p, "لم يُنقل");
  };

  const staleOn = (p: Passenger, what: string) => showAlert("warning",
    `«${p.short_ar || p.name_ar}» لم يعد على الرحلة المعروضة — غيّر حجزَه غيرُك في الأثناء. ${what}، وحُدِّثت البيانات.`);

  /* الإخراج مشروطٌ بالرحلة المعروضة كذلك — لا يُلغى حجزٌ على رحلةٍ نُقل إليها في الأثناء */
  const removeP = async (f: Flight, p: Passenger) => {
    const r = await writesFor(f).unassign(p.id, f.id, "تعذر إزالة المسافر من الرحلة");
    if (r === "stale") staleOn(p, "لم يُزَل");
  };

  // ══════════════════════════════════════════════════════════
  // «إضافة من رحلة مرتبطة» — مساعدةٌ تشغيليّة حتميّة لا اقتراحات
  // ══════════════════════════════════════════════════════════
  // الموظّف يفتح رحلة عودة، يختار رحلة ذهابٍ مصدراً، فيُجمَع مسافروها
  // وتُقيَّم أهليّتهم، ويُعرَض ملخّصٌ **قبل أي كتابة**. ثم يؤكّد.
  // ولا إسنادَ باختيار المصدر وحده، ولا أخذَ أوّل N صامتاً إن ضاقت
  // المقاعد — يُطلب قرار الموظّف.
  const linkPlan = (dest: Flight, src: Flight) => {
    const srcLeg = legOf(src.type);
    const destLeg = legOf(dest.type);
    const sameDirOthers = flights.filter(x => x.type === dest.type && x.id !== dest.id).map(x => x.id);
    const source = orderHajjThenAdmins(passengers.filter(p => p[srcLeg] === src.id));

    const already = source.filter(p => p[destLeg] === dest.id);
    const onOther = source.filter(p => sameDirOthers.includes(p[destLeg] as number));
    const optOut = source.filter(p => optedOut(p));
    const notEligible = source.filter(p => !ticketEligible(p) && !optedOut(p));
    const eligible = source.filter(p =>
      ticketEligible(p) && p[destLeg] == null);

    return { source, already, onOther, optOut, notEligible, eligible, left: remainingOf(dest) };
  };

  const runLink = async (dest: Flight, src: Flight) => {
    const plan = linkPlan(dest, src);
    if (plan.left == null) { showAlert("warning", `الرحلة «${dest.name}» بلا مقاعد محدَّدة للحملة — حدّد عددها قبل الإسناد.`); return; }
    if (!plan.eligible.length) { showAlert("warning", `لا مسافر مؤهّلاً للإضافة من «${src.name}» إلى «${dest.name}».`); return; }
    /* لا قصٌّ صامت: إن زاد المؤهَّلون على المقاعد، يُردّ القرار */
    if (plan.eligible.length > plan.left) {
      showAlert("warning", `المؤهَّلون ${plan.eligible.length} والمقاعد المتبقية ${plan.left} — لا يُقتطع الفارق تلقائياً. ارفع مقاعد «${dest.name}» أو وزّع بعضهم على رحلةٍ أخرى ثم أعِد المحاولة.`);
      return;
    }
    const lines = [
      `سيتم إضافة: ${plan.eligible.length}`,
      plan.already.length ? `موجودون على هذه الرحلة بالفعل: ${plan.already.length}` : null,
      plan.onOther.length ? `موجودون على رحلة ${dest.type} أخرى — لا يُنقلون تلقائياً: ${plan.onOther.length}` : null,
      plan.optOut.length ? `بدون طيران (مستبعدون): ${plan.optOut.length}` : null,
      plan.notEligible.length ? `غير مؤهّلين: ${plan.notEligible.length}` : null,
      `المقاعد المتبقية: ${plan.left}`,
    ].filter(Boolean).join("\n");

    const ok = await confirmAction(`من «${src.name}» إلى «${dest.name}»:\n\n${lines}`, {
      title: "مراجعة قبل الإضافة", confirmLabel: `أضِف ${plan.eligible.length}`, cancelLabel: "إلغاء",
    });
    if (!ok) return;
    setShowLink(false); setLinkSourceId(null);
    await assignMany(dest, plan.eligible);
  };

  // ══════════════════════════════════════════════════════════
  // الرحلة — إنشاء وتعديل وحذف
  // ══════════════════════════════════════════════════════════
  const identityClash = (f: { name: string; type: string; date: string; time: string }, ignoreId?: number) =>
    flights.some(x => x.id !== ignoreId && x.type === f.type
      && x.name.trim() === f.name.trim() && (x.date || "").trim() === f.date.trim() && (x.time || "").trim() === f.time.trim());

  /* طلبٌ جارٍ واحدٌ لكلّ عمليّة — النقرة المكرّرة لا تُرسَل */
  const inFlight = useInFlight();

  /* ما لم يقع كما أُريد: تُعرض الحقيقة وتُحدَّث الحالة منها */
  const applyFeedback = (f: Flight, fb: Feedback) => {
    if (fb.apply?.kind === "remove") {
      setFlights(prev => prev.filter(x => x.id !== f.id));
      if (openFlightId === f.id) closeDialog();
      setEditFlightModal(null);
    } else if (fb.apply?.kind === "merge") {
      const row = fb.apply.row as Partial<Flight>;
      setFlights(prev => prev.map(x => x.id === f.id ? { ...x, ...row } : x));
      setEditFlightModal(null); setEditingCap(false);
    }
    showAlert(fb.type, fb.message);
  };
  const flightLabel = (f: Flight) => `الرحلة «${f.name}»`;

  const addFlight = () => inFlight("add", async () => {
    if (!assertWritable()) return;
    const f = { ...addForm, name: addForm.name.trim(), airline: addForm.airline.trim(), from_airport: addForm.from_airport.trim(), to_airport: addForm.to_airport.trim() };
    const cap = parseCapacity(addForm.capacity);
    if (!f.name) { setFormError("يرجى إدخال رقم الرحلة أو اسمها"); return; }
    if (!f.date || !f.time) { setFormError("التاريخ ووقت المغادرة مطلوبان — وهما جزءٌ من هويّة الرحلة"); return; }
    if (identityClash(f)) { setFormError(`رحلة ${f.type} بالرقم «${f.name}» في ${f.date} الساعة ${f.time} موجودة بالفعل`); return; }
    if (cap === null) { setFormError("عدد المقاعد المخصَّصة للحملة مطلوب، ويجب أن يكون عدداً صحيحاً أكبر من صفر"); return; }
    setFormError("");
    const { data, error } = await supabase.from("flights").insert([{
      name: f.name, type: f.type, airline: f.airline, date: f.date, time: f.time,
      arrival_date: f.arrival_date, arrival_time: f.arrival_time,
      from_airport: f.from_airport, to_airport: f.to_airport, capacity: cap,
    }]).select();
    if (error) { console.error("فشل إضافة الرحلة", error); showAlert("error", allocWriteError("فشل إضافة الرحلة، يرجى المحاولة مرة أخرى", error.message)); return; }
    if (data?.[0]) {
      setFlights(prev => [...prev, data[0] as Flight]);
      setAddForm({ name: "", type: "ذهاب", airline: "", date: "", time: "", arrival_time: "", arrival_date: "", from_airport: "", to_airport: "", capacity: "" });
      setShowAdd(false);
    }
  });

  const openEditFlight = (f: Flight) => {
    setEditFlightModal(f);
    setEditForm({ name: f.name, type: f.type, airline: f.airline || "", date: f.date || "", time: f.time || "", arrival_time: f.arrival_time || "", arrival_date: f.arrival_date || "", from_airport: f.from_airport || "", to_airport: f.to_airport || "", capacity: f.capacity != null ? String(f.capacity) : "" });
  };

  const saveEditFlight = () => inFlight("edit", async () => {
    if (!editFlightModal || !assertWritable()) return;
    const occ = occOf(editFlightModal);
    /* الفارغ مقبولٌ لرحلةٍ لم تُحدَّد مقاعدها أصلاً (لا تغيير)، ولا يمحو
       عدداً قائماً */
    const capRaw = editForm.capacity.trim();
    const cap = capRaw === "" && editFlightModal.capacity == null ? null : parseCapacity(capRaw);
    if (cap === null && !(capRaw === "" && editFlightModal.capacity == null)) { showAlert("warning", "عدد المقاعد يجب أن يكون عدداً صحيحاً أكبر من صفر"); return; }
    if (cap !== null && cap < occ) { showAlert("warning", `الرحلة «${editFlightModal.name}» تضمّ ${paxLabel(occ)}، فلا تُخفَّض مقاعد الحملة إلى ${cap}. أخرِج المسافرين أولاً.`); return; }
    if (occ > 0 && editForm.type !== editFlightModal.type) { showAlert("warning", `الرحلة «${editFlightModal.name}» تضمّ ${paxLabel(occ)} — لا يُقلب اتجاهها. أخرِجهم أولاً.`); return; }
    if (!editForm.name.trim() || !editForm.date.trim() || !editForm.time.trim()) { showAlert("warning", "الرقم والتاريخ ووقت المغادرة مطلوبة"); return; }
    if (identityClash({ name: editForm.name, type: editForm.type, date: editForm.date, time: editForm.time }, editFlightModal.id)) {
      showAlert("warning", "رحلة بهذه الهويّة (الاتجاه والرقم والتاريخ والوقت) موجودة بالفعل"); return;
    }
    const orig = editFlightModal;
    const upd = {
      name: editForm.name.trim(), type: editForm.type, airline: editForm.airline.trim(),
      date: editForm.date, time: editForm.time, arrival_time: editForm.arrival_time, arrival_date: editForm.arrival_date,
      from_airport: editForm.from_airport.trim(), to_airport: editForm.to_airport.trim(), capacity: cap,
    };
    /* لا يُكتب إلا ما غيّره الموظّف، وكلُّ حقلٍ منه مشروطٌ بقيمته حين فُتح
       النموذج: فلا تمحو نسخةٌ قديمة ما غيّره غيرُه في حقلٍ آخر، ولا يُكتب
       فوق حقلٍ غيّره غيرُه هو نفسه */
    const before = orig as unknown as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    const expect: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(upd)) {
      const was = before[k] ?? null;
      if (v === (was ?? (k === "capacity" ? null : ""))) continue;
      patch[k] = v; expect[k] = was;
    }
    if (!Object.keys(patch).length) { setEditFlightModal(null); return; }
    const r = await updateContainer("flights", orig.id, patch, expect);
    if (r.kind !== "ok") { console.error("تعذر حفظ تعديلات الرحلة", r); applyFeedback(orig, updateFeedback(r, flightLabel(orig), "تعذر حفظ تعديلات الرحلة", allocWriteError, true)); return; }
    setFlights(prev => prev.map(f => f.id === orig.id ? { ...f, ...patch } as Flight : f));
    setEditFlightModal(null);
  });

  const saveCapacity = (f: Flight) => inFlight(`capacity:${f.id}`, async () => {
    if (!assertWritable()) return;
    const cap = parseCapacity(capDraft);
    const occ = occOf(f);
    if (cap === null) { showAlert("warning", "عدد المقاعد يجب أن يكون عدداً صحيحاً أكبر من صفر"); return; }
    if (cap < occ) { showAlert("warning", `الرحلة «${f.name}» تضمّ ${paxLabel(occ)}، فلا تُخفَّض مقاعد الحملة إلى ${cap}. أخرِج المسافرين أولاً.`); return; }
    /* مشروطةٌ بالمقاعد التي رآها الموظّف — لا يُكتب فوق عددٍ غيّره غيرُه */
    const r = await updateContainer("flights", f.id, { capacity: cap }, { capacity: f.capacity ?? null });
    if (r.kind !== "ok") { console.error("تعذر تعديل مقاعد الرحلة", r); applyFeedback(f, updateFeedback(r, flightLabel(f), "تعذر تعديل مقاعد الرحلة", allocWriteError, true)); return; }
    setFlights(prev => prev.map(x => x.id === f.id ? { ...x, capacity: cap } : x));
    setEditingCap(false);
  });

  const deleteFlight = (f: Flight) => inFlight(`delete:${f.id}`, async () => {
    if (!assertWritable()) return;
    /* القاعدة ترفضه بالمفتاح الأجنبي كذلك — وهذا يشرح قبل المحاولة.
       والعدّ على الساقين معاً لا على ساقٍ واحدة كما كان. */
    const occ = passengers.filter(p => p.flight_id === f.id || p.return_flight_id === f.id).length;
    if (occ > 0) { showAlert("warning", `الرحلة «${f.name}» تضمّ ${paxLabel(occ)} — أخرِجهم قبل حذفها.`); return; }
    /* لا تُزال من الشاشة إلا إن حُذفت فعلاً أو تبيّن أنها لم تعد موجودة */
    const r = await deleteContainer("flights", f.id);
    if (r.kind !== "ok") { console.error("تعذر حذف الرحلة", r); applyFeedback(f, deleteFeedback(r, flightLabel(f), "تعذر حذف الرحلة", allocWriteError, true)); return; }
    setFlights(prev => prev.filter(x => x.id !== f.id));
    if (openFlightId === f.id) closeDialog();
  });

  // ══════════════════════════════════════════════════════════
  // الطباعة — بلا تغيير في المحتوى، والترتيب هو ترتيب الكشوف
  // ══════════════════════════════════════════════════════════
  /* المستندُ كلُّه من المصدر المشترك — هيئةً كما بياناتٍ، فلا تنفرد
     صفحةٌ بعارضٍ دون أخرى. وهذه الهيئةُ هي المرجع ولم تتغيّر. */
  /* الجامعُ يستعيد ترويستَه؛ والهيئةُ الداخليّة وترتيبُها كما أُقرّت */
  const [printOpts, setPrintOpts] = useState(() => initialPrintOptions("flights"));
  const flightChrome = () => chromeFromOptions("flights", printOpts, { season: viewedSeason });
  const printFlight = (f: Flight) => printInPage(flightReportDocument(f, passengers, branding, flightChrome()));
  const printAll = () => printInPage(flightsReportDocument(flights, passengers, branding, flightChrome()));

  // ══════════════════════════════════════════════════════════
  const dirBadge = (type: string, light?: boolean) => (
    <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 9px", borderRadius: 99, flexShrink: 0, whiteSpace: "nowrap",
      background: light ? "color-mix(in srgb, var(--text-inverse) 22%, transparent)" : "color-mix(in srgb, var(--primary) 12%, transparent)",
      color: light ? "var(--text-inverse)" : "var(--primary)" }}>{type}</span>
  );

  const capNote = (f: Flight) => {
    if (f.capacity == null) return "المقاعد غير محدَّدة";
    const left = f.capacity - occOf(f);
    return left > 0 ? seatsLabel(left) : left === 0 ? "مكتملة" : `تجاوز المقاعد بـ ${-left}`;
  };

  const goFlights = flights.filter(f => f.type === "ذهاب");
  const retFlights = flights.filter(f => f.type === "إياب");
  const searching = flightSearch.trim() !== "";
  /* في البحث: كلُّ رحلةٍ — ذهاباً وإياباً — فيها مسافرٌ يطابق */
  const visibleFlights = searching
    ? flights.filter(f => onFlight(f).some(p => matchesFlightSearch(p, flightSearch)))
    : activeTab === "ذهاب" ? goFlights : activeTab === "إياب" ? retFlights : flights;

  // ===== بطاقة الصعود =====
  const renderBoardingPass = (flight: Flight) => {
    const fp = onFlight(flight);
    const fromIATA = extractIATA(flight.from_airport || "");
    const toIATA = extractIATA(flight.to_airport || "");
    const firstClassCount = fp.filter(p => paidClass(p) === "درجة أولى").length;
    const noCap = flight.capacity == null;

    let dateDisplay = flight.date || "";
    if (flight.date) {
      try {
        const d = new Date(flight.date);
        const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
        dateDisplay = `${String(d.getDate()).padStart(2,"0")} ${months[d.getMonth()]} ${d.getFullYear()}`;
      } catch { /* keep raw */ }
    }

    const isTomorrow = (() => {
      if (!flight.date) return false;
      const t = new Date(); t.setDate(t.getDate() + 1);
      const fd = new Date(flight.date);
      return fd.getFullYear() === t.getFullYear() && fd.getMonth() === t.getMonth() && fd.getDate() === t.getDate();
    })();

    return (
      <div key={flight.id} style={{ marginBottom: 12 }}>
        {/* البطاقة تُفتح بالنقر وبلوحة المفاتيح (Enter/مسافة) — ولا تُفتح حين
            يُضغط زرٌّ داخلها (تعديل · طباعة · حذف) */}
        <div className="fl-card" role="button" tabIndex={0}
          aria-label={`رحلة ${flight.name} — ${flight.type} — ${fp.length} من ${flight.capacity ?? "—"} مقعداً`}
          onClick={() => openFlightDialog(flight.id)}
          onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openFlightDialog(flight.id); } }}
          style={{ background: "var(--paper)", border: "1.5px solid var(--line)", borderRadius: 18, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,.06)", transition: "all .2s", cursor: "pointer" }}
          onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 6px 20px color-mix(in srgb, var(--primary) 16%, transparent)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,.06)"; e.currentTarget.style.transform = "none"; }}>

          {/* ══ هوية السفر — الخطّ والرقم والمسار والتوقيت ══ */}
          <div className="fl-pass" style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ width: 68, height: 68, borderRadius: 14, background: "var(--paper)", border: "2.5px solid var(--accent)", boxShadow: "0 2px 12px color-mix(in srgb, var(--accent) 25%, transparent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden", padding: 5, color: "var(--accent)" }}>
                <AirlineMark airline={flight.airline} size={26} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: "var(--ink)" }}>{flight.airline || "شركة الطيران"}</div>
                <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "var(--muted)", marginTop: 2 }} dir="ltr">{flight.name}</div>
              </div>
              <div style={{ marginInlineStart: "auto", display: "flex", gap: 5, alignItems: "center", flexShrink: 0 }}>
                {dirBadge(flight.type)}
                {isTomorrow && <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 8px", borderRadius: 99, background: "color-mix(in srgb, var(--primary) 10%, transparent)", color: "var(--primary)", border: "1px solid color-mix(in srgb, var(--primary) 22%, transparent)" }}>غداً</span>}
              </div>
            </div>

            {/* المسار — المغادرة يميناً والوصول يساراً، صريحاً لا تبعاً لاتّجاه
                الصفحة: كان الوصول أوّلَ العناصر فيظهر يميناً في الصفحة العربيّة،
                خلافَ ما يقوله التعليق. والطائرة تتقدّم من المغادرة إلى الوصول. */}
            <div dir="rtl" style={{ display: "flex", alignItems: "center" }}>
              <div data-route-dep style={{ flexShrink: 0, textAlign: "center", minWidth: 58 }}>
                <div style={{ fontFamily: "monospace", fontSize: 28, fontWeight: 900, color: "var(--primary)", lineHeight: 1 }}>{fromIATA || "—"}</div>
                <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>{extractCity(flight.from_airport || "")}</div>
                {flight.time && <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 900, color: "var(--primary)", marginTop: 4 }}>{flight.time}</div>}
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "0 8px" }}>
                <RoutePlane urgent={isTomorrow} />
                {dateDisplay && <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 5, whiteSpace: "nowrap" }} dir="ltr">{dateDisplay}</div>}
              </div>
              <div data-route-arr style={{ flexShrink: 0, textAlign: "center", minWidth: 58 }}>
                <div style={{ fontFamily: "monospace", fontSize: 28, fontWeight: 900, color: "var(--primary)", lineHeight: 1 }}>{toIATA || "—"}</div>
                <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>{extractCity(flight.to_airport || "")}</div>
                {flight.arrival_time && <div style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 900, color: "var(--primary)", marginTop: 4 }}>{flight.arrival_time}</div>}
              </div>
            </div>
          </div>

          {/* ══ الفاصل المنقط ══ */}
          <div className="fl-perf" />

          {/* ══ التشغيل — المقاعد والتركيبة والأزرار ══ */}
          <div className="fl-ops" style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                {/* المقاعد المخصَّصة للحملة — لا سعة الطائرة */}
                <div style={{ display: "flex", alignItems: "baseline", gap: 5 }} dir="ltr">
                  <span style={{ fontSize: 30, fontWeight: 900, color: noCap ? "var(--warning)" : "var(--primary)", lineHeight: 1 }}>{fp.length}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>/ {flight.capacity ?? "—"}</span>
                </div>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: "var(--muted)", marginTop: 2 }}>مقاعد الحملة</div>
              </div>
              <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                <button onClick={e => { e.stopPropagation(); openEditFlight(flight); }} title="تعديل الرحلة" aria-label="تعديل الرحلة"
                  style={{ width: 28, height: 28, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--paper)", border: "1px solid var(--line)", cursor: "pointer", color: "var(--muted)" }}>
                  <svg aria-hidden width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
                </button>
                <button onClick={e => { e.stopPropagation(); printFlight(flight); }} title="طباعة كشف الرحلة" aria-label="طباعة كشف الرحلة"
                  style={{ width: 28, height: 28, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--paper)", border: "1px solid var(--line)", cursor: "pointer", color: "var(--muted)" }}>
                  <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
                </button>
                <button disabled={readOnly} onClick={async e => { e.stopPropagation(); if (await confirmAction(`هل تريد حذف رحلة ${flight.name}؟`, { title: "حذف الرحلة", danger: true })) void deleteFlight(flight); }}
                  title="حذف الرحلة" aria-label="حذف الرحلة"
                  style={{ ...roOff, width: 28, height: 28, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--paper)", border: "1px solid var(--danger)", cursor: "pointer", color: "var(--danger)" }}>
                  <svg aria-hidden width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /></svg>
                </button>
              </div>
            </div>

            <CapacityBar occ={fp.length} cap={flight.capacity ?? null} height={7} />
            <div style={{ fontSize: 10, fontWeight: 800, color: noCap ? "var(--warning)" : (flight.capacity != null && fp.length > flight.capacity) ? "var(--danger)" : "var(--muted)" }}>{capNote(flight)}</div>

            {fp.length > 0 && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {([
                  [fp.filter(p => p.gender === "ذكر").length, "رجال", "var(--male-bg)", "var(--male-fg)"],
                  [fp.filter(p => p.gender === "أنثى").length, "نساء", "var(--female-bg)", "var(--female-fg)"],
                  [firstClassCount, "درجة أولى", "var(--warning-bg)", "var(--warning)"],
                  [fp.length - firstClassCount, "سياحية", "var(--info-bg)", "var(--info)"],
                ] as [number, string, string, string][]).map(([n, l, bg, fg]) => (
                  <div key={l} style={{ flex: "1 1 60px", borderRadius: 6, padding: "2px 6px", display: "flex", alignItems: "center", gap: 3, border: "1px solid var(--line)", background: bg }}>
                    <span style={{ fontSize: 12, fontWeight: 900, lineHeight: 1, color: fg }}>{n}</span>
                    <span style={{ fontSize: 8, fontWeight: 700, color: "var(--muted)" }}>{l}</span>
                  </div>
                ))}
              </div>
            )}

            {/* من يطابق البحث على هذه الرحلة */}
            {searching && (() => {
              const hits = fp.filter(p => matchesFlightSearch(p, flightSearch));
              if (!hits.length) return null;
              return (
                <div data-search-hits style={{ fontSize: 10.5, fontWeight: 700, color: "var(--ink)", background: "color-mix(in srgb, var(--accent) 14%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)", borderRadius: 8, padding: "4px 8px" }}>
                  <span style={{ color: "var(--muted)" }}>يطابق البحث: </span>
                  {hits.slice(0, 3).map(p => p.short_ar || p.name_ar).join(" · ")}
                  {hits.length > 3 ? ` و${hits.length - 3} غيرهم` : ""}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════
  const tabBtn = (t: "ذهاب" | "إياب" | "الكل", n: number) => (
    /* التبويب يُنهي البحث ويعرض اتّجاهه — والبحث نفسه لا يتقيّد بتبويب */
    <button key={t} onClick={() => { setActiveTab(t); setFlightSearch(""); }} aria-pressed={!searching && activeTab === t}
      style={{ padding: "5px 14px", borderRadius: 99, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)",
        opacity: searching ? .55 : 1,
        border: !searching && activeTab === t ? "1.5px solid var(--primary)" : "1.5px solid var(--line)",
        background: !searching && activeTab === t ? "var(--primary)" : "var(--paper)",
        color: !searching && activeTab === t ? "var(--text-inverse)" : "var(--muted)" }}>
      {t} <span style={{ opacity: .75 }}>({n})</span>
    </button>
  );

  return (
    <div style={{ padding: 14, overflowY: "auto", height: "100%" }}>
      <style>{`
        .fl-card { display: flex; }
        .fl-pass { width: 400px; flex-shrink: 0; }
        .fl-ops  { flex: 1; min-width: 0; }
        .fl-perf { width: 0; border-right: 1px dashed var(--line); flex-shrink: 0; margin: 14px 0; }
        @media (max-width: 880px) {
          .fl-card { display: block; }
          .fl-pass { width: auto; }
          .fl-perf { width: auto; height: 0; border-right: none; border-top: 1px dashed var(--line); margin: 0 14px; }
        }
        .fl-card:focus-visible { outline: 2.5px solid var(--primary); outline-offset: 2px; }
        .fl-dir-btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 1px; }
        ${ROUTE_CSS}
      `}</style>
      <AlertModal alert={alertState} onClose={() => showAlert(null)} />
      <ConfirmModal state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
      <FlightsStats flights={flights} passengers={passengers} />

      <div style={{ display: "flex", gap: 8, marginBottom: 12, marginTop: 12, flexWrap: "wrap" }}>
        <button disabled={readOnly} onClick={() => setShowAdd(true)}
          style={{ ...roOff, display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 99, background: "var(--paper)", border: "1px solid var(--line)", color: "var(--primary)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)" }}>
          <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg> رحلة جديدة
        </button>
        {flights.length > 0 && <PrintOptionsMenu report={"flights"} value={printOpts} onChange={setPrintOpts} />}
        {flights.length > 0 && <button onClick={printAll} style={btnS()}>طباعة الكل</button>}
        <div style={{ display: "flex", gap: 6, marginInlineStart: "auto", flexWrap: "wrap" }}>
          {tabBtn("ذهاب", goFlights.length)}{tabBtn("إياب", retFlights.length)}{tabBtn("الكل", flights.length)}
        </div>
      </div>

      {flights.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <AllocationSearch value={flightSearch} onChange={setFlightSearch} placeholder="ابحث عن مسافر بالاسم أو رقم الجواز..." />
          {searching && (
            <div role="status" style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, marginTop: 6 }}>
              {visibleFlights.length
                ? `${visibleFlights.length === 1 ? "رحلة واحدة" : `${visibleFlights.length} رحلات`} فيها مسافرٌ يطابق «${flightSearch.trim()}» — في الذهاب والإياب معاً`
                : `لا رحلة فيها مسافرٌ يطابق «${flightSearch.trim()}» — في الذهاب والإياب`}
            </div>
          )}
        </div>
      )}

      <AllocationStates loading={flightsLoading} error={flightsError} empty={!flights.length}
        icon={<PlaneIcon size={16} />} errorText="تعذر تحميل الرحلات — يرجى التحقق من الاتصال وتحديث الصفحة" emptyText="لا يوجد رحلات بعد" />

      {!flightsLoading && !flightsError && flights.length > 0 && (
        visibleFlights.length === 0
          ? (searching ? null : <div style={{ fontSize: 12, color: "var(--muted)", padding: "8px 2px" }}>لا رحلات {activeTab} في هذا الموسم</div>)
          : visibleFlights.map(renderBoardingPass)
      )}

      {/* ═══ مودال الرحلة ═══ */}
      {openFlight && (() => {
        const f = openFlight;
        const leg = legOf(f.type);
        const list = onFlight(f);
        const left = remainingOf(f);
        const others = flights.filter(x => x.id !== f.id && x.type === f.type);
        const linkCandidates = flights.filter(x => x.type === oppositeType(f.type));

        /* الأهليّة: من يجوز حجز تذكرة له، وليس على رحلةٍ من هذا
           الاتجاه بعد. و«بدون» لا يظهر أصلاً — استبعادٌ صلب. */
        const source = passengers.filter(p => ticketEligible(p) && p[leg] == null && matchesPassenger(p, pSearch));
        const items: PickerItem[] = orderHajjThenAdmins(source).map(p => ({
          id: p.id,
          name: p.short_ar || p.name_ar,
          badges: (
            <>
              {!isHajj(p) && <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 99, background: "var(--warning-bg)", color: "var(--warning)", flexShrink: 0 }}>{p.passenger_type}</span>}
              {paidClass(p) === "درجة أولى" && <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 99, background: "var(--warning-bg)", color: "var(--warning)", flexShrink: 0 }}>أولى</span>}
              {p.family_id && <span title="ضمن أسرة" aria-label="ضمن أسرة" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--success)", flexShrink: 0 }} />}
            </>
          ),
        }));

        return (
          <AllocationDialog onClose={closeDialog} icon={<PlaneIcon size={16} />}
            title={<span dir="ltr">{f.name}</span>}
            badges={<>{dirBadge(f.type, true)}{f.airline && <span style={{ fontSize: 10, fontWeight: 700, opacity: .9 }}>{f.airline}</span>}</>}
            meta={
              <div style={{ maxWidth: 440 }}>
                <div style={{ fontSize: 11, fontWeight: 700, opacity: .9, marginBottom: 4 }} dir="ltr">
                  {extractIATA(f.from_airport || "")} {f.time} → {extractIATA(f.to_airport || "")} {f.arrival_time} · {f.date}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, fontWeight: 800, marginBottom: 5, flexWrap: "wrap" }}>
                  <span dir="ltr">{list.length} / {f.capacity ?? "—"}</span>
                  <span style={{ opacity: .85 }}>· {capNote(f)}</span>
                  {editingCap ? (
                    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                      <input value={capDraft} onChange={e => setCapDraft(e.target.value)} type="number" min="1" step="1" inputMode="numeric" autoFocus aria-label="مقاعد الحملة"
                        /* Escape يلغي تعديل المقاعد وحده — لا يصل إلى مستمع المودال فيغلقه */
                        onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setEditingCap(false); } }}
                        style={{ width: 60, padding: "2px 6px", borderRadius: 6, border: "none", outline: "none", background: "var(--paper)", color: "var(--ink)", fontSize: 11, fontFamily: "var(--font-body)" }} />
                      <button onClick={() => saveCapacity(f)} style={{ fontSize: 10, fontWeight: 900, padding: "2px 8px", borderRadius: 6, border: "none", background: "var(--paper)", color: "var(--primary)", cursor: "pointer", fontFamily: "var(--font-body)" }}>حفظ</button>
                      <button onClick={() => setEditingCap(false)} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, border: "1px solid color-mix(in srgb, var(--text-inverse) 35%, transparent)", background: "transparent", color: "var(--text-inverse)", cursor: "pointer", fontFamily: "var(--font-body)" }}>إلغاء</button>
                    </span>
                  ) : (
                    <button disabled={readOnly} onClick={() => { setCapDraft(f.capacity != null ? String(f.capacity) : ""); setEditingCap(true); }}
                      style={{ ...roOff, fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 99, border: "1px solid color-mix(in srgb, var(--text-inverse) 35%, transparent)", background: "color-mix(in srgb, var(--text-inverse) 14%, transparent)", color: "var(--text-inverse)", cursor: "pointer", fontFamily: "var(--font-body)" }}>
                      {f.capacity == null ? "حدّد مقاعد الحملة" : "تعديل المقاعد"}
                    </button>
                  )}
                </div>
                <CapacityBar occ={list.length} cap={f.capacity ?? null} height={6} onDark />
              </div>
            }
            actions={
              <>
                {linkCandidates.length > 0 && (
                  <DialogAction disabled={readOnly} label="إضافة من رحلة مرتبطة" onClick={() => { setShowLink(true); setLinkSourceId(null); }}>
                    <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                  </DialogAction>
                )}
                <DialogAction onClick={() => printFlight(f)} label="طباعة كشف الرحلة">
                  <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" rx="1" /></svg>
                </DialogAction>
              </>
            }
            roster={
              <>
                <RosterHeader count={paxLabel(list.length)}
                  breakdown={list.some(p => !isHajj(p)) ? `${list.filter(p => isHajj(p)).length} حاج · ${list.filter(p => !isHajj(p)).length} إداري` : undefined} />

                {/* لوحة «إضافة من رحلة مرتبطة» — مراجعةٌ قبل الكتابة */}
                {showLink && (
                  <div style={{ flexShrink: 0, borderBottom: "2px solid var(--line)", background: "var(--bg-2)", padding: "10px 14px" }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: "var(--info)", marginBottom: 7 }}>
                      إضافة من رحلة {oppositeType(f.type)} — اختر المصدر ثم راجع قبل الإضافة
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <select value={linkSourceId ?? ""} onChange={e => setLinkSourceId(e.target.value ? Number(e.target.value) : null)}
                        aria-label="رحلة المصدر"
                        style={{ flex: "1 1 160px", padding: "5px 8px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink)", fontSize: 11.5, fontFamily: "var(--font-body)" }}>
                        <option value="">— اختر رحلة {oppositeType(f.type)} —</option>
                        {linkCandidates.map(x => <option key={x.id} value={x.id}>{x.name} · {x.date} ({passengers.filter(p => p[legOf(x.type)] === x.id).length})</option>)}
                      </select>
                      <button disabled={readOnly || linkSourceId == null}
                        onClick={() => { const src = flights.find(x => x.id === linkSourceId); if (src) void runLink(f, src); }}
                        style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: linkSourceId == null ? "var(--line)" : "var(--primary)", color: linkSourceId == null ? "var(--muted)" : "var(--text-inverse)", fontSize: 11.5, fontWeight: 800, cursor: linkSourceId == null ? "not-allowed" : "pointer", fontFamily: "var(--font-body)" }}>
                        راجِع
                      </button>
                      <button onClick={() => { setShowLink(false); setLinkSourceId(null); }} style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--paper)", color: "var(--muted)", fontSize: 11.5, cursor: "pointer", fontFamily: "var(--font-body)" }}>إغلاق</button>
                    </div>
                    {linkSourceId != null && (() => {
                      const src = flights.find(x => x.id === linkSourceId);
                      if (!src) return null;
                      const plan = linkPlan(f, src);
                      return (
                        <div style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 700, marginTop: 7, lineHeight: 1.7 }}>
                          مؤهَّلون للإضافة: <b style={{ color: "var(--ink)" }}>{plan.eligible.length}</b>
                          {plan.already.length ? ` · على هذه الرحلة بالفعل: ${plan.already.length}` : ""}
                          {plan.onOther.length ? ` · على رحلة ${f.type} أخرى: ${plan.onOther.length}` : ""}
                          {plan.optOut.length ? ` · بدون طيران: ${plan.optOut.length}` : ""}
                          {plan.notEligible.length ? ` · غير مؤهّلين: ${plan.notEligible.length}` : ""}
                          {" · "}المقاعد المتبقية: <b style={{ color: "var(--ink)" }}>{plan.left ?? "غير محدَّدة"}</b>
                        </div>
                      );
                    })()}
                  </div>
                )}

                <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
                  {list.length === 0
                    ? <div style={{ textAlign: "center", padding: "2rem", color: "var(--muted)", fontSize: 12 }}>لا يوجد مسافرون بعد</div>
                    : list.map((p, i) => (
                      <AssignedRow key={p.id} index={i + 1} name={p.short_ar || p.name_ar}
                        badges={
                          <>
                            {!isHajj(p) && <span style={{ fontSize: 8.5, fontWeight: 800, padding: "1px 5px", borderRadius: 99, background: "var(--warning-bg)", color: "var(--warning)", flexShrink: 0 }}>{p.passenger_type}</span>}
                            {paidClass(p) === "درجة أولى" && <span style={{ fontSize: 8.5, fontWeight: 800, padding: "1px 5px", borderRadius: 99, background: "var(--warning-bg)", color: "var(--warning)", flexShrink: 0 }}>أولى</span>}
                            {p.family_id && <span title="ضمن أسرة" aria-label="ضمن أسرة" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--success)", flexShrink: 0 }} />}
                          </>
                        }
                        actions={
                          <>
                            {others.length > 0 && (
                              <select onChange={e => { void moveP(f, p, e.target.value); e.currentTarget.value = ""; }} defaultValue="" disabled={readOnly}
                                aria-label={`نقل ${p.short_ar || p.name_ar} إلى رحلة أخرى`} title="نقل لرحلة أخرى"
                                style={{ ...roOff, fontSize: 10, fontWeight: 700, color: "var(--muted)", background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 7, padding: "3px 8px", fontFamily: "var(--font-body)", cursor: "pointer", minWidth: 62 }}>
                                <option value="">نقل</option>
                                {others.map(x => <option key={x.id} value={x.id}>{x.name} ({x.capacity == null ? "بلا مقاعد" : `${remainingOf(x)} متاح`})</option>)}
                              </select>
                            )}
                            <button disabled={readOnly} onClick={() => void removeP(f, p)}
                              aria-label={`إزالة ${p.short_ar || p.name_ar} من الرحلة`} title="إزالة من الرحلة"
                              style={{ ...roOff, width: 24, height: 24, borderRadius: 7, border: "1px solid var(--danger)", background: "var(--paper)", cursor: "pointer", color: "var(--danger)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <svg aria-hidden width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" /></svg>
                            </button>
                          </>
                        } />
                    ))}
                </div>
              </>
            }
            picker={
              <PassengerPicker title="إضافة مسافرين" search={pSearch} onSearch={setPSearch}
                items={items} selected={picked} disabled={readOnly}
                onToggle={id => setPicked(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
                onToggleAll={() => setPicked(picked.size === items.length ? new Set() : new Set(items.map(i => i.id)))}
                onQuickAdd={id => void addOne(f, id)}
                countText={`${items.length} بلا رحلة ${f.type} · ${f.capacity == null ? "المقاعد غير محدَّدة" : (left ?? 0) > 0 ? seatsLabel(left ?? 0) : "الرحلة مكتملة"}`}
                emptyText={pSearch ? "لا توجد نتائج" : `جميع المؤهَّلين لديهم رحلة ${f.type}`}
                footer={picked.size > 0 && (
                  <button disabled={readOnly} onClick={() => void addPicked(f)}
                    style={{ ...roOff, width: "100%", padding: 9, borderRadius: 10, border: "none", background: "var(--primary)", color: "var(--text-inverse)", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "var(--font-body)" }}>
                    إضافة {paxLabel(picked.size)}
                  </button>
                )} />
            } />
        );
      })()}

      {/* ═══ إضافة رحلة ═══ */}
      <Modal show={showAdd} onClose={() => { setShowAdd(false); setFormError(""); }} title="إضافة رحلة جديدة" maxWidth={520}>
        <FlightForm form={addForm} setForm={setAddForm} occupied={0} />
        {formError && <div role="alert" style={{ fontSize: 11, color: "var(--danger)", marginBottom: 10 }}>{formError}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={addFlight} style={{ ...btnP(), flex: 1 }}>إضافة</button>
          <button onClick={() => { setShowAdd(false); setFormError(""); }} style={btnS()}>إلغاء</button>
        </div>
      </Modal>

      {/* ═══ تعديل رحلة ═══ */}
      <Modal show={!!editFlightModal} onClose={() => setEditFlightModal(null)} title={`تعديل رحلة ${editFlightModal?.name ?? ""}`} maxWidth={520}>
        <FlightForm form={editForm} setForm={setEditForm} occupied={editFlightModal ? occOf(editFlightModal) : 0} />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={saveEditFlight} style={{ ...btnP(), flex: 1 }}>حفظ</button>
          <button onClick={() => setEditFlightModal(null)} style={btnS()}>إلغاء</button>
        </div>
      </Modal>
    </div>
  );
}

/* نموذجُ الرحلة — مشتركٌ بين الإضافة والتعديل، فلا يفترق الحقلان */
type FlightFormState = { name: string; type: "ذهاب" | "إياب"; airline: string; date: string; time: string; arrival_time: string; arrival_date: string; from_airport: string; to_airport: string; capacity: string };

function FlightForm({ form, setForm, occupied }: { form: FlightFormState; setForm: Dispatch<SetStateAction<FlightFormState>>; occupied: number }) {
  const set = (k: keyof FlightFormState) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, [k]: e.target.value }));
  const lbl = { fontSize: 11, color: "var(--text-muted)", marginBottom: 4, display: "block" } as const;
  const section = { border: "1px solid var(--line)", borderRadius: 12, padding: "10px 12px", marginBottom: 10, background: "var(--bg-2)" } as const;
  const sectionTitle = { fontSize: 10.5, fontWeight: 900, color: "var(--primary)", marginBottom: 8, letterSpacing: .2 } as const;

  /* الخيار يُستنتج من القيمة المحفوظة مرّةً عند الفتح، ولا يُعاد كتابة
     القيمة إلا إن غيّر الموظّف الخيار: اسمٌ قديمٌ لا تعرفه القائمة يبقى
     كما هو تحت «أخرى» */
  const [choice, setChoice] = useState(() => airlineOption(form.airline));
  const pickAirline = (v: string) => {
    setChoice(v as typeof choice);
    setForm(prev => ({ ...prev, airline: v === AIRLINE_OTHER ? (airlineOption(prev.airline) === AIRLINE_OTHER ? prev.airline : "") : v }));
  };

  return (
    <>
      {/* رأس النموذج — الشركة والرقم والاتّجاه كما ستظهر على البطاقة */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div data-form-airline-mark style={{ width: 44, height: 44, borderRadius: 12, border: "2px solid var(--accent)", background: "var(--paper)", display: "flex", alignItems: "center", justifyContent: "center", padding: 4, color: "var(--accent)", flexShrink: 0, overflow: "hidden" }}>
          <AirlineMark airline={form.airline} size={20} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--ink)" }}>{form.airline.trim() || "شركة الطيران"}</div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", fontFamily: "monospace" }} dir="ltr">{form.name.trim() || "—"}</div>
        </div>
        <span style={{ marginInlineStart: "auto", fontSize: 10, fontWeight: 800, padding: "2px 9px", borderRadius: 99, background: "color-mix(in srgb, var(--primary) 12%, transparent)", color: "var(--primary)" }}>{form.type}</span>
      </div>

      {/* ═ الرحلة ═ */}
      <div style={section}>
        <div style={sectionTitle}>الرحلة</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 10 }}>
          <label>
            <span style={lbl}>رقم الرحلة</span>
            <input style={inp} value={form.name} onChange={set("name")} placeholder="QA1212" />
          </label>
          <label>
            <span style={lbl}>شركة الطيران</span>
            <select style={inp} value={choice} onChange={e => pickAirline(e.target.value)} aria-label="شركة الطيران">
              {AIRLINE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        </div>
        {choice === AIRLINE_OTHER && (
          <label style={{ display: "block", marginBottom: 10 }}>
            <span style={lbl}>اسم شركة الطيران</span>
            <input style={inp} value={form.airline} onChange={set("airline")} placeholder="اسم الشركة" aria-label="اسم شركة الطيران" />
          </label>
        )}
        <div>
          <span style={lbl}>الاتجاه{occupied > 0 ? " — لا يُقلب وفيها مسافرون" : ""}</span>
          <div role="group" aria-label="الاتجاه" style={{ display: "flex", gap: 8 }}>
            {(["ذهاب", "إياب"] as const).map(t => (
              <button key={t} type="button" className="fl-dir-btn" aria-pressed={form.type === t} disabled={occupied > 0}
                onClick={() => setForm(prev => ({ ...prev, type: t }))}
                style={{ flex: 1, padding: 8, borderRadius: 8, textAlign: "center", fontSize: 12, fontWeight: 700, fontFamily: "var(--font-body)", cursor: occupied === 0 ? "pointer" : "not-allowed", opacity: occupied === 0 ? 1 : .5,
                  border: `1.5px solid ${form.type === t ? "var(--primary)" : "var(--border)"}`,
                  background: form.type === t ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "var(--paper)",
                  color: form.type === t ? "var(--primary)" : "var(--text-muted)" }}>{t}</button>
            ))}
          </div>
        </div>
      </div>

      {/* ═ المسار — المغادرة ثم الوصول ═ */}
      <div style={section}>
        <div style={sectionTitle}>المسار</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--ink)", marginBottom: 6 }}>المغادرة</div>
            <label style={{ display: "block", marginBottom: 8 }}><span style={lbl}>من مطار</span><input style={inp} value={form.from_airport} onChange={set("from_airport")} placeholder="DOH Doha" /></label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <label><span style={lbl}>تاريخ المغادرة</span><input style={inp} type="date" value={form.date} onChange={set("date")} /></label>
              <label><span style={lbl}>وقت المغادرة</span><input style={inp} type="time" value={form.time} onChange={set("time")} /></label>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--ink)", marginBottom: 6 }}>الوصول</div>
            <label style={{ display: "block", marginBottom: 8 }}><span style={lbl}>إلى مطار</span><input style={inp} value={form.to_airport} onChange={set("to_airport")} placeholder="JED Jeddah" /></label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <label><span style={lbl}>تاريخ الوصول</span><input style={inp} type="date" value={form.arrival_date} onChange={set("arrival_date")} /></label>
              <label><span style={lbl}>وقت الوصول</span><input style={inp} type="time" value={form.arrival_time} onChange={set("arrival_time")} /></label>
            </div>
          </div>
        </div>
      </div>

      {/* ═ مقاعد الحملة ═ */}
      <div style={{ ...section, marginBottom: 14 }}>
        <label style={{ display: "block" }}>
          <span style={sectionTitle}>المقاعد المخصَّصة للحملة — مطلوبة</span>
          <input style={{ ...inp, marginTop: 6 }} type="number" min="1" step="1" inputMode="numeric" value={form.capacity} onChange={set("capacity")} placeholder="مثال: 40" />
        </label>
        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 5 }}>
          ليست سعة الطائرة: طائرةٌ بـ٣٠٠ مقعد قد تكون حصّة الحملة فيها ٤٠.
          {occupied > 0 ? ` ولا تنزل تحت ${occupied} — عدد المسافرين الحاليّ.` : ""}
        </div>
      </div>
    </>
  );
}

export { FlightsStats, FlightsPage };
