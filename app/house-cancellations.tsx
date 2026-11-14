"use client";
import {useEffect,useRef,useState} from 'react';
import {AlertTriangle,X} from 'lucide-react';
import type {HouseCancellation} from '@/lib/house-state';
import {HOUSE_CANCELLATION_DISMISS_KEY,HOUSE_CANCELLATION_TTL_MS,readHouseDismissals,visibleHouseCancellations} from '@/lib/house-cancellations';
export function HouseCancellationNotices({notices,serverNow}:{notices:HouseCancellation[];serverNow:number}){
 const clock=useRef({serverNow,receivedAt:Date.now()});if(clock.current.serverNow!==serverNow)clock.current={serverNow,receivedAt:Date.now()};
 const [ready,setReady]=useState(false),[now,setNow]=useState(serverNow),[dismissed,setDismissed]=useState<Record<string,number>>({});
 useEffect(()=>{const tick=()=>setNow(clock.current.serverNow+Math.max(0,Date.now()-clock.current.receivedAt));const read=()=>{try{setDismissed(readHouseDismissals(localStorage.getItem(HOUSE_CANCELLATION_DISMISS_KEY),clock.current.serverNow));}catch{setDismissed({});}};read();tick();setReady(true);const timer=setInterval(tick,1000);window.addEventListener('storage',read);return()=>{clearInterval(timer);window.removeEventListener('storage',read);};},[]);
 const current=Math.max(now,serverNow),visible=visibleHouseCancellations(notices,dismissed,current);
 if(!ready||!visible.length)return null;
 function close(n:HouseCancellation){const next={...readHouseDismissals(JSON.stringify(dismissed),current),[n.id]:Date.parse(n.createdAt)+HOUSE_CANCELLATION_TTL_MS};setDismissed(next);try{localStorage.setItem(HOUSE_CANCELLATION_DISMISS_KEY,JSON.stringify(next));}catch{/* Closing still works in this tab if storage is unavailable. */}}
 return <section className="house-cancellations" aria-label="Cancelamentos da Casa">{visible.map(n=><article key={n.id} role="status"><button className="icon-button house-cancellation-close" aria-label={`Fechar aviso de cancelamento ${n.displayId}`} onClick={()=>close(n)}><X size={21}/></button><div><AlertTriangle size={22}/><strong>CANCELADO · {n.displayId} · {n.customer}</strong></div><p>Não preparar nem entregar.</p><time dateTime={n.createdAt}>Cancelado às {new Date(n.createdAt).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})}</time></article>)}</section>;
}
