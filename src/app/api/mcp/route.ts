import { NextRequest, NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { resolveToken } from "@/lib/mcp/state";
import { createMcpServer } from "@/lib/mcp/tools";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(req: NextRequest): Promise<Response> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const resolved = token ? resolveToken(token) : null;
  if (!resolved) {
    return NextResponse.json(
      { error: "MCP access is off, or the token is invalid." },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } }
    );
  }

  const client = (req.headers.get("user-agent") ?? "unknown").slice(0, 80);
  const server = createMcpServer({ sessionId: resolved.sessionId, client });
  // Stateless: a fresh server and transport per request.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
