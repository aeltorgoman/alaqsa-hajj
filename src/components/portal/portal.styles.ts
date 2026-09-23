/* ═══ نمطُ البطاقة المشترك ═══
   ثابتُ نمطٍ لا مكوّن — لنفس سبب فصل الأيقونات. والقيمُ كما هي. */
import type { CSSProperties } from "react";
import { LINE } from "./portal.theme";

export const cardStyle: CSSProperties = {
  background: "#fff", border: `1px solid ${LINE}`, borderRadius: 20,
  padding: 19, marginBottom: 14, boxShadow: "0 5px 20px rgba(93,16,41,.08)",
};
