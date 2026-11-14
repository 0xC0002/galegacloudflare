import { emptyPrintQueue, nextPrintOrder, readPrintQueue, recoverInterruptedPrints, resolvePrintJob, scanPrintQueue, setPrintEnabled, type AutoPrintQueue } from "./auto-print.ts";
import { terminal, type KitchenOrder } from "./order-state.ts";
import { requestId } from "./request-id.ts";
import { PrinterLockBusy, type PrinterLock } from "./printer-lock.ts";
import { RawBtError, rawBtJob, rawBtTestJob, sendRawBtJob, type PrintOptions } from "./rawbt.ts";

export type PrinterStatus = "off" | "connecting" | "ready" | "printing" | "disconnected" | "review" | "locked" | "storage";
export type PrinterView = { queue: AutoPrintQueue; status: PrinterStatus; error: string; testing: boolean; testSent: boolean; testAcknowledged: boolean; operationBusy: boolean; diagnostic: string };
export function initialPrinterView(): PrinterView { return { queue: emptyPrintQueue(), status: "off", error: "", testing: false, testSent: false, testAcknowledged: false, operationBusy: false, diagnostic: "" }; }
type Dependencies = { mayPrint?:()=>boolean; key: string; storage: Pick<Storage, "getItem" | "setItem">; lock: PrinterLock; onChange: (view: PrinterView) => void; transport?: Pick<PrintOptions, "createSocket" | "connectTimeoutMs" | "resultTimeoutMs" | "submitGraceMs">; testTimeoutMs?: number; now?: () => number };
type Operation = { abort: AbortController; kind: "tick" | "test" | "setting"; startedAt: number; finished: Promise<void> };
const storageError = "Não foi possível salvar a fila neste aparelho. A impressão foi pausada.";

// Device-local controller, exercised with a simulated driver, storage and lock.
export class KitchenPrinterController {
 private deps: Dependencies;
 private view = initialPrinterView();
 private orders: KitchenOrder[] | null = null;
 private active = false;
 private disposed = false;
 private storageBlocked = false;
 private operation: Operation | null = null;
 private retryAt = 0;
 private proof: { sent: boolean; acknowledged: boolean } | null = null;
 constructor(deps: Dependencies) { this.deps = deps;try{this.view.queue=this.load();}catch{this.storageBlocked=true;this.view.status='storage';this.view.error=storageError;} }
 get state(): PrinterView { return structuredClone(this.view); }
 private now() { return (this.deps.now ?? Date.now)(); }
 private publish(patch: Partial<PrinterView> = {}) { Object.assign(this.view, patch); if (!this.disposed) this.deps.onChange(this.state); }
 private diagnostic(stage: string) { this.publish({ diagnostic: `${stage} · ${new Date(this.now()).toISOString()}` }); }
 private load() { return readPrintQueue(this.deps.storage.getItem(this.deps.key)); }
 private save(q: AutoPrintQueue) {
  try {
   const value = JSON.stringify(q);
   if (this.deps.storage.getItem(this.deps.key) !== value) this.deps.storage.setItem(this.deps.key, value);
   this.publish({ queue: structuredClone(q) });
  } catch { this.storageBlocked = true; this.publish({ status: "storage", error: storageError }); throw new Error("PRINT_STORAGE"); }
 }
 private idleStatus(q: AutoPrintQueue): PrinterStatus { return Object.values(q.jobs).some(j => j.state === "review") ? "review" : q.enabled ? "ready" : "off"; }
 private run(kind: Operation["kind"], wait: boolean, work: (q: AutoPrintQueue, signal: AbortSignal) => Promise<void>): Promise<void> {
  if (this.disposed || this.storageBlocked) return Promise.resolve();
  if (this.operation) return wait ? this.operation.finished.then(() => this.run(kind, wait, work)) : Promise.resolve();
  const op: Operation = { abort: new AbortController(), kind, startedAt: this.now(), finished: Promise.resolve() };
  this.operation = op; this.publish({ operationBusy: true, testing: kind === "test" });
  op.finished = (async () => {
   try {
    const acquired = await this.deps.lock(op.abort.signal, wait, async () => {
     if (op.abort.signal.aborted) return;
     let q: AutoPrintQueue;
     try { q = this.load(); } catch { this.storageBlocked = true; this.publish({ status: "storage", error: storageError }); return; }
     recoverInterruptedPrints(q, this.now());
     await work(q, op.abort.signal);
    });
    if (!acquired && !op.abort.signal.aborted) this.publish({ status: "locked", error: new PrinterLockBusy().message });
   } catch (e) {
    if (!op.abort.signal.aborted && !this.storageBlocked) this.publish({ status: "locked", error: e instanceof PrinterLockBusy ? e.message : "Não foi possível acessar a impressora. Toque em Reconectar." });
   } finally { if (this.operation === op) { this.operation = null; this.publish({ operationBusy: false, testing: false }); } }
  })();
  return op.finished;
 }
 update(orders: KitchenOrder[] | null, active: boolean) { this.orders = orders; if (this.active && !active) void this.cancel(); this.active = active; }
 async cancel() { const op = this.operation; if (!op) return; op.abort.abort(); await op.finished; }
 async resume() {
  // Android may freeze timers; wall time still advances while the page is away.
  if (this.operation && this.now() - this.operation.startedAt > 45_000) await this.cancel();
  await this.tick();
 }
 dispose() { this.disposed = true; this.active = false; void this.cancel(); }
 tick(): Promise<void> {
  if (!this.orders || !this.active) return Promise.resolve();
  return this.run("tick", false, async (q, signal) => {
   scanPrintQueue(q, this.orders!, this.now()); this.save(q);
   if (!q.enabled || !this.active || this.deps.mayPrint?.()===false) { this.publish({ status: this.idleStatus(q) }); return; }
   if (this.now() < this.retryAt) return;
   const order = nextPrintOrder(q, this.orders!);
   // Uncertain receipts stay visible without blocking unrelated new orders.
   if (!order) { if (this.view.status !== "disconnected") this.publish({ status: this.idleStatus(q) }); return; }
   this.publish({ status: "connecting" }); this.diagnostic("conectando");
   const job = rawBtJob(order, `galega-${requestId()}`);
   try {
    const result = await sendRawBtJob(job, { ...this.deps.transport, signal, completion: q.completion ?? "driver", beforeSend: () => {
     const latest = this.orders?.find(o => o.id === order.id);
     if (!latest || !q.jobs[order.id].manual && (terminal(latest) || latest.status === "DISPATCHED")) throw new RawBtError(false, "stale");
     if (!this.active || signal.aborted) throw new RawBtError(false, "cancelled");
     Object.assign(job, rawBtJob(latest, job.idJob));
     q.jobs[order.id] = { ...q.jobs[order.id], state: "sending", updatedAt: this.now() }; this.save(q);
    }, onSent: () => { this.publish({ status: "printing" }); this.diagnostic("enviado"); }, onResponse: status => this.diagnostic(`retorno-${status}`) });
    delete q.jobs[order.id]; this.save(q); this.retryAt = 0;
    this.publish({ error: "", status: this.idleStatus(q) }); this.diagnostic(result.completion === "driver" ? "confirmado-pelo-driver" : "enviado-sem-retorno-do-driver");
   } catch (e) {
    if (this.storageBlocked) return;
    const failure = e instanceof RawBtError ? e : new RawBtError(true, "storage");
    if (!failure.sent && failure.kind === "stale") delete q.jobs[order.id];
    else q.jobs[order.id] = { ...q.jobs[order.id], state: failure.sent ? "review" : "queued", updatedAt: this.now() };
    this.save(q); this.retryAt = failure.sent || failure.kind === "cancelled" ? 0 : this.now() + 15_000;
    this.publish({ error: failure.kind === "stale" || failure.kind === "cancelled" && !failure.sent ? "" : failure.message, status: failure.sent ? "review" : failure.kind === "stale" || failure.kind === "cancelled" ? this.idleStatus(q) : "disconnected" });
    this.diagnostic(failure.sent ? "envio-a-conferir" : "envio-interrompido");
   }
  });
 }
 async testPrint() {
  if (!this.orders || !this.active || this.operation || this.storageBlocked) return;
  this.proof = null; this.publish({ testSent: false, testAcknowledged: false, error: "" });
  await this.run("test", true, async (q, signal) => {
   if (q.enabled) scanPrintQueue(q, this.orders!, this.now());
   this.save(q); this.diagnostic("teste-conectando");
   try {
    const result=await sendRawBtJob(rawBtTestJob(`galega-teste-${requestId()}`), { ...this.deps.transport, resultTimeoutMs: this.deps.testTimeoutMs ?? 8_000, signal, onSent: () => {
     this.proof = { sent: true, acknowledged: false }; this.publish({ testSent: true }); this.diagnostic("teste-enviado");
    }, onResponse: status => this.diagnostic(`teste-retorno-${status}`) });
    if (this.proof) this.proof.acknowledged = result.completion==='driver';
    this.publish({ testAcknowledged: result.completion==='driver' });
   } catch (e) {
    if (!this.storageBlocked) {
     const sent = e instanceof RawBtError && e.sent;
     this.publish({ error: sent ? 'O RawBT não confirmou o teste. Se o papel saiu completo, confirme abaixo.' : e instanceof RawBtError ? e.message : storageError });
     this.diagnostic(sent ? "teste-sem-confirmacao" : "teste-nao-enviado");
    }
   }
  });
 }
 async confirmTest() {
  if (!this.proof?.sent || !this.orders) return;
  await this.cancel(); const proof = this.proof;
  if (!proof?.sent) return;
  await this.run("setting", true, async q => {
   if (q.enabled) scanPrintQueue(q, this.orders!, this.now());
   setPrintEnabled(q, true, this.orders!, this.now());delete q.pausedForSetup; q.completion = proof.acknowledged ? "driver" : "submitted";
   this.save(q); this.retryAt = 0; this.proof = null;
   this.publish({ status: this.idleStatus(q), error: "", testSent: false, testAcknowledged: false });
  });
 }
 async setEnabled(enabled: boolean) {
  if (enabled) { await this.confirmTest(); return; }
  await this.cancel();
  await this.run("setting", true, async q => {
   setPrintEnabled(q, false, this.orders ?? [], this.now());delete q.pausedForSetup;
   // Explicit handoff to the manual RawBT path reserves pending receipts so a
   // later reconnection cannot duplicate something the person printed manually.
   for (const job of Object.values(q.jobs)) if (job.state === "queued") { job.state = "review"; job.updatedAt = this.now(); }
   this.save(q); this.publish({ status: this.idleStatus(q), error: "" });
  });
 }
 async reconnect() { await this.cancel(); this.retryAt = 0; await this.testPrint(); }
 async resolve(id: string, repeat: boolean) {
  await this.run("setting", true, async q => { resolvePrintJob(q, id, repeat, this.now()); this.save(q); this.retryAt = 0; this.publish({ error: "", status: this.idleStatus(q) }); });
 }
 async manualPrint(order: KitchenOrder) {
  if (this.view.queue.jobs[order.id]) return;
  await this.run("setting", true, async q => { if (q.jobs[order.id]) return; if (!q.seen.includes(order.id)) q.seen.push(order.id); q.jobs[order.id] = { state: "queued", updatedAt: this.now(), manual: true }; this.save(q); this.retryAt = 0; });
 }
}
