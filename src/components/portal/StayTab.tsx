/* ═══ تبويبُ «سكني» ═══
   أين ينزل الحاجّ ومع من: الفندقُ والغرفة، ومخيّما منى وعرفات،
   وأفرادُ الأسرة، ورفقاءُ الغرفة. تركيبٌ لا منطق. */
import { ICONS } from "./PortalIcons";
import { INK, BODY, LABEL, LINE, type PortalTheme } from "./portal.theme";
import { CardHeader, InfoUnit, InfoUnits, AddressLink } from "./PortalPrimitives";
import { cardStyle } from "./portal.styles";
import type { PortalAccommodation } from "./portal.types";

type Member = { name: string; short_ar?: string | null; room_number: string | null; room_floor: string | null; hotel_name?: string | null; bus_name: string | null; camp_mina_name: string | null };

type Props = {
  t: PortalTheme;
  showRooms: boolean; showRoommates: boolean;
  /* MOD-001 — السكنُ بحالته من `get_pilgrim_portal_by_session` وحده */
  accommodation: PortalAccommodation;
  hotelTitleOf: (name: string | null | undefined) => string;
  hotelType: string | null; hotelView: string | null;
  minaName: string; camp_mina_address: string | null | undefined; camp_mina_url: string | null | undefined;
  arafaName: string; camp_arafa_address: string | null | undefined; camp_arafa_url: string | null | undefined;
  family: Member[];
  roommates: { name: string; is_family: boolean }[];
};

export function StayTab({
  t, showRooms, showRoommates, accommodation, hotelTitleOf, hotelType, hotelView, minaName, camp_mina_address, camp_mina_url,
  arafaName, camp_arafa_address, camp_arafa_url, family, roommates,
}: Props) {
  const { status, room } = accommodation;
  /* الفندقُ الفعليّ — في `assigned` وحده: اسمُه وعنوانُه ورابطُه */
  const actual = status === "assigned" ? accommodation.hotel : null;
  /* المطلوب — اسمٌ وحده، موسومٌ مطلوباً، بلا عنوانٍ ولا خريطة */
  const requestedName = (status === "requested" || status === "assigned_unlinked") ? (accommodation.requested_hotel?.name || "").trim() : "";
  const hasStay = status !== "none" && (!!room || !!actual || !!requestedName);
  const title = actual ? (hotelTitleOf(actual.name) || "سكني في مكة")
    : status === "requested" ? (hotelTitleOf(requestedName) || "سكني في مكة")
    : "سكني في مكة";
  const packageSub = [hotelType, hotelView].filter(Boolean).join(" — ") || undefined;
  const note = (text: string, testId: string) => (
    <div data-testid={testId} style={{ marginTop: 10, padding: "10px 13px", borderRadius: 12, background: `${t.gold}14`, border: `1.5px dashed ${t.gold}88`, fontSize: 15, fontWeight: 700, color: BODY, lineHeight: 1.9 }}>{text}</div>
  );
  return (
    <>

          {showRooms && hasStay && <div style={cardStyle} data-testid="stay-card" data-status={status}>
            <CardHeader t={t} icon={ICONS.home} title={title}
              sub={status === "requested" ? ["فندق مطلوب — غير مؤكَّد", packageSub].filter(Boolean).join(" · ") : packageSub} />
            {status === "requested" && <>
              {note("هذا هو الفندق المطلوب في حجزك، وليس سكناً مؤكَّداً بعد.", "stay-requested-note")}
              {note("توزيع الغرفة قيد التجهيز — ستظهر تفاصيل الفندق والغرفة هنا فور اعتمادها.", "stay-pending-note")}
            </>}
            {room && (
              <InfoUnits>
                <InfoUnit t={t} k="الغرفة" v={room.number || "—"} big />
                {room.floor ? <InfoUnit t={t} k="الدور" v={room.floor} /> : null}
                {room.type ? <InfoUnit t={t} k="النوع" v={room.type} /> : null}
              </InfoUnits>
            )}
            {status === "assigned_unlinked" && <>
              {note("لم يُؤكَّد الفندق الفعليّ لغرفتك بعد — سيظهر هنا فور اعتماده.", "stay-unlinked-note")}
              {requestedName && (
                <div data-testid="stay-requested-hotel" style={{ marginTop: 10, fontSize: 15.5, fontWeight: 700, color: LABEL }}>
                  الفندق المطلوب في حجزك: <span style={{ color: INK }}>{requestedName}</span> <span style={{ fontWeight: 600 }}>(مطلوب — غير مؤكَّد)</span>
                </div>
              )}
            </>}
            {actual && (actual.address || actual.map_url) && (
              <AddressLink t={t} address={actual.address || "موقع الفندق على الخريطة"} url={actual.map_url} />
            )}
          </div>}

          {(minaName || arafaName) && <div style={cardStyle}>
            <CardHeader t={t} icon={ICONS.tent} title="مخيماتي" sub="منى وعرفات" />
            {minaName && (
              <div style={{ padding: "4px 0 12px", borderBottom: arafaName ? `1px dashed ${LINE}` : "none", marginBottom: arafaName ? 12 : 0 }}>
                <InfoUnits><InfoUnit t={t} k="مخيم منى" v={minaName} big full={minaName.length > 14} /></InfoUnits>
                {camp_mina_address && <AddressLink t={t} address={camp_mina_address} url={camp_mina_url} />}
              </div>
            )}
            {arafaName && (
              <div style={{ padding: "2px 0 2px" }}>
                <InfoUnits><InfoUnit t={t} k="مخيم عرفات" v={arafaName} big full={arafaName.length > 14} /></InfoUnits>
                {camp_arafa_address && <AddressLink t={t} address={camp_arafa_address} url={camp_arafa_url} />}
              </div>
            )}
          </div>}

          {family?.length > 0 && (
            <div style={{ ...cardStyle, border: `2px solid ${t.gold}88` }}>
              <CardHeader t={t} icon={ICONS.users} title="أفراد الأسرة" sub={`${family.length} من عائلتك`} />
              {family.map((m, i) => (
                <div key={i} style={{ padding: "12px 2px", borderBottom: i < family.length - 1 ? `1px dashed ${LINE}` : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 42, height: 42, borderRadius: "50%", background: `${t.gold}22`, border: `1.5px solid ${t.gold}66`, color: t.goldDark, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: t.fontD, fontWeight: 900, fontSize: 17, flexShrink: 0 }}>{(m.short_ar || m.name)?.charAt(0)}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 21, fontWeight: 700, color: INK }}>{m.short_ar || m.name}</div>
                      <div style={{ fontSize: 15, color: LABEL, fontWeight: 600, marginTop: 3, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {m.room_number && <span>{m.hotel_name ? `${hotelTitleOf(m.hotel_name)} · ` : ""}غرفة {m.room_number}{m.room_floor ? ` — الدور ${m.room_floor}` : ""}</span>}
                        {m.bus_name && <span>باص {m.bus_name}</span>}
                        {m.camp_mina_name && <span>منى {m.camp_mina_name}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!hasStay && !minaName && !arafaName && (
            <div style={{ ...cardStyle, border: `1.5px solid ${t.gold}77` }}>
              <div style={{ fontFamily: t.fontD, fontWeight: 800, fontSize: 21, color: INK }}>سكنك قيد التجهيز</div>
              <div style={{ fontSize: 15.5, fontWeight: 600, color: BODY, lineHeight: 2.05, marginTop: 10 }}>
                ستظهر هنا تفاصيل الفندق والغرفة ومخيّمَي منى وعرفات فور اعتمادها.
              </div>
            </div>
          )}

          {showRoommates && roommates?.length > 0 && (
            /* الدائرةُ بحرفٍ واحدٍ لم تكن تميّز أحداً — كلُّ ما أضافته
               ارتفاعٌ لكارتٍ محتواه أسماء. فحُذفت، وضاقت الأسطر،
               وبقيت الأسماءُ والعددُ وسلوكُ الخصوصيّة كما هي. */
            <div style={{ ...cardStyle, padding: "16px 17px" }}>
              <CardHeader t={t} icon={ICONS.users} title="رفقاء الغرفة" sub={`${roommates.length} معك في الغرفة`} />
              {roommates.map((m, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 2px",
                  borderTop: i === 0 ? "none" : `1px dashed ${LINE}`,
                }}>
                  <span style={{ fontSize: 17, fontWeight: 700, color: INK, flex: 1, minWidth: 0, overflowWrap: "anywhere", lineHeight: 1.6 }}>{m.name}</span>
                  {m.is_family && <span style={{ fontSize: 11.5, background: `${t.gold}26`, color: t.goldDark, border: `1px solid ${t.gold}66`, padding: "3px 10px", borderRadius: 99, fontWeight: 800, fontFamily: t.fontD, flexShrink: 0 }}>عائلتك</span>}
                </div>
              ))}
            </div>
          )}
    </>
  );
}
