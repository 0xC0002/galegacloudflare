import { synchronize } from "./ifood.ts";
import { integrationConfig, type IntegrationEnv } from "./ifood-config.ts";
import { receiverHealth, recentPolling } from "./receiver-health.ts";
export async function backgroundTick(env: IntegrationEnv, fetcher: typeof fetch = fetch) {
 if (!env.DB) throw new Error("Armazenamento indisponível.");
 const config = integrationConfig(env), started = new Date().toISOString();
 await env.DB.prepare("INSERT INTO receiver_health (id,last_attempt_at) VALUES ('ifood',?) ON CONFLICT(id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at").bind(started).run();
 let result;
 try {
  result = await synchronize(env,fetcher);
  if (!result.configured || result.lastError || !recentPolling(result.lastSuccessAt)) throw new Error("Polling indisponível ou sem confirmação recente.");
 } catch {
  await env.DB.prepare("UPDATE receiver_health SET last_finished_at=?,last_error=?,completed_runs=completed_runs+1 WHERE id='ifood'").bind(new Date().toISOString(),"Não foi possível atualizar o recebimento. Confira a integração no balcão.").run();
  return {ok:false,environment:config.environment,serverNow:Date.now(),nextPollAt:Date.now()+30_000,receiver:await receiverHealth(env)};
 }
 const stamp = new Date().toISOString();
 await env.DB.prepare("UPDATE receiver_health SET last_finished_at=?,last_success_at=?,last_error=NULL,completed_runs=completed_runs+1 WHERE id='ifood'").bind(stamp,stamp).run();
 return {ok:true,environment:config.environment,serverNow:result.serverNow,nextPollAt:result.nextPollAt,lastSuccessfulPollingAt:result.lastSuccessAt,pendingEvents:result.pendingEvents,pendingErrors:result.pendingErrors,receiver:await receiverHealth(env)};
}
