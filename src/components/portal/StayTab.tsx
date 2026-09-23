/* ═══ تبويبُ «سكني» ═══
   أين ينزل الحاجّ ومع من: الفندقُ والغرفة، ومخيّما منى وعرفات،
   وأفرادُ الأسرة، ورفقاءُ الغرفة. تركيبٌ لا منطق. */
import { ICONS } from "./PortalIcons";
import { INK, BODY, LABEL, LINE, type PortalTheme } from "./portal.theme";
import { CardHeader, InfoUnit, InfoUnits, AddressLink } from "./PortalPrimitives";
import { cardStyle } from "./portal.styles";

type Member = { name: string; short_ar?: string | null; room_number: string | null; room_floor: string | null; bus_name: string | null; camp_mina_name: string | null };

type Props = {
  t: PortalTheme;
  showRooms: boolean; showRoommates: boolean;
  hotelTitle: string; hotelName: string;
  hotelType: string | null; hotelView: string | null;
  room: { number: string; floor: string; type: string } | null;
  hotel_address: string | null | undefined; hotel_url: string | null | undefined;
  minaName: string; camp_mina_address: string | null | undefined; camp_mina_url: string | null | undefined;
  arafaName: string; camp_arafa_address: string | null | undefined; camp_arafa_url: string | null | undefined;
  family: Member[];
  roommates: { name: string; is_family: boolean }[];
};

export function StayTab({
  t, showRooms, showRoommates, hotelTitle, hotelName, hotelType, hotelView, room,
  hotel_address, hotel_url, minaName, camp_mina_address, camp_mina_url,
  arafaName, camp_arafa_address, camp_arafa_url, family, roommates,
}: Props) {
  return (
    <>

          {showRooms && (room || hotelName) && <div style={cardStyle}>
            <CardHeader t={t} icon={ICONS.home} title={hotelTitle} sub={[hotelType, hotelView].filter(Boolean).join(" — ") || undefined} />
            {room && (
              <InfoUnits>
                <InfoUnit t={t} k="الغرفة" v={room.number || "—"} big />
                {room.floor ? <InfoUnit t={t} k="الدور" v={room.floor} /> : null}
                {room.type ? <InfoUnit t={t} k="النوع" v={room.type} /> : null}
              </InfoUnits>
            )}
            {hotel_address && <AddressLink t={t} address={hotel_address} url={hotel_url} />}
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
                        {m.room_number && <span>غرفة {m.room_number}{m.room_floor ? ` — الدور ${m.room_floor}` : ""}</span>}
                        {m.bus_name && <span>باص {m.bus_name}</span>}
                        {m.camp_mina_name && <span>منى {m.camp_mina_name}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!room && !minaName && !arafaName && !hotelName && (
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
