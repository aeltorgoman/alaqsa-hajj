import { useState, useEffect, useMemo, useRef } from "react";
import { isHajj, byOrder, reorderUpdates, applyReorder } from "../utils/passenger";
import type { Dispatch, SetStateAction } from "react";
import { supabase } from "../supabase";
import type { Passenger, Room } from "../types";
import { useCompanyBranding } from "../company/CompanyContext";
import { AlertModal, useAlert } from "./AlertModal";
import { StatsRow, type StatCardData } from "./StatCard";
import { HOTEL_ROOM_TYPES, isFixedCapType, roomCapacity, makeShort, ROOM_TYPE_CAP as ROOM_TYPE_CAP_UI } from "../utils";
import { useSeasonWrite } from "../season/useSeasonWrite";
import { useSeason } from "../season/useSeason";

const ROOM_TYPES = HOTEL_ROOM_TYPES as readonly Room["type"][];

/* حالات الغرفة — «مجلس» **نوع** لا حالة. كانت تُشتقّ من `cap === 0`
   فتبتلع «أخرى» وكل نوعٍ لا تعرفه الخريطة، فتصف غرفةً عاديةً بأنها
   مجلس. والآن الحالة من الإشغال والسعة، والنوع يُقرأ من النوع. */
type RoomStatus = "مكتملة" | "قيد التسكين" | "جاهزة" | "مجلس" | "تجاوز" | "غير محدّدة";

function HotelPage({ passengers, setPassengers }: { passengers: Passenger[]; setPassengers: Dispatch<SetStateAction<Passenger[]>> }) {
  const primary = useCompanyBranding().primaryColor;
  const { alert, showAlert } = useAlert();

  const { writeOk, writeAllOk, assertWritable, readOnly } = useSeasonWrite(showAlert);
  const { viewedSeason } = useSeason();

  /* التعطيل البصري لمداخل الكتابة — طبقة تجربة لا حماية */
  const roOff = readOnly ? { opacity: 0.4, pointerEvents: "none" as const } : null;
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [filterFloor, setFilterFloor] = useState("الكل");  // سيتم تعيينه بأول طابق عند التحميل
  const [filterStatus, setFilterStatus] = useState("الكل");
  const [filterType, setFilterType] = useState<string|null>(null);
  const [search, setSearch] = useState("");
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [showAddPilgrim, setShowAddPilgrim] = useState(false);

  /* إغلاق المودالات بمفتاح Escape */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showAddPilgrim) { setShowAddPilgrim(false); return; }
      if (showAddRoom) { setShowAddRoom(false); return; }
      if (selectedRoom) { setSelectedRoom(null); return; }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [selectedRoom, showAddRoom, showAddPilgrim]);
  const [pSearch, setPSearch] = useState("");
  /* ترتيب الأسماء داخل الغرفة — عرضٌ تشغيلي لكشف الفندق، وليس
     إسناد أسرّة: الرقم موضع في القائمة لا سرير بعينه. ولم يكن
     للغرفة ترتيب إطلاقاً قبل اليوم، فالأسماء تظهر بترتيب وصولها
     من القاعدة. */
  const [dragId, setDragId] = useState<number | null>(null);

  // Add Room form
  const [addMode, setAddMode] = useState<"single"|"range"|"template">("single");
  const [addNum, setAddNum] = useState("");
  const [addFloor, setAddFloor] = useState("");
  const [addType, setAddType] = useState<Room["type"]>("ثنائية");
  const [addNotes, setAddNotes] = useState("");
  /* سعة «خاص» — تُطلب صراحةً، والقاعدة ترفض ما دونها */
  const [addCap, setAddCap] = useState("");
  // Range mode
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [rangeFloor, setRangeFloor] = useState("");
  const [rangeType, setRangeType] = useState<Room["type"]>("ثنائية");
  const [rangeCap, setRangeCap] = useState("");
  // Template mode
  const [tplFloors, setTplFloors] = useState("");
  const [tplRoomsPerFloor, setTplRoomsPerFloor] = useState("");
  const [tplStartNum, setTplStartNum] = useState("");
  const [tplType, setTplType] = useState<Room["type"]>("ثنائية");
  const [tplFloorStart, setTplFloorStart] = useState("");
  const [tplCap, setTplCap] = useState("");

  // Panel notes
  const [panelNotes, setPanelNotes] = useState("");
  const [panelType, setPanelType] = useState<Room["type"]>("ثنائية");
  const [editingRoomNum, setEditingRoomNum] = useState(false);
  const [editingType, setEditingType] = useState(false);
  const [newRoomNum, setNewRoomNum] = useState("");
  const [panelCap, setPanelCap] = useState("");
  const [moveFor, setMoveFor] = useState<Passenger | null>(null);
  const [moveSearch, setMoveSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<typeof selectedRoom | null>(null);
  const [expandedCardId, setExpandedCardId] = useState<number | null>(null);
  const [hoveredCardId, setHoveredCardId] = useState<number | null>(null);
  const [tipBelow, setTipBelow] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    /* الفشل يُبلَّغ عنه بدل شبكة فارغة تبدو كـ«لا يوجد غرف» */
    supabase.from("rooms").select("*").eq("season_id", viewedSeason.id)
      .then(({ data, error }) => {
        if (error || !data) { console.error("تعذر تحميل الغرف", error); setRoomsError(true); }
        else { setRooms((data as Room[]).sort((a,b) => (parseInt(a.floor)||0) - (parseInt(b.floor)||0) || (parseInt(a.number)||0) - (parseInt(b.number)||0) || a.number.localeCompare(b.number))); setRoomsError(false); }
        setRoomsLoading(false);
      });
  }, [viewedSeason.id]);

  const floors = useMemo(
    () => [...new Set(rooms.map(r => r.floor))].sort((a, b) => parseInt(a) - parseInt(b) || a.localeCompare(b)),
    [rooms]
  );

  /* التعيين الأولي لأول طابق — مرة واحدة عند وصول الغرف لا كلما تغيّرت.
     كان داخل الـ useMemo أعلاه، فيعيد الضبط بعد كل تعديل على الغرف
     ويُلغي اختيار المستخدم لـ«الكل» بلا سبب ظاهر. */
  const floorInitialized = useRef(false);
  useEffect(() => {
    if (!floorInitialized.current && floors.length > 0) {
      floorInitialized.current = true;
      setFilterFloor(floors[0]);
    }
  }, [floors]);

  const hajj = passengers.filter(p => isHajj(p));

  /* شاغلو الغرفة — كل من `room_id` يشير إليها، حاجّاً كان أو إدارياً.
     السرير المشغول مشغول أياً كان ساكنه: فالإشغال والسعة وحارس الحذف
     تُبنى على مفتاح الإسناد لا على قائمة الحجاج. أما مؤشّرات «الحجاج
     الموزّعين» و«نسبة التوزيع» فتبقى حجّاجية، لأن معناها حجّاجي. */
  const roomPassengers = (roomId: number) =>
    passengers.filter(p => p.room_id === roomId).sort(byOrder("room_sort_order"));

  /* من لا غرفة له — الإداري كذلك. كان يُسكَّن من صفحة الإداريين
     وحدها، وهي أضعف مدخل: بلا سعة ولا حالة غرفة أمام المستخدم. */
  const unassigned = passengers.filter(p => !p.room_id);

  /* تفصيل الشاغلين: السعة تعدّ الجميع، والتشغيل يحتاج معرفة التركيبة */
  const occBreakdown = (roomId: number) => {
    const occ = roomPassengers(roomId);
    const h = occ.filter(p => isHajj(p)).length;
    return { total: occ.length, hajj: h, admins: occ.length - h };
  };

  /* السعة المحفوظة أولاً — لا تُشتقّ من النوع إلا حين يغيب العمود
     (صفٌّ لم تمرّ عليه الهجرة بعد). و`null` تعني «غير محدّدة». */
  const capOf = (room: Room) => roomCapacity(room);

  const getStatus = (room: Room): RoomStatus => {
    if (room.type === "مجلس") return "مجلس";
    const cap = capOf(room);
    if (cap == null) return "غير محدّدة";
    const occ = roomPassengers(room.id).length;
    /* بياناتٌ قديمة تجاوزت سقفها: تُعرَض ولا تُصحَّح ذاتياً، ولا
       تُخفى خلف شريطٍ ممتلئٍ يبدو طبيعياً. */
    if (occ > cap) return "تجاوز";
    if (occ === 0) return "جاهزة";
    if (occ >= cap) return "مكتملة";
    return "قيد التسكين";
  };

  const statusColor: Record<RoomStatus, string> = {
    "مكتملة": "#7D1F3C",
    "قيد التسكين": "#1D4ED8",
    "جاهزة": "#059669",
    "مجلس": "#7C3AED",
    "تجاوز": "#B91C1C",
    "غير محدّدة": "#6B7280",
  };
  const statusLabel: Record<RoomStatus, string> = {
    "مكتملة": "🔴 مكتملة",
    "قيد التسكين": "🔵 قيد التسكين",
    "جاهزة": "🟢 جاهزة",
    "مجلس": "مجلس",
    "تجاوز": "⚠️ تجاوز السعة",
    "غير محدّدة": "السعة غير محدّدة",
  };

  /* وسم الحالة في الترويسة يقف على أرضيّة `--paper`، وهي داكنة في
     السمة الداكنة. فألوانه من رموز الحالة في السمة (`--danger`
     و`--warning`…) لا من `statusColor` الثابتة أعلاه — تلك تبقى
     لبطاقات الشبكة كما اعتُمدت، وهذه تنقلب مع السمة فتُقرأ في
     الداكنة كما في الفاتحة. */
  const statusToken: Record<RoomStatus, string> = {
    "مكتملة": "var(--primary)",
    "قيد التسكين": "var(--info)",
    "جاهزة": "var(--success)",
    "مجلس": "var(--accent-dark, var(--accent))",
    "تجاوز": "var(--danger)",
    "غير محدّدة": "var(--muted)",
  };

  /* هل تقبل الغرفة نزيلاً آخر؟ حكمٌ واحد تستعمله الأزرار والقوائم
     والنقل — وهو صدى حارس القاعدة لا بديلٌ عنه. */
  const roomFull = (room: Room) => {
    const cap = capOf(room);
    if (cap == null || cap === 0) return true;
    return roomPassengers(room.id).length >= cap;
  };


  const filteredRooms = useMemo(() => {
    return rooms.filter(r => {
      if (filterFloor !== "الكل" && r.floor !== filterFloor) return false;
      if (filterStatus !== "الكل" && getStatus(r) !== filterStatus) return false;
      if (filterType && r.type !== filterType) return false;
      if (search) {
        const q = search.trim();
        if (r.number.includes(q)) return true;
        return roomPassengers(r.id).some(p => p.name_ar.includes(q) || (p.short_ar || "").includes(q));
      }
      return true;
    });
  }, [rooms, filterFloor, filterStatus, filterType, search, passengers]);

  // KPIs
  const totalRooms = rooms.length;
  const withRoom = hajj.filter(p => p.room_id).length;
  const noRoom = hajj.length - withRoom;
  const pct = hajj.length > 0 ? Math.round(withRoom / hajj.length * 100) : 0;
  /* أَسِرّة لا غرف: «غرف متاحة» كانت تعدّ الغرف التي فيها متّسع،
     فتُقرأ «غرفٌ فارغة» وهي ليست كذلك. والسرير هو القيد الحقيقيّ. */
  const freeBeds = rooms.reduce((n, r) => {
    const cap = capOf(r);
    if (cap == null || cap === 0) return n;
    return n + Math.max(0, cap - roomPassengers(r.id).length);
  }, 0);

  const hotelCards: StatCardData[] = [
    { label: "إجمالي الغرف", num: String(totalRooms), sub: "غرفة مسجلة", tone: "brand", icon: `<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>` },
    { label: "حجاج موزعين", num: String(withRoom), sub: `من ${hajj.length} حاج · ${pct}٪`, tone: "success", icon: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>` },
    /* الرقم الذي يقول «هل انتهى عمل اليوم؟» — كان يُستنبط ذهنياً */
    { label: "حجاج بدون غرفة", num: String(noRoom), sub: noRoom === 0 ? "اكتمل التسكين" : "بانتظار التسكين", tone: noRoom === 0 ? "success" : "warning", icon: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="8" x2="23" y2="14"/><line x1="23" y1="8" x2="17" y2="14"/>` },
    { label: "أَسِرّة شاغرة", num: String(freeBeds), sub: "سرير متاح للتسكين", tone: "info", featured: true, icon: `<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>` },
  ];

  /* رقم الغرفة لا يتكرّر في الدور الواحد. الفحص هنا يمنع الضغطة،
     والفهرس الفريد في القاعدة يمنع ما تفلت منه — نافذتان مفتوحتان
     أو طلبان متزامنان. و`ignoreId` لإعادة التسمية: الغرفة لا تصطدم
     بنفسها. */
  const takenNumber = (floor: string, number: string, ignoreId?: number) =>
    rooms.some(r => r.id !== ignoreId && r.floor === floor && r.number === number);

  /* رسالةٌ واحدة لخطأ القاعدة نفسه، فلا يرى الموظّف نصّ بوستجرس */
  const roomWriteError = (msg?: string) =>
    msg && /duplicate key|rooms_season_floor_number_uniq/i.test(msg)
      ? "رقم الغرفة مستخدم في هذا الدور بالفعل"
      : msg || "حدث خطأ أثناء الحفظ";

  /* سعة النموذج: النوع القياسيّ يفرضها، و«خاص» تُقرأ من الحقل.
     تُرسَل دائماً، والقاعدة تُصحّح القياسيّ وترفض «خاص» بلا سعة. */
  const formCapacity = (type: Room["type"], raw: string): number | null => {
    if (isFixedCapType(type)) return null;   // القاعدة تفرضها
    const n = parseInt(raw, 10);
    return Number.isInteger(n) && n > 0 ? n : NaN as unknown as number;
  };
  const capError = (type: Room["type"], raw: string) =>
    !isFixedCapType(type) && !(parseInt(raw, 10) > 0);

  const addRoom = async () => {
    if (!assertWritable()) return;
    if (!addNum.trim() || !addFloor.trim()) { showAlert("error", "رقم الغرفة والدور مطلوبان"); return; }
    if (capError(addType, addCap)) { showAlert("error", "غرفة «خاص» تحتاج سعة صريحة أكبر من صفر"); return; }
    if (takenNumber(addFloor.trim(), addNum.trim())) { showAlert("error", `الغرفة ${addNum.trim()} موجودة في الدور ${addFloor.trim()} بالفعل`); return; }
    const cap = formCapacity(addType, addCap);
    const { data, error } = await supabase.from("rooms").insert([{ number: addNum.trim(), floor: addFloor.trim(), type: addType, capacity: cap, notes: addNotes.trim() || null }]).select();
    if (error) { showAlert("error", roomWriteError(error.message)); return; }
    setRooms(prev => [...prev, ...(data as Room[])].sort((a,b) => (parseInt(a.floor)||0) - (parseInt(b.floor)||0) || (parseInt(a.number)||0) - (parseInt(b.number)||0) || a.number.localeCompare(b.number)));
    setAddNum(""); setAddFloor(""); setAddType("ثنائية"); setAddNotes(""); setAddCap("");
    setShowAddRoom(false);
    showAlert("success", "تمت إضافة الغرفة"); setTimeout(() => showAlert(null), 2500);
  };

  const addRoomRange = async () => {
    if (!assertWritable()) return;
    const from = parseInt(rangeFrom), to = parseInt(rangeTo);
    if (!rangeFloor.trim() || isNaN(from) || isNaN(to) || from > to) { showAlert("error", "يرجى إدخال نطاق صحيح ودور صحيح"); return; }
    if (capError(rangeType, rangeCap)) { showAlert("error", "غرف «خاص» تحتاج سعة صريحة أكبر من صفر"); return; }
    const rCap = formCapacity(rangeType, rangeCap);
    const entries = Array.from({ length: to - from + 1 }, (_, i) => ({ number: String(from + i), floor: rangeFloor.trim(), type: rangeType, capacity: rCap }));
    /* الدفعة كاملةً أو لا شيء: إدراجٌ جزئيّ يترك الموظّف أمام نطاقٍ
       نصفه موجود ونصفه لا، ولا يعرف أيّهما. */
    const clash = entries.filter(e => takenNumber(e.floor, e.number)).map(e => e.number);
    if (clash.length) { showAlert("error", `أرقام موجودة في الدور ${rangeFloor.trim()} بالفعل: ${clash.slice(0,8).join("، ")}${clash.length>8?" …":""}`); return; }
    const { data, error } = await supabase.from("rooms").insert(entries).select();
    if (error) { showAlert("error", roomWriteError(error.message)); return; }
    setRooms(prev => [...prev, ...(data as Room[])].sort((a,b) => (parseInt(a.floor)||0)-(parseInt(b.floor)||0)||(parseInt(a.number)||0)-(parseInt(b.number)||0)));
    setRangeFrom(""); setRangeTo(""); setRangeFloor(""); setShowAddRoom(false);
    showAlert("success", `تمت إضافة ${entries.length} غرفة`);
  };

  const addRoomTemplate = async () => {
    if (!assertWritable()) return;
    const numFloors = parseInt(tplFloors), rPerFloor = parseInt(tplRoomsPerFloor);
    const startNum = parseInt(tplStartNum), floorStart = parseInt(tplFloorStart);
    if (isNaN(numFloors)||isNaN(rPerFloor)||isNaN(startNum)||isNaN(floorStart)||numFloors<1||rPerFloor<1) { showAlert("error", "يرجى تعبئة جميع الحقول بشكل صحيح"); return; }
    if (capError(tplType, tplCap)) { showAlert("error", "غرف «خاص» تحتاج سعة صريحة أكبر من صفر"); return; }
    const tCap = formCapacity(tplType, tplCap);
    const entries: {number:string;floor:string;type:Room["type"];capacity:number|null}[] = [];
    for (let f = 0; f < numFloors; f++) {
      for (let r = 0; r < rPerFloor; r++) {
        entries.push({ number: String(startNum + f * rPerFloor + r), floor: String(floorStart + f), type: tplType, capacity: tCap });
      }
    }
    const tclash = entries.filter(e => takenNumber(e.floor, e.number)).map(e => `${e.floor}/${e.number}`);
    if (tclash.length) { showAlert("error", `غرف موجودة بالفعل (دور/رقم): ${tclash.slice(0,8).join("، ")}${tclash.length>8?" …":""}`); return; }
    const { data, error } = await supabase.from("rooms").insert(entries).select();
    if (error) { showAlert("error", roomWriteError(error.message)); return; }
    setRooms(prev => [...prev, ...(data as Room[])].sort((a,b) => (parseInt(a.floor)||0)-(parseInt(b.floor)||0)||(parseInt(a.number)||0)-(parseInt(b.number)||0)));
    setTplFloors(""); setTplRoomsPerFloor(""); setTplStartNum(""); setTplFloorStart(""); setTplCap(""); setShowAddRoom(false);
    showAlert("success", `تمت إضافة ${entries.length} غرفة`);
  };

  const removeFromRoom = async (pId: number) => {
    if (!assertWritable()) return;
    if (!await writeOk(supabase.from("passengers").update({ room_id: null }).eq("id", pId), "تعذر إخراج الحاج من الغرفة")) return;
    setPassengers(prev => prev.map(p => p.id === pId ? { ...p, room_id: null } : p));
    showAlert("success", "تمت الإزالة من الغرفة"); setTimeout(() => showAlert(null), 2000);
  };

  /* الإسناد: فحصٌ في الواجهة **وحارسٌ في القاعدة**. الأول يمنع
     الضغطة، والثاني يمنع ما تفلت منه — حالةٌ قديمة في المتصفّح، أو
     موظّفان على السرير الأخير معاً. */
  const assignToRoom = async (pId: number, room: Room) => {
    if (!assertWritable()) return false;
    if (roomFull(room)) {
      const cap = capOf(room);
      showAlert("error", cap === 0 ? `الغرفة ${room.number} من نوع «${room.type}» ولا تستقبل نزلاء`
        : cap == null ? `الغرفة ${room.number} بلا سعة محدّدة — حدّد سعتها أولاً`
        : `الغرفة ${room.number} مكتملة (${roomPassengers(room.id).length}/${cap})`);
      return false;
    }
    if (!await writeOk(supabase.from("passengers").update({ room_id: room.id }).eq("id", pId), "تعذر إضافة الحاج إلى الغرفة")) return false;
    setPassengers(prev => prev.map(p => p.id === pId ? { ...p, room_id: room.id } : p));
    return true;
  };

  const addToRoom = async (pId: number) => {
    if (!selectedRoom) return;
    if (await assignToRoom(pId, selectedRoom)) setPSearch("");
  };

  /* النقل المباشر: عمليةٌ واحدة تكتب `room_id` وحده. كان الموظّف
     يُخرج من الأولى ثم يبحث عن الثانية، فيمرّ الحاجّ بحالة «بلا
     غرفة» بينهما. والخدمة المطلوبة لا تُمَسّ في أيّ من المسارين. */
  const moveToRoom = async (p: Passenger, dest: Room) => {
    if (dest.id === p.room_id) return;
    if (await assignToRoom(p.id, dest)) {
      setMoveFor(null); setMoveSearch("");
      showAlert("success", `تم نقل ${p.short_ar || makeShort(p.name_ar)} إلى الغرفة ${dest.number}`);
      setTimeout(() => showAlert(null), 2500);
    }
  };

  const reorderRoom = async (roomId: number, fromId: number, toId: number) => {
    if (fromId === toId) return;
    const list = roomPassengers(roomId);
    const from = list.findIndex(p => p.id === fromId);
    const to   = list.findIndex(p => p.id === toId);
    if (from === -1 || to === -1) return;
    const next = [...list];
    next.splice(to, 0, ...next.splice(from, 1));
    setPassengers(prev => applyReorder(prev, "room_sort_order", next));
    await writeAllOk(reorderUpdates("room_sort_order", next), "تعذّر حفظ ترتيب الغرفة");
  };

  const deleteRoom = async (room: Room) => {
    if (!assertWritable()) return;
    const occ = roomPassengers(room.id);
    if (occ.length > 0) { showAlert("error", "لا يمكن حذف غرفة بها نزلاء"); return; }
    if (!await writeOk(supabase.from("rooms").delete().eq("id", room.id), "تعذر حذف الغرفة")) return;
    setRooms(prev => prev.filter(r => r.id !== room.id));
    setSelectedRoom(null);
    showAlert("success", "تم حذف الغرفة"); setTimeout(() => showAlert(null), 2500);
  };

  /* تغيير النوع/السعة لا ينزل تحت عدد الساكنين. كانت رباعيةٌ فيها
     أربعة تصير فرديّة بضغطة، فتُقرأ ٤/١ بلا أن يُخرَج أحد. */
  const saveRoomCapacity = async (type: Room["type"], rawCap: string) => {
    if (!selectedRoom || !assertWritable()) return;
    const occ = roomPassengers(selectedRoom.id).length;
    const nextCap = isFixedCapType(type) ? ROOM_TYPE_CAP_UI[type] : parseInt(rawCap, 10);
    if (!isFixedCapType(type) && !(nextCap > 0)) { showAlert("error", "غرفة «خاص» تحتاج سعة صريحة أكبر من صفر"); return; }
    if (nextCap < occ) {
      showAlert("error", `الغرفة تضمّ ${occ} نزيلاً، فلا تُخفَّض سعتها إلى ${nextCap}. أخرِج النزلاء أولاً.`);
      return;
    }
    const payload = { type, capacity: isFixedCapType(type) ? null : nextCap };
    const { error } = await supabase.from("rooms").update(payload).eq("id", selectedRoom.id).select();
    if (error) { showAlert("error", error.message || "تعذر تعديل نوع الغرفة"); return; }
    /* القاعدة تفرض سعة النوع القياسيّ، فتُقرأ منها لا تُخمَّن */
    const applied = isFixedCapType(type) ? ROOM_TYPE_CAP_UI[type] : nextCap;
    setPanelType(type); setPanelCap(String(applied));
    setRooms(prev => prev.map(r => r.id === selectedRoom.id ? { ...r, type, capacity: applied } : r));
    setSelectedRoom(prev => prev ? { ...prev, type, capacity: applied } : prev);
    showAlert("success", "تم تحديث الغرفة"); setTimeout(() => showAlert(null), 2000);
  };
  const saveRoomType = (type: Room["type"]) => saveRoomCapacity(type, panelCap);

  const saveNotes = async () => {
    if (!selectedRoom) return;
    if (!await writeOk(supabase.from("rooms").update({ notes: panelNotes || null }).eq("id", selectedRoom.id), "تعذر حفظ الملاحظات")) return;
    setRooms(prev => prev.map(r => r.id === selectedRoom.id ? { ...r, notes: panelNotes || null } : r));
    showAlert("success", "تم حفظ الملاحظات"); setTimeout(() => showAlert(null), 2500);
  };

  const saveRoomNumber = async () => {
    if (!selectedRoom || !newRoomNum.trim()) return;
    if (takenNumber(selectedRoom.floor, newRoomNum.trim(), selectedRoom.id)) {
      showAlert("error", `الغرفة ${newRoomNum.trim()} موجودة في الدور ${selectedRoom.floor} بالفعل`);
      return;
    }
    if (!await writeOk(supabase.from("rooms").update({ number: newRoomNum.trim() }).eq("id", selectedRoom.id), "تعذر تعديل رقم الغرفة — قد يكون الرقم مستخدماً في هذا الدور")) return;
    setRooms(prev => prev.map(r => r.id === selectedRoom.id ? { ...r, number: newRoomNum.trim() } : r).sort((a,b) => (parseInt(a.floor)||0)-(parseInt(b.floor)||0)||(parseInt(a.number)||0)-(parseInt(b.number)||0)));
    setSelectedRoom(prev => prev ? { ...prev, number: newRoomNum.trim() } : prev);
    setEditingRoomNum(false);
    showAlert("success", "تم تعديل رقم الغرفة"); setTimeout(() => showAlert(null), 2500);
  };

  const openPanel = (room: Room) => {
    setSelectedRoom(room);
    setPanelType(room.type);
    setPanelCap(String(capOf(room) ?? ""));
    setPanelNotes(room.notes || "");
    setMoveFor(null); setMoveSearch("");
    setShowAddPilgrim(false);
    setPSearch("");
    setEditingRoomNum(false);
    setEditingType(false);
    setNewRoomNum(room.number);
  };

  // Styles
  const inp = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line)", fontFamily: "var(--font-body)", fontSize: 13, outline: "none" };
  const btnP = { padding: "8px 16px", borderRadius: 8, border: "none", background: primary, color: "#fff", fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, cursor: "pointer" };
  const btnS = { padding: "8px 16px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink)", fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, cursor: "pointer" };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <AlertModal alert={alert} onClose={() => showAlert(null)} />

      {/* ===== المحتوى الرئيسي ===== */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

        {/* كروت KPI — موحّدة مع باقي الصفحات */}
        <StatsRow cards={hotelCards} />

        {/* الموسم المعروض للقراءة: الأزرار باهتة، وهذا سببها */}
        {readOnly && (
          <div style={{ margin: "0 12px", padding: "7px 12px", borderRadius: 9, background: "var(--warning-bg)", border: "1px solid var(--warning)", color: "var(--warning)", fontSize: 11, fontWeight: 800, flexShrink: 0, display: "flex", alignItems: "center", gap: 7 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            موسم مؤرشَف — للعرض فقط. التسكين والتعديل معطّلان.
          </div>
        )}

        {/* Row 1: كروت أنواع الغرف + بحث + فلتر + إضافة */}
        <div style={{ display: "flex", gap: 6, padding: "8px 12px 0", flexShrink: 0, alignItems: "center", flexWrap: "wrap" }}>
          {/* كروت الأنواع */}
          {ROOM_TYPES.map(type => {
            const typeRooms = rooms.filter(r => r.type === type);
            if (typeRooms.length === 0) return null;
            const TYPE_COLORS: Record<string,string> = { فردية:"#7D1F3C",ثنائية:"#0C5FA8",ثلاثية:"#2A9D8F",رباعية:"#E65100",خاص:"#6A0DAD",مجلس:"#3F51B5" };
            const color = TYPE_COLORS[type] || primary;
            const active = filterType === type;
            return (
              <div key={type} onClick={() => { setFilterType(active ? null : type); setFilterFloor("الكل"); }}
                style={{ display:"flex",alignItems:"center",gap:6,background: active ? color : "var(--paper)",border: active ? `1.5px solid ${color}` : `1px solid ${color}30`,borderRadius:8,padding:"5px 10px",flexShrink:0,cursor:"pointer",transition:"all .15s",borderRight:`3px solid ${color}` }}>
                <div style={{ fontSize:9,color: active?"white":"var(--muted)",fontWeight:600 }}>{type}</div>
                <div style={{ fontSize:13,fontWeight:900,color: active?"white":color,lineHeight:1.1 }}>{typeRooms.length}</div>
              </div>
            );
          })}
          <div style={{ flex:1 }} />
          {/* بحث */}
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث..." style={{ ...inp, width:130, flex:"none" }} />
          {/* فلتر الحالة */}
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inp, width:"auto" }}>
            {["الكل","جاهزة","قيد التسكين","مكتملة","تجاوز","مجلس"].map(s => <option key={s}>{s}</option>)}
          </select>
          {/* إضافة */}
          <button disabled={readOnly} onClick={() => setShowAddRoom(true)} style={{ ...btnP, ...roOff, display:"flex",alignItems:"center",gap:5,flexShrink:0 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            غرفة جديدة
          </button>
        </div>

        {/* Row 2: أزرار الأدوار */}
        {/* شريط الأدوار: كان `scrollbarWidth:"none"` يُخفي شريط
            التمرير كلَّه، فلا يعرف الموظّف على شاشة ١٣٦٦ أن بعد
            «ط١٣» أدواراً. والإشغال على كل زرّ يقول أين العمل. */}
        <div style={{ display:"flex",gap:4,padding:"6px 12px 2px",flexShrink:0,overflowX:"auto",scrollbarWidth:"thin" }}>
          <button onClick={() => setFilterFloor("الكل")}
            style={{ padding:"4px 12px",borderRadius:99,border: filterFloor==="الكل"?"1.5px solid var(--primary)":"1.5px solid var(--line)",background: filterFloor==="الكل"?"var(--primary)":"var(--paper)",color: filterFloor==="الكل"?"white":"var(--muted)",fontFamily:"var(--font-body)",fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0,transition:"all .15s" }}>
            الكل
          </button>
          {floors.map(f => {
            const fr = rooms.filter(r => r.floor === f);
            const beds = fr.reduce((n, r) => n + (capOf(r) ?? 0), 0);
            const used = fr.reduce((n, r) => n + (capOf(r) ? roomPassengers(r.id).length : 0), 0);
            const on = filterFloor === f;
            return (
              <button key={f} onClick={() => setFilterFloor(f)} title={`الدور ${f} — ${used} من ${beds} سرير`}
                style={{ padding:"3px 11px",borderRadius:99,border: on?"1.5px solid var(--primary)":"1.5px solid var(--line)",background: on?"var(--primary)":"var(--paper)",color: on?"white":"var(--muted)",fontFamily:"var(--font-body)",fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0,transition:"all .15s",display:"flex",flexDirection:"column",alignItems:"center",lineHeight:1.25 }}>
                <span>ط{f}</span>
                {beds > 0 && <span style={{ fontSize:8.5,fontWeight:800,opacity: on?.85:.7 }} dir="ltr">{used}/{beds}</span>}
              </button>
            );
          })}
        </div>

        {/* Rooms Grid */}
        <div ref={gridRef} style={{ flex: 1, overflowY: "auto", padding: "0 12px 12px" }}>
          {roomsLoading && <div style={{ textAlign: "center", padding: "3rem", color: "var(--muted)", fontSize: 12 }}>جاري التحميل...</div>}
          {!roomsLoading && roomsError && (
            <div style={{ textAlign: "center", padding: "3rem", color: "var(--danger)", fontWeight: 700, fontSize: 13 }}>
              تعذر تحميل الغرف — يرجى التحقق من الاتصال وتحديث الصفحة
            </div>
          )}
          {!roomsLoading && !roomsError && floors.filter(f => filterFloor === "الكل" || f === filterFloor).map(floor => {
            const floorRooms = filteredRooms.filter(r => r.floor === floor);
            if (floorRooms.length === 0) return null;
            return (
              <div key={floor} style={{ marginBottom: 16 }}>
                {/* عنوان الدور — كان غائباً تماماً، فتُقرأ عشرون
                    طابقاً شريطاً واحداً بلا فاصل في عرض «الكل». */}
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "10px 2px 6px", position: "sticky", top: 0, background: "var(--bg, var(--paper))", zIndex: 3 }}>
                  <span style={{ fontSize: 13, fontWeight: 900, color: "var(--ink)" }}>الدور {floor}</span>
                  <span style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 700 }}>
                    {floorRooms.length} غرفة
                    {(() => {
                      const beds = floorRooms.reduce((n, r) => n + (capOf(r) ?? 0), 0);
                      const used = floorRooms.reduce((n, r) => n + (capOf(r) ? roomPassengers(r.id).length : 0), 0);
                      return beds > 0 ? <> · <span dir="ltr">{used}/{beds}</span> سرير</> : null;
                    })()}
                  </span>
                  <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
                </div>
                {/* شبكة متجاوبة: كانت `repeat(4,1fr)` ثابتة — أربعة
                    أعمدة ضيّقة على ١٣٦٦ وأربعة عريضة على شاشةٍ كبيرة
                    مع فراغٍ مهدور، و١٥٠ غرفة تصير ٣٨ صفّاً. */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 8 }}>
                  {floorRooms.map(room => {
                    const occ = roomPassengers(room.id);
                    const cap = capOf(room) ?? 0;
                    const status = getStatus(room);
                    const over = status === "تجاوز";
                    const color = statusColor[status] || primary;
                    const isSelected = selectedRoom?.id === room.id;
                    const isMajlis = room.type === "مجلس";

                    const visibleOcc = occ.slice(0, 2);
                    const extraCount = occ.length - 2;
                    const isExpanded = expandedCardId === room.id;
                    const isHovered = hoveredCardId === room.id;
                    const isEmpty = occ.length === 0 && !isMajlis;

                    return (
                      <div key={room.id} style={{ position: "relative" }}>
                        {/* Tooltip عند الـ hover */}
                        {/* التلميح كان يفتح لأعلى دائماً، فبطاقاتُ الصفّ
                            الأول تختفي تحت شريط البحث والفلاتر. الآن
                            يقيس الموضع: إن ضاق ما فوق البطاقة فُتح
                            أسفلها. و`zIndex` أعلى من الأشرطة اللاصقة. */}
                        {isHovered && !isSelected && (
                          <div style={{ position: "absolute", ...(tipBelow ? { top: "calc(100% + 8px)" } : { bottom: "calc(100% + 8px)" }), right: "50%", transform: "translateX(50%)", zIndex: 60, background: "var(--ink)", color: "white", borderRadius: 10, padding: "8px 12px", minWidth: 140, boxShadow: "0 4px 16px rgba(0,0,0,.25)", pointerEvents: "none" }}>
                            <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 4 }}>{room.number}</div>
                            {occ.map(p => (
                              <div key={p.id} style={{ fontSize: 11, fontWeight: 600, opacity: .85, marginBottom: 1 }}>{p.short_ar || makeShort(p.name_ar)}</div>
                            ))}
                            {isEmpty && <div style={{ fontSize: 11, opacity: .7 }}>لا يوجد حجاج</div>}
                            <div style={{ fontSize: 10, opacity: .6, marginTop: 4, borderTop: "1px solid rgba(255,255,255,.15)", paddingTop: 4 }}>الدور {room.floor}</div>
                            {/* سهم صغير في الأسفل */}
                            <div style={{ position: "absolute", ...(tipBelow ? { top: -6 } : { bottom: -6 }), right: "50%", transform: "translateX(50%)", width: 10, height: 10, background: "var(--ink)", clipPath: tipBelow ? "polygon(50% 0,100% 100%,0 100%)" : "polygon(0 0,100% 0,50% 100%)" }} />
                          </div>
                        )}

                        {/* الكارت */}
                        <div onClick={() => openPanel(room)}
                          onMouseEnter={e => {
                            /* المساحة المتاحة فوق البطاقة داخل منطقة
                               التمرير: أقلّ من ارتفاع التلميح تقريباً
                               يعني أنه سيُقصّ، فيُفتح أسفلها. */
                            const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                            const top = gridRef.current?.getBoundingClientRect().top ?? 0;
                            setTipBelow(r.top - top < 150);
                            setHoveredCardId(room.id);
                          }}
                          onMouseLeave={() => setHoveredCardId(null)}
                          style={{
                            background: status === "مكتملة" ? "#f3f4f6" : "var(--paper)", borderRadius: 12, cursor: "pointer",
                            transition: "all .18s", position: "relative", height: 130,
                            display: "flex", flexDirection: "column", overflow: "hidden",
                            border: isSelected ? `2.5px solid var(--primary)` : "1px solid var(--line)",
                            boxShadow: isSelected ? `0 4px 16px rgba(125,31,60,.25)` : isHovered ? "0 4px 14px rgba(0,0,0,.1)" : "0 1px 4px rgba(0,0,0,.06)",
                            transform: isSelected || isHovered ? "translateY(-2px)" : "none",
                            opacity: status === "مكتملة" ? 0.82 : 1,
                          }}>
                          {/* شريط ملون في الأعلى */}
                          <div style={{ height: 4, background: color, flexShrink: 0 }} />

                          {/* المحتوى */}
                          <div style={{ padding: "7px 9px", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                            {/* سطر: رقم + نوع + حالة */}
                            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 5, flexWrap: "nowrap" }}>
                              <span style={{ fontSize: 18, fontWeight: 900, color, lineHeight: 1, flexShrink: 0 }}>{room.number}</span>
                              {!isMajlis && <>
                                <span style={{ fontSize: 9, color: "var(--muted)", fontWeight: 700, flexShrink: 0 }}>{room.type}</span>
                                <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 5px", borderRadius: 99, background: `${color}15`, color, flexShrink: 0, whiteSpace: "nowrap" }}>
                                  {over ? `⚠️ تجاوز ${occ.length}/${cap}` : status}
                                </span>
                              </>}
                              {isMajlis && <span style={{ fontSize: 9, color: "#7c3aed", fontWeight: 700 }}>مجلس</span>}
                            </div>

                            {/* أسماء أو زرار إضافة أو مجلس */}
                            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, minHeight: 0 }}>
                              {isMajlis ? (
                                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                  <div style={{ textAlign: "center", color: "#7C3AED", opacity: .6 }}>
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                                    <div style={{ fontSize: 10, fontWeight: 700, marginTop: 3 }}>مجلس الحجاج</div>
                                  </div>
                                </div>
                              ) : isEmpty ? (
                                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 4, color, fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 8, border: `1px dashed ${color}60`, background: `${color}06` }}>
                                    <span style={{ fontSize: 14 }}>＋</span> إضافة حاج
                                  </div>
                                </div>
                              ) : (
                                <>
                                  {visibleOcc.map(p => (
                                    <div key={p.id} style={{ fontSize: 11, color: "var(--ink)", fontWeight: 600, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 3 }}>
                                      <div style={{ width: 3, height: 3, borderRadius: "50%", background: color, flexShrink: 0 }} />
                                      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{p.short_ar || makeShort(p.name_ar)}</span>
                                    </div>
                                  ))}
                                  {extraCount > 0 && (
                                    <div onClick={e => { e.stopPropagation(); setExpandedCardId(isExpanded ? null : room.id); }}
                                      style={{ fontSize: 10, fontWeight: 800, color, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 2, padding: "1px 6px", borderRadius: 99, background: `${color}12`, width: "fit-content" }}>
                                      {isExpanded ? "▲ أقل" : `+${extraCount}`}
                                    </div>
                                  )}
                                  {isExpanded && occ.slice(2).map(p => (
                                    <div key={p.id} style={{ fontSize: 10, color: "var(--ink)", fontWeight: 600, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 3 }}>
                                      <div style={{ width: 3, height: 3, borderRadius: "50%", background: color, flexShrink: 0 }} />
                                      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{p.short_ar || makeShort(p.name_ar)}</span>
                                    </div>
                                  ))}
                                </>
                              )}
                            </div>

                            {/* شريط الإشغال */}
                            {!isMajlis && (
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                                <div style={{ flex: 1, height: 3, borderRadius: 99, background: `${color}15`, overflow: "hidden" }}>
                                  <div style={{ height: "100%", borderRadius: 99, background: color, width: `${cap ? Math.min(100,(occ.length/cap)*100) : 0}%`, transition: "width .3s" }} />
                                </div>
                                {/* الشريط يمتلئ عند ١٠٠٪ فيبتلع التجاوز:
                                    ٣/٢ تبدو ٢/٢. فالرقم يقولها والوسم
                                    يؤكّدها بدل أن تمرّ بصمت. */}
                                <span style={{ fontSize: 9, fontWeight: 800, color, flexShrink: 0 }} dir="ltr">{occ.length}/{capOf(room) ?? "—"}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ===== Side Panel ===== */}
      {selectedRoom && (
        <div style={{ width: 272, flexShrink: 0, background: "var(--paper)", borderRight: "1px solid var(--line)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* ═══ ترويسة ملفّ الغرفة ═══
              ألوانها من **متغيّرات السمة** لا من `primaryColor` الخاصّ
              بهوية الشركة: الأول يتبدّل مع السمة المختارة (`data-theme`
              — أربع سمات) والثاني ثابتٌ في القاعدة. فكانت الترويسة تبقى
              نبيتيّةً بعد تبديل السمة بينما تتبدّل بقيّة الصفحة. والنمط
              نمطُ ترويسة «يحتاج انتباهك» في الداشبورد. والأسطح الشفيفة
              على `--text-inverse` فتنقلب معه، والمصمتة على `--paper`
              فتُقرأ في الداكنة كما في الفاتحة.
              أرضيّة ملوّنة تفصل هوية الغرفة عن محتواها — كان الأعلى
              أبيضَ كبقيّة اللوحة فيُقرأ إعداداتٍ لا هويّة. والنوع
              صعد إلى هنا: يُقرأ فوراً، ويُحرَّر بضغطةٍ لا بكتلةٍ
              من ستّة أزرار تسكن تحت النزلاء. */}
          {(() => {
            const st = getStatus(selectedRoom);
            const cap = capOf(selectedRoom);
            const b = occBreakdown(selectedRoom.id);
            const pctFill = cap ? Math.min(100, (b.total / cap) * 100) : 0;
            return (
              <div style={{ background: "linear-gradient(150deg, var(--primary), var(--primary-dark, var(--primary)))", color: "var(--text-inverse)", padding: "12px 14px 11px", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {editingRoomNum ? (
                        <>
                          <input value={newRoomNum} onChange={e => setNewRoomNum(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") saveRoomNumber(); if (e.key === "Escape") setEditingRoomNum(false); }}
                            style={{ width: 78, fontSize: 17, fontWeight: 900, color: "var(--text-inverse)", border: "none", borderBottom: "2px solid color-mix(in srgb, var(--text-inverse) 60%, transparent)", outline: "none", background: "transparent", fontFamily: "var(--font-body)", textAlign: "right" }}
                            autoFocus />
                          <button onClick={saveRoomNumber} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, border: "none", background: "var(--paper)", color: "var(--primary)", cursor: "pointer", fontFamily: "var(--font-body)", fontWeight: 800 }}>حفظ</button>
                          <button onClick={() => setEditingRoomNum(false)} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, border: "1px solid color-mix(in srgb, var(--text-inverse) 35%, transparent)", background: "transparent", color: "var(--text-inverse)", cursor: "pointer", fontFamily: "var(--font-body)" }}>إلغاء</button>
                        </>
                      ) : (
                        <>
                          <span style={{ fontSize: 21, fontWeight: 900, lineHeight: 1.1 }}>غرفة {selectedRoom.number}</span>
                          <button disabled={readOnly} onClick={() => { setEditingRoomNum(true); setNewRoomNum(selectedRoom.number); }} title="تعديل رقم الغرفة"
                            style={{ ...roOff, width: 20, height: 20, borderRadius: 5, border: "1px solid color-mix(in srgb, var(--text-inverse) 30%, transparent)", background: "color-mix(in srgb, var(--text-inverse) 12%, transparent)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-inverse)", flexShrink: 0 }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                          </button>
                        </>
                      )}
                    </div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, opacity: .8, marginTop: 3 }}>الطابق {selectedRoom.floor}</div>
                  </div>
                  <button onClick={() => setSelectedRoom(null)} title="إغلاق"
                    style={{ width: 24, height: 24, borderRadius: 7, border: "1px solid color-mix(in srgb, var(--text-inverse) 30%, transparent)", background: "color-mix(in srgb, var(--text-inverse) 12%, transparent)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "var(--text-inverse)", flexShrink: 0, lineHeight: 1 }}>×</button>
                </div>

                {/* النوع + الحالة */}
                <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 7 }}>
                  <button disabled={readOnly} onClick={() => setEditingType(v => !v)} title="تغيير نوع الغرفة"
                    style={{ ...roOff, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 900, padding: "3px 9px", borderRadius: 99, border: "1px solid color-mix(in srgb, var(--text-inverse) 35%, transparent)", background: editingType ? "var(--paper)" : "color-mix(in srgb, var(--text-inverse) 14%, transparent)", color: editingType ? "var(--primary)" : "var(--text-inverse)", cursor: "pointer", fontFamily: "var(--font-body)" }}>
                    {selectedRoom.type}
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  <span style={{ fontSize: 10, fontWeight: 900, padding: "3px 9px", borderRadius: 99, background: "var(--paper)", color: statusToken[st], whiteSpace: "nowrap" }}>{statusLabel[st]}</span>
                  {b.admins > 0 && <span style={{ fontSize: 9.5, fontWeight: 800, opacity: .85 }}>{b.hajj} حاج + {b.admins} إداري</span>}
                </div>

                {/* اختيار النوع — يظهر عند الطلب فقط */}
                {editingType && !readOnly && (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8, padding: "7px 8px", borderRadius: 9, background: "color-mix(in srgb, var(--ink) 18%, transparent)" }}>
                    {ROOM_TYPES.map(t => (
                      <button key={t} onClick={() => { saveRoomType(t); if (isFixedCapType(t)) setEditingType(false); }}
                        style={{ padding: "3px 8px", borderRadius: 99, border: "1px solid", borderColor: panelType === t ? "transparent" : "color-mix(in srgb, var(--text-inverse) 30%, transparent)", background: panelType === t ? "var(--paper)" : "transparent", color: panelType === t ? "var(--primary)" : "var(--text-inverse)", fontSize: 10, fontWeight: 800, cursor: "pointer", fontFamily: "var(--font-body)" }}>{t}</button>
                    ))}
                    {!isFixedCapType(panelType) && (
                      <div style={{ display: "flex", alignItems: "center", gap: 5, width: "100%", marginTop: 5 }}>
                        <span style={{ fontSize: 9.5, fontWeight: 800, opacity: .85, flexShrink: 0 }}>السعة</span>
                        <input value={panelCap} onChange={e => setPanelCap(e.target.value.replace(/\D/g, ""))} inputMode="numeric"
                          style={{ width: 56, padding: "3px 7px", borderRadius: 6, border: "1px solid color-mix(in srgb, var(--text-inverse) 35%, transparent)", background: "var(--paper)", color: "var(--ink)", fontSize: 11, fontFamily: "var(--font-body)", outline: "none" }} />
                        <button onClick={() => { saveRoomCapacity(panelType, panelCap); setEditingType(false); }}
                          style={{ padding: "3px 10px", borderRadius: 6, border: "none", background: "var(--paper)", color: "var(--primary)", fontSize: 10, fontWeight: 900, cursor: "pointer", fontFamily: "var(--font-body)" }}>حفظ</button>
                      </div>
                    )}
                  </div>
                )}

                {/* الإشغال */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, height: 5, borderRadius: 99, background: "color-mix(in srgb, var(--ink) 25%, transparent)", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 99, background: st === "تجاوز" ? "var(--danger-bg)" : "var(--paper)", width: `${pctFill}%`, transition: "width .3s" }} />
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 900, flexShrink: 0 }} dir="ltr">{b.total}/{cap ?? "—"}</span>
                </div>

                {st === "تجاوز" && (
                  <div style={{ fontSize: 9.5, fontWeight: 800, background: "color-mix(in srgb, var(--ink) 28%, transparent)", borderRadius: 7, padding: "5px 8px", marginTop: 7, lineHeight: 1.55 }}>
                    عدد النزلاء يتجاوز سعة الغرفة. لن يُقبل نزيلٌ جديد — أخرِج أو انقل نزيلاً لتسوية الوضع.
                  </div>
                )}
                {cap == null && (
                  <div style={{ fontSize: 9.5, fontWeight: 800, background: "color-mix(in srgb, var(--ink) 28%, transparent)", borderRadius: 7, padding: "5px 8px", marginTop: 7, lineHeight: 1.55 }}>
                    سعة هذه الغرفة غير محدّدة — حدّدها من النوع أعلاه قبل التسكين.
                  </div>
                )}
              </div>
            );
          })()}

          {/* Body */}
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: ".05em", marginBottom: 8 }}>النزلاء الموجودون <span style={{ fontWeight: 500, letterSpacing: 0 }}>— اسحب لإعادة الترتيب</span></div>
            {roomPassengers(selectedRoom.id).length === 0 ? (
              <div style={{ textAlign: "center", padding: "16px 0", color: "var(--muted)", fontSize: 12 }}>لا يوجد نزلاء في هذه الغرفة</div>
            ) : (
              roomPassengers(selectedRoom.id).map((p, i) => {
                /* أقارب هذا النزيل ممّن لا غرفة لهم — رقمٌ مضغوط
                   يقود إلى قائمة الإضافة، لا أسماء تُزاحم الصفّ. */
                const kinFree = p.family_id ? unassigned.filter(x => x.family_id === p.family_id && x.id !== p.id).length : 0;
                const want = isHajj(p) ? (p.services?.hotel_type || "").trim() : "";
                return (
                <div key={p.id}
                  draggable={!readOnly}
                  onDragStart={() => setDragId(p.id)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => { if (dragId) reorderRoom(selectedRoom.id, dragId, p.id); setDragId(null); }}
                  onDragEnd={() => setDragId(null)}
                  style={{ display: "flex", alignItems: "flex-start", gap: 7, padding: "7px 9px", borderRadius: 9, border: "1px solid var(--line)", marginBottom: 5, background: "var(--ivory)", cursor: readOnly ? "default" : "grab", opacity: dragId === p.id ? 0.5 : 1 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", width: 12, flexShrink: 0, marginTop: 2 }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 5, minWidth: 0, flexWrap: "wrap" }}>
                      {/* الاسم المختصر **كاملاً**: كان يُقصّ بـ«…»
                          فيُقرأ «ضيضان سالم المر…». يلتفّ إلى سطرٍ
                          ثانٍ عند الحاجة ولا يُبتر. وعند غياب
                          `short_ar` يُشتقّ مختصرٌ لا يُعرض الاسم
                          القانونيّ الكامل. */}
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", lineHeight: 1.4, wordBreak: "break-word" }}>{p.short_ar || makeShort(p.name_ar)}</span>
                      {!isHajj(p) && <span style={{ fontSize: 9, fontWeight: 800, padding: "1px 6px", borderRadius: 99, background: "var(--warning-bg)", color: "var(--warning)", flexShrink: 0 }}>{p.passenger_type}</span>}
                    </div>
                    {/* رقم الجواز خرج من هنا: لا يخدم قرار التسكين
                        ويأكل سطراً. مكانه ما يخدمه — الخدمة المطلوبة
                        وأقاربُ بلا غرفة. */}
                    <div style={{ fontSize: 9.5, color: "var(--muted)", fontWeight: 700, marginTop: 1, display: "flex", gap: 5, flexWrap: "wrap" }}>
                      {want && <span>المطلوب: {want}</span>}
                      {kinFree > 0 && <span style={{ color: "var(--primary)" }}>أسرة · {kinFree} بدون غرفة</span>}
                      {!want && kinFree === 0 && <span>—</span>}
                    </div>
                  </div>
                  <button disabled={readOnly} onClick={() => { setMoveFor(p); setMoveSearch(""); }} title="نقل إلى غرفة أخرى"
                    style={{ ...roOff, padding: "3px 8px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--paper)", color: "var(--primary)", cursor: "pointer", fontSize: 9.5, fontWeight: 800, fontFamily: "var(--font-body)", flexShrink: 0 }}>نقل</button>
                  <button disabled={readOnly} onClick={() => removeFromRoom(p.id)} title="إزالة من الغرفة"
                    style={{ ...roOff, width: 24, height: 24, borderRadius: 6, border: "1px solid #fce8e8", background: "#fff0f0", color: "#C62828", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>×</button>
                </div>
                );
              })
            )}

            {/* ═══ لوحة النقل ═══ */}
            {moveFor && (() => {
              const q = moveSearch.trim();
              const dests = rooms.filter(r => r.id !== selectedRoom.id && !roomFull(r) && (!q || r.number.includes(q) || r.floor.includes(q)));
              return (
                <div style={{ border: `1.5px solid ${primary}`, borderRadius: 10, padding: 8, marginBottom: 8, background: "var(--paper)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "var(--ink)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>نقل {moveFor.short_ar || makeShort(moveFor.name_ar)} إلى</span>
                    <button onClick={() => setMoveFor(null)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--muted)", fontSize: 15, lineHeight: 1 }}>×</button>
                  </div>
                  <input value={moveSearch} onChange={e => setMoveSearch(e.target.value)} placeholder="رقم الغرفة أو الدور..." style={{ ...inp, fontSize: 11, padding: "6px 9px", marginBottom: 6 }} />
                  {/* الوجهات الممتلئة والمجالس لا تُعرض أصلاً: القائمة
                      لا تعرض ما سيُرفض. والقاعدة تحرس ما تفلت منه. */}
                  <div style={{ maxHeight: 168, overflowY: "auto" }}>
                    {dests.length === 0 ? (
                      <div style={{ padding: "10px", textAlign: "center", color: "var(--muted)", fontSize: 11 }}>لا توجد غرفة فيها متّسع</div>
                    ) : dests.slice(0, 40).map(r => (
                      <div key={r.id} onClick={() => moveToRoom(moveFor, r)}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", borderRadius: 7, cursor: "pointer", borderBottom: "1px solid var(--ivory)" }}
                        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "var(--ivory)"}
                        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = ""}>
                        <span style={{ fontSize: 12, fontWeight: 900, color: primary, flexShrink: 0 }}>{r.number}</span>
                        <span style={{ fontSize: 9.5, color: "var(--muted)", fontWeight: 700, flex: 1, minWidth: 0 }}>ط{r.floor} · {r.type}</span>
                        <span style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)" }} dir="ltr">{roomPassengers(r.id).length}/{capOf(r)}</span>
                      </div>
                    ))}
                    {dests.length > 40 && <div style={{ padding: "6px", textAlign: "center", color: "var(--muted)", fontSize: 9.5 }}>يُعرض ٤٠ من {dests.length} — ابحث لتضييق النتائج</div>}
                  </div>
                </div>
              );
            })()}

            {/* إضافة حاج */}
            {selectedRoom.type !== "مجلس" && <button disabled={readOnly} onClick={() => setShowAddPilgrim(!showAddPilgrim)}
              style={{ ...roOff, width: "100%", padding: "9px", borderRadius: 9, border: `1.5px dashed var(--line)`, background: "transparent", color: primary, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 4, transition: "all .15s" }}>
              + إضافة نزيل للغرفة
            </button>}

            {showAddPilgrim && (() => {
              const q = pSearch.trim();
              const match = (x: Passenger) => !q || (x.name_ar || "").includes(q) || (x.short_ar || "").includes(q) || (x.passport || "").includes(q);
              const pool = unassigned.filter(match);
              /* أقارب الساكنين أولاً: تسكينُ الأسرة معاً هو القيد
                 الأول في العمل اليوميّ، وكان يتطلّب تذكّر الأسماء.
                 لا اختيار تلقائيّ ولا إسناد — ترتيبُ عرضٍ فقط. */
              const famIds = new Set(roomPassengers(selectedRoom.id).map(o => o.family_id).filter(Boolean) as string[]);
              const kin = pool.filter(x => x.family_id && famIds.has(x.family_id));
              const rest = pool.filter(x => !(x.family_id && famIds.has(x.family_id)));
              const CAP = 25;
              const full = roomFull(selectedRoom);

              const row = (x: Passenger) => (
                <div key={x.id} onClick={() => { if (!full) addToRoom(x.id); }}
                  style={{ padding: "7px 11px", cursor: full ? "not-allowed" : "pointer", opacity: full ? .5 : 1, borderBottom: "1px solid var(--ivory)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}
                  onMouseEnter={e => { if (!full) (e.currentTarget as HTMLDivElement).style.background = "var(--ivory)"; }}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = ""}>
                  <span style={{ fontSize: 12, color: "var(--ink)", fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.short_ar || makeShort(x.name_ar)}</span>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    {isHajj(x) && x.services?.hotel_type && <span style={{ fontSize: 9, fontWeight: 700, color: "#7c3aed", background: "rgba(124,58,237,.1)", padding: "1px 5px", borderRadius: 99 }}>{x.services.hotel_type}</span>}
                    {isHajj(x) && x.services?.hotel_view === "مطلة" && <span style={{ fontSize: 9, fontWeight: 700, color: "#0284c7", background: "rgba(2,132,199,.1)", padding: "1px 5px", borderRadius: 99 }}>مطل</span>}
                    {!isHajj(x) && <span style={{ fontSize: 9, fontWeight: 800, color: "var(--warning)", background: "var(--warning-bg)", padding: "1px 5px", borderRadius: 99 }}>{x.passenger_type}</span>}
                  </div>
                </div>
              );
              const head = (t: string) => (
                <div style={{ padding: "5px 11px", fontSize: 9.5, fontWeight: 800, color: "var(--muted)", background: "var(--ivory)", borderBottom: "1px solid var(--line)" }}>{t}</div>
              );

              return (
                <div style={{ marginTop: 8, border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
                  <input value={pSearch} onChange={e => setPSearch(e.target.value)} placeholder="ابحث بالاسم أو الجواز..." style={{ ...inp, borderRadius: 0, borderWidth: "0 0 1px 0", fontSize: 12 }} />
                  {full && <div style={{ padding: "8px 11px", fontSize: 10.5, fontWeight: 800, color: statusColor["مكتملة"], background: "var(--danger-bg)" }}>الغرفة مكتملة — لا تتّسع لنزيلٍ آخر</div>}
                  <div style={{ maxHeight: 200, overflowY: "auto" }}>
                    {pool.length === 0 ? (
                      <div style={{ padding: "12px", textAlign: "center", color: "var(--muted)", fontSize: 12 }}>{q ? "لا نتائج مطابقة" : "لا يوجد غير موزّعين"}</div>
                    ) : (
                      <>
                        {kin.length > 0 && head(`أفراد من نفس الأسرة بدون غرفة · ${kin.length}`)}
                        {kin.slice(0, CAP).map(row)}
                        {rest.length > 0 && kin.length > 0 && head(`باقي الحجاج بدون غرفة · ${rest.length}`)}
                        {rest.slice(0, Math.max(0, CAP - Math.min(kin.length, CAP))).map(row)}
                      </>
                    )}
                  </div>
                  {/* العدّ الحقيقيّ دائماً: كانت القائمة تقصّ عند
                      عشرين بلا كلمة، فيُقرأ «بقي عشرون» وهم مئة. */}
                  <div style={{ padding: "6px 11px", fontSize: 9.5, fontWeight: 700, color: "var(--muted)", borderTop: "1px solid var(--line)", background: "var(--paper)" }}>
                    {pool.length > CAP
                      ? `يُعرض ${Math.min(CAP, pool.length)} من ${pool.length} — ابحث لتضييق النتائج`
                      : `${pool.length} بدون غرفة${q ? " (مطابق للبحث)" : ""}`}
                    {!q && unassigned.length !== pool.length ? "" : ""}
                  </div>
                </div>
              );
            })()}

            {/* ملاحظات */}
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: ".05em", marginBottom: 6 }}>ملاحظات</div>
              <textarea value={panelNotes} disabled={readOnly} onChange={e => setPanelNotes(e.target.value)}
                placeholder="أضف ملاحظات على الغرفة..."
                style={{ ...inp, resize: "none", height: 70, fontSize: 12 }} />
              <button disabled={readOnly} onClick={saveNotes} style={{ ...btnP, ...roOff, width: "100%", marginTop: 6, fontSize: 11 }}>حفظ الملاحظات</button>
            </div>
          </div>

          {/* Actions */}
          <div style={{ padding: "10px 14px", borderTop: "1px solid var(--line)", flexShrink: 0 }}>
            <div style={{ fontSize: 9, color: "var(--muted)", textAlign: "center", marginBottom: 6, fontWeight: 600 }}>⚠️ تأكيد قبل الحذف</div>
            <button disabled={readOnly} onClick={() => setConfirmDelete(selectedRoom)}
              style={{ ...roOff, width: "100%", padding: "8px", borderRadius: 8, border: "1px solid #fce8e8", background: "#fff0f0", color: "#C62828", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)" }}>
              حذف الغرفة
            </button>
          </div>
        </div>
      )}

      {/* ===== مودال تأكيد الحذف ===== */}
      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "var(--paper)", borderRadius: 16, padding: 28, width: 340, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", textAlign: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#fff0f0", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#C62828" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--ink)", marginBottom: 8 }}>حذف الغرفة {confirmDelete.number}؟</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 22, lineHeight: 1.6 }}>هذا الإجراء لا يمكن التراجع عنه. سيتم حذف الغرفة نهائياً من النظام.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { deleteRoom(confirmDelete); setConfirmDelete(null); }}
                style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "#C62828", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)" }}>
                نعم، احذف
              </button>
              <button onClick={() => setConfirmDelete(null)}
                style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" }}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== مودال إضافة غرفة ===== */}
      {showAddRoom && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={e => { if (e.target === e.currentTarget) setShowAddRoom(false); }}>
          <div style={{ background: "var(--paper)", borderRadius: 16, padding: 24, width: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--ink)", marginBottom: 14 }}>إضافة غرفة</div>
            {/* Tabs */}
            <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "var(--ivory)", borderRadius: 10, padding: 4 }}>
              {(["single","range","template"] as const).map(m => (
                <button key={m} onClick={() => setAddMode(m)}
                  style={{ flex: 1, padding: "6px", borderRadius: 7, border: "none", background: addMode === m ? primary : "transparent", color: addMode === m ? "white" : "var(--muted)", fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  {m === "single" ? "غرفة واحدة" : m === "range" ? "نطاق" : "قالب"}
                </button>
              ))}
            </div>

            {/* Single */}
            {addMode === "single" && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <div><div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>رقم الغرفة</div><input value={addNum} onChange={e => setAddNum(e.target.value)} style={inp} autoFocus placeholder="مثال: 1201" /></div>
                  <div><div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>الدور</div><input value={addFloor} onChange={e => setAddFloor(e.target.value)} style={inp} placeholder="مثال: 12" /></div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>نوع الغرفة</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {ROOM_TYPES.map(t => <button key={t} onClick={() => setAddType(t)} style={{ padding: "5px 11px", borderRadius: 99, border: "1.5px solid", borderColor: addType === t ? primary : "var(--line)", background: addType === t ? primary : "var(--paper)", color: addType === t ? "#fff" : "var(--ink)", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)" }}>{t}</button>)}
                  </div>
            {!isFixedCapType(panelType) && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", flexShrink: 0 }}>السعة</span>
                <input value={panelCap} disabled={readOnly} onChange={e => setPanelCap(e.target.value.replace(/\D/g, ""))} inputMode="numeric"
                  style={{ ...inp, ...roOff, width: 64, padding: "4px 8px", fontSize: 12, flex: "none" }} />
                <button disabled={readOnly} onClick={() => saveRoomCapacity(panelType, panelCap)}
                  style={{ ...roOff, padding: "4px 10px", borderRadius: 7, border: "none", background: primary, color: "#fff", fontSize: 10, fontWeight: 800, cursor: "pointer", fontFamily: "var(--font-body)" }}>حفظ السعة</button>
              </div>
            )}
                    {!isFixedCapType(addType) && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 5 }}>سعة الغرفة <span style={{ color: "var(--danger)" }}>*</span></div>
                        <input value={addCap} onChange={e => setAddCap(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="عدد الأَسِرّة الفعليّ" style={{ ...inp }} />
                        <div style={{ fontSize: 9.5, color: "var(--muted)", marginTop: 4, lineHeight: 1.6 }}>«خاص» تصنيفٌ تجاريّ لا عدّةَ أَسِرّة — أدخل السعة الحقيقية.</div>
                      </div>
                    )}
                </div>
                <div style={{ marginBottom: 16 }}><div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>ملاحظة (اختياري)</div><input value={addNotes} onChange={e => setAddNotes(e.target.value)} style={inp} placeholder="ملاحظات..." /></div>
                <div style={{ display: "flex", gap: 8 }}><button onClick={addRoom} style={{ ...btnP, flex: 1 }}>إضافة</button><button onClick={() => setShowAddRoom(false)} style={{ ...btnS, flex: 1 }}>إلغاء</button></div>
              </>
            )}

            {/* Range */}
            {addMode === "range" && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <div><div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>من رقم</div><input value={rangeFrom} onChange={e => setRangeFrom(e.target.value)} style={inp} placeholder="1201" autoFocus /></div>
                  <div><div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>إلى رقم</div><input value={rangeTo} onChange={e => setRangeTo(e.target.value)} style={inp} placeholder="1210" /></div>
                  <div><div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>الدور</div><input value={rangeFloor} onChange={e => setRangeFloor(e.target.value)} style={inp} placeholder="12" /></div>
                </div>
                {rangeFrom && rangeTo && parseInt(rangeTo) >= parseInt(rangeFrom) && (
                  <div style={{ fontSize: 11, color: primary, fontWeight: 700, marginBottom: 8, textAlign: "center" }}>
                    سيتم إضافة {parseInt(rangeTo) - parseInt(rangeFrom) + 1} غرفة
                  </div>
                )}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>نوع الغرف</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {ROOM_TYPES.map(t => <button key={t} onClick={() => setRangeType(t)} style={{ padding: "5px 11px", borderRadius: 99, border: "1.5px solid", borderColor: rangeType === t ? primary : "var(--line)", background: rangeType === t ? primary : "var(--paper)", color: rangeType === t ? "#fff" : "var(--ink)", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)" }}>{t}</button>)}
                  </div>
                    {!isFixedCapType(rangeType) && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 5 }}>سعة الغرفة <span style={{ color: "var(--danger)" }}>*</span></div>
                        <input value={rangeCap} onChange={e => setRangeCap(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="عدد الأَسِرّة الفعليّ" style={{ ...inp }} />
                        <div style={{ fontSize: 9.5, color: "var(--muted)", marginTop: 4, lineHeight: 1.6 }}>«خاص» تصنيفٌ تجاريّ لا عدّةَ أَسِرّة — أدخل السعة الحقيقية.</div>
                      </div>
                    )}
                </div>
                <div style={{ display: "flex", gap: 8 }}><button onClick={addRoomRange} style={{ ...btnP, flex: 1 }}>إضافة النطاق</button><button onClick={() => setShowAddRoom(false)} style={{ ...btnS, flex: 1 }}>إلغاء</button></div>
              </>
            )}

            {/* Template */}
            {addMode === "template" && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <div><div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>عدد الأدوار</div><input value={tplFloors} onChange={e => setTplFloors(e.target.value)} style={inp} placeholder="3" autoFocus /></div>
                  <div><div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>بداية الدور</div><input value={tplFloorStart} onChange={e => setTplFloorStart(e.target.value)} style={inp} placeholder="10" /></div>
                  <div><div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>غرف لكل دور</div><input value={tplRoomsPerFloor} onChange={e => setTplRoomsPerFloor(e.target.value)} style={inp} placeholder="10" /></div>
                  <div><div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>بداية الترقيم</div><input value={tplStartNum} onChange={e => setTplStartNum(e.target.value)} style={inp} placeholder="1001" /></div>
                </div>
                {tplFloors && tplRoomsPerFloor && parseInt(tplFloors) > 0 && parseInt(tplRoomsPerFloor) > 0 && (
                  <div style={{ fontSize: 11, color: primary, fontWeight: 700, marginBottom: 8, textAlign: "center" }}>
                    سيتم إضافة {parseInt(tplFloors) * parseInt(tplRoomsPerFloor)} غرفة
                  </div>
                )}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>نوع الغرف</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {ROOM_TYPES.map(t => <button key={t} onClick={() => setTplType(t)} style={{ padding: "5px 11px", borderRadius: 99, border: "1.5px solid", borderColor: tplType === t ? primary : "var(--line)", background: tplType === t ? primary : "var(--paper)", color: tplType === t ? "#fff" : "var(--ink)", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)" }}>{t}</button>)}
                  </div>
                    {!isFixedCapType(tplType) && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 5 }}>سعة الغرفة <span style={{ color: "var(--danger)" }}>*</span></div>
                        <input value={tplCap} onChange={e => setTplCap(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="عدد الأَسِرّة الفعليّ" style={{ ...inp }} />
                        <div style={{ fontSize: 9.5, color: "var(--muted)", marginTop: 4, lineHeight: 1.6 }}>«خاص» تصنيفٌ تجاريّ لا عدّةَ أَسِرّة — أدخل السعة الحقيقية.</div>
                      </div>
                    )}
                </div>
                <div style={{ display: "flex", gap: 8 }}><button onClick={addRoomTemplate} style={{ ...btnP, flex: 1 }}>إنشاء القالب</button><button onClick={() => setShowAddRoom(false)} style={{ ...btnS, flex: 1 }}>إلغاء</button></div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export { HotelPage };
