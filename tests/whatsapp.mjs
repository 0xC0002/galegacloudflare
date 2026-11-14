import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {houseActor,registerHouseStation} from '../lib/house-auth.ts';
import {saveHouseOrder,getHouseOrder,advanceHousePreparation,releaseHouseDueOrders,changeHouseStatus,reopenHouseOrder} from '../lib/house.ts';
import {connectWhatsapp,encryptWhatsappToken,decryptWhatsappToken,whatsappStatus,setWhatsappEnabled,whatsappTick,reconcileWhatsapp,sendWhatsappSample,resolveWhatsappJob,whatsappOrderText,whatsappMessageParts} from '../lib/whatsapp.ts';
const require=createRequire(import.meta.url),{Miniflare}=createRequire(require.resolve('wrangler/package.json'))('miniflare');
const mf=new Miniflare({modules:true,script:`export default{async fetch(r){if(new URL(r.url).pathname==='/request-options'){const i=await r.json();try{const request=new Request('https://graph.facebook.com/v25.0/123456789012345/messages',i);return Response.json({redirect:request.redirect})}catch(e){return Response.json({name:e.name},{status:500})}}return new Response('test')}}`,compatibilityDate:'2026-05-15',d1Databases:['DB']}),DB=await mf.getD1Database('DB'),realNow=Date.now;
let clock=Date.parse('2026-11-10T12:00:00Z');Date.now=()=>clock;
const env={DB,WHATSAPP_CONFIG_KEY:'a1'.repeat(32),WHATSAPP_TEST_TO:'5521999990000'},token='test-meta-token-'.repeat(5),phoneId='123456789012345';
let sent=[],mode='ok',pause=null;
const meta=async(url,init)=>{
 assert.equal(new URL(url).hostname,'graph.facebook.com');assert.equal(init.headers.Authorization,'Bearer '+token);assert.equal(init.redirect,'manual');
 const {signal,...workerInit}=init,runtime=await mf.dispatchFetch('http://test/request-options',{method:'POST',body:JSON.stringify(workerInit)});assert.equal(runtime.status,200,'actual Worker must accept the request options');assert.equal((await runtime.json()).redirect,'manual','credential-bearing requests never follow redirects to another host');
 if(init.method!=='POST')return Response.json({id:phoneId,display_phone_number:'+1 555 000 0000'});
 const body=JSON.parse(init.body);assert.equal(body.to,env.WHATSAPP_TEST_TO);assert.equal(body.messaging_product,'whatsapp');assert.equal(body.type,'text');assert.equal(body.text.preview_url,false);sent.push(body.text.body);
 if(pause)await pause;
 if(mode==='timeout')throw new Error(token+' transport failure');
 if(mode==='expired')return Response.json({error:{code:190,message:token+' must never reach the UI'}},{status:401});
 if(mode==='window')return Response.json({error:{code:131047,message:'window'}},{status:400});
 return Response.json({messages:[{id:'wamid.fixture-'+sent.length}]});
};
try{
 for(const f of(await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())for(const sql of(await readFile(new URL('../drizzle/'+f,import.meta.url),'utf8')).split(';').filter(s=>s.trim()))await DB.prepare(sql).run();
 const identity={userId:'whatsapp-fixture',email:'owner@lab.test',displayName:'Bruno'},owner=await houseActor(DB,identity.email,identity);
 const station=async profile=>{const id=crypto.randomUUID();await registerHouseStation(DB,owner,{id,deviceId:crypto.randomUUID(),name:profile,profile});return houseActor(DB,identity.email,identity,id);};
 const manager=await station('manager'),production=await station('production'),ordinary={...manager,realRole:'manager'};
 const draft={brand:'GALEGA',customer:'Cliente fictício',phone:'21999990000',modality:'DELIVERY',timing:'NOW',date:'2026-11-10',time:'09:00',address:'Rua de Exemplo, 123 — Teste',items:[{name:'Churros',quantity:50,flavors:[{name:'Doce de leite',quantity:50}],observations:''}],observations:'',totalCents:3000,paid:false,leadMinutes:60};
 const save=over=>saveHouseOrder(DB,manager,{requestId:crypto.randomUUID(),order:{...draft,...over}}),edit=(o,over)=>saveHouseOrder(DB,manager,{requestId:crypto.randomUUID(),id:o.id,revision:o.revision,order:{...o,...over}});
 const tick=async()=>{clock+=4000;return whatsappTick(env,meta,clock);};
 const jobs=()=>DB.prepare('SELECT * FROM house_whatsapp_jobs ORDER BY created_at,id').all();
 const cipher=await encryptWhatsappToken(env,token,phoneId);assert.ok(!cipher.includes(token));assert.equal(await decryptWhatsappToken(env,cipher,phoneId),token);
 await assert.rejects(decryptWhatsappToken(env,cipher,'999999'),e=>e.status===503);
 await assert.rejects(decryptWhatsappToken({...env,WHATSAPP_CONFIG_KEY:'b2'.repeat(32)},cipher,phoneId),e=>e.status===503);
 await assert.rejects(connectWhatsapp(env,ordinary,{token,phoneId},meta),e=>e.status===403);
 await assert.rejects(connectWhatsapp(env,owner,{token,phoneId:'123/../../x'},meta),e=>e.status===400);
 const persisted=await connectWhatsapp({...env,WHATSAPP_TEST_TO:'invalid'},owner,{token,phoneId},meta);assert.equal(persisted.recipients[0].phone,env.WHATSAPP_TEST_TO,'after one-time migration the persisted list is authoritative, not the legacy environment');
 const c=await connectWhatsapp(env,manager,{token,phoneId},meta);assert.equal(c.enabled,false);assert.equal(c.status,'connected');assert.ok(!JSON.stringify(c).includes(token));
 const stored=await DB.prepare('SELECT encrypted_token FROM whatsapp_connection').first();assert.notEqual(stored.encrypted_token,token);
 await assert.rejects(whatsappStatus(env,ordinary),e=>e.status===403);
 console.log('PASS: owner-only connection, validated private destination, fixed Graph API host, authenticated encryption and no plaintext credential in DB/status');

 const backlog=await save({customer:'Pedido anterior à ativação'});clock+=1000;await setWhatsappEnabled(env,owner,true,clock);await tick();assert.equal(sent.length,0,'activating never sends old preparation backlog');
 const now=await save({});let release;pause=new Promise(r=>{release=r;});
 clock+=4000;const concurrent=Array.from({length:8},()=>whatsappTick(env,meta,clock));
 const available=await DB.prepare('SELECT COUNT(*) n FROM house_print_jobs WHERE order_id=? AND state=\'QUEUED\'').bind(now.id).first();assert.ok(available.n>0,'printer queue is available independently');
 release();await Promise.all(concurrent);pause=null;
 assert.equal(sent.length,1);assert.match(sent[0],/^EM PREPARO/);assert.match(sent[0],/Cliente fictício/);assert.match(sent[0],/Rua de Exemplo/);assert.match(sent[0],/21999990000/);await tick();assert.equal(sent.length,1);
 let changed=await edit(now,{address:'Rua Corrigida, 456 — Teste'});await tick();assert.equal(sent.length,2);assert.match(sent[1],/^ATUALIZAÇÃO/);assert.match(sent[1],/Corrigida/);
 changed=await edit(changed,{paid:true});await tick();assert.equal(sent.length,3,'payment changes update the amount due in WhatsApp');
 assert.match(sent[2],/50x Churros de Doce de leite/);assert.match(sent[2],/TOTAL: R\$\s*30,00/);assert.match(sent[2],/PAGAMENTO: Pago/);assert.doesNotMatch(sent[2],/50x Churros\n/);
 changed=await edit(changed,{paid:true});await tick();assert.equal(sent.length,3,'saving identical data does not send the same receipt twice');
 changed=await changeHouseStatus(DB,manager,{id:changed.id,revision:changed.revision,requestId:crypto.randomUUID()},'cancel');await tick();assert.equal(sent.length,4);assert.match(sent[3],/^CANCELADO — NÃO ENTREGAR/);
 assert.equal((await getHouseOrder(DB,backlog.id)).status,'PREPARING');
 console.log('PASS: immediate Casa delivery sends once across eight simultaneous tablets; corrections and cancellation reach the same recipient, identical edits and backlog do not duplicate messages; printing remains independent');

 const takeout=await save({modality:'TAKEOUT',address:''});await tick();assert.equal(sent.length,4);
 let scheduled=await save({timing:'SCHEDULED',date:'2026-11-10',time:'14:00',leadMinutes:60});await tick();assert.equal(sent.length,4);
 const promise=scheduled.promisedAt;scheduled=await advanceHousePreparation(DB,manager,{id:scheduled.id,revision:scheduled.revision,requestId:crypto.randomUUID()},clock);await tick();assert.equal(sent.length,5);assert.match(sent[4],/14:00/);assert.equal(scheduled.promisedAt,promise);
 scheduled=await edit(scheduled,{time:'17:00'});await tick();assert.equal(sent.length,6);assert.match(sent[5],/^REAGENDADO/);
 clock=Date.parse(scheduled.prepAt)+1;await releaseHouseDueOrders(DB,clock);await tick();assert.equal(sent.length,7);assert.match(sent[6],/^ATUALIZAÇÃO — EM PREPARO/);assert.match(sent[6],/17:00/);
 let future=await save({timing:'SCHEDULED',date:'2026-11-11',time:'13:00',leadMinutes:60});clock=Date.parse(future.prepAt)+1;await releaseHouseDueOrders(DB,clock);await tick();assert.equal(sent.length,8);
 console.log('PASS: takeout and scheduling do not send preparation messages; Adiantar preserves promised time; rescheduled orders notify both the schedule correction and the later release at the same revision');

 const stale=await save({});await reconcileWhatsapp(env,clock);await edit(stale,{timing:'SCHEDULED',date:'2026-11-12',time:'14:00'});await tick();assert.equal(sent.length,8,'queued stale data is invalidated before POST');
 let done=await save({});await reconcileWhatsapp(env,clock);done=await changeHouseStatus(DB,production,{id:done.id,revision:done.revision,requestId:crypto.randomUUID()},'finish');await tick();assert.equal(sent.length,8);
 done=await reopenHouseOrder(DB,production,{id:done.id,revision:done.revision,requestId:crypto.randomUUID()},clock);await tick();assert.equal(sent.length,8,'restoring a finished Casa order does not issue another courier notification');await changeHouseStatus(DB,production,{id:done.id,revision:done.revision,requestId:crypto.randomUUID()},'finish');
 mode='timeout';const uncertain=await save({});await tick();assert.equal(sent.length,9);await tick();assert.equal(sent.length,9,'uncertain POST is never retried silently');
 const uncertainJob=(await jobs()).results.find(j=>j.order_id===uncertain.id&&j.state==='REVIEW');assert.ok(uncertainJob);assert.ok(!uncertainJob.error.includes(token));
 await resolveWhatsappJob(env,owner,{id:uncertainJob.id,action:'received'},clock);await tick();assert.equal(sent.length,9,'manual receipt confirmation does not resend');
 mode='expired';let blocked=await save({});await tick();assert.equal(sent.length,10);await tick();assert.equal(sent.length,10);const b=(await jobs()).results.find(j=>j.order_id===blocked.id&&j.state==='BLOCKED');assert.match(b.error,/Token expirado/);assert.ok(!JSON.stringify(await whatsappStatus(env,owner)).includes(token));
 mode='ok';await resolveWhatsappJob(env,owner,{id:b.id,action:'retry'},clock);await tick();assert.equal(sent.length,11);
 console.log('PASS: stale/finished orders are not sent; expired credentials show sanitized errors; uncertain sends require explicit review and never silently replay');

 const largeDraft={items:Array.from({length:12},(_,i)=>({name:'Salgadinhos '+(i+1),quantity:100,flavors:[{name:'Coxinha',quantity:50},{name:'Bolinha de queijo',quantity:50}],observations:('Observação '+(i+1)+' ').repeat(30)})),observations:'Observação geral '.repeat(100),paid:false,totalCents:12345};
 const large=await save(largeDraft),beforeLarge=sent.length;await tick();let largeJob=(await jobs()).results.find(j=>j.order_id===large.id);assert.equal(largeJob.state,'QUEUED');assert.equal(largeJob.sent_parts,1);assert.ok(largeJob.total_parts>1);
 mode='timeout';await tick();largeJob=(await jobs()).results.find(j=>j.order_id===large.id);assert.equal(largeJob.state,'REVIEW');assert.equal(largeJob.sent_parts,1);const beforeRetry=sent.length;await tick();assert.equal(sent.length,beforeRetry);
 mode='ok';await resolveWhatsappJob(env,owner,{id:largeJob.id,action:'retry'},clock);for(let n=0;n<12;n++){await tick();largeJob=(await jobs()).results.find(j=>j.order_id===large.id);if(largeJob.state==='SENT')break;}
 assert.equal(largeJob.state,'SENT');assert.equal(largeJob.sent_parts,largeJob.total_parts);const parts=sent.slice(beforeLarge);assert.ok(parts.every(p=>p.length<=4096));assert.equal(parts.filter(p=>p.startsWith('PARTE 1/')).length,1,'explicit retry of part 2 never replays accepted part 1');
 const complete=parts.join('\n');assert.match(complete,/Salgadinhos 12/);assert.match(complete,/Observação geral/);assert.match(complete,/TOTAL: R\$\s*123,45/);assert.match(complete,/PAGAMENTO: A cobrar/);
 assert.deepEqual(whatsappMessageParts('Pedido curto'),['Pedido curto']);assert.ok(whatsappMessageParts('😀'.repeat(6000)).every(p=>p.length<=4096&&!/[\uD800-\uDBFF]$/.test(p)),'long Unicode lines are complete and never split a surrogate pair');
 const manualLarge=await save(largeDraft);await tick();mode='timeout';await tick();let manualJob=(await jobs()).results.find(j=>j.order_id===manualLarge.id);assert.equal(manualJob.state,'REVIEW');
 await resolveWhatsappJob(env,owner,{id:manualJob.id,action:'received'},clock);mode='ok';for(let n=0;n<12;n++){await tick();manualJob=(await jobs()).results.find(j=>j.order_id===manualLarge.id);if(manualJob.state==='SENT')break;}assert.equal(manualJob.state,'SENT');assert.equal(manualJob.manual_parts,1);assert.equal((await whatsappStatus(env,owner)).jobs.find(j=>j.id===manualJob.id).acceptedByMeta,false,'manual confirmation is not claimed as an API delivery confirmation');
 const partialCancel=await save(largeDraft);await tick();let partialJob=(await jobs()).results.find(j=>j.order_id===partialCancel.id);assert.equal(partialJob.sent_parts,1);
 await changeHouseStatus(DB,manager,{id:partialCancel.id,revision:partialCancel.revision,requestId:crypto.randomUUID()},'cancel');await tick();const cancellationParts=(await jobs()).results.filter(j=>j.order_id===partialCancel.id);assert.equal(cancellationParts.find(j=>j.revision===1).state,'VOID');assert.ok(cancellationParts.some(j=>j.order_status==='CANCELLED'&&j.sent_parts===1));assert.match(sent.at(-1),/CANCELADO — NÃO ENTREGAR/);
 for(let n=0;n<12;n++){await tick();partialJob=(await jobs()).results.find(j=>j.order_id===partialCancel.id&&j.order_status==='CANCELLED');if(partialJob.state==='SENT')break;}assert.equal(partialJob.state,'SENT');
 console.log('PASS: complete items, flavors, observations, total and payment; long orders use bounded durable parts, uncertain parts require review, retries never repeat accepted parts, and cancellation supersedes unfinished parts');

 mode='window';const requestId=crypto.randomUUID();await sendWhatsappSample(env,owner,{requestId},meta,clock);let sample=(await jobs()).results.find(j=>j.id==='sample:'+requestId);assert.equal(sample.state,'BLOCKED');assert.match(sample.error,/24 horas/);const count=sent.length;
 await sendWhatsappSample(env,owner,{requestId},meta,clock+4000);assert.equal(sent.length,count,'same test request is idempotent even after failure');
 mode='ok';await resolveWhatsappJob(env,owner,{id:sample.id,action:'retry'},clock+8000,meta);sample=(await jobs()).results.find(j=>j.id==='sample:'+requestId);assert.equal(sample.state,'SENT');assert.match(sample.body,/Pedido fictício/);
 await setWhatsappEnabled(env,owner,false,clock);await save({});await tick();assert.equal(sent.length,count+1,'pause prevents order sends');
 const queuedSample=crypto.randomUUID();await DB.prepare("UPDATE whatsapp_connection SET lease_until=? WHERE id='main'").bind(clock+30000).run();
 await sendWhatsappSample(env,owner,{requestId:queuedSample},meta,clock);assert.equal(sent.length,count+1);
 await DB.prepare("UPDATE whatsapp_connection SET lease_until=0,next_run_at=0 WHERE id='main'").run();await tick();assert.equal(sent.length,count+2,'explicit sample queued behind another tablet is delivered even while automatic order notices are paused');
 assert.ok(!whatsappOrderText(takeout).includes('Rua de Exemplo'));
 console.log('PASS: fictitious sample uses the same official transport and private recipient, respects service-window errors and idempotency; pausing disables automatic sends without touching RawBT or iFood');
}finally{Date.now=realNow;await mf.dispose();}
