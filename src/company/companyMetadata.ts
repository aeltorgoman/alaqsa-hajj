import type { CompanyProfile } from "./types";

export function applyCompanyMetadata(profile: CompanyProfile) {
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
}
