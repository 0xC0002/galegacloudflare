import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import { integrationConfig, TEST_MERCHANT } from '../lib/ifood-config.ts';
import { synchronize, snapshot, actOnOrder, invoiceCustomerDocument, replyToDispute } from '../lib/ifood.ts';
import { receiptText, rawBtUri } from '../lib/receipt.ts';
import { emptyPrintQueue, readPrintQueue } from '../lib/auto-print.ts';
import { KitchenPrinterController } from '../lib/kitchen-printer-controller.ts';

const require=createRequire(import.meta.url),{Miniflare}=createRequire(require.resolve('wrangler/package.json'))('miniflare');
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-15',d1Databases:['DB']});
const DB=await mf.getD1Database('DB');
const galega='a0c511e3-83b1-4054-855e-6835ac15cda5',vovo='2b436d5a-a9ba-4e8c-b8dc-3d812021c126',foreign='99999999-9999-4999-8999-999999999999';
const base={DB,IFOOD_CLIENT_ID:'multistore-client-fixture',IFOOD_CLIENT_SECRET:'multistore-secret-fixture',IFOOD_ENVIRONMENT:'PRODUCTION',IFOOD_PRODUCTION_ENABLED:'true',IFOOD_MERCHANT_ID:galega,IFOOD_ALLOWED_MERCHANT_IDS:galega};
const both={...base,IFOOD_ALLOWED_MERCHANT_IDS:`${galega},${vovo}`},stamp=new Date().toISOString();
const order=(id,merchantId)=>({id,displayId:'1234',isTest:false,category:'FOOD',merchant:{id:merchantId},createdAt:stamp,customer:{name:'Cliente fictício'},items:[{name:'Coxinha',quantity:10},{name:'Churros',quantity:2},{name:'Refrigerante',quantity:1}],observations:'Bebida em outro volume',orderTiming:'IMMEDIATE',orderType:'TAKEOUT'});
const event=(orderId,merchantId,fullCode='PLACED',metadata)=>({id:crypto.randomUUID(),orderId,merchantId,fullCode,createdAt:stamp,...(metadata?{metadata}:{})});
const streams=new Map([[galega,[]],[vovo,[]]]),details=new Map(),failPolling=new Set();
const polls=[],writes=[],acks=[];let auth=0;
const api=async(url,init={})=>{
 const path=new URL(url).pathname;
 if(path.endsWith('/oauth/token')){auth++;return Response.json({accessToken:'multistore-token-fixture',expiresIn:3600});}
 if(path.endsWith('events:polling')){
  const merchant=init.headers['x-polling-merchants'];polls.push(merchant);
  assert.ok([galega,vovo].includes(merchant),'only explicitly configured stores are polled');
  if(failPolling.has(merchant))return new Response(null,{status:403});
  const events=streams.get(merchant);return events.length?Response.json(events):new Response(null,{status:204});
 }
 if(path.endsWith('/acknowledgment')){
  const ids=JSON.parse(init.body).map(e=>e.id);
  for(const id of ids)assert.ok(await DB.prepare('SELECT id FROM received_events WHERE id=?').bind(id).first(),'persist before ACK');
  acks.push(...ids);for(const [id,events] of streams)streams.set(id,events.filter(e=>!ids.includes(e.id)));
  return new Response(null,{status:202});
 }
 if(/\/orders\/[^/]+$/.test(path))return Response.json(details.get(path.split('/').at(-1)));
 writes.push({path,body:init.body});return new Response(null,{status:202});
};
const release=()=>DB.prepare("UPDATE integration_state SET next_poll_at=0,lease_until=0 WHERE id='ifood'").run();
const add=(id,merchant,code='PLACED')=>{details.set(id,order(id,merchant));streams.get(merchant).push(event(id,merchant,code));};
try {
 for(const file of (await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())for(const sql of (await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8')).split(';').filter(x=>x.trim()))await DB.prepare(sql).run();
 assert.deepEqual(integrationConfig(both).merchantIds,[galega,vovo]);
 for(const list of ['',vovo,`${galega},invalid`,`${galega},${TEST_MERCHANT}`])assert.throws(()=>integrationConfig({...both,IFOOD_ALLOWED_MERCHANT_IDS:list}));
 add('old-galega',galega,'CONFIRMED');let s=await synchronize(base,api);assert.equal(auth,1);
 // Existing v4 payloads lacked store fields; project them without clearing history.
 const old={...s.orders[0]};delete old.merchantId;delete old.merchantName;
 await DB.prepare('UPDATE received_orders SET payload=? WHERE id=?').bind(JSON.stringify(old),old.id).run();
 s=await snapshot(both);assert.equal(s.orders[0].merchantName,'Salgados da Galega');
 let persisted=JSON.stringify({...emptyPrintQueue(),enabled:true,initialized:true,seen:[old.id],completion:'driver'}),printerBusy=false,maxBusy=0;
 const sent=[],key=`galega-auto-print-v1:PRODUCTION:${galega}`;
 const printer=new KitchenPrinterController({key,storage:{getItem:()=>persisted,setItem:(k,v)=>{assert.equal(k,key);persisted=v;}},onChange:()=>{},lock:async(signal,_wait,work)=>{assert.equal(printerBusy,false);printerBusy=true;try{await work();return true;}finally{printerBusy=false;}},transport:{createSocket:()=>{
  const socket={onopen:null,onmessage:null,onerror:null,onclose:null,close(){},send(text){maxBusy=Math.max(maxBusy,sent.filter(x=>!x.done).length+1);const job=JSON.parse(text),entry={job,done:false};sent.push(entry);queueMicrotask(()=>{entry.done=true;this.onmessage?.({data:JSON.stringify({jobId:job.idJob,responseType:'success'})});});}};
  queueMicrotask(()=>socket.onopen?.({}));return socket;
 }}});
 printer.update(s.orders,true);await printer.tick();assert.equal(sent.length,0,'old printer ledger and history remain intact');
 add('new-galega',galega,'CONFIRMED');add('new-vovo',vovo,'CONFIRMED');
 await release();s=await synchronize(both,api);
 assert.equal(auth,2,'adding the authorized store renews the token once');assert.deepEqual(polls.slice(-2),[galega,vovo]);
 assert.equal(s.lastError,null);assert.equal(s.pendingEvents,0);assert.equal(s.orders.length,3);
 const g=s.orders.find(o=>o.id==='new-galega'),v=s.orders.find(o=>o.id==='new-vovo');
 assert.equal(g.displayId,v.displayId);assert.equal(g.merchantName,'Salgados da Galega');assert.equal(v.merchantName,'Salgados da Vovó');
 assert.equal((await DB.prepare('SELECT merchant_id FROM received_orders WHERE id=?').bind(v.id).first()).merchant_id,vovo);
 assert.match(receiptText(g),/^SALGADOS DA GALEGA/);assert.match(receiptText(v),/^SALGADOS DA VOVO/);
 for(const o of [g,v]){assert.ok(receiptText(o).split('\n').every(x=>x.length<=32));assert.match(receiptText(o),/Bebida em outro volume/);}
 printer.update(s.orders,true);await Promise.all([printer.tick(),printer.tick()]);await printer.tick();await printer.tick();
 assert.equal(sent.length,2);assert.equal(maxBusy,1,'simultaneous store arrivals share one serial printer');
 const receipts=sent.map(x=>x.job.commands[0].base64).sort();assert.deepEqual(receipts,[g,v].map(o=>rawBtUri(o).slice('rawbt:base64,'.length)).sort());
 assert.equal(readPrintQueue(persisted).enabled,true,'adding Vovó does not reset printer activation');
 await release();await synchronize({...both,IFOOD_ALLOWED_MERCHANT_IDS:`${vovo},${galega}`},api);assert.equal(auth,2,'reordering the same stores must reuse the token');
 await actOnOrder(both,v.id,{action:'finishSeparation',requestId:crypto.randomUUID()},'fixture',api);
 s=await snapshot(both);assert.equal(s.orders.find(o=>o.id===v.id).kitchenStage,'SEPARATED');assert.equal(s.orders.find(o=>o.id===g.id).kitchenStage,'WAITING');assert.equal(writes.length,0,'separation never changes the iFood lifecycle');
 streams.get(vovo).push(event(v.id,vovo,'CANCELLED'));await release();s=await synchronize(both,api);
 assert.equal(s.orders.find(o=>o.id===v.id).status,'CANCELLED');assert.equal(s.orders.find(o=>o.id===g.id).status,'CONFIRMED');
 printer.update(s.orders,true);await printer.tick();assert.equal(sent.length,2,'status updates do not print a second copy');printer.dispose();
 console.log('PASS: v4 history/printer activation preserved; both stores received; same display number isolated; 58 mm receipts and real controller send exactly once in one queue');

 failPolling.add(vovo);add('galega-with-vovo-offline',galega,'CONFIRMED');await release();s=await synchronize(both,api);
 assert.ok(s.orders.some(o=>o.id==='galega-with-vovo-offline'));assert.match(s.lastError,/Vovó:.*HTTP 403/);failPolling.clear();
 add('vovo-restored',vovo,'CONFIRMED');await release();s=await synchronize(both,api);assert.equal(s.lastError,null);assert.ok(s.orders.some(o=>o.id==='vovo-restored'));
 console.log('PASS: a store access failure does not interrupt the other store; recovery clears the error');

 const original=details.get(g.id);details.set(g.id,{...original,merchant:{id:vovo}});
 await assert.rejects(actOnOrder(both,g.id,{action:'startPreparation',requestId:crypto.randomUUID()},'fixture',api),/loja retornada/);
 await assert.rejects(invoiceCustomerDocument(both,g.id,api),/loja configurada/);assert.equal(writes.length,0);details.set(g.id,original);
 const bad=event('bad-details',vovo);streams.get(vovo).push(bad);details.set('bad-details',order('bad-details',galega));
 await release();s=await synchronize(both,api);assert.ok(!s.orders.some(o=>o.id==='bad-details'));assert.ok(s.pendingErrors>0);
 await DB.prepare('DELETE FROM received_events WHERE id=?').bind(bad.id).run();
 const wrongStoreConclusion=event(g.id,vovo,'CONCLUDED');streams.get(vovo).push(wrongStoreConclusion);
 await release();s=await synchronize(both,api);assert.equal(s.orders.find(o=>o.id===g.id).status,'CONFIRMED');assert.ok(!acks.includes(wrongStoreConclusion.id));streams.set(vovo,[]);
 const invalid=event('foreign-order',foreign);streams.get(vovo).push(invalid);await release();s=await synchronize(both,api);assert.ok(!acks.includes(invalid.id));assert.match(s.lastError,/Eventos incompatíveis/);streams.set(vovo,[]);
 console.log('PASS: foreign stores and mismatched event/order merchant identities never enter the queue or send lifecycle commands');

 const dispute=crypto.randomUUID();streams.get(vovo).push(event('vovo-restored',vovo,'HANDSHAKE_DISPUTE',{disputeId:dispute,createdAt:stamp,expiresAt:new Date(Date.now()+300_000).toISOString(),action:'CANCELLATION',handshakeType:'AFTER_DELIVERY',handshakeGroup:'CUSTOMER_ORDER_SUPPORT'}));
 await release();s=await synchronize(both,api);assert.equal(s.disputes.find(d=>d.id===dispute).merchantId,vovo);
 await replyToDispute(both,dispute,{requestId:crypto.randomUUID(),action:'reject',reason:'UNKNOWN_ISSUE'},'fixture',api);
 assert.ok(writes.at(-1).path.endsWith(`/disputes/${dispute}/reject`));
 assert.ok(!JSON.stringify(s).includes('multistore-secret-fixture')&&!JSON.stringify(s).includes('multistore-token-fixture'));
 console.log('PASS: Vovó counter negotiations retain their order/store identity and existing response flow; credentials stay server-side');
} finally { await mf.dispose(); }
