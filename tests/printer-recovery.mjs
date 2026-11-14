import assert from 'node:assert/strict';
import { KitchenPrinterController } from '../lib/kitchen-printer-controller.ts';
import { emptyPrintQueue, readPrintQueue } from '../lib/auto-print.ts';
import { rawBtResponse, rawBtTestJob, sendRawBtJob } from '../lib/rawbt.ts';
import { PrinterLockBusy } from '../lib/printer-lock.ts';

const order = id => ({ id, displayId:id, customer:'FICTICIO', createdAt:'2026-11-04T12:00:00Z',receivedAt:'2026-11-04T12:00:01Z',isTest:true,cancelled:false,items:[],observations:'',timing:'IMMEDIATE',preparationStart:'',category:'FOOD',orderType:'TAKEOUT',deliveredBy:'MERCHANT',status:'PLACED',statusAt:'2026-11-04T12:00:00Z',kitchenStage:'WAITING',kitchenUpdatedAt:null,kitchenNeedsReview:false,pendingAction:null,actionError:null });
const memory = (initial = emptyPrintQueue()) => {
 let value=JSON.stringify(initial);
 return { getItem:()=>value,setItem:(_key,next)=>{value=next;},queue:()=>readPrintQueue(value) };
};
const lock = () => {
 let busy=false;
 return async(signal,wait,work)=>{
  if(busy){if(wait)throw new PrinterLockBusy();return false;}
  if(signal.aborted)return false;
  busy=true;try{await work();return true;}finally{busy=false;}
 };
};
const driver = () => {
 const sent=[],sockets=[];
 const control={mode:'modern',sent,sockets};
 control.createSocket=()=>{
  const socket={bufferedAmount:0,onopen:null,onclose:null,onerror:null,onmessage:null,closed:false,
   close(){this.closed=true;},
   send(text){const job=JSON.parse(text);sent.push(job);const mode=control.mode;
    queueMicrotask(()=>{
     if(mode==='modern')this.onmessage?.({data:JSON.stringify({jobId:job.idJob,responseType:'success'})});
     if(mode==='legacy')this.onmessage?.({data:JSON.stringify({status:'success',progress:100})});
     if(mode==='error')this.onmessage?.({data:JSON.stringify({jobId:job.idJob,responseType:'error'})});
    });
   }};
  sockets.push(socket);
  queueMicrotask(()=>{if(control.mode==='disconnected')socket.onerror?.({});else socket.onopen?.({});});
  return socket;
 };
 return control;
};
const until = async condition => {
 for(let i=0;i<100;i++){if(condition())return;await new Promise(resolve=>setTimeout(resolve,1));}
 throw new Error('Expected printer transition did not occur');
};
const create = (overrides={}) => {
 const storage=overrides.storage??memory(),service=overrides.service??driver();let state;
 const printer=new KitchenPrinterController({key:'local-test',storage,lock:overrides.lock??lock(),onChange:v=>{state=v;},transport:{createSocket:service.createSocket,connectTimeoutMs:50,resultTimeoutMs:50,submitGraceMs:1},testTimeoutMs:5,...overrides.deps});
 return {printer,storage,service,get state(){return state??printer.state;}};
};
assert.equal(rawBtResponse({status:'success'},'x'),'success');
assert.equal(rawBtResponse({responseType:'success',idJob:'x'},'x'),'success');
assert.equal(rawBtResponse({responseType:'success',jobId:'other'},'x'),null);
assert.equal(rawBtResponse({responseType:'success'},'x'),null);
assert.equal(rawBtResponse({responseType:'error'},'x'),'error');
assert.equal(rawBtResponse({status:'progress',progress:100},'x'),'progress');

// Reported case: physical output, but no completion response from the driver.
{
 const h=create();h.service.mode='silent';h.printer.update([],true);await h.printer.tick();
 await h.printer.testPrint();
 assert.equal(h.service.sent.length,1);
 assert.equal(h.state.testing,false,'a silent driver must not leave a spinner or lock behind');
 assert.equal(h.state.testSent,true,'physical test confirmation remains available without an acknowledgement');
 assert.equal(h.state.testAcknowledged,false);
 assert.equal(h.storage.queue().enabled,false,'send alone must not enable automation');
 await h.printer.confirmTest();
 assert.equal(h.storage.queue().enabled,true);
 assert.equal(h.storage.queue().completion,'submitted');
 h.printer.update([order('first')],true);await h.printer.tick();
 h.printer.update([order('first'),order('second')],true);await h.printer.tick();
 assert.equal(h.service.sent.length,3,'a no-ack driver still receives one copy of each new order after physical calibration');
 await h.printer.tick();assert.equal(h.service.sent.length,3,'resynchronizing never repeats sent receipts');
 h.printer.dispose();
}
// Confirming the visible paper can cancel the wait immediately, not after a timeout.
{
 const h=create({deps:{testTimeoutMs:30_000}});h.service.mode='silent';h.printer.update([],true);await h.printer.tick();
 const testing=h.printer.testPrint();await until(()=>h.state.testSent);
 await h.printer.confirmTest();await testing;
 assert.equal(h.state.testing,false);assert.equal(h.state.operationBusy,false);assert.equal(h.storage.queue().enabled,true);
 h.printer.dispose();
}
// Leaving the page after sending interrupts only that receipt and releases the lock.
{
 const h=create();h.printer.update([],true);await h.printer.tick();await h.printer.testPrint();await h.printer.confirmTest();
 h.service.mode='silent';h.printer.update([order('interrupted')],true);
 const sending=h.printer.tick();await until(()=>h.state.status==='printing');
 h.printer.update([order('interrupted')],false);await sending;
 assert.equal(h.storage.queue().jobs.interrupted.state,'review');
 assert.equal(h.state.operationBusy,false);
 h.service.mode='modern';h.printer.update([order('interrupted'),order('new-after-return')],true);await h.printer.resume();
 assert.equal(h.service.sent.length,3,'a review must not block a different new order');
 assert.equal(h.storage.queue().jobs.interrupted.state,'review');
 await h.printer.tick();assert.equal(h.service.sent.length,3,'the interrupted receipt is not automatically duplicated');
 await h.printer.resolve('interrupted',false);assert.deepEqual(h.storage.queue().jobs,{});
 h.printer.dispose();
}
// Reload recovers old v3 entries, preserves seen identifiers and does not replay history.
{
 const initial={...emptyPrintQueue(),enabled:true,initialized:true,seen:['old'],jobs:{old:{state:'sending',updatedAt:1}}};
 const h=create({storage:memory(initial)});h.printer.update([order('old'),order('fresh')],true);await h.printer.tick();
 assert.equal(h.storage.queue().jobs.old.state,'review');assert.equal(h.service.sent.length,1);
 h.printer.dispose();
 const next=create({storage:h.storage,service:h.service});next.printer.update([order('old'),order('fresh')],true);await next.printer.tick();assert.equal(h.service.sent.length,1);
 next.printer.dispose();
}
// Restarting the server and reconnecting must not lose arrivals during the test.
{
 const h=create();h.printer.update([],true);await h.printer.tick();await h.printer.testPrint();await h.printer.confirmTest();
 h.service.mode='disconnected';h.printer.update([order('waiting')],true);await h.printer.tick();
 assert.equal(h.storage.queue().jobs.waiting.state,'queued');assert.equal(h.state.status,'disconnected');
 h.service.mode='silent';const reconnect=h.printer.reconnect();await until(()=>h.state.testSent);
 h.printer.update([order('waiting'),order('during-reconnect')],true);
 await h.printer.confirmTest();await reconnect;
 assert.equal(h.storage.queue().jobs['during-reconnect'].state,'queued');
 h.service.mode='modern';await h.printer.tick();await h.printer.tick();
 assert.deepEqual(h.storage.queue().jobs,{});assert.equal(h.state.operationBusy,false);
 h.printer.dispose();
}
// Android may suspend timers. Resuming uses wall time to release the old operation.
{
 const initial={...emptyPrintQueue(),enabled:true,initialized:true,seen:['manual'],jobs:{manual:{state:'queued',updatedAt:1}}};
 const h=create({storage:memory(initial)});h.printer.update([order('manual')],true);
 await h.printer.setEnabled(false);
 assert.equal(h.storage.queue().enabled,false);assert.equal(h.storage.queue().jobs.manual.state,'review','manual handoff reserves unsent receipts before opening RawBT');
 await h.printer.testPrint();await h.printer.confirmTest();await h.printer.tick();
 assert.equal(h.service.sent.length,1,'returning to automatic mode does not duplicate manually reserved receipts');
 h.printer.dispose();
}
{
 let now=Date.now();const h=create({deps:{now:()=>now,testTimeoutMs:60_000}});h.service.mode='silent';h.printer.update([],true);await h.printer.tick();
 const test=h.printer.testPrint();await until(()=>h.state.testSent);now+=120_000;
 await h.printer.resume();await test;assert.equal(h.state.operationBusy,false);assert.equal(h.state.testing,false);
 h.printer.dispose();
}
// A competing window or storage failure must not be misreported as a printed receipt.
{
 const h=create({lock:async()=>{throw new PrinterLockBusy();}});h.printer.update([],true);await h.printer.testPrint();
 assert.equal(h.state.testing,false);assert.equal(h.state.status,'locked');assert.equal(h.service.sent.length,0);h.printer.dispose();
}
{
 const h=create({storage:{getItem:()=>null,setItem:()=>{throw new Error('full');}}});h.printer.update([],true);await h.printer.testPrint();
 assert.equal(h.state.status,'storage');assert.equal(h.state.testing,false);assert.equal(h.service.sent.length,0);h.printer.dispose();
}
// Submission mode is explicit and still refuses a send that never drains or fails.
{
 const socket={bufferedAmount:9,onopen:null,onclose:null,onerror:null,onmessage:null,send(){},close(){}};
 const pending=sendRawBtJob(rawBtTestJob('stuck'),{createSocket:()=>socket,completion:'submitted',resultTimeoutMs:3,submitGraceMs:1});socket.onopen();
 await assert.rejects(pending,e=>e.sent===true);
}
console.log('PASS: printed test without ACK, physical activation, legacy/current responses, interruption/reload, independent reviews, server restart, new arrivals during recovery, frozen timers, lock contention and storage failure');
