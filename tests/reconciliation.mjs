import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {synchronize,snapshot,reconcileOrderStatus,actOnOrder,TEST_MERCHANT} from '../lib/ifood.ts';
import {needsStatusReview,terminal} from '../lib/order-state.ts';
import {orderDateTime} from '../lib/order-time.ts';
const require=createRequire(import.meta.url),{Miniflare}=createRequire(require.resolve('wrangler/package.json'))('miniflare');
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-15',d1Databases:['DB']});
const DB=await mf.getD1Database('DB'),env={DB,IFOOD_CLIENT_ID:'fixture',IFOOD_CLIENT_SECRET:'private-fixture'};
let events=[],writes=[];
const old=new Date(Date.now()-14*3600_000).toISOString();
const api=async(url,init={})=>{
 const path=new URL(url).pathname;
 if(path.endsWith('/oauth/token'))return Response.json({accessToken:'fixture-token',expiresIn:3600});
 if(path.endsWith('events:polling'))return events.length?Response.json(events):new Response(null,{status:204});
 if(path.endsWith('/acknowledgment')){events=[];return new Response(null,{status:202});}
 if((init.method||'GET')!=='GET'){writes.push(path);throw Error('No remote lifecycle writes permitted');}
 const id=path.split('/').at(-1);
 return Response.json({id,displayId:id,isTest:true,category:'FOOD',orderType:'DELIVERY',orderTiming:'IMMEDIATE',merchant:{id:TEST_MERCHANT},createdAt:old,items:[{name:'Coxinha',quantity:10}]});
};
const release=()=>DB.prepare('UPDATE integration_state SET next_poll_at=0,lease_until=0').run();
const get=async id=>(await snapshot(env)).orders.find(o=>o.id===id);
async function emit(id,code,at=old){events=[{id:crypto.randomUUID(),merchantId:TEST_MERCHANT,orderId:id,fullCode:code,createdAt:at}];await release();return synchronize(env,api);}
async function pending(id){await DB.prepare("INSERT INTO order_actions (id,order_id,action,status,actor,requested_at,updated_at) VALUES (?,?,'startPreparation','ACCEPTED','fixture',?,?)").bind(crypto.randomUUID(),id,new Date().toISOString(),new Date().toISOString()).run();}
try{
 for(const f of (await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())for(const sql of (await readFile(new URL('../drizzle/'+f,import.meta.url),'utf8')).split(';').filter(s=>s.trim()))await DB.prepare(sql).run();
 await emit('recoverable','CONFIRMED');await pending('recoverable');
 // CON occurred before a command sent from the stale screen on the next morning.
 await emit('recoverable','CONCLUDED',new Date(Date.now()-10*3600_000).toISOString());
 let o=await get('recoverable');assert.equal(o.status,'CONCLUDED');assert.equal(o.pendingAction,null);
 assert.equal((await DB.prepare("SELECT status FROM order_actions WHERE order_id='recoverable'").first()).status,'SUPERSEDED');
 await emit('recoverable','CONFIRMED');assert.equal((await get('recoverable')).status,'CONCLUDED');
 console.log('PASS: recovered terminal event clears even newer stale commands and old confirmation cannot resurrect the order');

 await emit('expired','CONFIRMED');await pending('expired');await release();await synchronize(env,api);
 o=await get('expired');assert.equal(o.status,'CONFIRMED');assert.equal(needsStatusReview(o),true);assert.equal(terminal(o),false,'age alone never concludes an order');
 await assert.rejects(actOnOrder(env,'expired',{action:'finishSeparation',requestId:crypto.randomUUID()},'fixture',api),/Confira o status/);
 const input={status:'CONCLUDED',requestId:crypto.randomUUID()};
 await reconcileOrderStatus(env,'expired',input,'fixture-owner');o=await get('expired');
 assert.equal(o.status,'CONCLUDED');assert.equal(o.pendingAction,null);assert.equal(o.statusReview.status,'CONCLUDED');assert.equal(needsStatusReview(o),false);
 assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM received_events WHERE order_id='expired' AND code='CONCLUDED'").first()).n,0,'manual observations never fabricate iFood events');
 assert.equal((await DB.prepare("SELECT status FROM order_actions WHERE order_id='expired'").first()).status,'RECONCILED');
 const review=await DB.prepare("SELECT * FROM order_status_reviews WHERE order_id='expired'").first();assert.equal(review.actor,'fixture-owner');
 await reconcileOrderStatus(env,'expired',input,'fixture-owner');
 assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM order_status_reviews WHERE order_id='expired'").first()).n,1);
 await assert.rejects(reconcileOrderStatus(env,'expired',{status:'CANCELLED',requestId:crypto.randomUUID()}),/outro resultado/);
 await emit('expired','CANCELLED',new Date().toISOString());o=await get('expired');assert.equal(o.status,'CANCELLED');assert.equal(o.statusReview,undefined,'a subsequent actual cancellation takes precedence');
 console.log('PASS: expired event recovery requires explicit confirmation, durable audit, idempotency and no remote command or invented ACK/event');

 await emit('other','CONFIRMED');await assert.rejects(reconcileOrderStatus(env,'other',input),/outro resultado/);
 await assert.rejects(reconcileOrderStatus(env,'other',{status:'DISPATCHED',requestId:crypto.randomUUID()}),/status final/);
 await assert.rejects(reconcileOrderStatus(env,'missing',{status:'CONCLUDED',requestId:crypto.randomUUID()}),/não encontrado/);
 await assert.rejects(reconcileOrderStatus({...env,IFOOD_MERCHANT_ID:crypto.randomUUID()},'other',{status:'CONCLUDED',requestId:crypto.randomUUID()}),/loja de teste/);
 const now=new Date().toISOString(),future=new Date(Date.now()+24*3600_000).toISOString();
 await DB.prepare("UPDATE received_orders SET payload=json_set(payload,'$.createdAt',?,'$.preparationStart',?,'$.timing','SCHEDULED') WHERE id='other'").bind(now,future).run();
 await assert.rejects(reconcileOrderStatus(env,'other',{status:'CONCLUDED',requestId:crypto.randomUUID()}),/atualização normal/);
 assert.equal(needsStatusReview(await get('other')),false,'future scheduled order remains available and is not treated as expired');
 assert.deepEqual(writes,[]);
 assert.match(orderDateTime('2026-10-29T01:30:00Z'),/28\/10.*22:30/);assert.equal(orderDateTime('bad'),'Horário a verificar');
 console.log('PASS: store/request validation, future schedules, unknown status guards and São Paulo date/time across midnight');
}finally{await mf.dispose();}
