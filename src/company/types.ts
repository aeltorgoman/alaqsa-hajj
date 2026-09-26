import type { Json } from "../types/database";

/* ⚠️ لا `seasonLabel` هنا. اسمُ الموسم يملكه `seasons.name` وحده،
   ويُقرأ من `useSeason()` لا من هويّة الشركة. وبقاؤه في هذا العقد
   كان يجعل لاسمِ الموسم مصدرين. */
export interface CompanyIdentity { nameAr: string; nameEn: string; tagline: string; logoUrl: string | null }
export interface CompanyContact { phone: string; email: string; country: string; city: string }
export interface CompanyFinancial { bankName: string; accountName: string; accountNumber: string; iban: string; swift: string; commercialRegistration: string; paymentQrUrl: string | null }
export interface CompanyBranding { primaryColor: string; accentColor: string; sidebarColor: string; bannerUrl: string | null; bannerPosition: string; bannerPositionX: string }
export interface ReportBranding { logoUrl: string; companyName: string; tagline: string; primaryColor: string; accentColor: string; headerUrl: string | null; footerText: string }
/* ⚠️ ولا فندقَ هنا. الفندقُ بيانُ موسمٍ يملكه صفُّ الموسم،
   و`useSeason().viewedSeason` هو من يعطيه. */
export interface CompanyPortal {
  welcomeMessage: string; helpMessage: string;
  supportPhone: string;
  visibility: { flights: boolean; rooms: boolean; buses: boolean; financialBalance: boolean; qrCodes: boolean; documents: boolean; notifications: boolean; pdfDownloads: boolean; roommates: boolean; lostCard: boolean };
}
export type CompanyAssetKey =
  | "logo"
  | "login_logo"
  | "login_background"
  | "favicon"
  | "portal_banner"
  | "dashboard_banner"
  | "report_header"
  | "company_stamp"
  | "manager_signature"
  | "payment_qr";
/* ═══ الأصولُ الخاصّة ═══
   الخِتمُ وتوقيعُ المسؤولِ **ليسا** هويّةً بصريّةً علنيّة: يعيشان في
   حاويةٍ خاصّة، ويُخزَّن منهما **مفتاحُ الكائن** لا رابطٌ عامّ، ويُوقَّع
   عند العرض. وما عداهما يبقى رابطاً عامّاً كما كان. */
export const PRIVATE_COMPANY_ASSET_KEYS = ["company_stamp", "manager_signature"] as const;
export type PrivateCompanyAssetKey = typeof PRIVATE_COMPANY_ASSET_KEYS[number];
export function isPrivateCompanyAssetKey(key: CompanyAssetKey): key is PrivateCompanyAssetKey {
  return (PRIVATE_COMPANY_ASSET_KEYS as readonly string[]).includes(key);
}

/* `url` للأصلِ العامّ رابطٌ كامل، وللخاصِّ **مفتاحُ كائنٍ** يُوقَّع عند
   العرض. و`isPrivate` تُميّزهما فلا يُمرَّر مفتاحٌ إلى `src` مباشرةً. */
export interface CompanyAsset { key: CompanyAssetKey; url: string; isPrivate: boolean; altText: string | null; metadata: Json; updatedAt: string | null }

/* ما يُسجَّل في `company_assets.metadata` بعد التطبيع — أبعادٌ ونوعٌ
   وعلاماتُ معالجة، لا شيءَ حسّاس. */
export interface CompanyAssetImageMeta {
  width?: number; height?: number;
  originalWidth?: number; originalHeight?: number;
  mimeType?: string; bytes?: number;
  hasAlpha?: boolean; trimmed?: boolean;
  /** أُزيلت خلفيّةُ الورقِ المُصمَتة أثناءَ التطبيع */
  backgroundRemoved?: boolean;
  normalizedVersion?: number;
}
export interface CompanyProfile {
  identity: CompanyIdentity; contact: CompanyContact; financial: CompanyFinancial;
  branding: CompanyBranding; reportBranding: ReportBranding; portal: CompanyPortal; assets: Readonly<Partial<Record<CompanyAssetKey, CompanyAsset>>>;
}

/* ═══ بياناتُ الموسم الرئيسة ═══
   ما يملكه صفُّ الموسم نفسُه. تُقرأ من `useSeason()` — من
   `viewedSeason` في المطبوعات والأرشيف، ومن `activeSeason` في
   التحرير. والسنةُ هويّةٌ لا تُعدَّل بهذا الباب. */
export interface SeasonMasterData {
  name: string;
  hotelName: string; hotelAddress: string; hotelUrl: string;
  minaAddress: string; minaUrl: string;
  arafaAddress: string; arafaUrl: string;
}
