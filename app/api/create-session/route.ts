import { WORKFLOW_ID } from "@/lib/config";

export const runtime = "edge";

// ✅ Set this to your Netlify frontend domain
const ALLOWED_ORIGIN = "https://relaxed-hummingbird-a87f42.netlify.app";

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

// ✅ CORS preflight handler
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Max-Age": "86400",
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  let sessionCookie: string | null = null;

  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return corsResponse({ error: "Missing OPENAI_API_KEY" }, 500);
    }

    const parsedBody = await safeParseJson<CreateSessionRequestBody>(request);
    const { userId, sessionCookie: resolvedSessionCookie } =
      await resolveUserId(request);
    sessionCookie = resolvedSessionCookie;

    const resolvedWorkflowId =
      parsedBody?.workflow?.id ?? parsedBody?.workflowId ?? WORKFLOW_ID;

    if (!resolvedWorkflowId) {
      return corsResponse({ error: "Missing workflow id" }, 400, sessionCookie);
    }

    const url = `${process.env.CHATKIT_API_BASE ?? DEFAULT_CHATKIT_BASE}/v1/chatkit/sessions`;

    const upstream = await fetch(url, {
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

    // <-- LINT-FIX: use Record<string, unknown> instead of `any`
    const data = (await upstream.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    if (!upstream.ok) {
      return corsResponse(
        { error: data?.error ?? "Failed to create session", details: data },
        upstream.status,
        sessionCookie
      );
    }

    return corsResponse(
      {
        client_secret: (data as any).client_secret ?? null,
        expires_after: (data as any).expires_after ?? null,
      },
      200,
      sessionCookie
    );
  } catch (err) {
    console.error("Create session error", err);
    return corsResponse({ error: "Unexpected error" }, 500, sessionCookie);
  }
}

export async function GET(): Promise<Response> {
  return corsResponse({ error: "Method Not Allowed" }, 405);
}

// ✅ Helper: build CORS responses
function corsResponse(
  payload: unknown,
  status: number,
  sessionCookie?: string | null
): Response {
  const headers = new Headers({
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
  });

  if (sessionCookie) headers.append("Set-Cookie", sessionCookie);

  return new Response(JSON.stringify(payload), { status, headers });
}

// ---------- (Helper functions) ----------
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

  return {
    userId: generated,
    sessionCookie: serializeSessionCookie(generated),
  };
}

function getCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(";");
  for (const cookie of cookies) {
    const [rawName, ...rest] = cookie.split("=");
    if (rawName.trim() === name) return rest.join("=").trim();
  }
  return null;
}

function serializeSessionCookie(value: string): string {
  const attributes = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${SESSION_COOKIE_MAX_AGE}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (process.env.NODE_ENV === "production") attributes.push("Secure");
  return attributes.join("; ");
}

async function safeParseJson<T>(req: Request): Promise<T | null> {
  try {
    const text = await req.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
