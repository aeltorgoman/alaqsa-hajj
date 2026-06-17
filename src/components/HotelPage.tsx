import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "../supabase";
import type { Passenger, Room } from "../types";
import { Avatar } from "./Avatar";
import { Modal } from "./Modal";
import { AlertModal, useAlert } from "./AlertModal";
import { ROOM_TYPES, ROOM_COLORS, ROOM_ICON_COLORS, inp, btnP, btnS } from "../utils";

// ===== دالة حفظ الترتيب في Supabase =====
async function saveSortOrder(items: { id: number; sort_order: number }[]) {
  await Promise.all(items.map(item =>
    supabase.from("passengers").update({ sort_order: item.sort_order }).eq("id", item.id)
  ));
}

// ===== إحصائيات الفندق =====
function HotelStats({ rooms, passengers }: { rooms: Room[]; passengers: Passenger[] }) {
  const stats = useMemo(() => {
    const total = passengers.length;
    const assignedCount = passengers.filter(p => p.room_id != null).length;
    const unassigned = total - assignedCount;
    const viewRequested = passengers.filter(p => p.services?.hotel_view === "مطلة").length;

    // حساب نوع الغرفة من عدد الحجاج
    const getRoomLabel = (count: number) => {
      if (count === 0) return "فارغة";
      if (count === 1) return "فردية";
      if (count === 2) return "ثنائية";
      if (count === 3) return "ثلاثية";
      if (count === 4) return "رباعية";
      return `${count} أشخاص`;
    };

    const roomOccupancy: Record<string, number> = {};
    rooms.forEach(r => {
      const count = passengers.filter(p => p.room_id === r.id).length;
      const label = getRoomLabel(count);
      roomOccupancy[label] = (roomOccupancy[label] || 0) + 1;
    });

    return { total, assignedCount, unassigned, viewRequested, roomOccupancy };
  }, [rooms, passengers]);
  const { total, assignedCount, unassigned, viewRequested, roomOccupancy } = stats;

  const occupancyColors: Record<string, [string, string]> = {
    "فارغة": ["#f5f5f5", "#999"],
    "فردية": ["rgba(74,144,217,0.1)", "#4A90D9"],
    "ثنائية": ["rgba(42,157,143,0.1)", "#2A9D8F"],
    "ثلاثية": ["rgba(125,31,60,0.08)", "var(--em7)"],
    "رباعية": ["rgba(232,149,26,0.1)", "#E8951A"],
  };

  const cards = [
    { label: "إجمالي الحجاج", num: total, sub: "الموسم الحالي", border: "#c8a24b", clr: "var(--em8)", bg: "var(--paper)" },
    { label: "موزّعون", num: assignedCount, sub: `${total ? Math.round(assignedCount / total * 100) : 0}٪ من الإجمالي`, border: "#2A9D8F", clr: "#2A9D8F", bg: "rgba(42,157,143,0.05)" },
    { label: "غير موزّعين", num: unassigned, sub: unassigned > 0 ? "يحتاج توزيع" : "مكتمل", border: unassigned > 0 ? "#c0392b" : "#ccc", clr: unassigned > 0 ? "#c0392b" : "var(--muted)", bg: unassigned > 0 ? "rgba(192,57,43,0.05)" : "var(--paper)" },
    { label: "طالبين مطل", num: viewRequested, sub: `${total ? Math.round(viewRequested / total * 100) : 0}٪ من الإجمالي`, border: "#4A90D9", clr: "#4A90D9", bg: "rgba(74,144,217,0.05)" },
  ];

  return (
    <div style={{ borderBottom: "1px solid var(--line)", flexShrink: 0, background: "var(--ivory)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, padding: "10px 14px 8px" }}>
        {cards.map(({ label, num, sub, border, clr, bg }) => (
          <div key={label} style={{ background: bg, border: "1.5px solid var(--line)", borderRight: `4px solid ${border}`, borderRadius: 10, padding: "11px 14px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", marginBottom: 5 }}>{label}</div>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 32, fontWeight: 700, lineHeight: 1, color: clr }}>{num}</div>
            <div style={{ fontSize: 11, marginTop: 4, color: "var(--g7)" }}>{sub}</div>
          </div>
        ))}
      </div>
      {Object.keys(roomOccupancy).length > 0 && (
        <div style={{ display: "flex", gap: 6, padding: "0 14px 10px", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 600, marginLeft: 4 }}>الغرف:</span>
          {Object.entries(roomOccupancy).filter(([k]) => k !== "فارغة").map(([label, count]) => {
            const [bg, clr] = occupancyColors[label] || ["var(--bg-2)", "var(--text)"];
            return (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 5, background: bg, borderRadius: 7, padding: "4px 10px" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: clr }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: clr, fontFamily: "var(--font-heading)" }}>{count}</span>
              </div>
            );
          })}
          {roomOccupancy["فارغة"] > 0 && (
            <span style={{ fontSize: 10, color: "var(--muted)" }}>({roomOccupancy["فارغة"]} فارغة)</span>
          )}
        </div>
      )}
    </div>
  );
}

// ===== صفحة الفندق =====
function HotelPage({ passengers, setPassengers }: { passengers: Passenger[]; setPassengers: (p: Passenger[]) => void }) {
  const { alert: alertState, showAlert } = useAlert();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [editingRoomId, setEditingRoomId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(new Set<number>());
  const [showAdd, setShowAdd] = useState(false);
  const [showRange, setShowRange] = useState(false);
  const [showAddP, setShowAddP] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [roomNumber, setRoomNumber] = useState("");
  const [roomFloor, setRoomFloor] = useState("");
  const [numberError, setNumberError] = useState("");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [rangeFloor, setRangeFloor] = useState("");
  const [rangeError, setRangeError] = useState("");
  const [currentRoomId, setCurrentRoomId] = useState<number | null>(null);
  const [selectedP, setSelectedP] = useState(new Set<number>());
  const [pSearch, setPSearch] = useState("");
  const [printFilter, setPrintFilter] = useState<"all" | "floor" | "type">("all");
  const [printFloor, setPrintFloor] = useState("");
  const [printType, setPrintType] = useState<Room["type"]>("ثنائية");
  const [filterFloor, setFilterFloor] = useState("الكل");
  const [filterType, setFilterType] = useState("الكل");
  const fileRef = useRef<HTMLInputElement>(null);

  // Drag state
  const dragPassengerId = useRef<number | null>(null);
  const dragOverPassengerId = useRef<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  useEffect(() => {
    supabase.from("rooms").select("*").order("number").then(({ data }: any) => { if (data) setRooms(data as Room[]); });
  }, []);

  const getRoomPassengers = (roomId: number) =>
    passengers.filter(p => p.room_id === roomId).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const floors = [...new Set(rooms.filter(r => r.floor).map(r => r.floor))].sort();
  const toggleRoom = (id: number) => setExpanded(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const addRoom = async () => {
    if (!roomNumber.trim()) { setNumberError("يرجى إدخال رقم الغرفة"); return; }
    if (rooms.some(r => r.number === roomNumber.trim())) { setNumberError(`الغرفة رقم "${roomNumber}" موجودة بالفعل`); return; }
    setNumberError("");
    const { data, error } = await supabase.from("rooms").insert([{ number: roomNumber.trim(), floor: roomFloor.trim(), type: "ثنائية" }]).select();
    if (error) {
      showAlert("error", `فشل إضافة الغرفة: ${error.message || "يرجى المحاولة مرة أخرى"}`);
      return;
    }
    if (data?.[0]) {
      setRooms(prev => [...prev, data[0] as Room]);
      setExpanded(prev => new Set([...prev, data[0].id]));
      setRoomNumber(""); setRoomFloor(""); setShowAdd(false);
    }
  };

  const addRange = async () => {
    const from = parseInt(rangeFrom), to = parseInt(rangeTo);
    if (!from || !to || from > to) { setRangeError("يرجى التحقق من الأرقام المُدخلة"); return; }
    const existingNums = new Set(rooms.map(r => r.number));
    const newRooms = [];
    for (let n = from; n <= to; n++) {
      if (!existingNums.has(String(n))) newRooms.push({ number: String(n), floor: rangeFloor.trim(), type: "ثنائية" });
    }
    if (newRooms.length === 0) { setRangeError("جميع الغرف في هذا النطاق موجودة بالفعل"); return; }
    setRangeError("");
    const { data, error } = await supabase.from("rooms").insert(newRooms).select();
    if (error) {
      setRangeError(`فشل الإضافة: ${error.message || "يرجى المحاولة مرة أخرى"}`);
      return;
    }
    if (data) setRooms(prev => [...prev, ...data as Room[]]);
    setRangeFrom(""); setRangeTo(""); setRangeFloor(""); setShowRange(false);
  };

  const handleExcel = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const lines = text.split("\n").slice(1);
      const existingNums = new Set(rooms.map(r => r.number));
      const newRooms: any[] = [];
      lines.forEach(line => {
        const parts = line.split(",");
        if (parts.length >= 2) {
          const num = parts[0]?.trim(), type = parts[1]?.trim() as Room["type"], floor = parts[2]?.trim() || "";
          if (num && !existingNums.has(num) && (ROOM_TYPES as readonly string[]).includes(type)) newRooms.push({ number: num, floor, type });
        }
      });
      if (newRooms.length > 0) {
        const { data, error } = await supabase.from("rooms").insert(newRooms).select();
        if (!error && data) setRooms(prev => [...prev, ...data as Room[]]);
      } else showAlert("warning", "لم يتم إضافة أي غرف. يرجى التحقق من تنسيق الملف.");
    };
    reader.readAsText(file);
  };

  const deleteRoom = async (id: number) => {
    if (getRoomPassengers(id).length > 0) { showAlert("warning", "يرجى إزالة المسافرين قبل حذف الغرفة"); return; }
    await supabase.from("rooms").delete().eq("id", id);
    setRooms(prev => prev.filter(r => r.id !== id));
  };

  const openAddP = (roomId: number) => { setCurrentRoomId(roomId); setSelectedP(new Set()); setPSearch(""); setShowAddP(true); };
  const toggleSelectP = (id: number) => setSelectedP(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const confirmAddP = async () => {
    await Promise.all([...selectedP].map(id => supabase.from("passengers").update({ room_id: currentRoomId }).eq("id", id)));
    setPassengers(passengers.map(p => selectedP.has(p.id) ? { ...p, room_id: currentRoomId } : p));
    setShowAddP(false);
  };

  const removeP = async (pId: number) => {
    await supabase.from("passengers").update({ room_id: null }).eq("id", pId);
    setPassengers(passengers.map(p => p.id === pId ? { ...p, room_id: null } : p));
  };

  const moveP = async (pId: number, toId: string) => {
    if (!toId) return;
    const newRoomId = parseInt(toId);
    await supabase.from("passengers").update({ room_id: newRoomId }).eq("id", pId);
    setPassengers(passengers.map(p => p.id === pId ? { ...p, room_id: newRoomId } : p));
  };

  // ===== Drag & Drop handlers =====
  const handleDragStart = (pId: number) => {
    dragPassengerId.current = pId;
    setDraggingId(pId);
  };

  const handleDragOver = (e: React.DragEvent, pId: number) => {
    e.preventDefault();
    dragOverPassengerId.current = pId;
    setDragOverId(pId);
  };

  const handleDrop = async (roomId: number) => {
    const fromId = dragPassengerId.current;
    const toId = dragOverPassengerId.current;
    if (!fromId || !toId || fromId === toId) {
      setDraggingId(null); setDragOverId(null);
      dragPassengerId.current = null; dragOverPassengerId.current = null;
      return;
    }
    const rp = getRoomPassengers(roomId);
    const fromIdx = rp.findIndex(p => p.id === fromId);
    const toIdx = rp.findIndex(p => p.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;

    const newOrder = [...rp];
    const [moved] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, moved);

    const updates = newOrder.map((p, i) => ({ id: p.id, sort_order: i + 1 }));
    const updatedPassengers = passengers.map(p => {
      const upd = updates.find(u => u.id === p.id);
      return upd ? { ...p, sort_order: upd.sort_order } : p;
    });
    setPassengers(updatedPassengers);
    await saveSortOrder(updates);

    setDraggingId(null); setDragOverId(null);
    dragPassengerId.current = null; dragOverPassengerId.current = null;
  };

  const handleDragEnd = () => {
    setDraggingId(null); setDragOverId(null);
    dragPassengerId.current = null; dragOverPassengerId.current = null;
  };

  const doPrint = (roomsToPrint: Room[]) => {
    const w = window.open("", "_blank"); if (!w) return;
    const half = Math.ceil(roomsToPrint.length / 2);
    const left = roomsToPrint.slice(0, half), right = roomsToPrint.slice(half);
    const renderRoom = (room: Room) => {
      const rp = getRoomPassengers(room.id);
      const [bg] = ROOM_COLORS[room.type] || ["#f5f5f5"];
      return `<div style="margin-bottom:12px"><div style="background:${bg};padding:5px 10px;border:1px solid #ddd;border-bottom:none;font-size:11px;font-weight:bold;display:flex;justify-content:space-between"><span>${room.type}</span><span>${room.number}${room.floor ? ` (طابق ${room.floor})` : ""}</span></div><table style="width:100%;border-collapse:collapse;font-size:11px"><tr style="background:#f5f5f5"><th style="padding:4px 8px;border:1px solid #ddd;text-align:center;width:28px">م</th><th style="padding:4px 8px;border:1px solid #ddd;text-align:right">الاسم</th></tr>${rp.map((p, i) => `<tr><td style="padding:4px 8px;border:1px solid #ddd;text-align:center">${i + 1}</td><td style="padding:4px 8px;border:1px solid #ddd">${p.short_ar}</td></tr>`).join("")}</table></div>`;
    };
    w.document.write(`<html><head><title>تقرير الفندق</title><style>body{font-family:Arial;direction:rtl;padding:16px}h1{text-align:center}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}</style></head><body><h1>تقرير الفندق</h1><div class="grid"><div>${left.map(renderRoom).join("")}</div><div>${right.map(renderRoom).join("")}</div></div><script>window.print();<\/script></body></html>`);
    w.document.close();
  };

  const handlePrint = () => {
    let r = rooms;
    if (printFilter === "floor") r = rooms.filter(x => x.floor === printFloor);
    else if (printFilter === "type") r = rooms.filter(x => x.type === printType);
    doPrint(r); setShowPrint(false);
  };

  const currentRoom = rooms.find(r => r.id === currentRoomId);
  const filteredP = passengers
    .filter(p => p.room_id == null && (!p.passenger_type || p.passenger_type === "حاج") && (!pSearch || p.name_ar.includes(pSearch)))
    .sort((a, b) => (a.short_ar || a.name_ar).localeCompare(b.short_ar || b.name_ar, "ar"));
  const getFilteredRoomsForPrint = () => {
    if (printFilter === "floor") return rooms.filter(r => r.floor === printFloor);
    if (printFilter === "type") return rooms.filter(r => r.type === printType);
    return rooms;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <AlertModal alert={alertState} onClose={() => showAlert(null)} />
      <HotelStats rooms={rooms} passengers={passengers} />
      <div style={{ padding: 14, overflowY: "auto", flex: 1 }}>
        {/* أزرار التحكم */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <button onClick={() => setShowAdd(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 99, background: "var(--paper)", border: "1px solid var(--line)", color: "var(--em7)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)", transition: "var(--transition)", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }} onMouseEnter={e => { e.currentTarget.style.background = "rgba(125,31,60,0.06)"; e.currentTarget.style.borderColor = "var(--em7)"; }} onMouseLeave={e => { e.currentTarget.style.background = "var(--paper)"; e.currentTarget.style.borderColor = "var(--line)"; }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> غرفة جديدة
          </button>
          <button onClick={() => setShowRange(true)} style={btnS()}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> نطاق غرف</button>
          <button onClick={() => fileRef.current?.click()} style={btnS()}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> استيراد Excel</button>
          {rooms.length > 0 && <button onClick={() => setShowPrint(true)} style={btnS()}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> طباعة</button>}
          <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={e => e.target.files?.[0] && handleExcel(e.target.files[0])} />
        </div>

        {rooms.length > 0 && (
          <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>الطابق:</span>
              <div onClick={() => setFilterFloor("الكل")} style={{ padding: "4px 12px", borderRadius: 99, border: `1.5px solid ${filterFloor === "الكل" ? "var(--em7)" : "var(--border)"}`, background: filterFloor === "الكل" ? "rgba(125,31,60,.08)" : "transparent", cursor: "pointer", fontSize: 11, color: filterFloor === "الكل" ? "var(--em7)" : "var(--text-muted)" }}>الكل</div>
              {floors.map(f => <div key={f} onClick={() => setFilterFloor(f)} style={{ padding: "4px 12px", borderRadius: 99, border: `1.5px solid ${filterFloor === f ? "var(--em7)" : "var(--border)"}`, background: filterFloor === f ? "rgba(125,31,60,.08)" : "transparent", cursor: "pointer", fontSize: 11, color: filterFloor === f ? "var(--em7)" : "var(--text-muted)" }}>ط{f}</div>)}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>النوع:</span>
              <div onClick={() => setFilterType("الكل")} style={{ padding: "4px 12px", borderRadius: 99, border: `1.5px solid ${filterType === "الكل" ? "var(--em7)" : "var(--border)"}`, background: filterType === "الكل" ? "rgba(125,31,60,.08)" : "transparent", cursor: "pointer", fontSize: 11, color: filterType === "الكل" ? "var(--em7)" : "var(--text-muted)" }}>الكل</div>
              {ROOM_TYPES.map(t => <div key={t} onClick={() => setFilterType(t)} style={{ padding: "4px 12px", borderRadius: 99, border: `1.5px solid ${filterType === t ? "var(--em7)" : "var(--border)"}`, background: filterType === t ? "rgba(125,31,60,.08)" : "transparent", cursor: "pointer", fontSize: 11, color: filterType === t ? "var(--em7)" : "var(--text-muted)" }}>{t}</div>)}
            </div>
          </div>
        )}

        {!rooms.length ? (
          <div style={{ textAlign: "center", padding: "2rem", color: "var(--muted)", fontSize: 12 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/></svg>
            </div>
            لا يوجد غرف بعد
          </div>
        ) : (() => {
          const filteredRooms = rooms.filter(r => (filterFloor === "الكل" || r.floor === filterFloor) && (filterType === "الكل" || r.type === filterType));
          if (filteredRooms.length === 0) {
            return (
              <div style={{ textAlign: "center", padding: "2rem", color: "var(--muted)", fontSize: 12 }}>
                لا توجد غرف مطابقة للفلتر
              </div>
            );
          }
          return (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {filteredRooms.map(room => {
              const isExpanded = expanded.has(room.id);
              const rp = getRoomPassengers(room.id);
              // تحديد نوع الغرفة من عدد الحجاج
              const getRoomLabel = (count: number) => {
                if (count === 0) return "فارغة";
                if (count === 1) return "فردية";
                if (count === 2) return "ثنائية";
                if (count === 3) return "ثلاثية";
                if (count === 4) return "رباعية";
                return `${count} أشخاص`;
              };
              return (
                <div key={room.id} style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, overflow: "hidden", background: "var(--paper)" }}>
                  {/* Header */}
                  <div onClick={() => toggleRoom(room.id)} style={{ padding: "8px 10px", background: "var(--bg-2)", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: ROOM_ICON_COLORS[room.type] || "#999", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>
                    </div>
                    <div style={{ flex: 1 }} onDoubleClick={e => { e.stopPropagation(); setEditingRoomId(room.id); }}>
                      {editingRoomId === room.id ? (
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }} onClick={e => e.stopPropagation()}>
                          <input defaultValue={room.number} id={`rn-${room.id}`} style={{ ...inp, fontSize: 12, padding: "3px 8px", width: 80 }} autoFocus
                            onKeyDown={e => { if (e.key === "Enter") { const v = (document.getElementById(`rn-${room.id}`) as HTMLInputElement)?.value?.trim(); if (v) { supabase.from("rooms").update({ number: v }).eq("id", room.id); setRooms(rooms.map(r => r.id === room.id ? { ...r, number: v } : r)); } setEditingRoomId(null); } if (e.key === "Escape") setEditingRoomId(null); }} />
                          <button onClick={() => { const v = (document.getElementById(`rn-${room.id}`) as HTMLInputElement)?.value?.trim(); if (v) { supabase.from("rooms").update({ number: v }).eq("id", room.id); setRooms(rooms.map(r => r.id === room.id ? { ...r, number: v } : r)); } setEditingRoomId(null); }} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "var(--em7)", color: "#fff", border: "none", cursor: "pointer" }}>✓</button>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, fontWeight: 600 }}>
                          غرفة {room.number}
                          {room.floor && <span style={{ fontSize: 10, color: "var(--text-muted)", marginRight: 3 }}>ط{room.floor}</span>}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 99, background: "var(--bg-2)", color: "var(--text-muted)", border: "1px solid var(--line)" }}>{getRoomLabel(rp.length)}</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: 3 }}>{rp.length} <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>
                    <button onClick={e => { e.stopPropagation(); openAddP(room.id); }} style={{ ...btnS(), background: "rgba(125,31,60,0.08)", borderColor: "var(--em7)", color: "var(--em7)", padding: "3px 6px" }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
                    <button onClick={e => { e.stopPropagation(); deleteRoom(room.id); }} style={{ background: "none", border: `1px solid ${rp.length === 0 ? "rgba(122,46,69,0.2)" : "var(--line)"}`, borderRadius: 6, padding: "3px 6px", cursor: rp.length === 0 ? "pointer" : "not-allowed", color: rp.length === 0 ? "var(--ff)" : "var(--text-muted)" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" style={{ transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>
                  </div>

                  {/* Passengers list with Drag & Drop */}
                  {isExpanded && (
                    <div
                      style={{ padding: "8px 12px", borderTop: "0.5px solid #e5e5e5" }}
                      onDragOver={e => e.preventDefault()}
                      onDrop={() => handleDrop(room.id)}
                    >
                      {rp.length ? rp.map((p, i) => (
                        <div
                          key={p.id}
                          draggable
                          onDragStart={() => handleDragStart(p.id)}
                          onDragOver={e => handleDragOver(e, p.id)}
                          onDragEnd={handleDragEnd}
                          style={{
                            display: "flex", alignItems: "center", gap: 7,
                            padding: "5px 4px", borderRadius: 6, marginBottom: 2,
                            background: draggingId === p.id ? "rgba(125,31,60,0.08)" : dragOverId === p.id ? "rgba(125,31,60,0.04)" : "transparent",
                            border: `1px solid ${dragOverId === p.id ? "var(--em7)" : "transparent"}`,
                            cursor: "grab", transition: "background 0.15s",
                            opacity: draggingId === p.id ? 0.5 : 1,
                          }}
                        >
                          {/* أيقونة السحب */}
                          <span style={{ color: "var(--muted)", cursor: "grab", flexShrink: 0 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                              <circle cx="9" cy="5" r="1" fill="currentColor"/><circle cx="15" cy="5" r="1" fill="currentColor"/>
                              <circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/>
                              <circle cx="9" cy="19" r="1" fill="currentColor"/><circle cx="15" cy="19" r="1" fill="currentColor"/>
                            </svg>
                          </span>
                          <span style={{ fontSize: 10, color: "var(--text-muted)", width: 18, textAlign: "center" }}>{i + 1}</span>
                          <Avatar name={p.name_ar} gender={p.gender} size={24} />
                          <span style={{ fontSize: 11, flex: 1 }}>{p.short_ar}</span>
                          <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 99, background: ROOM_COLORS[p.services.hotel_type]?.[0] || "var(--bg-2)", color: ROOM_COLORS[p.services.hotel_type]?.[1] || "var(--text-muted)" }}>{p.services.hotel_type} {p.services.hotel_view}</span>
                          {p.services.hotel_type !== room.type && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
                          <select onChange={e => moveP(p.id, e.target.value)} defaultValue="" style={{ fontSize: 10, background: "var(--bg-2)", border: "0.5px solid #ddd", borderRadius: 4, padding: "2px 4px", fontFamily: "inherit" }}>
                            <option value="">نقل لـ...</option>
                            {rooms.filter(r => r.id !== room.id).map(r => <option key={r.id} value={r.id}>غرفة {r.number}</option>)}
                          </select>
                          <button onClick={() => removeP(p.id)} title="إزالة من الغرفة" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", fontSize: 18, lineHeight: 1, padding: "0 4px" }}>✕</button>
                        </div>
                      )) : (
                        <div style={{ textAlign: "center", padding: "10px", color: "var(--text-muted)", fontSize: 11 }}>لا يوجد مسافرون</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          );
        })()}

        {/* Modal غرفة جديدة */}
        <Modal show={showAdd} onClose={() => { setShowAdd(false); setNumberError(""); }} title="غرفة جديدة" maxWidth={340}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <div><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>رقم الغرفة</div><input style={{ ...inp, borderColor: numberError ? "var(--danger)" : "var(--border)" }} value={roomNumber} onChange={e => { setRoomNumber(e.target.value); setNumberError(""); }} autoFocus onKeyDown={e => e.key === "Enter" && addRoom()} />{numberError && <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 4 }}>{numberError}</div>}</div>
            <div><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>الطابق</div><input style={inp} value={roomFloor} onChange={e => setRoomFloor(e.target.value)} /></div>
          </div>
          <div style={{ display: "flex", gap: 8 }}><button onClick={addRoom} style={{ ...btnP(), flex: 1 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> إضافة</button><button onClick={() => { setShowAdd(false); setNumberError(""); }} style={btnS()}>إلغاء</button></div>
        </Modal>

        {/* Modal نطاق غرف */}
        <Modal show={showRange} onClose={() => { setShowRange(false); setRangeError(""); }} title="إضافة نطاق غرف" maxWidth={360}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
            <div><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>من رقم</div><input style={inp} type="number" value={rangeFrom} onChange={e => { setRangeFrom(e.target.value); setRangeError(""); }} /></div>
            <div><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>إلى رقم</div><input style={inp} type="number" value={rangeTo} onChange={e => { setRangeTo(e.target.value); setRangeError(""); }} /></div>
            <div><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>الطابق</div><input style={inp} value={rangeFloor} onChange={e => setRangeFloor(e.target.value)} /></div>
          </div>
          {rangeError && <div style={{ fontSize: 11, color: "var(--danger)", marginBottom: 8 }}>{rangeError}</div>}
          {rangeFrom && rangeTo && parseInt(rangeFrom) <= parseInt(rangeTo) && <div style={{ fontSize: 11, color: "var(--em7)", marginBottom: 10, background: "rgba(125,31,60,.06)", padding: "6px 10px", borderRadius: 8 }}>سيتم إضافة {parseInt(rangeTo) - parseInt(rangeFrom) + 1} غرفة</div>}
          <div style={{ display: "flex", gap: 8 }}><button onClick={addRange} style={{ ...btnP(), flex: 1 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> إضافة</button><button onClick={() => { setShowRange(false); setRangeError(""); }} style={btnS()}>إلغاء</button></div>
        </Modal>

        {/* Modal إضافة مسافرين */}
        <Modal show={showAddP} onClose={() => setShowAddP(false)} title={`إضافة مسافرين — غرفة ${currentRoom?.number}`}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-2)", border: "0.5px solid #ddd", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21-4.35-4.35"/></svg>
            <input style={{ border: "none", background: "transparent", fontSize: 12, flex: 1, outline: "none", fontFamily: "inherit" }} placeholder="ابحث..." value={pSearch} onChange={e => setPSearch(e.target.value)} />
          </div>
          {filteredP.map(p => {
            const isSel = selectedP.has(p.id);
            return (
              <div key={p.id} onClick={() => toggleSelectP(p.id)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, marginBottom: 2, cursor: "pointer", background: isSel ? "rgba(125,31,60,.08)" : "transparent" }}>
                <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${isSel ? "var(--em7)" : "var(--line)"}`, background: isSel ? "var(--em7)" : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {isSel && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                </div>
                <span style={{ fontSize: 12, flex: 1 }}>{p.short_ar || p.name_ar}</span>
                <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{p.services.hotel_type}</span>
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}><button onClick={confirmAddP} style={{ ...btnP(), flex: 1 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> إضافة ({selectedP.size})</button><button onClick={() => setShowAddP(false)} style={btnS()}>إلغاء</button></div>
        </Modal>

        {/* Modal الطباعة */}
        <Modal show={showPrint} onClose={() => setShowPrint(false)} title="خيارات الطباعة" maxWidth={340}>
          {[["all", "طباعة كل الغرف"], ["floor", "طباعة دور معين"], ["type", "طباعة نوع معين"]].map(([val, label]) => (
            <div key={val} onClick={() => setPrintFilter(val as any)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, cursor: "pointer", marginBottom: 6, background: printFilter === val ? "rgba(125,31,60,.08)" : "var(--bg-2)", border: `0.5px solid ${printFilter === val ? "var(--em7)" : "var(--border)"}` }}>
              <div style={{ width: 16, height: 16, borderRadius: "50%", background: printFilter === val ? "var(--em7)" : "var(--bg-card)", border: `2px solid ${printFilter === val ? "var(--em7)" : "var(--border)"}` }} />
              <span style={{ fontSize: 12 }}>{label}</span>
            </div>
          ))}
          {printFilter === "floor" && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>اختر الطابق</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {floors.map(f => <div key={f} onClick={() => setPrintFloor(f)} style={{ padding: "5px 12px", borderRadius: 99, border: `1.5px solid ${printFloor === f ? "var(--em7)" : "var(--border)"}`, background: printFloor === f ? "rgba(125,31,60,.08)" : "transparent", cursor: "pointer", fontSize: 12, color: printFloor === f ? "var(--em7)" : "var(--text-muted)" }}>{f}</div>)}
              </div>
            </div>
          )}
          {printFilter === "type" && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>اختر النوع</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {ROOM_TYPES.map(t => { const [bg, clr] = ROOM_COLORS[t]; return <div key={t} onClick={() => setPrintType(t)} style={{ flex: 1, padding: 7, borderRadius: 8, border: `1.5px solid ${printType === t ? clr : "var(--border)"}`, background: printType === t ? bg : "transparent", cursor: "pointer", textAlign: "center", fontSize: 11, color: printType === t ? clr : "var(--text-muted)" }}>{t}</div>; })}
              </div>
            </div>
          )}
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>
            سيتم طباعة {getFilteredRoomsForPrint().length} غرفة
          </div>
          <div style={{ display: "flex", gap: 8 }}><button onClick={handlePrint} style={{ ...btnP(), flex: 1 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> طباعة</button><button onClick={() => setShowPrint(false)} style={btnS()}>إلغاء</button></div>
        </Modal>
      </div>
    </div>
  );
}

export { HotelStats, HotelPage };
