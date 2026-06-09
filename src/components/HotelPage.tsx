import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "../supabase";
import type { Passenger, Room } from "../types";
import { Avatar } from "./Avatar";
import { Modal } from "./Modal";
import { ROOM_TYPES, ROOM_COLORS, inp, btnP, btnS } from "../utils";

function HotelStats({ rooms, passengers }: { rooms: Room[]; passengers: Passenger[] }) {
  const stats = useMemo(() => {
    const total = passengers.length;
    const assignedCount = passengers.filter(p => p.room_id != null).length;
    const unassigned = total - assignedCount;
    const viewRequested = passengers.filter(p => p.services?.hotel_view === "مطلة").length;
    return { total, assignedCount, unassigned, viewRequested };
  }, [rooms, passengers]);
  const { total, assignedCount, unassigned, viewRequested } = stats;

  // أنواع الغرف
  const roomTypes = ROOM_TYPES.map(t => ({
    type: t,
    count: rooms.filter(r => r.type === t).length,
    requested: passengers.filter(p => p.services?.hotel_type === t).length,
    colors: ROOM_COLORS[t],
  })).filter(r => r.count > 0 || r.requested > 0);

  const cards = [
    { label: "إجمالي الحجاج", num: total, sub: "الموسم الحالي", border: "#c8a24b", clr: "var(--em8)", bg: "var(--paper)" },
    { label: "موزّعون", num: assignedCount, sub: `${total ? Math.round(assignedCount/total*100) : 0}٪ من الإجمالي`, border: "#2A9D8F", clr: "#2A9D8F", bg: "rgba(42,157,143,0.05)" },
    { label: "غير موزّعين", num: unassigned, sub: unassigned > 0 ? "يحتاج توزيع" : "مكتمل", border: unassigned > 0 ? "#c0392b" : "#ccc", clr: unassigned > 0 ? "#c0392b" : "var(--muted)", bg: unassigned > 0 ? "rgba(192,57,43,0.05)" : "var(--paper)" },
    { label: "طالبين مطل", num: viewRequested, sub: `${total ? Math.round(viewRequested/total*100) : 0}٪ من الإجمالي`, border: "#4A90D9", clr: "#4A90D9", bg: "rgba(74,144,217,0.05)" },
  ];

  return (
    <div style={{ borderBottom: "1px solid var(--line)", flexShrink: 0, background: "var(--ivory)" }}>
      {/* الصف الأول — الإحصائيات */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, padding: "10px 14px 8px" }}>
        {cards.map(({ label, num, sub, border, clr, bg }) => (
          <div key={label} style={{ background: bg, border: "1.5px solid var(--line)", borderRight: `4px solid ${border}`, borderRadius: 10, padding: "11px 14px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", marginBottom: 5 }}>{label}</div>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 32, fontWeight: 700, lineHeight: 1, color: clr }}>{num}</div>
            <div style={{ fontSize: 11, marginTop: 4, color: "var(--g7)" }}>{sub}</div>
          </div>
        ))}
      </div>
      {/* الصف الثاني — أنواع الغرف */}
      {roomTypes.length > 0 && (
        <div style={{ display: "flex", gap: 6, padding: "0 14px 10px", alignItems: "center" }}>
          <span style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 600, marginLeft: 4 }}>الغرف:</span>
          {roomTypes.map(({ type, count, requested, colors }) => (
            <div key={type} style={{ display: "flex", alignItems: "center", gap: 5, background: colors[0], border: `1px solid ${colors[1]}22`, borderRadius: 7, padding: "4px 10px" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: colors[1] }}>{type}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: colors[1], fontFamily: "var(--font-heading)" }}>{count}</span>
              <span style={{ fontSize: 10, color: colors[1], opacity: 0.7 }}>/ طلب {requested}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function HotelPage({ passengers, setPassengers }: { passengers: Passenger[]; setPassengers: (p: Passenger[]) => void }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [editingRoomId, setEditingRoomId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(new Set<number>());
  const [showAdd, setShowAdd] = useState(false);
  const [showRange, setShowRange] = useState(false);
  const [showAddP, setShowAddP] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [roomNumber, setRoomNumber] = useState("");
  const [roomFloor, setRoomFloor] = useState("");
  const [roomType, setRoomType] = useState<Room["type"]>("ثنائية");
  const [numberError, setNumberError] = useState("");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [rangeFloor, setRangeFloor] = useState("");
  const [rangeType, setRangeType] = useState<Room["type"]>("ثنائية");
  const [rangeError, setRangeError] = useState("");
  const [currentRoomId, setCurrentRoomId] = useState<number | null>(null);
  const [selectedP, setSelectedP] = useState(new Set<number>());
  const [pSearch, setPSearch] = useState("");
  const [printFilter, setPrintFilter] = useState<"all" | "floor" | "type">("all");
  const [printFloor, setPrintFloor] = useState("");
  const [printType, setPrintType] = useState<Room["type"]>("ثنائية");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.from("rooms").select("*").order("number").then(({ data }: any) => { if (data) setRooms(data as Room[]); });
  }, []);

  const getRoomPassengers = (roomId: number) => passengers.filter(p => p.room_id === roomId);
  const floors = [...new Set(rooms.filter(r => r.floor).map(r => r.floor))].sort();

  const toggleRoom = (id: number) => setExpanded(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const addRoom = async () => {
    if (!roomNumber.trim()) return;
    if (rooms.some(r => r.number === roomNumber.trim())) { setNumberError(`غرفة "${roomNumber}" موجودة!`); return; }
    setNumberError("");
    const { data, error } = await supabase.from("rooms").insert([{ number: roomNumber.trim(), floor: roomFloor.trim(), type: roomType }]).select();
    if (!error && data?.[0]) {
      setRooms(prev => [...prev, data[0] as Room]);
      setExpanded(prev => new Set([...prev, data[0].id]));
      setRoomNumber(""); setRoomFloor(""); setRoomType("ثنائية"); setShowAdd(false);
    }
  };

  const addRange = async () => {
    const from = parseInt(rangeFrom), to = parseInt(rangeTo);
    if (!from || !to || from > to) { setRangeError("تأكد من الأرقام"); return; }
    const existingNums = new Set(rooms.map(r => r.number));
    const newRooms = [];
    for (let n = from; n <= to; n++) {
      if (!existingNums.has(String(n))) newRooms.push({ number: String(n), floor: rangeFloor.trim(), type: rangeType });
    }
    if (newRooms.length === 0) { setRangeError("كل الغرف في هذا النطاق موجودة بالفعل!"); return; }
    setRangeError("");
    const { data, error } = await supabase.from("rooms").insert(newRooms).select();
    if (!error && data) { setRooms(prev => [...prev, ...data as Room[]]); }
    setRangeFrom(""); setRangeTo(""); setRangeFloor(""); setRangeType("ثنائية"); setShowRange(false);
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
          if (num && !existingNums.has(num) && ([...ROOM_TYPES] as string[]).includes(type)) newRooms.push({ number: num, floor, type });
        }
      });
      if (newRooms.length > 0) {
        const { data, error } = await supabase.from("rooms").insert(newRooms).select();
        if (!error && data) setRooms(prev => [...prev, ...data as Room[]]);
      } else alert("لم يتم إضافة غرف. تأكد من شكل الملف.");
    };
    reader.readAsText(file);
  };

  const deleteRoom = async (id: number) => {
    if (getRoomPassengers(id).length > 0) { alert("أزل المسافرين الأول!"); return; }
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

  const doPrint = (roomsToPrint: Room[]) => {
    const w = window.open("", "_blank"); if (!w) return;
    const half = Math.ceil(roomsToPrint.length / 2);
    const left = roomsToPrint.slice(0, half), right = roomsToPrint.slice(half);
    const renderRoom = (room: Room) => {
      const rp = getRoomPassengers(room.id);
      const [bg] = ROOM_COLORS[room.type] || ["var(--bg-2)"];
      return `<div style="margin-bottom:12px"><div style="background:${bg};padding:5px 10px;border:1px solid #ddd;border-bottom:none;font-size:11px;font-weight:bold;display:flex;justify-content:space-between"><span>${room.type}</span><span>${room.number}${room.floor ? ` (طابق ${room.floor})` : ""}</span></div><table style="width:100%;border-collapse:collapse;font-size:11px"><tr style="background:#f5f5f5"><th style="padding:4px 8px;border:1px solid #ddd;text-align:center;width:28px">م</th><th style="padding:4px 8px;border:1px solid #ddd;text-align:right">الاسم</th></tr>${rp.map((p, i) => `<tr><td style="padding:4px 8px;border:1px solid #ddd;text-align:center">${i + 1}</td><td style="padding:4px 8px;border:1px solid #ddd">${p.short_ar}</td></tr>`).join("")}</table></div>`;
    };
    w.document.write(`<html><head><title>تقرير الفندق</title><style>body{font-family:Arial;direction:rtl;padding:16px}h1{text-align:center}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}</style></head><body><h1>تقرير الفندق</h1><div class="grid"><div>${left.map(renderRoom).join("")}</div><div>${right.map(renderRoom).join("")}</div></div><script>window.print();</script></body></html>`);
    w.document.close();
  };

  const handlePrint = () => {
    let r = rooms;
    if (printFilter === "floor") r = rooms.filter(x => x.floor === printFloor);
    else if (printFilter === "type") r = rooms.filter(x => x.type === printType);
    doPrint(r); setShowPrint(false);
  };

  const currentRoom = rooms.find(r => r.id === currentRoomId);
  const filteredP = passengers.filter(p => !pSearch || p.name_ar.includes(pSearch));

  return (
    <div style={{ padding: 14, overflowY: "auto", height: "100%" }}>
      <HotelStats rooms={rooms} passengers={passengers} />
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        <button onClick={() => setShowAdd(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 99, background: "var(--paper)", border: "1px solid var(--line)", color: "var(--em7)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)", transition: "var(--transition)", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }} onMouseEnter={e => { e.currentTarget.style.background = "rgba(125,31,60,0.06)"; e.currentTarget.style.borderColor = "var(--em7)"; }} onMouseLeave={e => { e.currentTarget.style.background = "var(--paper)"; e.currentTarget.style.borderColor = "var(--line)"; }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> غرفة جديدة</button>
        <button onClick={() => setShowRange(true)} style={btnS({ flex: 1 })}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg> نطاق</button>
        <button onClick={() => fileRef.current?.click()} style={btnS({ flex: 1 })}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg> Excel</button>
        {rooms.length > 0 && <button onClick={() => setShowPrint(true)} style={btnS({ flex: 1 })}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> طباعة</button>}
        <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={e => e.target.files?.[0] && handleExcel(e.target.files[0])} />
      </div>
      {!rooms.length ? <div style={{ textAlign: "center", padding: "2rem", color: "var(--muted)", fontSize: 12 }}><div style={{ fontSize: 32, marginBottom: 8 }}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/></svg></div>لا يوجد غرف بعد</div> : (
        <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 16, overflow: "hidden" }}>
          {rooms.map(room => {
          const isExpanded = expanded.has(room.id);
          const rp = getRoomPassengers(room.id);
          const [typeBg, typeClr] = ROOM_COLORS[room.type] || ["var(--bg-2)", "var(--text)"];
          return (
            <div key={room.id} style={{ border: "0.5px solid #e5e5e5", borderRadius: 12, marginBottom: 8, overflow: "hidden" }}>
              <div onClick={() => toggleRoom(room.id)} style={{ padding: "9px 12px", background: "var(--bg-2)", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: typeBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg></div>
                <div style={{ flex: 1 }} onDoubleClick={e => { e.stopPropagation(); setEditingRoomId(room.id); }}>
                  {editingRoomId === room.id ? (
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }} onClick={e => e.stopPropagation()}>
                      <input defaultValue={room.number} id={`rn-${room.id}`} style={{ ...inp, fontSize: 12, padding: "3px 8px", width: 80 }} autoFocus
                        onKeyDown={e => { if (e.key === "Enter") { const v = (document.getElementById(`rn-${room.id}`) as HTMLInputElement)?.value?.trim(); if (v) { supabase.from("rooms").update({ number: v }).eq("id", room.id); setRooms(rooms.map(r => r.id === room.id ? { ...r, number: v } : r)); } setEditingRoomId(null); } if (e.key === "Escape") setEditingRoomId(null); }} />
                      <button onClick={() => { const v = (document.getElementById(`rn-${room.id}`) as HTMLInputElement)?.value?.trim(); if (v) { supabase.from("rooms").update({ number: v }).eq("id", room.id); setRooms(rooms.map(r => r.id === room.id ? { ...r, number: v } : r)); } setEditingRoomId(null); }} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "var(--em7)", color: "#fff", border: "none", cursor: "pointer" }}>✓</button>
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>غرفة {room.number} {room.floor && <span style={{ fontSize: 10, color: "var(--text-muted)" }}>ط{room.floor}</span>} <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 99, background: typeBg, color: typeClr }}>{room.type}</span></div>
                  )}
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{rp.length} مسافر</div>
                </div>
                <button onClick={e => { e.stopPropagation(); openAddP(room.id); }} style={{ background: "var(--success-bg)", border: "none", padding: "3px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer", color: "var(--primary-dark)" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> إضافة</button>
                <button onClick={e => { e.stopPropagation(); deleteRoom(room.id); }} style={{ background: rp.length === 0 ? "var(--female-bg)" : "var(--bg-2)", border: "none", padding: "3px 7px", borderRadius: 6, fontSize: 11, cursor: rp.length === 0 ? "pointer" : "not-allowed", color: rp.length === 0 ? "var(--danger)" : "var(--border)" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" style={{ transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>
              </div>
              {isExpanded && (
                <div style={{ padding: "8px 12px", borderTop: "0.5px solid #e5e5e5" }}>
                  {rp.length ? rp.map((p, i) => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 4px", borderRadius: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 10, color: "var(--text-muted)", width: 18, textAlign: "center" }}>{i + 1}</span>
                      <Avatar name={p.name_ar} gender={p.gender} size={24} />
                      <span style={{ fontSize: 11, flex: 1 }}>{p.short_ar}</span>
                      <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 99, background: ROOM_COLORS[p.services.hotel_type]?.[0] || "var(--bg-2)", color: ROOM_COLORS[p.services.hotel_type]?.[1] || "var(--text-muted)" }}>{p.services.hotel_type} {p.services.hotel_view}</span>
                      {p.services.hotel_type !== room.type && <span style={{ fontSize: 9, color: "var(--warning)" }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>}
                      <select onChange={e => moveP(p.id, e.target.value)} defaultValue="" style={{ fontSize: 10, background: "var(--bg-2)", border: "0.5px solid #ddd", borderRadius: 4, padding: "2px 4px", fontFamily: "inherit" }}><option value="">نقل لـ...</option>{rooms.filter(r => r.id !== room.id).map(r => <option key={r.id} value={r.id}>غرفة {r.number}</option>)}</select>
                      <button onClick={() => removeP(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--border)", fontSize: 12 }}>✕</button>
                    </div>
                  )) : <div style={{ textAlign: "center", padding: "10px", color: "var(--text-muted)", fontSize: 11 }}>لا يوجد مسافرون</div>}
                </div>
              )}
            </div>
          );
          })}
        </div>
      )}
      <Modal show={showAdd} onClose={() => { setShowAdd(false); setNumberError(""); }} title="غرفة جديدة" maxWidth={340}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <div><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>رقم الغرفة</div><input style={{ ...inp, borderColor: numberError ? "var(--danger)" : "var(--border)" }} value={roomNumber} onChange={e => { setRoomNumber(e.target.value); setNumberError(""); }} autoFocus onKeyDown={e => e.key === "Enter" && addRoom()} />{numberError && <div style={{ fontSize: 10, color: "var(--danger)", marginTop: 3 }}>{numberError}</div>}</div>
          <div><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>الطابق</div><input style={inp} value={roomFloor} onChange={e => setRoomFloor(e.target.value)} placeholder="مثال: 16" /></div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>نوع الغرفة</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {ROOM_TYPES.map(t => { const [bg, clr] = ROOM_COLORS[t]; return <div key={t} onClick={() => setRoomType(t)} style={{ flex: 1, minWidth: "45%", padding: 7, borderRadius: 8, border: `1.5px solid ${roomType === t ? clr : "var(--border)"}`, background: roomType === t ? bg : "transparent", cursor: "pointer", textAlign: "center", fontSize: 11, color: roomType === t ? clr : "var(--text-muted)" }}>{t}</div>; })}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}><button onClick={addRoom} style={{ ...btnP(), flex: 1 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> إضافة</button><button onClick={() => { setShowAdd(false); setNumberError(""); }} style={btnS()}>إلغاء</button></div>
      </Modal>
      <Modal show={showRange} onClose={() => { setShowRange(false); setRangeError(""); }} title="إضافة نطاق غرف" maxWidth={360}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
          <div><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>من رقم</div><input style={inp} type="number" value={rangeFrom} onChange={e => { setRangeFrom(e.target.value); setRangeError(""); }} /></div>
          <div><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>إلى رقم</div><input style={inp} type="number" value={rangeTo} onChange={e => { setRangeTo(e.target.value); setRangeError(""); }} /></div>
          <div><div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>الطابق</div><input style={inp} value={rangeFloor} onChange={e => setRangeFloor(e.target.value)} /></div>
        </div>
        {rangeError && <div style={{ fontSize: 11, color: "var(--danger)", marginBottom: 8 }}>{rangeError}</div>}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>نوع الغرف</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {ROOM_TYPES.map(t => { const [bg, clr] = ROOM_COLORS[t]; return <div key={t} onClick={() => setRangeType(t)} style={{ flex: 1, minWidth: "45%", padding: 7, borderRadius: 8, border: `1.5px solid ${rangeType === t ? clr : "var(--border)"}`, background: rangeType === t ? bg : "transparent", cursor: "pointer", textAlign: "center", fontSize: 11, color: rangeType === t ? clr : "var(--text-muted)" }}>{t}</div>; })}
          </div>
        </div>
        {rangeFrom && rangeTo && parseInt(rangeFrom) <= parseInt(rangeTo) && <div style={{ fontSize: 11, color: "var(--em7)", marginBottom: 10, background: "rgba(125,31,60,.06)", padding: "6px 10px", borderRadius: 8 }}>سيتم إضافة {parseInt(rangeTo) - parseInt(rangeFrom) + 1} غرفة</div>}
        <div style={{ display: "flex", gap: 8 }}><button onClick={addRange} style={{ ...btnP(), flex: 1 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> إضافة</button><button onClick={() => { setShowRange(false); setRangeError(""); }} style={btnS()}>إلغاء</button></div>
      </Modal>
      <Modal show={showAddP} onClose={() => setShowAddP(false)} title={`إضافة مسافرين — غرفة ${currentRoom?.number}`}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-2)", border: "0.5px solid #ddd", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}>
          <span style={{ color: "var(--text-muted)" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21-4.35-4.35"/></svg></span>
          <input style={{ border: "none", background: "transparent", fontSize: 12, flex: 1, outline: "none", fontFamily: "inherit" }} placeholder="ابحث..." value={pSearch} onChange={e => setPSearch(e.target.value)} />
        </div>
        {filteredP.map(p => {
          const isInRoom = p.room_id === currentRoomId;
          const isAssigned = p.room_id != null && !isInRoom;
          const isSel = selectedP.has(p.id);
          const [reqBg, reqClr] = ROOM_COLORS[p.services.hotel_type] || ["var(--bg-2)", "var(--text-muted)"];
          return (
            <div key={p.id} onClick={() => !isAssigned && !isInRoom && toggleSelectP(p.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 8, marginBottom: 3, cursor: isAssigned || isInRoom ? "not-allowed" : "pointer", background: isSel ? "rgba(125,31,60,.08)" : "transparent", border: `0.5px solid ${isSel ? "var(--em7)" : "transparent"}`, opacity: isAssigned ? 0.4 : 1 }}>
              <Avatar name={p.name_ar} gender={p.gender} size={28} />
              <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 500 }}>{p.short_ar}</div><div style={{ fontSize: 10, color: "var(--text-muted)" }}>{isInRoom ? <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> في الغرفة</> : isAssigned ? "موزّع" : "غير موزّع"}</div></div>
              <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 99, background: reqBg, color: reqClr }}>{p.services.hotel_type} {p.services.hotel_view}</span>
              {isSel && <span style={{ color: "var(--em7)" }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg></span>}
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}><button onClick={confirmAddP} style={{ ...btnP(), flex: 1 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> إضافة ({selectedP.size})</button><button onClick={() => setShowAddP(false)} style={btnS()}>إلغاء</button></div>
      </Modal>
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
              {floors.map(f => <div key={f} onClick={() => setPrintFloor(f)} style={{ padding: "5px 12px", borderRadius: 99, border: `1.5px solid ${printFloor === f ? "var(--em7)" : "var(--border)"}`, background: printFloor === f ? "rgba(125,31,60,.08)" : "transparent", cursor: "pointer", fontSize: 12, color: printFloor === f ? "var(--em7)" : "var(--text-muted)" }}>طابق {f}</div>)}
            </div>
          </div>
        )}
        {printFilter === "type" && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>اختر نوع الغرفة</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {ROOM_TYPES.map(t => { const [bg, clr] = ROOM_COLORS[t]; return <div key={t} onClick={() => setPrintType(t)} style={{ flex: 1, padding: 6, borderRadius: 8, border: `1.5px solid ${printType === t ? clr : "var(--border)"}`, background: printType === t ? bg : "transparent", cursor: "pointer", textAlign: "center", fontSize: 11, color: printType === t ? clr : "var(--text-muted)" }}>{t}</div>; })}
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}><button onClick={handlePrint} style={{ ...btnP(), flex: 1 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> طباعة</button><button onClick={() => setShowPrint(false)} style={btnS()}>إلغاء</button></div>
      </Modal>
    </div>
  );
}



export { HotelStats, HotelPage };
