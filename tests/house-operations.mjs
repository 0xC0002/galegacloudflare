import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {houseActor,registerHouseStation} from '../lib/house-auth.ts';
import {saveHouseOrder,getHouseOrder,houseSnapshot,changeHouseStatus,reopenHouseOrder,releaseHouseDueOrders,separateHouseOrder} from '../lib/house.ts';
import {houseWorkspaceQueues,applyHouseWorkspaceOrder} from '../lib/house-queues.ts';
import {requestHousePrint,beginHousePrint,finishHousePrint} from '../lib/house-print.ts';
import {HOUSE_CANCELLATION_TTL_MS,houseCancellationActive,visibleHouseCancellations,readHouseDismissals} from '../lib/house-cancellations.ts';
import {createHouseNotificationState,collectHouseNotifications,hasPendingHouseCancellation} from '../lib/house-notifications.ts';
const require=createRequire(import.meta.url),{Miniflare}=createRequire(require.resolve('wrangler/package.json'))('miniflare');
const mf=new Miniflare({modules:true,script:'export default{fetch(){return new Response("test")}}',compatibilityDate:'2026-05-15',d1Databases:['DB']}),DB=await mf.getD1Database('DB'),realNow=Date.now;
let clock=Date.parse('2026-11-10T23:50:00Z');Date.now=()=>clock;
try{
 for(const f of(await readdir(new URL('../drizzle/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())for(const sql of(await readFile(new URL('../drizzle/'+f,import.meta.url),'utf8')).split(';').filter(s=>s.trim()))await DB.prepare(sql).run();
 const identity={userId:'operations-owner',email:'owner@lab.test',displayName:'Bruno'},owner=await houseActor(DB,identity.email,identity);
 const station=async profile=>{const id=crypto.randomUUID();await registerHouseStation(DB,owner,{id,deviceId:crypto.randomUUID(),name:profile,profile});return houseActor(DB,identity.email,identity,id);};
 const manager=await station('manager'),attendant=await station('attendant'),production=await station('production'),otherProduction=await station('production');
 const draft={brand:'GALEGA',customer:'Cliente fictício',phone:'21999990000',modality:'TAKEOUT',timing:'NOW',date:'2026-11-10',time:'20:50',address:'',items:[{name:'Salgadinhos',quantity:100,flavors:[],observations:''}],observations:'',totalCents:5500,paid:false,leadMinutes:60};
 const save=over=>saveHouseOrder(DB,attendant,{requestId:crypto.randomUUID(),order:{...draft,...over}});
 const foodId=crypto.randomUUID();await DB.prepare('INSERT INTO received_orders(id,display_id,merchant_id,customer,created_at,received_at,updated_at,payload) VALUES (?,?,?,?,?,?,?,?)').bind(foodId,'1234','ifood-fixture','Cliente iFood',new Date(clock).toISOString(),new Date(clock).toISOString(),new Date(clock).toISOString(),'{"source":"IFOOD"}').run();
 const foodBefore=JSON.stringify(await DB.prepare('SELECT * FROM received_orders WHERE id=?').bind(foodId).first());
 const baseline=await houseSnapshot(DB,production,draft.date,'kitchen'),notices=createHouseNotificationState();collectHouseNotifications(notices,baseline);
 const o=await save({}),cancelled=await changeHouseStatus(DB,manager,{id:o.id,revision:o.revision,requestId:crypto.randomUUID()},'cancel'),cancelTime=new Date(clock).toISOString();
 for(const actor of [manager,attendant,production,otherProduction])for(const view of actor.role==='production'?['counter','kitchen']:['counter','kitchen','house']){
  const snap=await houseSnapshot(DB,actor,draft.date,view),notice=snap.cancellations.find(n=>n.orderId===cancelled.id);assert.ok(notice,actor.role+' '+view+' receives the cancellation even when manager already acknowledged it');assert.equal(notice.createdAt,cancelTime);
  if(actor.role==='production'){assert.equal(snap.alerts.length,0);assert.equal(snap.messages.length,0);}
 }
 const snap=await houseSnapshot(DB,production,draft.date,'kitchen'),notice=snap.cancellations[0];assert.equal(collectHouseNotifications(notices,snap).urgent,true);assert.equal(collectHouseNotifications(notices,snap).urgent,false);
 const dismissed=readHouseDismissals(JSON.stringify({[notice.id]:clock+HOUSE_CANCELLATION_TTL_MS}),clock);
 assert.equal(visibleHouseCancellations(snap.cancellations,dismissed,clock).length,0,'X closes only this device');assert.equal(visibleHouseCancellations(snap.cancellations,{},clock).length,1,'another device is unaffected');
 assert.equal(visibleHouseCancellations(snap.cancellations,readHouseDismissals(JSON.stringify(dismissed),clock+1000),clock+1000).length,0,'dismissal survives a reload/profile switch on the same device');
 assert.deepEqual(readHouseDismissals('invalid JSON',clock),{});assert.equal(houseCancellationActive(cancelTime,clock+HOUSE_CANCELLATION_TTL_MS-1),true);assert.equal(houseCancellationActive(cancelTime,clock+HOUSE_CANCELLATION_TTL_MS),false);
 clock+=HOUSE_CANCELLATION_TTL_MS;const expired=await houseSnapshot(DB,production,draft.date,'kitchen');assert.equal(expired.cancellations.length,0);assert.equal(hasPendingHouseCancellation(expired),false);assert.equal(collectHouseNotifications(createHouseNotificationState(),expired).urgent,false);
 assert.ok(expired.jobs.some(j=>j.kind==='CANCEL'&&j.state==='QUEUED'),'notice expiration never discards an unprinted cancellation sheet');
 console.log('PASS: all operational profiles receive timestamped Casa cancellations; close is per device and survives profile changes; exact 15-minute expiry does not lose print jobs or reveal chat/private alerts');

 const future=await save({timing:'SCHEDULED',date:'2026-11-12',time:'15:00'});await assert.rejects(reopenHouseOrder(DB,production,{id:future.id,revision:future.revision,requestId:crypto.randomUUID()}),e=>e.status===409);
 await assert.rejects(reopenHouseOrder(DB,production,{id:cancelled.id,revision:cancelled.revision,requestId:crypto.randomUUID()}),e=>e.status===409);
 await assert.rejects(reopenHouseOrder(DB,production,{id:foodId,revision:1,requestId:crypto.randomUUID()}),e=>e.status===404);
 for(const actor of [manager,attendant,production]){
  let active=await save({customer:'Restaurar '+actor.role});await separateHouseOrder(DB,production,{id:active.id,revision:active.revision,requestId:crypto.randomUUID()});active=await getHouseOrder(DB,active.id);
  const print=await requestHousePrint(DB,production,{orderId:active.id,requestId:crypto.randomUUID(),reprint:true});await beginHousePrint(DB,production,print);await finishHousePrint(DB,production,{...print,result:'driver'});
  const finished=await changeHouseStatus(DB,actor,{id:active.id,revision:active.revision,requestId:crypto.randomUUID()},'finish'),archived=await houseSnapshot(DB,production,draft.date,'counter');assert.ok(archived.archivedOrders.some(x=>x.id===finished.id));
  const input={id:finished.id,revision:finished.revision,requestId:crypto.randomUUID()},restored=await reopenHouseOrder(DB,actor,input);assert.equal(restored.status,'PREPARING');assert.equal(restored.kitchenStage,'SEPARATED');assert.equal(restored.promisedAt,active.promisedAt);assert.equal(restored.releasedAt,active.releasedAt);
  assert.equal((await reopenHouseOrder(DB,actor,input)).revision,restored.revision,'repeat command is idempotent');await releaseHouseDueOrders(DB);
  const fresh=await houseSnapshot(DB,otherProduction,draft.date,'counter');assert.ok(fresh.orders.some(x=>x.id===restored.id));assert.ok(!fresh.archivedOrders.some(x=>x.id===restored.id));
  const q=houseWorkspaceQueues(fresh.orders,fresh.archivedOrders);assert.ok(q.active.some(x=>x.id===restored.id));assert.ok(q.separated.some(x=>x.id===restored.id));assert.ok(!q.waiting.some(x=>x.id===restored.id));
  assert.equal((await DB.prepare("SELECT COUNT(*) n FROM house_print_jobs WHERE order_id=? AND revision=? AND state IN ('QUEUED','LEASED','SENDING')").bind(restored.id,restored.revision).first()).n,0,'restore never generates another automatic receipt');
  const local=applyHouseWorkspaceOrder(archived,restored);assert.ok(houseWorkspaceQueues(local.orders,local.archivedOrders).active.some(x=>x.id===restored.id));assert.ok(!local.archivedOrders.some(x=>x.id===restored.id));
  const manual=await requestHousePrint(DB,actor,{orderId:restored.id,requestId:crypto.randomUUID(),reprint:true});assert.ok(manual.jobId,'one-tap manual printing remains available');
  await assert.rejects(changeHouseStatus(DB,actor,{id:restored.id,revision:finished.revision,requestId:crypto.randomUUID()},'finish'),e=>e.status===409);
 }
 assert.equal(JSON.stringify(await DB.prepare('SELECT * FROM received_orders WHERE id=?').bind(foodId).first()),foodBefore,'Casa operations never alter the iFood row');
 await assert.rejects(changeHouseStatus(DB,production,{id:cancelled.id,revision:cancelled.revision,requestId:crypto.randomUUID()},'cancel'),e=>e.status===403);
 console.log('PASS: Casa-only finish/reopen permissions, persistence across stations, original order identity/timing/tray stage, no reprint on restore, manual printing preserved, stale revisions rejected and iFood data unchanged');
}finally{Date.now=realNow;await mf.dispose();}
