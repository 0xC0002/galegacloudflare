"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {Printer} from 'lucide-react';
import {houseCommand} from '@/lib/client-api';
import {requestId} from '@/lib/request-id';
import {browserPrinterLock} from '@/lib/printer-lock';
import {RawBtError,rawBtJob,sendRawBtJob} from '@/lib/rawbt';
import {HouseReceiptText} from './receipt-text';
import {rawBtUri,receiptText} from '@/lib/receipt';
import type {HouseOrder,HouseSnapshot,HousePrintJob} from '@/lib/house-state';
import type {KitchenOrder} from '@/lib/order-state';
import {Modal} from './house-components';
export const LAB_PRINTER_LOCK='galega-lab-printer';
type Ticket={jobId:string;token:string;kind:HousePrintJob['kind'];order:KitchenOrder};
type Config={snapshot:HouseSnapshot|null;active:boolean;enabled:boolean;supported:boolean;completion?:'driver'|'submitted';onRefresh:()=>void};
export function useHousePrinting(config:Config){
 const current=useRef(config);current.current=config;
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[dialog,setDialog]=useState<Ticket|null>(null),operation=useRef<AbortController|null>(null),retry=useRef(0),manual=useRef(false),claiming=useRef(false);
 const send=useCallback(async(ticket:Ticket)=>{
  if(operation.current)throw new Error('Aguarde a impressão em andamento.');
  const abort=new AbortController();operation.current=abort;setBusy(true);let began=false;
  try{
   const acquired=await browserPrinterLock(LAB_PRINTER_LOCK)(abort.signal,true,async()=>{
    const job=rawBtJob(ticket.order,`casa-${requestId()}`);
    try{
     const result=await sendRawBtJob(job,{signal:abort.signal,completion:current.current.completion||'driver',beforeSend:async()=>{
      const latest=await houseCommand<{order:KitchenOrder}>('print-begin',{jobId:ticket.jobId,token:ticket.token});began=true;Object.assign(job,rawBtJob(latest.order,job.idJob));
     }});
     await houseCommand('print-result',{jobId:ticket.jobId,token:ticket.token,result:result.completion});
    }catch(e){const uncertain=e instanceof RawBtError?e.sent:began;try{await houseCommand('print-result',{jobId:ticket.jobId,token:ticket.token,result:uncertain?'review':'not-sent'});}catch{}throw e;}
   });
   if(!acquired){await houseCommand('print-result',{jobId:ticket.jobId,token:ticket.token,result:'not-sent'});throw new RawBtError(false,'connection');}
   setError('');
  }catch(e){retry.current=Date.now()+15000;setError(e instanceof Error?e.message:'Confira a impressora.');throw e;}
  finally{if(operation.current===abort)operation.current=null;setBusy(false);current.current.onRefresh();}
 },[]);
 const direct=useCallback(async(ticket:Ticket)=>{
  if(current.current.supported&&current.current.enabled){await send(ticket);return;}
  // Same direct Android RawBT handoff used by the official iFood screen.
  const abort=new AbortController();operation.current=abort;let handed=false;
  try{
   const lock=navigator.locks?browserPrinterLock(LAB_PRINTER_LOCK):async(signal:AbortSignal,_wait:boolean,work:()=>Promise<void>)=>{if(signal.aborted)return false;await work();return true;};
   const acquired=await lock(abort.signal,true,async()=>{
    const latest=await houseCommand<{order:KitchenOrder}>('print-begin',{jobId:ticket.jobId,token:ticket.token});
    if(abort.signal.aborted)throw new RawBtError(false,'cancelled');
    const link=document.createElement('a');link.href=rawBtUri(latest.order);link.style.display='none';document.body.appendChild(link);handed=true;link.click();link.remove();
    // Intent handoff has no paper acknowledgement, as in the original app.
    await houseCommand('print-result',{jobId:ticket.jobId,token:ticket.token,result:'submitted'});
   });
   if(!acquired)throw new RawBtError(false,'connection');
  }catch(e){try{await houseCommand('print-result',{jobId:ticket.jobId,token:ticket.token,result:handed?'review':'not-sent'});}catch{}throw e;}
  finally{if(operation.current===abort)operation.current=null;}
 },[send]);
 const displayOrPrint=useCallback(async(ticket:Ticket)=>{
  if(/Android/i.test(navigator.userAgent))await direct(ticket);
  else{manual.current=true;setDialog(ticket);}
 },[direct]);
 useEffect(()=>{
  let live=true;
  const tick=async()=>{const c=current.current;if(!live||document.hidden||!navigator.onLine||manual.current||claiming.current||operation.current||!c.active||!c.enabled||!c.supported||Date.now()<retry.current)return;const j=c.snapshot?.jobs.find(j=>j.state==='QUEUED'&&['PRODUCTION','UPDATE','CANCEL'].includes(j.kind));if(!j)return;claiming.current=true;setBusy(true);
   try{const t=await houseCommand<Ticket>('print-claim',{jobId:j.id});if(!live||document.hidden||manual.current||!current.current.active){await houseCommand('print-result',{jobId:t.jobId,token:t.token,result:'not-sent'});return;}await send(t);}catch{retry.current=Date.now()+15000;current.current.onRefresh();}finally{claiming.current=false;setBusy(false);}};
  const suspend=()=>operation.current?.abort(),visibility=()=>{if(document.hidden)suspend();else void tick();},timer=setInterval(()=>void tick(),1000);
  window.addEventListener('pagehide',suspend);document.addEventListener('visibilitychange',visibility);void tick();
  return()=>{live=false;clearInterval(timer);suspend();window.removeEventListener('pagehide',suspend);document.removeEventListener('visibilitychange',visibility);};
 },[send]);
 useEffect(()=>{if(!config.active)operation.current?.abort();},[config.active]);
 const open=useCallback(async(order:HouseOrder)=>{
  if(manual.current||operation.current||claiming.current)return;
  manual.current=true;setBusy(true);setError('');let preview=false;
  try{
   const ticket=await houseCommand<Ticket&{alreadySent?:boolean}>('print-request',{orderId:order.id,requestId:requestId(),reprint:true});
   if(ticket.alreadySent)return;
   await displayOrPrint(ticket);preview=!/Android/i.test(navigator.userAgent);
  }catch(e){setError(e instanceof Error?e.message:'Confira a impressora.');}
  finally{if(!preview)manual.current=false;setBusy(false);current.current.onRefresh();}
 },[displayOrPrint]);
 async function review(j:HousePrintJob,repeat:boolean){
  if(manual.current||operation.current||claiming.current)return;
  manual.current=true;setBusy(true);setError('');let preview=false;
  try{await houseCommand('print-resolve',{jobId:j.id,repeat});if(repeat&&['CONTROL','REPRINT'].includes(j.kind)){const ticket=await houseCommand<Ticket>('print-claim',{jobId:j.id});await displayOrPrint(ticket);preview=!/Android/i.test(navigator.userAgent);}}
  catch(e){setError(e instanceof Error?e.message:'Falha ao conferir.');}
  finally{if(!preview)manual.current=false;setBusy(false);current.current.onRefresh();}
 }
 return{busy,error,open,review,dialog:dialog?<HousePrintDialog key={dialog.jobId} ticket={dialog} onRefresh={config.onRefresh} onClose={()=>{manual.current=false;setDialog(null);}}/>:null};
}
function HousePrintDialog({ticket,onRefresh,onClose}:{ticket:Ticket;onRefresh:()=>void;onClose:()=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[order,setOrder]=useState(ticket.order),held=useRef(true);
 useEffect(()=>()=>{if(held.current)void houseCommand('print-result',{jobId:ticket.jobId,token:ticket.token,result:'not-sent'}).catch(()=>{});},[ticket.jobId,ticket.token]);
 return <Modal title={`Imprimir · ${order.displayId}`} onClose={onClose} busy={busy} className="print-dialog house-print-dialog">
  <HouseReceiptText order={order}/>{error&&<p className="error print-controls" role="alert">{error}</p>}
  <div className="dialog-actions print-controls"><button className="button" disabled={busy} onClick={onClose}>Voltar</button><button className="button primary" disabled={busy} onClick={async()=>{
   setBusy(true);setError('');try{const latest=await houseCommand<{order:KitchenOrder}>('print-begin',{jobId:ticket.jobId,token:ticket.token});setOrder(latest.order);held.current=false;await houseCommand('print-result',{jobId:ticket.jobId,token:ticket.token,result:'submitted'});requestAnimationFrame(()=>window.print());onRefresh();}catch(e){setError(e instanceof Error?e.message:'Não foi possível imprimir.');}finally{setBusy(false);}
  }}><Printer size={17}/>Imprimir</button></div>
 </Modal>;
}
