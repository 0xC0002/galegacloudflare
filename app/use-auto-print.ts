"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { KitchenPrinterController, initialPrinterView } from "@/lib/kitchen-printer-controller";
import { browserPrinterLock } from "@/lib/printer-lock";
import type { KitchenOrder } from "@/lib/order-state";

export function useAutoPrint(orders: KitchenOrder[] | null, mode: "counter" | "kitchen", scope: string | null, options:{allowAutoSend?:boolean;lockName?:string}={}) {
 const current = useRef({ orders, mode, options }); current.current = { orders, mode, options };
 const controller = useRef<KitchenPrinterController | null>(null);
 const [view, setView] = useState(initialPrinterView), [supported, setSupported] = useState(false);
 useEffect(() => {
  const compatible = /Android/i.test(navigator.userAgent) && !!navigator.locks && !!window.WebSocket;
  setSupported(compatible); setView(initialPrinterView());
  if (!scope) return;
  const key = `galega-auto-print-v1:${scope}`;
  if(!compatible)return;
  const printer = new KitchenPrinterController({ key, storage: localStorage, lock: browserPrinterLock(options.lockName||key), mayPrint:()=>current.current.options.allowAutoSend!==false, onChange: next => setView(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next) });
  setView(printer.state);
  controller.current = printer;
  const update = () => { printer.update(current.current.orders, current.current.mode === "kitchen" && !document.hidden); };
  const resume = () => { update(); void printer.resume(); };
  const suspend = () => { printer.update(current.current.orders, false); void printer.cancel(); };
  const visibility = () => { if (document.hidden) suspend(); else resume(); };
  const changed = (e: StorageEvent) => { if (e.key === key) resume(); };
  update(); void printer.tick();
  const timer = setInterval(() => { update(); void printer.tick(); }, 1_000);
  document.addEventListener("visibilitychange", visibility); document.addEventListener("freeze", suspend); document.addEventListener("resume", resume);
  window.addEventListener("pagehide", suspend); window.addEventListener("pageshow", resume); window.addEventListener("focus", resume); window.addEventListener("storage", changed);
  return () => { clearInterval(timer); document.removeEventListener("visibilitychange", visibility); document.removeEventListener("freeze", suspend); document.removeEventListener("resume", resume); window.removeEventListener("pagehide", suspend); window.removeEventListener("pageshow", resume); window.removeEventListener("focus", resume); window.removeEventListener("storage", changed); printer.dispose(); if (controller.current === printer) controller.current = null; };
 }, [scope]);
 useEffect(() => { controller.current?.update(orders, mode === "kitchen" && !document.hidden); void controller.current?.tick(); }, [orders, mode]);
 const testPrint = useCallback(async () => { await controller.current?.testPrint(); }, []);
 const setEnabled = useCallback(async (enabled: boolean) => { await controller.current?.setEnabled(enabled); }, []);
 const resolve = useCallback(async (id: string, repeat: boolean) => { await controller.current?.resolve(id, repeat); }, []);
 const manualPrint = useCallback(async (order: KitchenOrder) => { await controller.current?.manualPrint(order); }, []);
 const cancel = useCallback(async () => { await controller.current?.cancel(); }, []);
 const reconnect = useCallback(async () => { await controller.current?.reconnect(); }, []);
 return { ...view, supported, testPrint, setEnabled, resolve, manualPrint, cancel, reconnect };
}
