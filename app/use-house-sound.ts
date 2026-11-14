"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import type {HouseSnapshot} from '@/lib/house-state';
import type {KitchenOrder} from '@/lib/order-state';
import {collectOrderArrivals,createOrderAlertState} from '@/lib/order-alerts';
import {playOrderChime,playCancellationAlarm} from '@/lib/order-sound';
import {createHouseNotificationState,collectHouseNotifications,hasPendingHouseCancellation} from '@/lib/house-notifications';
export function useHouseSound(s:HouseSnapshot|null,ifood:KitchenOrder[]|null){
 const ctx=useRef<AudioContext|null>(null),[enabled,setEnabled]=useState(false),notices=useRef(createHouseNotificationState()),arrivals=useRef(createOrderAlertState()),initialized=useRef(false),lastUnread=useRef(0),lastAlarm=useRef(0),identity=useRef('');
 const latest=useRef(s);latest.current=s;
 const beep=useCallback((urgent=false)=>{const c=ctx.current;if(!c||c.state!=='running')return;try{if(urgent)playCancellationAlarm(c);else playOrderChime(c);}catch{setEnabled(false);}},[]);
 const toggle=useCallback(async()=>{if(enabled){setEnabled(false);return;}try{const Constructor=window.AudioContext||(window as Window&{webkitAudioContext?:typeof AudioContext}).webkitAudioContext;if(!Constructor)return;ctx.current||=new Constructor();await ctx.current.resume();if(ctx.current.state!=='running')return;setEnabled(true);beep(hasPendingHouseCancellation(latest.current));}catch{setEnabled(false);}},[enabled,beep]);
 useEffect(()=>{if(!s)return;if(identity.current!==s.actor.key){notices.current=createHouseNotificationState();initialized.current=false;arrivals.current=createOrderAlertState();identity.current=s.actor.key;}
  const notice=collectHouseNotifications(notices.current,s),foodArrivals=ifood?collectOrderArrivals(arrivals.current,ifood).kitchen:[];
  if(enabled&&initialized.current&&(notice.urgent||notice.ordinary||foodArrivals.length||s.unread>lastUnread.current)){beep(notice.urgent);lastAlarm.current=Date.now();}lastUnread.current=s.unread;initialized.current=true;
 },[s,ifood,enabled,beep]);
 useEffect(()=>{const t=setInterval(()=>{if(enabled&&s&&['manager','admin'].includes(s.actor.role)&&s.alerts.some(a=>a.kind!=='CANCEL'&&!a.ackAt)&&Date.now()-lastAlarm.current>20000&&!document.hidden){beep(false);lastAlarm.current=Date.now();}},1000);return()=>clearInterval(t);},[s,enabled,beep]);
 useEffect(()=>{if(!enabled)return;const resume=()=>{if(!document.hidden&&ctx.current?.state==='suspended')void ctx.current.resume().catch(()=>setEnabled(false));};window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);return()=>{window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);};},[enabled]);
 useEffect(()=>()=>{void ctx.current?.close();},[]);return{enabled,toggle};
}
