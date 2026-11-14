export class PrinterLockBusy extends Error {
 constructor() { super("A impressora está em uso em outra janela. Feche as outras abas da Galega e tente novamente."); }
}
export type PrinterLock = (signal: AbortSignal, wait: boolean, work: () => Promise<void>) => Promise<boolean>;
export function browserPrinterLock(name: string): PrinterLock {
 return async (signal, wait, work) => {
  let acquired = false;
  if (!wait) {
   await navigator.locks.request(name, { ifAvailable: true }, async lock => { if (!lock || signal.aborted) return; acquired = true; await work(); });
   return acquired;
  }
  const request = new AbortController();
  const stop = () => request.abort();
  signal.addEventListener("abort", stop, { once: true });
  if (signal.aborted) request.abort();
  // Bound only the wait for another tab, not the work after acquisition.
  const timer = setTimeout(() => request.abort(), 3_000);
  try {
   await navigator.locks.request(name, { signal: request.signal }, async () => { clearTimeout(timer); if (signal.aborted) return; acquired = true; await work(); });
  } catch (e) { if (request.signal.aborted && !signal.aborted) throw new PrinterLockBusy(); if (!signal.aborted) throw e; }
  finally { clearTimeout(timer); signal.removeEventListener("abort", stop); }
  return acquired;
 };
}
