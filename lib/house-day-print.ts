import type {HouseDaySnapshot,HouseOrder} from './house-state.ts';
import type {KitchenOrder} from './order-state.ts';
import type {PrinterLock} from './printer-lock.ts';
import {RawBtError,rawBtJob,sendRawBtJob,type PrintOptions} from './rawbt.ts';
import {requestId} from './request-id.ts';
type Ticket={jobId:string;token:string;order:KitchenOrder;alreadySent?:boolean};
type Command=(op:string,input:Record<string,unknown>)=>Promise<any>;
export const chronologicalHouseOrders=(orders:HouseOrder[])=>[...orders].sort((a,b)=>a.promisedAt.localeCompare(b.promisedAt)||a.number-b.number);
export class HouseDayPrintError extends Error{readonly completed:number;readonly total:number;constructor(completed:number,total:number,cause:unknown){super(`Envio interrompido após ${completed} de ${total}. ${cause instanceof Error?cause.message:'Confira a impressora antes de repetir.'}`);this.completed=completed;this.total=total;}}
export async function printHouseDayBatch(snapshot:HouseDaySnapshot,options:{command:Command;lock:PrinterLock;signal:AbortSignal;completion:'driver'|'submitted';transport?:Pick<PrintOptions,'createSocket'|'connectTimeoutMs'|'resultTimeoutMs'|'submitGraceMs'>;onProgress?:(done:number,total:number)=>void}){
 const orders=chronologicalHouseOrders(snapshot.orders);let completed=0;
 options.onProgress?.(0,orders.length);
 try{
  for(const order of orders){
   if(options.signal.aborted)throw new RawBtError(false,'cancelled');
   // Release the shared lock after each receipt. New iFood/Casa production
   // receipts can run between freezer copies; the day copies keep their order.
   const acquired=await options.lock(options.signal,true,async()=>{
    const ticket=await options.command('print-day',{orderId:order.id,revision:order.revision,requestId:requestId()}) as Ticket;
    if(ticket.alreadySent)return;
    let began=false;
    try{
     const job=rawBtJob(ticket.order,`casa-dia-${requestId()}`);
     const result=await sendRawBtJob(job,{...options.transport,signal:options.signal,completion:options.completion,beforeSend:async()=>{
      const latest=await options.command('print-begin',{jobId:ticket.jobId,token:ticket.token});began=true;Object.assign(job,rawBtJob(latest.order,job.idJob));
     }});
     await options.command('print-result',{jobId:ticket.jobId,token:ticket.token,result:result.completion});
    }catch(e){try{await options.command('print-result',{jobId:ticket.jobId,token:ticket.token,result:(e instanceof RawBtError?e.sent:began)?'review':'not-sent'});}catch{}throw e;}
   });
   if(!acquired)throw new Error('A impressora está ocupada. Confira a fila.');
   completed++;options.onProgress?.(completed,orders.length);
  }
  return completed;
 }catch(e){throw new HouseDayPrintError(completed,orders.length,e);}
}

export type HouseDayBrowserTicket={jobId:string;token:string;order:KitchenOrder};
// Browser print dialogs cannot tell us whether paper came out. Keep REVIEW
// until the person explicitly confirms the paper, never on preview alone.
export async function prepareHouseDayBrowserPrint(snapshot:HouseDaySnapshot,command:Command){
 const tickets:HouseDayBrowserTicket[]=[];
 for(const order of chronologicalHouseOrders(snapshot.orders)){
  const ticket=await command('print-day',{orderId:order.id,revision:order.revision,requestId:requestId()}) as Ticket;
  if(ticket.alreadySent)continue;
  let began=false;
  try{const latest=await command('print-begin',{jobId:ticket.jobId,token:ticket.token});began=true;await command('print-result',{jobId:ticket.jobId,token:ticket.token,result:'review'});tickets.push({...ticket,order:latest.order});}
  catch(e){try{await command('print-result',{jobId:ticket.jobId,token:ticket.token,result:began?'review':'not-sent'});}catch{}throw e;}
 }
 return tickets;
}
export async function confirmHouseDayBrowserPrint(tickets:HouseDayBrowserTicket[],printed:boolean,command:Command){
 for(const t of tickets)await command('print-result',{jobId:t.jobId,token:t.token,result:printed?'manual-confirmed':'not-sent'});
}
