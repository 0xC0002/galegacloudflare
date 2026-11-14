import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import { actOnOrder, cancellationReasons, cancellationReasonDetails, synchronize, snapshot, TEST_MERCHANT } from '../lib/ifood.ts';
import { primaryAction } from '../lib/order-state.ts';
const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare } = wranglerRequire('miniflare');
const mf = new Miniflare({ modules:true, script:'export default {fetch(){return new Response("test")}}', compatibilityDate:'2026-05-15', d1Databases:['DB'] });
const DB = await mf.getD1Database('DB');
const env = {DB,IFOOD_CLIENT_ID:'fixture-client',IFOOD_CLIENT_SECRET:'fixture-private-value',IFOOD_MERCHANT_ID:TEST_MERCHANT};
const fixture = id => ({id,displayId:id,isTest:true,category:'FOOD',orderType:'DELIVERY',orderTiming:'IMMEDIATE',delivery:{deliveredBy:'MERCHANT'},merchant:{id:TEST_MERCHANT},createdAt:new Date(Date.now()-60000).toISOString(),customer:{name:'Cliente de teste'},items:[{name:'100 salgados',quantity:1,options:[{name:'Coxinha',quantity:40},{name:'Queijo',quantity:60}]},{name:'Churros',quantity:20},{name:'Bebida',quantity:2}]});
const details = new Map(), writes = [], failures = new Map(), reasonFixtures = new Map();
let events = [], reasonCalls = 0;
const api = async (url, init={}) => {
 const path = new URL(url).pathname;
 if(path.includes('/oauth/token')) return Response.json({accessToken:'fixture-bearer',expiresIn:3600});
 if(path.endsWith('events:polling')) return events.length ? Response.json(events) : new Response(null,{status:204});
 if(path.endsWith('/acknowledgment')) { const ids=JSON.parse(init.body).map(e=>e.id);events=events.filter(e=>!ids.includes(e.id));return new Response(null,{status:202}); }
 const match = path.match(/\/orders\/([^/]+)(?:\/(.*))?$/);assert.ok(match,'Unexpected API path '+path);
 const [,id,action] = match;
 if(!action) return details.has(id) ? Response.json(details.get(id)) : new Response(null,{status:404});
 if(action==='cancellationReasons') {reasonCalls++;const fixture=reasonFixtures.get(id);return fixture?.status===204?new Response(null,{status:204}):Response.json(fixture?.body??{reasons:[{code:'fresh-code-93',description:'Motivo disponibilizado pelo iFood'}]});}
 assert.equal(init.method,'POST');const body=init.body&&JSON.parse(init.body);
 if(action==='requestCancellation'&&(!body||typeof body.cancellationCode!=='string'||!body.cancellationCode||typeof body.reason!=='string'||!body.reason))return Response.json({code:'InvalidParameter'},{status:400});
 writes.push({id,action,body});
 if(failures.has(id)) {const failure=failures.get(id);if(failure==='network')throw new Error('network');return Response.json({code:failure.code,message:'do not echo raw upstream data'},{status:failure.status});}
 return new Response(null,{status:202});
};
async function emit(id, code, createdAt=new Date(Date.now()+1000).toISOString()) { events.push({id:crypto.randomUUID(),orderId:id,merchantId:TEST_MERCHANT,fullCode:code,createdAt});await DB.prepare("UPDATE integration_state SET next_poll_at=0,lease_until=0").run();return synchronize(env,api); }
async function add(id, overrides={}, code='PLACED') { details.set(id,{...fixture(id),...overrides});await emit(id,code); }
const get = async id => (await snapshot(env)).orders.find(o=>o.id===id);
const input = (action,reason) => ({action,reason,requestId:crypto.randomUUID()});
const act = (id,action,reason) => actOnOrder(env,id,input(action,reason),'test-owner',api);
try {
 for(const file of (await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort()) {
  const sql=await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8');
  for(const statement of sql.split(';').filter(s=>s.trim())) await DB.prepare(statement).run();
 }
 await add('own-delivery');
 let o=await get('own-delivery');assert.equal(primaryAction(o),'confirm');
 const request=input('confirm');await actOnOrder(env,o.id,request,'test-owner',api);
 o=await get(o.id);assert.equal(o.status,'PLACED');assert.equal(o.pendingAction.action,'confirm','202 must not advance order state');
 await actOnOrder(env,o.id,request,'test-owner',api);assert.equal(writes.filter(w=>w.action==='confirm').length,1,'repeated request ID must not replay command');
 await assert.rejects(act(o.id,'startPreparation'),/aguardando/);
 await emit(o.id,'CFM');o=await get(o.id);assert.equal(o.status,'CONFIRMED');assert.equal(o.pendingAction,null);
 await act(o.id,'startSeparation');await act(o.id,'finishSeparation');o=await get(o.id);assert.equal(o.kitchenStage,'SEPARATED');assert.equal(o.status,'CONFIRMED');assert.equal(writes.length,1,'kitchen marking must not mutate iFood state');
 await act(o.id,'startPreparation');await emit(o.id,'PRS');await act(o.id,'readyToPickup');await emit(o.id,'RTP');
 assert.equal(primaryAction(await get(o.id)),'dispatch');await act(o.id,'dispatch');await emit(o.id,'DSP');assert.equal((await get(o.id)).status,'DISPATCHED');
 await emit(o.id,'CON');o=await get(o.id);assert.equal(o.status,'CONCLUDED');assert.equal(primaryAction(o),null);
 await assert.rejects(act(o.id,'dispatch'),/finalizado/);await assert.rejects(act(o.id,'conclude'),/inválida/);
 assert.ok(!writes.some(w=>w.action==='conclude'));
 console.log('PASS: full own-delivery lifecycle, asynchronous 202, idempotency, internal kitchen stages and event-only conclusion');

 await add('auto-confirmed',{},'CFM');
 o=await get('auto-confirmed');assert.equal(o.status,'CONFIRMED');assert.equal(primaryAction(o),'startPreparation','confirmation from another device must bypass manual acceptance');
 const noNetwork=async()=>{throw new Error('Internal separation must not access iFood');};
 await Promise.all([actOnOrder({DB},o.id,input('finishSeparation'),'kitchen-a',noNetwork),actOnOrder({DB},o.id,input('finishSeparation'),'kitchen-b',noNetwork)]);
 o=await get(o.id);assert.equal(o.kitchenStage,'SEPARATED');assert.equal(o.status,'CONFIRMED');assert.equal(o.pendingAction,null);
 await add('unconfirmed');await assert.rejects(act('unconfirmed','finishSeparation'),/confirmado/);
 console.log('PASS: automatic acceptance from another device and one-tap separation without any external request');

 await add('race');const before=writes.length;
 const race=await Promise.allSettled([act('race','confirm'),act('race','confirm')]);
 assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal(writes.length,before+1,'two stations must send one command');
 console.log('PASS: concurrent counter actions send only one upstream command');

 await add('cancel');const reasons=await cancellationReasons(env,'cancel',api);assert.equal(reasons[0].code,'fresh-code-93');
 await assert.rejects(act('cancel','requestCancellation','501'),/disponível/);
 const reasonBefore=reasonCalls;await act('cancel','requestCancellation','fresh-code-93');assert.ok(reasonCalls>reasonBefore,'revalidate reason at submission');
 assert.equal((await get('cancel')).cancelled,false);assert.deepEqual(writes.at(-1).body,{cancellationCode:'fresh-code-93',reason:'Motivo disponibilizado pelo iFood'});
 await emit('cancel','CANCELLATION_REQUEST_FAILED');o=await get('cancel');assert.equal(o.status,'PLACED');assert.equal(o.pendingAction,null);assert.match(o.actionError,/recusou/);
 await act('cancel','requestCancellation','fresh-code-93');await emit('cancel','CAN');assert.equal((await get('cancel')).cancelled,true);
 await assert.rejects(act('cancel','finishSeparation'),/finalizado/);
 await emit('cancel','CFM',new Date(Date.now()-60_000).toISOString());assert.equal((await get('cancel')).status,'CANCELLED','late events must not resurrect cancelled orders');
 console.log('PASS: live cancellation reasons, rejection, eventual cancellation and out-of-order events');

 await add('cancel-legacy');reasonFixtures.set('cancel-legacy',{body:[{cancelCodeId:'fresh-legacy-817',description:'Motivo retornado para este pedido'}]});
 const legacyReasons=await cancellationReasonDetails(env,'cancel-legacy',api);
 assert.deepEqual(legacyReasons.reasons,[{code:'fresh-legacy-817',description:'Motivo retornado para este pedido'}]);
 assert.deepEqual(legacyReasons.diagnostic,{upstreamStatus:200,returnedCount:1,fields:['cancelCodeId','description']});
 const beforeLegacy=writes.length;await act('cancel-legacy','requestCancellation','fresh-legacy-817');assert.equal(writes.length,beforeLegacy+1);assert.deepEqual(writes.at(-1).body,{cancellationCode:'fresh-legacy-817',reason:'Motivo retornado para este pedido'});
 await emit('cancel-legacy','CAN');assert.equal((await get('cancel-legacy')).status,'CANCELLED');
 await add('cancel-code-formats');reasonFixtures.set('cancel-code-formats',{body:{reasons:[{code:503,description:' Item indisponível '},{cancelCodeId:'009',description:'Outro motivo'}]}});
 assert.deepEqual(await cancellationReasons(env,'cancel-code-formats',api),[{code:'503',description:'Item indisponível'},{code:'009',description:'Outro motivo'}]);
 reasonFixtures.set('cancel-code-formats',{body:{reasons:[{code:'new-policy-code',description:'Política atualizada'}]}});
 const beforeStale=writes.length;await assert.rejects(act('cancel-code-formats','requestCancellation','503'),/disponível/);assert.equal(writes.length,beforeStale,'stale selection never bypasses the current upstream policy');
 for(const body of [[{unknownCode:'503',description:'Formato novo'}],[{code:'501',cancelCodeId:'503',description:'Ambíguo'}],{unexpected:[]},[{code:'',description:'Sem código'}]]){
  reasonFixtures.set('cancel-code-formats',{body});
  await assert.rejects(cancellationReasons(env,'cancel-code-formats',api),e=>e.status===502&&e.diagnostic.upstreamStatus===200);
  await assert.rejects(act('cancel-code-formats','requestCancellation','503'),/interpretar/);assert.equal(writes.length,beforeStale,'malformed reasons never become permission to cancel');
 }
 for(const fixture of [{body:[]},{body:{reasons:[]}},{status:204}]){
  reasonFixtures.set('cancel-code-formats',fixture);const lookup=await cancellationReasonDetails(env,'cancel-code-formats',api);
  assert.deepEqual(lookup.reasons,[]);assert.equal(lookup.diagnostic.returnedCount,0);assert.equal(lookup.diagnostic.upstreamStatus,fixture.status||200);
  await assert.rejects(act('cancel-code-formats','requestCancellation','501'),/disponível/);assert.equal(writes.length,beforeStale,'no fabricated fallback reasons');
 }
 console.log('PASS: code/cancelCodeId response formats, source diagnostics, fresh-policy validation and no fallback for empty or malformed reasons');

 for(const [id,overrides] of [['ifood',{delivery:{deliveredBy:'IFOOD'}}],['takeout',{orderType:'TAKEOUT'}],['dine-in',{orderType:'DINE_IN'}]]) {
  await add(id,overrides);await act(id,'confirm');await emit(id,'CFM');await act(id,'startPreparation');await emit(id,'PRS');
  await act(id,'readyToPickup');await emit(id,'RTP');assert.equal(primaryAction(await get(id)),null);await assert.rejects(act(id,'dispatch'),/modalidade/);
  await emit(id,'CON');assert.equal((await get(id)).status,'CONCLUDED');
 }
 await add('scheduled',{orderTiming:'SCHEDULED',preparationStartDateTime:new Date(Date.now()+3600_000).toISOString()},'CONFIRMED');
 await assert.rejects(act('scheduled','startPreparation'),/horário/);await assert.rejects(act('scheduled','startSeparation'),/horário/);
 for(const [id,start] of [['scheduled-missing',''],['scheduled-invalid','invalid-date']]) {
  await add(id,{orderTiming:'SCHEDULED',preparationStartDateTime:start});await act(id,'confirm');await emit(id,'CFM');
  await assert.rejects(act(id,'startPreparation'),/horário/);await assert.rejects(act(id,'finishSeparation'),/horário/);
  details.set(id,{...details.get(id),preparationStartDateTime:new Date(Date.now()-60_000).toISOString()});
  await act(id,'startPreparation');await emit(id,'PRS');await act(id,'finishSeparation');await act(id,'readyToPickup');await emit(id,'RTP');
  assert.equal((await get(id)).kitchenStage,'SEPARATED');
 }
 await add('outsider');details.set('outsider',{...fixture('outsider'),isTest:false});const beforeGuard=writes.length;
 await assert.rejects(act('outsider','confirm'),/loja de teste/);
 details.set('outsider',{...fixture('outsider'),merchant:{id:'different-merchant'}});await assert.rejects(act('outsider','confirm'),/loja de teste/);
 await assert.rejects(actOnOrder({...env,IFOOD_MERCHANT_ID:'real-store'},'outsider',input('confirm'),'test-owner',api),/loja de teste/);
 assert.equal(writes.length,beforeGuard);
 console.log('PASS: fulfillment-specific actions, scheduled preparation and strict test-store verification before writes');

 await add('patched',{},'CFM');await act('patched','finishSeparation');
 const originalReceived=(await get('patched')).receivedAt;
 details.set('patched',{...details.get('patched'),items:[...fixture('patched').items,{name:'Pão de queijo',quantity:10}],observations:'Sem açúcar no churros'});
 await emit('patched','ORDER_PATCHED');o=await get('patched');
 assert.equal(o.status,'CONFIRMED');assert.equal(o.kitchenStage,'WAITING');assert.equal(o.kitchenNeedsReview,true);assert.equal(o.receivedAt,originalReceived);
 assert.equal(o.items.at(-1).name,'Pão de queijo');assert.equal(o.observations,'Sem açúcar no churros');assert.equal(o.kitchenUpdatedAt,null);
 await act('patched','finishSeparation');assert.equal((await get('patched')).kitchenNeedsReview,false);
 await emit('patched','ORDER_PATCHED');assert.equal((await get('patched')).kitchenStage,'SEPARATED','repeated content must not reopen separation');
 details.set('patched',{...details.get('patched'),customer:{name:'Nome corrigido'},payments:{prepaid:20,methods:[{method:'CREDIT',type:'ONLINE',value:20}]}});
 await emit('patched','ORDER_PATCHED');assert.equal((await get('patched')).kitchenStage,'SEPARATED','commercial-only changes must preserve separation');
 const revised=structuredClone(details.get('patched'));revised.items[0].options[0].quantity=30;details.set('patched',revised);
 await act('patched','startPreparation');o=await get('patched');assert.equal(o.kitchenStage,'WAITING','fresh reads must also catch changed add-ons');assert.equal(o.kitchenNeedsReview,true);
 await emit('patched','PRS');await act('patched','finishSeparation');await emit('patched','CON');
 details.set('patched',{...revised,observations:'Histórico atualizado'});await emit('patched','ORDER_PATCHED');
 o=await get('patched');assert.equal(o.kitchenStage,'SEPARATED');assert.equal(o.kitchenNeedsReview,false,'terminal orders stay archived');
 console.log('PASS: changed items, add-ons and notes reopen separation; duplicate, commercial and terminal updates preserve it');

 await add('kitchen-race',{},'CFM');
 const raceDB=new Proxy(DB,{get(target,key){if(key==='prepare')return sql=>{const statement=target.prepare(sql);if(!sql.startsWith('UPDATE received_orders SET kitchen_stage='))return statement;return {bind(...values){const bound=statement.bind(...values);return {async run(){await DB.prepare("UPDATE received_orders SET payload=json_set(payload,'$.observations','Pedido mudou'),kitchen_needs_review=1 WHERE id='kitchen-race'").run();return bound.run();}};}};};const value=target[key];return typeof value==='function'?value.bind(target):value;}});
 await assert.rejects(actOnOrder({...env,DB:raceDB},'kitchen-race',input('finishSeparation'),'kitchen',api),/Pedido alterado/);
 assert.equal((await get('kitchen-race')).kitchenStage,'WAITING');assert.equal((await get('kitchen-race')).kitchenNeedsReview,true);
 console.log('PASS: concurrent item update cannot be dismissed by a stale separation request');

 await add('timeout');failures.set('timeout','network');await assert.rejects(act('timeout','confirm'),/pode ter chegado/);
 o=await get('timeout');assert.equal(o.status,'PLACED');assert.equal(o.pendingAction.status,'UNCERTAIN');
 const beforeTimeoutRetry=writes.length;await assert.rejects(act('timeout','confirm'),/aguardando/);assert.equal(writes.length,beforeTimeoutRetry);
 await emit('timeout','CONFIRMED');assert.equal((await get('timeout')).pendingAction,null);
 await add('rejected');failures.set('rejected',{status:400,code:'InvalidParameter'});await assert.rejects(act('rejected','confirm'),/recusou/);
 o=await get('rejected');assert.equal(o.pendingAction,null);assert.equal(o.status,'PLACED');assert.ok(!o.actionError.includes('raw upstream'));
 const s=JSON.stringify(await snapshot(env));assert.ok(!s.includes('fixture-private-value')&&!s.includes('fixture-bearer'));
 console.log('PASS: uncertain network outcome blocks duplicates, refused commands preserve state and credentials stay private');
} finally {await mf.dispose();}
