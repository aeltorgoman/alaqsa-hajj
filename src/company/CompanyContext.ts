import { createContext, useContext } from "react";
import type { CompanyProfile } from "./types";
import { companyService } from "./companyService";

export const CompanyContext = createContext<CompanyProfile | null>(null);
export function useCompanyProfile() { const value = useContext(CompanyContext); if (!value) throw new Error("useCompanyProfile خارج ConfigProvider"); return value; }
export function useCompanyIdentity() { return companyService.identity(useCompanyProfile()); }
export function useCompanyContact() { return companyService.contact(useCompanyProfile()); }
export function useCompanyBranding() { return companyService.branding(useCompanyProfile()); }
export function useReportBranding() { return companyService.reportBranding(useCompanyProfile()); }
export function useCompanyFinancial() { return companyService.financial(useCompanyProfile()); }
export function useCompanyPortal() { return companyService.portal(useCompanyProfile()); }
export function useCompanyAssets() { return companyService.assets(useCompanyProfile()); }
