"use client";
import {useEffect,useState} from 'react';
import {appJson} from '@/lib/client-api';
export function useWhatsapp(active:boolean){
 const [issues,setIssues]=useState(0);
 useEffect(()=>{if(!active)return;let live=true,busy=false;
  const tick=async()=>{if(!live||busy||document.hidden||!navigator.onLine)return;busy=true;try{const r=await appJson<{issues:number}>('/api/whatsapp/tick',{method:'POST'});if(live)setIssues(r.issues);}catch{/* Printing, iFood and order sync are independent of this optional channel. */}finally{busy=false;}};
  void tick();const timer=setInterval(()=>void tick(),4000);const wake=()=>void tick();window.addEventListener('focus',wake);window.addEventListener('online',wake);
  return()=>{live=false;clearInterval(timer);window.removeEventListener('focus',wake);window.removeEventListener('online',wake);};
 },[active]);return issues;
}
