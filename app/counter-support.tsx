"use client";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Clock3, MessageSquare, RefreshCw, X } from "lucide-react";
import { centsFromInput, disputeActionLabels, disputeLabels, disputedItemName, disputeOpen, money, negotiationReasons, rejectionReasons, settlementLabels, timeoutLabels, uuid, type Dispute, type DisputeReply } from "@/lib/negotiation-state";
import type { KitchenOrder } from "@/lib/order-state";
import { requestId } from "@/lib/request-id";
import { merchantLabel } from "@/lib/merchants";
type Widget = { init:(config:{widgetId:string;merchantIds:string[];autoShow:boolean})=>void; ready:Promise<void>;show:()=>void;hide:()=>void };
declare global { interface Window { iFoodWidget?:Widget } }
let widgetDownload:Promise<Widget>|null=null, initializedWidget="";
function widgetApi():Promise<Widget> {
 if(window.iFoodWidget)return Promise.resolve(window.iFoodWidget);
 if(!widgetDownload)widgetDownload=new Promise<Widget>((resolve,reject)=>{
  const script=document.createElement("script");script.src="https://widgets.ifood.com.br/widget.js";script.async=true;
  const timer=setTimeout(()=>{script.remove();widgetDownload=null;reject(new Error("O chat não carregou. Tente novamente."));},15_000);
  script.onload=()=>{clearTimeout(timer);if(window.iFoodWidget)resolve(window.iFoodWidget);else{script.remove();widgetDownload=null;reject(new Error("Chat iFood indisponível."));}};
  script.onerror=()=>{clearTimeout(timer);script.remove();widgetDownload=null;reject(new Error("Não foi possível carregar o chat iFood."));};
  document.head.appendChild(script);
 });
 return widgetDownload;
}
function WidgetChat({widgetId,merchantIds}:{widgetId:string|null;merchantIds:string[]}) {
 const [error,setError]=useState(""),[attempt,setAttempt]=useState(0);
 const merchantsKey=merchantIds.filter(uuid).join(",");
 useEffect(()=>{
  let active=true;setError("");
  if(widgetId&&merchantsKey)void widgetApi().then(async widget=>{
   if(!active)return;
   const key=widgetId+":"+merchantsKey;
   if(initializedWidget!==key){widget.init({widgetId,merchantIds:merchantsKey.split(","),autoShow:false});initializedWidget=key;}
   await widget.ready;if(active)widget.show();
  }).catch(e=>{if(active){initializedWidget="";setError(e instanceof Error?e.message:"Chat indisponível.");}});
  return()=>{active=false;window.iFoodWidget?.hide();};
 },[widgetId,merchantsKey,attempt]);
 return error?<div className="support-error" role="alert"><span>{error}</span><button className="button" onClick={()=>setAttempt(n=>n+1)}>Tentar chat novamente</button></div>:null;
}
function WidgetSetup({widgetId,onClose,onSave}:{widgetId:string|null;onClose:()=>void;onSave:(id:string|null)=>Promise<void>}) {
 const dialog=useRef<HTMLDialogElement>(null),[value,setValue]=useState(widgetId||""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{dialog.current?.showModal();},[]);
 return <dialog ref={dialog} className="cancel-dialog" aria-labelledby="widget-title" onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
  <div className="dialog-title"><h2 id="widget-title">Chat iFood</h2><button className="icon-button" aria-label="Fechar configuração do chat" disabled={busy} onClick={onClose}><X size={20}/></button></div>
  <p>Crie o Widget em iFood Developer → Widgets → Registrar Widget e informe o ID.</p>
  <label className="field">ID do Widget<input autoComplete="off" placeholder="ID do Widget iFood" value={value} disabled={busy} onChange={e=>setValue(e.target.value.trim())}/></label>
  <p className="widget-help">O iFood solicitará a autorização da loja neste dispositivo.</p>
  {error&&<p className="error" role="alert">{error}</p>}
  <div className="dialog-actions"><button className="button" disabled={busy} onClick={onClose}>Voltar</button><button className="button primary" disabled={busy||!!value&&!uuid(value)} onClick={async()=>{setBusy(true);setError("");try{await onSave(value||null);onClose();}catch(e){setError(e instanceof Error?e.message:"Não foi possível salvar.");}finally{setBusy(false);}}}>{busy?"Salvando…":"Salvar"}</button></div>
 </dialog>;
}
type Choice={id:string;action:DisputeReply["action"];alternativeId?:string};
function deadline(d:Dispute,now:number) {
 const remaining=Date.parse(d.expiresAt)-now;
 if(!Number.isFinite(remaining))return "Prazo a verificar";
 if(remaining<=0)return "Prazo encerrado";
 const seconds=Math.ceil(remaining/1000);return `Responder em ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,"0")}`;
}
function ReplyDialog({dispute:d,choice,now,onClose,onReply}:{dispute:Dispute;choice:Choice;now:number;onClose:()=>void;onReply:(id:string,input:DisputeReply)=>Promise<void>}) {
 const dialog=useRef<HTMLDialogElement>(null),request=useRef(""),[reason,setReason]=useState(""),[detail,setDetail]=useState(""),[amount,setAmount]=useState(""),[minutes,setMinutes]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 if(!request.current)request.current=requestId();
 useEffect(()=>{dialog.current?.showModal();},[]);
 const alternative=d.alternatives.find(a=>a.id===choice.alternativeId),refund=alternative?.type==="REFUND"||alternative?.type==="BENEFIT",extraTime=alternative?.type==="ADDITIONAL_TIME";
 const reasons=choice.action==="accept"?d.acceptReasons:choice.action==="reject"?rejectionReasons:alternative?.reasons||[];
 const valid=disputeOpen(d,now)&&d.supported&&(!reasons.length||reasons.includes(reason))&&(!refund||alternative?.currency==="BRL"&&alternative.maxCents!==null&&centsFromInput(amount)!==null&&centsFromInput(amount)!<=alternative.maxCents)&&(!extraTime||alternative?.minutes.includes(Number(minutes)));
 const label=choice.action==="accept"?"Aceitar solicitação":choice.action==="reject"?"Recusar solicitação":extraTime?"Propor novo prazo":alternative?.type==="BENEFIT"?"Propor crédito":"Propor reembolso";
 return <dialog ref={dialog} className="cancel-dialog reply-dialog" aria-labelledby="reply-title" onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
  <div className="dialog-title"><div><p className="eyebrow">iFood{d.merchantId ? ` · ${merchantLabel(d.merchantId)}` : ""} · #{d.displayId}</p><h2 id="reply-title">{label}</h2></div><button className="icon-button" aria-label="Fechar resposta" disabled={busy} onClick={onClose}><X size={20}/></button></div>
  <p className="reply-impact">{choice.action==="accept"?d.action==="PARTIAL_CANCELLATION"?"O aceite autoriza o cancelamento dos itens solicitados.":"O aceite autoriza o cancelamento total solicitado pelo cliente.":choice.action==="reject"?"A recusa será enviada ao iFood.":"A proposta será enviada para a negociação com o cliente."}</p>
  <p className="reply-deadline">{deadline(d,now)}</p>
  {refund&&<label className="field">Valor da proposta{alternative.maxCents!==null&&<small>Máximo: {money(alternative.maxCents,alternative.currency)}</small>}<input value={amount} inputMode="decimal" placeholder="0,00" disabled={busy} onChange={e=>setAmount(e.target.value)}/></label>}
  {extraTime&&<label className="field">Novo prazo<select value={minutes} disabled={busy} onChange={e=>setMinutes(e.target.value)}><option value="">Selecione</option>{alternative.minutes.map(m=><option key={m} value={m}>{m} minutos</option>)}</select></label>}
  {reasons.length>0&&<label className="field">Motivo<select value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}><option value="">Selecione</option>{reasons.map(r=><option key={r} value={r}>{negotiationReasons[r]||r.replaceAll("_"," ")}</option>)}</select></label>}
  {choice.action==="accept"&&d.acceptReasons.length>0&&<label className="field">Detalhe (opcional)<textarea value={detail} maxLength={250} disabled={busy} onChange={e=>setDetail(e.target.value)}/></label>}
  {error&&<p className="error" role="alert">{error}</p>}
  {!disputeOpen(d,now)&&<p className="error" role="alert">Esta negociação já foi respondida ou o prazo terminou.</p>}
  <div className="dialog-actions"><button className="button" disabled={busy} onClick={onClose}>Voltar</button><button className={`button ${choice.action==="accept"?"danger":"primary"}`} disabled={busy||!valid} onClick={async()=>{
   setBusy(true);setError("");try{await onReply(d.id,{requestId:request.current,action:choice.action,...(reason?{reason}:{}),...(detail?{detailReason:detail}:{}),...(choice.alternativeId?{alternativeId:choice.alternativeId}:{}),...(refund?{cents:centsFromInput(amount)!}:{}),...(extraTime?{minutes:Number(minutes)}:{})});onClose();}catch(e){setError(e instanceof Error?e.message:"Falha no envio.");request.current=requestId();}finally{setBusy(false);}
  }}>{busy?"Enviando…":"Confirmar resposta"}</button></div>
 </dialog>;
}
export default function CounterSupport({disputes,orders,serverTime,widgetId,merchantIds,onReply,onWidgetSave,onRefresh}:{disputes:Dispute[];orders:KitchenOrder[];serverTime:()=>number;widgetId:string|null;merchantIds:string[];onReply:(id:string,input:DisputeReply)=>Promise<void>;onWidgetSave:(id:string|null)=>Promise<void>;onRefresh:()=>void}) {
 const [history,setHistory]=useState(false),[choice,setChoice]=useState<Choice|null>(null),[setup,setSetup]=useState(false),[now,setNow]=useState(serverTime);
 useEffect(()=>{const tick=()=>setNow(serverTime());tick();const timer=setInterval(tick,1_000);return()=>clearInterval(timer);},[serverTime]);
 const pending=disputes.filter(d=>!d.settlement),previous=disputes.filter(d=>d.settlement),visible=(history?previous:pending).sort((a,b)=>history?Date.parse(b.createdAt)-Date.parse(a.createdAt):Date.parse(a.expiresAt)-Date.parse(b.expiresAt));
 const selected=choice?disputes.find(d=>d.id===choice.id):null;
 return <section className="counter-support" id="atendimento" aria-label="Atendimento do balcão">
  <div className="support-heading"><div>{!!disputes.length&&<><h2><MessageSquare size={17}/>Atendimento {pending.length>0&&<span className="count">{pending.length}</span>}</h2><div className="support-tabs"><button aria-pressed={!history} onClick={()=>setHistory(false)}>Pendentes</button><button aria-pressed={history} onClick={()=>setHistory(true)}>Respondidas</button></div></>}</div><button className="button chat-setup" onClick={()=>setSetup(true)}><MessageSquare size={15}/>Chat iFood</button></div>
  <WidgetChat widgetId={widgetId} merchantIds={merchantIds}/>
  {visible.length>0&&<div className="disputes">{visible.map(d=><article className={`dispute ${d.settlement?"resolved":""}`} key={d.id}>
   <header><div><strong>iFood{d.merchantId ? ` · ${merchantLabel(d.merchantId)}` : ""} · #{d.displayId}</strong><span>{d.customer}</span></div>{!d.settlement&&<span className={`deadline ${Date.parse(d.expiresAt)-now<60_000?"urgent":""}`}><Clock3 size={14}/>{deadline(d,now)}</span>}</header>
   <h3>{disputeActionLabels[d.action]||"Solicitação do cliente"}<small>{disputeLabels[d.handshakeType]||d.handshakeType}</small></h3><p className="dispute-message">{d.message||"Confira a solicitação no iFood."}</p>
   {d.items.length>0&&<ul className="disputed-items">{d.items.map((item,i)=><li key={i}><strong>{item.quantity??"?"}× {disputedItemName(item,orders.find(o=>o.id===d.orderId))}</strong>{item.cents!==null&&<span>{money(item.cents,item.currency)}</span>}{item.reason&&<small>{item.reason}</small>}</li>)}</ul>}
   {d.evidenceCount>0&&<div className="evidences">{Array.from({length:Math.min(d.evidenceCount,20)},(_,i)=><a className="button" key={i} href={`/api/disputes/${encodeURIComponent(d.id)}/evidence/${i}`} target="_blank" rel="noopener noreferrer">Foto {i+1}</a>)}</div>}
   {d.settlement?<div className="dispute-result"><Check size={15}/><span>{settlementLabels[d.settlement.status]||"Resposta recebida do iFood"}{d.settlement.alternative&&<small>{d.settlement.alternative.cents!==null?money(d.settlement.alternative.cents,d.settlement.alternative.currency):d.settlement.alternative.minutes!==null?`${d.settlement.alternative.minutes} minutos`:d.settlement.alternative.type}</small>}</span></div>:<>
    <p className="timeout-hint">{timeoutLabels[d.timeoutAction]||"Confira a regra de prazo no iFood."}</p>
    {!d.supported?<p className="support-error"><AlertCircle size={15}/>Confira esta negociação no iFood.</p>:d.response&&d.response.status!=="FAILED"?<div className="dispute-pending" role="status"><span>{d.response.status==="UNCERTAIN"?"Envio sem confirmação. Confira no iFood.":d.response.status==="ALREADY_ANSWERED"?"Respondida em outra tela. Aguardando iFood…":"Resposta enviada. Aguardando iFood…"}</span><button className="icon-button" aria-label="Atualizar negociação" onClick={onRefresh}><RefreshCw size={15}/></button></div>:disputeOpen(d,now)?<div className="dispute-actions"><button className="button danger" onClick={()=>setChoice({id:d.id,action:"accept"})}>Aceitar solicitação</button><button className="button" onClick={()=>setChoice({id:d.id,action:"reject"})}>Recusar</button>{d.alternatives.filter(a=>uuid(a.id)&&(a.type==="ADDITIONAL_TIME"?a.minutes.length>0&&a.reasons.length>0:["REFUND","BENEFIT"].includes(a.type)&&a.maxCents!==null&&a.maxCents>0&&a.currency==="BRL")).map(a=><button className="button" key={a.id} onClick={()=>setChoice({id:d.id,action:"alternative",alternativeId:a.id})}>{a.type==="ADDITIONAL_TIME"?"Propor prazo":a.type==="BENEFIT"?"Propor crédito":"Propor reembolso"}</button>)}</div>:<p className="support-error">Prazo encerrado. Aguardando resultado do iFood.</p>}
    {d.response?.status==="FAILED"&&<p className="support-error" role="alert">{d.response.error}</p>}
   </>}
   {d.relatedSettlements.some(s=>s.disputeId!==d.id)&&<details className="negotiation-history"><summary>Outras respostas deste pedido</summary>{d.relatedSettlements.filter(s=>s.disputeId!==d.id).map((s,i)=><p key={i}>{settlementLabels[s.status]||s.status} · {new Date(s.createdAt).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})}</p>)}</details>}
  </article>)}</div>}
  {selected&&choice&&<ReplyDialog key={`${choice.id}:${choice.action}:${choice.alternativeId||""}`} dispute={selected} choice={choice} now={now} onClose={()=>setChoice(null)} onReply={onReply}/>}
  {setup&&<WidgetSetup widgetId={widgetId} onClose={()=>setSetup(false)} onSave={onWidgetSave}/>}
 </section>;
}
