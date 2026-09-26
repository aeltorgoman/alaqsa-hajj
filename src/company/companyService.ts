import type { AppConfig } from "../config/AppConfig";
import type { Database, Json } from "../types/database";
import type { CompanyAsset, CompanyAssetKey, CompanyProfile, SeasonMasterData } from "./types";
import { isPrivateCompanyAssetKey } from "./types";
import { supabase } from "../supabase";
import { normalizeCompanyAssetUrl, normalizeCompanyColor } from "./safety";
import { classifyPostgrestError, type SaveResult } from "./saveResult";

type ConfigRow = Database["public"]["Tables"]["company_config"]["Row"];
type PublicConfigRow = Database["public"]["Views"]["company_profile_public"]["Row"];
type AssetRow = Database["public"]["Tables"]["company_assets"]["Row"];
type ConfigUpdate = Database["public"]["Tables"]["company_config"]["Update"];
type SeasonRow = Database["public"]["Tables"]["seasons"]["Row"];

const enabled = (value: unknown, fallback = true) => typeof value === "boolean" ? value : fallback;
const text = (value: unknown) => typeof value === "string" ? value : "";
const COMPANY_ASSET_KEYS: readonly CompanyAssetKey[] = [
  "logo", "login_logo", "login_background", "favicon", "portal_banner",
  "dashboard_banner", "report_header", "company_stamp", "manager_signature", "payment_qr",
];

function isCompanyAssetKey(value: string): value is CompanyAssetKey {
  return COMPANY_ASSET_KEYS.includes(value as CompanyAssetKey);
}

function normalizeAssets(rows: AssetRow[]): Partial<Record<CompanyAssetKey, CompanyAsset>> {
  const assets: Partial<Record<CompanyAssetKey, CompanyAsset>> = {};
  rows.forEach(row => {
    if (!isCompanyAssetKey(row.asset_key)) return;
    /* الأصلُ الخاصُّ يحمل **مفتاحَ كائنٍ** لا رابطاً، فلا يمرّ على
       مُطبِّعِ الروابط — كان يردّه `null` فيختفي الأصل. ويُتحقَّق منه
       بشرطه: مسارٌ نسبيٌّ بلا بروتوكول ولا صعودٍ إلى أعلى. */
    if (isPrivateCompanyAssetKey(row.asset_key)) {
      const key = typeof row.asset_url === "string" ? row.asset_url.trim() : "";
      if (!key || /^[a-z]+:/i.test(key) || key.startsWith("/") || key.includes("..")) return;
      assets[row.asset_key] = {
        key: row.asset_key, url: key, isPrivate: true, altText: row.alt_text,
        metadata: row.metadata ?? ({} as Json), updatedAt: row.updated_at,
      };
      return;
    }
    const url = normalizeCompanyAssetUrl(row.asset_url);
    if (!url) return;
    assets[row.asset_key] = {
      key: row.asset_key, url, isPrivate: false, altText: row.alt_text,
      metadata: row.metadata ?? ({} as Json), updatedAt: row.updated_at,
    };
  });
  return assets;
}

export function normalizeCompanyProfile(config: AppConfig | ConfigRow | PublicConfigRow, rows: AssetRow[] = []): CompanyProfile {
  const raw = config as AppConfig & Partial<ConfigRow>;
  /* ⚠️ `features` لم تعد تُقرأ. كانت مفاتيحُها الثلاثة تنقض
     `portal_settings` نقضاً صامتاً: مديرٌ يُشعل «الرفقاء» في صفحة
     البوابة فلا يظهر شيء، ولا واجهةَ تكتب `features` أصلاً ليُطفئ
     الناقض. فصار لظهور أقسام البوابة مصدرٌ واحد. */
  const portal = (raw.portal_settings && typeof raw.portal_settings === "object" && !Array.isArray(raw.portal_settings) ? raw.portal_settings : {}) as Record<string, unknown>;
  /* ⚠️ لا مرتدَّ إلى `company_config.logo_url` ولا إلى
     `banner_image_url` بعد اليوم: `company_assets` هي مرجعُ الأصول
     وحدها، والعمودان يسقطان في ترحيل التنظيف. وصفُّ `logo` مقروءٌ
     لغير المصادَق أيضاً بسياسة `company_assets_public_read`، فشاشةُ
     الدخول لا تفقد شعارَها بذهابهما. */
  const assets = normalizeAssets(rows);

  const primaryColor = normalizeCompanyColor(raw.color_primary, "#1D9E75");
  const accentColor = normalizeCompanyColor(raw.color_accent, "#085041");
  const sidebarColor = normalizeCompanyColor(raw.color_sidebar, "#f9f9f9");

  return {
    identity: { nameAr: raw.name_ar || "نظام الحج", nameEn: raw.name_en || "", tagline: raw.tagline || "", logoUrl: assets.logo?.url ?? null },
    contact: { phone: raw.contact_phone || "", email: raw.contact_email || "", country: raw.country || "", city: raw.city || "" },
    financial: { bankName: text(raw.bank_name), accountName: text(raw.bank_account_name), accountNumber: text(raw.bank_account_number), iban: text(raw.bank_iban), swift: text(raw.bank_swift), commercialRegistration: text(raw.commercial_registration), paymentQrUrl: assets.payment_qr?.url || null },
    branding: { primaryColor, accentColor, sidebarColor, bannerUrl: assets.dashboard_banner?.url ?? null, bannerPosition: raw.banner_position || "center", bannerPositionX: raw.banner_position_x || "50" },
    reportBranding: { logoUrl: assets.logo?.url || "", companyName: raw.name_ar || "نظام الحج", tagline: raw.tagline || "", primaryColor, accentColor, headerUrl: assets.report_header?.url || null, footerText: "" },
    portal: {
      welcomeMessage: text(raw.portal_welcome_message), helpMessage: text(raw.portal_help_message),
      supportPhone: raw.admin_phone || "",
      visibility: {
        flights: enabled(portal.flights), rooms: enabled(portal.rooms), buses: enabled(portal.buses),
        financialBalance: enabled(portal.financial_balance, false), qrCodes: enabled(portal.qr_codes),
        documents: enabled(portal.documents),
        notifications: enabled(portal.notifications), pdfDownloads: enabled(portal.pdf_downloads),
        roommates: enabled(portal.roommates),
        lostCard: enabled(portal.lost_card),
      },
    },
    assets,
  };
}

export const companyService = {
  identity: (profile: CompanyProfile) => profile.identity,
  contact: (profile: CompanyProfile) => profile.contact,
  financial: (profile: CompanyProfile) => profile.financial,
  branding: (profile: CompanyProfile) => profile.branding,
  reportBranding: (profile: CompanyProfile) => profile.reportBranding,
  portal: (profile: CompanyProfile) => profile.portal,
  assets: (profile: CompanyProfile) => profile.assets,
  asset: (profile: CompanyProfile, key: CompanyAssetKey) => profile.assets[key] ?? null,
  async load() {
    const { data: authData } = await supabase.auth.getSession();
    /* ⚠️ المسارُ العلنيّ يذكر أعمدتَه بأسمائها. و`select("*")` على
       سطحٍ يقرؤه غيرُ المصادَق يجعل كلَّ عمودٍ يُضاف إلى العرض
       مكشوفاً بلا قرار — وقائمةٌ صريحةٌ تفشل بوضوحٍ بدل أن تُسرِّب
       بصمت. */
    const configQuery = authData.session
      ? supabase.from("company_config").select("*").eq("id", 1).single()
      : supabase.from("company_profile_public")
          .select("id,name_ar,name_en,tagline,color_primary,color_accent,color_sidebar")
          .eq("id", 1).single();
    const [configResult, assetsResult] = await Promise.all([
      configQuery,
      supabase.from("company_assets").select("*").order("asset_key"),
    ]);
    /* الأصولُ تُقرأ من `company_assets` في المسارين معاً: المصادَقُ
       يراها كلَّها، وغيرُ المصادَق يرى قائمةَ السماح العلنيّة. ولم
       يبقَ في `company_config` عمودُ أصلٍ يُرتَدّ إليه. */
    return { config: configResult.data, assets: assetsResult.data ?? [], error: configResult.error };
  },
  /* ⚠️ `.select().single()` هنا لنفس سببها في `updateConfig`: بدونها
     يرسل PostgREST الطلبَ بلا تمثيل، فيردّ 204 على النجاح **وعلى
     صفرِ صفوفٍ رشّحتها RLS سواء**. والمسارُ الخطر هو فرعُ التحديث من
     الـupsert: الإدراجُ الممنوعُ يردّ 42501 صريحاً، أمّا تحديثُ صفٍّ
     قائمٍ رشّحته `USING` فيمضي صامتاً. والآن يعود PGRST116 فيُقرأ
     خطأً — وشكلُ النتيجةِ لم يتغيّر، فالمستدعي القائمُ يفحص `error`
     كما كان. */
  async saveAsset(asset: { key: CompanyAssetKey; url: string; altText?: string | null; metadata?: Json }) {
    return supabase.from("company_assets").upsert({
      asset_key: asset.key, asset_url: asset.url, alt_text: asset.altText ?? null,
      metadata: asset.metadata ?? {}, updated_at: new Date().toISOString(),
    }).select().single();
  },
  /* والحذفُ مثلُها: `delete` بلا تمثيل يردّ 204 سواءٌ حُذف صفٌّ أم
     رشّحت RLS كلَّ شيء. و`.select()` تُعيد المحذوفَ فعلاً، فالمصفوفةُ
     الفارغةُ تعني «لم يُحذف شيء» لا «تمّ». */
  async removeAsset(key: CompanyAssetKey) { return supabase.from("company_assets").delete().eq("asset_key", key).select(); },
  async loadConfig() { return supabase.from("company_config").select("*").eq("id", 1).single(); },

  /* ⚠️ `.select().single()` ليست زينة: بدونها يرسل PostgREST
     PATCH بلا تمثيل، فيردّ 204 على نجاحٍ **وعلى صفرِ صفوفٍ رشّحتها
     RLS سواء**. فكان غيابُ الخطأ يُقرأ حفظاً. والآن لا نجاحَ بلا
     صفٍّ معاد. */
  async updateConfig(values: ConfigUpdate): Promise<SaveResult<ConfigRow>> {
    const { data, error } = await supabase
      .from("company_config").update(values).eq("id", 1).select().single();
    if (error) return classifyPostgrestError(error);
    if (!data) return { status: "not_found", message: "تعذّر الوصول إلى صفّ إعدادات الحملة، لم يُحفظ شيء." };
    return { status: "saved", data };
  },

  /* ═══ إعداداتُ البوابة — البابُ الضيّق ═══
     ستّةُ حقولٍ فقط، وسياسةُ `company_config` لم تُوسَّع: الدالّة
     وحدها تملك التفويض، فلا يستطيع `manage_portal` أن يصل إلى عمودٍ
     آخر مهما صيغ الطلب. والصفُّ المعاد برهانُ الأثر. */
  async updatePortalSettings(values: {
    portal_settings: Record<string, boolean>;
    portal_welcome_message: string | null;
    portal_help_message: string | null;
    admin_name: string | null;
    admin_phone: string | null;
    admin_whatsapp: string | null;
  }): Promise<SaveResult<ConfigRow>> {
    const { data, error } = await supabase.rpc("update_portal_settings", {
      p_portal_settings: values.portal_settings as unknown as Json,
      p_portal_welcome_message: values.portal_welcome_message,
      p_portal_help_message: values.portal_help_message,
      p_admin_name: values.admin_name,
      p_admin_phone: values.admin_phone,
      p_admin_whatsapp: values.admin_whatsapp,
    });
    if (error) return classifyPostgrestError(error);
    if (!data) return { status: "not_found", message: "تعذّر الوصول إلى صفّ إعدادات الحملة، لم يُحفظ شيء." };
    return { status: "saved", data: data as unknown as ConfigRow };
  },

  /* ═══ بياناتُ الموسم الرئيسة — بابُ الموسم النشط ═══
     على `seasons` سياسةُ `select` وحدها: لا `update` ولا `insert`.
     فلا سبيلَ إلى الكتابة إلا بهذه الدالّة، وحارسُها في جسدها لا
     حولها. و`closed_at is null` داخلها يعني شيئين معاً: النشطُ
     وحده يُعدَّل، والمؤرشفُ لا يُمَسّ.

     و`hijri_year` ليست في التوقيع — هويّةُ الموسم لا تُبدَّل من
     شاشةِ تحرير بياناته. */
  async updateActiveSeason(values: {
    name: string;
    hotel_name: string | null;
    hotel_address: string | null;
    hotel_url: string | null;
    mina_address: string | null;
    mina_url: string | null;
    arafa_address: string | null;
    arafa_url: string | null;
  }): Promise<SaveResult<SeasonRow>> {
    const { data, error } = await supabase.rpc("update_active_season", {
      p_name: values.name,
      p_hotel_name: values.hotel_name,
      p_hotel_address: values.hotel_address,
      p_hotel_url: values.hotel_url,
      p_mina_address: values.mina_address,
      p_mina_url: values.mina_url,
      p_arafa_address: values.arafa_address,
      p_arafa_url: values.arafa_url,
    });
    if (error) return classifyPostgrestError(error);
    if (!data) return { status: "not_found", message: "لا يوجد موسم مفتوح لتعديله، لم يُحفظ شيء." };
    return { status: "saved", data: data as unknown as SeasonRow };
  },
};

/* ═══ قارئُ بيانات الموسم ═══
   موضعٌ واحدٌ يحوّل صفَّ الموسم إلى نصوصٍ جاهزةٍ للعرض، فلا يتكرّر
   `|| ""` في كلّ شاشة. ويُستدعى بـ`viewedSeason` في المطبوعات
   والأرشيف، وبـ`activeSeason` في التحرير. */
export function seasonMasterData(season: {
  name: string;
  hotel_name?: string | null; hotel_address?: string | null; hotel_url?: string | null;
  mina_address?: string | null; mina_url?: string | null;
  arafa_address?: string | null; arafa_url?: string | null;
}): SeasonMasterData {
  return {
    name: season.name || "",
    hotelName: season.hotel_name || "", hotelAddress: season.hotel_address || "", hotelUrl: season.hotel_url || "",
    minaAddress: season.mina_address || "", minaUrl: season.mina_url || "",
    arafaAddress: season.arafa_address || "", arafaUrl: season.arafa_url || "",
  };
}
