"use client";
import {appFetch} from "@/lib/client-api";
import { merchantLabel } from "@/lib/merchants";
import { useEffect, useRef, useState } from "react";
import { FileText, X } from "lucide-react";
import { commercialLines } from "@/lib/commercial";
import type { KitchenOrder } from "@/lib/order-state";
function FiscalDocument({order,onClose}:{order:KitchenOrder;onClose:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null),[document,setDocument]=useState<string|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 useEffect(()=>{dialog.current?.showModal();const controller=new AbortController();
  void(async()=>{try{const r=await appFetch(`/api/orders/${encodeURIComponent(order.id)}/fiscal-document?purpose=invoice`,{cache:"no-store",signal:controller.signal});const j=await r.json() as {documentNumber:string|null;error?:string};if(!r.ok)throw new Error(j.error||"Não foi possível consultar o documento.");setDocument(j.documentNumber);}catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Falha na consulta.");}finally{if(!controller.signal.aborted)setLoading(false);}})();
  return()=>controller.abort();
 },[order.id]);
 return <dialog ref={dialog} className="cancel-dialog" aria-labelledby="fiscal-title" onCancel={e=>{e.preventDefault();onClose();}}><div className="dialog-title"><div><p className="eyebrow">{merchantLabel(order.merchantId)} · Pedido #{order.displayId}</p><h2 id="fiscal-title">Documento para nota fiscal</h2></div><button className="icon-button" aria-label="Fechar documento fiscal" onClick={onClose}><X size={20}/></button></div><p>Uso exclusivo para emissão da nota fiscal solicitada pelo cliente.</p>{loading?<p role="status">Consultando…</p>:error?<p className="error" role="alert">{error}</p>:document?<p className="fiscal-number">{document}</p>:<p>Cliente não informou CPF ou CNPJ.</p>}<div className="dialog-actions"><button className="button" onClick={onClose}>Fechar</button></div></dialog>;
}
export default function CounterOrderDetails({order}:{order:KitchenOrder}) {
 const [fiscal,setFiscal]=useState(false),receipt=order.receipt;
 return <div className="counter-details"><div className="commercial-lines">{commercialLines(receipt).map((line,i)=><p key={i}>{line}</p>)}</div>{receipt?.address.length?<p className="delivery-address">{receipt.address.join(" · ")}</p>:null}{receipt?.deliveryNotes&&<p className="delivery-notes">Entrega: {receipt.deliveryNotes}</p>}{receipt?.pickupCode&&<p className="pickup-code">Código de coleta: <strong>{receipt.pickupCode}</strong></p>}<button className="fiscal-button" onClick={()=>setFiscal(true)}><FileText size={14}/>Documento para nota fiscal</button>{fiscal&&<FiscalDocument order={order} onClose={()=>setFiscal(false)}/>}</div>;
}
