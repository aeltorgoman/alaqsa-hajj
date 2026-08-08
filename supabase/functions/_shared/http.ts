// ============================================================
// _shared/http — ترويسات وردود موحّدة لكل Edge Function
// ============================================================
// ملف واحد بدل نسخة في كل دالة، فلا تتفارق الترويسات ولا شكل
// رسالة الخطأ بين دالة وأخرى.

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export const fail = (status: number, message: string) => json(status, { error: message });
