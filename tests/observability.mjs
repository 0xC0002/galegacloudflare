import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {requestTrace,ifoodOperation} from '../lib/ifood-observability.ts';
import {synchronize,actOnOrder,TEST_MERCHANT} from '../lib/ifood.ts';
const require=createRequire(import.meta.url),{Miniflare}=createRequire(require.resolve('wrangler/package.json'))('miniflare');
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-15',d1Databases:['DB']});
const DB=await mf.getD1Database('DB'),env={DB,IFOOD_CLIENT_ID:'private-client-fixture',IFOOD_CLIENT_SECRET:'private-secret-fixture'};
const logs=[],id='private-order-fixture',bearer='private-bearer-fixture';
let events=[{id:crypto.randomUUID(),merchantId:TEST_MERCHANT,orderId:id,fullCode:'PLACED'}],failure=null;
const realFetch=globalThis.fetch,realInfo=console.info;
const release=()=>DB.prepare('UPDATE integration_state SET lease_until=0,next_poll_at=0').run();
try{
 for(const file of (await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())for(const sql of (await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8')).split(';').filter(s=>s.trim()))await DB.prepare(sql).run();
 console.info=line=>logs.push(JSON.parse(line));
 globalThis.fetch=async(url,init={})=>{
  const parsed=new URL(url);assert.equal(parsed.origin,'https://merchant-api.ifood.com.br');const path=parsed.pathname;
  if(path.endsWith('/oauth/token'))return Response.json({accessToken:bearer,expiresIn:3600});
  if(path.endsWith('events:polling')){
   if(failure==='network')throw new Error('private-network-fixture');
   if(failure==='http')return Response.json({message:'private-upstream-fixture'},{status:503});
   return events.length?Response.json(events):new Response(null,{status:204});
  }
  if(path.endsWith('/acknowledgment')){events=[];return new Response(null,{status:202});}
  if(path.endsWith('/'+id))return Response.json({id,isTest:true,category:'FOOD',orderType:'DELIVERY',merchant:{id:TEST_MERCHANT},createdAt:new Date().toISOString(),customer:{name:'private-customer-fixture'},items:[{name:'private-item-fixture',quantity:1}]});
  if(path.endsWith('/'+id+'/confirm'))return new Response(null,{status:202});
  assert.fail('Unexpected request');
 };
 await synchronize(env);
 const result=await actOnOrder(env,id,{action:'confirm',requestId:crypto.randomUUID()},'fixture');
 assert.equal(result.orders[0].status,'PLACED');assert.equal(result.orders[0].pendingAction.status,'ACCEPTED');
 assert.deepEqual(new Set(logs.map(x=>x.operation)),new Set(['authentication','events.polling','events.acknowledgment','order.details','order.confirm']));
 failure='http';await release();await synchronize(env);assert.ok(logs.some(x=>x.status===503&&x.outcome==='http_error'));
 failure='network';await release();await synchronize(env);assert.ok(logs.some(x=>x.status===null&&x.outcome==='network_error'));
 for(const row of logs){assert.match(row.requestId,/^[0-9a-f-]{36}$/);assert.ok(row.durationMs>=0);assert.ok(['GET','POST'].includes(row.method));}
 assert.equal(new Set(logs.map(x=>x.requestId)).size,logs.length);
 assert.ok(!JSON.stringify(logs).includes('private-'),'no URL, order ID, customer, item, credentials or upstream error can enter telemetry');
 console.info=()=>{throw Error('logger unavailable');};failure=null;await release();const healthy=await synchronize(env);assert.equal(healthy.lastError,null,'logger failure cannot interrupt receiving');
 const lines=[];let clock=10;
 const end=requestTrace('/order/v1.0/orders/private-order-fixture?secret=private-query','POST',{clock:()=>clock,write:x=>lines.push(JSON.parse(x))});clock=60;end(null,'timeout');end(202,'success');
 assert.equal(lines.length,1);assert.equal(lines[0].durationMs,50);assert.equal(lines[0].outcome,'timeout');assert.ok(!JSON.stringify(lines).includes('private-'));
 assert.equal(ifoodOperation('/order/v1.0/disputes/private-id/alternatives/private-alt'),'dispute.alternative');
 assert.equal(ifoodOperation('/unexpected/private-data'),'other');
 console.log('PASS: real request wiring logs controlled operation/status/duration/correlation, preserves 202 semantics and redacts credentials and order data');
 console.log('PASS: HTTP/network/timeout labels, one completion per trace and logger failure isolation');
}finally{globalThis.fetch=realFetch;console.info=realInfo;await mf.dispose();}
