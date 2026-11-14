import { rawBtUri } from "./receipt.ts";
import type { KitchenOrder } from "./order-state.ts";

// Official RawBT companion API. Loopback only: receipts never go to another host.
export const RAWBT_SOCKET_URL = "ws://127.0.0.1:40213/";
export type RawBtJob = { idJob: string; printer: "current"; copies: 1; template: "none"; commands: { command: "sendBytes"; base64: string }[] };
export type PrintSocket = Pick<WebSocket, "onopen" | "onmessage" | "onerror" | "onclose" | "send" | "close"> & { readonly bufferedAmount?: number };
export type RawBtResult = { completion: "driver" | "submitted" };
export type PrintOptions = { signal?: AbortSignal; beforeSend?: () => void | Promise<void>; onSent?: () => void; onResponse?: (status: string) => void; completion?: "driver" | "submitted"; createSocket?: (url: string) => PrintSocket; connectTimeoutMs?: number; resultTimeoutMs?: number; submitGraceMs?: number };

export class RawBtError extends Error {
 readonly sent: boolean;
 readonly kind: "connection" | "permission" | "result" | "cancelled" | "storage" | "stale";
 constructor(sent: boolean, kind: RawBtError["kind"]) {
  super(sent ? "Confira se a comanda saiu antes de reimprimir." : kind === "permission" ? "O navegador bloqueou a conexão local. Permita o acesso nas configurações deste site e use o Chrome atualizado." : kind === "storage" ? "Não foi possível salvar a fila neste aparelho. A impressão foi pausada." : "Abra o Server for RawBT, ative a conexão e confira a GoldenSky no RawBT.");
  this.sent = sent; this.kind = kind;
 }
}

export function rawBtJob(order: KitchenOrder, idJob: string): RawBtJob {
 return { idJob, printer: "current", copies: 1, template: "none", commands: [{ command: "sendBytes", base64: rawBtUri(order).slice("rawbt:base64,".length) }] };
}

export function rawBtTestJob(idJob: string): RawBtJob {
 const bytes = "\x1b@\x1ba\x01\x1bE\x01SALGADOS DA GALEGA\n\x1bE\x00\x1ba\x00TESTE DE IMPRESSAO - 58 MM\n--------------------------------\nGoldenSky / RawBT\nSe esta comanda saiu completa,\nconfirme na tela de separacao.\n\nNAO E UM PEDIDO\n\n\n\n";
 return { idJob, printer: "current", copies: 1, template: "none", commands: [{ command: "sendBytes", base64: btoa(bytes) }] };
}

// The legacy SDK returns {status}; the current SDK returns {responseType, jobId}.
// Each connection carries exactly one job. An explicit foreign ID is always ignored.
export function rawBtResponse(value: unknown, expectedId: string): "success" | "error" | "progress" | null {
 if (!value || typeof value !== "object" || Array.isArray(value)) return null;
 const r = value as Record<string, unknown>;
 const ids = [r.jobId, r.idJob].filter(x => x !== undefined && x !== null && x !== "");
 if (ids.some(id => id !== expectedId)) return null;
 const status = typeof r.responseType === "string" ? r.responseType : r.status;
 // Anonymous terminal messages are supported only by the documented legacy format.
 if (!ids.length && typeof r.responseType === "string" && status === "success") return null;
 if (status === "success") return "success";
 if (status === "error" || status === "canceled" || status === "cancelled") return "error";
 if (status === "progress" || status === "connected" || status === "info") return "progress";
 return null;
}

export function sendRawBtJob(job: RawBtJob, options: PrintOptions = {}): Promise<RawBtResult> {
 return new Promise((resolve, reject) => {
  let socket: PrintSocket | undefined, timer: ReturnType<typeof setTimeout> | undefined, flushTimer: ReturnType<typeof setTimeout> | undefined;
  let sent = false, settled = false;
  const finish = (error?: RawBtError, completion: RawBtResult["completion"] = "driver") => {
   if (settled) return;
   settled = true; clearTimeout(timer); clearTimeout(flushTimer); options.signal?.removeEventListener("abort", abort);
   if (socket) { socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null; try { socket.close(); } catch {} }
   if (error) reject(error); else resolve({ completion });
  };
  const abort = () => finish(new RawBtError(sent, "cancelled"));
  if (options.signal?.aborted) { abort(); return; }
  options.signal?.addEventListener("abort", abort, { once: true });
  timer = setTimeout(() => finish(new RawBtError(sent, "connection")), options.connectTimeoutMs ?? 15_000);
  try { socket = (options.createSocket ?? (url => new WebSocket(url)))(RAWBT_SOCKET_URL); }
  catch (error) { finish(new RawBtError(false, error instanceof Error && error.name === "SecurityError" ? "permission" : "connection")); return; }
  socket.onopen = () => {
   if (settled || sent) return;
   const send=()=>{
   if(settled||options.signal?.aborted)return;
   clearTimeout(timer);
   timer = setTimeout(() => finish(new RawBtError(sent, "result")), options.resultTimeoutMs ?? 30_000);
   // Persist before calling send; a lost acknowledgement must not create another receipt.
   sent = true;
   try { socket!.send(JSON.stringify(job)); options.onSent?.(); } catch { finish(new RawBtError(true, "result")); return; }
   if (options.completion === "submitted") {
    // Selected only after the person sees the physical test receipt. This records
    // delivery to the socket, never a claim that paper was printed.
    const waitForFlush = () => {
     if (settled) return;
     if (socket?.bufferedAmount === 0) flushTimer = setTimeout(() => finish(undefined, "submitted"), options.submitGraceMs ?? 1_000);
     else flushTimer = setTimeout(waitForFlush, 50);
    };
    waitForFlush();
   }
   };
   try{const pending=options.beforeSend?.();if(pending&&typeof pending.then==="function")pending.then(send,e=>finish(e instanceof RawBtError?e:new RawBtError(false,"stale")));else send();}catch(e){finish(e instanceof RawBtError?e:new RawBtError(false,"storage"));}
  };
  socket.onmessage = event => {
   if (!sent || typeof event.data !== "string") return;
   let response: unknown;
   try { response = JSON.parse(event.data); } catch { return; }
   const status = rawBtResponse(response, job.idJob);
   if (!status) return;
   options.onResponse?.(status);
   if (status === "success") finish();
   else if (status === "error") finish(new RawBtError(true, "result"));
  };
  socket.onerror = socket.onclose = () => finish(new RawBtError(sent, sent ? "result" : "connection"));
 });
}
