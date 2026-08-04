const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPPORTED_MODES = ["passport", "idcard", "hajj_permit", "auto"] as const;
type ScanMode = typeof SUPPORTED_MODES[number];

type ScanRequest = {
  imageBase64?: unknown;
  mediaType?: unknown;
  mode?: unknown;
};

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function fail(status: number, code: string, message: string): Response {
  return json(status, { success: false, error: { code, message } });
}

function isScanMode(value: unknown): value is ScanMode {
  return typeof value === "string" && (SUPPORTED_MODES as readonly string[]).includes(value);
}

const MODE_INSTRUCTIONS: Record<ScanMode, string> = {
  passport: "Extract passport data.",
  idcard: "Extract national identity card data.",
  hajj_permit: "Extract Hajj permit data.",
  auto: "Identify whether the document is a passport, idcard, or hajj_permit, then extract its data.",
};

function buildPrompt(mode: ScanMode): string {
  return `${MODE_INSTRUCTIONS[mode]}
Return only one JSON object, without markdown. Use empty strings for unavailable values.
Keep names and values exactly as shown on the document. Dates should use DD/MM/YYYY when possible.
Use these field names: doc_type, name_en, name_ar, passport, national_id, nationality, dob, expiry, id_expiry, gender, permit_number.
For doc_type use passport, idcard, or hajj_permit.`;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED", "الطريقة غير مدعومة.");

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.error("Scan-passport configuration error: ANTHROPIC_API_KEY is missing");
    return fail(500, "SERVICE_NOT_CONFIGURED", "خدمة تحليل المستندات غير مهيأة.");
  }

  let body: ScanRequest;
  try {
    body = await request.json();
  } catch (error) {
    console.error("Scan-passport received invalid JSON", error);
    return fail(400, "INVALID_REQUEST", "بيانات الطلب غير صالحة.");
  }

  if (typeof body.imageBase64 !== "string" || body.imageBase64.trim() === "") {
    return fail(400, "MISSING_IMAGE", "صورة المستند مطلوبة.");
  }
  if (typeof body.mediaType !== "string" || !body.mediaType.startsWith("image/")) {
    return fail(400, "INVALID_MEDIA_TYPE", "نوع صورة المستند غير صالح.");
  }
  if (!isScanMode(body.mode)) {
    return fail(400, "INVALID_MODE", "نوع عملية المسح غير صالح.");
  }

  let anthropicResponse: Response;
  try {
    anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 2048,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: body.mediaType, data: body.imageBase64 } },
            { type: "text", text: buildPrompt(body.mode) },
          ],
        }],
      }),
    });
  } catch (error) {
    console.error("Scan-passport could not reach Anthropic", error);
    return fail(502, "PROVIDER_UNAVAILABLE", "تعذر الوصول إلى خدمة تحليل المستندات.");
  }

  if (!anthropicResponse.ok) {
    console.error("Anthropic rejected document scan", { status: anthropicResponse.status });
    const status = anthropicResponse.status >= 500 ? 502 : 422;
    return fail(status, "PROVIDER_REQUEST_FAILED", "تعذر تحليل المستند المرسل.");
  }

  let result: unknown;
  try {
    result = await anthropicResponse.json();
  } catch (error) {
    console.error("Anthropic returned invalid JSON", error);
    return fail(502, "INVALID_PROVIDER_RESPONSE", "تلقت خدمة المسح استجابة غير صالحة.");
  }

  if (typeof result !== "object" || result === null || !("content" in result) || !Array.isArray(result.content) || result.content.length === 0) {
    console.error("Anthropic response did not contain content");
    return fail(502, "EMPTY_PROVIDER_RESPONSE", "لم تُرجع خدمة التحليل بيانات صالحة.");
  }

  return json(200, result);
});
