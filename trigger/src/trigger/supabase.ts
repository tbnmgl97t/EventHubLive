// Minimal Supabase REST (PostgREST) client for writing hls-watcher's stream
// state and events. Uses the service_role key server-side -- this file must
// only ever run inside a task, never be shipped to a client.
//
// hls_streams/hls_parser_events live in the "hlsparser" Postgres schema, not
// "public" -- PostgREST only serves the default schema unless told otherwise,
// via Accept-Profile (reads) / Content-Profile (writes). That schema also
// has to be listed in the project's exposed schemas (Data API settings) or
// PostgREST will reject the profile header outright.
const SCHEMA = "hlsparser";

function restHeaders(method: string, extra?: Record<string, string>): Record<string, string> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!process.env.SUPABASE_URL || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  const profileHeader = method === "GET" || method === "HEAD" ? "Accept-Profile" : "Content-Profile";
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    [profileHeader]: SCHEMA,
    ...extra,
  };
}

async function restRequest(path: string, init: RequestInit): Promise<any> {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1${path}`, init);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Supabase REST ${init.method ?? "GET"} ${path} -> ${res.status}: ${text}`);
  }
  // Prefer: return=minimal responds 201/204 with an empty body -- only
  // Prefer: return=representation (or a plain GET) actually returns JSON.
  return text ? JSON.parse(text) : null;
}

export interface HlsStreamRow {
  id: string;
  tenant_id: string;
  name: string;
  manifest_url: string;
  active: boolean;
  current_task_id: string | null;
  session_status: string | null;
  session_started_at: string | null;
  last_polled_at: string | null;
  last_sequence: number | null;
  created_at: string;
}

/**
 * Finds the hls_streams row whose current_task_id matches this run. The row
 * itself is expected to already exist -- it's created and owned entirely by
 * the separate Next.js app, which also sets current_task_id to the returned
 * run ID before/when it triggers this task. This is read-only: hls-watcher
 * never creates or updates hls_streams, it only reads tenant_id off the
 * matched row to attribute this run's hls_parser_events writes. If no row
 * matches, returns null and the caller should skip writing events for this
 * run rather than guess a tenant_id.
 */
export async function findHlsStreamByTaskId(taskId: string): Promise<HlsStreamRow | null> {
  const rows = (await restRequest(`/hls_streams?current_task_id=eq.${encodeURIComponent(taskId)}&limit=1`, {
    method: "GET",
    headers: restHeaders("GET"),
  })) as HlsStreamRow[];
  return rows[0] ?? null;
}

export async function insertHlsParserEvent(event: {
  tenantId: string;
  taskId: string;
  type: string;
  occurredAt: string;
  payload: unknown;
}): Promise<void> {
  await restRequest(`/hls_parser_events`, {
    method: "POST",
    headers: restHeaders("POST", { Prefer: "return=minimal" }),
    body: JSON.stringify({
      tenant_id: event.tenantId,
      task_id: event.taskId,
      type: event.type,
      occurred_at: event.occurredAt,
      payload: event.payload,
    }),
  });
}
