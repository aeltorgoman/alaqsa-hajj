/* ═══ أنواعُ حمولة البوابة ═══
   هي **عقدُ `get_pilgrim_portal_by_session`** كما يصل إلى العميل، لا
   نموذجُ عرضٍ نختاره. فلا يُضاف هنا حقلٌ لا ترسله الدالّة، ولا
   يُحذَف حقلٌ ترسله ونستعمله. نُقلت كما هي في المرحلة الثانية. */
export type PortalData = {
  /* ق٦ — العميل يستلم وجود المستند لا مفتاحه، والرابط من `pilgrim-doc` */
  pilgrim: { name_ar: string; name_en: string; short_ar?: string | null; gender: string; has_photo: boolean; has_hajj_permit: boolean; has_flight_ticket: boolean; hotel_type: string | null; hotel_view: string | null; camp_mina: string | null; camp_arafa: string | null; camp_mina_name?: string | null; camp_arafa_name?: string | null; phone: string | null };
  bus: { name: string; type: string } | null;
  room: { number: string; floor: string; type: string } | null;
  /* MOD-001 — السكنُ بحالته، المصدرُ الوحيدُ لفندق الحاجّ في البوابة.
     اختياريٌّ في النوع لأن خادماً أقدمَ لا يرسله — وعندها لا يُعرض فندق. */
  accommodation?: PortalAccommodation | null;
  roommates: { name: string; is_family: boolean }[];
  /* `hotel_name` فندقُ غرفة القريب الفعليّ (لا المطلوب) — فارغٌ بلا غرفة */
  family: { name: string; short_ar?: string | null; gender: string; room_number: string | null; room_floor: string | null; hotel_name?: string | null; bus_name: string | null; camp_mina_name: string | null; camp_arafa_name: string | null }[];
  flight_go: FlightInfo | null;
  flight_back: FlightInfo | null;
  config: PortalConfig | null;
  /* موسمُ الحاجّ نفسُه — اسمُه وأماكنُه. مفتاحٌ مستقلٌّ عن `config`
     عمداً: هذه بياناتُ موسمٍ لا بياناتُ حملة. */
  season: PortalSeason | null;
  announcements: Ann[];
};
/* عقدُ `accommodation` (MOD-001 · D8):
     assigned          ← غرفةٌ في فندقٍ مربوط: `hotel` هو فندقُ الغرفة الفعليّ (اسم · عنوان · رابط)
     assigned_unlinked ← غرفةٌ لم تُربط بفندق: `hotel` فارغ، و`requested_hotel` باسمه وحده إن وُجد
     requested         ← لا غرفة: `requested_hotel` باسمه **وحده** — لا عنوانَ ولا رابط
     none              ← لا هذا ولا ذاك */
export type PortalAccommodation = {
  status: "assigned" | "assigned_unlinked" | "requested" | "none";
  hotel: { name: string; address: string | null; map_url: string | null; city: string | null } | null;
  room: { number: string; floor: string; type: string } | null;
  requested_hotel: { name: string } | null;
};
export type Ann = { id: number; body: string; priority: string; show_at: string };
export type FlightInfo = { name: string; airline: string; from_airport: string; to_airport: string; date: string; time: string; arrival_time: string; arrival_date: string; class: string };
/* `hotel_*` في الموسم لواجهة البوابة القديمة وحدها — لا تُقرأ هنا (MOD-001):
   فندقُ الحاجّ من `accommodation` وحده. */
export type PortalSeason = { name: string; hijri_year: number | null; hotel_name: string | null; hotel_address: string | null; hotel_url: string | null; mina_address: string | null; mina_url: string | null; arafa_address: string | null; arafa_url: string | null };
/* ⚠️ خرج من هذا العقد: `season_label` و`features` وأماكنُ الفندق
   ومنى وعرفة و`logo_url`. الأولُ والأماكنُ صارت في `season`،
   و`features` لم تعد تُقرَأ، والشعارُ يأتي في `assets.logo` وحده. */
export type PortalConfig = { name_ar: string; tagline: string | null; color_primary: string | null; color_accent: string | null; admin_name: string | null; admin_phone: string | null; admin_whatsapp: string | null; portal_settings?: Record<string, boolean> | null; portal_welcome_message?: string | null; portal_help_message?: string | null; assets?: Record<string, string> | null; country: string | null; city: string | null };
