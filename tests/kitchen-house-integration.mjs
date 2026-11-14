import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import jsQR from 'jsqr';
import {normalizeOrder} from '../lib/ifood.ts';
import {houseActor,registerHouseStation} from '../lib/house-auth.ts';
import {saveHouseOrder,separateHouseOrder,houseSnapshot,getHouseOrder,advanceHousePreparation,releaseHouseDueOrders} from '../lib/house.ts';
import {houseKitchenOrder} from '../lib/house-state.ts';
import {requestHousePrint,beginHousePrint,finishHousePrint} from '../lib/house-print.ts';
import {receiptText,escPosBytes} from '../lib/receipt.ts';
import {whatsappLink} from '../lib/receipt-qr.ts';
import {rawBtJob,sendRawBtJob,RAWBT_SOCKET_URL,RawBtError} from '../lib/rawbt.ts';
import {KitchenPrinterController} from '../lib/kitchen-printer-controller.ts';
import {emptyPrintQueue,readPrintQueue} from '../lib/auto-print.ts';
import {playOrderChime} from '../lib/order-sound.ts';
import {kitchenQueues} from '../lib/order-state.ts';

function decodeReceiptQr(bytes){
 const start=Buffer.from(bytes).indexOf(Buffer.from([0x1d,0x76,0x30,0]));assert.ok(start>=0,'QR must be present in the actual receipt bytes');
 const stride=bytes[start+4]+bytes[start+5]*256,height=bytes[start+6]+bytes[start+7]*256,width=stride*8,rgba=new Uint8ClampedArray(width*height*4);
 assert.ok(width<=384,'QR fits the 58mm printable area');
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const ink=bytes[start+8+y*stride+(x>>3)]&(0x80>>(x%8)),i=(y*width+x)*4;rgba[i]=rgba[i+1]=rgba[i+2]=ink?0:255;rgba[i+3]=255;}
 return jsQR(rgba,width,height)?.data;
}
assert.equal(whatsappLink('(21) 99999-0000'),'https://wa.me/5521999990000');assert.equal(whatsappLink('+55 (21) 99999-0000'),'https://wa.me/5521999990000');assert.equal(whatsappLink('invalid'),null);
const frequencies=[],envelopes=[];playOrderChime({currentTime:10,destination:{},createOscillator:()=>({frequency:{setValueAtTime:(f,t)=>frequencies.push([f,t])},connect(){},disconnect(){},start(){},stop(){}}),createGain:()=>({gain:{setValueAtTime:(v,t)=>envelopes.push([v,t]),exponentialRampToValueAtTime:(v,t)=>envelopes.push([v,t])},connect(){},disconnect(){}})});
assert.equal(frequencies.length,10);assert.deepEqual(frequencies.slice(0,5).map(([f])=>f),[1800,2400,1320,2637,3520]);assert.ok(frequencies.at(-1)[1]-frequencies[0][1]>1.3);assert.equal(envelopes.filter(([v])=>v===.48).length,2);
console.log('PASS: longer, louder shared cash-register chime and WhatsApp international number normalization');

const require=createRequire(import.meta.url),{Miniflare}=createRequire(require.resolve('wrangler/package.json'))('miniflare'),mf=new Miniflare({modules:true,script:'export default{fetch(){return new Response("test")}}',compatibilityDate:'2026-05-15',d1Databases:['DB']}),DB=await mf.getD1Database('DB'),realNow=Date.now;
const clock=Date.parse('2026-11-09T15:00:00Z');Date.now=()=>clock;
try{
 for(const file of(await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())for(const sql of(await readFile(new URL('../drizzle/'+file,import.meta.url),'utf8')).split(';').filter(s=>s.trim()))await DB.prepare(sql).run();
 const identity={userId:'integration-fixture-owner',email:'owner@lab.test',displayName:'Bruno'},owner=await houseActor(DB,identity.email,identity);
 const station=async profile=>{const id=crypto.randomUUID();await registerHouseStation(DB,owner,{id,deviceId:crypto.randomUUID(),name:profile+' fictício',profile});return houseActor(DB,identity.email,identity,id);};
 const manager=await station('manager'),attendant=await station('attendant'),production=await station('production'),otherProduction=await station('production');
 const draft={customer:'Cliente fictício',phone:'21999990000',modality:'TAKEOUT',timing:'NOW',date:'2026-11-10',time:'18:00',leadMinutes:60,address:'',items:[{name:'Churros',quantity:50,flavors:[{name:'Doce de leite',quantity:50}],observations:'Caixa separada'}],observations:'Conferir embalagem',totalCents:3000,paid:false};
 const save=(d,old)=>saveHouseOrder(DB,attendant,{requestId:crypto.randomUUID(),...(old?{id:old.id,revision:old.revision}:{}),order:d});
 let order=await save(draft);const ticket=await requestHousePrint(DB,production,{orderId:order.id,requestId:crypto.randomUUID(),reprint:false}),beforeRevision=order.revision;
 const resumedTicket=await requestHousePrint(DB,production,{orderId:order.id,requestId:crypto.randomUUID(),reprint:false});assert.equal(resumedTicket.token,ticket.token,'same station reopens its own pending print instead of creating a new lease');await assert.rejects(requestHousePrint(DB,otherProduction,{orderId:order.id,requestId:crypto.randomUUID(),reprint:false}),e=>e.status===409);
 const command={id:order.id,revision:order.revision,requestId:crypto.randomUUID()};
 await Promise.all([separateHouseOrder(DB,production,command),separateHouseOrder(DB,otherProduction,{...command,requestId:crypto.randomUUID()})]);
 order=await getHouseOrder(DB,order.id);assert.equal(order.kitchenStage,'SEPARATED');assert.equal(order.status,'PREPARING');assert.equal(order.revision,beforeRevision,'separating must not invalidate an automatic print lease');
 assert.equal((await separateHouseOrder(DB,production,command)).kitchenStage,'SEPARATED');
 assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM house_events WHERE order_id=? AND kind='SEPARATED'").bind(order.id).first()).n,1);
 const begun=await beginHousePrint(DB,production,{jobId:ticket.jobId,token:ticket.token});
 const text=receiptText(begun.order);assert.match(text,/50x Churros de Doce de leite/);assert.doesNotMatch(text,/\n\s*50x Doce de leite/);assert.equal(decodeReceiptQr(escPosBytes(begun.order)),'https://wa.me/5521999990000');
 await finishHousePrint(DB,production,{jobId:ticket.jobId,token:ticket.token,result:'submitted'});await releaseHouseDueOrders(DB);
 let kitchen=await houseSnapshot(DB,production,'2026-11-10','kitchen');assert.equal(kitchen.orders.find(o=>o.id===order.id).kitchenStage,'SEPARATED');assert.equal(kitchen.jobs.filter(j=>j.orderId===order.id&&j.state==='QUEUED').length,0);
 order=await save({...draft,phone:'21999991111'},order);assert.equal(order.kitchenStage,'SEPARATED','contact edits preserve separated trays');
 await assert.rejects(separateHouseOrder(DB,production,{...command,requestId:crypto.randomUUID()}),e=>e.status===409);
 order=await save({...draft,phone:'21999992222',items:[{...draft.items[0],flavors:[{name:'Chocolate',quantity:50}]}]},order);assert.equal(order.kitchenStage,'WAITING','changed contents return to the preparation queue');
 assert.equal(decodeReceiptQr(escPosBytes(houseKitchenOrder(order))),'https://wa.me/5521999992222');
 const future=await save({...draft,timing:'SCHEDULED'});await assert.rejects(requestHousePrint(DB,production,{orderId:future.id,requestId:crypto.randomUUID(),reprint:false}),e=>e.status===403);
 await assert.rejects(advanceHousePreparation(DB,production,{id:future.id,revision:future.revision,requestId:crypto.randomUUID()}),e=>e.status===403);
 const advanced=await advanceHousePreparation(DB,attendant,{id:future.id,revision:future.revision,requestId:crypto.randomUUID()});assert.equal(advanced.status,'PREPARING');assert.equal(advanced.promisedAt,future.promisedAt);assert.equal(advanced.prepAt,new Date(clock).toISOString());
 console.log('PASS: shared separated stage, concurrent/idempotent marking, production print button permissions, protected schedules, unchanged active print lease, edited contents return to A separar, Adiantar for attendant/Marcelo');

 // Pure fixtures: no real iFood requests or production database access.
 const galega='a0c511e3-83b1-4054-855e-6835ac15cda5',vovo='2b436d5a-a9ba-4e8c-b8dc-3d812021c126';
 const fixtureEnv={IFOOD_ENVIRONMENT:'PRODUCTION',IFOOD_PRODUCTION_ENABLED:'true',IFOOD_MERCHANT_ID:galega,IFOOD_ALLOWED_MERCHANT_IDS:galega+','+vovo};
 const food=(id,merchant)=>normalizeOrder({id,displayId:'1234',merchant:{id:merchant},isTest:false,category:'FOOD',createdAt:new Date(clock).toISOString(),customer:{name:'Cliente fictício'},orderType:'TAKEOUT',orderTiming:'IMMEDIATE',items:[{name:'Coxinha',quantity:10}]},new Date(clock).toISOString(),fixtureEnv);
 const foods=[food(crypto.randomUUID(),galega),food(crypto.randomUUID(),vovo)].map(o=>({...o,status:'CONFIRMED'}));
 assert.equal(kitchenQueues(foods).active.length,2);assert.equal(kitchenQueues([{...foods[0],kitchenStage:'SEPARATED'}]).separated.length,1);
 let stored=JSON.stringify({...emptyPrintQueue(),enabled:true,initialized:true,completion:'driver'}),held=false,waiters=[],active=0,maxActive=0;const frames=[];
 const lock=async(signal,wait,work)=>{while(held){if(!wait)return false;await new Promise(resolve=>waiters.push(resolve));if(signal.aborted)return false;}held=true;try{await work();return true;}finally{held=false;waiters.splice(0).forEach(resolve=>resolve());}};
 const createSocket=url=>{assert.equal(url,RAWBT_SOCKET_URL);let inFlight=false;const socket={bufferedAmount:0,onopen:null,onmessage:null,onerror:null,onclose:null,send(data){assert.equal(typeof data,'string','RawBT receives its original JSON envelope');const job=JSON.parse(data);assert.equal(job.printer,'current');assert.equal(job.copies,1);active++;inFlight=true;maxActive=Math.max(maxActive,active);frames.push(new Uint8Array(Buffer.from(job.commands[0].base64,'base64')));queueMicrotask(()=>socket.onmessage?.({data:JSON.stringify({responseType:'success',jobId:job.idJob})}));},close(){if(inFlight){inFlight=false;active--;}}};queueMicrotask(()=>socket.onopen?.({}));return socket;};
 const printer=new KitchenPrinterController({key:'joint-fixture',storage:{getItem:()=>stored,setItem:(_k,v)=>{stored=v;}},lock,onChange:()=>{},transport:{createSocket,submitGraceMs:1,connectTimeoutMs:100,resultTimeoutMs:100}});printer.update(foods,true);
 const houseTicket=await requestHousePrint(DB,production,{orderId:order.id,requestId:crypto.randomUUID(),reprint:false}),houseJob=rawBtJob(houseTicket.order,'joint-house');
 await Promise.all([printer.tick(),lock(new AbortController().signal,true,async()=>{
  const result=await sendRawBtJob(houseJob,{createSocket,submitGraceMs:1,beforeSend:async()=>{const latest=await beginHousePrint(DB,production,{jobId:houseTicket.jobId,token:houseTicket.token});Object.assign(houseJob,rawBtJob(latest.order,houseJob.idJob));}});
  await finishHousePrint(DB,production,{jobId:houseTicket.jobId,token:houseTicket.token,result:result.completion});
 })]);await printer.tick();await printer.tick();
 assert.equal(frames.length,3,'one receipt per iFood store plus Casa');assert.equal(maxActive,1,'Casa and iFood share a single printer lock');assert.equal(Object.keys(readPrintQueue(stored).jobs).length,0);
 assert.ok(frames.some(b=>Buffer.from(b).toString('latin1').includes('SALGADOS DA VOVO')));assert.ok(frames.some(b=>Buffer.from(b).toString('latin1').includes('IFOOD - PEDIDO #1234')));
 const houseFrame=frames.find(b=>Buffer.from(b).toString('latin1').includes('WHATSAPP DO CLIENTE'));assert.equal(decodeReceiptQr(houseFrame),'https://wa.me/5521999992222');assert.match(Buffer.from(houseFrame).toString('latin1'),/50x Churros de Chocolate/);
 const repeatInput={orderId:order.id,requestId:crypto.randomUUID(),reprint:true},repeat=await requestHousePrint(DB,production,repeatInput);
 assert.equal(repeat.kind,'REPRINT');assert.doesNotMatch(receiptText(repeat.order),/REIMPRESSAO/);assert.match(receiptText(repeat.order),/PAGAMENTO: A COBRAR\n\nFeito com carinho,\ncom amor, Galega!$/);
 const resumeRepeat=await requestHousePrint(DB,production,repeatInput);assert.equal(resumeRepeat.token,repeat.token);
 await beginHousePrint(DB,production,{jobId:repeat.jobId,token:repeat.token});await finishHousePrint(DB,production,{jobId:repeat.jobId,token:repeat.token,result:'driver'});
 assert.equal((await requestHousePrint(DB,production,repeatInput)).alreadySent,true,'a repeated request ID never prints again');
 const newOrder=await save(draft),queued=(await houseSnapshot(DB,production,'2026-11-10','kitchen')).jobs.find(j=>j.orderId===newOrder.id&&j.kind==='PRODUCTION');
 const firstTap=await requestHousePrint(DB,production,{orderId:newOrder.id,requestId:crypto.randomUUID(),reprint:true});assert.equal(firstTap.jobId,queued.id,'one-tap manual printing reuses the queued automatic receipt');
 assert.equal((await DB.prepare("SELECT COUNT(*) AS n FROM house_print_jobs WHERE order_id=? AND state<>'VOID'").bind(newOrder.id).first()).n,1);
 const oldLedger=JSON.stringify({...emptyPrintQueue(),enabled:true,seen:['kept-id']});const legacy=new KitchenPrinterController({key:'legacy',storage:{getItem:()=>oldLedger,setItem(){}},lock,onChange(){}});assert.equal(legacy.state.queue.enabled,true,'existing RawBT preferences stay enabled');legacy.dispose();
 let converted=JSON.stringify({...emptyPrintQueue(),enabled:true,initialized:true,seen:['kept-id'],driver:'retired-provider',completion:'submitted',jobs:{pending:{state:'queued',updatedAt:1}}});
 const migrated=new KitchenPrinterController({key:'migrated',storage:{getItem:()=>converted,setItem:(_k,v)=>{converted=v;}},lock,onChange(){},transport:{createSocket,connectTimeoutMs:100,resultTimeoutMs:100}});assert.equal(migrated.state.queue.enabled,false);assert.equal(migrated.state.queue.pausedForSetup,true);assert.ok(migrated.state.queue.jobs.pending);assert.equal(migrated.state.queue.completion,undefined);
 migrated.update(foods,true);await migrated.setEnabled(true);assert.equal(migrated.state.queue.enabled,false,'old provider proof cannot authorize RawBT');await migrated.tick();assert.equal(migrated.state.queue.jobs[foods[0].id].state,'queued','arrivals remain queued during RawBT setup');await migrated.testPrint();assert.equal(migrated.state.testAcknowledged,true);await migrated.setEnabled(true);assert.equal(migrated.state.queue.enabled,true);assert.equal(migrated.state.queue.completion,'driver');assert.equal(migrated.state.queue.pausedForSetup,undefined);migrated.dispose();printer.dispose();
 console.log('PASS: simultaneous Galega/Vovó iFood and Casa use original RawBT JSON, one shared lock, independently decoded QR, no duplicates, one-tap manual/reprint, clean footer, preserved preferences and safe old-provider upgrade');
 let socket;const job=rawBtJob(houseKitchenOrder(order),'failure-fixture'),pending=sendRawBtJob(job,{createSocket:()=>socket={bufferedAmount:0,onopen:null,onmessage:null,onerror:null,onclose:null,close(){},send(){queueMicrotask(()=>this.onclose?.({}));}}});socket.onopen();await assert.rejects(pending,e=>e instanceof RawBtError&&e.sent);
 const abort=new AbortController();abort.abort();await assert.rejects(sendRawBtJob(job,{signal:abort.signal}),e=>e instanceof RawBtError&&!e.sent);
 console.log('PASS: RawBT interruption after send is uncertain, while cancellation before send is safe to retry');
}finally{Date.now=realNow;await mf.dispose();}
