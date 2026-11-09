// Minimal MCP server over Streamable HTTP (stateless JSON responses).
// Spec: https://modelcontextprotocol.io/specification — we implement initialize,
// ping, tools/list and tools/call, which is all a tools-only server needs.

export interface Env {
  BRIDGE_HUB: DurableObjectNamespace;
  MCP_SECRET?: string;
  BRIDGE_TOKEN?: string;
  LWA_CLIENT_ID?: string;
  LWA_CLIENT_SECRET?: string;
  SP_REFRESH_TOKEN?: string;
  SP_SELLER_ID?: string;
  SP_REGION?: string;
  SP_MARKETPLACE_ID?: string;
  SP_SANDBOX?: string;
  CHANNELS_JSON?: string;
}

export type Content =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

export interface ToolResult {
  content: Content[];
  isError?: boolean;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; openWorldHint?: boolean; title?: string };
  // Return a ToolResult, or any JSON value (sent back as pretty JSON text).
  run: (args: any, env: Env) => Promise<unknown>;
}

const SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const MAX_TEXT = 120_000;

export class ToolError extends Error {}

function isToolResult(v: unknown): v is ToolResult {
  return !!v && typeof v === "object" && Array.isArray((v as ToolResult).content);
}

export function textResult(value: unknown): ToolResult {
  let text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (text === undefined) text = "OK";
  if (text.length > MAX_TEXT) {
    text =
      text.slice(0, MAX_TEXT) +
      `\n\n…[truncated ${text.length - MAX_TEXT} more characters — narrow the request (filters, smaller page size, maxRows) to see the rest]`;
  }
  return { content: [{ type: "text", text }] };
}

type RpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: any };

function rpcError(id: RpcRequest["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

async function handleOne(req: RpcRequest, tools: Map<string, Tool>, env: Env) {
  const { id, method, params } = req;
  const isNotification = id === undefined;
  switch (method) {
    case "initialize": {
      const asked = params?.protocolVersion;
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "commerce-mcp", version: "1.0.0" },
          instructions:
            "Tools for the owner's Amazon Seller account (SP-API), other sales channels, and a remote-controlled Chrome on the owner's computer. " +
            "Amazon: start with amazon_guide or amazon_list_operations; amazon_call runs any listed operation. " +
            "Browser: call browser_snapshot to get element refs before clicking; take browser_screenshot to see the page.",
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: [...tools.values()].map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
            ...(t.annotations ? { annotations: t.annotations } : {}),
          })),
        },
      };
    case "tools/call": {
      const tool = tools.get(params?.name);
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${params?.name}`);
      let result: ToolResult;
      try {
        const out = await tool.run(params?.arguments ?? {}, env);
        result = isToolResult(out) ? out : textResult(out);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result = { ...textResult(`Error: ${msg}`), isError: true };
      }
      return { jsonrpc: "2.0", id, result };
    }
    default:
      if (isNotification) return null; // notifications/initialized, notifications/cancelled, ...
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

export async function handleMcp(request: Request, tools: Map<string, Tool>, env: Env): Promise<Response> {
  if (request.method === "GET") {
    // We don't offer a server→client SSE stream.
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST, DELETE" } });
  }
  if (request.method === "DELETE") return new Response(null, { status: 204 });
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body: RpcRequest | RpcRequest[];
  try {
    body = await request.json();
  } catch {
    return Response.json(rpcError(null, -32700, "Parse error"), { status: 400 });
  }
  const batch = Array.isArray(body) ? body : [body];
  const responses = (await Promise.all(batch.map((r) => handleOne(r, tools, env)))).filter(Boolean);
  if (responses.length === 0) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(body) ? responses : responses[0]);
}

// ---- tiny JSON-schema helpers so tool definitions stay readable ----
export const s = {
  str: (description: string, extra: Record<string, unknown> = {}) => ({ type: "string", description, ...extra }),
  num: (description: string, extra: Record<string, unknown> = {}) => ({ type: "number", description, ...extra }),
  int: (description: string, extra: Record<string, unknown> = {}) => ({ type: "integer", description, ...extra }),
  bool: (description: string) => ({ type: "boolean", description }),
  arr: (items: Record<string, unknown>, description: string) => ({ type: "array", items, description }),
  obj: (description: string, properties?: Record<string, unknown>) => ({
    type: "object",
    description,
    ...(properties ? { properties } : { additionalProperties: true }),
  }),
  enum: (values: string[], description: string) => ({ type: "string", enum: values, description }),
};

export function schema(properties: Record<string, unknown>, required: string[] = []) {
  return { type: "object", properties, required, additionalProperties: false };
}
