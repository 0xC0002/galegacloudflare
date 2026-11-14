"use client";
import { useEffect, useRef } from "react";
import { Check, Printer, RefreshCw, X } from "lucide-react";
import { useAutoPrint } from "./use-auto-print";
import type { KitchenOrder } from "@/lib/order-state";
import { rawBtUri } from "@/lib/receipt";
import { merchantLabel } from "@/lib/merchants";

export type KitchenPrinterControl = ReturnType<typeof useAutoPrint>;

export function KitchenPrinterBar({ printer, onConfigure }: { printer: KitchenPrinterControl; onConfigure: () => void }) {
 const pending = Object.keys(printer.queue.jobs).length;
 const label = printer.status === "storage" ? "Impressão pausada" : printer.status === "locked" ? "Impressora em outra janela" : printer.status === "review" ? "Conferir impressão" : printer.status === "disconnected" ? `RawBT desconectado` : printer.status === "printing" ? "Enviando comanda…" : printer.status === "connecting" ? `Conectando ao RawBT…` : printer.queue.enabled ? "Automática ligada" : "Impressão automática";
 return <section className={`kitchen-printer ${["storage", "review", "disconnected", "locked"].includes(printer.status) ? "attention" : ""}`} aria-label="Impressora da separação">
  <span role="status"><Printer size={17}/><strong>{label}</strong>{pending > 0 && <span className="count">{pending}</span>}</span>
  <button className="button" onClick={onConfigure}>{printer.status === "review" || pending ? "Conferir" : printer.queue.enabled ? "Configurar" : "Configurar impressão"}</button>
 </section>;
}

export function KitchenPrinterDialog({ printer, orders, onClose }: { printer: KitchenPrinterControl; orders: KitchenOrder[]; onClose: () => void }) {
 const dialog = useRef<HTMLDialogElement>(null);
 useEffect(() => { dialog.current?.showModal(); }, []);
 const pending = Object.entries(printer.queue.jobs);
 const reviews = pending.filter(([, job]) => job.state === "review");
 const steps=<ol className="printer-steps"><li>No RawBT deste tablet, selecione a GoldenSky como padrão, em <strong>58 mm</strong>.</li><li>No <a href="https://play.google.com/store/apps/details?id=rawbt.server" target="_blank" rel="noopener noreferrer">Server for RawBT</a>, ative <strong>WebSocket API</strong>.</li><li>Se o Chrome pedir acesso à rede local, toque em <strong>Permitir</strong>.</li></ol>;
 const close = () => { if (printer.testing) void printer.cancel(); onClose(); };
 return <dialog ref={dialog} className="cancel-dialog printer-dialog" aria-labelledby="printer-title" onCancel={e => { e.preventDefault(); close(); }}>
  <div className="dialog-title"><h2 id="printer-title">Impressora da separação</h2><button className="icon-button" aria-label="Fechar configuração da impressora" onClick={close}><X size={20}/></button></div>
  {!printer.supported ? <p>Abra a separação no Chrome atualizado do tablet Android para ativar a impressão automática.</p> : <>
   {printer.queue.enabled ? <details className="printer-hint"><summary>Configuração do RawBT</summary>{steps}</details> : steps}
   <p className="printer-hint">Ative apenas neste tablet. Mantenha a separação aberta e a tela ligada.</p>
   <div className="printer-setup-actions"><button className="button" disabled={printer.operationBusy} onClick={() => void printer.testPrint()}>{printer.testing && !printer.testSent ? <RefreshCw size={16} className="spin"/> : <Printer size={16}/>} {printer.testing ? printer.testSent ? "Aguardando retorno…" : "Conectando…" : "Testar impressão"}</button>{printer.operationBusy && <button className="button" onClick={() => void printer.cancel()}>Parar espera</button>}<button className="button" onClick={() => void printer.reconnect()}>Reconectar</button>{printer.queue.enabled && <button className="button" onClick={() => void printer.setEnabled(false)}>Desativar automática</button>}</div>
   {printer.testSent && <div className={`printer-test-success${printer.testAcknowledged ? "" : " awaiting"}`}><p>{printer.testAcknowledged ? `O RawBT confirmou o teste. A comanda saiu completa?` : "Teste enviado. Se o papel saiu completo, confirme abaixo."}</p><button className="button primary" disabled={printer.status==="storage"} onClick={async () => { await printer.setEnabled(true); }}><Check size={16}/>{printer.queue.enabled ? "Saiu, retomar automática" : "Saiu, ativar automática"}</button></div>}
   {printer.queue.enabled && !printer.testSent && <p className="printer-test-success" role="status">Impressão automática ativada neste tablet.</p>}
   {printer.queue.enabled && !printer.testSent && printer.queue.completion === "submitted" && <p className="printer-hint">O RawBT não informa o fim de cada impressão. Confira a saída das comandas; falhas após o envio não são repetidas automaticamente.</p>}
  </>}
  {printer.error && (!printer.testSent || printer.status === "storage") && <p className="error" role="alert">{printer.error}</p>}
  {reviews.length > 0 && <section className="printer-reviews" aria-labelledby="printer-review-title"><h3 id="printer-review-title">Confira as comandas</h3><p>{printer.queue.enabled ? "Confira o papel antes de reimprimir. Os próximos pedidos continuam na fila automática." : "Imprima e marque Já saiu depois de conferir o papel."}</p>{reviews.map(([id]) => {
   const order = orders.find(o => o.id === id);
   return <div className="printer-review" key={id}><strong>{order ? `${merchantLabel(order.merchantId)} · ` : ""}Pedido #{order?.displayId || id.slice(-8)}</strong><div><button className="button" onClick={() => void printer.resolve(id, false)}>Já saiu</button>{order && (printer.queue.enabled ? <button className="button" onClick={() => void printer.resolve(id, true)}>Não saiu: reimprimir</button> : <a className="button" href={rawBtUri(order)}>Imprimir no RawBT</a>)}</div></div>;
  })}</section>}
  {pending.some(([, job]) => job.state === "queued") && <p className="printer-hint" role="status">{pending.filter(([, job]) => job.state === "queued").length} pedido(s) aguardando impressão.</p>}
  {printer.diagnostic && <details className="printer-hint"><summary>Diagnóstico</summary><p>Versão 5 · {printer.diagnostic}</p><p>{printer.queue.completion === "submitted" ? "Envio sem retorno do driver" : "Confirmação pelo driver"} · {pending.length} pendente(s) · {reviews.length} a conferir</p></details>}
  <div className="dialog-actions"><button className="button" onClick={close}>Fechar</button></div>
 </dialog>;
}
