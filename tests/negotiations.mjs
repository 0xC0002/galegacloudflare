import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import { synchronize, snapshot, replyToDispute, saveWidget, disputeEvidence, invoiceCustomerDocument, TEST_MERCHANT } from '../lib/ifood.ts';
import { ingestNegotiations, evidencePath } from '../lib/negotiations.ts';
import { centsFromInput, disputedItemName, disputeOpen } from '../lib/negotiation-state.ts';
import { commercialLines } from '../lib/commercial.ts';
const require=createRequire(import.meta.url),wranglerRequire=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare}=wranglerRequire('miniflare');
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-05-15',d1Databases:['DB']});
const DB=await mf.getD1Database('DB'),env={DB,IFOOD_CLIENT_ID:'fixture-client',IFOOD_CLIENT_SECRET:'fixture-private',IFOOD_MERCHANT_ID:TEST_MERCHANT};
let events=[],mode='success';const writes=[],requests=[],details=new Map();
const id=()=>crypto.randomUUID(),future=()=>new Date(Date.now()+300_000).toISOString();
const order=orderId=>({id:orderId,displayId:'42',isTest:true,category:'FOOD',merchant:{id:TEST_MERCHANT},orderType:'DELIVERY',delivery:{deliveredBy:'IFOOD'},customer:{name:'Cliente de teste'},items:[{id:'item-1',index:0,name:'100 salgadinhos',quantity:1,options:[{name:'Coxinha',quantity:40},{name:'Queijo',quantity:60}]},{name:'Refrigerante',quantity:1}]});
const api=async(url,init={})=>{
 const path=new URL(url).pathname;requests.push({path,redirect:init.redirect});
 if(path.includes('/oauth/token'))return Response.json({accessToken:'fixture-token',expiresIn:3600});
 if(path.endsWith('events:polling'))return events.length?Response.json(events):new Response(null,{status:204});
 if(path.endsWith('/acknowledgment')){for(const e of events)assert.ok(await DB.prepare('SELECT id FROM received_events WHERE id=?').bind(e.id).first());events=[];return new Response(null,{status:202});}
 if(path.includes('/cancellationEvidences/'))return new Response(new Uint8Array([255,216,255]),{headers:{'Content-Type':'image/jpeg'}});
 if(path.includes('/disputes/')){
  assert.equal(init.method,'POST');writes.push({path,body:JSON.parse(init.body)});
  if(mode==='network')throw new Error('network');
  if(mode==='500')return new Response(null,{status:500});
  if(mode==='answered')return Response.json({code:'DISPUTE_ALREADY_ANSWERED'},{status:422});
  if(mode==='invalid')return Response.json({code:'INVALID_REASON'},{status:400});
  return new Response(null,{status:201});
 }
 const found=path.match(/\/orders\/([^/]+)$/);if(found)return Response.json(details.get(found[1])||order(found[1]));
 throw new Error('Unexpected API path '+path);
};
async function emit(orderId,code,metadata={},createdAt=new Date().toISOString()) {
 events.push({id:id(),orderId,merchantId:TEST_MERCHANT,fullCode:code,createdAt,metadata});
 await DB.prepare("UPDATE integration_state SET next_poll_at=0,lease_until=0").run();
 return synchronize(env,api);
}
async function dispute(overrides={},status='CONCLUDED') {
 const orderId=id(),disputeId=id();details.set(orderId,order(orderId));await emit(orderId,status);
 await emit(orderId,'HANDSHAKE_DISPUTE',{disputeId,action:'CANCELLATION',handshakeType:'AFTER_DELIVERY',handshakeGroup:'CUSTOMER_ORDER_SUPPORT',message:'Pedido chegou frio',expiresAt:future(),timeoutAction:'REJECT_CANCELLATION',...overrides});
 return {orderId,disputeId};
}
const get=async disputeId=>(await snapshot(env)).disputes.find(d=>d.id===disputeId);
const reply=(disputeId,action,rest={})=>replyToDispute(env,disputeId,{requestId:id(),action,...rest},'counter-owner',api);
try{
 for(const f of (await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())for(const sql of (await readFile(new URL('../drizzle/'+f,import.meta.url),'utf8')).split(';').filter(s=>s.trim()))await DB.prepare(sql).run();
 await synchronize(env,api);
 const full=await dispute();let d=await get(full.disputeId);assert.equal(d.supported,true);assert.equal(d.message,'Pedido chegou frio');assert.equal(writes.length,0,'receiving a dispute must never send a financial decision');
 const request={requestId:id(),action:'accept'};await replyToDispute(env,full.disputeId,request,'counter',api);assert.equal(writes.length,1);assert.ok(writes[0].path.endsWith('/accept'));
 d=await get(full.disputeId);assert.equal(d.response.status,'SUBMITTED');assert.equal(d.settlement,null,'HTTP success does not fabricate settlement');assert.equal((await snapshot(env)).orders.find(o=>o.id===full.orderId).status,'CONCLUDED','post-delivery dispute must not mutate order status');
 await replyToDispute(env,full.disputeId,request,'counter',api);assert.equal(writes.length,1);
 await assert.rejects(replyToDispute(env,full.disputeId,{...request,action:'reject',reason:'CUSTOMER_REQUEST'},'counter',api),/Identificador/);
 await assert.rejects(reply(full.disputeId,'reject',{reason:'CUSTOMER_REQUEST'}),/respondida/);
 await emit(full.orderId,'HSS',{disputeId:full.disputeId,status:'ACCEPTED'});assert.equal((await get(full.disputeId)).settlement.status,'ACCEPTED');
 console.log('PASS: durable customer request, manual post-delivery reply, one response, idempotency and event-only settlement');

 const late=await dispute({handshakeType:'DELAY',metadata:{acceptCancellationReasons:['STORE_SYSTEM_ISSUES','OTHER_REASONS']}},'CONFIRMED');
 await assert.rejects(reply(late.disputeId,'accept'),/motivo/);await assert.rejects(reply(late.disputeId,'accept',{reason:'FAKE'}),/motivo/);
 await reply(late.disputeId,'accept',{reason:'STORE_SYSTEM_ISSUES',detailReason:'Sistema da loja indisponível'});assert.deepEqual(writes.at(-1).body,{reason:'STORE_SYSTEM_ISSUES',detailReason:'Sistema da loja indisponível'});
 const partial=await dispute({handshakeType:'AFTER_DELIVERY_PARTIALLY',action:'PARTIAL_CANCELLATION',metadata:{items:[{id:'item-1',index:0,quantity:1,amount:{value:'500',currency:'BRL'},reason:'Item faltando'}]}});
 d=await get(partial.disputeId);assert.equal(d.items[0].cents,500);await reply(partial.disputeId,'reject',{reason:'INVENTORY_CHECK'});assert.deepEqual(writes.at(-1).body,{reason:'INVENTORY_CHECK'});
 console.log('PASS: dynamic accept reasons, partial item details and explicit rejection reason');

 const alt=id(),refund=await dispute({alternatives:[{id:alt,type:'REFUND',metadata:{maxAmount:{value:'800',currency:'BRL'}}}]});
 for(const cents of [0,801,1.1,'500',Number.MAX_SAFE_INTEGER+1])await assert.rejects(reply(refund.disputeId,'alternative',{alternativeId:alt,cents}),/valor/);
 await assert.rejects(reply(refund.disputeId,'alternative',{alternativeId:id(),cents:500}),/disponível/);
 await reply(refund.disputeId,'alternative',{alternativeId:alt,cents:549});assert.ok(writes.at(-1).path.endsWith(`/alternatives/${alt}`));assert.deepEqual(writes.at(-1).body,{type:'REFUND',metadata:{amount:{value:'549',currency:'BRL'}}});
 await emit(refund.orderId,'HSS',{disputeId:refund.disputeId,status:'ALTERNATIVE_REPLIED',selectedDisputeAlternative:{id:alt,type:'REFUND',metadata:{amount:{value:'549',currency:'BRL'}}}});
 d=await get(refund.disputeId);assert.equal(d.settlement.status,'ALTERNATIVE_REPLIED');assert.equal(d.settlement.alternative.cents,549);
 await emit(refund.orderId,'HSS',{disputeId:id(),status:'REJECTED'});d=await get(refund.disputeId);assert.equal(d.settlement.status,'ALTERNATIVE_REPLIED');assert.ok(d.relatedSettlements.some(s=>s.status==='REJECTED'),'different dispute IDs must remain distinct and visible');
 assert.equal(centsFromInput('5,49'),549);assert.equal(centsFromInput('5.49'),549);assert.equal(centsFromInput('1,234'),null);assert.equal(centsFromInput('-1'),null);
 console.log('PASS: exact integer-cent refund limit, original alternative ID and proposal distinguished from customer decision');

 const timeId=id(),delay=await dispute({handshakeType:'DELAY',alternatives:[{id:timeId,type:'ADDITIONAL_TIME',metadata:{allowedsAdditionalTimeInMinutes:[10,15,30],allowedsAdditionalTimeReasons:['OPERATIONAL_ISSUES']}}]});
 await assert.rejects(reply(delay.disputeId,'alternative',{alternativeId:timeId,minutes:25,reason:'OPERATIONAL_ISSUES'}),/prazo/);
 await assert.rejects(reply(delay.disputeId,'alternative',{alternativeId:timeId,minutes:30,reason:'FAKE'}),/prazo/);
 await reply(delay.disputeId,'alternative',{alternativeId:timeId,minutes:30,reason:'OPERATIONAL_ISSUES'});assert.deepEqual(writes.at(-1).body,{type:'ADDITIONAL_TIME',metadata:{additionalTimeInMinutes:30,additionalTimeReason:'OPERATIONAL_ISSUES'}});
 console.log('PASS: only iFood-offered extra time and reasons can be sent');

 const expired=await dispute({expiresAt:new Date(Date.now()-1000).toISOString(),timeoutAction:'ACCEPT_CANCELLATION'}),before=writes.length;
 assert.equal(disputeOpen(await get(expired.disputeId)),false);await assert.rejects(reply(expired.disputeId,'accept'),/prazo/);assert.equal(writes.length,before);assert.equal((await snapshot(env)).orders.find(o=>o.id===expired.orderId).status,'CONCLUDED','local expiration must not synthesize a refund or cancellation');
 const race=await dispute();const count=writes.length,result=await Promise.allSettled([reply(race.disputeId,'accept'),reply(race.disputeId,'reject',{reason:'CUSTOMER_REQUEST'})]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(writes.length,count+1);
 for(const failure of ['network','500','answered']){
  const sample=await dispute();mode=failure;await assert.rejects(reply(sample.disputeId,'accept'));mode='success';d=await get(sample.disputeId);assert.equal(d.response.status,failure==='answered'?'ALREADY_ANSWERED':'UNCERTAIN');const count=writes.length;await assert.rejects(reply(sample.disputeId,'accept'),/respondida/);assert.equal(writes.length,count);
  await emit(sample.orderId,'HSS',{disputeId:sample.disputeId,status:'REJECTED'});assert.equal((await get(sample.disputeId)).settlement.status,'REJECTED');
 }
 const refused=await dispute();mode='invalid';await assert.rejects(reply(refused.disputeId,'reject',{reason:'CUSTOMER_REQUEST'}),/motivo/);mode='success';await reply(refused.disputeId,'reject',{reason:'INVENTORY_CHECK'});
 console.log('PASS: deadlines, concurrency, uncertain results and externally answered requests never trigger duplicate decisions');

 const orderId=id(),disputeId=id();await emit(orderId,'HSS',{disputeId,status:'REJECTED'});await emit(orderId,'HSD',{id:disputeId,action:'CANCELLATION',handshakeType:'PREPARATION_TIME',handshakeGroup:'CUSTOMER_ORDER_SUPPORT',message:'Solicitei errado',expiresAt:future(),timeoutAction:'REJECT_CANCELLATION'});assert.equal((await get(disputeId)).settlement.status,'REJECTED');
 const unsafe=await dispute();details.set(unsafe.orderId,{...order(unsafe.orderId),isTest:false});const countBeforeGuard=writes.length;await assert.rejects(reply(unsafe.disputeId,'accept'),/teste/);assert.equal(writes.length,countBeforeGuard);
 const legacy=id();await DB.prepare('INSERT INTO received_events (id,order_id,code,payload,received_at,handled) VALUES (?,?,?,?,?,1)').bind(id(),orderId,'HANDSHAKE_DISPUTE',JSON.stringify({metadata:{id:legacy,action:'CANCELLATION',handshakeType:'PREPARATION_TIME',handshakeGroup:'CUSTOMER_ORDER_SUPPORT',expiresAt:future()}}),new Date().toISOString()).run();await ingestNegotiations(DB);assert.ok(await get(legacy),'upgrade must import previously handled negotiation events');
 console.log('PASS: out-of-order settlement, id/disputeId compatibility, legacy inbox recovery and test-store enforcement');

 const evidence=await dispute({metadata:{evidences:[{url:'https://merchant-api.ifood.com.br/order/v1.0/orders/PLACEHOLDER/cancellationEvidences/photo',contentType:'image/jpeg'}]}});
 const record=await DB.prepare('SELECT payload FROM order_disputes WHERE id=?').bind(evidence.disputeId).first();const payload=JSON.parse(record.payload);payload.metadata.evidences[0].url=payload.metadata.evidences[0].url.replace('PLACEHOLDER',evidence.orderId);await DB.prepare('UPDATE order_disputes SET payload=? WHERE id=?').bind(JSON.stringify(payload),evidence.disputeId).run();
 const image=await disputeEvidence(env,evidence.disputeId,0,api);assert.equal(image.headers.get('Content-Type'),'image/jpeg');assert.ok(image.headers.get('Cache-Control').includes('no-store'));assert.ok(requests.at(-1).redirect==='error');
 assert.ok(!JSON.stringify(await get(evidence.disputeId)).includes('cancellationEvidences'),'private evidence URLs must remain server-side');
 for(const url of ['https://evil.invalid/photo','https://merchant-api.ifood.com.br.evil.invalid/photo','http://merchant-api.ifood.com.br/order/v1.0/orders/x','https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token']){
  payload.metadata.evidences[0].url=url;await DB.prepare('UPDATE order_disputes SET payload=? WHERE id=?').bind(JSON.stringify(payload),evidence.disputeId).run();await assert.rejects(evidencePath(DB,evidence.disputeId,0),/permitido/);
 }
 const widgetId=id();await saveWidget({DB},widgetId);assert.equal((await snapshot(env)).widgetId,widgetId);await assert.rejects(saveWidget({DB},'https://evil.invalid/script.js'),/ID válido/);await saveWidget({DB},null);assert.equal((await snapshot(env)).widgetId,null);
 const fiscal=await dispute();details.set(fiscal.orderId,{...order(fiscal.orderId),customer:{name:'Cliente de teste',documentNumber:'000.000.000-00'}});assert.equal((await invoiceCustomerDocument(env,fiscal.orderId,api)).documentNumber,'00000000000');assert.ok(!JSON.stringify(await snapshot(env)).includes('00000000000'),'fiscal document must not enter shared snapshots or kitchen receipts');
 details.set(fiscal.orderId,{...order(fiscal.orderId),isTest:false});await assert.rejects(invoiceCustomerDocument(env,fiscal.orderId,api),/teste/);
 const paymentLines=commercialLines({total:150,prepaid:50,pending:100,payments:[{amount:50,type:'ONLINE',method:'CREDIT',brand:'VISA',changeFor:null},{amount:100,type:'OFFLINE',method:'CASH',brand:'',changeFor:200}],discounts:[{amount:10,sponsors:[{name:'IFOOD',amount:6},{name:'MERCHANT',amount:4}]}]});assert.ok(paymentLines.some(x=>x.includes('VISA')));assert.ok(paymentLines.some(x=>x.includes('Troco:')&&x.includes('100,00')));assert.ok(paymentLines.some(x=>x.includes('iFood')&&x.includes('6,00')&&x.includes('Loja')&&x.includes('4,00')));
 const combo={items:[{name:'Combo',uniqueId:'combo',index:0,options:[{name:'Refrigerante',index:0,options:[]}]}]};assert.equal(disputedItemName({parentUniqueId:'combo',index:0},combo),'Refrigerante');assert.equal(disputedItemName({parentUniqueId:'missing',index:0},combo),'Item informado pelo iFood');
 assert.ok(!JSON.stringify(await snapshot(env)).includes('fixture-private'));assert.ok(!JSON.stringify(await snapshot(env)).includes('fixture-token'));
 console.log('PASS: authenticated evidence/no redirects, Widget configuration, fiscal-only document access, payment display and sub-item identity');
}finally{await mf.dispose();}
