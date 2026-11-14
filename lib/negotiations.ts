import { uuid, rejectionReasons, disputeOpen, type Dispute, type DisputeReply, type DisputedItem, type DisputeSettlement } from "./negotiation-state.ts";
import type { KitchenOrder } from "./order-state.ts";
type Data = Record<string, any>;
const text = (x: unknown): string => typeof x === "string" ? x : "";
const list = (x: unknown): string[] => Array.isArray(x) ? x.filter((v):v is string => typeof v === "string").slice(0,100) : [];
function cents(x: unknown): number | null {
 if (typeof x !== "string" || !/^\d+$/.test(x)) return null;
 const v=Number(x); return Number.isSafeInteger(v) ? v : null;
}
function meta(x: Data): Data { return x.metadata && typeof x.metadata === "object" && !Array.isArray(x.metadata) ? x.metadata : {}; }
function settlement(row: Data): DisputeSettlement {
 const m=JSON.parse(row.payload) as Data, a=m.selectedDisputeAlternative, am=a ? meta(a) : {};
 return {disputeId:row.dispute_id,status:text(m.status),reason:text(m.reason),createdAt:row.created_at,alternative:a?{type:text(a.type),cents:cents(am.amount?.value),currency:text(am.amount?.currency),minutes:Number.isInteger(am.additionalTimeInMinutes??am.additionalTimeMinutes)?am.additionalTimeInMinutes??am.additionalTimeMinutes:null,reason:text(am.additionalTimeReason)||text(am.reason)}:null};
}
export class NegotiationError extends Error { status: number; constructor(message:string,status=409){super(message);this.status=status;} }
export async function ingestNegotiations(DB: D1Database) {
 const events=await DB.prepare("SELECT * FROM received_events WHERE negotiation_handled=0 AND code IN ('HSD','HANDSHAKE_DISPUTE','HSS','HANDSHAKE_SETTLEMENT') ORDER BY received_at,id LIMIT 200").all<Data>();
 for(const e of events.results) {
  const raw=JSON.parse(e.payload) as Data, m=meta(raw), stamp=text(m.createdAt)||text(raw.createdAt)||e.received_at;
  const id=text(m.disputeId)||text(m.id)||`event:${e.id}`;
  const statement=["HSD","HANDSHAKE_DISPUTE"].includes(e.code)
   ? DB.prepare("INSERT OR IGNORE INTO order_disputes (id,order_id,payload,created_at,expires_at) VALUES (?,?,?,?,?)").bind(id,e.order_id||"",JSON.stringify(m),stamp,text(m.expiresAt))
   : DB.prepare("INSERT OR IGNORE INTO dispute_settlements (event_id,dispute_id,order_id,payload,created_at) VALUES (?,?,?,?,?)").bind(e.id,text(m.disputeId),e.order_id||"",JSON.stringify(m),stamp);
  await DB.batch([statement,DB.prepare("UPDATE received_events SET negotiation_handled=1 WHERE id=?").bind(e.id)]);
 }
}
export async function negotiationSnapshot(DB: D1Database): Promise<Dispute[]> {
 const rows=await DB.prepare("SELECT d.*,o.display_id,o.customer,o.merchant_id FROM order_disputes d LEFT JOIN received_orders o ON o.id=d.order_id ORDER BY d.created_at DESC").all<Data>();
 if(!rows.results.length)return [];
 const results=await DB.prepare("SELECT * FROM dispute_settlements ORDER BY created_at,event_id").all<Data>();
 const responses=await DB.prepare("SELECT * FROM dispute_responses ORDER BY requested_at,id").all<Data>();
 return rows.results.map(row=>{
  const m=JSON.parse(row.payload) as Data,nested=meta(m);
  const related=results.results.filter(s=>s.order_id===row.order_id).map(settlement);
  const direct=related.filter(s=>s.disputeId===row.id).at(-1)||null;
  const response=responses.results.filter(r=>r.dispute_id===row.id).at(-1);
  const item=(x:Data):DisputedItem=>({id:text(x.id),uniqueId:text(x.uniqueId),index:Number.isInteger(x.index)?x.index:null,quantity:typeof x.quantity==="number"?x.quantity:null,cents:cents(x.amount?.value),currency:text(x.amount?.currency),reason:text(x.reason),parentUniqueId:text(x.parentUniqueId)});
  const rawItems=nested.items??nested.item??m.items??m.item, rawGarnishes=nested.garnishItems??m.garnishItems;
  return {
   merchantId:text(row.merchant_id),
   id:row.id,orderId:row.order_id,displayId:row.display_id||row.order_id.slice(-6)||"A verificar",customer:row.customer||"Cliente",parentDisputeId:text(m.parentDisputeId),createdAt:row.created_at,expiresAt:row.expires_at,
   action:text(m.action),handshakeType:text(m.handshakeType),handshakeGroup:text(m.handshakeGroup),message:text(m.message),timeoutAction:text(m.timeoutAction),
   acceptReasons:list(nested.acceptCancellationReasons??m.acceptCancellationReasons),
   alternatives:Array.isArray(m.alternatives)?m.alternatives.map((a:Data)=>({id:text(a.id),type:text(a.type),maxCents:cents(meta(a).maxAmount?.value),currency:text(meta(a).maxAmount?.currency),minutes:Array.isArray(meta(a).allowedsAdditionalTimeInMinutes)?meta(a).allowedsAdditionalTimeInMinutes.filter((v:unknown)=>Number.isInteger(v)&&Number(v)>0):[],reasons:list(meta(a).allowedsAdditionalTimeReasons)})):[],
   items:[...(Array.isArray(rawItems)?rawItems:[]),...(Array.isArray(rawGarnishes)?rawGarnishes:[])].map(item),
   evidenceCount:Array.isArray(nested.evidences??m.evidences)?(nested.evidences??m.evidences).length:0,
   supported:uuid(row.id)&&m.handshakeGroup==="CUSTOMER_ORDER_SUPPORT"&&["AFTER_DELIVERY","AFTER_DELIVERY_PARTIALLY","PREPARATION_TIME","DELAY"].includes(m.handshakeType)&&["CANCELLATION","PARTIAL_CANCELLATION"].includes(m.action),
   settlement:direct,relatedSettlements:related,response:response?{action:response.action,status:response.status,requestedAt:response.requested_at,error:response.error||null}:null,
  };
 });
}
function requestBody(d:Dispute,input:DisputeReply) {
 if(!d.supported)throw new NegotiationError("Negociação não reconhecida. Confira no iFood.",422);
 if(!disputeOpen(d))throw new NegotiationError("Esta negociação já foi respondida ou o prazo terminou. Atualize o balcão.");
 if(input.action==="accept") {
  if(d.acceptReasons.length&&!d.acceptReasons.includes(input.reason||""))throw new NegotiationError("Selecione um motivo permitido pelo iFood.",422);
  if(!d.acceptReasons.length&&input.reason)throw new NegotiationError("Este aceite não solicita motivo.",422);
  return {path:"accept",body:{...(input.reason?{reason:input.reason}:{}),...(input.detailReason?{detailReason:input.detailReason}:{})}};
 }
 if(input.action==="reject") {
  if(!rejectionReasons.includes(input.reason||""))throw new NegotiationError("Selecione um motivo para recusar.",422);
  return {path:"reject",body:{reason:input.reason}};
 }
 const a=d.alternatives.find(a=>a.id===input.alternativeId);
 if(!a||!uuid(a.id))throw new NegotiationError("Escolha uma proposta disponível para esta negociação.",422);
 if(a.type==="REFUND"||a.type==="BENEFIT") {
  if(a.currency!=="BRL"||a.maxCents===null||!Number.isSafeInteger(input.cents)||input.cents!<=0||input.cents!>a.maxCents)throw new NegotiationError("Informe um valor dentro do limite apresentado.",422);
  return {path:`alternatives/${encodeURIComponent(a.id)}`,body:{type:a.type,metadata:{amount:{value:String(input.cents),currency:a.currency}}}};
 }
 if(a.type==="ADDITIONAL_TIME") {
  if(!a.minutes.includes(input.minutes!)||!a.reasons.includes(input.reason||""))throw new NegotiationError("Selecione um prazo e um motivo permitidos pelo iFood.",422);
  return {path:`alternatives/${encodeURIComponent(a.id)}`,body:{type:a.type,metadata:{additionalTimeInMinutes:input.minutes,additionalTimeReason:input.reason}}};
 }
 throw new NegotiationError("Esta proposta precisa ser tratada no iFood.",422);
}
export async function respondToDispute(DB:D1Database,id:string,input:DisputeReply,actor:string,verifyOrder:(id:string)=>Promise<KitchenOrder>,api:(path:string,init?:RequestInit)=>Promise<Response>) {
 if(!input||!uuid(input.requestId)||!["accept","reject","alternative"].includes(input.action)||Object.keys(input).some(k=>!["requestId","action","reason","detailReason","alternativeId","cents","minutes"].includes(k))||[input.reason,input.detailReason,input.alternativeId].some(v=>v!==undefined&&(typeof v!=="string"||v.length>250)))throw new NegotiationError("Resposta inválida.",400);
 const payload=JSON.stringify({action:input.action,reason:input.reason||"",detailReason:input.detailReason||"",alternativeId:input.alternativeId||"",cents:input.cents??null,minutes:input.minutes??null});
 const previous=await DB.prepare("SELECT * FROM dispute_responses WHERE id=?").bind(input.requestId).first<Data>();
 if(previous){if(previous.dispute_id!==id||previous.payload!==payload)throw new NegotiationError("Identificador de resposta já utilizado.");if(previous.status==="FAILED")throw new NegotiationError(previous.error||"Resposta recusada pelo iFood.",422);return;}
 await ingestNegotiations(DB);
 let d=(await negotiationSnapshot(DB)).find(d=>d.id===id);
 if(!d)throw new NegotiationError("Negociação não encontrada.",404);
 await verifyOrder(d.orderId);
 d=(await negotiationSnapshot(DB)).find(d=>d.id===id)!;
 const outgoing=requestBody(d,input),stamp=new Date().toISOString();
 const inserted=await DB.prepare("INSERT OR IGNORE INTO dispute_responses (id,dispute_id,order_id,action,payload,status,actor,requested_at,updated_at) VALUES (?,?,?,?,?,'SENDING',?,?,?)").bind(input.requestId,id,d.orderId,input.action,payload,actor,stamp,stamp).run();
 if(!inserted.meta.changes)throw new NegotiationError("Outra tela já respondeu. Atualize o balcão.");
 let r:Response;
 try {r=await api(`/order/v1.0/disputes/${encodeURIComponent(id)}/${outgoing.path}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(outgoing.body)});}
 catch {await DB.prepare("UPDATE dispute_responses SET status='UNCERTAIN',error=?,updated_at=? WHERE id=?").bind("Envio sem resposta. Confira no iFood antes de repetir.",new Date().toISOString(),input.requestId).run();throw new NegotiationError("O envio pode ter chegado ao iFood. Aguarde a atualização antes de repetir.",503);}
 if(!r.ok){let code="";try{const body=await r.json() as Data;code=text(body.code)||text(body.error?.code);}catch{}
  const status=code==="DISPUTE_ALREADY_ANSWERED"?"ALREADY_ANSWERED":r.status>=500||r.status===408?"UNCERTAIN":"FAILED";
  const message=status==="ALREADY_ANSWERED"?"Respondida em outra tela. Aguardando atualização do iFood.":status==="UNCERTAIN"?"Envio sem confirmação. Confira no iFood.":code==="INVALID_REASON"?"O iFood recusou o motivo. Atualize a negociação.":code==="INVALID_AMOUNT"?"O iFood recusou o valor da proposta.":`O iFood recusou a resposta (HTTP ${r.status}). Confira no Gestor antes de repetir.`;
  await DB.prepare("UPDATE dispute_responses SET status=?,error=?,updated_at=? WHERE id=? AND status='SENDING'").bind(status,message,new Date().toISOString(),input.requestId).run();throw new NegotiationError(message,status==="UNCERTAIN"?503:422);
 }
 await DB.prepare("UPDATE dispute_responses SET status='SUBMITTED',updated_at=? WHERE id=? AND status='SENDING'").bind(new Date().toISOString(),input.requestId).run();
}
export async function evidencePath(DB:D1Database,id:string,index:number) {
 const row=await DB.prepare("SELECT * FROM order_disputes WHERE id=?").bind(id).first<Data>();
 if(!row||!Number.isSafeInteger(index)||index<0)throw new NegotiationError("Evidência não encontrada.",404);
 const m=JSON.parse(row.payload) as Data, evidence=(meta(m).evidences??m.evidences)?.[index];
 let url:URL;try{url=new URL(evidence?.url);}catch{throw new NegotiationError("Evidência não encontrada.",404);}
 const order=encodeURIComponent(row.order_id);
 if(url.protocol!=="https:"||url.hostname!=="merchant-api.ifood.com.br"||url.port||url.username||url.password||url.search||url.hash||!([`/order/v1.0/orders/${order}/cancellationEvidences/`,`/orders/${order}/evidences/`].some(prefix=>url.pathname.startsWith(prefix)))||/\.{2}|%2e|%2f|%5c/i.test(url.pathname))throw new NegotiationError("Endereço de evidência não permitido.",422);
 return {path:url.pathname,orderId:row.order_id};
}
