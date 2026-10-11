/* ════════════════════════════════════════════════════════════
   MOD-001 — الفنادق: فنادقُ الموسم بطاقاتٍ، ومنها إلى صفحة الفندق
   ════════════════════════════════════════════════════════════
   البطاقاتُ تُعرض دائماً — ولو كان الفندقُ واحداً (D12) — ومنها:
   الإضافةُ والتعديلُ على جدول `hotels`، والحذفُ بـ`delete_hotel` وحدها
   (غرفُه الفارغة معه؛ وترفض القاعدةُ فندقاً فيه نزيلٌ أو مطلوباً لحاجّ).
   والضغطُ على البطاقة يفتح `HotelPage` نفسَها محصورةً في الفندق.

   الفندقُ المفتوح في العنوان (`/hotel?hotel=<id>`): التحديثُ يُبقيه،
   والرجوعُ في المتصفّح يعود إلى البطاقات. */
import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { supabase } from "../supabase";
import type { Hotel, Passenger, Room } from "../types";
import { isHajj } from "../utils/passenger";
import { roomCapacity } from "../utils";
import { useSeason } from "../season/useSeason";
import { useSeasonWrite } from "../season/useSeasonWrite";
import { AlertModal, ConfirmModal, useAlert, useConfirm } from "./AlertModal";
import { Modal } from "./Modal";
import { HotelPage } from "./HotelPage";

type RoomLite = Pick<Room, "id" | "hotel_id" | "type" | "capacity">;
type HotelForm = { name: string; address: string; map_url: string; notes: string };
const EMPTY_FORM: HotelForm = { name: "", address: "", map_url: "", notes: "" };

const byHotelOrder = (a: Hotel, b: Hotel) =>
  (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER) || a.id - b.id;

function hotelIdFromUrl(): number | null {
  const v = new URLSearchParams(window.location.search).get("hotel");
  const n = v ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

/* رسالةُ القاعدة بلغة الموظّف — لا نصَّ بوستجرس */
function hotelWriteError(msg?: string): string {
  if (!msg) return "تعذّر حفظ الفندق";
  if (/hotels_season_name_uniq|duplicate key/i.test(msg)) return "يوجد فندق بهذا الاسم في هذا الموسم";
  if (/hotels_map_url_http/i.test(msg)) return "رابط الخريطة يجب أن يبدأ بـ http:// أو https://";
  if (/hotels_name_present/i.test(msg)) return "اسم الفندق مطلوب";
  if (/row-level security|permission denied|42501/i.test(msg)) return "ليست لديك صلاحية إدارة الفنادق";
  return msg;
}

function HotelsPage({ passengers, setPassengers }: { passengers: Passenger[]; setPassengers: Dispatch<SetStateAction<Passenger[]>> }) {
  const { viewedSeason } = useSeason();
  const { alert, showAlert } = useAlert();
  const { confirmState, confirmAction, handleConfirm, handleCancel } = useConfirm();
  const { assertWritable, readOnly } = useSeasonWrite(showAlert);

  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [rooms, setRooms] = useState<RoomLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [openId, setOpenId] = useState<number | null>(hotelIdFromUrl);
  const [editing, setEditing] = useState<Hotel | "new" | null>(null);
  const [form, setForm] = useState<HotelForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  /* الغرفُ هنا للمؤشّرات وحدها — وصفحةُ الفندق تحمّل غرفَها بنفسها.
     وتُعاد القراءةُ كلّما تبدّل الفندقُ المفتوح، فتعود البطاقاتُ بأرقامٍ
     حديثة بعد العمل داخل فندق. */
  useEffect(() => {
    let live = true;
    Promise.all([
      supabase.from("hotels").select("*").eq("season_id", viewedSeason.id),
      supabase.from("rooms").select("id, hotel_id, type, capacity").eq("season_id", viewedSeason.id),
    ]).then(([h, r]) => {
      if (!live) return;
      if (h.error || r.error || !h.data || !r.data) {
        console.error("تعذّر تحميل الفنادق", h.error ?? r.error);
        setLoadError(true);
      } else {
        const list = (h.data as Hotel[]).sort(byHotelOrder);
        setHotels(list);
        setRooms(r.data as RoomLite[]);
        setLoadError(false);
        /* عنوانٌ لفندقٍ لا وجود له في هذا الموسم (حُذف، أو موسمٌ آخر): البطاقات */
        const want = hotelIdFromUrl();
        if (want != null && !list.some(x => x.id === want)) {
          window.history.replaceState(window.history.state, "", window.location.pathname);
          setOpenId(null);
        }
      }
      setLoading(false);
    });
    return () => { live = false; };
  }, [viewedSeason.id, openId]);

  /* الرجوعُ والتقدّمُ في المتصفّح يقرآن العنوان */
  useEffect(() => {
    const onPop = () => setOpenId(hotelIdFromUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const openHotel = (id: number) => {
    window.history.pushState(null, "", `${window.location.pathname}?hotel=${id}`);
    setOpenId(id);
  };
  const closeHotel = () => {
    if (hotelIdFromUrl() != null) window.history.pushState(null, "", window.location.pathname);
    setOpenId(null);
  };

  const openHotelRow = hotels.find(h => h.id === openId) ?? null;

  const stats = useMemo(() => {
    const roomHotel = new Map(rooms.map(r => [r.id, r.hotel_id ?? null]));
    const out = new Map<number, { rooms: number; beds: number; occupants: number; waiting: number; requested: number }>();
    for (const h of hotels) out.set(h.id, { rooms: 0, beds: 0, occupants: 0, waiting: 0, requested: 0 });
    for (const r of rooms) {
      const s = r.hotel_id != null ? out.get(r.hotel_id) : undefined;
      if (!s) continue;
      s.rooms += 1;
      s.beds += roomCapacity(r as Room) ?? 0;
    }
    for (const p of passengers) {
      if (p.room_id != null) {
        const hid = roomHotel.get(p.room_id);
        const s = hid != null ? out.get(hid) : undefined;
        if (s) s.occupants += 1;
      }
      if (!isHajj(p)) continue;
      const req = p.requested_hotel_id ?? (hotels.length === 1 ? hotels[0].id : null);
      const s = req != null ? out.get(req) : undefined;
      if (!s) continue;
      s.requested += 1;
      if (!p.room_id) s.waiting += 1;
    }
    return out;
  }, [hotels, rooms, passengers]);

  const startAdd = () => {
    if (!assertWritable()) return;
    setForm(EMPTY_FORM);
    setEditing("new");
  };
  const startEdit = (h: Hotel) => {
    if (!assertWritable()) return;
    setForm({ name: h.name, address: h.address ?? "", map_url: h.map_url ?? "", notes: h.notes ?? "" });
    setEditing(h);
  };

  const saveHotel = async () => {
    if (!editing || !assertWritable()) return;
    const name = form.name.trim();
    const map_url = form.map_url.trim();
    if (!name) { showAlert("error", "اسم الفندق مطلوب"); return; }
    if (map_url && !/^https?:\/\//i.test(map_url)) { showAlert("error", "رابط الخريطة يجب أن يبدأ بـ http:// أو https://"); return; }
    const taken = hotels.some(h => (editing === "new" || h.id !== editing.id) && h.name.trim() === name);
    if (taken) { showAlert("error", "يوجد فندق بهذا الاسم في هذا الموسم"); return; }
    const values = { name, address: form.address.trim() || null, map_url: map_url || null, notes: form.notes.trim() || null };
    setSaving(true);
    const res = editing === "new"
      ? await supabase.from("hotels").insert([{ ...values, season_id: viewedSeason.id }]).select().single()
      : await supabase.from("hotels").update(values).eq("id", editing.id).select().single();
    setSaving(false);
    if (res.error || !res.data) { showAlert("error", hotelWriteError(res.error?.message)); return; }
    const row = res.data as Hotel;
    setHotels(prev => (editing === "new" ? [...prev, row] : prev.map(h => (h.id === row.id ? row : h))).sort(byHotelOrder));
    setEditing(null);
    showAlert("success", editing === "new" ? `تمت إضافة ${row.name}` : "تم حفظ الفندق");
    setTimeout(() => showAlert(null), 2500);
  };

  const deleteHotel = async (h: Hotel) => {
    if (!assertWritable()) return;
    const s = stats.get(h.id);
    /* فحصٌ في الواجهة يقول السببَ قبل الطلب، والقاعدةُ هي الحَكَم */
    if (s && s.occupants > 0) { showAlert("error", `الفندق «${h.name}» فيه ${s.occupants} نزيلاً مُسكَّناً — أخرِجهم أولاً.`); return; }
    const ok = await confirmAction(
      s && s.rooms > 0
        ? `سيُحذف الفندق «${h.name}» مع غرفه الفارغة (${s.rooms} غرفة). لا يمكن التراجع عن هذا الإجراء.`
        : `سيُحذف الفندق «${h.name}». لا يمكن التراجع عن هذا الإجراء.`,
      { title: "حذف الفندق؟", confirmLabel: "نعم، احذف" },
    );
    if (!ok) return;
    const { data, error } = await supabase.rpc("delete_hotel", { p_hotel_id: h.id });
    if (error) {
      /* رسائلُ الدالّة عربيّةٌ صريحة: المشغولُ والمطلوبُ والصلاحية */
      console.error("تعذّر حذف الفندق", error);
      showAlert("error", error.message || "تعذّر حذف الفندق");
      return;
    }
    const removed = (data as { rooms_deleted?: number } | null)?.rooms_deleted ?? 0;
    setHotels(prev => prev.filter(x => x.id !== h.id));
    setRooms(prev => prev.filter(r => r.hotel_id !== h.id));
    showAlert("success", removed > 0 ? `تم حذف الفندق و${removed} غرفة فارغة` : "تم حذف الفندق");
    setTimeout(() => showAlert(null), 2500);
  };

  if (openHotelRow) {
    return <HotelPage key={openHotelRow.id} hotel={openHotelRow} hotels={hotels} onBack={closeHotel}
      passengers={passengers} setPassengers={setPassengers} />;
  }

  const roOff = readOnly ? { opacity: 0.4, pointerEvents: "none" as const } : null;
  const inp = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line)", fontFamily: "var(--font-body)", fontSize: 13, outline: "none", background: "var(--paper)", color: "var(--ink)" };
  const btnP = { padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--primary)", color: "#fff", fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, cursor: "pointer" };
  const btnS = { padding: "8px 16px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink)", fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, cursor: "pointer" };
  const label = { fontSize: 11, color: "var(--muted)", marginBottom: 4, fontWeight: 700 } as const;

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "12px" }}>
      <AlertModal alert={alert} onClose={() => showAlert(null)} />
      <ConfirmModal state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: "var(--ink)" }}>فنادق الموسم</div>
          <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>اختر فندقاً لإدارة غرفه وتسكين حجّاجه</div>
        </div>
        <button disabled={readOnly} onClick={startAdd} style={{ ...btnP, ...roOff, display: "flex", alignItems: "center", gap: 5 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          إضافة فندق
        </button>
      </div>

      {readOnly && (
        <div style={{ marginBottom: 12, padding: "7px 12px", borderRadius: 9, background: "var(--warning-bg)", border: "1px solid var(--warning)", color: "var(--warning)", fontSize: 11, fontWeight: 800 }}>
          موسم مؤرشَف — للعرض فقط. الإضافة والتعديل والحذف معطّلة.
        </div>
      )}

      {loading && <div style={{ textAlign: "center", padding: "3rem", color: "var(--muted)", fontSize: 12 }}>جاري التحميل...</div>}
      {!loading && loadError && (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--danger)", fontWeight: 700, fontSize: 13 }}>
          تعذّر تحميل الفنادق — يرجى التحقق من الاتصال وتحديث الصفحة
        </div>
      )}
      {!loading && !loadError && hotels.length === 0 && (
        <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--muted)", fontSize: 13, fontWeight: 700, lineHeight: 1.9 }}>
          لا توجد فنادق في هذا الموسم بعد.
          {!readOnly && <div><button onClick={startAdd} style={{ ...btnP, marginTop: 8 }}>أضف أول فندق</button></div>}
        </div>
      )}

      {!loading && !loadError && hotels.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {hotels.map(h => {
            const s = stats.get(h.id) ?? { rooms: 0, beds: 0, occupants: 0, waiting: 0, requested: 0 };
            const fill = s.beds > 0 ? Math.min(100, Math.round((s.occupants / s.beds) * 100)) : 0;
            return (
              <div key={h.id} role="button" tabIndex={0} onClick={() => openHotel(h.id)}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openHotel(h.id); } }}
                style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 14, overflow: "hidden", cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,.06)", display: "flex", flexDirection: "column" }}>
                <div style={{ height: 4, background: "var(--primary)" }} />
                <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: "color-mix(in srgb, var(--primary) 12%, transparent)", color: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 22v-4h4v4"/></svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 900, color: "var(--ink)", wordBreak: "break-word" }}>{h.name}</div>
                      <div style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 700 }}>{h.city}{h.address ? ` · ${h.address}` : ""}</div>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                    {([["الغرف", s.rooms], ["النزلاء", s.occupants], ["بانتظار التسكين", s.waiting]] as [string, number][]).map(([l, n]) => (
                      <div key={l} style={{ background: "var(--ivory)", borderRadius: 9, padding: "6px 4px", textAlign: "center" }}>
                        <div style={{ fontSize: 15, fontWeight: 900, color: "var(--ink)" }}>{n}</div>
                        <div style={{ fontSize: 9.5, fontWeight: 700, color: "var(--muted)" }}>{l}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 5, borderRadius: 99, background: "var(--ivory)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${fill}%`, background: "var(--primary)", borderRadius: 99 }} />
                    </div>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--muted)" }} dir="ltr">{s.occupants}/{s.beds}</span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: "auto", flexWrap: "wrap" }} onClick={e => e.stopPropagation()}>
                    {h.map_url
                      ? <a href={h.map_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, fontWeight: 700, color: "var(--primary)" }}>الموقع على الخريطة</a>
                      : <span style={{ fontSize: 11, color: "var(--muted)" }}>بلا رابط خريطة</span>}
                    <div style={{ flex: 1 }} />
                    <button disabled={readOnly} onClick={() => startEdit(h)} style={{ ...btnS, ...roOff, padding: "4px 10px", fontSize: 11 }}>تعديل</button>
                    <button disabled={readOnly} onClick={() => deleteHotel(h)}
                      style={{ ...roOff, padding: "4px 10px", borderRadius: 8, border: "1px solid #fce8e8", background: "#fff0f0", color: "#C62828", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)" }}>حذف</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal show={editing != null} onClose={() => setEditing(null)} title={editing === "new" ? "إضافة فندق" : "تعديل الفندق"}>
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <div style={label}>اسم الفندق <span style={{ color: "var(--danger)" }}>*</span></div>
            <input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inp} placeholder="أبراج الصفوة" />
          </div>
          <div>
            <div style={label}>المدينة</div>
            <input value="مكة" disabled readOnly style={{ ...inp, opacity: 0.6, cursor: "not-allowed" }} />
          </div>
          <div>
            <div style={label}>العنوان</div>
            <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} style={inp} placeholder="شارع أجياد، أمام الحرم المكي" />
          </div>
          <div>
            <div style={label}>رابط الموقع على الخريطة</div>
            <input value={form.map_url} onChange={e => setForm(f => ({ ...f, map_url: e.target.value }))} style={{ ...inp, direction: "ltr" }} placeholder="https://maps.google.com/..." />
          </div>
          <div>
            <div style={label}>ملاحظات</div>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={{ ...inp, resize: "none", height: 64 }} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button onClick={saveHotel} disabled={saving} style={{ ...btnP, flex: 1, opacity: saving ? 0.6 : 1 }}>{saving ? "جاري الحفظ..." : "حفظ"}</button>
            <button onClick={() => setEditing(null)} style={{ ...btnS, flex: 1 }}>إلغاء</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export { HotelsPage };
