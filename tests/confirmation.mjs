import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {actOnOrder,synchronize,snapshot,TEST_MERCHANT} from '../lib/ifood.ts';
import {confirmationQueue,confirmationTime} from '../lib/order-confirmation.ts';
const require=createRequire(import.meta.url),{Miniflare}=createRequire(require.resolve('wrangler/package.json'))('miniflare');
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-15',d1Databases:['DB']});
const DB=await mf.getD1Database('DB'),env={DB,IFOOD_CLIENT_ID:'fixture',IFOOD_CLIENT_SECRET:'fixture-private'};
const now=Date.now(),createdAt=new Date(now-60_000).toISOString(),future=new Date(now+86400_000).toISOString();
const fixtures=[
 {id:'immediate',orderType:'DELIVERY',orderTiming:'IMMEDIATE',delivery:{deliveredBy:'MERCHANT'}},
 {id:'scheduled',orderType:'DELIVERY',orderTiming:'SCHEDULED',preparationStartDateTime:future,delivery:{deliveredBy:'MERCHANT'}},
 {id:'takeout',orderType:'TAKEOUT',orderTiming:'IMMEDIATE'},
 {id:'external',orderType:'DELIVERY',orderTiming:'IMMEDIATE',delivery:{deliveredBy:'IFOOD'}},
].map(o=>({...o,category:'FOOD',isTest:true,merchant:{id:TEST_MERCHANT},createdAt,displayId:o.id,items:[{name:'Coxinha',quantity:10}]}));
const details=new Map(fixtures.map(o=>[o.id,o])),writes=[],acks=[];
const event=(id,code)=>({id:crypto.randomUUID(),orderId:id,merchantId:TEST_MERCHANT,fullCode:code,createdAt:new Date().toISOString()});
let events=fixtures.map(o=>event(o.id,'PLACED'));
const api=async(url,init={})=>{
 const path=new URL(url).pathname;
 if(path==='/authentication/v1.0/oauth/token')return Response.json({accessToken:'fixture-token',expiresIn:3600});
 if(path==='/events/v1.0/events:polling')return events.length?Response.json(events):new Response(null,{status:204});
 if(path==='/events/v1.0/events/acknowledgment'){
  const ids=JSON.parse(init.body).map(e=>e.id);acks.push(...ids);events=events.filter(e=>!ids.includes(e.id));return new Response(null,{status:202});
 }
 const match=path.match(/^\/order\/v1\.0\/orders\/([^/]+)(?:\/(\w+))?$/);assert.ok(match,'Unexpected upstream path');
 const [,id,action]=match;assert.ok(details.has(id));
 if(!action)return Response.json(details.get(id));
 assert.equal(action,'confirm');assert.equal(init.method,'POST');assert.equal(init.body,undefined);
 assert.equal(init.headers.Authorization,'Bearer fixture-token');
 writes.push(id);events.push(event(id,'CONFIRMED'));return new Response(null,{status:202});
};
const poll=async()=>{await DB.prepare('UPDATE integration_state SET next_poll_at=0,lease_until=0').run();return synchronize(env,api);};
const act=id=>actOnOrder(env,id,{action:'confirm',requestId:crypto.randomUUID()},'counter',api);
try{
 for(const file of (await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())for(const sql of (await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8')).split(';').filter(s=>s.trim()))await DB.prepare(sql).run();
 let s=await synchronize(env,api);
 assert.equal(confirmationQueue(s.orders,now).length,4,'every order in one received batch needs explicit or external confirmation');
 assert.deepEqual(writes,[],'receiving/ACK must never accept orders automatically');assert.equal(acks.length,4);
 for(const id of ['immediate','scheduled','takeout']){
  const pending=s.orders.find(o=>o.id===id),timer=confirmationTime(pending,now);
  assert.equal(timer.expired,false);assert.equal(timer.label,'Confirmar em 7:00','scheduled orders use creation time, not the future preparation date');
  const request={action:'confirm',requestId:crypto.randomUUID()};
  s=await actOnOrder(env,id,request,'counter',api);
  const sent=s.orders.find(o=>o.id===id);assert.equal(sent.status,'PLACED');assert.equal(sent.pendingAction.action,'confirm');
  assert.equal(confirmationTime(sent,now),null,'in-flight acceptance is shown as waiting for iFood, not another clickable command');
  await actOnOrder(env,id,request,'counter',api);assert.equal(writes.filter(x=>x===id).length,1);
  s=await poll();const confirmed=s.orders.find(o=>o.id===id);
  assert.equal(confirmed.status,'CONFIRMED');assert.equal(confirmed.pendingAction,null);
  assert.ok(!confirmationQueue(s.orders,now).some(o=>o.id===id),'only the actual confirmation event removes the card from the pending group');
 }
 assert.deepEqual(confirmationQueue(s.orders,now).map(o=>o.id),['external']);
 events.push(event('external','CONFIRMED'));s=await poll();
 assert.equal(confirmationQueue(s.orders,now).length,0);await assert.rejects(act('external'),/etapa/);
 assert.deepEqual(writes,['immediate','scheduled','takeout'],'external automatic acceptance must not be repeated by this app');
 const scheduled=s.orders.find(o=>o.id==='scheduled');
 await assert.rejects(actOnOrder(env,scheduled.id,{action:'finishSeparation',requestId:crypto.randomUUID()},'kitchen',api),/horário/);
 const counts=await DB.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN acknowledged_at IS NOT NULL AND handled=1 THEN 1 ELSE 0 END) AS complete FROM received_events").first();
 assert.equal(counts.total,8);assert.equal(counts.complete,8);assert.equal(acks.length,8);
 console.log('PASS: four-order batch, exact POST /confirm, immediate/scheduled/takeout acceptance, event-only CFM, durable ACK, retries and external acceptance');
 const placed={...s.orders[0],status:'PLACED',cancelled:false,pendingAction:null,createdAt,timing:'IMMEDIATE'};
 const expired=confirmationTime(placed,now+8*60_000);assert.equal(expired.expired,true);assert.equal(placed.status,'PLACED','deadline must never fabricate a cancellation or completion');
 assert.equal(confirmationTime({...placed,createdAt:'bad'},now),null);
 assert.equal(confirmationTime({...placed,status:'CANCELLED',cancelled:true},now),null);
 assert.equal(confirmationQueue([{...placed,createdAt:new Date(now-9*3600_000).toISOString()},placed],now).length,1,'old unreconciled orders remain in the review flow');
 const leaking=JSON.stringify(await snapshot(env));assert.ok(!leaking.includes('fixture-token')&&!leaking.includes('fixture-private'));
 console.log('PASS: server-time deadline, no invented terminal state, no invalid countdown, old-order review and secret isolation');
}finally{await mf.dispose();}
