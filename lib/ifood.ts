import { eventStatus, statusRank, terminal, scheduledWait, preparationSignature, needsStatusReview, type KitchenOrder, type Option, type OrderAction } from "./order-state.ts";
import { ingestNegotiations, negotiationSnapshot, respondToDispute, evidencePath, NegotiationError } from "./negotiations.ts";
import { uuid, type DisputeReply } from "./negotiation-state.ts";
import { integrationConfig, type IntegrationEnv } from "./ifood-config.ts";
import { receiverHealth } from "./receiver-health.ts";
import { requestTrace } from "./ifood-observability.ts";
import { merchantIdentity } from "./merchants.ts";
export type { KitchenOrder, Option } from "./order-state.ts";
export { TEST_MERCHANT } from "./ifood-config.ts";
const API = "https://merchant-api.ifood.com.br";
type Env = IntegrationEnv;
type Data = Record<string, any>;
type State = { next_poll_at: number; encrypted_token: string | null; token_expires_at: number; last_poll_at: string | null; last_success_at: string | null; last_error: string | null };
function db(env: Env) { if (!env.DB) throw new Error("Armazenamento indisponível."); return env.DB; }
const config = integrationConfig;
async function assertDatabaseScope(env: Env) {
 const c = config(env);
 const slots = c.merchantIds.map(() => "?").join(",");
 const foreign = await db(env).prepare(`SELECT id FROM received_orders WHERE merchant_id NOT IN (${slots}) OR json_extract(payload,'$.isTest') IS NOT ? LIMIT 1`).bind(...c.merchantIds,c.isTest ? 1 : 0).first();
 if (foreign) throw new Error("O banco contém pedidos de outro ambiente ou loja. Use uma implantação com banco exclusivo para produção.");
 const foreignEvent = await db(env).prepare(`SELECT id FROM received_events WHERE json_extract(payload,'$.merchantId') IS NOT NULL AND json_extract(payload,'$.merchantId') NOT IN (${slots}) LIMIT 1`).bind(...c.merchantIds).first();
 if (foreignEvent) throw new Error("O banco contém eventos de outra loja. Use um banco exclusivo para produção.");
 return c;
}
function txt(x: unknown): string { return typeof x === "string" ? x : ""; }
function amount(x: unknown): number | null { return typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null; }
function receiptInfo(raw: Data) {
 const address = raw.delivery?.deliveryAddress || {};
 const street = txt(address.formattedAddress) || [txt(address.streetName),txt(address.streetNumber)].filter(Boolean).join(", ");
 return {
  address:[street,txt(address.complement),[txt(address.neighborhood)||txt(address.district),txt(address.city),txt(address.state)].filter(Boolean).join(" - "),txt(address.reference)].filter(Boolean),
  deliveryNotes:txt(raw.delivery?.observations),takeoutNotes:txt(raw.takeout?.observations),pickupCode:txt(raw.delivery?.pickupCode),deliveryAt:txt(raw.delivery?.deliveryDateTime),takeoutAt:txt(raw.takeout?.takeoutDateTime),
  total:amount(raw.total?.orderAmount),prepaid:amount(raw.payments?.prepaid),pending:amount(raw.payments?.pending),
  payments:Array.isArray(raw.payments?.methods) ? raw.payments.methods.map((x:Data)=>({amount:amount(x.value),type:txt(x.type).trim().toUpperCase() || (x.prepaid === true ? "ONLINE" : x.prepaid === false ? "OFFLINE" : ""),method:txt(x.method).trim().toUpperCase(),brand:txt(x.card?.brand)||txt(x.wallet?.name),changeFor:amount(x.cash?.changeFor)})) : [],
  discounts:Array.isArray(raw.benefits) ? raw.benefits.map((x:Data)=>({amount:amount(x.value),sponsors:Array.isArray(x.sponsorshipValues) ? x.sponsorshipValues.map((s:Data)=>({name:txt(s.name),amount:amount(s.value)})) : []})) : [],
 };
}
function option(x: Data, depth = 0): Option {
 return { name: txt(x.name) || "Item sem nome", quantity: typeof x.quantity === "number" && Number.isFinite(x.quantity) ? x.quantity : null, unit: txt(x.unit), group: txt(x.groupName), observations: txt(x.observations), options: depth < 8 && Array.isArray(x.options) ? x.options.map((y: Data) => option(y, depth + 1)) : [], ...(txt(x.id)?{id:x.id}:{}),...(txt(x.uniqueId)?{uniqueId:x.uniqueId}:{}),...(Number.isInteger(x.index)?{index:x.index}:{}) };
}
export function normalizeOrder(raw: Data, receivedAt: string, env: Env = {}): KitchenOrder {
 const c = config(env);
 if (raw.isTest !== c.isTest) throw new Error("O pedido não pertence ao ambiente iFood configurado.");
 if (!c.merchantIds.includes(raw.merchant?.id)) throw new Error("O pedido não pertence às lojas configuradas.");
 if (!c.isTest && raw.category !== "FOOD") throw new Error("A operação de produção está limitada a pedidos de restaurante (FOOD).");
 if (!Array.isArray(raw.items) || !raw.id) throw new Error("Conteúdo do pedido ainda indisponível.");
 return { merchantId: raw.merchant.id, merchantName: merchantIdentity(raw.merchant.id).name, id: raw.id, displayId: txt(raw.displayId) || raw.id.slice(-6), customer: txt(raw.customer?.name) || "Cliente", createdAt: txt(raw.createdAt) || receivedAt, receivedAt, isTest: c.isTest, cancelled: false, items: raw.items.map((x: Data) => option(x)), observations: [raw.observations, raw.extraInfo].filter(x => typeof x === "string" && x).join("\n"), timing: txt(raw.orderTiming), preparationStart: txt(raw.preparationStartDateTime), category: txt(raw.category), orderType: txt(raw.orderType), deliveredBy: txt(raw.delivery?.deliveredBy), status: "PLACED", statusAt: receivedAt, kitchenStage: "WAITING", kitchenUpdatedAt: null, kitchenNeedsReview:false, pendingAction: null, actionError: null, receipt:receiptInfo(raw) };
}
async function state(env: Env) { return db(env).prepare("SELECT * FROM integration_state WHERE id = 'ifood'").first<State>(); }
function b64(a: Uint8Array) { return btoa(Array.from(a, x => String.fromCharCode(x)).join("")); }
function unb64(s: string) { return Uint8Array.from(atob(s), x => x.charCodeAt(0)); }
async function key(secret: string) { return crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)), "AES-GCM", false, ["encrypt", "decrypt"]); }
async function seal(value: string, secret: string) { const iv = crypto.getRandomValues(new Uint8Array(12)); const valueBytes = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(secret), new TextEncoder().encode(value)); return b64(iv) + "." + b64(new Uint8Array(valueBytes)); }
async function unseal(value: string, secret: string) { const [iv, body] = value.split("."); return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await key(secret), unb64(body))); }
async function request(fetcher: typeof fetch, path: string, init: RequestInit = {}) {
 const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12_000);
 const trace=requestTrace(path,init.method,{enabled:fetcher===fetch});
 let response:Response|undefined,outcome:"success"|"http_error"|"network_error"|"timeout"="network_error";
 try { response=await fetcher(API + path, { ...init, signal: controller.signal });outcome=response.ok?"success":"http_error";return response; }
 catch { outcome=controller.signal.aborted?"timeout":"network_error";throw new Error("Não foi possível alcançar o iFood. Tentaremos novamente."); }
 finally { clearTimeout(timer);trace(response?.status??null,outcome); }
}
function apiError(stage: string, status: number) {
 const hints: Record<number,string> = { 401: "Confira as credenciais do aplicativo iFood.", 403: "O iFood recusou o acesso ao aplicativo ou à loja.", 404: "Recurso ainda indisponível no iFood.", 429: "Aguarde a próxima consulta." };
 return new Error(`${stage} — HTTP ${status}. ${hints[status] || "Tentaremos novamente."}`);
}
async function token(env: Env, fetcher: typeof fetch, force = false): Promise<string> {
 const c = await assertDatabaseScope(env); const s = await state(env);
 // A changed store allowlist needs a new token to include the newly authorized store.
 const tokenKey = JSON.stringify([c.clientSecret,c.clientId,[...c.merchantIds].sort()]);
 if (!force && s?.encrypted_token && s.token_expires_at > Date.now()) { try { return await unseal(s.encrypted_token, tokenKey); } catch {} }
 const body = new URLSearchParams({ grantType: "client_credentials", clientId: c.clientId!, clientSecret: c.clientSecret! });
 const r = await request(fetcher, "/authentication/v1.0/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
 if (!r.ok) throw apiError("Autenticação", r.status);
 const j = await r.json() as Data;
 if (typeof j.accessToken !== "string" || typeof j.expiresIn !== "number" || j.expiresIn <= 0) throw new Error("Resposta de autenticação inválida do iFood.");
 await db(env).prepare("UPDATE integration_state SET encrypted_token = ?, token_expires_at = ? WHERE id = 'ifood'").bind(await seal(j.accessToken, tokenKey), Date.now() + j.expiresIn * 1000).run();
 return j.accessToken;
}
async function api(env: Env, fetcher: typeof fetch, path: string, init: RequestInit = {}) {
 let bearer = await token(env, fetcher); const call = () => request(fetcher, path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${bearer}` } });
 let r = await call(); if (r.status === 401) { bearer = await token(env, fetcher, true); r = await call(); } return r;
}
export async function snapshot(env: Env) {
 const c = await assertDatabaseScope(env); const s = await state(env);
 const rows = await db(env).prepare(`SELECT o.* FROM received_orders o WHERE
  (o.cancelled=0 AND NOT EXISTS (SELECT 1 FROM received_events e WHERE e.order_id=o.id AND (json_extract(e.payload,'$.merchantId')=o.merchant_id OR (${c.isTest ? 1 : 0}=1 AND json_extract(e.payload,'$.merchantId') IS NULL)) AND e.code IN ('CON','CONCLUDED','ORDER_CONCLUDED','CAN','CANCELLED','ORDER_CANCELLED')) AND NOT EXISTS (SELECT 1 FROM order_status_reviews r WHERE r.order_id=o.id))
  OR EXISTS (SELECT 1 FROM order_disputes d WHERE d.order_id=o.id AND NOT EXISTS (SELECT 1 FROM dispute_settlements s WHERE s.dispute_id=d.id))
  OR o.id IN (SELECT id FROM received_orders ORDER BY received_at DESC LIMIT 100)
  ORDER BY o.received_at DESC`).all<Data>();
 const ids = rows.results.map(row => row.id as string);
 const orders = ids.length ? await projectOrders(env, rows.results) : [];
 const pending = await db(env).prepare("SELECT COUNT(*) AS count FROM received_events WHERE handled = 0").first<{count:number}>();
 const errors = await db(env).prepare("SELECT COUNT(*) AS count FROM received_events WHERE handled = 0 AND processing_error IS NOT NULL").first<{count:number}>();
 const preferences=await db(env).prepare("SELECT widget_id FROM integration_preferences WHERE id='ifood'").first<{widget_id:string|null}>();
 return { configured: Boolean(c.clientId && c.clientSecret), environment:c.environment, merchantId: c.merchantId, merchantIds: c.merchantIds, lastPollAt: s?.last_poll_at || null, lastSuccessAt: s?.last_success_at || null, lastError: s?.last_error || null, nextPollAt: s?.next_poll_at || 0, serverNow: Date.now(), pendingEvents: pending?.count || 0, pendingErrors: errors?.count || 0, orders, disputes:await negotiationSnapshot(db(env)), widgetId:preferences?.widget_id||null, continuousReceiverActive:(await receiverHealth(env)).active };
}
async function projectOrders(env: Env, rows: Data[]): Promise<KitchenOrder[]> {
 const projected:KitchenOrder[]=[],c=config(env);
 for(let start=0;start<rows.length;start+=80){
 const group=rows.slice(start,start+80),ids = group.map(r => r.id); const slots = ids.map(() => "?").join(",");
 const events = await db(env).prepare(`SELECT order_id,code,payload,received_at FROM received_events WHERE order_id IN (${slots})`).bind(...ids).all<Data>();
 const actions = await db(env).prepare(`SELECT * FROM order_actions WHERE order_id IN (${slots}) ORDER BY requested_at,id`).bind(...ids).all<Data>();
 const reviews = await db(env).prepare(`SELECT * FROM order_status_reviews WHERE order_id IN (${slots})`).bind(...ids).all<Data>();
 projected.push(...group.map(row => {
  const saved = JSON.parse(row.payload) as KitchenOrder;
  const o: KitchenOrder = { ...saved, merchantId: row.merchant_id, merchantName: merchantIdentity(row.merchant_id).name, category: saved.category || "", orderType: saved.orderType || "", deliveredBy: saved.deliveredBy || "", status: "PLACED", statusAt: saved.receivedAt, kitchenStage: row.kitchen_stage || "WAITING", kitchenUpdatedAt: row.kitchen_updated_at || null, kitchenNeedsReview:!!row.kitchen_needs_review, pendingAction: null, actionError: null, cancelled: false };
  for (const e of events.results.filter(e => e.order_id === row.id && (JSON.parse(e.payload).merchantId === row.merchant_id || c.isTest && !JSON.parse(e.payload).merchantId))) {
   const next = eventStatus(e.code); const at = eventTimestamp(e);
   if (next && (statusRank[next] > statusRank[o.status] || next === o.status && at > o.statusAt)) { o.status = next; o.statusAt = at; }
  }
  if (row.cancelled) o.status = "CANCELLED";
  const review=reviews.results.find(r=>r.order_id===row.id);
  if(review && ["CONCLUDED","CANCELLED"].includes(review.status) && statusRank[review.status as "CONCLUDED"|"CANCELLED"]>statusRank[o.status]) {
   o.status=review.status;o.statusAt=review.confirmed_at;o.statusReview={status:review.status,confirmedAt:review.confirmed_at};
  }
  o.cancelled = o.status === "CANCELLED";
  const history = actions.results.filter(a => a.order_id === row.id);
  const pending = history.find(a => ["SENDING", "ACCEPTED", "UNCERTAIN"].includes(a.status));
  if (pending) o.pendingAction = { action: pending.action, status: pending.status, requestedAt: pending.requested_at };
  const last = history.at(-1); if (last?.status === "FAILED") o.actionError = last.error || "O iFood recusou a solicitação.";
  return o;
 }));
 }
 return projected;
}
function eventTimestamp(e: Data) { const raw = JSON.parse(e.payload); return Number.isFinite(Date.parse(raw.createdAt)) ? new Date(raw.createdAt).toISOString() : e.received_at; }
async function settleAction(env: Env, e: Data) {
 const next = eventStatus(e.code); const at = eventTimestamp(e); const cutoff = new Date(Date.parse(at) + 5_000).toISOString();
 if (["CANCELLATION_REQUEST_FAILED", "CARF"].includes(e.code)) {
  await db(env).prepare("UPDATE order_actions SET status='FAILED',error=?,updated_at=? WHERE order_id=? AND action='requestCancellation' AND status IN ('SENDING','ACCEPTED','UNCERTAIN') AND requested_at<=?").bind("O iFood recusou o cancelamento. O pedido permanece na fila.",at,e.order_id,cutoff).run(); return;
 }
 if (!next) return;
 if (next === "CONCLUDED" || next === "CANCELLED") {
  await db(env).prepare("UPDATE order_actions SET status='SUPERSEDED',error=NULL,updated_at=? WHERE order_id=? AND status IN ('SENDING','ACCEPTED','UNCERTAIN')").bind(at,e.order_id).run();
  return;
 }
 const targets: Record<string, number> = { confirm: 1, startPreparation: 2, readyToPickup: 3, dispatch: 4 };
 const resolved = Object.keys(targets).filter(a => statusRank[next] >= targets[a]);
 if (resolved.length) await db(env).prepare(`UPDATE order_actions SET status='CONFIRMED',error=NULL,updated_at=? WHERE order_id=? AND status IN ('SENDING','ACCEPTED','UNCERTAIN') AND action IN (${resolved.map(() => "?").join(",")}) AND requested_at<=?`).bind(at,e.order_id,...resolved,cutoff).run();
}
async function persistOrder(env: Env, order: KitchenOrder, existing?: Data | null) {
 if (existing && existing.merchant_id !== order.merchantId) throw new Error("A loja retornada não corresponde à loja deste pedido.");
 let review = false;
 if (existing && preparationSignature(JSON.parse(existing.payload)) !== preparationSignature(order)) {
  const current = (await projectOrders(env, [existing]))[0];
  review = !terminal(current) && current.status !== "DISPATCHED";
 }
 const flag = review ? 1 : 0;
 await db(env).prepare(`INSERT INTO received_orders (id,display_id,merchant_id,customer,created_at,received_at,updated_at,cancelled,payload)
  VALUES (?,?,?,?,?,?,?,CASE WHEN EXISTS (SELECT 1 FROM received_events WHERE order_id=? AND (json_extract(payload,'$.merchantId')=? OR (?=1 AND json_extract(payload,'$.merchantId') IS NULL)) AND code IN ('CANCELLED','ORDER_CANCELLED','CAN')) THEN 1 ELSE 0 END,?)
  ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,customer=excluded.customer,updated_at=excluded.updated_at,
  kitchen_stage=CASE WHEN ? THEN 'WAITING' ELSE received_orders.kitchen_stage END,
  kitchen_updated_at=CASE WHEN ? THEN NULL ELSE received_orders.kitchen_updated_at END,
  kitchen_needs_review=CASE WHEN ? THEN 1 ELSE received_orders.kitchen_needs_review END`)
  .bind(order.id,order.displayId,order.merchantId,order.customer,order.createdAt,order.receivedAt,new Date().toISOString(),order.id,order.merchantId,config(env).isTest?1:0,JSON.stringify(order),flag,flag,flag).run();
}
async function processInbox(env: Env, fetcher: typeof fetch) {
 const c = config(env);
 const rows = await db(env).prepare("SELECT * FROM received_events WHERE handled = 0 AND attempts < 8 AND next_attempt_at<=? ORDER BY received_at LIMIT 40").bind(Date.now()).all<Data>();
 const fetched = new Map<string,KitchenOrder>(); let requests = 0;
 for (const e of rows.results) {
  if (!e.order_id) { await db(env).prepare("UPDATE received_events SET handled = 1 WHERE id = ?").bind(e.id).run(); continue; }
  const existing = await db(env).prepare("SELECT * FROM received_orders WHERE id = ?").bind(e.order_id).first<Data>();
  const eventMerchant = txt(JSON.parse(e.payload).merchantId) || (c.isTest ? c.merchantId : "");
  if (!c.merchantIds.includes(eventMerchant) || existing && existing.merchant_id !== eventMerchant) {
   await db(env).prepare("UPDATE received_events SET attempts=8,processing_error=? WHERE id=?").bind("A loja do evento não corresponde à loja deste pedido.",e.id).run();continue;
  }
  const cancelled = ["CANCELLED","ORDER_CANCELLED","CAN"].includes(e.code);
  const relevant = ["PLACED","ORDER_PLACED","PLC","ORDER_PATCHED","PATCHED","OPA","OPD","HSD","HANDSHAKE_DISPUTE"].includes(e.code);
  if (cancelled && existing) {
   await db(env).prepare("UPDATE received_orders SET cancelled = 1, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), e.order_id).run();
  } else if (!cancelled && (!existing || relevant)) {
   if (!fetched.has(e.order_id)) {
    if (requests >= 5) continue; requests++;
    try { const r = await api(env, fetcher, `/order/v1.0/orders/${encodeURIComponent(e.order_id)}`); if (!r.ok) throw apiError("Leitura do pedido",r.status); const order=normalizeOrder(await r.json() as Data,existing?.received_at||e.received_at,env); if(order.id!==e.order_id||order.merchantId!==eventMerchant)throw new Error("A identificação ou loja do pedido não corresponde ao evento."); fetched.set(e.order_id,order); }
    catch (error) {
     const now=Date.now(),first=e.first_attempt_at||now,deadline=first+600_000;
     await db(env).prepare("UPDATE received_events SET attempts=?,first_attempt_at=?,next_attempt_at=?,processing_error=? WHERE id=?").bind(now>=deadline?8:e.attempts+1,first,Math.min(deadline,now+Math.min(30_000*2**e.attempts,120_000)),error instanceof Error?error.message:"Falha na leitura.",e.id).run();continue;
    }
   }
   const o = fetched.get(e.order_id)!;
   await persistOrder(env,o,existing);
  }
  await settleAction(env,e);
  await db(env).prepare("UPDATE received_events SET handled = 1, processing_error = NULL WHERE id = ?").bind(e.id).run();
 }
}
export async function synchronize(env: Env, fetcher: typeof fetch = fetch) {
 const c = await assertDatabaseScope(env); if (!c.clientId || !c.clientSecret) return snapshot(env);
 const now = Date.now(); const owner = crypto.randomUUID();
 await db(env).prepare("INSERT OR IGNORE INTO integration_state (id) VALUES ('ifood')").run();
 const lock = await db(env).prepare("UPDATE integration_state SET lease_until = ?, lease_owner = ?, next_poll_at = ? WHERE id = 'ifood' AND lease_until < ? AND next_poll_at <= ?").bind(now+150_000,owner,now+30_000,now,now).run();
 if (!lock.meta.changes) return snapshot(env);
 try {
  const errors: string[] = [];
  let successfulAt: string | null = null;
  // Each store keeps receiving even if the other store has an access or network error.
  for (const merchantId of c.merchantIds) {
   try {
    let r = await api(env,fetcher,"/events/v1.0/events:polling",{ headers: { "x-polling-merchants":merchantId } });
    let ackPath = "/events/v1.0/events/acknowledgment";
    if (r.status === 404) { r=await api(env,fetcher,"/order/v1.0/events:polling",{ headers:{ "x-polling-merchants":merchantId } }); ackPath="/order/v1.0/events/acknowledgment"; }
    if (!r.ok && r.status !== 204) throw apiError("Consulta de eventos",r.status);
    const body = r.status === 204 ? [] : await r.json() as Data;
    const events = Array.isArray(body) ? body : body.events;
    if (!Array.isArray(events)) throw new Error("Resposta de eventos inválida do iFood.");
    const valid = events.filter((e: Data) => typeof e.id === "string" && (e.merchantId===merchantId || c.isTest && !e.merchantId));
    if (valid.length!==events.length) throw new Error("Eventos incompatíveis com a loja configurada. Nada foi confirmado.");
    // Do not let an event for one store close or change an existing order of the other.
    const orderIds = [...new Set(valid.map((e: Data) => txt(e.orderId)).filter(Boolean))];
    for (let offset=0;offset<orderIds.length;offset+=80) {
     const ids=orderIds.slice(offset,offset+80);
     const stored=await db(env).prepare(`SELECT merchant_id FROM received_orders WHERE id IN (${ids.map(()=>"?").join(",")})`).bind(...ids).all<Data>();
     if(stored.results.some(row=>row.merchant_id!==merchantId))throw new Error("A loja do evento não corresponde à loja deste pedido. Nada foi confirmado.");
    }
    const stamp = new Date().toISOString();
    for(let i=0;i<valid.length;i+=100) await db(env).batch(valid.slice(i,i+100).map((e: Data)=>db(env).prepare("INSERT OR IGNORE INTO received_events (id,order_id,code,payload,received_at) VALUES (?,?,?,?,?)").bind(e.id,txt(e.orderId)||null,txt(e.fullCode)||txt(e.code),JSON.stringify(e),stamp)));
    await ingestNegotiations(db(env));
    for(let i=0;i<valid.length;i+=1000) {
     const acknowledged=valid.slice(i,i+1000),r=await api(env,fetcher,ackPath,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(acknowledged.map((e:Data)=>({id:e.id})))});
     if(!r.ok)throw apiError("Confirmação de leitura dos eventos",r.status);
     for(let offset=0;offset<acknowledged.length;offset+=80){const ids=acknowledged.slice(offset,offset+80).map((e:Data)=>e.id);await db(env).prepare(`UPDATE received_events SET acknowledged_at=? WHERE id IN (${ids.map(()=>"?").join(",")})`).bind(new Date().toISOString(),...ids).run();}
    }
    successfulAt = stamp;
   } catch (error) {
    errors.push(`${merchantIdentity(merchantId).label}: ${error instanceof Error ? error.message : "Falha de conexão."}`);
   }
  }
  await processInbox(env,fetcher);
  await db(env).prepare("UPDATE integration_state SET last_poll_at=?,last_success_at=COALESCE(?,last_success_at),last_error=?,next_poll_at=? WHERE id='ifood'").bind(new Date().toISOString(),successfulAt,errors.length ? errors.join(" ") : null,Date.now()+30_000).run();
 } catch(error) {
  await db(env).prepare("UPDATE integration_state SET last_poll_at=?,last_error=? WHERE id='ifood'").bind(new Date().toISOString(),error instanceof Error ? error.message : "Falha de conexão.").run();
 } finally { await db(env).prepare("UPDATE integration_state SET lease_until=0,lease_owner=NULL WHERE id='ifood' AND lease_owner=?").bind(owner).run(); }
 return snapshot(env);
}

export class OrderActionError extends Error {
 status: number;
 diagnostic?: CancellationReasonDiagnostic;
 constructor(message: string, status = 409, diagnostic?: CancellationReasonDiagnostic) { super(message); this.status = status; this.diagnostic = diagnostic; }
}
// A human observation is kept apart from iFood events: no fabricated event, ACK or remote command.
export async function reconcileOrderStatus(env: Env,id: string,input: {requestId:string;status:"CONCLUDED"|"CANCELLED"},actor="owner") {
 if(!input || !uuid(input.requestId) || !["CONCLUDED","CANCELLED"].includes(input.status)) throw new OrderActionError("Informe o status final conferido no iFood.",400);
 const row=await storedOrder(env,id),current=(await projectOrders(env,[row]))[0];
 const prior=await db(env).prepare("SELECT * FROM order_status_reviews WHERE id=? OR order_id=?").bind(input.requestId,id).all<Data>();
 if(prior.results.length) {
  if(prior.results.length!==1 || prior.results[0].order_id!==id || prior.results[0].status!==input.status) throw new OrderActionError("Este pedido já foi conferido com outro resultado.",409);
  return snapshot(env);
 }
 if(terminal(current)) throw new OrderActionError("O iFood já informou o encerramento deste pedido. Atualize a fila.",409);
 if(!needsStatusReview(current)) throw new OrderActionError("Este pedido ainda está em atualização normal. Aguarde os eventos do iFood.",409);
 const at=new Date().toISOString();
 const result=await db(env).batch([
  db(env).prepare("INSERT OR IGNORE INTO order_status_reviews (id,order_id,status,actor,confirmed_at) VALUES (?,?,?,?,?)").bind(input.requestId,id,input.status,actor,at),
  db(env).prepare("UPDATE order_actions SET status='RECONCILED',error=NULL,updated_at=? WHERE order_id=? AND status IN ('SENDING','ACCEPTED','UNCERTAIN') AND EXISTS (SELECT 1 FROM order_status_reviews WHERE id=?)").bind(at,id,input.requestId),
 ]);
 if(!result[0].meta.changes) throw new OrderActionError("Outra tela já conferiu este pedido. Atualize a fila.",409);
 return snapshot(env);
}
function assertConfigured(env: Env) {
 const c = config(env);
 if (!c.clientId || !c.clientSecret) throw new OrderActionError("Configure o aplicativo iFood antes de continuar.",503);
}
async function storedOrder(env: Env, id: string) {
 const c = await assertDatabaseScope(env);
 const row = await db(env).prepare("SELECT * FROM received_orders WHERE id=?").bind(id).first<Data>();
 if (!row || !c.merchantIds.includes(row.merchant_id) || JSON.parse(row.payload).isTest !== c.isTest) throw new OrderActionError("Pedido não encontrado no ambiente configurado.",404);
 return row;
}
async function freshOrder(env: Env, id: string, fetcher: typeof fetch) {
 assertConfigured(env); const row = await storedOrder(env,id);
 await db(env).prepare("INSERT OR IGNORE INTO integration_state (id) VALUES ('ifood')").run();
 const r = await api(env,fetcher,`/order/v1.0/orders/${encodeURIComponent(id)}`);
 if (!r.ok) throw new OrderActionError(`Não foi possível verificar o pedido no iFood (HTTP ${r.status}). Consulte a fila e tente novamente.`,r.status === 404 ? 409 : 503);
 let o: KitchenOrder;
 try { o = normalizeOrder(await r.json() as Data,row.received_at,env); }
 catch { throw new OrderActionError(`O iFood não confirmou que este pedido pertence ao ambiente e à ${config(env).isTest ? "loja de teste" : "loja configurada"}.`,403); }
 if (o.id !== id || o.merchantId !== row.merchant_id) throw new OrderActionError("A identificação ou loja retornada pelo iFood não corresponde ao pedido.",403);
 if (o.category !== "FOOD") throw new OrderActionError("Esta versão opera somente pedidos de restaurante (FOOD).",422);
 await persistOrder(env,o,row);
 return (await projectOrders(env,[await storedOrder(env,id)]))[0];
}
export type CancellationReason = { code: string; description: string };
type CancellationReasonDiagnostic = { upstreamStatus: number; returnedCount: number | null; fields: string[] };
type CancellationReasonLookup = { reasons: CancellationReason[]; diagnostic: CancellationReasonDiagnostic };
function readCancellationReasons(raw: unknown, upstreamStatus: number): CancellationReasonLookup {
 const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" && "reasons" in raw && Array.isArray(raw.reasons) ? raw.reasons : null;
 const diagnostic: CancellationReasonDiagnostic = { upstreamStatus, returnedCount:list?.length??null, fields:[...new Set((list||[]).flatMap(x=>x&&typeof x==="object"&&!Array.isArray(x)?Object.keys(x):[]))].sort() };
 const invalid=()=>new OrderActionError("Não foi possível interpretar os motivos retornados pelo iFood. Atualize e tente novamente.",502,diagnostic);
 if(!list)throw invalid();
 const code=(value:unknown)=>typeof value==="string"&&value.trim().length<=100?value.trim():typeof value==="number"&&Number.isSafeInteger(value)&&value>=0?String(value):"";
 const reasons=list.map(x=>{
  if(!x||typeof x!=="object"||Array.isArray(x))throw invalid();
  const current=code(x.code),legacy=code(x.cancelCodeId);
  if(x.code!==undefined&&!current||x.cancelCodeId!==undefined&&!legacy||current&&legacy&&current!==legacy)throw invalid();
  const selected=current||legacy,description=typeof x.description==="string"?x.description.trim():"";
  if(!selected||!description)throw invalid();
  return {code:selected,description};
 });
 return {reasons,diagnostic};
}
async function fetchReasons(env: Env, id: string, fetcher: typeof fetch): Promise<CancellationReasonLookup> {
 const r = await api(env,fetcher,`/order/v1.0/orders/${encodeURIComponent(id)}/cancellationReasons`);
 if (r.status === 204) return {reasons:[],diagnostic:{upstreamStatus:204,returnedCount:0,fields:[]}};
 if (!r.ok) throw new OrderActionError(`Não foi possível consultar os motivos no iFood (HTTP ${r.status}).`,503);
 let raw:unknown;try{raw=await r.json();}catch{throw new OrderActionError("O iFood retornou uma resposta de motivos inválida.",502,{upstreamStatus:r.status,returnedCount:null,fields:[]});}
 return readCancellationReasons(raw,r.status);
}
export async function cancellationReasonDetails(env: Env, id: string, fetcher: typeof fetch = fetch) {
 const o = await freshOrder(env,id,fetcher);
 if (terminal(o)) throw new OrderActionError("Este pedido já foi finalizado.");
 return fetchReasons(env,id,fetcher);
}
export async function cancellationReasons(env: Env, id: string, fetcher: typeof fetch = fetch) {
 return (await cancellationReasonDetails(env,id,fetcher)).reasons;
}
function validateAction(o: KitchenOrder, action: OrderAction) {
 if (terminal(o)) throw new OrderActionError("Este pedido já foi finalizado. Atualize a fila.");
 if (needsStatusReview(o)) throw new OrderActionError("Confira o status atual deste pedido no iFood pelo balcão antes de continuar.");
 if (["startPreparation","readyToPickup","startSeparation","finishSeparation"].includes(action) && scheduledWait(o)) throw new OrderActionError("Aguarde o horário de preparo do pedido agendado.");
 if (action === "startSeparation" || action === "finishSeparation") {
  if (!["CONFIRMED","PREPARING","READY_TO_PICKUP"].includes(o.status)) throw new OrderActionError("A separação começa depois que o pedido for confirmado.");
  return;
 }
 if (o.pendingAction) throw new OrderActionError("Já existe uma solicitação aguardando resposta do iFood. Consulte a fila.");
 const valid = action === "confirm" && o.status === "PLACED" ||
  action === "startPreparation" && o.status === "CONFIRMED" ||
  action === "readyToPickup" && o.status === "PREPARING" && ["DELIVERY","TAKEOUT","DINE_IN"].includes(o.orderType) ||
  action === "dispatch" && o.status === "READY_TO_PICKUP" && o.orderType === "DELIVERY" && o.deliveredBy === "MERCHANT" ||
  action === "requestCancellation";
 if (!valid) throw new OrderActionError("Esta ação não está disponível nesta etapa ou modalidade do pedido.");
}
async function refusal(r: Response) {
 let code = ""; try { const data = await r.json() as Data; code = txt(data.code) || txt(data.error?.code); } catch {}
 const known: Record<string,string> = {
  OrderExceededCancellationDeadline:"O prazo de cancelamento deste pedido terminou.",
  OrderHasACancellationInProgress:"Já existe um cancelamento em análise no iFood.",
  InvalidParameter:"O iFood recusou os dados. Atualize a fila e confira a ação.",
  OrderNotFound:"O pedido não está mais disponível no iFood.",
 };
 return known[code] || `O iFood recusou a ação (HTTP ${r.status}). Atualize a fila antes de tentar novamente.`;
}
export async function actOnOrder(env: Env, id: string, input: { action: OrderAction; requestId: string; reason?: string }, actor = "owner", fetcher: typeof fetch = fetch) {
 const supported = ["confirm","startPreparation","readyToPickup","dispatch","requestCancellation","startSeparation","finishSeparation"];
 if (!input || !supported.includes(input.action) || typeof input.requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.requestId) || input.reason !== undefined && (typeof input.reason !== "string" || input.reason.length > 100)) throw new OrderActionError("Solicitação inválida.",400);
 const internal = input.action === "startSeparation" || input.action === "finishSeparation";
 if (internal) config(env);
 else assertConfigured(env);
 const stored = await storedOrder(env,id);
 const previous = await db(env).prepare("SELECT * FROM order_actions WHERE id=?").bind(input.requestId).first<Data>();
 if (previous) {
  if (previous.order_id !== id || previous.action !== input.action || (previous.reason || "") !== (input.reason || "")) throw new OrderActionError("Identificador de solicitação já utilizado.",409);
  if (previous.status === "FAILED") throw new OrderActionError(previous.error || "O iFood recusou a ação.",422);
  return snapshot(env);
 }
 const stamp = new Date().toISOString();
 if (input.action === "startSeparation" || input.action === "finishSeparation") {
  const o = (await projectOrders(env,[stored]))[0]; validateAction(o,input.action);
  const stage = input.action === "startSeparation" ? "SEPARATING" : "SEPARATED";
  const allowed = input.action === "startSeparation" ? ["WAITING"] : ["WAITING","SEPARATING"];
  const changed=await db(env).prepare(`UPDATE received_orders SET kitchen_stage=?,kitchen_updated_at=?,kitchen_needs_review=CASE WHEN ? THEN 0 ELSE kitchen_needs_review END WHERE id=? AND kitchen_stage IN (${allowed.map(() => "?").join(",")}) AND cancelled=0 AND payload=?`).bind(stage,stamp,input.action==="finishSeparation"?1:0,id,...allowed,stored.payload).run();
  if(!changed.meta.changes && (await storedOrder(env,id)).payload!==stored.payload) throw new OrderActionError("Pedido alterado. Atualize e confira os itens antes de marcar.");
  return snapshot(env);
 }
 const o = await freshOrder(env,id,fetcher); validateAction(o,input.action);
 let selectedCancellationReason:CancellationReason|undefined;
 if (input.action === "requestCancellation") {
  const {reasons} = await fetchReasons(env,id,fetcher);
  selectedCancellationReason=reasons.find(x => x.code === input.reason);
  if (!selectedCancellationReason) throw new OrderActionError("Escolha um motivo que esteja disponível para este pedido.",422);
 }
 const inserted = await db(env).prepare("INSERT OR IGNORE INTO order_actions (id,order_id,action,status,reason,actor,requested_at,updated_at) VALUES (?,?,?,'SENDING',?,?,?,?)").bind(input.requestId,id,input.action,input.reason || null,actor,stamp,stamp).run();
 if (!inserted.meta.changes) throw new OrderActionError("Outra tela já enviou uma ação para este pedido. Atualize a fila.");
 let r: Response;
 try {
  r = await api(env,fetcher,`/order/v1.0/orders/${encodeURIComponent(id)}/${input.action}`,{method:"POST",headers:{"Content-Type":"application/json"},...(selectedCancellationReason ? {body:JSON.stringify({cancellationCode:selectedCancellationReason.code,reason:selectedCancellationReason.description})} : {})});
 } catch {
  await db(env).prepare("UPDATE order_actions SET status='UNCERTAIN',error=?,updated_at=? WHERE id=? AND status='SENDING'").bind("Conexão interrompida durante o envio. Consulte o iFood antes de repetir a ação.",new Date().toISOString(),input.requestId).run();
  throw new OrderActionError("Não foi possível confirmar o envio. Consulte a fila; a ação pode ter chegado ao iFood.",503);
 }
 if (r.status === 204 && input.action === "requestCancellation" || !r.ok) {
  const message = r.status === 204 ? "O iFood não encontrou uma política de cancelamento para este pedido." : await refusal(r);
  const status = r.status >= 500 || r.status === 408 ? "UNCERTAIN" : "FAILED";
  await db(env).prepare("UPDATE order_actions SET status=?,error=?,updated_at=? WHERE id=? AND status='SENDING'").bind(status,message,new Date().toISOString(),input.requestId).run();
  throw new OrderActionError(message,status === "UNCERTAIN" ? 503 : 422);
 }
 await db(env).prepare("UPDATE order_actions SET status='ACCEPTED',updated_at=? WHERE id=? AND status='SENDING'").bind(new Date().toISOString(),input.requestId).run();
 return snapshot(env);
}

export async function replyToDispute(env:Env,id:string,input:DisputeReply,actor="owner",fetcher:typeof fetch=fetch) {
 assertConfigured(env);
 await assertDatabaseScope(env);
 await respondToDispute(db(env),id,input,actor,orderId=>freshOrder(env,orderId,fetcher),(path,init)=>api(env,fetcher,path,init));
 return snapshot(env);
}
export async function retryPendingEvents(env:Env,fetcher:typeof fetch=fetch) {
 assertConfigured(env);
 await db(env).prepare("UPDATE received_events SET attempts=0,first_attempt_at=0,next_attempt_at=0 WHERE handled=0 AND processing_error IS NOT NULL").run();
 return synchronize(env,fetcher);
}
export async function saveWidget(env:Env,widgetId:unknown) {
 if(widgetId!==null&&!uuid(widgetId))throw new NegotiationError("Informe o ID válido do Widget iFood.",400);
 await db(env).prepare("INSERT INTO integration_preferences (id,widget_id) VALUES ('ifood',?) ON CONFLICT(id) DO UPDATE SET widget_id=excluded.widget_id").bind(widgetId).run();
 return snapshot(env);
}
export async function invoiceCustomerDocument(env:Env,id:string,fetcher:typeof fetch=fetch) {
 assertConfigured(env);const stored=await storedOrder(env,id);
 const r=await api(env,fetcher,`/order/v1.0/orders/${encodeURIComponent(id)}`);
 if(!r.ok)throw new OrderActionError("Não foi possível consultar o documento no iFood.",503);
 const raw=await r.json() as Data;
 let order:KitchenOrder;try{order=normalizeOrder(raw,stored.received_at,env);}catch{throw new OrderActionError(`O iFood não confirmou o ambiente e a ${config(env).isTest ? "loja de teste" : "loja configurada"} deste pedido.`,403);}
 if(order.id!==id||order.merchantId!==stored.merchant_id||order.category!=="FOOD")throw new OrderActionError("Pedido incompatível com a loja configurada.",403);
 const document=txt(raw.customer?.documentNumber).replace(/\D/g,"");
 return {documentNumber:[11,14].includes(document.length)?document:null};
}
export async function validateIntegration(env:Env,fetcher:typeof fetch=fetch) {
 assertConfigured(env);
 await synchronize(env,fetcher);
 const checks:{orderId:string;ok:boolean;detail:string}[]=[];
 const recent=await db(env).prepare("SELECT id,created_at FROM received_orders ORDER BY received_at DESC LIMIT 8").all<{id:string;created_at:string}>();
 for(const row of recent.results){
  if(!Number.isFinite(Date.parse(row.created_at))||Date.now()-Date.parse(row.created_at)>7*24*60*60_000){checks.push({orderId:row.id,ok:false,detail:"Fora da janela de consulta de sete dias."});continue;}
  try {const order=await freshOrder(env,row.id,fetcher);checks.push({orderId:row.id,ok:true,detail:`Pedido FOOD verificado no ambiente ${config(env).environment}: ${order.orderType||"modalidade ausente"}, ${order.timing||"momento ausente"}.`});}
  catch(e){checks.push({orderId:row.id,ok:false,detail:e instanceof OrderActionError?e.message:"Não foi possível verificar o pedido."});}
 }
 const events=await db(env).prepare("SELECT code,COUNT(*) AS received,SUM(CASE WHEN acknowledged_at IS NOT NULL THEN 1 ELSE 0 END) AS acknowledged,SUM(handled) AS processed FROM received_events GROUP BY code ORDER BY code").all<{code:string;received:number;acknowledged:number;processed:number}>();
 const actions=await db(env).prepare("SELECT action,status,COUNT(*) AS count FROM order_actions GROUP BY action,status ORDER BY action,status").all<{action:string;status:string;count:number}>();
 const replies=await db(env).prepare("SELECT action,status,COUNT(*) AS count FROM dispute_responses GROUP BY action,status ORDER BY action,status").all<{action:string;status:string;count:number}>();
 const current=await snapshot(env),orders=current.orders;
 return {
  checkedAt:new Date().toISOString(),classification:"VALIDACAO_TECNICA",officialApproval:false,environment:config(env).environment,merchantId:config(env).merchantId,
  connection:{configured:current.configured,lastSuccessfulPollingAt:current.lastSuccessAt,lastError:current.lastError,minimumPollingSeconds:30,pendingEvents:current.pendingEvents,pendingErrors:current.pendingErrors},
  backgroundReceiver:await receiverHealth(env),
  orderDetails:checks,eventEvidence:events.results,actionEvidence:actions.results,negotiationEvidence:replies.results,
  observed:{orders:orders.length,statuses:[...new Set(orders.map(o=>o.status))].sort(),orderTypes:[...new Set(orders.map(o=>o.orderType).filter(Boolean))].sort(),timings:[...new Set(orders.map(o=>o.timing).filter(Boolean))].sort(),deliveryProviders:[...new Set(orders.map(o=>o.deliveredBy).filter(Boolean))].sort(),paymentTypes:[...new Set(orders.flatMap(o=>o.receipt?.payments.map(p=>p.type)||[]).filter(Boolean))].sort(),paymentMethods:[...new Set(orders.flatMap(o=>o.receipt?.payments.map(p=>p.method)||[]).filter(Boolean))].sort(),cardBrands:[...new Set(orders.flatMap(o=>o.receipt?.payments.map(p=>p.brand)||[]).filter(Boolean))].sort(),couponSponsors:[...new Set(orders.flatMap(o=>o.receipt?.discounts.flatMap(d=>d.sponsors.map(s=>s.name))||[]).filter(Boolean))].sort(),ordersWithPickupCode:orders.filter(o=>o.receipt?.pickupCode).length,ordersWithDeliveryNotes:orders.filter(o=>o.receipt?.deliveryNotes).length,negotiations:current.disputes.length},
  limitations:["Não é aprovação nem execução do assistente de homologação.","Evidências refletem apenas os eventos e comandos efetivamente registrados.","Eventos antigos sem acknowledged_at não recebem confirmação retroativa neste relatório.","Retirada, agendamento, pagamentos, cupons e negociações sem evidência precisam de pedidos no cliente de teste.","O recebimento sem navegador depende do serviço contínuo instalado, ativo e com credencial válida; consulte backgroundReceiver."],
 };
}
export async function disputeEvidence(env:Env,id:string,index:number,fetcher:typeof fetch=fetch) {
 assertConfigured(env);
 const evidence=await evidencePath(db(env),id,index);
 await freshOrder(env,evidence.orderId,fetcher);
 const r=await api(env,fetcher,evidence.path,{redirect:"error"});
 const mime=(r.headers.get("Content-Type")||"").split(";")[0].trim().toLowerCase();
 if(!r.ok||!["image/jpeg","image/png","image/webp"].includes(mime)||!r.body)throw new NegotiationError("Não foi possível abrir esta evidência no iFood.",502);
 const maximum=8*1024*1024,reader=r.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maximum){await reader.cancel();throw new NegotiationError("A evidência ultrapassa o tamanho permitido.",413);}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}
 return new Response(bytes,{headers:{"Content-Type":mime,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; frame-ancestors 'self'"}});
}
