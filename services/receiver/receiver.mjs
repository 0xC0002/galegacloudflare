import { setTimeout as pause } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

export function receiverConfig(env = process.env) {
 let url;
 try { url = new URL(env.GALEGA_SITE_URL); } catch { throw new Error('Configure GALEGA_SITE_URL com a origem HTTPS do sistema.'); }
 const local = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if (url.protocol !== 'https:' && !(local && url.protocol === 'http:') || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Use somente a origem HTTPS do sistema, sem caminhos ou credenciais.');
 const token = env.GALEGA_SITE_SERVICE_TOKEN?.trim();
 if (!token || /[\r\n]/.test(token)) throw new Error('Configure a autorização de serviço para o Site privado.');
 return { origin:url.origin, token };
}

export async function receiverStep(config, fetcher = fetch, signal) {
 const timeout = AbortSignal.timeout(120_000);
 const response = await fetcher(`${config.origin}/api/receiver/tick`, {
  method:'POST', redirect:'error', cache:'no-store',
  headers:{'OAI-Sites-Authorization':`Bearer ${config.token}`,'Accept':'application/json'},
  signal:signal ? AbortSignal.any([signal,timeout]) : timeout,
 });
 if (!response.ok) return {ok:false,error:[401,403].includes(response.status) ? 'access_denied' : 'receiver_unavailable',status:response.status};
 if (!(response.headers.get('Content-Type') || '').includes('application/json')) return {ok:false,error:'unexpected_response'};
 const data = await response.json();
 if (data.ok !== true || !['TEST','PRODUCTION'].includes(data.environment) || !Number.isFinite(data.serverNow) || !Number.isFinite(data.nextPollAt)) return {ok:false,error:'invalid_response'};
 const lastPolling = typeof data.lastSuccessfulPollingAt === 'string' ? Date.parse(data.lastSuccessfulPollingAt) : NaN;
 if (!data.receiver?.active || !Number.isFinite(lastPolling) || data.serverNow-lastPolling<0 || data.serverNow-lastPolling>=95_000) return {ok:false,error:'polling_stale'};
 return {ok:true,environment:data.environment,waitMs:Math.min(120_000,Math.max(0,data.nextPollAt-data.serverNow)),pendingEvents:Number.isSafeInteger(data.pendingEvents) ? data.pendingEvents : null,pendingErrors:Number.isSafeInteger(data.pendingErrors) ? data.pendingErrors : null};
}

export async function runReceiver(config, {signal,fetcher=fetch,sleep=pause,now=()=>performance.now(),log=value=>process.stdout.write(JSON.stringify(value)+'\n')} = {}) {
 let failures = 0;
 while (!signal?.aborted) {
  const started = now();
  let result;
  try { result = await receiverStep(config,fetcher,signal); }
  catch { if (signal?.aborted) break; result = {ok:false,error:'connection_failed'}; }
  failures = result.ok ? 0 : failures+1;
  const durationMs=Math.max(0,Math.round(now()-started));
  const wait = Math.max(30_000-(now()-started),result.ok ? result.waitMs+100 : Math.min(60_000,30_000*2**Math.min(failures-1,1)));
  log({at:new Date().toISOString(),level:result.ok&&!result.pendingErrors?'info':'warn',durationMs,consecutiveFailures:failures,nextAttemptInMs:Math.ceil(wait),...result.ok ? {event:'polling_ok',environment:result.environment,pendingEvents:result.pendingEvents,pendingErrors:result.pendingErrors} : {event:result.error,status:result.status || null}});
  try { await sleep(wait,undefined,{signal}); } catch { if (signal?.aborted) break; throw new Error('Não foi possível aguardar a próxima consulta.'); }
 }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 const controller = new AbortController();
 for (const signal of ['SIGTERM','SIGINT']) process.once(signal,()=>controller.abort());
 try { await runReceiver(receiverConfig(),{signal:controller.signal}); }
 catch { process.stderr.write('Não foi possível iniciar o receptor. Confira a configuração de serviço.\n'); process.exitCode = 1; }
}
