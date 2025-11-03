import { WORKFLOW_ID } from "@/lib/config";

export const runtime = "edge";

interface CreateSessionRequestBody {
  workflow?: { id?: string | null } | null;
  scope?: { user_id?: string | null } | null;
  workflowId?: string | null;
  chatkit_configuration?: {
    file_upload?: {
      enabled?: boolean;
    };
  };
}

const DEFAULT_CHATKIT_BASE = "https://api.openai.com";
const SESSION_COOKIE_NAME = "chatkit_session_id";
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const ALLOWED_ORIGIN = "https://relaxed-hummingbird-a87f42.netlify.app"; // ✅ your Netlify site

// ---------- OPTIONS ----------
export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}

// ---------- POST ----------
export async function POST(request: Request): Promise<Response> {
  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return corsResponse({ error: "Missing OPENAI_API_KEY" }, 500);
    }

    const parsedBody = await safeParseJson<CreateSessionRequestBody>(request);
    const { userId, sessionCookie } = await resolveUserId(request);
    const resolvedWorkflowId =
      parsedBody?.workflow?.id ?? parsedBody?.workflowId ?? WORKFLOW_ID;

    if (!resolvedWorkflowId) {
      return corsResponse({ error: "Missing workflow id" }, 400, sessionCookie);
    }

    const apiBase = process.env.CHATKIT_API_BASE ?? DEFAULT_CHATKIT_BASE;
    const upstreamResponse = await fetch(`${apiBase}/v1/chatkit/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
        "OpenAI-Beta": "chatkit_beta=v1",
      },
      body: JSON.stringify({
        workflow: { id: resolvedWorkflowId },
        user: userId,
        chatkit_configuration: {
          file_upload: {
            enabled:
              parsedBody?.chatkit_configuration?.file_upload?.enabled ?? false,
          },
        },
      }),
    });

    const data = (await upstreamResponse.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    if (!upstreamResponse.ok) {
      console.error("OpenAI ChatKit session creation failed:", data);
      return corsResponse(
        { error: "Failed to create session", details: data },
        upstreamResponse.status,
        sessionCookie
      );
    }

    return corsResponse(
      {
        client_secret: data.client_secret ?? null,
        expires_after: data.expires_after ?? null,
      },
      200,
      sessionCookie
    );
  } catch (err) {
    console.error("Create session error:", err);
    return corsResponse({ error: "Unexpected error" }, 500);
  }
}

// ---------- HELPERS ----------
function corsResponse(
  payload: unknown,
  status: number,
  cookie?: string | null
): Response {
  const headers = new Headers({
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Content-Type": "application/json",
  });
  if (cookie) headers.append("Set-Cookie", cookie);
  return new Response(JSON.stringify(payload), { status, headers });
}

async function safeParseJson<T>(req: Request): Promise<T | null> {
  try {
    const text = await req.text();
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

async function resolveUserId(request: Request): Promise<{
  userId: string;
  sessionCookie: string | null;
}> {
  const existing = getCookieValue(
    request.headers.get("cookie"),
    SESSION_COOKIE_NAME
  );
  if (existing) return { userId: existing, sessionCookie: null };

  const generated =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return { userId: generated, sessionCookie: serializeSessionCookie(generated) };
}

function getCookieValue(
  cookieHeader: string | null,
  name: string
): string | null {
  if (!cookieHeader) return null;
  return cookieHeader
    .split(";")
    .map((c) => c.trim().split("="))
    .find(([key]) => key === name)?.[1] ?? null;
}

function serializeSessionCookie(value: string): string {
  const attrs = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${SESSION_COOKIE_MAX_AGE}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (process.env.NODE_ENV === "production") attrs.push("Secure");
  return attrs.join("; ");
}
