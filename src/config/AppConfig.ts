export interface AppConfig {
  name_ar: string;
  name_en: string;
  tagline: string;
  logo_url: string | null;
  banner_image_url: string | null;
  color_primary: string;
  color_accent: string;
  color_sidebar: string;
  contact_phone: string;
  contact_email: string;
  season_label: string;
  /* حقول بوابة الحاج */
  admin_name?: string | null;
  admin_phone?: string | null;
  admin_whatsapp?: string | null;
  hotel_name?: string | null;
  hotel_address?: string | null;
  camp_mina_address?: string | null;
  camp_arafa_address?: string | null;
  country?: string | null;
  city?: string | null;
  features: {
    scan: boolean;
    buses: boolean;
    camps_mina: boolean;
    camps_arafa: boolean;
    hotel: boolean;
    reports: boolean;
    archive: boolean;
    users: boolean;
  };
}

export const DEFAULT_CONFIG: AppConfig = {
  name_ar: "نظام الحج",
  name_en: "Hajj System",
  tagline: "نظام إدارة الحج",
  logo_url: null,
  banner_image_url: null,
  color_primary: "#1D9E75",
  color_accent: "#085041",
  color_sidebar: "#f9f9f9",
  contact_phone: "",
  contact_email: "",
  season_label: "موسم الحج",
  features: {
    scan: true,
    buses: true,
    camps_mina: true,
    camps_arafa: true,
    hotel: true,
    reports: true,
    archive: true,
    users: true,
  },
};
