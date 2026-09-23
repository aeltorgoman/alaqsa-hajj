export interface User {
  /* uuid من auth.users — لا رقم. المصدر user_profiles لا public.users */
  id: string;
  name: string;
  /* معرّف الدخول (Login ID). لا يشترط أن يكون بريداً حقيقياً */
  email: string;
  permissions: Record<string, boolean>;
  is_active?: boolean | null;
}

export interface Passenger {
  id: number;
  name_ar: string;
  name_en: string;
  short_ar: string;
  short_en: string;
  passport: string;
  national_id: string;
  nat: string;
  dob: string;
  expiry: string;
  gender: string;
  phone: string;
  id_expiry?: string;
  rel?: string;
  linked?: number;
  photo_url?: string | null;
  passport_url?: string | null;
  national_id_url?: string | null;
  contract_url?: string | null;
  flight_ticket_url?: string | null;
  hajj_permit_url?: string | null;
  family_id?: string | null;
  passenger_type?: "حاج" | "مرافق" | "مشرف" | "إداري";
  bus_id?: number | null;
  room_id?: number | null;
  camp_mina_id?: number | null;
  camp_arafa_id?: number | null;
  flight_id?: number | null;
  return_flight_id?: number | null;
  flight_class?: string;
  season_id?: number | null;
  sort_order?: number;
  /* ترتيب داخل مورد بعينه — مستقلّ عن الترتيب العام وعن بقيّة الموارد */
  bus_sort_order?: number | null;
  camp_mina_sort_order?: number | null;
  camp_arafa_sort_order?: number | null;
  room_sort_order?: number | null;
  created_at?: string;
  created_by?: string | null;
  updated_by?: string | null;
  updated_at?: string | null;
  wants_flight?: boolean | null;
  services: {
    bus: string;
    flight: string;
    hotel_type: string;
    hotel_view: string;
    camp_mina: string;
    camp_arafa: string;
    [key: string]: string;
  };
}

export interface Bus {
  id: number;
  name: string;
  type: string;
  /* عمود قائم في القاعدة بافتراضي ٥٠، وصار `not null` مع حارس
     السقف — فلا يعود `bus.capacity || 50` تفسيراً في الواجهة. */
  capacity: number;
  season_id?: number | null;
  created_at?: string;
}

export interface Camp {
  id: number;
  name: string;
  gender: string;
  type: string;
  page_type: string;
  /* السعة الحقيقية — يُدخِلها الموظّف، لا تُستنبط من نوع.
     `null` تعني «غير محدّدة»: مخيّمٌ أُنشئ قبل عمود السعة، لا يقبل
     إسناداً حتى تُحدَّد سعته. */
  capacity?: number | null;
  /* ترتيب المخيّم داخل مجموعته (الموسم · نوع الصفحة · الجنس) —
     قرارٌ تشغيليّ يملكه الموظّف بالسحب. ليس فريداً، والفجوات
     مقبولة، و`id` يحسم التساوي.
     ⚠️ ليس `passengers.camp_mina_sort_order`: ذاك ترتيب النازلين
     داخل مخيّم، وهذا ترتيب المخيّمات نفسها. */
  sort_order?: number | null;
  season_id?: number | null;
  created_at?: string;
}

export interface Room {
  id: number;
  number: string;
  floor: string;
  /* «خاص» تصنيفٌ تجاريّ لا عدّةَ أَسِرّة: سعتها تُدخَل صراحةً.
     و«أخرى» خرجت من المفردات المعتمَدة — لم تكن لها سعة أصلاً. */
  type: "فردية" | "ثنائية" | "ثلاثية" | "رباعية" | "خاص" | "مجلس";
  /* السعة الحقيقية — محفوظة في القاعدة لا مشتقّة في المتصفّح.
     `null` تعني «غير محدّدة»: صفٌّ قديم بنوعٍ خارج المعتمَد،
     لا يقبل إسناداً حتى تُحدَّد سعته. */
  capacity?: number | null;
  notes?: string | null;
  season_id?: number | null;
}

export interface Flight {
  id: number;
  name: string;
  type: "ذهاب" | "إياب";
  airline: string;
  date: string;
  time: string;
  from_airport: string;
  to_airport: string;
  /* عمودان قائمان في القاعدة — كان غيابهما يفرض (flight as any).arrival_* */
  arrival_time?: string | null;
  arrival_date?: string | null;
  /* المقاعد المخصَّصة للحملة على هذه الرحلة — لا سعة الطائرة.
     طائرةٌ بثلاث مئة مقعد قد تكون حصّة الحملة فيها أربعين.
     `null` تعني «غير محدَّدة»: رحلةٌ أُنشئت قبل العمود، لا تقبل
     إسناداً حتى يُدخِل الموظّف العدد. */
  capacity?: number | null;
  created_at?: string;
  /* م٧ — الموسم المالك للرحلة. تختمه القاعدة بافتراض
     `active_season_id()`، فلا يُرسله العميل عند الإنشاء. */
  season_id?: number;
}
