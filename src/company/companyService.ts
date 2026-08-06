import type { AppConfig } from "../config/AppConfig";
import type { Database, Json } from "../types/database";
import type { CompanyAsset, CompanyProfile } from "./types";
import { supabase } from "../supabase";
import { normalizeCompanyAssetUrl, normalizeCompanyColor } from "./safety";

type ConfigRow = Database["public"]["Tables"]["company_config"]["Row"];
type PublicConfigRow = Database["public"]["Views"]["company_profile_public"]["Row"];
type AssetRow = Database["public"]["Tables"]["company_assets"]["Row"];
type ConfigUpdate = Database["public"]["Tables"]["company_config"]["Update"];

const enabled = (value: unknown, fallback = true) => typeof value === "boolean" ? value : fallback;
const text = (value: unknown) => typeof value === "string" ? value : "";

export function normalizeCompanyProfile(config: AppConfig | ConfigRow | PublicConfigRow, rows: AssetRow[] = []): CompanyProfile {
  const raw = config as AppConfig & Partial<ConfigRow>;
  const features = (raw.features && typeof raw.features === "object" ? raw.features : {}) as Record<string, unknown>;
  const portal = (raw.portal_settings && typeof raw.portal_settings === "object" && !Array.isArray(raw.portal_settings) ? raw.portal_settings : {}) as Record<string, unknown>;
  const assets = Object.fromEntries(rows.flatMap((row): [string, CompanyAsset][] => {
    const url = normalizeCompanyAssetUrl(row.asset_url);
    return url ? [[row.asset_key, {
      key: row.asset_key, url, altText: row.alt_text,
      metadata: row.metadata ?? ({} as Json), updatedAt: row.updated_at,
    }]] : [];
  }));
  const legacyLogoUrl = normalizeCompanyAssetUrl(raw.logo_url);
  const legacyBannerUrl = normalizeCompanyAssetUrl(raw.banner_image_url);
  if (legacyLogoUrl && !assets.logo) assets.logo = { key: "logo", url: legacyLogoUrl, altText: raw.name_ar, metadata: {}, updatedAt: null };

  const primaryColor = normalizeCompanyColor(raw.color_primary, "#1D9E75");
  const accentColor = normalizeCompanyColor(raw.color_accent, "#085041");
  const sidebarColor = normalizeCompanyColor(raw.color_sidebar, "#f9f9f9");

  return {
    identity: { nameAr: raw.name_ar || "نظام الحج", nameEn: raw.name_en || "", tagline: raw.tagline || "", logoUrl: assets.logo?.url || legacyLogoUrl, seasonLabel: raw.season_label || "" },
    contact: { phone: raw.contact_phone || "", email: raw.contact_email || "", country: raw.country || "", city: raw.city || "" },
    financial: { bankName: text(raw.bank_name), accountName: text(raw.bank_account_name), accountNumber: text(raw.bank_account_number), iban: text(raw.bank_iban), swift: text(raw.bank_swift), paymentQrUrl: assets.payment_qr?.url || null },
    branding: { primaryColor, accentColor, sidebarColor, bannerUrl: assets.dashboard_banner?.url || legacyBannerUrl, bannerPosition: raw.banner_position || "center", bannerPositionX: raw.banner_position_x || "50" },
    reportBranding: { logoUrl: assets.logo?.url || legacyLogoUrl || "", companyName: raw.name_ar || "نظام الحج", tagline: raw.tagline || "", primaryColor, accentColor, headerUrl: assets.report_header?.url || null, footerText: "" },
    portal: {
      welcomeMessage: text(raw.portal_welcome_message), helpMessage: text(raw.portal_help_message),
      supportPhone: raw.admin_phone || "", hotelName: raw.hotel_name || "", hotelAddress: raw.hotel_address || "",
      visibility: {
        flights: enabled(portal.flights), rooms: enabled(portal.rooms), buses: enabled(portal.buses),
        financialBalance: enabled(portal.financial_balance, false), qrCodes: enabled(portal.qr_codes),
        documents: enabled(portal.documents, features.portal_documents !== false),
        notifications: enabled(portal.notifications), pdfDownloads: enabled(portal.pdf_downloads),
        roommates: enabled(portal.roommates, features.portal_roommates !== false),
        lostCard: enabled(portal.lost_card, features.portal_lost_card !== false),
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
  asset: (profile: CompanyProfile, key: string) => profile.assets[key] ?? null,
  async load() {
    const { data: authData } = await supabase.auth.getSession();
    const configQuery = authData.session
      ? supabase.from("company_config").select("*").eq("id", 1).single()
      : supabase.from("company_profile_public").select("*").eq("id", 1).single();
    const [configResult, assetsResult] = await Promise.all([
      configQuery,
      supabase.from("company_assets").select("*").order("asset_key"),
    ]);
    // Missing assets remain a valid legacy deployment; company_config is the
    // compatibility source until the additive migration is applied.
    return { config: configResult.data, assets: assetsResult.data ?? [], error: configResult.error };
  },
  async saveAsset(asset: { key: string; url: string; altText?: string | null; metadata?: Json }) {
    return supabase.from("company_assets").upsert({
      asset_key: asset.key, asset_url: asset.url, alt_text: asset.altText ?? null,
      metadata: asset.metadata ?? {}, updated_at: new Date().toISOString(),
    });
  },
  async removeAsset(key: string) { return supabase.from("company_assets").delete().eq("asset_key", key); },
  async loadConfig() { return supabase.from("company_config").select("*").eq("id", 1).single(); },
  async updateConfig(values: ConfigUpdate) { return supabase.from("company_config").update(values).eq("id", 1); },
  applyMetadata(profile: CompanyProfile) {
    if (typeof document === "undefined") return;
    document.title = profile.identity.tagline
      ? `${profile.identity.nameAr} — ${profile.identity.tagline}`
      : profile.identity.nameAr;
    const setMeta = (selector: string, attribute: "content" | "href", value: string) => {
      const element = document.querySelector<HTMLMetaElement | HTMLLinkElement>(selector);
      if (element && value) element.setAttribute(attribute, value);
    };
    setMeta('meta[name="theme-color"]', "content", profile.branding.primaryColor);
    setMeta('meta[property="og:title"]', "content", profile.identity.nameAr);
    setMeta('meta[property="og:description"]', "content", profile.identity.tagline);
    const favicon = profile.assets.favicon?.url || profile.identity.logoUrl || "";
    setMeta('link[rel="icon"]', "href", favicon);
  },
};
