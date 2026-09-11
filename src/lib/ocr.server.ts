/**
 * OCR fallback for scanned / image-only PDFs via OpenRouter-compatible vision/file API.
 */
import { hasUsableExtractedText, cleanExtractedText } from "@/lib/analysis-agents.server";
import { isAutoRouterModel } from "@/lib/agent-defaults";

const MAX_OCR_BYTES = 12 * 1024 * 1024;

export type OcrResult = {
  text: string;
  used: boolean;
  meta: {
    method?: string;
    model?: string;
    error?: string;
    bytes?: number;
  };
};

/**
 * When native PDF text extraction fails, ask a multimodal model to extract text.
 * Uses the same AI_API_KEY / AI_BASE_URL as the rest of the app.
 */
export async function ocrPdfWithVision(
  bytes: ArrayBuffer,
  filename: string,
): Promise<OcrResult> {
  const buf = Buffer.from(bytes);
  if (buf.byteLength === 0) {
    return { text: "", used: false, meta: { error: "empty file" } };
  }
  if (buf.byteLength > MAX_OCR_BYTES) {
    return {
      text: "",
      used: false,
      meta: { error: `PDF too large for OCR (${buf.byteLength} bytes)`, bytes: buf.byteLength },
    };
  }

  const key = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) {
    return { text: "", used: false, meta: { error: "AI_API_KEY not configured for OCR" } };
  }

  const base = (process.env.AI_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  const requested =
    process.env.AI_OCR_MODEL ||
    process.env.AI_DEFAULT_MODEL ||
    "google/gemini-2.5-flash";
  // Auto Router is for text analysis; scanned PDFs need a pinned vision model.
  const model = isAutoRouterModel(requested) ? "google/gemini-2.5-flash" : requested;

  const b64 = buf.toString("base64");
  const dataUrl = `data:application/pdf;base64,${b64}`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${key}`,
  };
  if (base.includes("openrouter.ai")) {
    headers["HTTP-Referer"] = process.env.APP_URL || "http://localhost:3000";
    headers["X-Title"] = "Counterpart OCR";
  }

  const body = {
    model,
    temperature: 0,
    max_tokens: 16000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              `Extract ALL readable text from this PDF ("${filename}").`,
              "Preserve clause numbers, headings, and table rows as plain text.",
              "Return plain text only — no markdown fences or commentary.",
            ].join(" "),
          },
          {
            type: "file",
            file: {
              filename: filename || "document.pdf",
              file_data: dataUrl,
            },
          },
        ],
      },
    ],
  };

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      // Fallback: some gateways reject `file` parts — try as image/pdf url style text note
      if (res.status === 400 || res.status === 422) {
        return await ocrPdfAsImagePrompt(base, headers, model, dataUrl, filename);
      }
      return {
        text: "",
        used: false,
        meta: { method: "vision-file", model, error: `HTTP ${res.status}: ${t.slice(0, 200)}`, bytes: buf.byteLength },
      };
    }
    const json = await res.json();
    const text = cleanExtractedText(String(json?.choices?.[0]?.message?.content ?? ""));
    if (!hasUsableExtractedText(text)) {
      return {
        text: "",
        used: true,
        meta: { method: "vision-file", model, error: "OCR returned unusable text", bytes: buf.byteLength },
      };
    }
    return {
      text,
      used: true,
      meta: { method: "vision-file", model, bytes: buf.byteLength },
    };
  } catch (err: any) {
    return {
      text: "",
      used: false,
      meta: { method: "vision-file", model, error: String(err?.message ?? err).slice(0, 240) },
    };
  }
}

async function ocrPdfAsImagePrompt(
  base: string,
  headers: Record<string, string>,
  model: string,
  dataUrl: string,
  filename: string,
): Promise<OcrResult> {
  // Second attempt: send PDF as a single image_url-compatible data URL (Gemini/OpenRouter often accepts this).
  const body = {
    model,
    temperature: 0,
    max_tokens: 16000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Extract all text from the attached scanned PDF "${filename}". Plain text only.`,
          },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
  };
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return {
        text: "",
        used: false,
        meta: { method: "vision-image_url", model, error: `HTTP ${res.status}: ${t.slice(0, 200)}` },
      };
    }
    const json = await res.json();
    const text = cleanExtractedText(String(json?.choices?.[0]?.message?.content ?? ""));
    return {
      text: hasUsableExtractedText(text) ? text : "",
      used: true,
      meta: {
        method: "vision-image_url",
        model,
        error: hasUsableExtractedText(text) ? undefined : "OCR returned unusable text",
      },
    };
  } catch (err: any) {
    return {
      text: "",
      used: false,
      meta: { method: "vision-image_url", model, error: String(err?.message ?? err).slice(0, 240) },
    };
  }
}
