export interface User {
  id: number;
  name: string;
  username: string;
  password: string;
  permissions: Record<string, boolean>;
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
  bus_id?: number | null;
  room_id?: number | null;
  camp_mina_id?: number | null;
  camp_arafa_id?: number | null;
  flight_id?: number | null;
  return_flight_id?: number | null;
  flight_class?: string;
  season_id?: number | null;
  sort_order?: number;
  created_at?: string;
  created_by?: string;
  updated_by?: string;
  updated_at?: string;
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
  type: "ثنائية" | "ثلاثية" | "رباعية" | "سويت";
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
  created_at?: string;
}
