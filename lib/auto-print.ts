import { terminal, type KitchenOrder } from "./order-state.ts";

export type PrintJobState = "queued" | "sending" | "review";
export type AutoPrintJob = { state: PrintJobState; updatedAt: number; manual?: boolean };
export type AutoPrintQueue = { version: 1; enabled: boolean; initialized: boolean; seen: string[]; jobs: Record<string, AutoPrintJob>; completion?: "driver" | "submitted";pausedForSetup?:boolean };

export function emptyPrintQueue(): AutoPrintQueue {
 return { version: 1, enabled: false, initialized: false, seen: [], jobs: {} };
}

// Store identifiers only. Receipt/customer data stays in the current authenticated snapshot.
export function readPrintQueue(value: string | null): AutoPrintQueue {
 if (!value) return emptyPrintQueue();
 const q = JSON.parse(value) as AutoPrintQueue & {driver?:unknown;pausedForDriver?:unknown};
 if (q.version !== 1 || typeof q.enabled !== "boolean" || typeof q.initialized !== "boolean" || !Array.isArray(q.seen) || !q.seen.every(x => typeof x === "string") || !q.jobs || typeof q.jobs !== "object" || Array.isArray(q.jobs)) throw new Error("PRINT_STORAGE_INVALID");
 if (q.completion !== undefined && !["driver", "submitted"].includes(q.completion)) throw new Error("PRINT_STORAGE_INVALID");
 if (q.driver!==undefined&&typeof q.driver!=='string')throw new Error('PRINT_STORAGE_INVALID');
 if(q.pausedForDriver!==undefined&&typeof q.pausedForDriver!=='boolean')throw new Error('PRINT_STORAGE_INVALID');
 if(q.pausedForSetup!==undefined&&typeof q.pausedForSetup!=='boolean')throw new Error('PRINT_STORAGE_INVALID');
 for (const job of Object.values(q.jobs)) if (!job || !["queued", "sending", "review"].includes(job.state) || !Number.isFinite(job.updatedAt) || job.manual !== undefined && typeof job.manual !== "boolean") throw new Error("PRINT_STORAGE_INVALID");
 // Preserve pending identifiers when upgrading an older printer preference.
 // A different transport's physical test cannot authorize RawBT printing.
 if(q.driver!==undefined&&q.driver!=='rawbt'){q.pausedForSetup=q.enabled||!!q.pausedForDriver||!!q.pausedForSetup;q.enabled=false;delete q.completion;}
 else if(q.pausedForDriver)q.pausedForSetup=true;
 delete q.driver;delete q.pausedForDriver;
 return q;
}

export function canAutoPrint(order: KitchenOrder): boolean {
 return !terminal(order) && order.status !== "DISPATCHED" && order.kitchenStage !== "SEPARATED";
}

export function scanPrintQueue(queue: AutoPrintQueue, orders: KitchenOrder[], now: number): void {
 const seen = new Set(queue.seen);
 for (const order of orders) {
  if (queue.initialized && (queue.enabled||queue.pausedForSetup) && !seen.has(order.id) && canAutoPrint(order)) queue.jobs[order.id] = { state: "queued", updatedAt: now };
  seen.add(order.id);
  // Never automatically print a queued order after it has been cancelled or closed.
  if ((terminal(order) || order.status === "DISPATCHED") && queue.jobs[order.id]?.state === "queued" && !queue.jobs[order.id].manual) delete queue.jobs[order.id];
 }
 queue.initialized = true;
 // Keep pending identifiers even when older receipts have left the snapshot.
 queue.seen = [...new Set([...seen].slice(-10_000).concat(Object.keys(queue.jobs)))];
}

export function setPrintEnabled(queue: AutoPrintQueue, enabled: boolean, orders: KitchenOrder[], now: number): void {
 // Activation establishes a baseline, so opening/configuring the tablet never prints history.
 queue.enabled = false;
 scanPrintQueue(queue, orders, now);
 queue.enabled = enabled;
}

export function recoverInterruptedPrints(queue: AutoPrintQueue, now: number): void {
 // A crash/reload after send may have printed. Never silently resend it.
 for (const job of Object.values(queue.jobs)) if (job.state === "sending") { job.state = "review"; job.updatedAt = now; }
}

export function nextPrintOrder(queue: AutoPrintQueue, orders: KitchenOrder[]): KitchenOrder | undefined {
 return orders.filter(order => queue.jobs[order.id]?.state === "queued" && (queue.jobs[order.id].manual || !terminal(order) && order.status !== "DISPATCHED"))
  .sort((a, b) => queue.jobs[a.id].updatedAt - queue.jobs[b.id].updatedAt || (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0) || a.id.localeCompare(b.id))[0];
}

export function resolvePrintJob(queue: AutoPrintQueue, id: string, repeat: boolean, now: number): void {
 if (!queue.jobs[id] || queue.jobs[id].state === "sending") return;
 if (repeat) queue.jobs[id] = { state: "queued", updatedAt: now, manual: true };
 else delete queue.jobs[id];
}
