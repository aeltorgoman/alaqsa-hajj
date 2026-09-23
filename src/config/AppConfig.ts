/* ═══ شكلُ الصفّ الخام ═══
   طبقةُ توافقٍ بين صفّ `company_config` و`normalizeCompanyProfile`.
   لا تُقرأ من مكوّن — المكوّناتُ تقرأ `CompanyProfile` عبر
   `CompanyService`.

   ⚠️ وما خرج منها خرج بقرار:
   `season_label` — اسمُ الموسم صار في `seasons.name` وحده.
   `hotel_*` و`camp_*` — أماكنُ الموسم صارت في صفّ الموسم.
   `features` — `portal_settings` هي مرجعُ ظهور أقسام البوابة.
   `logo_url` و`banner_image_url` — `company_assets` هي مرجعُ الأصول.
   وقد سقطت هذه الأعمدةُ كلُّها من القاعدة في ترحيل التنظيف، فلم
   يبقَ لها وجودٌ لا هنا ولا هناك. */
export interface AppConfig {
  name_ar: string;
  name_en: string;
  tagline: string;
  color_primary: string;
  color_accent: string;
  color_sidebar: string;
  contact_phone: string;
  contact_email: string;
  /* حقول بوابة الحاج */
  admin_name?: string | null;
  admin_phone?: string | null;
  admin_whatsapp?: string | null;
  country?: string | null;
  city?: string | null;
  bank_name?: string | null;
  bank_account_name?: string | null;
  bank_account_number?: string | null;
  bank_iban?: string | null;
  bank_swift?: string | null;
  commercial_registration?: string | null;
  portal_welcome_message?: string | null;
  portal_help_message?: string | null;
  portal_settings?: Record<string, boolean> | null;
}

export const DEFAULT_CONFIG: AppConfig = {
  name_ar: "نظام الحج",
  name_en: "Hajj System",
  tagline: "نظام إدارة الحج",
  color_primary: "#1D9E75",
  color_accent: "#085041",
  color_sidebar: "#f9f9f9",
  contact_phone: "",
  contact_email: "",
};
