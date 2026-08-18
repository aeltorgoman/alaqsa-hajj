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
  /* عمود قائم في القاعدة بافتراضي 50 — كان غيابه يفرض (bus as any).capacity */
  capacity?: number | null;
  season_id?: number | null;
  created_at?: string;
}

export interface Camp {
  id: number;
  name: string;
  gender: string;
  type: string;
  page_type: string;
  season_id?: number | null;
  created_at?: string;
}

export interface Room {
  id: number;
  number: string;
  floor: string;
  type: "فردية" | "ثنائية" | "ثلاثية" | "رباعية" | "مجلس" | "أخرى";
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
  created_at?: string;
}
