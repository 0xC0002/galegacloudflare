import type { IntegrationEnv } from "./ifood-config.ts";
export function recentPolling(at:string|null|undefined,now=Date.now()) {
 return !!at && Number.isFinite(Date.parse(at)) && now-Date.parse(at)>=0 && now-Date.parse(at)<95_000;
}
export async function receiverHealth(env: IntegrationEnv) {
 if (!env.DB) throw new Error("Armazenamento indisponível.");
 const row = await env.DB.prepare("SELECT last_attempt_at,last_finished_at,last_success_at,last_error,completed_runs FROM receiver_health WHERE id='ifood'").first<{last_attempt_at:string|null;last_finished_at:string|null;last_success_at:string|null;last_error:string|null;completed_runs:number}>();
 const lastPolling = await env.DB.prepare("SELECT last_success_at FROM integration_state WHERE id='ifood'").first<{last_success_at:string|null}>();
 return {
  active:!row?.last_error && recentPolling(row?.last_success_at) && recentPolling(lastPolling?.last_success_at),
  lastAttemptAt:row?.last_attempt_at||null,lastFinishedAt:row?.last_finished_at||null,lastSuccessAt:row?.last_success_at||null,
  lastError:row?.last_error||null,completedRuns:row?.completed_runs||0,staleAfterSeconds:95,
 };
}
