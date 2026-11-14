import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile,readdir } from 'node:fs/promises';
import { backgroundTick } from '../lib/background-receiver.ts';
import { receiverHealth } from '../lib/receiver-health.ts';
import { snapshot,TEST_MERCHANT } from '../lib/ifood.ts';
import { receiverConfig,receiverStep,runReceiver } from '../services/receiver/receiver.mjs';
const require=createRequire(import.meta.url),{Miniflare}=createRequire(require.resolve('wrangler/package.json'))('miniflare');
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-15',d1Databases:['DB']});
const DB=await mf.getD1Database('DB'),env={DB,IFOOD_CLIENT_ID:'background-fixture',IFOOD_CLIENT_SECRET:'background-private-fixture'};
let events=[],polls=0,failed=false;
const calls=[],orderId='11111111-1111-4111-8111-333333333333';
const api=async(url,init={})=>{
 const path=new URL(url).pathname;calls.push(path);
 if(path.endsWith('/oauth/token'))return Response.json({accessToken:'background-token-fixture',expiresIn:3600});
 if(path.endsWith('events:polling')){polls++;return failed?new Response(null,{status:503}):events.length?Response.json(events):new Response(null,{status:204});}
 if(path.endsWith('/acknowledgment')){for(const x of JSON.parse(init.body))assert.ok(await DB.prepare('SELECT id FROM received_events WHERE id=?').bind(x.id).first());return new Response(null,{status:202});}
 if(path.endsWith('/'+orderId))return Response.json({id:orderId,isTest:true,category:'FOOD',merchant:{id:TEST_MERCHANT},items:[{name:'Churros',quantity:10,observations:'Separar chocolate e doce de leite.'}]});
 throw new Error('Unexpected operation '+path);
};
const realClock=Date.now,base=Date.now();
try{
 for(const file of (await readdir(new URL('../drizzle/',import.meta.url))).filter(x=>x.endsWith('.sql')).sort())for(const sql of (await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8')).split(';').filter(s=>s.trim()))await DB.prepare(sql).run();
 assert.equal((await receiverHealth(env)).active,false);
 events=[{id:crypto.randomUUID(),merchantId:TEST_MERCHANT,orderId,fullCode:'PLACED'}];
 let result=await backgroundTick(env,api);assert.equal(result.ok,true);assert.equal(result.receiver.active,true);assert.ok(!JSON.stringify(result).includes('Churros'));assert.ok(!JSON.stringify(result).includes('private-fixture'));
 assert.equal((await snapshot(env)).orders.length,1);await backgroundTick(env,api);assert.equal(polls,1,'parallel or early server ticks do not poll iFood early');
 await DB.prepare("UPDATE integration_state SET last_success_at=?,lease_until=?,next_poll_at=?").bind(new Date(base-3600_000).toISOString(),base+150_000,base+30_000).run();
 result=await backgroundTick(env,api);assert.equal(result.ok,false,'a stale polling timestamp during another lease must not be reported as a successful background poll');assert.equal(result.receiver.active,false);assert.equal(polls,1);
 await DB.prepare('UPDATE integration_state SET lease_until=0').run();
 Date.now=()=>base+31_000;events=[];await backgroundTick(env,api);assert.equal(polls,2);assert.equal((await receiverHealth(env)).completedRuns,4);
 Date.now=()=>base+62_000;failed=true;result=await backgroundTick(env,api);assert.equal(result.ok,false);assert.equal(result.receiver.active,false);assert.ok(result.receiver.lastError);
 Date.now=()=>base+200_000;assert.equal((await receiverHealth(env)).active,false,'an old heartbeat cannot claim the receiver is running');
 assert.ok(calls.every(p=>!/(confirm|startPreparation|readyToPickup|dispatch|requestCancellation)$/.test(p)));
 console.log('PASS: independent server ticks persist events before ACK, respect the shared polling interval, report outages and stale heartbeats, and never change order lifecycle');
 Date.now=realClock;
 const config=receiverConfig({GALEGA_SITE_URL:'https://fixture.chatgpt.site',GALEGA_SITE_SERVICE_TOKEN:'service-fixture-secret'});
 for(const url of ['http://example.com','https://name:pass@example.com','https://example.com/path','https://example.com/?secret=1'])assert.throws(()=>receiverConfig({GALEGA_SITE_URL:url,GALEGA_SITE_SERVICE_TOKEN:'fixture'}));
 assert.throws(()=>receiverConfig({GALEGA_SITE_URL:'https://example.com'}));
 const logs=[],starts=[],controller=new AbortController();let clock=0,count=0;
 const service=async(url,init)=>{
  assert.equal(url,'https://fixture.chatgpt.site/api/receiver/tick');assert.equal(init.redirect,'error');assert.equal(init.headers['OAI-Sites-Authorization'],'Bearer service-fixture-secret');
  starts.push(clock);count++;
  return count===2?new Response(null,{status:503}):Response.json({ok:true,environment:'TEST',serverNow:clock,nextPollAt:clock+30_000,lastSuccessfulPollingAt:new Date(clock).toISOString(),receiver:{active:true},pendingEvents:0,pendingErrors:0,customer:'MUST-NOT-BE-LOGGED'});
 };
 await runReceiver(config,{signal:controller.signal,fetcher:service,now:()=>clock,log:x=>logs.push(x),sleep:async delay=>{assert.ok(delay>=30_000);clock+=delay;if(count===3)controller.abort();}});
 assert.equal(starts.length,3);assert.ok(starts.slice(1).every((at,i)=>at-starts[i]>=30_000));assert.equal(logs[1].event,'receiver_unavailable');assert.equal(logs[2].event,'polling_ok');
 assert.ok(logs.every(row=>Number.isFinite(row.durationMs)&&row.durationMs>=0&&row.nextAttemptInMs>=30_000));
 assert.equal(logs[1].level,'warn');assert.equal(logs[1].consecutiveFailures,1);assert.equal(logs[2].consecutiveFailures,0);
 assert.ok(!JSON.stringify(logs).includes('service-fixture-secret'));assert.ok(!JSON.stringify(logs).includes('MUST-NOT-BE-LOGGED'));
 assert.equal((await receiverStep(config,async()=>new Response(null,{status:403}))).error,'access_denied');
 const stale={ok:true,environment:'TEST',serverNow:1000_000,nextPollAt:1030_000,lastSuccessfulPollingAt:new Date(0).toISOString(),receiver:{active:true}};
 assert.equal((await receiverStep(config,async()=>Response.json(stale))).error,'polling_stale','HTTP 200 and a new endpoint heartbeat do not prove polling is current');
 console.log('PASS: continuous Node service targets only the private Site, rejects insecure configuration, retries outages, stops cleanly and excludes tokens and orders from logs');
}finally{Date.now=realClock;await mf.dispose();}
