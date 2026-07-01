import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import type { Passenger, Room } from "../types";
import { useConfig } from "../config/ConfigContext";
import { AlertModal, useAlert } from "./AlertModal";

const ROOM_TYPES: Room["type"][] = ["فردية", "ثنائية", "ثلاثية", "رباعية", "مجلس", "أخرى"];

const TYPE_CAP: Record<string, number> = {
  "فردية": 1, "ثنائية": 2, "ثلاثية": 3, "رباعية": 4, "مجلس": 0, "أخرى": 0,
};

function avatarInitials(name: string) {
  return name.trim().split(" ").map(w => w[0]).slice(0, 2).join("");
}

function HotelPage({ passengers, setPassengers }: { passengers: Passenger[]; setPassengers: (p: Passenger[]) => void }) {
  const config = useConfig();
  const primary = config.color_primary || "#7D1F3C";
  const { alert, showAlert } = useAlert();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [filterFloor, setFilterFloor] = useState("الكل");  // سيتم تعيينه بأول طابق عند التحميل
  const [filterStatus, setFilterStatus] = useState("الكل");
  const [filterType, setFilterType] = useState<string|null>(null);
  const [search, setSearch] = useState("");
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [showAddPilgrim, setShowAddPilgrim] = useState(false);
  const [pSearch, setPSearch] = useState("");

  // Add Room form
  const [addMode, setAddMode] = useState<"single"|"range"|"template">("single");
  const [addNum, setAddNum] = useState("");
  const [addFloor, setAddFloor] = useState("");
  const [addType, setAddType] = useState<Room["type"]>("ثنائية");
  const [addNotes, setAddNotes] = useState("");
  // Range mode
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [rangeFloor, setRangeFloor] = useState("");
  const [rangeType, setRangeType] = useState<Room["type"]>("ثنائية");
  // Template mode
  const [tplFloors, setTplFloors] = useState("");
  const [tplRoomsPerFloor, setTplRoomsPerFloor] = useState("");
  const [tplStartNum, setTplStartNum] = useState("");
  const [tplType, setTplType] = useState<Room["type"]>("ثنائية");
  const [tplFloorStart, setTplFloorStart] = useState("");

  // Panel notes
  const [panelNotes, setPanelNotes] = useState("");
  const [panelType, setPanelType] = useState<Room["type"]>("ثنائية");
  const [editingRoomNum, setEditingRoomNum] = useState(false);
  const [newRoomNum, setNewRoomNum] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<typeof selectedRoom | null>(null);

  useEffect(() => {
    supabase.from("rooms").select("*")
      .then(({ data }: any) => { if (data) setRooms((data as Room[]).sort((a,b) => (parseInt(a.floor)||0) - (parseInt(b.floor)||0) || (parseInt(a.number)||0) - (parseInt(b.number)||0) || a.number.localeCompare(b.number))); });
  }, []);

  const floors = useMemo(() => {
    const fs = [...new Set(rooms.map(r => r.floor))].sort((a, b) => parseInt(a) - parseInt(b) || a.localeCompare(b));
    if (fs.length > 0 && filterFloor === "الكل") setFilterFloor(fs[0]);
    return fs;
  }, [rooms]);

  const hajj = passengers.filter(p => !p.passenger_type || p.passenger_type === "حاج");

  const roomPassengers = (roomId: number) =>
    hajj.filter(p => (p as any).room_id === roomId);

  const unassigned = hajj.filter(p => !(p as any).room_id);

  const getStatus = (room: Room) => {
    const cap = TYPE_CAP[room.type] || 0;
    const occ = roomPassengers(room.id).length;
    if (cap === 0 || room.type === "مجلس") return "مجلس";
    if (occ === 0) return "فارغة";
    if (occ >= cap) return "ممتلئة";
    return "جزئية";
  };

  const statusColor: Record<string, string> = {
    "ممتلئة": "#7D1F3C",
    "جزئية": "#D97706",
    "فارغة": "#059669",
    "مجلس": "#7C3AED",
  };
  const statusBg: Record<string, string> = {
    "ممتلئة": "#f8f8fa",
    "جزئية": "#ffffff",
    "فارغة": "#ffffff",
    "مجلس": "#f5f3ff",
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
  const withRoom = hajj.filter(p => (p as any).room_id).length;
  const pct = hajj.length > 0 ? Math.round(withRoom / hajj.length * 100) : 0;

  const addRoom = async () => {
    if (!addNum.trim() || !addFloor.trim()) { showAlert("error", "رقم الغرفة والدور مطلوبان"); return; }
    const { data, error } = await supabase.from("rooms").insert([{ number: addNum.trim(), floor: addFloor.trim(), type: addType, notes: addNotes.trim() || null }]).select();
    if (error) { showAlert("error", "حدث خطأ أثناء الإضافة"); return; }
    setRooms(prev => [...prev, ...(data as Room[])].sort((a,b) => (parseInt(a.floor)||0) - (parseInt(b.floor)||0) || (parseInt(a.number)||0) - (parseInt(b.number)||0) || a.number.localeCompare(b.number)));
    setAddNum(""); setAddFloor(""); setAddType("ثنائية"); setAddNotes("");
    setShowAddRoom(false);
    showAlert("success", "تمت إضافة الغرفة"); setTimeout(() => showAlert(null), 2500);
  };

  const addRoomRange = async () => {
    const from = parseInt(rangeFrom), to = parseInt(rangeTo);
    if (!rangeFloor.trim() || isNaN(from) || isNaN(to) || from > to) { showAlert("error", "يرجى إدخال نطاق صحيح ودور صحيح"); return; }
    const entries = Array.from({ length: to - from + 1 }, (_, i) => ({ number: String(from + i), floor: rangeFloor.trim(), type: rangeType }));
    const { data, error } = await supabase.from("rooms").insert(entries).select();
    if (error) { showAlert("error", "حدث خطأ أثناء الإضافة"); return; }
    setRooms(prev => [...prev, ...(data as Room[])].sort((a,b) => (parseInt(a.floor)||0)-(parseInt(b.floor)||0)||(parseInt(a.number)||0)-(parseInt(b.number)||0)));
    setRangeFrom(""); setRangeTo(""); setRangeFloor(""); setShowAddRoom(false);
    showAlert("success", `تمت إضافة ${entries.length} غرفة`);
  };

  const addRoomTemplate = async () => {
    const numFloors = parseInt(tplFloors), rPerFloor = parseInt(tplRoomsPerFloor);
    const startNum = parseInt(tplStartNum), floorStart = parseInt(tplFloorStart);
    if (isNaN(numFloors)||isNaN(rPerFloor)||isNaN(startNum)||isNaN(floorStart)||numFloors<1||rPerFloor<1) { showAlert("error", "يرجى تعبئة جميع الحقول بشكل صحيح"); return; }
    const entries: {number:string;floor:string;type:Room["type"]}[] = [];
    for (let f = 0; f < numFloors; f++) {
      for (let r = 0; r < rPerFloor; r++) {
        entries.push({ number: String(startNum + f * rPerFloor + r), floor: String(floorStart + f), type: tplType });
      }
    }
    const { data, error } = await supabase.from("rooms").insert(entries).select();
    if (error) { showAlert("error", "حدث خطأ أثناء الإضافة"); return; }
    setRooms(prev => [...prev, ...(data as Room[])].sort((a,b) => (parseInt(a.floor)||0)-(parseInt(b.floor)||0)||(parseInt(a.number)||0)-(parseInt(b.number)||0)));
    setTplFloors(""); setTplRoomsPerFloor(""); setTplStartNum(""); setTplFloorStart(""); setShowAddRoom(false);
    showAlert("success", `تمت إضافة ${entries.length} غرفة`);
  };

  const removeFromRoom = async (pId: number) => {
    await supabase.from("passengers").update({ room_id: null }).eq("id", pId);
    setPassengers(passengers.map(p => p.id === pId ? { ...p, room_id: null } as any : p));
  };

  const addToRoom = async (pId: number) => {
    if (!selectedRoom) return;
    await supabase.from("passengers").update({ room_id: selectedRoom.id }).eq("id", pId);
    setPassengers(passengers.map(p => p.id === pId ? { ...p, room_id: selectedRoom.id } as any : p));
    setShowAddPilgrim(false);
    setPSearch("");
  };

  const deleteRoom = async (room: Room) => {
    const occ = roomPassengers(room.id);
    if (occ.length > 0) { showAlert("error", "لا يمكن حذف غرفة بها حجاج"); return; }
    await supabase.from("rooms").delete().eq("id", room.id);
    setRooms(prev => prev.filter(r => r.id !== room.id));
    setSelectedRoom(null);
    showAlert("success", "تم حذف الغرفة"); setTimeout(() => showAlert(null), 2500);
  };

  const saveRoomType = async (type: Room["type"]) => {
    if (!selectedRoom) return;
    await supabase.from("rooms").update({ type }).eq("id", selectedRoom.id);
    setRooms(prev => prev.map(r => r.id === selectedRoom.id ? { ...r, type } : r));
    setSelectedRoom(prev => prev ? { ...prev, type } : prev);
  };

  const saveNotes = async () => {
    if (!selectedRoom) return;
    await supabase.from("rooms").update({ notes: panelNotes || null }).eq("id", selectedRoom.id);
    setRooms(prev => prev.map(r => r.id === selectedRoom.id ? { ...r, notes: panelNotes || null } : r));
    showAlert("success", "تم حفظ الملاحظات"); setTimeout(() => showAlert(null), 2500);
  };

  const saveRoomNumber = async () => {
    if (!selectedRoom || !newRoomNum.trim()) return;
    await supabase.from("rooms").update({ number: newRoomNum.trim() }).eq("id", selectedRoom.id);
    setRooms(prev => prev.map(r => r.id === selectedRoom.id ? { ...r, number: newRoomNum.trim() } : r).sort((a,b) => (parseInt(a.floor)||0)-(parseInt(b.floor)||0)||(parseInt(a.number)||0)-(parseInt(b.number)||0)));
    setSelectedRoom(prev => prev ? { ...prev, number: newRoomNum.trim() } : prev);
    setEditingRoomNum(false);
    showAlert("success", "تم تعديل رقم الغرفة"); setTimeout(() => showAlert(null), 2500);
  };

  const openPanel = (room: Room) => {
    setSelectedRoom(room);
    setPanelType(room.type);
    setPanelNotes((room as any).notes || "");
    setShowAddPilgrim(false);
    setPSearch("");
    setEditingRoomNum(false);
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

        {/* KPIs + Donut — ألوان جريئة ثابتة */}
        <div style={{ display: "flex", gap: 10, padding: "12px 12px 0", flexShrink: 0, alignItems: "stretch" }}>
          {/* كروت KPI */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, flex: 1 }}>
            {[
              { label: "إجمالي الغرف", num: String(totalRooms), sub: "غرفة مسجلة", grad: "linear-gradient(135deg,#6C3CE1,#9B59B6)", shadow: "rgba(108,60,225,.35)", icon: `<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>`, onClick: () => { setFilterType(null); setFilterStatus("الكل"); setFilterFloor("الكل"); } },
              { label: "حجاج موزعين", num: `${withRoom}`, sub: `من ${hajj.length} حاج`, grad: "linear-gradient(135deg,#0EA5E9,#0284C7)", shadow: "rgba(14,165,233,.35)", icon: `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`, onClick: () => {} },
              { label: "غرف متاحة", num: String(rooms.filter(r => { const c = TYPE_CAP[r.type]||0; return c > 0 && roomPassengers(r.id).length < c; }).length), sub: "فيها مساحة", grad: "linear-gradient(135deg,#F59E0B,#D97706)", shadow: "rgba(245,158,11,.35)", icon: `<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>`, onClick: () => { setFilterType(null); setFilterStatus("جزئية"); setFilterFloor("الكل"); } },
            ].map(k => (
              <div key={k.label} onClick={k.onClick} style={{ background: k.grad, borderRadius: 16, padding: "14px 16px", cursor: "pointer", transition: "transform .15s", boxShadow: `0 6px 18px ${k.shadow}`, position: "relative", overflow: "hidden" }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = "none"; }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(255,255,255,.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" dangerouslySetInnerHTML={{ __html: k.icon }} />
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.85)", fontWeight: 700 }}>{k.label}</div>
                </div>
                <div style={{ fontSize: 36, fontWeight: 900, color: "white", lineHeight: 1, letterSpacing: "-1.5px" }}>{k.num}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,.75)", fontWeight: 600, marginTop: 4 }}>{k.sub}</div>
              </div>
            ))}
          </div>
          {/* دائرة نسبة التوزيع */}
          <div style={{ background: `linear-gradient(135deg,${primary},${primary}cc)`, borderRadius: 16, padding: "14px 18px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0, minWidth: 110, boxShadow: `0 6px 18px ${primary}44` }}>
            {(() => {
              const r = 32, circ = 2 * Math.PI * r;
              const stroke = circ * pct / 100;
              return (
                <>
                  <svg width="84" height="84" viewBox="0 0 84 84">
                    <circle cx="42" cy="42" r={r} fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="8"/>
                    <circle cx="42" cy="42" r={r} fill="none" stroke="white" strokeWidth="8"
                      strokeDasharray={`${stroke} ${circ}`}
                      strokeLinecap="round"
                      transform="rotate(-90 42 42)"
                    />
                    <text x="42" y="47" textAnchor="middle" fontSize="15" fontWeight="900" fill="white">{pct}٪</text>
                  </svg>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.85)", fontWeight: 700, marginTop: 5 }}>نسبة التوزيع</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,.65)", marginTop: 1 }}>{withRoom} من {hajj.length}</div>
                </>
              );
            })()}
          </div>
        </div>

        {/* Row 1: كروت أنواع الغرف + بحث + فلتر + إضافة */}
        <div style={{ display: "flex", gap: 6, padding: "8px 12px 0", flexShrink: 0, alignItems: "center", flexWrap: "wrap" }}>
          {/* كروت الأنواع */}
          {(["فردية","ثنائية","ثلاثية","رباعية","سويت","مجلس"] as const).map(type => {
            const typeRooms = rooms.filter(r => r.type === type);
            if (typeRooms.length === 0) return null;
            const TYPE_COLORS: Record<string,string> = { فردية:"#7D1F3C",ثنائية:"#0C5FA8",ثلاثية:"#2A9D8F",رباعية:"#E65100",سويت:"#6A0DAD",مجلس:"#3F51B5" };
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
            {["الكل","ممتلئة","جزئية","فارغة"].map(s => <option key={s}>{s}</option>)}
          </select>
          {/* إضافة */}
          <button onClick={() => setShowAddRoom(true)} style={{ ...btnP, display:"flex",alignItems:"center",gap:5,flexShrink:0 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            غرفة جديدة
          </button>
        </div>

        {/* Row 2: أزرار الأدوار */}
        <div style={{ display:"flex",gap:4,padding:"6px 12px 0",flexShrink:0,overflowX:"auto" }}>
          <button onClick={() => setFilterFloor("الكل")}
            style={{ padding:"4px 12px",borderRadius:99,border: filterFloor==="الكل"?"1.5px solid var(--primary)":"1.5px solid var(--line)",background: filterFloor==="الكل"?"var(--primary)":"var(--paper)",color: filterFloor==="الكل"?"white":"var(--muted)",fontFamily:"var(--font-body)",fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0,transition:"all .15s" }}>
            الكل
          </button>
          {floors.map(f => (
            <button key={f} onClick={() => setFilterFloor(f)}
              style={{ padding:"4px 12px",borderRadius:99,border: filterFloor===f?"1.5px solid var(--primary)":"1.5px solid var(--line)",background: filterFloor===f?"var(--primary)":"var(--paper)",color: filterFloor===f?"white":"var(--muted)",fontFamily:"var(--font-body)",fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0,transition:"all .15s" }}>
              ط{f}
            </button>
          ))}
        </div>

        {/* Rooms Grid */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 12px" }}>
          {floors.filter(f => filterFloor === "الكل" || f === filterFloor).map(floor => {
            const floorRooms = filteredRooms.filter(r => r.floor === floor);
            if (floorRooms.length === 0) return null;
            return (
              <div key={floor} style={{ marginBottom: 16 }}>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                  {floorRooms.map(room => {
                    const occ = roomPassengers(room.id);
                    const cap = TYPE_CAP[room.type] || 0;
                    const status = getStatus(room);
                    const color = statusColor[status] || primary;
                    const isSelected = selectedRoom?.id === room.id;
                    const isMajlis = room.type === "مجلس";

                    return (
                      <div key={room.id} onClick={() => openPanel(room)}
                        style={{ background: statusBg[status] || "var(--paper)", border: `1.5px solid ${color}`, borderRadius: 12, padding: "10px 10px 8px", cursor: "pointer", transition: "all .18s", position: "relative", boxShadow: isSelected ? `0 6px 18px ${color}30` : `0 1px 4px ${color}12`, transform: isSelected ? "translateY(-2px)" : "none" }}
                        onMouseEnter={e => { if (!isSelected) { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 6px 18px ${color}25`; } }}
                        onMouseLeave={e => { if (!isSelected) { (e.currentTarget as HTMLDivElement).style.transform = "none"; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 1px 4px ${color}12`; } }}>
                        {/* نقطة الحالة */}
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, position: "absolute", top: 9, left: 9 }} />
                        {/* رقم الغرفة */}
                        <div style={{ fontSize: 22, fontWeight: 900, color, lineHeight: 1, marginBottom: 5 }}>{room.number}</div>
                        {/* النوع + شارة الحالة */}
                        {!isMajlis && (
                          <div style={{ display:"flex",alignItems:"center",gap:5,marginBottom:7 }}>
                            <span style={{ fontSize:10,color:"var(--muted)",fontWeight:700 }}>{room.type}</span>
                            <span style={{ fontSize:9,fontWeight:800,padding:"2px 7px",borderRadius:99,background:`${color}18`,color }}>
                              {status === "فارغة" ? "✓ فارغة" : status === "جزئية" ? "جزئية" : "مكتملة"}
                            </span>
                          </div>
                        )}
                        {isMajlis && <span style={{ fontSize:9,fontWeight:800,padding:"2px 7px",borderRadius:99,background:`${color}18`,color,marginBottom:7,display:"inline-block" }}>مجلس الحجاج</span>}
                        {/* الأسماء */}
                        <div style={{ display:"flex",flexDirection:"column",gap:3,flex:1 }}>
                          {isMajlis ? null : occ.length === 0 ? null : (
                            occ.map(p => (
                              <div key={p.id} style={{ fontSize: occ.length <= 2 ? 12 : 10, color:"var(--ink)",fontWeight: occ.length <= 2 ? 700 : 600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",display:"flex",alignItems:"center",gap:4 }}>
                                <div style={{ width:3,height:3,borderRadius:"50%",background:color,flexShrink:0,opacity:status==="ممتلئة"?0.5:1 }} />
                                {p.short_ar || p.name_ar.split(" ").slice(0,2).join(" ")}
                              </div>
                            ))
                          )}
                        </div>
                        {/* شريط الإشغال */}
                        {!isMajlis && (
                          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:"auto",paddingTop:6,borderTop:`1px solid ${color}15` }}>
                            <div style={{ flex:1,height:3,borderRadius:99,background:`${color}15`,overflow:"hidden",marginLeft:8 }}>
                              <div style={{ height:"100%",borderRadius:99,background:color,width:`${cap?Math.min(100,(occ.length/cap)*100):0}%` }} />
                            </div>
                            <span style={{ fontSize:10,fontWeight:800,color }}>{occ.length}/{cap}</span>
                          </div>
                        )}
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
          {/* Header */}
          <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {editingRoomNum ? (
                    <>
                      <input value={newRoomNum} onChange={e => setNewRoomNum(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveRoomNumber(); if (e.key === "Escape") setEditingRoomNum(false); }}
                        style={{ width: 80, fontSize: 16, fontWeight: 900, color: primary, border: "none", borderBottom: `2px solid ${primary}`, outline: "none", background: "transparent", fontFamily: "var(--font-body)", textAlign: "right" }}
                        autoFocus />
                      <button onClick={saveRoomNumber} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, border: "none", background: primary, color: "white", cursor: "pointer", fontFamily: "var(--font-body)", fontWeight: 700 }}>حفظ</button>
                      <button onClick={() => setEditingRoomNum(false)} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, border: "1px solid var(--line)", background: "transparent", cursor: "pointer", fontFamily: "var(--font-body)" }}>إلغاء</button>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 22, fontWeight: 900, color: primary, lineHeight: 1 }}>غرفة {selectedRoom.number}</div>
                      <button onClick={() => { setEditingRoomNum(true); setNewRoomNum(selectedRoom.number); }}
                        style={{ width: 22, height: 22, borderRadius: 6, border: "1px solid var(--line)", background: "var(--ivory)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                      </button>
                    </>
                  )}
                </div>
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 3 }}>الطابق {selectedRoom.floor}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: `${primary}11`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={primary} strokeWidth="1.7"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>
                </div>
                <button onClick={() => setSelectedRoom(null)} style={{ width: 28, height: 28, borderRadius: 7, border: "1px solid var(--line)", background: "var(--paper)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "var(--muted)" }}>×</button>
              </div>
            </div>
            {/* النوع selector */}
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {ROOM_TYPES.map(t => (
                <button key={t} onClick={() => { setPanelType(t); saveRoomType(t); }}
                  style={{ padding: "4px 8px", borderRadius: 99, border: "1.5px solid", borderColor: panelType === t ? primary : "var(--line)", background: panelType === t ? primary : "var(--paper)", color: panelType === t ? "#fff" : "var(--ink)", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)", transition: "all .12s" }}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* KPI mini */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, padding: "10px 14px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
            {[
              { label: "الدور", val: selectedRoom.floor },
              { label: "الوضع", val: getStatus(selectedRoom), color: statusColor[getStatus(selectedRoom)] },
              { label: "عدد الحجاج", val: `${roomPassengers(selectedRoom.id).length}/${TYPE_CAP[selectedRoom.type] || "—"}` },
            ].map(k => (
              <div key={k.label} style={{ background: "var(--ivory)", borderRadius: 8, padding: "7px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 600, marginBottom: 2 }}>{k.label}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: k.color || "var(--ink)" }}>{k.val}</div>
              </div>
            ))}
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: ".05em", marginBottom: 8 }}>الحجاج الموجودون</div>
            {roomPassengers(selectedRoom.id).length === 0 ? (
              <div style={{ textAlign: "center", padding: "16px 0", color: "var(--muted)", fontSize: 12 }}>لا يوجد حجاج في هذه الغرفة</div>
            ) : (
              roomPassengers(selectedRoom.id).map((p, i) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line)", marginBottom: 6, background: "var(--ivory)" }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: `linear-gradient(135deg,${primary},${primary}99)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                    {avatarInitials(p.name_ar)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name_ar}</div>
                    <div style={{ fontSize: 10, color: "var(--muted)" }}>{p.passport || p.national_id || "—"}</div>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginLeft: 2 }}>{i + 1}</div>
                  <button onClick={() => removeFromRoom(p.id)} style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid #fce8e8", background: "#fff0f0", color: "#C62828", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>×</button>
                </div>
              ))
            )}

            {/* إضافة حاج */}
            {selectedRoom.type !== "مجلس" && <button onClick={() => setShowAddPilgrim(!showAddPilgrim)}
              style={{ width: "100%", padding: "9px", borderRadius: 9, border: `1.5px dashed var(--line)`, background: "transparent", color: primary, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 4, transition: "all .15s" }}>
              + إضافة حاج للغرفة
            </button>}

            {showAddPilgrim && (
              <div style={{ marginTop: 8, border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
                <input value={pSearch} onChange={e => setPSearch(e.target.value)} placeholder="ابحث في الحجاج..." style={{ ...inp, borderRadius: 0, borderWidth: "0 0 1px 0", fontSize: 12 }} />
                <div style={{ maxHeight: 150, overflowY: "auto" }}>
                  {unassigned.filter(p => !pSearch || p.name_ar.includes(pSearch)).slice(0, 20).map(p => (
                    <div key={p.id} onClick={() => addToRoom(p.id)}
                      style={{ padding: "8px 12px", cursor: "pointer", fontSize: 12, color: "var(--ink)", borderBottom: "1px solid var(--ivory)", fontWeight: 600 }}
                      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "var(--ivory)"}
                      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = ""}>
                      {p.name_ar}
                    </div>
                  ))}
                  {unassigned.filter(p => !pSearch || p.name_ar.includes(pSearch)).length === 0 && (
                    <div style={{ padding: "12px", textAlign: "center", color: "var(--muted)", fontSize: 12 }}>لا يوجد حجاج غير موزعين</div>
                  )}
                </div>
              </div>
            )}

            {/* ملاحظات */}
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: ".05em", marginBottom: 6 }}>ملاحظات</div>
              <textarea value={panelNotes} onChange={e => setPanelNotes(e.target.value)}
                placeholder="أضف ملاحظات على الغرفة..."
                style={{ ...inp, resize: "none", height: 70, fontSize: 12 }} />
              <button onClick={saveNotes} style={{ ...btnP, width: "100%", marginTop: 6, fontSize: 11 }}>حفظ الملاحظات</button>
            </div>
          </div>

          {/* Actions */}
          <div style={{ padding: "10px 14px", borderTop: "1px solid var(--line)", flexShrink: 0 }}>
            <div style={{ fontSize: 9, color: "var(--muted)", textAlign: "center", marginBottom: 6, fontWeight: 600 }}>⚠️ تأكيد قبل الحذف</div>
            <button onClick={() => setConfirmDelete(selectedRoom)}
              style={{ width: "100%", padding: "8px", borderRadius: 8, border: "1px solid #fce8e8", background: "#fff0f0", color: "#C62828", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)" }}>
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
