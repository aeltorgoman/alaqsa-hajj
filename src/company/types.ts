import type { Json } from "../types/database";

export interface CompanyIdentity { nameAr: string; nameEn: string; tagline: string; logoUrl: string | null; seasonLabel: string }
export interface CompanyContact { phone: string; email: string; country: string; city: string }
export interface CompanyFinancial { bankName: string; accountName: string; accountNumber: string; iban: string; swift: string; paymentQrUrl: string | null }
export interface CompanyBranding { primaryColor: string; accentColor: string; sidebarColor: string; bannerUrl: string | null; bannerPosition: string; bannerPositionX: string }
export interface ReportBranding { logoUrl: string; companyName: string; tagline: string; primaryColor: string; accentColor: string; headerUrl: string | null; footerText: string }
export interface CompanyPortal {
  welcomeMessage: string; helpMessage: string;
  supportPhone: string; hotelName: string; hotelAddress: string;
  visibility: { flights: boolean; rooms: boolean; buses: boolean; financialBalance: boolean; qrCodes: boolean; documents: boolean; notifications: boolean; pdfDownloads: boolean; roommates: boolean; lostCard: boolean };
}
export interface CompanyAsset { key: string; url: string; altText: string | null; metadata: Json; updatedAt: string | null }
export interface CompanyProfile {
  identity: CompanyIdentity; contact: CompanyContact; financial: CompanyFinancial;
  branding: CompanyBranding; reportBranding: ReportBranding; portal: CompanyPortal; assets: Readonly<Record<string, CompanyAsset>>;
}
