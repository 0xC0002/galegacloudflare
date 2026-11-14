"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { collectOrderArrivals, createOrderAlertState, type AlertMode } from "@/lib/order-alerts";
import type { KitchenOrder } from "@/lib/order-state";

import {playOrderChime} from "@/lib/order-sound";

type SoundStatus = "off" | "starting" | "ready" | "blocked" | "unsupported";
type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

export function useOrderAlerts(orders: KitchenOrder[] | null, mode: AlertMode) {
 const latest = useRef({ orders, mode });
 latest.current = { orders, mode };
 const arrivals = useRef(createOrderAlertState());
 const context = useRef<AudioContext | null>(null), enabled = useRef(false);
 const [soundStatus, setSoundStatus] = useState<SoundStatus>("off");
 const [announcement, setAnnouncement] = useState("");

 const play = useCallback(() => {
  if (!enabled.current) return;
  const audio = context.current;
  if (!audio || audio.state !== "running") { setSoundStatus("blocked"); return; }
  try {
   playOrderChime(audio);
  } catch { setSoundStatus("blocked"); }
 }, []);

 const check = useCallback(() => {
  const current = latest.current;
  if (!current.orders) return;
  const added = collectOrderArrivals(arrivals.current, current.orders)[current.mode];
  if (!added.length) return;
  setAnnouncement(added.length === 1 ? `Novo pedido #${added[0].displayId}.` : `${added.length} novos pedidos.`);
  play();
 }, [play]);

 useEffect(() => { check(); }, [orders, check]);
 useEffect(() => {
  if (!(window.AudioContext || (window as AudioWindow).webkitAudioContext)) setSoundStatus("unsupported");
  const resume = () => {
   if (document.hidden || !enabled.current || !context.current) return;
   const audio = context.current;
   void audio.resume().then(() => {
    if (enabled.current && context.current === audio) setSoundStatus(audio.state === "running" ? "ready" : "blocked");
   }).catch(() => { if (enabled.current) setSoundStatus("blocked"); });
  };
  document.addEventListener("visibilitychange", resume);
  return () => {
   document.removeEventListener("visibilitychange", resume);
   enabled.current = false;
   const audio = context.current; context.current = null;
   if (audio) { audio.onstatechange = null; void audio.close().catch(() => {}); }
  };
 }, []);

 const toggleSound = useCallback(async () => {
  if (enabled.current && context.current?.state === "running") {
   enabled.current = false; setSoundStatus("off");
   void context.current.suspend().catch(() => {});
   return;
  }
  const AudioConstructor = window.AudioContext || (window as AudioWindow).webkitAudioContext;
  if (!AudioConstructor) { setSoundStatus("unsupported"); return; }
  enabled.current = true; setSoundStatus("starting");
  try {
   const audio = context.current?.state !== "closed" && context.current || new AudioConstructor();
   context.current = audio;
   audio.onstatechange = () => {
    if (enabled.current && context.current === audio) setSoundStatus(audio.state === "running" ? "ready" : "blocked");
   };
   await audio.resume();
   if (!enabled.current || context.current !== audio) return;
   if (audio.state !== "running") { setSoundStatus("blocked"); return; }
   setSoundStatus("ready"); play();
  } catch { setSoundStatus("blocked"); }
 }, [play]);

 return { soundStatus, toggleSound, announcement };
}
