import {HouseError,dateBR,moneyBR,localParts,type HouseActor,type HouseOrder} from './house-state.ts';
import {getHouseOrder} from './house.ts';
import {activeWhatsappRecipients,ensureWhatsappRecipients,normalizeRecipientPhone,whatsappRecipientStatus} from './whatsapp-recipients.ts';

export type WhatsappEnv={DB?:D1Database;WHATSAPP_TEST_TO?:string;WHATSAPP_CONFIG_KEY?:string};
type Connection={encrypted_token:string;phone_id:string;sender:string;enabled:number;enabled_at:string|null;connected_at:string};
type Job={id:string;order_id:string|null;revision:number;order_status:string;state:string;body:string|null;fingerprint:string|null;error:string|null;message_id:string|null;created_at:string;updated_at:string;sent_parts:number;total_parts:number;manual_parts:number;recipient_phone:string|null;recipient_name:string|null;recipient_since:string|null};
// Version displayed by Meta's developer hub for this test integration.
export const WHATSAPP_API_VERSION='v25.0';
const stamp=(now:number)=>new Date(now).toISOString();
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(v);
const enc=new TextEncoder();
function owner(a:HouseActor){if(a.realRole!=='admin')throw new HouseError('Somente o proprietário pode configurar o WhatsApp.',403);}
function database(e:WhatsappEnv){if(!e.DB)throw new HouseError('Banco indisponível.',503);return e.DB;}
async function requireRecipients(e:WhatsappEnv,now=Date.now()){
 const recipients=await activeWhatsappRecipients(e,now);
 if(!recipients.length)throw new HouseError('Adicione um entregador nas configurações.',503);
 return recipients;
}
const b64=(v:Uint8Array)=>btoa(String.fromCharCode(...v));
function unb64(s:string){return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
async function key(e:WhatsappEnv){
 if(!/^[0-9a-f]{64}$/i.test(e.WHATSAPP_CONFIG_KEY||''))throw new HouseError('Proteção das credenciais indisponível.',503);
 const bytes=Uint8Array.from(e.WHATSAPP_CONFIG_KEY!.match(/../g)!,x=>parseInt(x,16));
 return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);
}
export async function encryptWhatsappToken(e:WhatsappEnv,token:string,phoneId:string){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode('galega-lab:whatsapp:'+phoneId)},await key(e),enc.encode(token));
 return 'v1.'+b64(iv)+'.'+b64(new Uint8Array(cipher));
}
export async function decryptWhatsappToken(e:WhatsappEnv,value:string,phoneId:string){
 const [version,iv,cipher]=value.split('.');
 if(version!=='v1'||!iv||!cipher)throw new HouseError('Reconecte a conta da Meta.',503);
 try{return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv),additionalData:enc.encode('galega-lab:whatsapp:'+phoneId)},await key(e),unb64(cipher)));}
 catch{throw new HouseError('Reconecte a conta da Meta.',503);}
}
async function connection(e:WhatsappEnv){return database(e).prepare("SELECT * FROM whatsapp_connection WHERE id='main'").first<Connection>();}
async function issueCount(DB:D1Database){const row=await DB.prepare("SELECT COUNT(*) n FROM house_whatsapp_jobs WHERE state IN ('BLOCKED','REVIEW')").first<{n:number}>();return{issues:row?.n||0};}
export function whatsappMetaError(code:number){
 if(code===190)return 'Token expirado ou inválido. Reconecte a Meta.';
 if(code===131047)return 'Responda à conversa de teste no WhatsApp para abrir a janela de 24 horas. Depois, tente novamente.';
 if(code===131030)return 'O destino de teste precisa estar verificado na Meta.';
 if(code===10||code===200)return 'A Meta não autorizou o envio. Confira as permissões do aplicativo.';
 return `A Meta recusou o envio${Number.isSafeInteger(code)&&code>0?' (código '+code+')':''}. Confira a conexão antes de repetir.`;
}
export async function whatsappStatus(e:WhatsappEnv,a:HouseActor){
 owner(a);await ensureWhatsappRecipients(e);const c=await connection(e),DB=database(e),recipients=await whatsappRecipientStatus(e,a);
 const recent=await DB.prepare('SELECT j.id,j.order_id,j.recipient_phone,j.recipient_name,j.state,j.message_id,j.sent_parts,j.total_parts,j.manual_parts,j.error,j.updated_at,o.number,o.customer FROM house_whatsapp_jobs j LEFT JOIN house_orders o ON o.id=j.order_id WHERE j.state NOT IN (\'VOID\',\'SKIPPED\') ORDER BY CASE WHEN j.state IN (\'BLOCKED\',\'REVIEW\') THEN 0 ELSE 1 END,j.updated_at DESC,j.id LIMIT 12').all<any>();
 return{...recipients,destination:recipients.recipients.length===1?recipients.recipients[0].displayPhone:null,status:c?'connected':'not_connected',sender:c?.sender||null,phoneId:c?.phone_id||'',enabled:!!c?.enabled,connectedAt:c?.connected_at||null,protected:!!e.WHATSAPP_CONFIG_KEY,jobs:recent.results.map(r=>({id:r.id,recipientPhone:r.recipient_phone,recipientName:r.recipient_name,orderId:r.order_id,order:r.number?'C'+String(r.number).padStart(4,'0'):'Teste',customer:r.customer||'Cliente de teste',state:r.state,acceptedByMeta:!!r.message_id&&!r.manual_parts,sentParts:r.sent_parts,totalParts:r.total_parts,error:r.error,updatedAt:r.updated_at}))};
}
// The URL is fixed to Graph API; neither the browser nor a DB value can supply a host.
export async function connectWhatsapp(e:WhatsappEnv,a:HouseActor,input:any,fetcher:typeof fetch=fetch,now=Date.now()){
 owner(a);await requireRecipients(e,now);
 const phoneId=String(input.phoneId||'').trim(),token=typeof input.token==='string'?input.token.trim():'';
 if(!/^\d{5,30}$/.test(phoneId)||!/^\S{40,4096}$/.test(token))throw new HouseError('Confira o ID do número e o token da Meta.',400);
 await key(e);
 let response:Response,data:any;
 try{response=await fetcher(`https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneId}?fields=id,display_phone_number`,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(8000),redirect:'manual'});data=await response.json();}
 catch{throw new HouseError('Não foi possível validar a conexão com a Meta. Tente novamente.',503);}
 if(!response.ok||String(data?.id)!==phoneId)throw new HouseError(whatsappMetaError(Number(data?.error?.code)),400);
 const ciphertext=await encryptWhatsappToken(e,token,phoneId);
 // Updating an existing token preserves the notification baseline and pause state.
 const DB=database(e),old=await connection(e);
 const saved=await DB.prepare("INSERT INTO whatsapp_connection(id,encrypted_token,phone_id,sender,connected_at) VALUES ('main',?,?,?,?) ON CONFLICT(id) DO UPDATE SET encrypted_token=excluded.encrypted_token,enabled=CASE WHEN phone_id<>excluded.phone_id THEN 0 ELSE enabled END,enabled_at=CASE WHEN phone_id<>excluded.phone_id THEN NULL ELSE enabled_at END,phone_id=excluded.phone_id,sender=excluded.sender,connected_at=excluded.connected_at WHERE lease_until<?").bind(ciphertext,phoneId,String(data.display_phone_number||'Número de teste').slice(0,80),stamp(now),now).run();
 if(!saved.meta.changes)throw new HouseError('Há um envio em andamento. Aguarde antes de atualizar a conexão.');
 if(old&&old.phone_id!==phoneId)await DB.prepare("UPDATE house_whatsapp_jobs SET state='VOID',updated_at=? WHERE state IN ('QUEUED','BLOCKED')").bind(stamp(now)).run();
 return whatsappStatus(e,a);
}
export async function setWhatsappEnabled(e:WhatsappEnv,a:HouseActor,enabled:unknown,now=Date.now()){
 owner(a);if(typeof enabled!=='boolean')throw new HouseError('Configuração inválida.',400);
 if(enabled)await requireRecipients(e,now);const c=await connection(e);if(!c)throw new HouseError('Conecte a Meta primeiro.',400);
 if(enabled)await decryptWhatsappToken(e,c.encrypted_token,c.phone_id);
 await database(e).prepare("UPDATE whatsapp_connection SET enabled=?,enabled_at=CASE WHEN ?=1 AND enabled=0 THEN ? ELSE enabled_at END WHERE id='main'").bind(enabled?1:0,enabled?1:0,stamp(now)).run();
 if(!enabled)await database(e).prepare("UPDATE house_whatsapp_jobs SET state='VOID',updated_at=? WHERE order_id IS NOT NULL AND state IN ('QUEUED','BLOCKED')").bind(stamp(now)).run();
 return whatsappStatus(e,a);
}
const line=(v:string,max=800)=>v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,'').trim().slice(0,max);
export function whatsappOrderData(o:HouseOrder){return JSON.stringify({version:2,customer:o.customer,phone:o.phone,address:o.address,date:o.date,time:o.time,promisedAt:o.promisedAt,timing:o.timing,modality:o.modality,status:o.status,items:o.items,observations:o.observations,totalCents:o.totalCents,paid:o.paid});}
const qty=(n:number)=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3}).format(n);
type WhatsappOrder=Pick<HouseOrder,'status'|'modality'|'timing'|'date'|'time'|'displayId'|'customer'|'address'|'phone'|'items'|'observations'|'totalCents'|'paid'>;
export function whatsappOrderText(o:WhatsappOrder,previous=false){
 const status=o.status==='CANCELLED'?'CANCELADO — NÃO ENTREGAR':o.status==='SCHEDULED'?'REAGENDADO — AGUARDE O PREPARO':o.modality==='TAKEOUT'?'ALTERADO PARA RETIRADA':previous?'ATUALIZAÇÃO — EM PREPARO':'EM PREPARO';
 const when=o.timing==='NOW'?`Agora · ${dateBR(o.date)} · ${o.time}`:`${dateBR(o.date)} às ${o.time}`;
 const items=o.items.flatMap(x=>{
  const rows=/churro/i.test(x.name)&&x.flavors.length?x.flavors.map(f=>`${qty(f.quantity)}x ${line(x.name,100)} de ${line(f.name,100)}`):[`${qty(x.quantity)}x ${line(x.name,100)}`,...x.flavors.map(f=>`  ${qty(f.quantity)}x ${line(f.name,100)}`)];
  return x.observations?[...rows,`Obs.: ${line(x.observations,600)}`]:rows;
 });
 return [status,`Salgados da Galega · ${o.displayId}`,`Cliente: ${line(o.customer,80)}`,`${o.modality==='DELIVERY'?'Entrega':'Retirada'}: ${when}`,o.modality==='DELIVERY'?`Endereço: ${line(o.address,600)}`:'Retirada na loja',`Telefone: ${line(o.phone,30)}`,'','PEDIDO',...items,...(o.observations?['',`Observações: ${line(o.observations,2000)}`]:[]),'',`TOTAL: ${moneyBR(o.totalCents)}`,`PAGAMENTO: ${o.paid?'Pago':'A cobrar'}`].join('\n');
}
export function whatsappMessageParts(body:string,orderLabel='Pedido da Casa'){
 const chunks:string[]=[];let rest=body;
 while(rest.length>3500){let cut=rest.lastIndexOf('\n',3500),separator=1;if(cut<1750){cut=rest.lastIndexOf(' ',3500);if(cut<1750){cut=3500;separator=0;}}if(cut>0&&/[\uD800-\uDBFF]/.test(rest[cut-1]))cut--;chunks.push(rest.slice(0,cut));rest=rest.slice(cut+separator);}
 if(rest)chunks.push(rest);
 return chunks.length>1?chunks.map((part,i)=>`PARTE ${i+1}/${chunks.length} · ${orderLabel}\n\n${part}`):chunks;
}
async function fingerprint(o:HouseOrder){const h=await crypto.subtle.digest('SHA-256',enc.encode(whatsappOrderData(o)));return b64(new Uint8Array(h));}

export async function reconcileWhatsapp(e:WhatsappEnv,now=Date.now()){
 await ensureWhatsappRecipients(e,now);
 const DB=database(e),c=await connection(e);if(!c?.enabled||!c.enabled_at)return;
 const t=stamp(now);
 await DB.batch([
  DB.prepare("UPDATE house_whatsapp_jobs SET state='REVIEW',error='Resultado incerto. Confira o WhatsApp antes de repetir.',updated_at=? WHERE state='SENDING' AND lease_until<?").bind(t,now),
  DB.prepare("UPDATE house_whatsapp_jobs SET state='VOID',updated_at=? WHERE order_id IS NOT NULL AND state IN ('QUEUED','BLOCKED') AND NOT EXISTS (SELECT 1 FROM house_orders o WHERE o.id=order_id AND o.revision=house_whatsapp_jobs.revision AND o.status=order_status AND o.status<>'FINISHED')").bind(t),
  DB.prepare(`INSERT OR IGNORE INTO house_whatsapp_jobs(id,order_id,revision,order_status,state,recipient_phone,recipient_name,recipient_since,created_at,updated_at)
    SELECT o.id||':'||o.revision||':'||o.status||':'||r.phone||':'||r.starts_at,o.id,o.revision,o.status,'QUEUED',r.phone,r.name,r.starts_at,?,?
    FROM house_orders o CROSS JOIN whatsapp_recipients r
    WHERE r.active=1 AND o.status<>'FINISHED'
    AND NOT EXISTS(SELECT 1 FROM house_events e WHERE e.order_id=o.id AND e.revision=o.revision AND e.kind='REOPENED')
    AND NOT EXISTS(SELECT 1 FROM house_whatsapp_jobs j WHERE j.order_id=o.id AND j.revision=o.revision AND j.order_status=o.status AND j.recipient_phone=r.phone AND j.recipient_since=r.starts_at)
    AND ((o.status='PREPARING' AND o.modality='DELIVERY' AND o.released_at>=? AND o.released_at>=r.starts_at) OR
      EXISTS(SELECT 1 FROM house_whatsapp_jobs j WHERE j.order_id=o.id AND j.recipient_phone=r.phone AND j.recipient_since=r.starts_at AND (j.state IN ('SENT','SENDING','REVIEW') OR j.sent_parts>0) AND j.revision<o.revision))`).bind(t,t,c.enabled_at),
 ]);
}
type MetaResult={state:'SENT'|'BLOCKED'|'REVIEW';messageId?:string;error?:string};
export async function sendWhatsappText(e:WhatsappEnv,c:Connection,body:string,recipientPhone:string,fetcher:typeof fetch=fetch):Promise<MetaResult>{
 let token:string,to:string;
 try{to=normalizeRecipientPhone(recipientPhone);token=await decryptWhatsappToken(e,c.encrypted_token,c.phone_id);}
 catch{return{state:'BLOCKED',error:'Reconecte a Meta e confira o destino de teste.'};}
 try{
  const response=await fetcher(`https://graph.facebook.com/${WHATSAPP_API_VERSION}/${c.phone_id}/messages`,{method:'POST',redirect:'manual',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to,type:'text',text:{preview_url:false,body}}),signal:AbortSignal.timeout(8000)});
  const data:any=await response.json();
  if(response.ok&&typeof data?.messages?.[0]?.id==='string'&&data.messages[0].id.startsWith('wamid.'))return{state:'SENT',messageId:data.messages[0].id.slice(0,512)};
  if(!response.ok&&response.status<500&&data?.error&&Number.isInteger(data.error.code))return{state:'BLOCKED',error:whatsappMetaError(data.error.code)};
 }catch{/* A timeout or malformed response can follow an accepted send. Never replay it silently. */}
 return{state:'REVIEW',error:'Resultado incerto. Confira o WhatsApp antes de repetir.'};
}
async function processJob(e:WhatsappEnv,c:Connection,j:Job,claim:string,fetcher:typeof fetch,now:number){
 const DB=database(e),t=stamp(now);let body=j.body||'',hash:string|null=j.fingerprint,orderLabel='TESTE';
 if(j.order_id){
  const o=await getHouseOrder(DB,j.order_id);
  if(o.revision!==j.revision||o.status!==j.order_status||o.status==='FINISHED')return;
  hash=await fingerprint(o);orderLabel=o.displayId;
  const previous=await DB.prepare("SELECT fingerprint FROM house_whatsapp_jobs WHERE order_id=? AND recipient_phone=? AND recipient_since=? AND state='SENT' ORDER BY updated_at DESC,id DESC LIMIT 1").bind(j.order_id,j.recipient_phone,j.recipient_since).first<{fingerprint:string}>();
  if(!j.sent_parts&&previous?.fingerprint===hash){await DB.prepare("UPDATE house_whatsapp_jobs SET state='SKIPPED',updated_at=? WHERE id=? AND state='QUEUED'").bind(t,j.id).run();return;}
  if(!j.sent_parts)body=whatsappOrderText(o,!!previous);
 }
 const parts=whatsappMessageParts(body,orderLabel),partIndex=j.sent_parts||0;if(!parts[partIndex])return;
 const claimed=await DB.prepare(`UPDATE house_whatsapp_jobs SET state='SENDING',claim_token=?,lease_until=?,body=?,fingerprint=?,total_parts=?,error=NULL,updated_at=?
   WHERE id=? AND state='QUEUED' AND EXISTS(SELECT 1 FROM whatsapp_recipients r WHERE r.phone=house_whatsapp_jobs.recipient_phone AND r.active=1 AND r.starts_at=house_whatsapp_jobs.recipient_since) AND EXISTS(SELECT 1 FROM whatsapp_connection WHERE id='main' AND lease_owner=? ${j.order_id?'AND enabled=1':''})
   ${j.order_id?"AND EXISTS(SELECT 1 FROM house_orders o WHERE o.id=order_id AND o.revision=house_whatsapp_jobs.revision AND o.status=order_status AND o.status<>'FINISHED')":''}`).bind(claim,now+30000,body,hash,parts.length,t,j.id,claim).run();
 if(!claimed.meta.changes)return;
 const result=await sendWhatsappText(e,c,parts[partIndex],j.recipient_phone||'',fetcher);
 const nextPart=partIndex+(result.state==='SENT'?1:0),nextState=result.state==='SENT'&&nextPart<parts.length?'QUEUED':result.state;
 const error=result.error&&(parts.length>1?`Parte ${partIndex+1}/${parts.length}: ${result.error}`:result.error);
 await DB.prepare("UPDATE house_whatsapp_jobs SET state=?,message_id=COALESCE(?,message_id),sent_parts=?,error=?,updated_at=?,lease_until=0 WHERE id=? AND claim_token=? AND state='SENDING'").bind(nextState,result.messageId||null,nextPart,error||null,stamp(Date.now()),j.id,claim).run();
}
// One independent request processes at most one message. A global durable lease
// prevents simultaneous tablets from dispatching the same outbox item.
export async function whatsappTick(e:WhatsappEnv,fetcher:typeof fetch=fetch,now=Date.now(),sampleId?:string){
 await ensureWhatsappRecipients(e,now);const DB=database(e),c=await connection(e);if(!c||!e.WHATSAPP_CONFIG_KEY)return{issues:0};
 if(!sampleId&&!c.enabled&&!await DB.prepare("SELECT id FROM house_whatsapp_jobs WHERE order_id IS NULL AND state IN ('QUEUED','SENDING') LIMIT 1").first())return issueCount(DB);
 const claim=crypto.randomUUID(),held=await DB.prepare("UPDATE whatsapp_connection SET lease_owner=?,lease_until=? WHERE id='main' AND lease_until<? AND (?=1 OR next_run_at<=?)").bind(claim,now+30000,now,sampleId?1:0,now).run();
 if(!held.meta.changes)return issueCount(DB);
 try{
  await DB.prepare("UPDATE house_whatsapp_jobs SET state='VOID',updated_at=? WHERE state IN ('QUEUED','BLOCKED','REVIEW') AND NOT EXISTS(SELECT 1 FROM whatsapp_recipients r WHERE r.phone=house_whatsapp_jobs.recipient_phone AND r.active=1 AND r.starts_at=house_whatsapp_jobs.recipient_since)").bind(stamp(now)).run();
  if(!sampleId&&c.enabled)await reconcileWhatsapp(e,now);
  else await DB.prepare("UPDATE house_whatsapp_jobs SET state='REVIEW',error='Resultado incerto. Confira o WhatsApp antes de repetir.',updated_at=? WHERE order_id IS NULL AND state='SENDING' AND lease_until<?").bind(stamp(now),now).run();
  const j=sampleId?await DB.prepare("SELECT * FROM house_whatsapp_jobs WHERE id=? AND state='QUEUED'").bind(sampleId).first<Job>():await DB.prepare("SELECT * FROM house_whatsapp_jobs WHERE state='QUEUED' AND (order_id IS NULL OR ?=1) ORDER BY CASE WHEN order_status='CANCELLED' THEN 0 ELSE 1 END,updated_at,created_at,id LIMIT 1").bind(c.enabled?1:0).first<Job>();
  if(j)await processJob(e,c,j,claim,fetcher,now);
 }finally{await DB.prepare("UPDATE whatsapp_connection SET lease_owner=NULL,lease_until=0,next_run_at=? WHERE id='main' AND lease_owner=?").bind(now+3000,claim).run();}
 return issueCount(DB);
}
export function whatsappSampleText(now=Date.now()){
 const {date,time}=localParts(now),order:WhatsappOrder={date,time,status:'PREPARING',modality:'DELIVERY',timing:'SCHEDULED',displayId:'TESTE',customer:'Cliente de teste',address:'Rua de Exemplo, 123 — Teste',phone:'21999990000',items:[{name:'Salgadinhos',quantity:100,flavors:[{name:'Coxinha',quantity:50},{name:'Bolinha de queijo',quantity:50}],observations:''},{name:'Churros',quantity:50,flavors:[{name:'Doce de leite',quantity:50}],observations:''}],observations:'',totalCents:8500,paid:false};
 return 'TESTE — '+whatsappOrderText(order)+'\n\nPedido fictício. Não realizar entrega.';
}
export async function sendWhatsappSample(e:WhatsappEnv,a:HouseActor,input:any,fetcher:typeof fetch=fetch,now=Date.now()){
 owner(a);if(!uuid(input.requestId))throw new HouseError('Envio inválido.',400);
 if(!await connection(e))throw new HouseError('Conecte a Meta primeiro.',400);
 const recipients=await requireRecipients(e,now),requested=input.recipientPhone?normalizeRecipientPhone(input.recipientPhone):recipients.length===1?recipients[0].phone:null,recipient=recipients.find(r=>r.phone===requested);
 if(!recipient)throw new HouseError('Selecione o entregador para o teste.',400);
 const id='sample:'+input.requestId,t=stamp(now),DB=database(e);
 const previous=await DB.prepare('SELECT recipient_phone FROM house_whatsapp_jobs WHERE id=?').bind(id).first<{recipient_phone:string}>();
 if(previous&&previous.recipient_phone!==recipient.phone)throw new HouseError('Este teste já foi enviado para outro destinatário.',400);
 await DB.prepare("INSERT OR IGNORE INTO house_whatsapp_jobs(id,revision,order_status,state,body,recipient_phone,recipient_name,recipient_since,created_at,updated_at) VALUES (?,0,'SAMPLE','QUEUED',?,?,?,?,?,?)").bind(id,whatsappSampleText(now),recipient.phone,recipient.name,recipient.startsAt,t,t).run();
 await whatsappTick(e,fetcher,now,id);return whatsappStatus(e,a);
}
export async function resolveWhatsappJob(e:WhatsappEnv,a:HouseActor,input:any,now=Date.now(),fetcher:typeof fetch=fetch){
 owner(a);if(typeof input.id!=='string'||input.id.length>120||!['retry','received'].includes(input.action))throw new HouseError('Aviso inválido.',400);
 const DB=database(e),j=await DB.prepare('SELECT * FROM house_whatsapp_jobs WHERE id=?').bind(input.id).first<Job>();
 if(!j||!['BLOCKED','REVIEW'].includes(j.state))throw new HouseError('Este aviso mudou. Atualize a configuração.');
 if(!await DB.prepare('SELECT phone FROM whatsapp_recipients WHERE phone=? AND active=1 AND starts_at=?').bind(j.recipient_phone,j.recipient_since).first())throw new HouseError('Este entregador foi removido da lista.');
 if(input.action==='received'&&j.state!=='REVIEW')throw new HouseError('Confirmação inválida.',400);
 if(j.order_id){const o=await getHouseOrder(DB,j.order_id);if(o.revision!==j.revision||o.status!==j.order_status||o.status==='FINISHED')throw new HouseError('O pedido mudou. O sistema usará os dados atuais.');}
 const received=input.action==='received',nextPart=(j.sent_parts||0)+(received?1:0),total=Math.max(1,j.total_parts||0);
 await DB.prepare("UPDATE house_whatsapp_jobs SET state=?,sent_parts=?,manual_parts=manual_parts+?,error=NULL,updated_at=? WHERE id=? AND state=?").bind(received&&nextPart>=total?'SENT':'QUEUED',nextPart,received?1:0,stamp(now),j.id,j.state).run();
 if(!j.order_id&&input.action==='retry')await whatsappTick(e,fetcher,now,j.id);
 return whatsappStatus(e,a);
}
