"use client";
import {kitchenQueues} from '@/lib/order-state';
import {appFetch} from "@/lib/client-api";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, ClipboardList, Check, X, Store, ChefHat, ArrowRight, Ban, Clock3, Printer, Volume2, VolumeX } from "lucide-react";
import { rawBtUri, receiptText } from "@/lib/receipt";
import { actionLabels, fulfillmentLabel, primaryAction, scheduledWait, statusLabels, terminal, needsStatusReview, type KitchenOrder, type Option, type OrderAction } from "@/lib/order-state";
import { orderDateTime } from "@/lib/order-time";
import { confirmationQueue, confirmationTime } from "@/lib/order-confirmation";
import { recentPolling } from "@/lib/receiver-health";
import type { CancellationReason } from "@/lib/ifood";
import CounterSupport from "./counter-support";
import CounterOrderDetails from "./counter-order-details";
import type { Dispute, DisputeReply } from "@/lib/negotiation-state";
import { requestId } from "@/lib/request-id";
import { useOrderAlerts } from "./use-order-alerts";
import { useAutoPrint } from "./use-auto-print";
import { KitchenPrinterBar, KitchenPrinterDialog } from "./kitchen-printer";
import InstallApp from "./install-app";
import { merchantLabel } from "@/lib/merchants";

export type Snapshot = { configured: boolean; environment: "TEST" | "PRODUCTION"; merchantId: string; merchantIds: string[]; lastSuccessAt: string | null; lastError: string | null; pendingEvents: number; pendingErrors: number; nextPollAt: number; serverNow: number; orders: KitchenOrder[]; disputes: Dispute[]; widgetId: string | null; continuousReceiverActive:boolean };
type Mode = "counter" | "kitchen";
const time = (v: string) => Number.isFinite(Date.parse(v)) ? new Date(v).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "—";
const scheduleTime = (v: string) => Number.isFinite(Date.parse(v)) ? new Date(v).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "Horário a verificar";
const qty = (n: number | null) => n === null ? "?" : n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const kitchenLabels = { WAITING: "A separar", SEPARATING: "A separar", SEPARATED: "Separado" };
function Options({ items }: { items: Option[] }) {
 return <ul className="options">{items.map((x, i) => <li key={i}><b>{qty(x.quantity)}×</b> {x.name}{x.group && <span> · {x.group}</span>}{x.observations && <div className="observation">{x.observations}</div>}{x.options.length > 0 && <Options items={x.options} />}</li>)}</ul>;
}

function CancelDialog({ order, busy, onClose, onSubmit }: { order: KitchenOrder; busy: boolean; onClose: () => void; onSubmit: (reason: string) => Promise<void> }) {
 const dialog = useRef<HTMLDialogElement>(null);
 const [reasons, setReasons] = useState<CancellationReason[]>([]), [reason, setReason] = useState(""), [loading, setLoading] = useState(true), [error, setError] = useState("");
 useEffect(() => { dialog.current?.showModal(); }, []);
 useEffect(() => {
  const controller = new AbortController();
  (async () => { try {
   const r = await appFetch(`/api/orders/${encodeURIComponent(order.id)}/cancellation-reasons`, { cache: "no-store", signal: controller.signal });
   const j = await r.json() as {error?: string; reasons: CancellationReason[]}; if (!r.ok) throw new Error(j.error || "Não foi possível consultar os motivos."); setReasons(j.reasons);
  } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Falha na consulta."); }
  finally { if (!controller.signal.aborted) setLoading(false); } })();
  return () => controller.abort();
 }, [order.id]);
 return <dialog ref={dialog} className="cancel-dialog" aria-labelledby="cancel-title" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
  <div className="dialog-title"><div><p className="eyebrow">{merchantLabel(order.merchantId)} · Pedido #{order.displayId}</p><h2 id="cancel-title">Solicitar cancelamento</h2></div><button className="icon-button" aria-label="Fechar" disabled={busy} onClick={onClose}><X size={20} /></button></div>
  {loading ? <p role="status">Consultando motivos…</p> : error ? <p role="alert" className="error">{error}</p> : reasons.length ? <label className="field">Motivo<select value={reason} disabled={busy} onChange={e => setReason(e.target.value)}><option value="">Selecione um motivo</option>{reasons.map(r => <option key={r.code} value={r.code}>{r.description}</option>)}</select></label> : <p>O iFood não disponibilizou motivos para este pedido.</p>}
  <div className="dialog-actions"><button className="button" disabled={busy} onClick={onClose}>Voltar</button><button className="button danger" disabled={busy || !reason || loading} onClick={async () => { setError(""); try { await onSubmit(reason); } catch (e) { setError(e instanceof Error ? e.message : "Falha no envio."); } }}>{busy ? "Enviando…" : "Confirmar solicitação"}</button></div>
 </dialog>;
}

function StatusReviewDialog({order,onClose,onSubmit}:{order:KitchenOrder;onClose:()=>void;onSubmit:(status:"CONCLUDED"|"CANCELLED",requestId:string)=>Promise<void>}) {
 const dialog=useRef<HTMLDialogElement>(null),id=useRef(requestId());
 const [status,setStatus]=useState<""|"CONCLUDED"|"CANCELLED">(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 useEffect(()=>{dialog.current?.showModal();},[]);
 return <dialog ref={dialog} className="cancel-dialog" aria-labelledby="review-title" onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
  <div className="dialog-title"><h2 id="review-title">{merchantLabel(order.merchantId)} · Conferir pedido #{order.displayId}</h2><button className="icon-button" aria-label="Fechar conferência" disabled={busy} onClick={onClose}><X size={20}/></button></div>
  <p>Confira o pedido no iFood e registre o status final. Esta ação atualiza somente o nosso histórico.</p>
  <label className="field">Status exibido no iFood<select disabled={busy} value={status} onChange={e=>setStatus(e.target.value as typeof status)}><option value="">Selecione</option><option value="CONCLUDED">Concluído</option><option value="CANCELLED">Cancelado</option></select></label>
  {error&&<p className="error" role="alert">{error}</p>}
  <div className="dialog-actions"><button className="button" disabled={busy} onClick={onClose}>Voltar</button><button className="button primary" disabled={busy||!status} onClick={async()=>{if(!status)return;setBusy(true);setError("");try{await onSubmit(status,id.current);onClose();}catch(e){setError(e instanceof Error?e.message:"Falha na conferência.");}finally{setBusy(false);}}}>{busy?"Salvando…":"Registrar conferência"}</button></div>
 </dialog>;
}

function PrintDialog({ order, onClose }: { order: KitchenOrder; onClose: () => void }) {
 const dialog = useRef<HTMLDialogElement>(null);
 useEffect(() => { dialog.current?.showModal(); }, []);
 return <dialog ref={dialog} className="print-dialog" aria-labelledby="print-title" onCancel={e=>{e.preventDefault();onClose();}}>
  <div className="dialog-title print-controls"><h2 id="print-title">{merchantLabel(order.merchantId)} · Pedido #{order.displayId}</h2><button className="icon-button" aria-label="Fechar impressão" onClick={onClose}><X size={20}/></button></div>
  <pre>{receiptText(order)}</pre>
  <div className="dialog-actions print-controls"><button className="button" onClick={onClose}>Voltar</button><button className="button primary" onClick={()=>window.print()}><Printer size={16}/>Imprimir</button></div>
 </dialog>;
}

function OrderCard({ order: o, mode, busy, locked, printPending, onAction, onCancel, onRefresh, onPrint, onReview, now }: { order: KitchenOrder; mode: Mode; busy: boolean; locked: boolean; printPending: boolean; onAction: (o: KitchenOrder, a: OrderAction) => void; onCancel: (o: KitchenOrder) => void; onRefresh: () => void; onPrint: (o: KitchenOrder) => void; onReview:(o:KitchenOrder)=>void; now:number }) {
 const finished = terminal(o), scheduled = scheduledWait(o,now);
 const remote = primaryAction(o);
 const local: OrderAction | null = o.kitchenStage !== "SEPARATED" ? "finishSeparation" : null;
 const action = mode === "counter" ? remote : !finished ? local : null;
 const review=needsStatusReview(o,now);
 const confirmation=mode==="counter"&&!review?confirmationTime(o,now):null;
 const blocked = locked || review || scheduled && action !== "confirm";
 return <article className={`order ${o.cancelled ? "cancelled" : ""} ${o.status === "CONCLUDED" ? "concluded" : ""}`}>
  <header className="order-head"><div className="order-meta"><span className="source" title={o.merchantName}>iFood · {merchantLabel(o.merchantId)}</span><div className="order-tools"><time className="order-created" dateTime={o.createdAt} aria-label={`Pedido feito em ${orderDateTime(o.createdAt)}`} title={o.createdAt}>{orderDateTime(o.createdAt)}</time><button className="icon-button print-order" disabled={printPending} aria-label={`Imprimir pedido #${o.displayId}`} title={printPending?"Impressão na fila":"Imprimir pedido"} onClick={()=>onPrint(o)}><Printer size={18}/></button></div></div><div className="order-name"><strong>#{o.displayId}</strong><span>{o.customer}</span></div>{mode === "counter" && <div className="order-tags"><span className={`status status-${o.status.toLowerCase()}`}>{statusLabels[o.status]}</span><span className="fulfillment">{fulfillmentLabel(o)}</span></div>}</header>
  {o.statusReview && <div className="review-record">Encerramento conferido no iFood · {orderDateTime(o.statusReview.confirmedAt)}</div>}
  {review && <div className="review-notice" role="status">{mode==="counter"?"Status a conferir no iFood":"Confira o status com o balcão"}</div>}
  {confirmation && <p className={`confirmation-deadline${confirmation.expired?" expired":""}`}><Clock3 size={14}/>{confirmation.label}</p>}
  {o.timing === "SCHEDULED" && <div className="scheduled"><Clock3 size={14} /><span>Início do preparo: <strong>{scheduleTime(o.preparationStart)}</strong></span></div>}
  {o.kitchenNeedsReview && !finished && <div className="order-change" role="alert">Pedido alterado. Confira os itens.</div>}
  <div className="items">{o.items.map((x, i) => <section className="item" key={i}><div className="item-title"><span className="quantity">{qty(x.quantity)}×</span><strong>{x.name}</strong></div>{x.options.length > 0 && <Options items={x.options} />}{x.observations && <p className="observation">{x.observations}</p>}</section>)}</div>
  {o.observations && <div className="order-note"><strong>Observações</strong><br />{o.observations}</div>}
  {o.receipt?.takeoutNotes && <div className="order-note"><strong>Retirada</strong><br />{o.receipt.takeoutNotes}</div>}
  {mode === "counter" && <CounterOrderDetails order={o}/>}
  {(mode === "counter" ? !finished : o.kitchenStage === "SEPARATED") && <div className={`kitchen-state kitchen-${o.kitchenStage.toLowerCase()}`}><span>{o.kitchenStage === "SEPARATED" ? <Check size={14} /> : <ChefHat size={14} />}{kitchenLabels[o.kitchenStage]}</span>{o.kitchenUpdatedAt && <small>{time(o.kitchenUpdatedAt)}</small>}</div>}
  {!finished && (mode === "counter" || action) && <div className="order-actions">
   {mode==="counter"&&review ? <button className="button next-action" disabled={locked} onClick={()=>onReview(o)}>Conferir status</button> : mode === "counter" && o.pendingAction ? <div className="action-pending" role="status"><strong>{o.pendingAction.status === "UNCERTAIN" ? "Envio sem resposta. Confira no iFood." : "Aguardando iFood…"}</strong><button className="icon-button" aria-label="Consultar resposta" disabled={busy} onClick={onRefresh}><RefreshCw size={14} /></button></div> : action && <button className="button primary next-action" disabled={blocked} onClick={() => onAction(o, action)}>{busy ? <RefreshCw size={15} className="spin" /> : action === "finishSeparation" ? <Check size={16} /> : <ArrowRight size={16} />}{busy ? "Enviando…" : actionLabels[action]}</button>}
   {mode === "counter" && <button className="cancel-button" disabled={locked || review || !!o.pendingAction} onClick={() => onCancel(o)}><Ban size={13} />Cancelar pedido</button>}
  </div>}
  {mode === "counter" && o.actionError && <p className="order-action-error" role="alert">{o.actionError}</p>}
 </article>;
}

export default function Receiver({fixedMode,embedded=false,sharedSnapshot,sharedPrinter,onRefresh,kitchenHistory,onKitchenHistory,counterHistory,onCounterHistory,hideKitchenTabs=false,hideCounterTabs=false,hideEmpty=false}:{hideEmpty?:boolean;counterHistory?:boolean;onCounterHistory?:(value:boolean)=>void;hideCounterTabs?:boolean;kitchenHistory?:boolean;onKitchenHistory?:(value:boolean)=>void;hideKitchenTabs?:boolean;fixedMode?:Mode;embedded?:boolean;sharedSnapshot?:Snapshot|null;sharedPrinter?:ReturnType<typeof useAutoPrint>;onRefresh?:()=>void}) {
 const [data, setData] = useState<Snapshot | null>(null), [error, setError] = useState(""), [actionError, setActionError] = useState(""), [busy, setBusy] = useState(false);
 const [mode, setMode] = useState<Mode>("counter"), [localHistory, setLocalHistory] = useState(false), [actionBusy, setActionBusy] = useState<string | null>(null), [cancelling, setCancelling] = useState<KitchenOrder | null>(null), [printing, setPrinting] = useState<KitchenOrder | null>(null);
 const history=mode==='kitchen'&&kitchenHistory!==undefined?kitchenHistory:mode==='counter'&&counterHistory!==undefined?counterHistory:localHistory;
 const setHistory=(next:boolean)=>{if(mode==='kitchen'&&onKitchenHistory)onKitchenHistory(next);else if(mode==='counter'&&onCounterHistory)onCounterHistory(next);else setLocalHistory(next);};
 const inFlight = useRef(false), sending = useRef(false), revision = useRef(0), nextPollDue = useRef(0), viewKey = useRef("");
 const serverClock=useRef<{now:number;observedAt:number}|null>(null);
 const [reviewing,setReviewing]=useState<KitchenOrder|null>(null);
 const [printerSettings,setPrinterSettings]=useState(false);
 const serverTime=useCallback(()=>{const clock=serverClock.current;return clock?clock.now+performance.now()-clock.observedAt:Date.now();},[]);
 const [currentTime,setCurrentTime]=useState(()=>Date.now());
 const hasUnconfirmed=Boolean(data?.orders.some(o=>o.status==="PLACED"&&!o.cancelled));
 useEffect(()=>{
  if(!hasUnconfirmed)return;
  setCurrentTime(serverTime());const timer=setInterval(()=>setCurrentTime(serverTime()),1_000);
  return ()=>clearInterval(timer);
 },[hasUnconfirmed,serverTime]);
 const {soundStatus,toggleSound,announcement}=useOrderAlerts(embedded?null:data?.orders??null,mode);
 // Keep the primary-store device key so adding a store preserves the printer and deduplication ledger.
 const ownPrint=useAutoPrint(sharedPrinter?null:data?.orders??null,mode,!sharedPrinter&&data?.configured?`${data.environment}:${data.merchantId}`:null);
 const autoPrint=sharedPrinter||ownPrint;
 useEffect(()=>{if(sharedSnapshot!==undefined)setData(sharedSnapshot);},[sharedSnapshot]);
 useEffect(()=>{if(fixedMode)setMode(fixedMode);},[fixedMode]);
 const refresh = useCallback(async (sync = false, showBusy = false) => {
  if(sharedSnapshot!==undefined){onRefresh?.();return;}
  if (inFlight.current || sending.current) return; inFlight.current = true; if (showBusy) setBusy(true); const version = ++revision.current;
  try { const r = await appFetch(sync ? "/api/sync" : "/api/orders", { method: sync ? "POST" : "GET", cache: "no-store" }); const j = await r.json() as Snapshot & {error?: string}; if (!r.ok) throw new Error(j.error || "Conexão interrompida."); if (version === revision.current) { serverClock.current={now:j.serverNow,observedAt:performance.now()}; const key = JSON.stringify([j.orders,j.disputes,j.widgetId,j.configured,j.environment,j.merchantId,j.merchantIds,j.lastSuccessAt,j.lastError,j.pendingEvents,j.pendingErrors,j.continuousReceiverActive]); if (key !== viewKey.current) { viewKey.current = key; setData(j); } nextPollDue.current = performance.now() + (j.configured ? Math.max(0, j.nextPollAt - j.serverNow) + 100 : 30_000); setError(""); } }
  catch (e) { if (version === revision.current) setError(e instanceof Error ? e.message : "Falha na conexão."); }
  finally { inFlight.current = false; if (showBusy) setBusy(false); }
 }, [sharedSnapshot,onRefresh]);
 useEffect(() => {
  if(embedded)return;
  try { const query = new URLSearchParams(window.location.search).get("tela"); const saved = query === "separacao" ? "kitchen" : query === "balcao" ? "counter" : localStorage.getItem("galega-screen"); if (saved === "kitchen" || saved === "counter") setMode(saved); } catch {}
  refresh(true);
 }, [refresh]);
 useEffect(() => { if(embedded)return;const t = setInterval(() => refresh(performance.now() >= nextPollDue.current), 1_000); const focus = () => {if(document.visibilityState!=="hidden")void refresh(true);}; window.addEventListener("focus", focus);document.addEventListener("visibilitychange",focus); return () => { clearInterval(t); window.removeEventListener("focus", focus);document.removeEventListener("visibilitychange",focus); }; }, [refresh]);
 function changeMode(next: Mode) { setMode(next); setHistory(false); setActionError(""); setCancelling(null); setPrinterSettings(false); try { localStorage.setItem("galega-screen", next); const u = new URL(window.location.href); u.searchParams.set("tela", next === "kitchen" ? "separacao" : "balcao"); window.history.replaceState(null, "", u); } catch {} }
 function printOrder(order: KitchenOrder) {
  if(mode==="kitchen"&&autoPrint.queue.enabled) {
   if(autoPrint.queue.jobs[order.id]?.state==="review")setPrinterSettings(true);
   else void autoPrint.manualPrint(order);
   return;
  }
  if (!/Android/i.test(navigator.userAgent)) { setPrinting(order); return; }
  const link=document.createElement("a");link.href=rawBtUri(order);link.style.display="none";document.body.appendChild(link);link.click();link.remove();
 }
 async function sendAction(o: KitchenOrder, action: OrderAction, reason?: string) {
  if (sending.current) return; sending.current = true; setActionBusy(o.id); setActionError(""); ++revision.current;
  try {
   const r = await appFetch(`/api/orders/${encodeURIComponent(o.id)}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reason, requestId: requestId() }) });
   const j = await r.json() as Snapshot & {error?: string}; if (!r.ok) throw new Error(j.error || "Não foi possível realizar a ação."); serverClock.current={now:j.serverNow,observedAt:performance.now()}; viewKey.current = ""; setData(j);
   nextPollDue.current = performance.now() + Math.max(0, j.nextPollAt - j.serverNow) + 100;
   if (action === "requestCancellation") setCancelling(null);
  } catch (e) { const message = e instanceof Error ? e.message : "Conexão interrompida. Consulte a fila antes de repetir."; setActionError(message); throw new Error(message); }
  finally { sending.current = false; setActionBusy(null); void refresh(performance.now() >= nextPollDue.current); }
 }
 async function counterRequest(path:string,input:unknown) {
  if(sending.current)throw new Error("Aguarde o envio em andamento.");
  sending.current=true;++revision.current;
  try {
   const r=await appFetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)});
   const j=await r.json() as Snapshot&{error?:string};if(!r.ok)throw new Error(j.error||"Não foi possível enviar. Atualize o balcão.");
   serverClock.current={now:j.serverNow,observedAt:performance.now()};viewKey.current="";setData(j);nextPollDue.current=performance.now()+Math.max(0,j.nextPollAt-j.serverNow)+100;
  } finally {sending.current=false;void refresh(false);}
 }
 const reply=(id:string,input:DisputeReply)=>counterRequest(`/api/disputes/${encodeURIComponent(id)}/reply`,input);
 const failure = actionError || error || data?.lastError;
 const failureMessage = mode === "counter" || actionError ? failure : "Falha ao atualizar pedidos. Avise o balcão.";
 const title = failure ? "Atenção" : !data?.configured ? "Sem conexão" : recentPolling(data.lastSuccessAt,serverTime()) ? "Conectado" : "Conectando";
 const all = data?.orders || [];
 const now=hasUnconfirmed?currentTime:serverTime();
 const confirmations=mode==="counter"?confirmationQueue(all,now):[];
 const confirmationIds=new Set(confirmations.map(o=>o.id));
 const finished = mode === "counter" ? all.filter(terminal) : kitchenQueues(all).separated;
 const active = mode==='counter'?all.filter(o=>!terminal(o)):kitchenQueues(all).active;
 const visible = history ? [...finished].sort((a, b) => Date.parse(mode === "kitchen" ? b.kitchenUpdatedAt || b.createdAt : b.statusAt) - Date.parse(mode === "kitchen" ? a.kitchenUpdatedAt || a.createdAt : a.statusAt)) : active.filter(o=>!confirmationIds.has(o.id)).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
 const card=(o:KitchenOrder)=><OrderCard key={o.id} order={o} mode={mode} busy={actionBusy===o.id} locked={!!actionBusy} printPending={mode==="kitchen"&&["queued","sending"].includes(autoPrint.queue.jobs[o.id]?.state)} onAction={(order,action)=>{void sendAction(order,action).catch(()=>{});}} onCancel={setCancelling} onRefresh={()=>refresh(true)} onPrint={printOrder} onReview={setReviewing} now={now}/>;
 return <div className={embedded?"ifood-embedded":"shell"}>
  {!embedded&&<>
  <header className="top"><div className="brand"><img className="brand-logo" src="/logo-galega.png" alt="Salgados da Galega" width="76" height="76"/><address>Rua Senador Bernardo Monteiro, 184<br/><span>Benfica</span></address></div><span className="test-label">LABORATÓRIO · TESTE</span></header>
  <section className="intro"><h1>Pedidos</h1><div className="tools"><span className={`connection-indicator ${failure ? "bad" : recentPolling(data?.lastSuccessAt,serverTime()) ? "good" : ""}`} role="status"><span className="light" />{title}</span><button className="button sound-button" aria-pressed={soundStatus==="ready"} aria-label={soundStatus==="ready"?"Desativar aviso sonoro":soundStatus==="unsupported"?"Som indisponível neste navegador":"Ativar aviso sonoro"} title={soundStatus==="ready"?"Desativar aviso sonoro":"Ativar e testar o som neste aparelho"} disabled={soundStatus==="starting"||soundStatus==="unsupported"} onClick={()=>void toggleSound()}>{soundStatus==="ready"?<Volume2 size={16}/>:<VolumeX size={16}/>}<span>{soundStatus==="ready"?"Som ligado":soundStatus==="starting"?"Ativando…":soundStatus==="unsupported"?"Sem áudio":"Ativar som"}</span></button><InstallApp/><button className="button" disabled={busy || !!actionBusy} onClick={() => refresh(true,true)}><RefreshCw size={15} className={busy ? "spin" : ""} />Atualizar</button></div></section>
  <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
  {mode==="counter"&&data?.configured&&!data.continuousReceiverActive&&<p className="receiver-notice" role="status">Recebimento com telas fechadas: inativo.</p>}
  <nav className="screen-switch" aria-label="Tela de trabalho"><button aria-pressed={mode === "counter"} onClick={() => changeMode("counter")}><Store size={17} />Balcão</button><button aria-pressed={mode === "kitchen"} onClick={() => changeMode("kitchen")}><ChefHat size={17} />Separação</button></nav>
  {mode==="kitchen"&&data?.configured&&<KitchenPrinterBar printer={autoPrint} onConfigure={()=>setPrinterSettings(true)}/>}
  </>}
  {failure && <div className="connection bad" role="alert"><span className="error">{failureMessage}</span>{actionError && <button className="icon-button" aria-label="Fechar mensagem" onClick={() => setActionError("")}><X size={15} /></button>}</div>}
  {confirmations.length>0&&<section className="confirmation-queue" aria-labelledby="confirmation-title"><h2 id="confirmation-title">A confirmar <span className="count">{confirmations.length}</span></h2><div className="orders" aria-label="Pedidos a confirmar">{confirmations.map(card)}</div></section>}
  {mode === "counter" && data && <CounterSupport disputes={data.disputes||[]} orders={data.orders} serverTime={serverTime} widgetId={data.widgetId} merchantIds={data.merchantIds} onReply={reply} onWidgetSave={widgetId=>counterRequest("/api/settings/widget",{widgetId})} onRefresh={()=>void refresh(true)}/>}
  {mode === "counter" && !!data?.pendingErrors && <div className="recovery-notice" role="status"><span>{data.pendingErrors} consulta(s) pendente(s) de recuperação.</span><button className="button" disabled={busy||!!actionBusy} onClick={()=>{void counterRequest("/api/recovery",{}).catch(e=>setActionError(e instanceof Error?e.message:"Falha na recuperação."));}}>Tentar novamente</button></div>}
  {!(mode==='kitchen'&&hideKitchenTabs||mode==='counter'&&hideCounterTabs)&&<div className="board-title"><div className="queue-tabs" aria-label="Filtrar pedidos"><button aria-pressed={!history} onClick={() => setHistory(false)}>{mode === "kitchen" ? "A separar" : "Em andamento"}<span className="count">{active.length}</span></button><button aria-pressed={history} onClick={() => setHistory(true)}>{mode === "kitchen" ? "Separados" : "Histórico"}<span className="count">{finished.length}</span></button></div>{!!data?.pendingEvents && <small>Sincronizando…</small>}</div>}
  {!data ? <div className="loading">Carregando…</div> : visible.length === 0 ? hideEmpty?null:!history&&confirmations.length>0 ? null : <section className="empty"><div className="empty-icon"><ClipboardList size={29} strokeWidth={1.5} /></div><h2>{history ? mode === "kitchen" ? "Nenhum pedido separado" : "Histórico vazio" : mode === "kitchen" ? "Nenhum pedido a separar" : "Sem pedidos"}</h2></section> : <section className="orders" aria-label={mode === "kitchen" ? history ? "Pedidos separados" : "Pedidos a separar" : history ? "Histórico de pedidos" : "Pedidos em andamento"}>{visible.map(card)}</section>}
  {mode === "counter" && cancelling && <CancelDialog key={cancelling.id} order={cancelling} busy={!!actionBusy} onClose={() => setCancelling(null)} onSubmit={reason => sendAction(cancelling, "requestCancellation", reason)} />}
  {printing && <PrintDialog key={printing.id} order={data?.orders.find(o=>o.id===printing.id)||printing} onClose={()=>setPrinting(null)}/>}
  {mode==="kitchen"&&printerSettings&&<KitchenPrinterDialog printer={autoPrint} orders={all} onClose={()=>setPrinterSettings(false)}/>}
  {mode==="counter"&&reviewing&&<StatusReviewDialog key={reviewing.id} order={reviewing} onClose={()=>setReviewing(null)} onSubmit={(status,id)=>counterRequest(`/api/orders/${encodeURIComponent(reviewing.id)}/reconciliation`,{status,requestId:id})}/>}
 </div>;
}
