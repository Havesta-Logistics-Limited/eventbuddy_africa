import { createAdminClient } from "@/lib/supabase/admin";
import type { CronJobName } from "@/lib/cron-jobs";

/**
 * Wraps a scheduled route (/api/cron/*) so every authorized run is recorded in
 * cron_runs (migration 0123) for the platform admin's Job health tab: when it
 * started, whether it worked, its summary or error. Unauthorized calls (401)
 * aren't recorded, nor are previews and test sends (?preview or ?to), which
 * aren't real runs. Logging never changes the job's response, and a failure to
 * log is only printed. Runs older than 60 days are cleared as we go.
 */
export function withCronLog(job: CronJobName, handler: (request: Request) => Promise<Response>) {
  return async function GET(request: Request): Promise<Response> {
    const startedAt = new Date();
    let response: Response;
    try {
      response = await handler(request);
    } catch (err) {
      await record(job, startedAt, false, 500, null, err instanceof Error ? err.message : String(err));
      throw err;
    }
    const params = new URL(request.url).searchParams;
    if (response.status === 401 || params.has("preview") || params.has("to")) return response;
    let body: Record<string, unknown> | null = null;
    try {
      body = (await response.clone().json()) as Record<string, unknown>;
    } catch {
      body = null;
    }
    const ok = response.ok && !body?.error;
    const error = typeof body?.error === "string" ? body.error : ok ? null : `HTTP ${response.status}`;
    await record(job, startedAt, ok, response.status, ok ? body : null, error);
    return response;
  };
}

async function record(job: string, startedAt: Date, ok: boolean, httpStatus: number, summary: Record<string, unknown> | null, error: string | null) {
  try {
    const admin = createAdminClient();
    const { error: insertError } = await admin.from("cron_runs").insert({
      job,
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      ok,
      http_status: httpStatus,
      summary,
      error: error ? error.slice(0, 1000) : null,
    });
    if (insertError) console.error(`[cron-log] couldn't record ${job}:`, insertError.message);
    await admin.from("cron_runs").delete().eq("job", job).lt("started_at", new Date(Date.now() - 60 * 86400_000).toISOString());
  } catch (err) {
    console.error(`[cron-log] couldn't record ${job}:`, err);
  }
}
