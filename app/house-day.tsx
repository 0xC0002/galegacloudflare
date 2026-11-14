"use client";
import {useEffect,useRef,useState} from 'react';
import {Printer} from 'lucide-react';
import {appJson,houseCommand} from '@/lib/client-api';
import {houseKitchenOrder,dateBR,type HouseDaySnapshot,type HouseRole,type HouseOrder} from '@/lib/house-state';
import {chronologicalHouseOrders,printHouseDayBatch,prepareHouseDayBrowserPrint,confirmHouseDayBrowserPrint,type HouseDayBrowserTicket} from '@/lib/house-day-print';
import {browserPrinterLock} from '@/lib/printer-lock';
import {receiptText} from '@/lib/receipt';
import {HouseCard,Modal,type HouseActions} from './house-components';
import {HouseReceiptText} from './receipt-text';
import {LAB_PRINTER_LOCK} from './house-printing';
const noop=()=>{};
const readOnlyActions:HouseActions={onPrint:noop,onEdit:noop,onStatus:noop,onTalk:noop,onMessages:noop,onSeparate:noop};
export function HouseDayBoard({snapshot,loadError,role,enabled,supported,completion,onRefresh}:{snapshot:HouseDaySnapshot|null;loadError:string;role:HouseRole;enabled:boolean;supported:boolean;completion:'driver'|'submitted';onRefresh:()=>void}){
 const [busy,setBusy]=useState(false),[progress,setProgress]=useState({done:0,total:0}),[error,setError]=useState(''),[message,setMessage]=useState(''),[preview,setPreview]=useState<HouseDaySnapshot|null>(null),[paperTickets,setPaperTickets]=useState<HouseDayBrowserTicket[]|null>(null),running=useRef(false),abort=useRef<AbortController|null>(null);
 useEffect(()=>{const stop=()=>abort.current?.abort(),hidden=()=>{if(document.hidden)stop();};window.addEventListener('pagehide',stop);document.addEventListener('visibilitychange',hidden);return()=>{stop();window.removeEventListener('pagehide',stop);document.removeEventListener('visibilitychange',hidden);};},[]);
 async function printAll(selected?:HouseOrder){
  if(running.current)return;running.current=true;setBusy(true);setError('');setMessage('');setProgress({done:0,total:0});setPaperTickets(null);
  const controller=new AbortController();abort.current=controller;
  try{
   let latest=await appJson<HouseDaySnapshot>('/api/house?view=kitchen-day');
   if(selected){const order=latest.orders.find(o=>o.id===selected.id);if(!order)throw new Error('Este pedido não está mais na lista de hoje.');latest={...latest,orders:[order]};}
   if(controller.signal.aborted)return;
   if(!latest.orders.length){setMessage('Nenhum pedido da Casa para hoje.');return;}
   if(!/Android/i.test(navigator.userAgent)){setPreview(latest);return;}
   if(!supported||!enabled)throw new Error('Configure e teste a impressão RawBT neste tablet antes de imprimir tudo.');
   const sent=await printHouseDayBatch(latest,{command:houseCommand,lock:browserPrinterLock(LAB_PRINTER_LOCK),signal:controller.signal,completion,onProgress:(done,total)=>setProgress({done,total})});
   setMessage(`${sent} comanda${sent===1?' enviada':'s enviadas'}.`);
  }catch(e){setError(e instanceof Error?e.message:'Confira a impressora.');}
  finally{running.current=false;abort.current=null;setBusy(false);onRefresh();}
 }
 async function browserPrint(){
  if(!preview||running.current)return;running.current=true;setBusy(true);setError('');
  try{const tickets=await prepareHouseDayBrowserPrint(preview,houseCommand);setPaperTickets(tickets);requestAnimationFrame(()=>window.print());onRefresh();}
  catch(e){setError(e instanceof Error?e.message:'Não foi possível preparar as notas.');}
  finally{running.current=false;setBusy(false);}
 }
 async function confirmPaper(printed:boolean){
  if(!paperTickets||running.current)return;running.current=true;setBusy(true);setError('');
  try{await confirmHouseDayBrowserPrint(paperTickets,printed,houseCommand);setPreview(null);setPaperTickets(null);onRefresh();}
  catch(e){setError(e instanceof Error?e.message:'Não foi possível registrar a impressão.');}
  finally{running.current=false;setBusy(false);}
 }
 const orders=chronologicalHouseOrders(snapshot?.orders||[]);
 return <section className="house-day" aria-label="Pedidos da casa para hoje"><header className="house-day-heading"><div><h1>Pedidos da casa para hoje</h1>{snapshot&&<p>{dateBR(snapshot.date)} · {orders.length} pedido{orders.length===1?'':'s'}</p>}</div><button className="button primary print-house-day" disabled={busy||!snapshot||!orders.length} onClick={()=>void printAll()}><Printer size={24}/>{busy?progress.total?`Enviando ${Math.min(progress.done+1,progress.total)} de ${progress.total}…`:'Preparando…':'Imprimir tudo'}</button></header>{(error||loadError)&&<p className="error" role="alert">{error||loadError}</p>}{message&&<p role="status">{message}</p>}{snapshot?orders.length?<div className="house-orders">{orders.map(o=><HouseCard key={o.id} order={o} role={role} kitchen daily {...readOnlyActions} printing={busy} onPrint={o=>void printAll(o)}/>)}</div>:<p className="source-empty">Nenhum pedido da Casa para hoje.</p>:!loadError&&<p role="status">Carregando pedidos de hoje…</p>}
 {preview&&<Modal title={preview.orders.length===1?`Imprimir · ${preview.orders[0].displayId}`:'Imprimir pedidos da Casa'} busy={busy} onClose={()=>{setPreview(null);setPaperTickets(null);}} className="print-dialog house-print-dialog house-day-print"><div className="day-print-receipts">{(paperTickets?paperTickets.map(t=>t.order):chronologicalHouseOrders(preview.orders).map(o=>houseKitchenOrder(o,'CONTROL',true))).map(receipt=><section className="day-print-receipt" key={receipt.id}><HouseReceiptText order={receipt}/></section>)}</div>{error&&<p role="alert" className="error print-controls">{error}</p>}<div className="dialog-actions print-controls">{paperTickets?<><button className="button" disabled={busy} onClick={()=>void confirmPaper(false)}>Não saiu</button><button className="button primary" disabled={busy} onClick={()=>void confirmPaper(true)}>Já saiu no papel</button></>:<><button className="button" disabled={busy} onClick={()=>setPreview(null)}>Voltar</button><button className="button primary" disabled={busy} onClick={()=>void browserPrint()}><Printer size={18}/>{busy?'Preparando…':preview.orders.length===1?'Imprimir':'Imprimir tudo'}</button></>}</div></Modal>}
 </section>;
}
