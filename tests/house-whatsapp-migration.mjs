import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {saveHouseOrder} from '../lib/house.ts';
import {localParts} from '../lib/house-state.ts';
import {encryptWhatsappToken,decryptWhatsappToken,whatsappTick,whatsappStatus} from '../lib/whatsapp.ts';
const require=createRequire(import.meta.url),{Miniflare}=createRequire(require.resolve('wrangler/package.json'))('miniflare');
const mf=new Miniflare({modules:true,script:'export default{fetch(){return new Response("test")}}',compatibilityDate:'2026-05-15',d1Databases:['DB']}),DB=await mf.getD1Database('DB');
const env={DB,WHATSAPP_CONFIG_KEY:'c3'.repeat(32),WHATSAPP_TEST_TO:'5521999990000'},token='fixture-private-token-'.repeat(4),phoneId='123456789012345',now=Date.now();
let oldJob,oldConnection,oldIfood,encrypted;
try{
 for(const f of(await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort()){
  if(f.startsWith('0013_')){
   encrypted=await encryptWhatsappToken(env,token,phoneId);
   await DB.prepare("INSERT INTO whatsapp_connection(id,encrypted_token,phone_id,sender,connected_at,enabled_at,enabled) VALUES ('main',?,?,'Número fictício',?,?,1)").bind(encrypted,phoneId,new Date(now).toISOString(),new Date(now).toISOString()).run();
   await DB.prepare("INSERT INTO house_whatsapp_jobs(id,revision,order_status,state,body,message_id,created_at,updated_at) VALUES ('sample:legacy',0,'SAMPLE','SENT','Teste anterior','wamid.legacy',?,?)").bind(new Date(now).toISOString(),new Date(now).toISOString()).run();
   await DB.prepare("INSERT INTO received_orders(id,display_id,merchant_id,customer,created_at,received_at,updated_at,payload) VALUES ('ifood-fixture','1000','test-merchant','Fictício',?,?,?,'{}')").bind(new Date(now).toISOString(),new Date(now).toISOString(),new Date(now).toISOString()).run();
   oldJob=await DB.prepare("SELECT * FROM house_whatsapp_jobs WHERE id='sample:legacy'").first();oldConnection=await DB.prepare("SELECT * FROM whatsapp_connection WHERE id='main'").first();oldIfood=await DB.prepare("SELECT * FROM received_orders WHERE id='ifood-fixture'").first();
  }
  if(f.startsWith('0015_')){
   const actor={userId:'migration-fixture',key:'migration-fixture',name:'Fixture',role:'manager',realRole:'admin',stationId:'fixture'};
   const when=localParts(),order=await saveHouseOrder(DB,actor,{requestId:crypto.randomUUID(),order:{brand:'GALEGA',customer:'Fictício já notificado',phone:'21999990000',modality:'DELIVERY',timing:'NOW',date:when.date,time:when.time,address:'Rua Fictícia, 1',items:[{name:'Churros',quantity:50,flavors:[{name:'Doce de leite',quantity:50}],observations:''}],observations:'',totalCents:3000,paid:false,leadMinutes:60}});
   await DB.prepare("INSERT INTO house_whatsapp_jobs(id,order_id,revision,order_status,state,body,message_id,sent_parts,total_parts,created_at,updated_at) VALUES (?,?,?,'PREPARING','SENT','Aviso anterior','wamid.before-recipients',1,1,?,?)").bind(order.id+':1:PREPARING',order.id,order.revision,new Date(now).toISOString(),new Date(now).toISOString()).run();
  }
  for(const sql of(await readFile(new URL('../drizzle/'+f,import.meta.url),'utf8')).split(';').filter(s=>s.trim()))await DB.prepare(sql).run();
 }
 const migrated=await DB.prepare("SELECT * FROM house_whatsapp_jobs WHERE id='sample:legacy'").first();
 for(const [k,v] of Object.entries(oldJob))assert.equal(migrated[k],v);assert.equal(migrated.sent_parts,0);assert.equal(migrated.total_parts,0);assert.equal(migrated.manual_parts,0);
 assert.deepEqual(await DB.prepare("SELECT * FROM whatsapp_connection WHERE id='main'").first(),oldConnection);assert.deepEqual(await DB.prepare("SELECT * FROM received_orders WHERE id='ifood-fixture'").first(),oldIfood);assert.equal(await decryptWhatsappToken(env,encrypted,phoneId),token);
 let calls=0;await whatsappTick(env,async()=>{calls++;throw new Error('No outbound request expected');},now);assert.equal(calls,0,'migration never replays already accepted messages');
 const status=await whatsappStatus(env,{realRole:'admin'});assert.equal(status.enabled,true);assert.equal(status.jobs[0].state,'SENT');assert.equal(status.jobs[0].acceptedByMeta,true);assert.ok(!JSON.stringify(status).includes(token));
 const migratedDelivery=await DB.prepare("SELECT COUNT(*) n FROM house_whatsapp_jobs WHERE order_id IS NOT NULL").first();assert.equal(migratedDelivery.n,1,'recipient migration must not create a new job for an already notified Casa delivery');
 console.log('PASS: populated v14 migration preserves encrypted Meta connection, enabled state, accepted-message history and iFood data, plus legacy recipient backfill, with no outgoing request or Casa delivery replay');
}finally{await mf.dispose();}
