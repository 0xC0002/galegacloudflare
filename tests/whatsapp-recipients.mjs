import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {houseActor,registerHouseStation} from '../lib/house-auth.ts';
import {saveHouseOrder,changeHouseStatus} from '../lib/house.ts';
import {connectWhatsapp,setWhatsappEnabled,whatsappTick,whatsappStatus,reconcileWhatsapp,resolveWhatsappJob,sendWhatsappSample} from '../lib/whatsapp.ts';
import {normalizeRecipientPhone,whatsappRecipientStatus,changeWhatsappRecipient,ensureWhatsappRecipients} from '../lib/whatsapp-recipients.ts';
const require=createRequire(import.meta.url),{Miniflare}=createRequire(require.resolve('wrangler/package.json'))('miniflare');
const mf=new Miniflare({modules:true,script:'export default{fetch(){return new Response("test")}}',compatibilityDate:'2026-05-15',d1Databases:['DB']}),DB=await mf.getD1Database('DB'),realNow=Date.now;
let clock=Date.parse('2026-11-11T12:00:00Z');Date.now=()=>clock;
const first='5521999990000',second='5521999990001',third='5521999990002',env={DB,WHATSAPP_TEST_TO:first,WHATSAPP_CONFIG_KEY:'c4'.repeat(32)},token='synthetic-meta-token-'.repeat(4),phoneId='123456789012345';
let calls=[],block=null,timeout=null,hold=null;
const meta=async(url,init)=>{assert.equal(new URL(url).hostname,'graph.facebook.com');if(init.method!=='POST')return Response.json({id:phoneId,display_phone_number:'Número fictício'});const body=JSON.parse(init.body);calls.push(body);if(hold)await hold;if(body.to===timeout)throw Error('uncertain');if(body.to===block)return Response.json({error:{code:131030}},{status:400});return Response.json({messages:[{id:'wamid.synthetic-'+calls.length}]});};
const tick=async()=>{clock+=4000;return whatsappTick(env,meta,clock);};
try{
 for(const f of(await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())for(const sql of(await readFile(new URL('../drizzle/'+f,import.meta.url),'utf8')).split(';').filter(s=>s.trim()))await DB.prepare(sql).run();
 const identity={userId:'recipients-owner',email:'owner@lab.test',displayName:'Owner'},owner=await houseActor(DB,identity.email,identity);
 const actors=[];for(const role of ['attendant','manager','production']){const id=crypto.randomUUID();await registerHouseStation(DB,owner,{id,deviceId:crypto.randomUUID(),name:role,profile:role});actors.push(await houseActor(DB,identity.email,identity,id));}
 let list=await whatsappRecipientStatus(env,owner,clock);assert.equal(list.recipients.length,1);assert.equal(list.recipients[0].phone,first);
 for(const a of actors){assert.equal((await whatsappRecipientStatus(env,{...a,realRole:a.role},clock)).recipients[0].phone,first);}
 assert.equal(normalizeRecipientPhone('(21) 99999-0001'),second);assert.equal(normalizeRecipientPhone('+55 (21) 99999-0001'),second);assert.throws(()=>normalizeRecipientPhone('https://example.com/21999990001'));
 await assert.rejects(changeWhatsappRecipient(env,owner,{op:'add',phone:second,revision:list.revision,consent:false},clock),e=>e.status===400);
 const actor={...actors[2],realRole:'production'};
 list=await changeWhatsappRecipient(env,actor,{op:'add',name:'Entregador B',phone:second,revision:list.revision,consent:true},clock);assert.equal(list.recipients.length,2);
 await assert.rejects(changeWhatsappRecipient(env,actor,{op:'add',phone:second,revision:list.revision,consent:true},clock),/já está/);
 await assert.rejects(changeWhatsappRecipient(env,actor,{op:'remove',phone:first,revision:0},clock),/outro aparelho/);
 await connectWhatsapp(env,owner,{token,phoneId},meta,clock);clock+=1000;await setWhatsappEnabled(env,owner,true,clock);
 const draft={brand:'GALEGA',customer:'Cliente fictício',phone:'21999990000',modality:'DELIVERY',timing:'NOW',date:'2026-11-11',time:'09:00',address:'Rua Fictícia, 1',items:[{name:'Churros',quantity:50,flavors:[{name:'Doce de leite',quantity:50}],observations:''}],observations:'',totalCents:3000,paid:false,leadMinutes:60};
 const save=()=>saveHouseOrder(DB,actors[1],{requestId:crypto.randomUUID(),order:draft});
 const order=await save();await tick();await tick();assert.equal(calls.length,2);assert.deepEqual(calls.map(x=>x.to).sort(),[first,second]);await tick();assert.equal(calls.length,2);
 const jobs=await DB.prepare('SELECT * FROM house_whatsapp_jobs WHERE order_id=?').bind(order.id).all();assert.equal(jobs.results.length,2);assert.ok(jobs.results.every(j=>j.state==='SENT'&&j.sent_parts===1));
 // The new courier receives new releases, never a historical backlog or its cancellation.
 clock+=1;list=await changeWhatsappRecipient(env,actor,{op:'add',phone:third,name:'Entregador C',revision:list.revision,consent:true},clock);await tick();assert.equal(calls.length,2);
 await changeHouseStatus(DB,actors[1],{id:order.id,revision:order.revision,requestId:crypto.randomUUID()},'cancel');await tick();await tick();assert.equal(calls.length,4);assert.ok(calls.slice(2).every(x=>x.to!==third&&x.text.body.startsWith('CANCELADO')));
 const next=await save();block=second;await tick();await tick();await tick();let states=(await DB.prepare('SELECT * FROM house_whatsapp_jobs WHERE order_id=?').bind(next.id).all()).results;assert.equal(states.filter(x=>x.state==='SENT').length,2);assert.equal(states.find(x=>x.recipient_phone===second).state,'BLOCKED');
 const accepted=calls.filter(x=>x.to!==second).length;block=null;await resolveWhatsappJob(env,owner,{id:states.find(x=>x.recipient_phone===second).id,action:'retry'},clock,meta);await tick();assert.equal(calls.filter(x=>x.to!==second).length,accepted,'retry affects only the failed recipient');
 // Eight tablets can race; removal must not retarget an existing job.
 const queued=await save();await reconcileWhatsapp(env,clock);list=await changeWhatsappRecipient(env,actor,{op:'remove',phone:second,revision:list.revision},clock);const atRemove=calls.filter(x=>x.to===second).length;
 let release;hold=new Promise(r=>release=r);clock+=4000;const races=Array.from({length:8},()=>whatsappTick(env,meta,clock));release();await Promise.all(races);hold=null;await tick();assert.equal(calls.filter(x=>x.to===second).length,atRemove);
 states=(await DB.prepare('SELECT * FROM house_whatsapp_jobs WHERE order_id=?').bind(queued.id).all()).results;assert.equal(states.find(x=>x.recipient_phone===second).state,'VOID');assert.equal(states.filter(x=>x.state==='SENT').length,2);
 clock++;list=await changeWhatsappRecipient(env,actor,{op:'add',phone:second,revision:list.revision,consent:true},clock);await tick();assert.equal(calls.filter(x=>x.to===second).length,atRemove,'re-adding never replays old jobs');
 // Removing the entire list must not silently restore the original environment destination.
 for(const r of [...list.recipients])list=await changeWhatsappRecipient(env,actor,{op:'remove',phone:r.phone,revision:list.revision},++clock);
 await ensureWhatsappRecipients(env,clock);assert.equal((await whatsappRecipientStatus(env,owner,clock)).recipients.length,0);const beforeEmpty=calls.length;await save();await tick();assert.equal(calls.length,beforeEmpty);
 await assert.rejects(sendWhatsappSample(env,owner,{requestId:crypto.randomUUID()},meta,clock),/Adicione um entregador/);
 // Concurrent saves and test limit are checked on the server, not just in UI.
 const revision=list.revision,changes=await Promise.allSettled([first,second].map(phone=>changeWhatsappRecipient(env,actor,{op:'add',phone,revision,consent:true},clock)));assert.equal(changes.filter(x=>x.status==='fulfilled').length,1);
 list=await whatsappRecipientStatus(env,owner,clock);for(const phone of ['5521999990003','5521999990004','5521999990005','5521999990006'])list=await changeWhatsappRecipient(env,actor,{op:'add',phone,revision:list.revision,consent:true},++clock);
 await assert.rejects(changeWhatsappRecipient(env,actor,{op:'add',phone:'5521999990007',revision:list.revision,consent:true},clock),/cinco/);
 await assert.rejects(sendWhatsappSample(env,owner,{requestId:crypto.randomUUID()},meta,clock),/Selecione o entregador/);
 const selected=list.recipients[0],other=list.recipients[1],sampleRequest=crypto.randomUUID(),beforeSample=calls.length;
 await sendWhatsappSample(env,owner,{requestId:sampleRequest,recipientPhone:selected.phone},meta,clock);assert.equal(calls.length,beforeSample+1);assert.equal(calls.at(-1).to,selected.phone,'sample sends only to the explicitly selected active courier');
 await sendWhatsappSample(env,owner,{requestId:sampleRequest,recipientPhone:selected.phone},meta,clock+4000);assert.equal(calls.length,beforeSample+1,'same sample cannot silently duplicate');
 await assert.rejects(sendWhatsappSample(env,owner,{requestId:sampleRequest,recipientPhone:other.phone},meta,clock+8000),/outro destinatário/);
 await assert.rejects(sendWhatsappSample(env,owner,{requestId:crypto.randomUUID(),recipientPhone:'5521999990099'},meta,clock+8000),/Selecione o entregador/);
 const status=await whatsappStatus(env,owner);assert.ok(!JSON.stringify(status).includes(token));assert.equal(status.recipients.length,5);assert.ok(status.jobs.every(j=>j.recipientPhone));
 console.log('PASS: shared recipient list for all roles, phone normalization, opt-in, optimistic concurrency, five-number test cap, one send per recipient, independent failures/retry, recipient-specific corrections, no backlog on addition, stop on removal, no reroute/replay on re-add and empty-list persistence');
}finally{Date.now=realNow;await mf.dispose();}
