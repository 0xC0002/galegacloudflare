import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {snapshot,normalizeOrder,actOnOrder,synchronize,TEST_MERCHANT} from '../lib/ifood.ts';
const require=createRequire(import.meta.url),{Miniflare}=createRequire(require.resolve('wrangler/package.json'))('miniflare');
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-15',d1Databases:['DB']});
const DB=await mf.getD1Database('DB'),env={DB,IFOOD_CLIENT_ID:'local-load-fixture',IFOOD_CLIENT_SECRET:'local-load-private'};
const stamp=new Date().toISOString(),samples=[];
const raw=id=>({id,displayId:id,isTest:true,merchant:{id:TEST_MERCHANT},category:'FOOD',orderType:'DELIVERY',orderTiming:'IMMEDIATE',createdAt:stamp,items:[{name:'100 salgadinhos',quantity:1,options:[{name:'Coxinha',quantity:50},{name:'Queijo',quantity:50}]},{name:'Churros',quantity:20},{name:'Bebida',quantity:1}]});
const active=Array.from({length:120},(_,i)=>'load-active-'+i),closed=Array.from({length:120},(_,i)=>'load-closed-'+i);
const newIds=Array.from({length:10},(_,i)=>'load-new-'+i),events=newIds.flatMap(id=>['PLACED','CONFIRMED'].map(fullCode=>({id:crypto.randomUUID(),orderId:id,merchantId:TEST_MERCHANT,fullCode,createdAt:stamp})));
let inbox=[...events,...events.slice(0,4)],polls=0,detailReads=0,acks=0;
const api=async(url,init={})=>{
 const path=new URL(url).pathname;
 if(path.endsWith('/oauth/token'))return Response.json({accessToken:'local-load-bearer',expiresIn:3600});
 if(path.endsWith('events:polling')){polls++;return inbox.length?Response.json(inbox):new Response(null,{status:204});}
 if(path.endsWith('/acknowledgment')){
  for(const e of JSON.parse(init.body)){assert.ok(await DB.prepare('SELECT id FROM received_events WHERE id=?').bind(e.id).first());acks++;}
  inbox=[];return new Response(null,{status:202});
 }
 const id=path.split('/').at(-1);assert.ok(newIds.includes(id));assert.equal(init.method||'GET','GET','load test must never send business decisions to an API');detailReads++;return Response.json(raw(id));
};
try{
 for(const file of (await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())for(const sql of (await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8')).split(';').filter(s=>s.trim()))await DB.prepare(sql).run();
 for(const ids of [active,closed])for(let offset=0;offset<ids.length;offset+=40){
  const statements=ids.slice(offset,offset+40).flatMap(id=>{
   const order=normalizeOrder(raw(id),stamp,env),event={id:'event-'+id,orderId:id,merchantId:TEST_MERCHANT,fullCode:id.includes('closed')?'CONCLUDED':'CONFIRMED',createdAt:stamp};
   return [DB.prepare('INSERT INTO received_orders (id,display_id,merchant_id,customer,created_at,received_at,updated_at,payload) VALUES (?,?,?,?,?,?,?,?)').bind(id,id,TEST_MERCHANT,'Cliente fictício',stamp,stamp,stamp,JSON.stringify(order)),DB.prepare('INSERT INTO received_events (id,order_id,code,payload,received_at,handled) VALUES (?,?,?,?,?,1)').bind(event.id,id,event.fullCode,JSON.stringify(event),stamp)];
  });await DB.batch(statements);
 }
 await snapshot(env);
 for(let round=0;round<5;round++)await Promise.all([0,1].map(async()=>{
  const start=performance.now(),s=await snapshot(env);samples.push(performance.now()-start);
  assert.equal(s.orders.filter(o=>o.status==='CONFIRMED').length,120);assert.equal(new Set(s.orders.map(o=>o.id)).size,s.orders.length);
 }));
 const selected=active.slice(0,20),actionStart=performance.now();
 for(let offset=0;offset<selected.length;offset+=5)await Promise.all(selected.slice(offset,offset+5).flatMap(id=>[0,1].map(()=>actOnOrder(env,id,{action:'finishSeparation',requestId:crypto.randomUUID()},'local-load',async()=>{throw Error('No iFood calls from separation');}))));
 const actionDurationMs=Math.round(performance.now()-actionStart),marked=await snapshot(env);
 assert.equal(marked.orders.filter(o=>o.kitchenStage==='SEPARATED').length,20);assert.ok(marked.orders.filter(o=>selected.includes(o.id)).every(o=>o.status==='CONFIRMED'));
 for(let round=0;round<3;round++){
  await DB.prepare("INSERT OR IGNORE INTO integration_state (id) VALUES ('ifood')").run();
  await DB.prepare('UPDATE integration_state SET next_poll_at=0,lease_until=0').run();
  await Promise.all([synchronize(env,api),synchronize(env,api)]);
 }
 assert.equal(polls,3,'two screens must share one upstream poll per due interval');assert.equal(detailReads,10);
 const s=await snapshot(env);assert.equal(s.orders.filter(o=>o.status==='CONFIRMED').length,130);assert.equal(s.pendingEvents,0);assert.equal(s.pendingErrors,0);
 const received=await DB.prepare("SELECT COUNT(*) AS n FROM received_events WHERE order_id LIKE 'load-new-%' AND handled=1 AND acknowledged_at IS NOT NULL").first();assert.equal(received.n,20,'duplicate delivery must not duplicate orders or events');
 const sorted=samples.sort((a,b)=>a-b),at=q=>Math.round(sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*q)-1)]);
 const report={checkedAt:new Date().toISOString(),environment:'LOCAL_SIMULATED_API',node:process.version,seed:{activeOrders:120,closedOrders:120},readTest:{clients:2,samples:sorted.length,p50Ms:at(.5),p95Ms:at(.95),maxMs:at(1)},separationTest:{requests:40,distinctOrders:20,maxConcurrency:10,durationMs:actionDurationMs},receptionTest:{pollingRounds:3,callersPerRound:2,actualPolls:polls,orderDetailReads:detailReads,newOrders:10,uniqueEvents:received.n,acknowledgedDeliveries:acks,pendingEvents:s.pendingEvents,pendingErrors:s.pendingErrors},passed:true,limitations:['API simulada; nenhuma chamada ou decisão enviada ao iFood real.','Intervalos liberados apenas no D1 temporário para simular consultas devidas sem aguardar 30 segundos.','Latências locais não representam desempenho nem SLA da hospedagem em produção.']};
 if(process.argv.includes('--record'))await writeFile(new URL('../docs/carga-local-20261029.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}finally{await mf.dispose();}
