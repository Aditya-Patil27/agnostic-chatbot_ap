export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function resolveAiServiceBaseUrl(): string {
  const configured = (
    process.env.AI_SERVICE_URL ??
    process.env.NEXT_PUBLIC_AI_SERVICE_URL ??
    ""
  ).trim();

  if (!configured) return "http://localhost:4000";

  const normalized = /^https?:\/\//i.test(configured)
    ? configured
    : `http://${configured}`;
  const cleaned = normalized.replace(/\/+$/, "");

  // Guard against pointing the proxy back to the Next.js app in local dev.
  if (/^http:\/\/(localhost|127\.0\.0\.1):(3000|3001)$/i.test(cleaned)) {
    return "http://localhost:4000";
  }

  return cleaned;
}

export async function POST(req: Request) {
  const aiBaseUrl = resolveAiServiceBaseUrl();
  const target = `${aiBaseUrl}/api/chat`;

  let payload = "";
  try {
    payload = await req.text();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const headers = new Headers();
  headers.set("content-type", req.headers.get("content-type") || "application/json");

  const tenantId = req.headers.get("x-tenant-id");
  if (tenantId) {
    headers.set("x-tenant-id", tenantId);
  }

  let upstream: globalThis.Response;
  try {
    upstream = await fetch(target, {
      method: "POST",
      headers,
      body: payload,
      cache: "no-store",
    });
  } catch {
    return Response.json(
      {
        error: "AI service unavailable",
        target,
      },
      { status: 502 }
    );
  }

  const responseHeaders = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) {
    responseHeaders.set("content-type", contentType);
  }
  responseHeaders.set("cache-control", "no-cache, no-transform");

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
