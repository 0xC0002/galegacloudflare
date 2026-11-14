import {HouseError,houseKitchenOrder,localParts,type HouseActor,type HousePrintJob} from './house-state.ts';
import {getHouseOrder,releaseHouseDueOrders} from './house.ts';
import {requireHouseRole} from './house-auth.ts';
import {uuid} from './negotiation-state.ts';
type Row=Record<string,any>;
const stamp=()=>new Date().toISOString(),allowed=['admin','manager','attendant','production'] as const;
async function job(DB:D1Database,id:string){if(typeof id!=='string'||id.length>180)throw new HouseError('Impressão inválida.',400);const r=await DB.prepare('SELECT * FROM house_print_jobs WHERE id=?').bind(id).first<Row>();if(!r)throw new HouseError('Comanda não encontrada.',404);return r;}
function canIssue(o:{revision:number;status:string;date?:string},p:Row){if(p.id?.startsWith('day:')&&(o.date!==localParts().date||!['SCHEDULED','PREPARING'].includes(o.status)||p.id.split(':')[1]!==o.date))return false;return o.revision===p.revision&&(p.kind==='CANCEL'?o.status==='CANCELLED':['CONTROL','REPRINT'].includes(p.kind)?true:p.kind==='UPDATE'?!['FINISHED','CANCELLED'].includes(o.status):o.status==='PREPARING');}
export async function claimHousePrint(DB:D1Database,a:HouseActor,id:string){requireHouseRole(a,allowed);if(!a.stationId)throw new HouseError('Identifique este aparelho antes de imprimir.');await releaseHouseDueOrders(DB);const p=await job(DB,id),o=await getHouseOrder(DB,p.order_id);if(!canIssue(o,p)){await DB.prepare("UPDATE house_print_jobs SET state='VOID',updated_at=? WHERE id=? AND state IN ('QUEUED','LEASED')").bind(stamp(),id).run();throw new HouseError('O pedido foi alterado ou encerrado. Atualize antes de imprimir.');}const token=crypto.randomUUID(),now=Date.now(),r=await DB.prepare("UPDATE house_print_jobs SET state='LEASED',claim_token=?,station_id=?,lease_until=?,updated_at=? WHERE id=? AND state='QUEUED'").bind(token,a.stationId,now+60000,stamp(),id).run();if(!r.meta.changes)throw new HouseError(p.state==='SENT'?'Esta comanda já foi enviada. Use Reimprimir.':p.state==='REVIEW'?'Confira a saída antes de reimprimir.':'Esta comanda está em outro aparelho.');return{jobId:id,token,kind:p.kind as HousePrintJob['kind'],order:houseKitchenOrder(o,p.kind,p.id.startsWith('day:'))};}
export async function requestHousePrint(DB:D1Database,a:HouseActor,i:any){
 requireHouseRole(a,allowed);
 if(!uuid(i.orderId)||!uuid(i.requestId)||typeof i.reprint!=='boolean')throw new HouseError('Impressão inválida.',400);
 await releaseHouseDueOrders(DB);
 const o=await getHouseOrder(DB,i.orderId);
 if(a.role==='production'&&!['PREPARING','FINISHED','CANCELLED'].includes(o.status))throw new HouseError('A separação imprime os pedidos em preparo ou do histórico.',403);
 // A tap explicitly requests one copy. Reuse an unsent job instead of racing
 // the automatic queue and issuing a second copy of the same receipt.
 const p=await DB.prepare("SELECT * FROM house_print_jobs WHERE order_id=? AND revision=? AND id NOT LIKE 'day:%' AND state<>'VOID' ORDER BY CASE WHEN state='SENT' THEN 1 ELSE 0 END,created_at DESC,rowid DESC LIMIT 1").bind(o.id,o.revision).first<Row>();
 if(p&&p.state!=='SENT'){
  if(p.state==='REVIEW')throw new HouseError('Confira esta comanda em Impressões a conferir.');
  if(p.state==='LEASED'&&p.station_id===a.stationId&&p.lease_until>Date.now())return{jobId:p.id,token:p.claim_token,kind:p.kind as HousePrintJob['kind'],order:houseKitchenOrder(o,p.kind,p.id.startsWith('day:'))};
  if(p.state==='SENDING')throw new HouseError('Esta comanda está sendo enviada. Aguarde e confira a saída.');
  return claimHousePrint(DB,a,p.id);
 }
 if((p||['FINISHED','CANCELLED'].includes(o.status))&&!i.reprint)return{requiresReprint:true};
 const kind=o.status==='SCHEDULED'?'CONTROL':i.reprint&&p?'REPRINT':o.status==='CANCELLED'?'CANCEL':o.status==='FINISHED'?'REPRINT':'PRODUCTION',id=`manual:${i.requestId}`;
 const old=await DB.prepare('SELECT * FROM house_print_jobs WHERE id=?').bind(id).first<Row>();
 if(old){
  if(old.order_id!==o.id||old.revision!==o.revision)throw new HouseError('Este envio já foi utilizado.');
  if(old.state==='SENT')return{alreadySent:true};
  if(old.state==='LEASED'&&old.station_id===a.stationId&&old.lease_until>Date.now())return{jobId:id,token:old.claim_token,kind:old.kind as HousePrintJob['kind'],order:houseKitchenOrder(o,old.kind)};
 }
 await DB.prepare("INSERT OR IGNORE INTO house_print_jobs(id,order_id,revision,kind,state,created_at,updated_at) VALUES (?,?,?,?,'QUEUED',?,?)").bind(id,o.id,o.revision,kind,stamp(),stamp()).run();
 return claimHousePrint(DB,a,id);
}
async function held(DB:D1Database,a:HouseActor,i:any){requireHouseRole(a,allowed);if(!uuid(i.token)||!a.stationId)throw new HouseError('Identificação de impressão inválida.',400);const p=await job(DB,i.jobId);if(p.claim_token!==i.token||p.station_id!==a.stationId)throw new HouseError('A impressão não pertence a este aparelho.',403);return p;}
export async function beginHousePrint(DB:D1Database,a:HouseActor,i:any){const p=await held(DB,a,i),o=await getHouseOrder(DB,p.order_id);if(!canIssue(o,p)){await DB.prepare("UPDATE house_print_jobs SET state='VOID',updated_at=? WHERE id=? AND state='LEASED' AND claim_token=?").bind(stamp(),p.id,i.token).run();throw new HouseError('O pedido mudou. A comanda anterior foi retirada da fila.');}const r=await DB.prepare("UPDATE house_print_jobs SET state='SENDING',lease_until=?,updated_at=? WHERE id=? AND state='LEASED' AND claim_token=? AND station_id=? AND lease_until>?").bind(Date.now()+120000,stamp(),p.id,i.token,a.stationId,Date.now()).run();if(!r.meta.changes)throw new HouseError('O envio expirou ou já começou. Confira a fila.');return{order:houseKitchenOrder(o,p.kind,p.id.startsWith('day:'))};}
export async function finishHousePrint(DB:D1Database,a:HouseActor,i:any){const p=await held(DB,a,i);if(!['driver','submitted','review','not-sent','manual-confirmed'].includes(i.result))throw new HouseError('Resultado inválido.',400);if(p.state==='SENT')return{ok:true};if(!['LEASED','SENDING','REVIEW'].includes(p.state))throw new HouseError('A impressão já foi tratada.');const next=i.result==='not-sent'?(['CONTROL','REPRINT'].includes(p.kind)?'VOID':'QUEUED'):i.result==='review'?'REVIEW':'SENT';await DB.prepare("UPDATE house_print_jobs SET state=?,completion=?,lease_until=0,updated_at=? WHERE id=? AND claim_token=? AND station_id=? AND state IN ('LEASED','SENDING','REVIEW')").bind(next,i.result,stamp(),p.id,i.token,a.stationId).run();return{ok:true};}
export async function resolveHousePrint(DB:D1Database,a:HouseActor,i:any){requireHouseRole(a,['admin','manager','attendant']);if(typeof i.repeat!=='boolean')throw new HouseError('Confirmação inválida.',400);const p=await job(DB,i.jobId);if(p.state!=='REVIEW')throw new HouseError('Esta comanda não está pendente de conferência.');if(i.repeat&&!canIssue(await getHouseOrder(DB,p.order_id),p))throw new HouseError('Esta via ficou desatualizada. Imprima a versão atual pelo pedido.');await DB.prepare("UPDATE house_print_jobs SET state=?,completion=?,claim_token=NULL,station_id=NULL,lease_until=0,updated_at=? WHERE id=? AND state='REVIEW'").bind(i.repeat?'QUEUED':'SENT',i.repeat?null:'manual-confirmed',stamp(),p.id).run();return{ok:true};}

// A freezer copy never claims or consumes the production print job.
export async function requestHouseDayPrint(DB:D1Database,a:HouseActor,i:any){
 requireHouseRole(a,allowed);
 if(!uuid(i.orderId)||!uuid(i.requestId)||!Number.isInteger(i.revision))throw new HouseError('Impressão inválida.',400);
 await releaseHouseDueOrders(DB);
 const o=await getHouseOrder(DB,i.orderId),date=localParts().date;
 if(o.date!==date||!['SCHEDULED','PREPARING'].includes(o.status))throw new HouseError('Este pedido não está mais na lista de hoje. Atualize a lista.');
 if(o.revision!==i.revision)throw new HouseError('Este pedido mudou. Atualize a lista antes de imprimir.');
 const id=`day:${date}:${i.requestId}`,old=await DB.prepare('SELECT * FROM house_print_jobs WHERE id=?').bind(id).first<Row>();
 if(old){
  if(old.order_id!==o.id||old.revision!==o.revision)throw new HouseError('Este envio já foi utilizado.');
  if(old.state==='SENT')return{alreadySent:true};
  if(old.state==='LEASED'&&old.station_id===a.stationId&&old.lease_until>Date.now())return{jobId:id,token:old.claim_token,kind:'CONTROL' as const,order:houseKitchenOrder(o,'CONTROL',true)};
 }
 await DB.prepare("INSERT OR IGNORE INTO house_print_jobs(id,order_id,revision,kind,state,created_at,updated_at) VALUES (?,?,?,'CONTROL','QUEUED',?,?)").bind(id,o.id,o.revision,stamp(),stamp()).run();
 return claimHousePrint(DB,a,id);
}
