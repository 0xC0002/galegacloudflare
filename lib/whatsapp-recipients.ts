import {HouseError,type HouseActor} from './house-state.ts';

export type RecipientEnv={DB?:D1Database;WHATSAPP_TEST_TO?:string};
export type WhatsappRecipient={phone:string;name:string;startsAt:string;createdAt:string};
export const MAX_WHATSAPP_RECIPIENTS=5;
const db=(e:RecipientEnv)=>{if(!e.DB)throw new HouseError('Banco indisponível.',503);return e.DB;};
function operational(a:HouseActor){if(!['admin','manager','attendant','production'].includes(a.realRole))throw new HouseError('Perfil não autorizado.',403);}
export function normalizeRecipientPhone(value:unknown){
 if(typeof value!=='string'||value.length>40||!/^[+\d\s().-]+$/.test(value))throw new HouseError('Informe o celular com DDD.',400);
 const raw=value.replace(/\D/g,''),phone=raw.length===11?'55'+raw:raw;
 if(!/^55[1-9]\d9\d{8}$/.test(phone))throw new HouseError('Informe o celular com DDD e nove dígitos.',400);
 return phone;
}
export function formatRecipientPhone(phone:string){const local=phone.startsWith('55')?phone.slice(2):phone;return`(${local.slice(0,2)}) ${local.slice(2,7)}-${local.slice(7)}`;}

// Bootstrap once from the former private destination. An intentionally empty
// list remains empty. Existing accepted/uncertain jobs retain their target.
export async function ensureWhatsappRecipients(e:RecipientEnv,now=Date.now()){
 const DB=db(e);if(await DB.prepare("SELECT id FROM whatsapp_recipient_config WHERE id='main'").first())return;
 const t=new Date(now).toISOString();let phone:string|null=null;
 try{phone=normalizeRecipientPhone(e.WHATSAPP_TEST_TO);}catch{}
 await DB.batch([
  DB.prepare(`INSERT OR IGNORE INTO whatsapp_recipients(phone,name,active,starts_at,created_at,updated_at)
   SELECT ?,'Meu teste',1,COALESCE((SELECT enabled_at FROM whatsapp_connection WHERE id='main'),?),?,?
   WHERE ? IS NOT NULL AND NOT EXISTS(SELECT 1 FROM whatsapp_recipient_config WHERE id='main')`).bind(phone,t,t,t,phone),
  DB.prepare(`UPDATE house_whatsapp_jobs SET recipient_phone=?,recipient_name='Meu teste',recipient_since=(SELECT starts_at FROM whatsapp_recipients WHERE phone=?)
   WHERE recipient_phone IS NULL AND ? IS NOT NULL AND NOT EXISTS(SELECT 1 FROM whatsapp_recipient_config WHERE id='main')`).bind(phone,phone,phone),
  DB.prepare("INSERT OR IGNORE INTO whatsapp_recipient_config(id,revision,updated_at) VALUES ('main',0,?)").bind(t),
 ]);
}
export async function activeWhatsappRecipients(e:RecipientEnv,now=Date.now()):Promise<WhatsappRecipient[]>{
 await ensureWhatsappRecipients(e,now);
 const rows=await db(e).prepare('SELECT phone,name,starts_at,created_at FROM whatsapp_recipients WHERE active=1 ORDER BY created_at,phone').all<any>();
 return rows.results.map(r=>({phone:r.phone,name:r.name,startsAt:r.starts_at,createdAt:r.created_at}));
}
export async function whatsappRecipientStatus(e:RecipientEnv,a:HouseActor,now=Date.now()){
 operational(a);await ensureWhatsappRecipients(e,now);const DB=db(e);
 const result=await DB.batch([
  DB.prepare("SELECT revision FROM whatsapp_recipient_config WHERE id='main'"),
  DB.prepare('SELECT phone,name FROM whatsapp_recipients WHERE active=1 ORDER BY created_at,phone'),
 ]);
 return{revision:(result[0].results[0] as any).revision,limit:MAX_WHATSAPP_RECIPIENTS,recipients:result[1].results.map((r:any)=>({phone:r.phone,name:r.name,displayPhone:formatRecipientPhone(r.phone)}))};
}
export async function changeWhatsappRecipient(e:RecipientEnv,a:HouseActor,input:any,now=Date.now()){
 operational(a);if(!['add','remove'].includes(input.op)||!Number.isSafeInteger(input.revision)||input.revision<0)throw new HouseError('Atualize a lista de entregadores.',400);
 const phone=normalizeRecipientPhone(input.phone),name=typeof input.name==='string'?input.name.trim():'';
 if(input.op==='add'&&(name.length>60||/[\u0000-\u001f\u007f]/.test(name)||input.consent!==true))throw new HouseError('Confirme a autorização do entregador para receber os pedidos.',400);
 await ensureWhatsappRecipients(e,now);const DB=db(e),t=new Date(now).toISOString(),claim=crypto.randomUUID();
 const config=await DB.prepare("SELECT revision FROM whatsapp_recipient_config WHERE id='main'").first<{revision:number}>();
 if(config?.revision!==input.revision)throw new HouseError('A lista foi atualizada em outro aparelho. Confira e tente novamente.');
 const existing=await DB.prepare('SELECT active FROM whatsapp_recipients WHERE phone=?').bind(phone).first<{active:number}>();
 if(input.op==='add'&&existing?.active)throw new HouseError('Este número já está na lista.',400);
 if(input.op==='remove'&&!existing?.active)throw new HouseError('Este número já foi removido. Atualize a lista.');
 const count=await DB.prepare('SELECT COUNT(*) n FROM whatsapp_recipients WHERE active=1').first<{n:number}>();
 if(input.op==='add'&&(count?.n||0)>=MAX_WHATSAPP_RECIPIENTS)throw new HouseError('O teste permite até cinco destinatários. Remova um antes de adicionar outro.',400);
 const writes:D1PreparedStatement[]=[DB.prepare(`UPDATE whatsapp_recipient_config SET revision=revision+1,change_token=?,updated_at=? WHERE id='main' AND revision=?
  AND NOT EXISTS(SELECT 1 FROM whatsapp_connection WHERE id='main' AND lease_until>?)`).bind(claim,t,input.revision,now)];
 if(input.op==='add')writes.push(DB.prepare(`INSERT INTO whatsapp_recipients(phone,name,active,starts_at,created_at,updated_at)
  SELECT ?,?,1,?,?,? WHERE EXISTS(SELECT 1 FROM whatsapp_recipient_config WHERE change_token=?)
  ON CONFLICT(phone) DO UPDATE SET name=excluded.name,active=1,starts_at=excluded.starts_at,updated_at=excluded.updated_at`).bind(phone,name,t,t,t,claim));
 else writes.push(DB.prepare("UPDATE whatsapp_recipients SET active=0,updated_at=? WHERE phone=? AND EXISTS(SELECT 1 FROM whatsapp_recipient_config WHERE change_token=?)").bind(t,phone,claim));
 // Re-adding starts a new membership; never resume old uncertain/partial jobs.
 writes.push(DB.prepare("UPDATE house_whatsapp_jobs SET state='VOID',updated_at=? WHERE recipient_phone=? AND state IN ('QUEUED','BLOCKED','REVIEW') AND EXISTS(SELECT 1 FROM whatsapp_recipient_config WHERE change_token=?)").bind(t,phone,claim));
 const result=await DB.batch(writes);
 if(!result[0].meta.changes)throw new HouseError('Há um envio ou atualização em andamento. Aguarde e tente novamente.');
 return whatsappRecipientStatus(e,a,now);
}
