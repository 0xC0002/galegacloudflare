import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { synchronize, snapshot, actOnOrder, TEST_MERCHANT } from '../lib/ifood.ts';
import { receiptText } from '../lib/receipt.ts';

const require = createRequire(import.meta.url), wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare } = wranglerRequire('miniflare');
const mf = new Miniflare({ modules:true, script:'export default {fetch(){return new Response("test")}}', compatibilityDate:'2026-05-15', d1Databases:['DB'] });
const DB = await mf.getD1Database('DB');
const env = { DB, IFOOD_CLIENT_ID:'observation-fixture', IFOOD_CLIENT_SECRET:'observation-fixture-private', IFOOD_MERCHANT_ID:TEST_MERCHANT };
const stamp = new Date().toISOString(), id = '11111111-1111-4111-8111-000000009901';
const raw = {
 id, displayId:'OBS1', isTest:true, category:'FOOD', merchant:{id:TEST_MERCHANT}, customer:{name:'TESTE LOCAL — Observações'},
 createdAt:stamp, orderType:'DELIVERY', orderTiming:'IMMEDIATE',
 observations:'Separar as bebidas dos salgados.\nConferir os volumes antes de embalar.',
 extraInfo:'PEDIDO FICTÍCIO - TESTE LOCAL',
 items:[
  {name:'100 salgadinhos',quantity:1,observations:'Colocar em duas caixas de 50.',options:[
   {name:'Coxinha',quantity:40,observations:'Identificar a caixa de coxinha.',options:[]},
   {name:'Bolinha de queijo',quantity:60,options:[]}
  ]},
  {name:'Churros',quantity:20,observations:'Sem açúcar.\nSeparar chocolate e doce de leite.',options:[
   {name:'Chocolate',quantity:10,options:[]},
   {name:'Doce de leite',quantity:10,observations:'Identificar o recheio na caixa.',options:[{name:'Embalagem',quantity:1,observations:'Usar caixa pequena.'}]}
  ]},
  {name:'Refrigerante 2 L',quantity:1,observations:'Enviar gelado.'}
 ],
 delivery:{deliveredBy:'MERCHANT',observations:'Tocar o interfone ao chegar.',deliveryAddress:{formattedAddress:'Endereço fictício — teste local'}},
 total:{orderAmount:65},payments:{prepaid:65,pending:0,methods:[{value:65,type:'ONLINE',method:'CREDIT',card:{brand:'VISA'}}]}
};
const longId='11111111-1111-4111-8111-000000009902';
const longNote=('Conferir recheios, caixas e bebidas. '.repeat(28)+'FIM DA OBSERVAÇÃO').slice(-1024);
const longWord='OBSERVACAO_'.repeat(12)+'FIM';
const longRaw={...raw,id:longId,displayId:'OBS2',customer:{name:'TESTE LOCAL — Texto longo'},observations:longWord,extraInfo:'',items:[{name:'Churros',quantity:20,observations:longNote,options:[{name:'Chocolate',quantity:20,observations:'Texto literal: <b>sem molho</b> & conferir.'}]}]};
const takeoutId='11111111-1111-4111-8111-000000009903';
const takeoutRaw={...raw,id:takeoutId,displayId:'RET1',customer:{name:'TESTE LOCAL — Retirada'},orderType:'TAKEOUT',delivery:undefined,observations:'Conferir os volumes na retirada.',extraInfo:'',takeout:{takeoutDateTime:stamp,observations:'Retirar no balcão lateral.\nIdentificar as caixas de churros.'}};
const details=new Map([[id,raw],[longId,longRaw],[takeoutId,takeoutRaw]]), calls=[];
let events=[];
const event=(orderId,code)=>({id:crypto.randomUUID(),orderId,merchantId:TEST_MERCHANT,code,fullCode:code,createdAt:new Date().toISOString()});
const api=async(url,init={})=>{
 const path=new URL(url).pathname;calls.push({path,method:init.method||'GET'});
 if(path==='/authentication/v1.0/oauth/token')return Response.json({accessToken:'observation-fixture-token',expiresIn:3600});
 if(path==='/events/v1.0/events:polling')return events.length?Response.json(events):new Response(null,{status:204});
 if(path==='/events/v1.0/events/acknowledgment'){
  const ack=JSON.parse(init.body);for(const e of ack)assert.ok(await DB.prepare('SELECT id FROM received_events WHERE id=?').bind(e.id).first());
  events=events.filter(e=>!ack.some(a=>a.id===e.id));return new Response(null,{status:202});
 }
 const match=path.match(/^\/order\/v1\.0\/orders\/([^/]+)$/);
 if(match&&details.has(match[1]))return Response.json(details.get(match[1]));
 throw new Error('Unexpected external operation in observations test: '+path);
};
const get=async()=> (await snapshot(env)).orders.find(o=>o.id===id);
const noNetwork=async()=>{throw new Error('Separation must not call iFood');};
const mark=()=>actOnOrder({DB},id,{action:'finishSeparation',requestId:crypto.randomUUID()},'local-observations-test',noNetwork);
const poll=async()=>{await DB.prepare('UPDATE integration_state SET next_poll_at=0,lease_until=0').run();return synchronize(env,api);};
const plain=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s/g,'');
const sql=s=>"'"+String(s).replaceAll("'","''")+"'";

try {
 for(const f of (await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())for(const statement of (await readFile(new URL('../drizzle/'+f,import.meta.url),'utf8')).split(';').filter(s=>s.trim()))await DB.prepare(statement).run();
 events=[event(id,'PLACED'),event(id,'CONFIRMED'),event(longId,'PLACED'),event(longId,'CONFIRMED'),event(takeoutId,'PLACED'),event(takeoutId,'CONFIRMED')];
 const received=await poll(),o=received.orders.find(x=>x.id===id),long=received.orders.find(x=>x.id===longId);
 assert.equal(received.pendingEvents,0);assert.equal(received.pendingErrors,0);assert.equal(received.lastError,null);
 assert.equal(o.status,'CONFIRMED');assert.equal(o.observations,raw.observations+'\n'+raw.extraInfo);
 assert.equal(o.items[0].observations,raw.items[0].observations);
 assert.equal(o.items[0].options[0].observations,raw.items[0].options[0].observations);
 assert.equal(o.items[1].observations,raw.items[1].observations);
 assert.equal(o.items[1].options[1].observations,raw.items[1].options[1].observations);
 assert.equal(o.items[1].options[1].options[0].observations,'Usar caixa pequena.');
 assert.equal(o.receipt.deliveryNotes,raw.delivery.observations);
 assert.equal(long.items[0].observations.length,1024);assert.equal(long.items[0].observations,longNote);assert.equal(long.observations,longWord);
 assert.equal(long.items[0].options[0].observations,longRaw.items[0].options[0].observations);
 const reloaded=await snapshot({DB});assert.deepEqual(reloaded.orders,received.orders,'reopening either screen must preserve all observations in the shared database');
 assert.equal((await DB.prepare('SELECT COUNT(*) AS total FROM received_events WHERE acknowledged_at IS NOT NULL AND handled=1').first()).total,6);
 const takeout=received.orders.find(x=>x.id===takeoutId);assert.equal(takeout.receipt.takeoutNotes,takeoutRaw.takeout.observations);
 console.log('PASS: polling/details, durable ACK and shared snapshots preserve item, nested option, general, multiline, 1024-character and delivery observations');

 const receipt=plain(receiptText(o));
 for(const note of [raw.observations,raw.extraInfo,raw.items[0].observations,raw.items[0].options[0].observations,raw.items[1].observations,raw.items[1].options[1].observations,'Usar caixa pequena.',raw.delivery.observations])assert.ok(receipt.includes(plain(note)),'Missing note in 58 mm receipt: '+note);
 assert.ok(plain(receiptText(long)).includes(plain(longNote)));assert.ok(plain(receiptText(long)).includes(plain(longWord)));
 assert.ok(receiptText(long).split('\n').every(line=>line.length<=32));
 assert.ok(plain(receiptText(takeout)).includes(plain(takeoutRaw.takeout.observations)));
 console.log('PASS: all customer observations survive 58 mm receipt wrapping, including long text');

 if(process.argv[2]==='--preview-sql'){
  assert.ok(process.argv[3]?.startsWith('/workspace/'),'preview seed requires an absolute workspace path');
  const statements=[];
  for(const order of received.orders){
   statements.push(`INSERT OR REPLACE INTO received_orders (id,display_id,merchant_id,customer,created_at,received_at,updated_at,payload,kitchen_stage,kitchen_needs_review) VALUES (${[order.id,order.displayId,TEST_MERCHANT,order.customer,order.createdAt,order.receivedAt,stamp,JSON.stringify(order),'WAITING'].map(sql).join(',')},0);`);
   for(const code of ['PLACED','CONFIRMED']){const e=event(order.id,code);statements.push(`INSERT OR REPLACE INTO received_events (id,order_id,code,payload,received_at,handled,acknowledged_at) VALUES (${[e.id,e.orderId,code,JSON.stringify(e),stamp].map(sql).join(',')},1,${sql(stamp)});`);}
  }
  await writeFile(process.argv[3],statements.join('\n')+'\n');
 }

 await mark();let updated=await get();assert.equal(updated.kitchenStage,'SEPARATED');assert.equal(updated.items[1].observations,raw.items[1].observations);
 const initialReceivedAt=updated.receivedAt;
 details.set(id,{...raw,items:structuredClone(raw.items)});details.get(id).items[1].observations='ATUALIZADO: enviar churros sem canela.';
 events=[event(id,'ORDER_PATCHED')];await poll();updated=await get();
 assert.equal(updated.kitchenStage,'WAITING');assert.equal(updated.kitchenNeedsReview,true);assert.equal(updated.items[1].observations,'ATUALIZADO: enviar churros sem canela.');assert.equal(updated.receivedAt,initialReceivedAt);
 await mark();assert.equal((await get()).kitchenNeedsReview,false);
 details.set(id,{...details.get(id),observations:'ATUALIZADO: identificar todos os volumes.'});events=[event(id,'ORDER_PATCHED')];await poll();
 assert.equal((await get()).kitchenStage,'WAITING');assert.equal((await get()).kitchenNeedsReview,true);
 await actOnOrder({DB},takeoutId,{action:'finishSeparation',requestId:crypto.randomUUID()},'local-observations-test',noNetwork);
 details.set(takeoutId,{...takeoutRaw,takeout:{...takeoutRaw.takeout,observations:'ATUALIZADO: conferir identificação dos volumes.'}});events=[event(takeoutId,'ORDER_PATCHED')];await poll();
 const revisedTakeout=(await snapshot(env)).orders.find(x=>x.id===takeoutId);assert.equal(revisedTakeout.kitchenStage,'WAITING');assert.equal(revisedTakeout.kitchenNeedsReview,true);assert.equal(revisedTakeout.receipt.takeoutNotes,details.get(takeoutId).takeout.observations);
 await mark();details.set(id,{...details.get(id),items:structuredClone(details.get(id).items)});details.get(id).items[0].options[0].observations='ATUALIZADO: conferir caixa de coxinha.';events=[event(id,'ORDER_PATCHED')];await poll();
 assert.equal((await get()).kitchenStage,'WAITING');assert.equal((await get()).kitchenNeedsReview,true);
 assert.ok(calls.every(c=>c.method==='GET'||c.path==='/authentication/v1.0/oauth/token'||c.path==='/events/v1.0/events/acknowledgment'));
 console.log('PASS: changing item, general, option or pickup observations after separation returns the order for review without any remote business command');
} finally {await mf.dispose();}
