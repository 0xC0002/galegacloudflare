import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import { synchronize, snapshot, retryPendingEvents, normalizeOrder, validateIntegration, TEST_MERCHANT } from '../lib/ifood.ts';
const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare } = wranglerRequire('miniflare');
const mf = new Miniflare({ modules:true, script:'export default { fetch() { return new Response("test"); } };', compatibilityDate:'2026-05-15', d1Databases:['DB'] });
const DB = await mf.getD1Database('DB');
for(const file of (await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort()) {
 const migration = await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8');
 for(const sql of migration.split(';').filter(x=>x.trim())) await DB.prepare(sql).run();
}
const env = {DB,IFOOD_CLIENT_ID:'fixture-client',IFOOD_CLIENT_SECRET:'fixture-private-value',IFOOD_MERCHANT_ID:TEST_MERCHANT};
const release=()=>DB.prepare("UPDATE integration_state SET next_poll_at=0,lease_until=0").run();
const event=(id,orderId,fullCode='PLACED')=>({id,orderId,fullCode,merchantId:TEST_MERCHANT});
const order=id=>({id,displayId:'047',isTest:true,merchant:{id:TEST_MERCHANT},customer:{name:'Cliente de teste'},items:[{name:'100 salgados',quantity:1,options:[{name:'Coxinha',quantity:40},{name:'Queijo',quantity:60}]},{name:'Churros',quantity:20,options:[{name:'Chocolate',quantity:10},{name:'Doce de leite',quantity:10}]},{name:'Pão de queijo',quantity:10},{name:'Refrigerante',quantity:2}],extraInfo:'Conferir todos os volumes'});
let events=[],details=new Map(),failDetails=new Set(),failAlways=new Set(),failAck=false;
const counts={auth:0,poll:0,ack:0,details:0};
const paths=[];
const api=async(url,init={})=>{
 const path=new URL(url).pathname;paths.push(path);
 if(path.includes('/oauth/token')){counts.auth++;return Response.json({accessToken:'fixture-bearer',expiresIn:3600});}
 if(path.endsWith('events:polling')){counts.poll++;return events.length?Response.json(events):new Response(null,{status:204});}
 if(path.endsWith('/acknowledgment')){
  counts.ack++;const ids=JSON.parse(init.body).map(x=>x.id);
  for(const id of ids)assert.ok(await DB.prepare('SELECT id FROM received_events WHERE id=?').bind(id).first(),'ACK only after durable persistence');
  if(failAck)return new Response(null,{status:503});
  return new Response(null,{status:202});
 }
 if(path.includes('/orders/')){counts.details++;const id=path.split('/').at(-1);if(failAlways.has(id))return new Response(null,{status:404});if(failDetails.has(id)){failDetails.delete(id);return new Response(null,{status:404});}return Response.json(details.get(id)||order(id));}
 throw new Error('Unexpected operation '+path);
};
try{
 let s=await synchronize({DB},api);assert.equal(s.configured,false);assert.equal(counts.auth,0);
 events=[event('e1','o1'),event('e1','o1')];
 await Promise.all([synchronize(env,api),synchronize(env,api)]);
 s=await snapshot(env);assert.equal(s.orders.length,1);assert.equal(counts.poll,1);assert.equal(counts.details,1);
 assert.deepEqual(s.orders[0].items.map(x=>x.quantity),[1,20,10,2]);assert.equal(s.orders[0].items[0].options[0].quantity,40);
 await release();await synchronize(env,api);assert.equal(counts.auth,1);assert.equal(counts.details,1);assert.equal((await snapshot(env)).orders.length,1);
 assert.ok(!JSON.stringify(s).includes('fixture-private-value'));assert.ok(!JSON.stringify(s).includes('fixture-bearer'));
 console.log('PASS: shared polling, duplicate delivery, token privacy and full item composition');
 events=[event('e2','o2')];failDetails.add('o2');await release();s=await synchronize(env,api);assert.equal(s.pendingEvents,1);
 events=[];const delayedClock=Date.now,delayedNow=Date.now();try{Date.now=()=>delayedNow+30_000;await release();s=await synchronize(env,api);}finally{Date.now=delayedClock;}assert.equal(s.pendingEvents,0);assert.equal(s.orders.length,2);
 console.log('PASS: acknowledged event survives delayed order details and resumes from durable inbox');
 events=[event('e3','o3')];const before=counts.ack;
 const badDB=new Proxy(DB,{get(target,key){if(key==='batch')return async()=>{throw new Error('disk unavailable');};const value=target[key];return typeof value==='function'?value.bind(target):value;}});
 await release();await synchronize({...env,DB:badDB},api);assert.equal(counts.ack,before);
 await release();s=await synchronize(env,api);assert.equal(s.orders.length,3);
 console.log('PASS: persistence failure never acknowledges or loses the event');
 events=[event('ack-failure','ack-order')];failAck=true;await release();s=await synchronize(env,api);
 assert.equal((await DB.prepare("SELECT acknowledged_at FROM received_events WHERE id='ack-failure'").first()).acknowledged_at,null);
 assert.match(s.lastError,/Confirmação de leitura/);failAck=false;await release();s=await synchronize(env,api);
 assert.ok((await DB.prepare("SELECT acknowledged_at FROM received_events WHERE id='ack-failure'").first()).acknowledged_at);
 console.log('PASS: ACK evidence is recorded only after an actual successful acknowledgment response');
 events=[event('e4-can','o4','CANCELLED'),event('e4-plc','o4')];await release();s=await synchronize(env,api);
 assert.equal(s.orders.find(x=>x.id==='o4').cancelled,true,'cancellation must survive out-of-order events');
 events=[event('e5','o5')];details.set('o5',{...order('o5'),isTest:false});await release();s=await synchronize(env,api);assert.ok(!s.orders.some(x=>x.id==='o5'));
 assert.ok(paths.every(x=>!/(confirm|dispatch|readyToPickup|startPreparation|requestCancellation)$/.test(x)));
 console.log('PASS: out-of-order cancellation, test-only guard and no order status changes');
 events=[];const pollCount=counts.poll,clock=Date.now,base=Date.now();
 await DB.prepare("UPDATE integration_state SET next_poll_at=?,lease_until=0").bind(base+30_000).run();
 try {
  Date.now=()=>base+29_999;await Promise.all([synchronize(env,api),synchronize(env,api)]);assert.equal(counts.poll,pollCount,'both screens must honor the 30-second limit');
  Date.now=()=>base+30_000;const due=await synchronize(env,api);assert.equal(counts.poll,pollCount+1,'poll again as soon as the allowed interval elapses');assert.equal(due.serverNow,base+30_000);assert.equal(due.nextPollAt,base+60_000);
 } finally {Date.now=clock;}
 console.log('PASS: no early polling across screens, exact due-time polling and server-clock scheduling');
 const authBefore=counts.auth;
 await DB.prepare("UPDATE integration_state SET token_expires_at=?").bind(Date.now()+30_000).run();await release();await synchronize(env,api);assert.equal(counts.auth,authBefore,'an unexpired token must be reused even in its last minute');
 await DB.prepare("UPDATE integration_state SET token_expires_at=?").bind(Date.now()-1).run();await release();await synchronize(env,api);assert.equal(counts.auth,authBefore+1);
 console.log('PASS: token reuse until expiration and renewal only after expiration');
 const retryClock=Date.now,retryBase=Date.now();failAlways.add('delayed-long');events=[event('long-e','delayed-long')];
 const detailAttempts=()=>paths.filter(path=>path.endsWith('/orders/delayed-long')).length,attemptsBefore=detailAttempts();
 try{
  for(const offset of [0,29_999,30_000,90_000,210_000,330_000,450_000,570_000,600_000,700_000]){
   Date.now=()=>retryBase+offset;await release();await synchronize(env,api);
   if(offset===29_999)assert.equal(detailAttempts(),attemptsBefore+1,'do not retry before the next backoff');
  }
  const pending=await DB.prepare("SELECT attempts,first_attempt_at FROM received_events WHERE id='long-e'").first();assert.equal(pending.attempts,8);assert.equal(detailAttempts(),attemptsBefore+8,'retry window must extend to ten minutes and then stop');
  failAlways.delete('delayed-long');events=[];await release();await retryPendingEvents(env,api);assert.ok((await snapshot(env)).orders.some(o=>o.id==='delayed-long'));
 }finally{Date.now=retryClock;}
 console.log('PASS: delayed detail backoff up to ten minutes, bounded retries and manual recovery without replaying business commands');
 events=[];const technical=await validateIntegration(env,api);
 assert.equal(technical.classification,'VALIDACAO_TECNICA');assert.equal(technical.officialApproval,false);assert.equal(technical.environment,'TEST');
 assert.ok(technical.eventEvidence.find(e=>e.code==='PLACED').acknowledged>0);assert.deepEqual(technical.actionEvidence,[]);assert.deepEqual(technical.negotiationEvidence,[]);
 assert.equal(technical.observed.negotiations,0);assert.ok(technical.orderDetails.some(c=>!c.ok),'missing FOOD metadata is not a successful detail validation');
 assert.ok(!JSON.stringify(technical).includes('fixture-private-value')&&!JSON.stringify(technical).includes('fixture-bearer'));
 assert.ok(paths.every(x=>!/(confirm|dispatch|readyToPickup|startPreparation|requestCancellation)$/.test(x)));
 console.log('PASS: technical report reflects observed API evidence without claiming homologation or sending lifecycle commands');

 const activeIds=Array.from({length:121},(_,i)=>`capacity-active-${i}`),closedIds=Array.from({length:121},(_,i)=>`capacity-closed-${i}`);
 const oldDate=new Date(Date.now()-86400_000).toISOString(),newDate=new Date().toISOString();
 for(const ids of [activeIds,closedIds])for(let offset=0;offset<ids.length;offset+=40){
  await DB.batch(ids.slice(offset,offset+40).map(id=>{const stamp=id.includes('active')?oldDate:newDate,payload=normalizeOrder({...order(id),category:'FOOD'},stamp);return DB.prepare("INSERT INTO received_orders (id,display_id,merchant_id,customer,created_at,received_at,updated_at,payload) VALUES (?,?,?,?,?,?,?,?)").bind(id,id,TEST_MERCHANT,'Cliente fictício',stamp,stamp,stamp,JSON.stringify(payload));}));
 }
 for(let offset=0;offset<closedIds.length;offset+=40)await DB.batch(closedIds.slice(offset,offset+40).map(id=>DB.prepare("INSERT INTO received_events (id,order_id,code,payload,received_at,handled) VALUES (?,?,'CONCLUDED',?,?,1)").bind(`closed-${id}`,id,JSON.stringify({createdAt:newDate}),newDate)));
 const pendingOrder=closedIds[0],disputeId=crypto.randomUUID();
 await DB.prepare("UPDATE received_orders SET received_at=? WHERE id=?").bind(oldDate,pendingOrder).run();
 await DB.prepare("INSERT INTO order_disputes (id,order_id,payload,created_at,expires_at) VALUES (?,?,?,?,?)").bind(disputeId,pendingOrder,JSON.stringify({action:'CANCELLATION',handshakeType:'AFTER_DELIVERY',handshakeGroup:'CUSTOMER_ORDER_SUPPORT'}),newDate,new Date(Date.now()+300_000).toISOString()).run();
 const boundedDB=new Proxy(DB,{get(target,key){if(key==='prepare')return sql=>{const statement=target.prepare(sql);return new Proxy(statement,{get(s,k){if(k==='bind')return(...values)=>{assert.ok(values.length<=100,'D1 bind limit');return s.bind(...values);};const value=s[k];return typeof value==='function'?value.bind(s):value;}});};const value=target[key];return typeof value==='function'?value.bind(target):value;}});
 s=await snapshot({...env,DB:boundedDB});assert.ok(activeIds.every(id=>s.orders.some(o=>o.id===id)),'all active orders survive newer history');
 assert.equal(s.orders.filter(o=>closedIds.includes(o.id)).length,101);assert.ok(s.orders.some(o=>o.id===pendingOrder),'old closed order stays available for its open negotiation');
 console.log('PASS: more than 100 active orders and open negotiation context remain visible with D1-safe query batches');
}finally{await mf.dispose();}
