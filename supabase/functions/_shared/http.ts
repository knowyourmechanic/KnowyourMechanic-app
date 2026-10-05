// Shared HTTP helpers for the browser-called Edge Functions.

export const corsHeaders: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

export function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

// Common preamble: CORS preflight, POST-only, bearer token present, JSON body.
// Returns either an early Response or the parsed body + auth header.
export async function readAuthedJson<T>(
  req: Request,
): Promise<Response | { body: T; authHeader: string }> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "Missing Authorization header." });
  try {
    return { body: (await req.json()) as T, authHeader };
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }
}
