// ═══════════════════════════════════════════════════════════
// البحث الموحّد في الفنادق — حاجٌّ بالاسم أو الجواز، وغرفةٌ برقمها
// ═══════════════════════════════════════════════════════════
// قراءةٌ فقط: الحجّاجُ والغرفُ ممّا حمّلته الصفحةُ لموسمها المعروض، فلا
// يرى البحثُ موسماً آخر ولا يكتب شيئاً. والنتيجةُ تسمّي المكانَ (الفندق ·
// الدور · الغرفة) وتقود إليه؛ ومن لا غرفة له يُقال ذلك صراحةً، ويُفتح
// فندقُه المطلوب إن وُجد.
import { useState } from "react";
import type { Hotel, Passenger, Room } from "../../types";
import { matchesHotelSearch } from "./hotelSearchMatch";
import { makeShort } from "../../utils";

export type SearchRoom = Pick<Room, "id" | "hotel_id" | "number" | "floor" | "type">;

const LIMIT = 8;

export function HotelSearch({ passengers, rooms, hotels, onOpen, value, onChange, currentHotelId, placeholder = "ابحث بالاسم أو الجواز أو رقم الغرفة", width = 260 }: {
  passengers: Passenger[];
  rooms: SearchRoom[];
  hotels: Hotel[];
  /* `roomId = null`: الفندقُ وحده (حاجٌّ بلا غرفة طلب هذا الفندق) */
  onOpen: (hotelId: number, roomId: number | null) => void;
  /* متحكَّمٌ به حين تصفّي الصفحةُ شبكتَها بالنصّ نفسِه */
  value?: string;
  onChange?: (v: string) => void;
  /* داخل صفحة فندق: حاجٌّ بلا غرفة طلب هذا الفندق لا وجهةَ له هنا */
  currentHotelId?: number;
  placeholder?: string;
  width?: number | string;
}) {
  const [own, setOwn] = useState("");
  const q = value ?? own;
  const setQ = onChange ?? setOwn;
  const [open, setOpen] = useState(false);

  const t = q.trim();
  const roomById = new Map(rooms.map(r => [r.id, r]));
  const hotelName = (id: number | null | undefined) => (id == null ? null : hotels.find(h => h.id === id)?.name ?? null);
  /* حرفٌ واحد يطابق نصفَ الموسم — النتائجُ من حرفين */
  const pax = t.length >= 2 ? passengers.filter(p => matchesHotelSearch(p, t)) : [];
  const roomHits = t ? rooms.filter(r => r.number === t || (t.length >= 2 && r.number.includes(t))) : [];
  const shown = open && t.length > 0;

  const choose = (hotelId: number | null | undefined, roomId: number | null) => {
    if (hotelId == null) return;
    setOpen(false);
    onOpen(hotelId, roomId);
  };

  const row = { display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 10px", border: "none", borderBottom: "1px solid var(--ivory)", background: "transparent", textAlign: "right" as const, fontFamily: "var(--font-body)", cursor: "pointer", color: "var(--ink)" };
  const where = { fontSize: 10.5, fontWeight: 700, color: "var(--muted)" };

  return (
    <div style={{ position: "relative", width, flex: "none", maxWidth: "100%" }}
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false); }}>
      <input type="search" value={q} aria-label="بحث في الفنادق" placeholder={placeholder}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => { if (e.key === "Escape" && shown) { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); setOpen(false); } }}
        style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line)", fontFamily: "var(--font-body)", fontSize: 13, outline: "none", background: "var(--paper)", color: "var(--ink)" }} />
      {shown && (
        <div role="listbox" aria-label="نتائج البحث" data-hotel-search-results
          style={{ position: "absolute", top: "calc(100% + 4px)", insetInlineStart: 0, width: "max(100%, 300px)", maxWidth: "calc(100vw - 24px)", maxHeight: 360, overflowY: "auto", zIndex: 80, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,.14)" }}>
          {pax.length === 0 && roomHits.length === 0 && (
            <div style={{ padding: "12px", fontSize: 12, color: "var(--muted)", fontWeight: 700, textAlign: "center" }}>
              {t.length < 2 && !roomHits.length ? "اكتب حرفين على الأقل" : "لا نتائج في هذا الموسم"}
            </div>
          )}
          {roomHits.slice(0, LIMIT).map(r => (
            <button key={`r${r.id}`} type="button" role="option" aria-selected={false} data-search-room={r.id} style={row}
              onClick={() => choose(r.hotel_id, r.id)}>
              <span style={{ fontSize: 13, fontWeight: 900, color: "var(--primary)", minWidth: 34 }}>{r.number}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 12, fontWeight: 700 }}>غرفة {r.number} · {r.type}</span>
                <span style={where}>{hotelName(r.hotel_id) ?? "بلا فندق"} · الدور {r.floor}</span>
              </span>
            </button>
          ))}
          {pax.slice(0, LIMIT).map(p => {
            const room = p.room_id != null ? roomById.get(p.room_id) : undefined;
            const req = p.requested_hotel_id ?? (hotels.length === 1 ? hotels[0].id : null);
            /* مُسكَّنٌ في غرفةٍ لم تصل قائمتَها (أُنشئت للتوّ في شاشةٍ أخرى): لا يُقال «بدون غرفة» */
            const unknownRoom = p.room_id != null && !room;
            const target = room ? room.hotel_id : unknownRoom || req === currentHotelId ? null : req;
            return (
              <button key={`p${p.id}`} type="button" role="option" aria-selected={false} data-search-pax={p.id}
                disabled={target == null} style={{ ...row, cursor: target == null ? "default" : "pointer" }}
                onClick={() => choose(target, room ? room.id : null)}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 12, fontWeight: 700, wordBreak: "break-word" }}>{p.short_ar || makeShort(p.name_ar)}</span>
                  {room
                    ? <span style={where} data-search-where>{hotelName(room.hotel_id) ?? "بلا فندق"} · الدور {room.floor} · الغرفة {room.number}</span>
                    : unknownRoom
                    ? <span style={where} data-search-where>مُسكَّن — حدّث الصفحة لعرض غرفته</span>
                    : <span style={{ ...where, color: "var(--warning)" }} data-search-where>
                        بدون غرفة{hotelName(req) ? ` · مطلوب: ${hotelName(req)}` : ""}
                      </span>}
                </span>
                {p.passport && <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, flexShrink: 0 }} dir="ltr">{p.passport}</span>}
              </button>
            );
          })}
          {(pax.length > LIMIT || roomHits.length > LIMIT) && (
            <div style={{ padding: "6px 10px", fontSize: 10.5, color: "var(--muted)", fontWeight: 700 }}>
              نتائج أخرى — دقّق البحث
            </div>
          )}
        </div>
      )}
    </div>
  );
}
