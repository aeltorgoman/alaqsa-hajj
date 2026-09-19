/* ═══ أنواعُ حمولة البوابة ═══
   هي **عقدُ `get_pilgrim_portal_by_session`** كما يصل إلى العميل، لا
   نموذجُ عرضٍ نختاره. فلا يُضاف هنا حقلٌ لا ترسله الدالّة، ولا
   يُحذَف حقلٌ ترسله ونستعمله. نُقلت كما هي في المرحلة الثانية. */
export type PortalData = {
  /* ق٦ — العميل يستلم وجود المستند لا مفتاحه، والرابط من `pilgrim-doc` */
  pilgrim: { name_ar: string; name_en: string; short_ar?: string | null; gender: string; has_photo: boolean; has_hajj_permit: boolean; has_flight_ticket: boolean; hotel_type: string | null; hotel_view: string | null; camp_mina: string | null; camp_arafa: string | null; camp_mina_name?: string | null; camp_arafa_name?: string | null; phone: string | null };
  bus: { name: string; type: string } | null;
  room: { number: string; floor: string; type: string } | null;
  roommates: { name: string; is_family: boolean }[];
  family: { name: string; short_ar?: string | null; gender: string; room_number: string | null; room_floor: string | null; bus_name: string | null; camp_mina_name: string | null; camp_arafa_name: string | null }[];
  flight_go: FlightInfo | null;
  flight_back: FlightInfo | null;
  config: PortalConfig | null;
  /* موسمُ الحاجّ نفسُه — اسمُه وأماكنُه. مفتاحٌ مستقلٌّ عن `config`
     عمداً: هذه بياناتُ موسمٍ لا بياناتُ حملة. */
  season: PortalSeason | null;
  announcements: Ann[];
};
export type Ann = { id: number; body: string; priority: string; show_at: string };
export type FlightInfo = { name: string; airline: string; from_airport: string; to_airport: string; date: string; time: string; arrival_time: string; arrival_date: string; class: string };
export type PortalSeason = { name: string; hijri_year: number | null; hotel_name: string | null; hotel_address: string | null; hotel_url: string | null; mina_address: string | null; mina_url: string | null; arafa_address: string | null; arafa_url: string | null };
/* ⚠️ خرج من هذا العقد: `season_label` و`features` وأماكنُ الفندق
   ومنى وعرفة. الأولُ والأخيرةُ صارت في `season`، و`features` لم
   تعد تُقرَأ. و`logo_url` باقٍ عمودَ توافقٍ حتى ترحيل التنظيف. */
export type PortalConfig = { name_ar: string; logo_url: string | null; tagline: string | null; color_primary: string | null; color_accent: string | null; admin_name: string | null; admin_phone: string | null; admin_whatsapp: string | null; portal_settings?: Record<string, boolean> | null; portal_welcome_message?: string | null; portal_help_message?: string | null; assets?: Record<string, string> | null; country: string | null; city: string | null };
