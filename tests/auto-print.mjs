import assert from 'node:assert/strict';
import { emptyPrintQueue, readPrintQueue, scanPrintQueue, setPrintEnabled, nextPrintOrder, recoverInterruptedPrints, resolvePrintJob } from '../lib/auto-print.ts';
import { rawBtJob, rawBtTestJob, sendRawBtJob, RAWBT_SOCKET_URL } from '../lib/rawbt.ts';
import { rawBtUri } from '../lib/receipt.ts';

const makeOrder = (id, changes = {}) => ({ id, displayId:id, customer:'Cliente ficticio', createdAt:'2026-11-04T12:00:00Z', receivedAt:'2026-11-04T12:00:01Z', isTest:true, cancelled:false, items:[{name:'Coxinha',quantity:10,unit:'UN',group:'',observations:'Sem pimenta',options:[]}], observations:'Enviar bebida separada', timing:'IMMEDIATE',preparationStart:'',category:'FOOD',orderType:'TAKEOUT',deliveredBy:'MERCHANT',status:'PLACED',statusAt:'2026-11-04T12:00:00Z',kitchenStage:'WAITING',kitchenUpdatedAt:null,kitchenNeedsReview:false,pendingAction:null,actionError:null,...changes });
const old = makeOrder('old'), a = makeOrder('a'), b = makeOrder('b', {status:'CONFIRMED'}), c = makeOrder('c', {timing:'SCHEDULED'});
const closed = makeOrder('closed', {status:'CONCLUDED'}), cancelled = makeOrder('cancelled', {cancelled:true,status:'CANCELLED'});
const q = emptyPrintQueue();
scanPrintQueue(q, [old, closed, cancelled], 1);
setPrintEnabled(q, true, [old, closed, cancelled], 2);
assert.deepEqual(q.jobs, {}, 'activating printing must not replay the current screen/history');
scanPrintQueue(q, [old, closed, cancelled, a, b, c], 3);
assert.deepEqual(Object.keys(q.jobs), ['a','b','c'], 'PLACED, auto-confirmed and scheduled arrivals are queued immediately');
assert.equal(nextPrintOrder(q, [c,b,a]).id, 'a', 'simultaneous receipts have stable serial order');
q.jobs.a.state = 'sending';
scanPrintQueue(q, [old, {...a,status:'CONFIRMED'},b,c],4);
assert.equal(q.jobs.a.state, 'sending', 'a status update must not reset an in-flight receipt');
delete q.jobs.a;
scanPrintQueue(q, [old, {...a,status:'PREPARING'},b,c],5);
assert.equal(q.jobs.a, undefined, 'confirmation/status/repeated snapshots do not print twice');
const restored = readPrintQueue(JSON.stringify(q));
scanPrintQueue(restored,[old,a,b,c],6);
assert.equal(restored.jobs.a,undefined,'reload retains identifiers for already sent receipts');
restored.jobs.b.state='sending';
recoverInterruptedPrints(restored,7);
assert.equal(restored.jobs.b.state,'review','a reload with unknown send result requires human review, never automatic replay');
assert.equal(nextPrintOrder(restored,[a,b,c]).id,'c');
resolvePrintJob(restored,'b',true,8);
assert.equal(restored.jobs.b.state,'queued');
scanPrintQueue(restored,[{...b,status:'CONCLUDED'},c],9);
assert.equal(restored.jobs.b.manual,true,'an explicit reprint remains possible after conclusion');
resolvePrintJob(restored,'b',false,10);
scanPrintQueue(restored,[b,{...c,status:'CANCELLED',cancelled:true}],11);
assert.deepEqual(restored.jobs,{},'cancelled automatic jobs are removed before sending');
setPrintEnabled(restored,false,[a,b],12);
const whileOff=makeOrder('while-off');
scanPrintQueue(restored,[a,b,whileOff],13);
setPrintEnabled(restored,true,[a,b,whileOff],14);
assert.deepEqual(restored.jobs,{},'resuming never unexpectedly prints the off-period backlog');
const later=makeOrder('later');
scanPrintQueue(restored,[a,b,whileOff,later],15);
scanPrintQueue(restored,[{...later,kitchenStage:'SEPARATED'}],16);
assert.equal(nextPrintOrder(restored,[{...later,kitchenStage:'SEPARATED'}]).id,'later','an already queued receipt is preserved when the person marks separation');
assert.throws(()=>readPrintQueue('{broken'));
assert.throws(()=>readPrintQueue('{"version":9}'));
const persisted=JSON.stringify(restored);
for(const personal of ['Cliente ficticio','Coxinha','Sem pimenta','Enviar bebida separada'])assert.ok(!persisted.includes(personal),'queue persistence contains no receipt/customer payload');
console.log('PASS: durable arrival queue, baseline/history exclusion, status deduplication, cancellation, scheduled orders, reload and explicit uncertain-result recovery');

const job=rawBtJob(a,'job-a');
assert.deepEqual(job.commands,[{command:'sendBytes',base64:rawBtUri(a).slice('rawbt:base64,'.length)}]);
assert.equal(job.copies,1);assert.equal(job.template,'none');assert.equal(job.printer,'current');
assert.match(Buffer.from(rawBtTestJob('test').commands[0].base64,'base64').toString('ascii'),/NAO E UM PEDIDO/);
class Socket {
 onopen=null;onmessage=null;onclose=null;onerror=null; sent=[]; closed=false;
 send(data){this.sent.push(data);}
 close(){this.closed=true;}
 open(){this.onopen?.({});}
 message(data){this.onmessage?.({data:typeof data==='string'?data:JSON.stringify(data)});}
}
const s=new Socket(),operations=[];
let finished=false;
const pending=sendRawBtJob(job,{createSocket:url=>{assert.equal(url,RAWBT_SOCKET_URL);return s;},beforeSend:()=>operations.push('persist'),connectTimeoutMs:500,resultTimeoutMs:500}).then(()=>{finished=true;operations.push('success');});
s.open();operations.push('sent');
assert.deepEqual(operations,['persist','sent'],'the sending record is saved before bytes leave');
assert.equal(s.sent.length,1);assert.deepEqual(JSON.parse(s.sent[0]),job);
s.message({jobId:'other',responseType:'success'});
s.message({jobId:'job-a',responseType:'progress',progress:100});
await Promise.resolve();assert.equal(finished,false,'socket open/progress/unrelated success is not a completed receipt');
s.message({jobId:'job-a',responseType:'success'});await pending;
assert.equal(finished,true);assert.equal(s.closed,true);
for(const responseType of ['error','canceled']){
 const socket=new Socket();const result=sendRawBtJob(job,{createSocket:()=>socket});socket.open();socket.message({jobId:job.idJob,responseType});
 await assert.rejects(result,e=>e.sent===true,'driver failure after sending must not be silently retried');
}
{
 const socket=new Socket();const result=sendRawBtJob(job,{createSocket:()=>socket});socket.onerror?.({});await assert.rejects(result,e=>e.sent===false);
}
{
 const socket=new Socket();const result=sendRawBtJob(job,{createSocket:()=>socket});socket.open();socket.onclose?.({});await assert.rejects(result,e=>e.sent===true);
}
{
 const socket=new Socket();const result=sendRawBtJob(job,{createSocket:()=>socket,beforeSend:()=>{throw new Error('storage full');}});socket.open();await assert.rejects(result,e=>!e.sent&&e.kind==='storage');assert.equal(socket.sent.length,0);
}
{
 const {RawBtError}=await import('../lib/rawbt.ts');
 const socket=new Socket();const result=sendRawBtJob(job,{createSocket:()=>socket,beforeSend:()=>{throw new RawBtError(false,'stale');}});socket.open();await assert.rejects(result,e=>!e.sent&&e.kind==='stale');assert.equal(socket.sent.length,0,'cancellation discovered during connection must prevent sending');
}
{
 const result=sendRawBtJob(job,{createSocket:()=>{const e=new Error('denied');e.name='SecurityError';throw e;}});await assert.rejects(result,e=>!e.sent&&e.kind==='permission');
}
{
 const socket=new Socket();const result=sendRawBtJob(job,{createSocket:()=>socket,resultTimeoutMs:5});socket.open();await assert.rejects(result,e=>e.sent===true,'lost acknowledgements remain uncertain');
}
{
 const socket=new Socket(),abort=new AbortController();const result=sendRawBtJob(job,{createSocket:()=>socket,signal:abort.signal});socket.open();abort.abort();await assert.rejects(result,e=>e.sent===true);
}
console.log('PASS: exact ESC/POS bytes, RawBT JSON protocol, correlated success acknowledgement, persist-before-send, blocked permission, disconnection, timeout and interruption');
