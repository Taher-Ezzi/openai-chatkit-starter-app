import { NextResponse } from "next/server";
import { WORKFLOW_ID } from "@/lib/config";

export const runtime = "edge";

const ALLOWED_ORIGIN = "https://relaxed-hummingbird-a87f42.netlify.app";
const DEFAULT_CHATKIT_BASE = "https://api.openai.com";
const SESSION_COOKIE_NAME = "chatkit_session_id";
const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// ---------- CORS helper ----------
function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

// ---------- OPTIONS (Preflight) ----------
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

// ---------- POST ----------
export async function POST(req: Request) {
  try {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey)
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500, headers: corsHeaders() }
      );

    const body = await req.json().catch(() => ({}));
    const resolvedWorkflowId =
      body?.workflow?.id ?? body?.workflowId ?? WORKFLOW_ID;
    if (!resolvedWorkflowId)
      return NextResponse.json(
        { error: "Missing workflow id" },
        { status: 400, headers: corsHeaders() }
      );

    const apiBase = process.env.CHATKIT_API_BASE ?? DEFAULT_CHATKIT_BASE;
    const upstream = await fetch(`${apiBase}/v1/chatkit/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
        "OpenAI-Beta": "chatkit_beta=v1",
      },
      body: JSON.stringify({
        workflow: { id: resolvedWorkflowId },
        chatkit_configuration: {
          file_upload: {
            enabled: body?.chatkit_configuration?.file_upload?.enabled ?? false,
          },
        },
      }),
    });

    const data = (await upstream.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    if (!upstream.ok)
      return NextResponse.json(
        { error: "Failed to create session", details: data },
        { status: upstream.status, headers: corsHeaders() }
      );

    return NextResponse.json(
      {
        client_secret: data.client_secret ?? null,
        expires_after: data.expires_after ?? null,
      },
      { status: 200, headers: corsHeaders() }
    );
  } catch (err) {
    console.error("create-session error", err);
    return NextResponse.json(
      { error: "Unexpected error" },
      { status: 500, headers: corsHeaders() }
    );
  }
}
