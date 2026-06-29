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
  const [filterFloor, setFilterFloor] = useState("الكل");
  const [filterStatus, setFilterStatus] = useState("الكل");
  const [search, setSearch] = useState("");
  const [showAddRoom, setShowAddRoom] = useState(false);
  const [showAddPilgrim, setShowAddPilgrim] = useState(false);
  const [pSearch, setPSearch] = useState("");

  // Add Room form
  const [addNum, setAddNum] = useState("");
  const [addFloor, setAddFloor] = useState("");
  const [addType, setAddType] = useState<Room["type"]>("ثنائية");
  const [addNotes, setAddNotes] = useState("");

  // Panel notes
  const [panelNotes, setPanelNotes] = useState("");
  const [panelType, setPanelType] = useState<Room["type"]>("ثنائية");

  useEffect(() => {
    supabase.from("rooms").select("*")
      .then(({ data }: any) => { if (data) setRooms((data as Room[]).sort((a,b) => (parseInt(a.floor)||0) - (parseInt(b.floor)||0) || (parseInt(a.number)||0) - (parseInt(b.number)||0) || a.number.localeCompare(b.number))); });
  }, []);

  const floors = useMemo(() => {
    const fs = [...new Set(rooms.map(r => r.floor))].sort((a, b) => parseInt(a) - parseInt(b) || a.localeCompare(b));
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
    "ممتلئة": primary,
    "جزئية": "#D4A017",
    "فارغة": "#2A9D8F",
    "مجلس": "#3F51B5",
  };

  const filteredRooms = useMemo(() => {
    return rooms.filter(r => {
      if (filterFloor !== "الكل" && r.floor !== filterFloor) return false;
      if (filterStatus !== "الكل" && getStatus(r) !== filterStatus) return false;
      if (search) {
        const q = search.trim();
        if (r.number.includes(q)) return true;
        return roomPassengers(r.id).some(p => p.name_ar.includes(q) || (p.short_ar || "").includes(q));
      }
      return true;
    });
  }, [rooms, filterFloor, filterStatus, search, passengers]);

  // KPIs
  const totalRooms = rooms.length;
  const emptyRooms = rooms.filter(r => getStatus(r) === "فارغة").length;
  const withRoom = hajj.filter(p => (p as any).room_id).length;
  const withoutRoom = hajj.filter(p => !(p as any).room_id).length;
  const pct = hajj.length > 0 ? Math.round(withRoom / hajj.length * 100) : 0;

  const addRoom = async () => {
    if (!addNum.trim() || !addFloor.trim()) { showAlert("error", "رقم الغرفة والدور مطلوبان"); return; }
    const { data, error } = await supabase.from("rooms").insert([{ number: addNum.trim(), floor: addFloor.trim(), type: addType, notes: addNotes.trim() || null }]).select();
    if (error) { showAlert("error", "حدث خطأ أثناء الإضافة"); return; }
    setRooms(prev => [...prev, ...(data as Room[])].sort((a,b) => (parseInt(a.floor)||0) - (parseInt(b.floor)||0) || (parseInt(a.number)||0) - (parseInt(b.number)||0) || a.number.localeCompare(b.number)));
    setAddNum(""); setAddFloor(""); setAddType("ثنائية"); setAddNotes("");
    setShowAddRoom(false);
    showAlert("success", "تمت إضافة الغرفة");
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
    showAlert("success", "تم حذف الغرفة");
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
    showAlert("success", "تم حفظ الملاحظات");
  };

  const openPanel = (room: Room) => {
    setSelectedRoom(room);
    setPanelType(room.type);
    setPanelNotes((room as any).notes || "");
    setShowAddPilgrim(false);
    setPSearch("");
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

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, padding: "12px 12px 0", flexShrink: 0 }}>
          {[
            { label: "إجمالي الغرف", num: totalRooms, color: primary },
            { label: "نسبة الإشغال", num: pct + "٪", color: primary },
            { label: "غرف فارغة", num: emptyRooms, color: "#2A9D8F" },
            { label: "بدون غرفة", num: withoutRoom, color: withoutRoom > 0 ? "#C8730A" : "#2A9D8F" },
          ].map(k => (
            <div key={k.label} style={{ background: "var(--paper)", border: `1px solid ${k.color}33`, borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600, marginBottom: 2 }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: k.color, lineHeight: 1 }}>{k.num}</div>
            </div>
          ))}
        </div>

        {/* ملخص أنواع الغرف */}
        {(() => {
          const types = ["فردية", "ثنائية", "ثلاثية", "رباعية", "سويت", "مجلس"];
          const TYPE_COLORS: Record<string, string> = { فردية: "#7D1F3C", ثنائية: "#0C5FA8", ثلاثية: "#2A9D8F", رباعية: "#E65100", سويت: "#6A0DAD", مجلس: "#3F51B5" };
          return (
            <div style={{ display: "flex", gap: 6, padding: "8px 12px 0", flexShrink: 0, overflowX: "auto" }}>
              {types.map(type => {
                const typeRooms = rooms.filter(r => r.type === type);
                if (typeRooms.length === 0) return null;

                const color = TYPE_COLORS[type] || "var(--primary)";
                return (
                  <div key={type} style={{ display: "flex", alignItems: "center", gap: 7, background: "var(--paper)", border: `1px solid ${color}30`, borderRadius: 9, padding: "6px 11px", flexShrink: 0, borderRight: `3px solid ${color}` }}>
                    <div>
                      <div style={{ fontSize: 9, color: "var(--muted)", fontWeight: 600 }}>{type}</div>
                      <div style={{ fontSize: 13, fontWeight: 900, color, lineHeight: 1.1 }}>{typeRooms.length} <span style={{ fontSize: 9, fontWeight: 600, color: "var(--muted)" }}>غرفة</span></div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Toolbar */}
        <div style={{ display: "flex", gap: 8, padding: "10px 12px", flexShrink: 0, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={() => setShowAddRoom(true)} style={{ ...btnP, display: "flex", alignItems: "center", gap: 5 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            غرفة جديدة
          </button>
          <select value={filterFloor} onChange={e => setFilterFloor(e.target.value)} style={{ ...inp, width: "auto", flex: 1 }}>
            <option>الكل</option>
            {floors.map(f => <option key={f}>{f}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inp, width: "auto", flex: 1 }}>
            {["الكل","ممتلئة","جزئية","فارغة","مجلس"].map(s => <option key={s}>{s}</option>)}
          </select>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث عن غرفة أو حاج..." style={{ ...inp, flex: 2 }} />
        </div>

        {/* Rooms Grid */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 12px" }}>
          {floors.filter(f => filterFloor === "الكل" || f === filterFloor).map(floor => {
            const floorRooms = filteredRooms.filter(r => r.floor === floor);
            if (floorRooms.length === 0) return null;
            return (
              <div key={floor} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: ".06em", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                  الطابق {floor}
                  <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
                </div>
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
                        style={{ background: isMajlis ? "rgba(63,81,181,0.04)" : "var(--paper)", border: `1.5px solid ${isSelected ? color : isMajlis ? "rgba(63,81,181,0.3)" : "var(--line)"}`, borderRadius: 10, padding: "10px 10px 8px", cursor: "pointer", transition: "all .15s", position: "relative", boxShadow: isSelected ? `0 4px 14px ${color}22` : "none" }}>
                        {/* نقطة الحالة */}
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, position: "absolute", top: 8, left: 8 }} />
                        {/* رقم الغرفة */}
                        <div style={{ fontSize: 22, fontWeight: 900, color: "var(--primary)", lineHeight: 1, marginBottom: 3 }}>{room.number}</div>
                        {/* النوع */}
                        <div style={{ fontSize: 10, color: isMajlis ? "#3F51B5" : "var(--muted)", fontWeight: 700, marginBottom: 6 }}>{room.type}</div>
                        {/* الأسماء */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          {isMajlis ? (
                            <div style={{ fontSize: 10, color: "#3F51B5", fontWeight: 700 }}>مجلس الحجاج</div>
                          ) : occ.length === 0 ? (
                            <div style={{ fontSize: 10, color: "#2A9D8F", fontWeight: 700 }}>فارغة</div>
                          ) : (
                            occ.map(p => (
                              <div key={p.id} style={{ fontSize: 10, color: "var(--ink)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 3 }}>
                                <div style={{ width: 3, height: 3, borderRadius: "50%", background: color, flexShrink: 0 }} />
                                {p.short_ar || p.name_ar.split(" ").slice(0,2).join(" ")}
                              </div>
                            ))
                          )}
                        </div>
                        {/* العدد */}
                        {!isMajlis && (
                          <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 5, fontWeight: 600 }}>{occ.length}/{cap}</div>
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
                <div style={{ fontSize: 22, fontWeight: 900, color: primary, lineHeight: 1 }}>غرفة {selectedRoom.number}</div>
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
            <button onClick={() => setShowAddPilgrim(!showAddPilgrim)}
              style={{ width: "100%", padding: "9px", borderRadius: 9, border: `1.5px dashed var(--line)`, background: "transparent", color: primary, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 4, transition: "all .15s" }}>
              + إضافة حاج للغرفة
            </button>

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
          <div style={{ padding: "10px 14px", borderTop: "1px solid var(--line)", display: "flex", gap: 8, flexShrink: 0 }}>
            <button onClick={() => deleteRoom(selectedRoom)} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "1px solid #fce8e8", background: "#fff0f0", color: "#C62828", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)" }}>
              حذف الغرفة
            </button>
          </div>
        </div>
      )}

      {/* ===== مودال إضافة غرفة ===== */}
      {showAddRoom && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={e => { if (e.target === e.currentTarget) setShowAddRoom(false); }}>
          <div style={{ background: "var(--paper)", borderRadius: 16, padding: 24, width: 360, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--ink)", marginBottom: 18 }}>إضافة غرفة جديدة</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>رقم الغرفة</div>
                <input value={addNum} onChange={e => setAddNum(e.target.value)} style={inp} autoFocus placeholder="مثال: 1201" />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>الدور</div>
                <input value={addFloor} onChange={e => setAddFloor(e.target.value)} style={inp} placeholder="مثال: 12" />
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>نوع الغرفة</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {ROOM_TYPES.map(t => (
                  <button key={t} onClick={() => setAddType(t)}
                    style={{ padding: "5px 11px", borderRadius: 99, border: "1.5px solid", borderColor: addType === t ? primary : "var(--line)", background: addType === t ? primary : "var(--paper)", color: addType === t ? "#fff" : "var(--ink)", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)" }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>ملاحظة (اختياري)</div>
              <input value={addNotes} onChange={e => setAddNotes(e.target.value)} style={inp} placeholder="ملاحظات على الغرفة..." />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={addRoom} style={{ ...btnP, flex: 1 }}>إضافة</button>
              <button onClick={() => setShowAddRoom(false)} style={{ ...btnS, flex: 1 }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { HotelPage };
